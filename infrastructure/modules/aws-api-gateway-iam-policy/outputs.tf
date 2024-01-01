output "arn" {
  value       = aws_iam_policy.policy.arn
  description = "Arn of the policy."
}

output "name" {
  value       = aws_iam_policy.policy.name
  description = "Name of the policy."
}
