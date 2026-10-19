# The integration of the routes of the app: each of them runs the lambda httpapi
resource "aws_apigatewayv2_integration" "httpapi" {
  api_id           = var.api_gateway_id
  integration_type = "AWS_PROXY"

  description            = "HTTP API integration"
  integration_method     = "POST"
  integration_uri        = var.lambda_httpapi_arn
  payload_format_version = "2.0"
  # Over the timeout of the lambda (database_lambda_timeout of main.tf), like the WebSocket API: under the 30 seconds
  # the app waits for a response (API_REQUEST_TIMEOUT of the game app)
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

# A stage restricted to its owner: the routes of the app pass with the access cookies of the front, which the authorizer
# checks at each request (403 without). Without cache, API Gateway takes no identity source, and runs it without cookies
# too: it reads them apart from the headers (cookies of the event, payload 2.0)
resource "aws_apigatewayv2_authorizer" "access" {
  count = var.authorizer == null ? 0 : 1

  api_id                            = var.api_gateway_id
  name                              = "access"
  authorizer_type                   = "REQUEST"
  authorizer_uri                    = var.authorizer.invoke_arn
  authorizer_payload_format_version = "2.0"
  enable_simple_responses           = true
  authorizer_result_ttl_in_seconds  = 0
}

resource "aws_lambda_permission" "lambda_permission_authorizer" {
  count = var.authorizer == null ? 0 : 1

  action        = "lambda:InvokeFunction"
  function_name = var.authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.api_gateway_execution_arn}/authorizers/${aws_apigatewayv2_authorizer.access[0].id}"
}

locals {
  authorization_type = var.authorizer == null ? "NONE" : "CUSTOM"
  authorizer_id      = one(aws_apigatewayv2_authorizer.access[*].id)
}

# The list of the open rooms of a game: RoomApiHttpRoute.ROOMS of the room socket protocol
# (application/shared/room-socket-protocol/room-api-http-route.enum.ts), a handler of the lambda (routeHandlers of
# application/backend/websocket-api/lambdas/httpapi/app.ts). A new route of the app adds an aws_apigatewayv2_route to
# the same integration, behind the same authorizer, and its handler to the lambda
resource "aws_apigatewayv2_route" "rooms" {
  api_id    = var.api_gateway_id
  route_key = "GET /rooms"

  authorization_type = local.authorization_type
  authorizer_id      = local.authorizer_id

  target = "integrations/${aws_apigatewayv2_integration.httpapi.id}"
}

# Whether the API is up, once its database answers: RoomApiHttpRoute.HEALTH, the guard of the pages of the game app
# waiting for it
resource "aws_apigatewayv2_route" "health" {
  api_id    = var.api_gateway_id
  route_key = "GET /health"

  authorization_type = local.authorization_type
  authorizer_id      = local.authorizer_id

  target = "integrations/${aws_apigatewayv2_integration.httpapi.id}"
}

# The login of the owner on a restricted stage, opened without the access cookies it sets: AccessRoute of
# application/backend/websocket-api/lambdas/access, never called by the app, so apart from the routes of the protocol
resource "aws_apigatewayv2_integration" "access" {
  count = var.access_lambda == null ? 0 : 1

  api_id           = var.api_gateway_id
  integration_type = "AWS_PROXY"

  description            = "Access integration"
  integration_method     = "POST"
  integration_uri        = var.access_lambda.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_lambda_permission" "lambda_permission_access" {
  count = var.access_lambda == null ? 0 : 1

  action        = "lambda:InvokeFunction"
  function_name = var.access_lambda.function_name
  principal     = "apigateway.amazonaws.com"
  # Any stage and method, the routes of the login only
  source_arn = "${var.api_gateway_execution_arn}/*/*/auth/*"
}

resource "aws_apigatewayv2_route" "access" {
  for_each = var.access_lambda == null ? toset([]) : toset(["GET /auth/login", "GET /auth/callback"])

  api_id    = var.api_gateway_id
  route_key = each.key

  target = "integrations/${aws_apigatewayv2_integration.access[0].id}"
}
