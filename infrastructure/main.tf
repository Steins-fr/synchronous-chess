terraform {
  backend "s3" {
    region = "eu-west-1"
  }
}

locals {
  region             = "eu-west-1"
  front_domain_name  = "sc-${var.stage}.${var.main_domain_name}"
  api_ws_domain_name = "sc-ws-${var.stage}.${var.main_domain_name}"
  frontend_path      = "../application/frontend/game-app/dist/synchronous-chess"
  zone_name          = "${var.main_domain_name}."
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
# endregion


/**
 * Tables
 */
module "sc_database_rooms" {
  source = "./modules/aws-dynamodb"

  name       = "rooms"
  hash-key   = "id"
  attributes = ["id"]

  stage = var.stage
}

module "sc_database_connections" {
  source = "./modules/aws-dynamodb"

  name           = "connections"
  hash-key       = "connectionId"
  read-capacity  = 2
  write-capacity = 2
  attributes     = ["connectionId"]

  stage = var.stage
}

/**
 * API Gateway
 */

module "sc_api_gateway_account" {
  source = "./modules/aws-api-gateway-account"
}

module "sc_api_gateway" {
  source = "./modules/aws-api-gateway"

  api_ws_name = "sc-websocket"
  stage       = var.stage
  depends_on  = [module.sc_api_gateway_account]
}

module "sc_api_gateway_domain" {
  source = "./modules/aws-api-gateway-domain"

  api_ws_domain_name = local.api_ws_domain_name
  certificate_arn    = module.sc_certificate_api_ws.certificate_arn
  route_53_zone_id   = data.aws_route53_zone.site.zone_id
  stage              = var.stage
}

/**
 * Lambdas
 */
module "sc_role_lambda_basic" {
  source   = "./modules/aws-iam-lambda-role"
  name     = "sc_lambda_basic_${var.stage}"
  policies = ["arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"]
  stage    = var.stage
}

module "sc_database_policy" {
  source = "./modules/aws-dynamodb-iam-policy"

  connections_table_arn = module.sc_database_connections.arn
  rooms_table_arn       = module.sc_database_rooms.arn
  stage                 = var.stage
}

module "sc_api_gateway_iam_policy" {
  source = "./modules/aws-api-gateway-iam-policy"

  api_gateway_arn = "${module.sc_api_gateway.execution_arn}/*/*/*"
  stage           = var.stage
}

module "sc_role_lambda_dynamo" {
  source = "./modules/aws-iam-lambda-role"
  name   = "sc_lambda_dynamo_${var.stage}"
  policies = [
    "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    module.sc_database_policy.arn,
    module.sc_api_gateway_iam_policy.arn
  ]
  stage = var.stage
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

  directory = "websocket-api"
  name      = "ondisconnect"
  role      = module.sc_role_lambda_dynamo.arn
  stage     = var.stage
  environment = {
    TABLE_NAME_ROOMS       = module.sc_database_rooms.name
    TABLE_NAME_CONNECTIONS = module.sc_database_connections.name
  }
}

module "sc_lambda_sendmessage" {
  source = "./modules/aws-lambda-api"

  directory = "websocket-api"
  name      = "sendmessage"
  role      = module.sc_role_lambda_dynamo.arn
  stage     = var.stage
  environment = {
    TABLE_NAME_ROOMS       = module.sc_database_rooms.name
    TABLE_NAME_CONNECTIONS = module.sc_database_connections.name
  }
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
  stage                     = var.stage
}

resource "aws_apigatewayv2_deployment" "deployment" {
  api_id      = module.sc_api_gateway.api_gateway_id
  description = "Deployment with routes (${module.sc_api_gateway_routes.connect_route_id},${module.sc_api_gateway_routes.disconnect_route_id}, ${module.sc_api_gateway_routes.sendmessage_route_id})"

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
  stage                 = var.stage
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
