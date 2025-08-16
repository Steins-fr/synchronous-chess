output "api_gateway_id" {
  value       = aws_apigatewayv2_api.api.id
  description = "API Gateway ID"
}

output "execution_arn" {
  value       = aws_apigatewayv2_api.api.execution_arn
  description = "API Gateway execution ARN"
}
