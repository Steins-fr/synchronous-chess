resource "aws_apigatewayv2_integration" "connect" {
  api_id           = var.api_gateway_id
  integration_type = "AWS_PROXY"

  connection_type           = "INTERNET"
  content_handling_strategy = "CONVERT_TO_TEXT"
  description               = "Connect integration"
  integration_method        = "POST"
  integration_uri           = var.lambda_connect_arn
  passthrough_behavior      = "WHEN_NO_MATCH"
}

resource "aws_lambda_permission" "lambda_permission_connect" {
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_connect_name
  principal     = "apigateway.amazonaws.com"

  # The /* part allows invocation from any stage, method and resource path
  # within API Gateway.
  source_arn = "${var.api_gateway_execution_arn}/*"
}

resource "aws_apigatewayv2_route" "connect" {
  api_id    = var.api_gateway_id
  route_key = "$connect"

  target = "integrations/${aws_apigatewayv2_integration.connect.id}"
}

resource "aws_apigatewayv2_integration" "disconnect" {
  api_id           = var.api_gateway_id
  integration_type = "AWS_PROXY"

  connection_type           = "INTERNET"
  content_handling_strategy = "CONVERT_TO_TEXT"
  description               = "Disconnect integration"
  integration_method        = "POST"
  integration_uri           = var.lambda_disconnect_arn
  passthrough_behavior      = "WHEN_NO_MATCH"
}

resource "aws_lambda_permission" "lambda_permission_disconnect" {
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_disconnect_name
  principal     = "apigateway.amazonaws.com"

  # The /* part allows invocation from any stage, method and resource path
  # within API Gateway.
  source_arn = "${var.api_gateway_execution_arn}/*"
}

resource "aws_apigatewayv2_route" "disconnect" {
  api_id    = var.api_gateway_id
  route_key = "$disconnect"

  target = "integrations/${aws_apigatewayv2_integration.disconnect.id}"
}

resource "aws_apigatewayv2_integration" "sendmessage" {
  api_id           = var.api_gateway_id
  integration_type = "AWS_PROXY"

  connection_type           = "INTERNET"
  content_handling_strategy = "CONVERT_TO_TEXT"
  description               = "Send message integration"
  integration_method        = "POST"
  integration_uri           = var.lambda_sendmessage_arn
  passthrough_behavior      = "WHEN_NO_MATCH"
}

resource "aws_lambda_permission" "lambda_permission_sendmessage" {
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_sendmessage_name
  principal     = "apigateway.amazonaws.com"

  # The /* part allows invocation from any stage, method and resource path
  # within API Gateway.
  source_arn = "${var.api_gateway_execution_arn}/*"
}

resource "aws_apigatewayv2_route" "sendmessage" {
  api_id    = var.api_gateway_id
  route_key = "sendmessage"

  target = "integrations/${aws_apigatewayv2_integration.sendmessage.id}"
}
