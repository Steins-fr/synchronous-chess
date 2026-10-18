resource "aws_apigatewayv2_api" "api" {
  name          = "${var.api_http_name}-${var.stage}"
  protocol_type = "HTTP"
  # The app calls the custom domain only (sc_api_gateway_http_domain of main.tf)
  disable_execute_api_endpoint = true

  # API Gateway answers the preflights, and adds its headers to the responses of the lambda: it ignores the lambda's.
  # The app sends simple GET requests, without credentials nor headers of its own: no preflight to cache
  cors_configuration {
    allow_origins = var.allow_origins
    allow_methods = ["GET"]
  }

  tags = {
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}

# Apart from the group of the WebSocket API (aws-api-gateway-stage)
resource "aws_cloudwatch_log_group" "api_gateway_logs" {
  name              = "/aws/apigateway/synchronous-chess-http-${var.stage}"
  retention_in_days = 14

  tags = {
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}

# The stage served at the root of the domain, deployed by API Gateway at each change of the routes
resource "aws_apigatewayv2_stage" "stage" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  # The fields of the WebSocket stage, with the request and the statuses of the response and of the lambda (- when API
  # Gateway answered alone, a throttled request): the user agent last, holding spaces. Never the query, the search of a
  # visitor. An HTTP API writes no execution logs (logging_level and data_trace_enabled are for WebSocket APIs)
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway_logs.arn
    format          = "$context.requestId $context.identity.sourceIp $context.httpMethod $context.path $context.status $context.integration.status $context.responseLatency $context.identity.userAgent"
  }

  default_route_settings {
    # Each request runs a lambda, and wakes the paused database: the limits of the WebSocket API (aws-api-gateway-stage)
    throttling_burst_limit = 500
    throttling_rate_limit  = 100
  }

  tags = {
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}
