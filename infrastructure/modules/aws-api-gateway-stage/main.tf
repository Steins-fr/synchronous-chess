locals {
  stage_upper       = upper(substr(var.stage, 0, 1))              # Première lettre en majuscule
  stage_rest        = substr(var.stage, 1, length(var.stage) - 1) # Le reste de la chaîne
  stage_capitalized = "${local.stage_upper}${local.stage_rest}"   # Combinaison des deux
}

resource "aws_apigatewayv2_stage" "stage" {
  api_id        = var.api_gateway_id
  name          = local.stage_capitalized
  deployment_id = var.deployment_id

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
