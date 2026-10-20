terraform {
  backend "s3" {
    region = "eu-west-1"
    # A lock object <key>.tflock beside the state while Terraform runs: an apply of the CI and one of a workstation never
    # write the state at once
    use_lockfile = true
  }
}

locals {
  region               = "eu-west-1"
  front_domain_name    = "sc-${var.stage}.${var.main_domain_name}"
  api_ws_domain_name   = "sc-ws-${var.stage}.${var.main_domain_name}"
  api_http_domain_name = "sc-api-${var.stage}.${var.main_domain_name}"
  zone_name            = "${var.main_domain_name}."
}

data "aws_route53_zone" "site" {
  name = local.zone_name
}

# region CERTIFICATE
module "sc_certificate_cloudfront" {
  source = "./modules/aws-certificate"

  domain_name      = local.front_domain_name
  route_53_zone_id = data.aws_route53_zone.site.zone_id
  stage            = var.stage

  providers = {
    aws.acm     = aws.us
    aws.route53 = aws
  }
}

module "sc_certificate_api_ws" {
  source = "./modules/aws-certificate"

  domain_name      = local.api_ws_domain_name
  route_53_zone_id = data.aws_route53_zone.site.zone_id
  stage            = var.stage

  providers = {
    aws.acm     = aws
    aws.route53 = aws
  }
}

# The HTTP API has a domain of its own: API Gateway maps a custom domain to WebSocket APIs, or to HTTP and REST APIs,
# never to both
module "sc_certificate_api_http" {
  source = "./modules/aws-certificate"

  domain_name      = local.api_http_domain_name
  route_53_zone_id = data.aws_route53_zone.site.zone_id
  stage            = var.stage

  providers = {
    aws.acm     = aws
    aws.route53 = aws
  }
}
# endregion


/**
 * Database: Aurora PostgreSQL Serverless v2, reached by the lambdas through its Data API
 */
module "sc_database" {
  source = "./modules/aws-aurora-serverless"

  name = "database"
  # Its major version is the one of PGlite, the database of the local API and the specs (package.json of the API)
  engine_version = "17.10"
  database_name  = "synchronous_chess"
  stage          = var.stage
}

module "sc_database_data_api_policy" {
  source = "./modules/aws-rds-data-iam-policy"

  cluster_arn = module.sc_database.arn
  secret_arn  = module.sc_database.secret_arn
  stage       = var.stage
}

/**
 * API Gateway
 */

# Its stage writes its execution logs with the role of the account of API Gateway, one per account and region, which
# infrastructure/bootstrap sets
module "sc_api_gateway" {
  source = "./modules/aws-api-gateway"

  api_ws_name = "sc-websocket"
  stage       = var.stage
}

module "sc_api_gateway_domain" {
  source = "./modules/aws-api-gateway-domain"

  domain_name      = local.api_ws_domain_name
  certificate_arn  = module.sc_certificate_api_ws.certificate_arn
  route_53_zone_id = data.aws_route53_zone.site.zone_id
  stage            = var.stage
}

/**
 * Lambdas
 */
data "aws_caller_identity" "current" {}

locals {
  # The most the roles of the lambdas can do, whatever policy is attached to them: created for each stage by
  # infrastructure/bootstrap, applied before any stage. Built rather than read, which would take iam:GetPolicy from the
  # deploy role of the stage
  lambda_permissions_boundary = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/sc-lambda-boundary-${var.stage}"
}

module "sc_role_lambda_basic" {
  source               = "./modules/aws-iam-lambda-role"
  name                 = "sc_lambda_basic_${var.stage}"
  policies             = ["arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"]
  stage                = var.stage
  permissions_boundary = local.lambda_permissions_boundary
}

module "sc_api_gateway_iam_policy" {
  source = "./modules/aws-api-gateway-iam-policy"

  api_gateway_arn = "${module.sc_api_gateway.execution_arn}/*/*/*"
  stage           = var.stage
}

