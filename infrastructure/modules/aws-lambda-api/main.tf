locals {
  archive_path = ".out/lambda-api/${var.name}.zip"
  lambda_name  = "sc_${var.name}_${var.stage}"
  dist_path    = "${path.module}/../../../application/backend/${var.directory}/dist"
}

data "archive_file" "archive" {
  type        = "zip"
  source_file = var.bundle_directory ? null : "${local.dist_path}/${var.name}.mjs"
  source_dir  = var.bundle_directory ? "${local.dist_path}/${var.name}" : null
  output_path = local.archive_path
}

# The group Lambda writes the logs of the function to, created before it with a retention: Lambda would create it
# without one, its logs kept forever
resource "aws_cloudwatch_log_group" "logs" {
  name              = "/aws/lambda/${local.lambda_name}"
  retention_in_days = var.log_retention_days

  tags = {
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}

resource "aws_lambda_function" "lambda" {
  filename      = local.archive_path
  function_name = local.lambda_name
  role          = var.role
  handler       = "${var.name}.handler"
  architectures = ["arm64"]

  source_code_hash = data.archive_file.archive.output_base64sha256

  runtime     = "nodejs22.x"
  memory_size = var.memory_size
  timeout     = var.timeout

  environment {
    variables = merge(var.environment, { FUNCTION_NAME = local.lambda_name })
  }

  depends_on = [aws_cloudwatch_log_group.logs]

  tags = {
    Name        = "Lambda API - ${var.name}"
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}
