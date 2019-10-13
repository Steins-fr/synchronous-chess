locals {
  archive_path = ".out/sc_ws_lambda_onconnect.zip"
}


data "archive_file" "sc_ws_lambda_onconnect_archive" {
  type        = "zip"
  output_path = local.archive_path
  source_dir  = "../application/backend/websocket-api/onconnect"
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

resource "aws_iam_role_policy_attachment" "iam_sc_ws_lambda_logs_attachment" {
  role       = aws_iam_role.iam_sc_ws_lambda_logs.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "sc_ws_lambda_onconnect" {
  filename      = local.archive_path
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