module "sc_role_lambda_database" {
  source = "./modules/aws-iam-lambda-role"
  name   = "sc_lambda_database_${var.stage}"
  policies = [
    "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    module.sc_database_data_api_policy.arn,
    module.sc_api_gateway_iam_policy.arn
  ]
  stage                = var.stage
  permissions_boundary = local.lambda_permissions_boundary
}

# sendmessage alone reads the key of the hashes of the IPs: the policies of sc_role_lambda_database, and its parameter
module "sc_role_lambda_sendmessage" {
  source = "./modules/aws-iam-lambda-role"
  name   = "sc_lambda_sendmessage_${var.stage}"
  policies = [
    "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    module.sc_database_data_api_policy.arn,
    module.sc_api_gateway_iam_policy.arn,
    module.sc_source_hash_secret_policy.arn
  ]
  stage                = var.stage
  permissions_boundary = local.lambda_permissions_boundary
}

module "sc_role_lambda_migrate" {
  source = "./modules/aws-iam-lambda-role"
  name   = "sc_lambda_migrate_${var.stage}"
  policies = [
    "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    module.sc_database_data_api_policy.arn
  ]
  stage                = var.stage
  permissions_boundary = local.lambda_permissions_boundary
}

# The lambda of the HTTP API reaches the database only, no connection of the WebSocket API to push to: the policies of
# migrate, in a role of its own
module "sc_role_lambda_httpapi" {
  source = "./modules/aws-iam-lambda-role"
  name   = "sc_lambda_httpapi_${var.stage}"
  policies = [
    "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    module.sc_database_data_api_policy.arn
  ]
  stage                = var.stage
  permissions_boundary = local.lambda_permissions_boundary
}

locals {
  # The cluster the lambdas reach through its Data API
  database_environment = {
    DATABASE_RESOURCE_ARN = module.sc_database.arn
    DATABASE_SECRET_ARN   = module.sc_database.secret_arn
    DATABASE_NAME         = module.sc_database.database_name
  }
  # A paused cluster takes 15 seconds to resume, which the lambdas wait for (resume-retry.ts of the API): API Gateway
  # waits 29 seconds for them at most
  database_lambda_timeout = 28
  migrations_path         = "${path.module}/../application/backend/websocket-api/drizzle"
}

# Applies the migrations the database misses (drizzle folder of the API), before the lambdas reading the database
# deploy: each time the migrations change, and once the cluster is created
module "sc_lambda_migrate" {
  source = "./modules/aws-lambda-api"

  directory        = "websocket-api"
  name             = "migrate"
  bundle_directory = true
  role             = module.sc_role_lambda_migrate.arn
  stage            = var.stage
  # The cluster resuming, then all the migrations in a transaction
  timeout     = 300
  environment = local.database_environment
}

resource "aws_lambda_invocation" "migrate" {
  function_name = module.sc_lambda_migrate.name
  input         = jsonencode({})

  triggers = {
    cluster    = module.sc_database.arn
    migrations = sha1(join("", [for file in sort(fileset(local.migrations_path, "**/migration.sql")) : filesha1("${local.migrations_path}/${file}")]))
  }

  # The writer instance of the cluster answers the Data API, and the role of the lambda its policies: the ARN of the
  # cluster and the role exist before them
  depends_on = [module.sc_database, module.sc_role_lambda_migrate]
}

module "sc_lambda_onconnect" {
  source = "./modules/aws-lambda-api"

  directory = "websocket-api"
  name      = "onconnect"
  role      = module.sc_role_lambda_basic.arn
  stage     = var.stage
}

module "sc_lambda_ondisconnect" {
  source = "./modules/aws-lambda-api"

  directory   = "websocket-api"
  name        = "ondisconnect"
  role        = module.sc_role_lambda_database.arn
  stage       = var.stage
  timeout     = local.database_lambda_timeout
  environment = local.database_environment
  depends_on  = [aws_lambda_invocation.migrate]
}

# The key of the hashes of the IPs of the clients (source.helper of the websocket API): without it, the IP of a hash is
# found by hashing the 2^32 IPv4 addresses in turn. An ephemeral value, written to its parameter through a write-only
# argument: neither the plan, the state nor the configuration of the lambda hold it, sendmessage reads it when it loads
ephemeral "random_password" "source_hash_secret" {
  length  = 64
  special = false
}

