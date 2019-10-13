data "aws_iam_policy_document" "sc_room_table" {
  version = "2012-10-17"
  statement {
    actions = [
      "dynamodb:GetItem",
      "dynamodb:DeleteItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem"
    ]
    resources = [
      aws_dynamodb_table.sc_database_rooms.arn
    ]
  }
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

resource "aws_iam_policy" "sc_room_table" {
  name   = "sc_room_table"
  path   = "/"
  policy = data.aws_iam_policy_document.sc_room_table.json
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

resource "aws_iam_role_policy_attachment" "iam_sc_ws_lambda_dynamo_connection_attachment" {
  role       = aws_iam_role.iam_sc_ws_lambda_dynamo.name
  policy_arn = aws_iam_policy.sc_manage_connection.arn
}

resource "aws_dynamodb_table" "sc_database_rooms" {
  name           = "sc_rooms"
  hash_key       = "ID"
  billing_mode   = "PROVISIONED"
  read_capacity  = 5
  write_capacity = 5

  server_side_encryption {
    enabled = true
  }

  attribute {
    name = "ID"
    type = "S"
  }

  tags = {
    Name        = "sc_database_rooms"
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = "test"
  }
}

module "sc_lambda_onconnect" {
  source = "./modules/aws-lambda-api"

  domain = "websocket-api"
  name   = "onconnect"
  role   = aws_iam_role.iam_sc_ws_lambda_logs.arn
  stage  = "test"
}

module "sc_lambda_ondisconnect" {
  source = "./modules/aws-lambda-api"

  domain = "websocket-api"
  name   = "ondisconnect"
  role   = aws_iam_role.iam_sc_ws_lambda_dynamo.arn
  stage  = "test"
  environment = {
    TABLE_NAME = aws_dynamodb_table.sc_database_rooms.name
  }
}

module "sc_lambda_sendmessage" {
  source = "./modules/aws-lambda-api"

  domain = "websocket-api"
  name   = "sendmessage"
  role   = aws_iam_role.iam_sc_ws_lambda_dynamo.arn
  stage  = "test"
  environment = {
    TABLE_NAME = aws_dynamodb_table.sc_database_rooms.name
  }
}
