resource "aws_apigatewayv2_api" "api" {
  name                         = "${var.api_ws_name}-${var.stage}"
  protocol_type                = "WEBSOCKET"
  route_selection_expression   = "$request.body.message"
  api_key_selection_expression = "$request.header.x-api-key"

  tags = {
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}
