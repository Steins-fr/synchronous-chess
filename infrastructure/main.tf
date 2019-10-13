locals {
  archive_path_ws_onconnect    = ".out/sc_ws_lambda_onconnect.zip"
  archive_path_ws_ondisconnect = ".out/sc_ws_lambda_onconnect.zip"
  archive_path_ws_sendmessage  = ".out/sc_ws_lambda_sendmessage.zip"
}

data "archive_file" "sc_ws_lambda_onconnect_archive" {
  type        = "zip"
  output_path = local.archive_path_ws_onconnect
  source_dir  = "../application/backend/websocket-api/onconnect"
}

data "archive_file" "sc_ws_lambda_ondisconnect_archive" {
  type        = "zip"
  output_path = local.archive_path_ws_ondisconnect
  source_dir  = "../application/backend/websocket-api/ondisconnect"
}

data "archive_file" "sc_ws_lambda_sendmessage_archive" {
  type        = "zip"
  output_path = local.archive_path_ws_sendmessage
  source_dir  = "../application/backend/websocket-api/sendmessage"
}

data "aws_iam_policy_document" "sc_room_table" {
  statement {
    sid = "1"
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

resource "aws_iam_policy" "sc_room_table" {
  name   = "sc_room_table"
  path   = "/"
  policy = data.aws_iam_policy_document.sc_room_table.json
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
    Environment = "test"
  }
}

resource "aws_lambda_function" "sc_ws_lambda_onconnect" {
  filename      = local.archive_path_ws_onconnect
  function_name = "sc_ws_lambda_onconnect"
  role          = aws_iam_role.iam_sc_ws_lambda_logs.arn
  handler       = "app.handler"

  source_code_hash = data.archive_file.sc_ws_lambda_onconnect_archive.output_base64sha256

  runtime = "nodejs10.x"

  tags = {
    Name        = "sc_ws_lambda_onconnect"
    Application = "Synchronous chess"
    Environment = "test"
  }
}

resource "aws_lambda_function" "sc_ws_lambda_ondisconnect" {
  filename      = local.archive_path_ws_ondisconnect
  function_name = "sc_ws_lambda_ondisconnect"
  role          = aws_iam_role.iam_sc_ws_lambda_dynamo.arn
  handler       = "app.handler"

  source_code_hash = data.archive_file.sc_ws_lambda_ondisconnect_archive.output_base64sha256

  runtime = "nodejs10.x"

  tags = {
    Name        = "sc_ws_lambda_ondisconnect"
    Application = "Synchronous chess"
    Environment = "test"
  }
}

resource "aws_lambda_function" "sc_ws_lambda_sendmessage" {
  filename      = local.archive_path_ws_sendmessage
  function_name = "sc_ws_lambda_sendmessage"
  role          = aws_iam_role.iam_sc_ws_lambda_dynamo.arn
  handler       = "app.handler"

  source_code_hash = data.archive_file.sc_ws_lambda_sendmessage_archive.output_base64sha256

  runtime = "nodejs10.x"

  tags = {
    Name        = "sc_ws_lambda_sendmessage"
    Application = "Synchronous chess"
    Environment = "test"
  }
}
