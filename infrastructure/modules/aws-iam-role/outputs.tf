output "arn" {
  value       = aws_iam_role.role.arn
  description = "Arn of the role."
}

output "name" {
  value       = aws_iam_role.role.name
  description = "Name of the role."
}
