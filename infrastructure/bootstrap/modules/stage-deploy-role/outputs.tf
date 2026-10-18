output "role_arn" {
  value       = aws_iam_role.deploy.arn
  description = "ARN of the role, the secret AWS_ROLE_ARN of the GitHub environment of the stage"
}
