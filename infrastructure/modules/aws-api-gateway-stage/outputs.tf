output "api_gateway_stage_id" {
  value       = aws_apigatewayv2_stage.stage.id
  description = "API Gateway stage ID"
}
