terraform {
  backend "s3" {}
}

locals {
  domain_name   = "sc-${var.stage}.${var.main_domain_name}"
  frontend_path = "../application/frontend/game-app/dist/synchronous-chess"
  zone_name     = "${var.main_domain_name}."
}


/**
 * Tables
 */
module "sc_database_rooms" {
  source = "./modules/aws-dynamodb"

  name       = "rooms"
  hash-key   = "ID"
  range-key  = "connectionId"
  attributes = ["ID", "connectionId"]

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
 * Roles
 */
module "sc_role_lambda_basic" {
  source   = "./modules/aws-iam-role"
  name     = "lambda_basic"
  policies = ["arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"]
  stage    = var.stage
}

module "sc_role_lambda_dynamo" {
  source = "./modules/aws-iam-role"
  name   = "lambda_dynamo"
  policies = [
    "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    "arn:aws:iam::404273159415:policy/sc-manage-tables-${var.stage}",
    "arn:aws:iam::404273159415:policy/sc-manage-connection-${var.stage}"
  ]
  stage = var.stage
}

/**
 * Layers
 */
module "sc_layer_room_manager" {
  source = "./modules/aws-lambda-layer"

  name        = "room_manager"
  domain      = "layers"
  folder_name = "room-manager"
  stage       = var.stage
}

/**
 * Lambdas
 */
module "sc_lambda_onconnect" {
  source = "./modules/aws-lambda-api"

  domain = "websocket-api"
  name   = "onconnect"
  role   = module.sc_role_lambda_basic.arn
  stage  = var.stage
}

module "sc_lambda_ondisconnect" {
  source = "./modules/aws-lambda-api"

  domain = "websocket-api"
  name   = "ondisconnect"
  role   = module.sc_role_lambda_dynamo.arn
  layers = [module.sc_layer_room_manager.layer_arn]
  stage  = var.stage
  environment = {
    TABLE_NAME_ROOMS       = module.sc_database_rooms.name
    TABLE_NAME_CONNECTIONS = module.sc_database_connections.name
  }
}

module "sc_lambda_sendmessage" {
  source = "./modules/aws-lambda-api"

  domain = "websocket-api"
  name   = "sendmessage"
  role   = module.sc_role_lambda_dynamo.arn
  layers = [module.sc_layer_room_manager.layer_arn]
  stage  = var.stage
  environment = {
    TABLE_NAME_ROOMS       = module.sc_database_rooms.name
    TABLE_NAME_CONNECTIONS = module.sc_database_connections.name
  }
}

/**
 * Frontend
 */

module "sc_bucket_angular" {
  source = "./modules/aws-bucket-angular"

  domain                     = "game-app"
  domain_name                = local.domain_name
  src_path                   = "dist/synchronous-chess"
  origin_access_identity_arn = aws_cloudfront_origin_access_identity.origin_access_identity.iam_arn
  stage                      = var.stage
}

# AWS Cloudfront for caching

resource "aws_cloudfront_origin_access_identity" "origin_access_identity" {
  comment = "cloudfront origin access identity"
}

module "sc_cloudfront_angular" {
  source = "./modules/aws-cloudfront-angular"

  domain_name            = local.domain_name
  name                   = "cdn"
  bucket                 = module.sc_bucket_angular.bucket
  origin_access_identity = aws_cloudfront_origin_access_identity.origin_access_identity.cloudfront_access_identity_path
  acm_certificate_arn    = var.acm_certificate_arn
  stage                  = var.stage
}

data "aws_route53_zone" "site" {
  name = local.zone_name
}

resource "aws_route53_record" "website" {
  zone_id = data.aws_route53_zone.site.zone_id
  name    = local.domain_name
  type    = "A"
  alias {
    name                   = module.sc_cloudfront_angular.cloudfront.domain_name
    zone_id                = module.sc_cloudfront_angular.cloudfront.hosted_zone_id
    evaluate_target_health = false
  }
}
