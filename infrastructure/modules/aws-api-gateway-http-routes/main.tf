# The one integration of the HTTP API: each of its routes runs the lambda httpapi
resource "aws_apigatewayv2_integration" "httpapi" {
  api_id           = var.api_gateway_id
  integration_type = "AWS_PROXY"

  description            = "HTTP API integration"
  integration_method     = "POST"
  integration_uri        = var.lambda_httpapi_arn
  payload_format_version = "2.0"
  # Over the timeout of the lambda (database_lambda_timeout of main.tf), like the WebSocket API: under the 30 seconds
  # the app waits for a response
  timeout_milliseconds = 29000
}

resource "aws_lambda_permission" "lambda_permission_httpapi" {
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_httpapi_name
  principal     = "apigateway.amazonaws.com"

  # The /* part allows invocation from any stage, method and resource path within API Gateway: every route of the
  # lambda
  source_arn = "${var.api_gateway_execution_arn}/*"
}

# The list of the open rooms of a game: RoomApiHttpRoute.ROOMS of the room socket protocol
# (application/shared/room-socket-protocol/room-api-http-route.enum.ts), a handler of the lambda (routeHandlers of
# application/backend/websocket-api/lambdas/httpapi/app.ts). A new route adds an aws_apigatewayv2_route to the same
# integration, and its handler to the lambda
resource "aws_apigatewayv2_route" "rooms" {
  api_id    = var.api_gateway_id
  route_key = "GET /rooms"

  target = "integrations/${aws_apigatewayv2_integration.httpapi.id}"
}
