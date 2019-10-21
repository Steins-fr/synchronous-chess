output "arn" {
  value       = aws_dynamodb_table.table.arn
  description = "Arn of the table."
}

output "name" {
  value       = aws_dynamodb_table.table.name
  description = "Name of the table."
}
