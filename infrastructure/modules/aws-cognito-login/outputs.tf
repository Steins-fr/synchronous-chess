output "user_pool_id" {
  value       = aws_cognito_user_pool.pool.id
  description = "ID of the user pool, where the owner is created"
}

output "client_id" {
  value       = aws_cognito_user_pool_client.client.id
  description = "ID of the app client of the login"
}

output "url" {
  value       = "https://${aws_cognito_user_pool_domain.domain.domain}.auth.${data.aws_region.current.name}.amazoncognito.com"
  description = "URL of the managed login, without trailing slash: its authorize and token endpoints"
}
