terraform {
  backend "s3" {
    bucket = "synchronous-chess-terraform"
    key    = "dev/terraform.rfstate"
    region = "eu-west-1"
  }
}

module "sc_database_rooms" {
  source = "./modules/aws-dynamodb"

  name       = "rooms"
  hash-key   = "ID"
  range-key  = "connectionId"
  attributes = ["ID", "connectionId"]

  stage = "dev"
}

data "aws_iam_policy_document" "sc_room_table" {
  version = "2012-10-17"
  statement {
    actions = [
      "dynamodb:DeleteItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query"
    ]
    resources = [
      module.sc_database_rooms.arn
    ]
  }
}

resource "aws_iam_policy" "sc_room_table" {
  name   = "sc_room_table"
  path   = "/"
  policy = data.aws_iam_policy_document.sc_room_table.json
}

module "sc_database_connections" {
  source = "./modules/aws-dynamodb"

  name           = "connections"
  hash-key       = "connectionId"
  read-capacity  = 2
  write-capacity = 2
  attributes     = ["connectionId"]

  stage = "dev"
}

data "aws_iam_policy_document" "sc_connection_table" {
  version = "2012-10-17"
  statement {
    actions = [
      "dynamodb:GetItem",
      "dynamodb:DeleteItem",
      "dynamodb:PutItem"
    ]
    resources = [
      module.sc_database_connections.arn
    ]
  }
}

resource "aws_iam_policy" "sc_connection_table" {
  name   = "sc_connection_table"
  path   = "/"
  policy = data.aws_iam_policy_document.sc_connection_table.json
}



data "aws_iam_policy_document" "sc_manage_connection" {
  version = "2012-10-17"
  statement {
    actions = [
      "execute-api:ManageConnections"
    ]
    resources = [
      "${var.api_gateway}/*"
    ]
  }
}

resource "aws_iam_policy" "sc_manage_connection" {
  name   = "sc_manage_connection"
  path   = "/"
  policy = data.aws_iam_policy_document.sc_manage_connection.json
}

resource "aws_iam_role" "iam_sc_ws_lambda_logs" {
  name = "iam_sc_ws_lambda_logs"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow"
    }
  ]
}
EOF

  tags = {
    Name        = "iam_sc_ws_lambda_logs"
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = "test"
  }
}

resource "aws_iam_role" "iam_sc_ws_lambda_dynamo" {
  name = "iam_sc_ws_lambda_dynamo"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow"
    }
  ]
}
EOF

  tags = {
    Name        = "iam_sc_ws_lambda_dynamo"
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = "test"
  }
}

resource "aws_iam_role_policy_attachment" "iam_sc_ws_lambda_logs_attachment" {
  role       = aws_iam_role.iam_sc_ws_lambda_logs.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "iam_sc_ws_lambda_dynamo_logs_attachment" {
  role       = aws_iam_role.iam_sc_ws_lambda_dynamo.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "iam_sc_ws_lambda_dynamo_room_table_attachment" {
  role       = aws_iam_role.iam_sc_ws_lambda_dynamo.name
  policy_arn = aws_iam_policy.sc_room_table.arn
}

resource "aws_iam_role_policy_attachment" "iam_sc_ws_lambda_dynamo_connection_table_attachment" {
  role       = aws_iam_role.iam_sc_ws_lambda_dynamo.name
  policy_arn = aws_iam_policy.sc_connection_table.arn
}

resource "aws_iam_role_policy_attachment" "iam_sc_ws_lambda_dynamo_connection_attachment" {
  role       = aws_iam_role.iam_sc_ws_lambda_dynamo.name
  policy_arn = aws_iam_policy.sc_manage_connection.arn
}

module "sc_layer_room_database" {
  source = "./modules/aws-lambda-layer"

  domain = "layers"
  name   = "room-database"
  stage  = "dev"
}

module "sc_lambda_onconnect" {
  source = "./modules/aws-lambda-api"

  domain = "websocket-api"
  name   = "onconnect"
  role   = aws_iam_role.iam_sc_ws_lambda_logs.arn
  stage  = "dev"
}

module "sc_lambda_ondisconnect" {
  source = "./modules/aws-lambda-api"

  domain = "websocket-api"
  name   = "ondisconnect"
  role   = aws_iam_role.iam_sc_ws_lambda_dynamo.arn
  layers = [module.sc_layer_room_database.layer_arn]
  stage  = "dev"
  environment = {
    TABLE_NAME_ROOMS       = module.sc_database_rooms.name
    TABLE_NAME_CONNECTIONS = module.sc_database_connections.name
  }
}

module "sc_lambda_sendmessage" {
  source = "./modules/aws-lambda-api"

  domain = "websocket-api"
  name   = "sendmessage"
  role   = aws_iam_role.iam_sc_ws_lambda_dynamo.arn
  layers = [module.sc_layer_room_database.layer_arn]
  stage  = "dev"
  environment = {
    TABLE_NAME_ROOMS       = module.sc_database_rooms.name
    TABLE_NAME_CONNECTIONS = module.sc_database_connections.name
  }
}
