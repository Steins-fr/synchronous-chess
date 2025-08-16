locals {
  archive_path = ".out/lambda-api/${var.name}.zip"
  lambda_name  = "sc_${var.name}_${var.stage}"
}

data "archive_file" "archive" {
  type        = "zip"
  output_path = local.archive_path
  source_dir  = "${path.module}/../../../application/backend/${var.domain}/${var.name}/dist"
}

resource "aws_lambda_function" "lambda" {
  filename      = local.archive_path
  function_name = local.lambda_name
  role          = var.role
  handler       = "app.handler"
  architectures = ["arm64"]

  source_code_hash = data.archive_file.archive.output_base64sha256

  runtime = "nodejs20.x"

  layers = var.layers

  environment {
    variables = merge(var.environment, { FUNCTION_NAME = local.lambda_name })
  }

  tags = {
    Name        = "Lambda API - ${var.name}"
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}
