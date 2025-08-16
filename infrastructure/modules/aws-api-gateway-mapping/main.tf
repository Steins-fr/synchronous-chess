resource "aws_apigatewayv2_api_mapping" "mapping" {
  api_id      = var.api_id
  domain_name = var.domain_id
  stage       = var.stage_id
}
