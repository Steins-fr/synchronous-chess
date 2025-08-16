locals {
  stage_upper       = upper(substr(var.stage, 0, 1))              # Première lettre en majuscule
  stage_rest        = substr(var.stage, 1, length(var.stage) - 1) # Le reste de la chaîne
  stage_capitalized = "${local.stage_upper}${local.stage_rest}"   # Combinaison des deux
}

resource "aws_cloudwatch_log_group" "api_gateway_logs" {
  name              = "/aws/apigateway/synchronous-chess-${var.stage}"
  retention_in_days = 14

  tags = {
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}

resource "aws_apigatewayv2_stage" "stage" {
  api_id        = var.api_gateway_id
  name          = local.stage_capitalized
  deployment_id = var.deployment_id

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway_logs.arn
    format          = "$context.requestId $context.identity.sourceIp $context.identity.userAgent"
  }

  default_route_settings {
    detailed_metrics_enabled = false
    logging_level            = "INFO"
    data_trace_enabled       = false
    throttling_burst_limit   = 1000
    throttling_rate_limit    = 5000
  }

  tags = {
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}