locals {
  # Raise it to rotate the key: the hashes only key the password attempts of a minute (ROOM_PASSWORD_LOCK_DELAY), which
  # start again. Given to sendmessage too: its configuration changed, the warm lambdas holding the former key are
  # replaced, rather than counting a client apart from the new ones
  source_hash_secret_version = 1
}

resource "aws_ssm_parameter" "source_hash_secret" {
  name = "/sc/${var.stage}/source-hash-secret"
  # Encrypted by the AWS managed key aws/ssm
  type             = "SecureString"
  value_wo         = ephemeral.random_password.source_hash_secret.result
  value_wo_version = local.source_hash_secret_version

  tags = {
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}

# DescribeKey creates the AWS managed key when no SecureString of the account and region used it yet
data "aws_kms_key" "ssm" {
  key_id = "alias/aws/ssm"
}

module "sc_source_hash_secret_policy" {
  source = "./modules/aws-ssm-parameter-iam-policy"

  name          = "sc-source-hash-secret-${var.stage}"
  parameter_arn = aws_ssm_parameter.source_hash_secret.arn
  kms_key_arn   = data.aws_kms_key.ssm.arn
  stage         = var.stage
}

module "sc_lambda_sendmessage" {
  source = "./modules/aws-lambda-api"

  directory = "websocket-api"
  name      = "sendmessage"
  role      = module.sc_role_lambda_sendmessage.arn
  stage     = var.stage
  timeout   = local.database_lambda_timeout
  # The passwords of the private rooms are hashed and checked by scrypt (16 MB, CPU bound): 128 MB give it a fraction of a
  # vCPU, a cold start then takes seconds, the attempt counted but never uncounted
  memory_size = 512
  environment = merge(local.database_environment, {
    SOURCE_HASH_SECRET_PARAMETER = aws_ssm_parameter.source_hash_secret.name
    SOURCE_HASH_SECRET_VERSION   = tostring(local.source_hash_secret_version)
  })
  depends_on = [aws_lambda_invocation.migrate]
}

# Serves every route of the HTTP API (sc_api_gateway_http_routes), today the list of the open rooms. Its memory is the
# 128 MB by default: a route hashing passwords (scrypt) would raise it to 512 MB, like sendmessage
module "sc_lambda_httpapi" {
  source = "./modules/aws-lambda-api"

  directory   = "websocket-api"
  name        = "httpapi"
  role        = module.sc_role_lambda_httpapi.arn
  stage       = var.stage
  timeout     = local.database_lambda_timeout
  environment = local.database_environment
  depends_on  = [aws_lambda_invocation.migrate]
}

/**
 * Wake of the database: production only. After 24 hours paused, Aurora puts the cluster into a deeper sleep, whose
 * resume outlasts the retries of the lambdas: the first request fails, the $disconnect of a host included, which no
 * client retries. A rule checks it every 6 hours, and wakes it unless it ran within the 8 last hours (wakedatabase of
 * the API): it never pauses for more than 14 hours, 20 when a check fails. Idle, it is woken every 12 hours only, the
 * check after a wake seeing it: 5 minutes at 0.5 ACU each, 0.35 dollar a month at most. Staging, restricted to its owner,
 * and development leave theirs asleep. wake_stages of infrastructure/bootstrap names the same stages: its boundary lets
 * the function read the capacity of the cluster, its deploy role creates the rule
 */
locals {
  wakes_database = var.stage == "production"
}

module "sc_database_capacity_policy" {
  source = "./modules/aws-cloudwatch-metrics-iam-policy"
  count  = local.wakes_database ? 1 : 0

  name  = "sc-database-capacity-${var.stage}"
  stage = var.stage
}

module "sc_role_lambda_wakedatabase" {
  source = "./modules/aws-iam-lambda-role"
  count  = local.wakes_database ? 1 : 0

  name = "sc_lambda_wakedatabase_${var.stage}"
  policies = [
    "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    module.sc_database_data_api_policy.arn,
    module.sc_database_capacity_policy[0].arn
  ]
  stage                = var.stage
  permissions_boundary = local.lambda_permissions_boundary
}

module "sc_lambda_wakedatabase" {
  source = "./modules/aws-lambda-api"
  count  = local.wakes_database ? 1 : 0

  directory = "websocket-api"
  name      = "wakedatabase"
  role      = module.sc_role_lambda_wakedatabase[0].arn
  stage     = var.stage
  timeout   = local.database_lambda_timeout
  # The writer instance, whose capacity CloudWatch publishes
  environment = merge(local.database_environment, {
    DATABASE_INSTANCE_IDENTIFIER = module.sc_database.writer_identifier
  })
  depends_on = [aws_lambda_invocation.migrate]
}

module "sc_wake_database_schedule" {
  source = "./modules/aws-lambda-schedule"
  count  = local.wakes_database ? 1 : 0

  name                = "wake-database"
  schedule_expression = "rate(6 hours)"
  function_name       = module.sc_lambda_wakedatabase[0].name
  function_arn        = module.sc_lambda_wakedatabase[0].arn
  stage               = var.stage
}

/**
 * Access: staging, restricted to its owner. The owner signs in on the managed login of Cognito through the access lambda
 * (/auth/* of the HTTP API), which sets the signed cookies of CloudFront on the domain: the distribution serves the front
 * with them only, and the authorizers of the two APIs check the same ones. The other stages stay public. The user pool
 * of the login belongs to infrastructure/bootstrap: the owner outlives the destruction of the stage. Its app client
 * registers the callback below, access_callback_url
 */
locals {
  access_restricted            = var.stage == "staging"
  access_front_url             = "https://${local.front_domain_name}/"
  access_callback_url          = "https://${local.api_http_domain_name}/auth/callback"
  access_signing_key_parameter = "/sc/${var.stage}/access-signing-key"
  # What the authorizers check the cookies with: the public key in SPKI DER, its PEM without its armor nor its line
  # breaks, on one line in the environment of a lambda
  access_environment = {
    ACCESS_PUBLIC_KEY  = replace(var.access_public_key, "/-----(BEGIN|END) PUBLIC KEY-----|\\s/", "")
    ACCESS_KEY_PAIR_ID = one(module.sc_access_key_group[*].public_key_id)
    ACCESS_FRONT_URL   = local.access_front_url
  }
}

# The user pool of the stage, its managed login and its app client (module access_login of infrastructure/bootstrap),
# found by its name: a stage without it fails its plan, and one() fails on two pools or two clients
data "aws_cognito_user_pools" "access" {
  count = local.access_restricted ? 1 : 0

  name = "sc-access-${var.stage}"
}

data "aws_cognito_user_pool" "access" {
  count = local.access_restricted ? 1 : 0

  user_pool_id = one(data.aws_cognito_user_pools.access[0].ids)
}

data "aws_cognito_user_pool_clients" "access" {
  count = local.access_restricted ? 1 : 0

  user_pool_id = one(data.aws_cognito_user_pools.access[0].ids)
}

module "sc_access_key_group" {
  source = "./modules/aws-cloudfront-key-group"
  count  = local.access_restricted ? 1 : 0

  name       = "sc-access-${var.stage}"
  public_key = var.access_public_key
}

# The private key signing the cookies: a SecureString the owner writes with the AWS CLI (README), out of Terraform, which
# never reads it, so out of the state. Its ARN is built: a data source would put its value in the state
module "sc_access_signing_key_policy" {
  source = "./modules/aws-ssm-parameter-iam-policy"
  count  = local.access_restricted ? 1 : 0

  name          = "sc-access-signing-key-${var.stage}"
  parameter_arn = "arn:aws:ssm:${local.region}:${data.aws_caller_identity.current.account_id}:parameter${local.access_signing_key_parameter}"
  kms_key_arn   = data.aws_kms_key.ssm.arn
  stage         = var.stage
}

# The access lambda alone reads the signing key
module "sc_role_lambda_access" {
  source = "./modules/aws-iam-lambda-role"
  count  = local.access_restricted ? 1 : 0

  name = "sc_lambda_access_${var.stage}"
  policies = [
    "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    module.sc_access_signing_key_policy[0].arn
  ]
  stage                = var.stage
  permissions_boundary = local.lambda_permissions_boundary
}

# The ID of the public key changes with the key: its configuration changed, the warm lambdas holding the former key are
# replaced
module "sc_lambda_access" {
  source = "./modules/aws-lambda-api"
  count  = local.access_restricted ? 1 : 0

  directory = "websocket-api"
  name      = "access"
  role      = module.sc_role_lambda_access[0].arn
  stage     = var.stage
  # The token endpoint of Cognito, after the signing key read by a cold start
  timeout = 10
  environment = merge(local.access_environment, {
    ACCESS_SIGNING_KEY_PARAMETER = local.access_signing_key_parameter
    ACCESS_COOKIE_DOMAIN         = var.main_domain_name
    ACCESS_LOGIN_URL             = "https://${data.aws_cognito_user_pool.access[0].domain}.auth.${local.region}.amazoncognito.com"
    ACCESS_CLIENT_ID             = one(data.aws_cognito_user_pool_clients.access[0].client_ids)
    ACCESS_CALLBACK_URL          = local.access_callback_url
  })
}

module "sc_lambda_wsauthorizer" {
  source = "./modules/aws-lambda-api"
  count  = local.access_restricted ? 1 : 0

  directory   = "websocket-api"
  name        = "wsauthorizer"
  role        = module.sc_role_lambda_basic.arn
  stage       = var.stage
  environment = local.access_environment
}

module "sc_lambda_httpauthorizer" {
  source = "./modules/aws-lambda-api"
  count  = local.access_restricted ? 1 : 0

  directory   = "websocket-api"
  name        = "httpauthorizer"
  role        = module.sc_role_lambda_basic.arn
  stage       = var.stage
  environment = local.access_environment
}

/**
 * API Gateway routes / deployments
 */

module "sc_api_gateway_routes" {
  source = "./modules/aws-api-gateway-routes"

  api_gateway_id            = module.sc_api_gateway.api_gateway_id
  api_gateway_execution_arn = module.sc_api_gateway.execution_arn
  lambda_connect_arn        = module.sc_lambda_onconnect.invoke_arn
  lambda_connect_name       = module.sc_lambda_onconnect.name
  lambda_disconnect_arn     = module.sc_lambda_ondisconnect.invoke_arn
  lambda_disconnect_name    = module.sc_lambda_ondisconnect.name
  lambda_sendmessage_arn    = module.sc_lambda_sendmessage.invoke_arn
  lambda_sendmessage_name   = module.sc_lambda_sendmessage.name
  # Built from the condition, known at plan, never from an output of the lambda: the count of the authorizer depends on it
  connect_authorizer = local.access_restricted ? { invoke_arn = module.sc_lambda_wsauthorizer[0].invoke_arn, function_name = module.sc_lambda_wsauthorizer[0].name } : null
  stage              = var.stage
}

resource "aws_apigatewayv2_deployment" "deployment" {
  api_id      = module.sc_api_gateway.api_gateway_id
  description = "Deployment with routes (${module.sc_api_gateway_routes.connect_route_id},${module.sc_api_gateway_routes.disconnect_route_id}, ${module.sc_api_gateway_routes.sendmessage_route_id}, ${module.sc_api_gateway_routes.ping_route_id})"

  triggers = {
    redeployment = sha1(module.sc_api_gateway_routes.route_integration_jsonencode)
  }

  lifecycle {
    create_before_destroy = true
  }
}

module "sc_api_gateway_stage" {
  source = "./modules/aws-api-gateway-stage"

  api_gateway_id = module.sc_api_gateway.api_gateway_id
  deployment_id  = aws_apigatewayv2_deployment.deployment.id
  stage          = var.stage
}

module "sc_api_gateway_mapping" {
  source = "./modules/aws-api-gateway-mapping"

  api_id    = module.sc_api_gateway.api_gateway_id
  domain_id = module.sc_api_gateway_domain.id
  stage_id  = module.sc_api_gateway_stage.api_gateway_stage_id
}

/**
 * HTTP API: what is not the connectivity of a room, today the list of the open rooms. The WebSocket API above serves
 * the connectivity of the rooms only
 */

module "sc_api_gateway_http" {
  source = "./modules/aws-api-gateway-http"

  api_http_name = "sc-http"
  # The app of the stage, and on the development stage the dev server of the game app (npm run serve:dev)
  allow_origins = concat(["https://${local.front_domain_name}"], var.stage == "development" ? ["http://localhost:4200"] : [])
  # The access cookies of a restricted stage
  allow_credentials = local.access_restricted
  stage             = var.stage
}

module "sc_api_gateway_http_routes" {
  source = "./modules/aws-api-gateway-http-routes"

  api_gateway_id            = module.sc_api_gateway_http.api_gateway_id
  api_gateway_execution_arn = module.sc_api_gateway_http.execution_arn
  lambda_httpapi_arn        = module.sc_lambda_httpapi.invoke_arn
  lambda_httpapi_name       = module.sc_lambda_httpapi.name
  # From the condition, as the authorizer of the WebSocket API
  authorizer    = local.access_restricted ? { invoke_arn = module.sc_lambda_httpauthorizer[0].invoke_arn, function_name = module.sc_lambda_httpauthorizer[0].name } : null
  access_lambda = local.access_restricted ? { invoke_arn = module.sc_lambda_access[0].invoke_arn, function_name = module.sc_lambda_access[0].name } : null
}

module "sc_api_gateway_http_domain" {
  source = "./modules/aws-api-gateway-domain"

  domain_name      = local.api_http_domain_name
  certificate_arn  = module.sc_certificate_api_http.certificate_arn
  route_53_zone_id = data.aws_route53_zone.site.zone_id
  stage            = var.stage
}

module "sc_api_gateway_http_mapping" {
  source = "./modules/aws-api-gateway-mapping"

  api_id    = module.sc_api_gateway_http.api_gateway_id
  domain_id = module.sc_api_gateway_http_domain.id
  stage_id  = module.sc_api_gateway_http.api_gateway_stage_id
}

/**
 * Frontend
 */

module "sc_bucket_angular" {
  source = "./modules/aws-bucket-angular"

  domain      = "game-app"
  domain_name = local.front_domain_name
  src_path    = "dist/game-app/browser"
  stage       = var.stage
}

# AWS Cloudfront for caching

resource "aws_cloudfront_origin_access_control" "origine_access_control_angular" {
  name                              = "${local.front_domain_name}.s3.${local.region}.amazonaws.com"
  description                       = "origin access control for angular"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

module "sc_cloudfront_angular" {
  source = "./modules/aws-cloudfront-angular"

  domain_name           = local.front_domain_name
  name                  = "cdn"
  bucket                = module.sc_bucket_angular.bucket
  origin_access_control = aws_cloudfront_origin_access_control.origine_access_control_angular.id
  acm_certificate_arn   = module.sc_certificate_cloudfront.certificate_arn
  # The signer of the access cookies of a restricted stage, none elsewhere, and the login its 403 sends to
  trusted_key_groups = module.sc_access_key_group[*].key_group_id
  access_login_url   = local.access_restricted ? "https://${local.api_http_domain_name}/auth/login" : null
  stage              = var.stage
}

module "sc_bucket_angular_policy" {
  source = "./modules/aws-bucket-angular-policy"

  bucket_id        = module.sc_bucket_angular.bucket.id
  bucket_arn       = module.sc_bucket_angular.bucket.arn
  distribution_arn = module.sc_cloudfront_angular.cloudfront.arn
}

resource "aws_route53_record" "website" {
  zone_id = data.aws_route53_zone.site.zone_id
  name    = local.front_domain_name
  type    = "A"
  alias {
    name                   = module.sc_cloudfront_angular.cloudfront.domain_name
    zone_id                = module.sc_cloudfront_angular.cloudfront.hosted_zone_id
    evaluate_target_health = false
  }
}
