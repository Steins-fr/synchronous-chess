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

# A stage restricted to its owner: API Gateway refuses a handshake without Cookie header (401) before running the
# authorizer, which checks the access cookies of the front (403 without). Only $connect takes an authorizer: the other
# routes run on a connection it opened
resource "aws_apigatewayv2_authorizer" "connect" {
  count = var.connect_authorizer == null ? 0 : 1

  api_id           = var.api_gateway_id
  name             = "access"
  authorizer_type  = "REQUEST"
  authorizer_uri   = var.connect_authorizer.invoke_arn
  identity_sources = ["route.request.header.Cookie"]
}

resource "aws_lambda_permission" "lambda_permission_connect_authorizer" {
  count = var.connect_authorizer == null ? 0 : 1

  action        = "lambda:InvokeFunction"
  function_name = var.connect_authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.api_gateway_execution_arn}/authorizers/${aws_apigatewayv2_authorizer.connect[0].id}"
}

resource "aws_apigatewayv2_route" "connect" {
  api_id    = var.api_gateway_id
  route_key = "$connect"

  authorization_type = var.connect_authorizer == null ? "NONE" : "CUSTOM"
  authorizer_id      = one(aws_apigatewayv2_authorizer.connect[*].id)

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

# Keeps a connection open (RoomApiRoute.PING of the room socket protocol), API Gateway closing a connection without
# message for 10 minutes, and the database awake during a game: its lambda runs a statement. Without route response,
# nothing is answered
resource "aws_apigatewayv2_integration" "ping" {
  api_id           = var.api_gateway_id
  integration_type = "AWS_PROXY"

  connection_type           = "INTERNET"
  content_handling_strategy = "CONVERT_TO_TEXT"
  description               = "Ping integration"
  integration_method        = "POST"
  integration_uri           = var.lambda_ping_arn
  passthrough_behavior      = "WHEN_NO_MATCH"
}

resource "aws_lambda_permission" "lambda_permission_ping" {
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_ping_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.api_gateway_execution_arn}/*"
}

resource "aws_apigatewayv2_route" "ping" {
  api_id    = var.api_gateway_id
  route_key = "ping"

  target = "integrations/${aws_apigatewayv2_integration.ping.id}"
}
