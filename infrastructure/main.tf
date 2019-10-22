terraform {
  backend "s3" {}
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
  folder_name = "room-database"
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
