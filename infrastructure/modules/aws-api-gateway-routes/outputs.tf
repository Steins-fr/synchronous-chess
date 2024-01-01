output "connect_integration_id" {
  value       = aws_apigatewayv2_integration.connect.id
  description = "Connect integration ID"
}

output "disconnect_integration_id" {
  value       = aws_apigatewayv2_integration.disconnect.id
  description = "Disconnect integration ID"
}

output "sendmessage_integration_id" {
  value       = aws_apigatewayv2_integration.sendmessage.id
  description = "Send message integration ID"
}

output "connect_route_id" {
  value       = aws_apigatewayv2_route.connect.id
  description = "Connect route ID"
}

output "disconnect_route_id" {
  value       = aws_apigatewayv2_route.disconnect.id
  description = "Disconnect route ID"
}

output "sendmessage_route_id" {
  value       = aws_apigatewayv2_route.sendmessage.id
  description = "Send message route ID"
}

output "route_integration_jsonencode" {
  value = join(",", tolist([
    jsonencode(aws_apigatewayv2_integration.connect),
    jsonencode(aws_apigatewayv2_route.connect),
    jsonencode(aws_apigatewayv2_integration.disconnect),
    jsonencode(aws_apigatewayv2_route.disconnect),
    jsonencode(aws_apigatewayv2_integration.sendmessage),
    jsonencode(aws_apigatewayv2_route.sendmessage),
  ]))
}
