output "arn" {
  value       = aws_iam_role.role.arn
  description = "Arn of the role."
  # A lambda given the role deploys once its policies are attached: sendmessage reads its parameter when it loads
  depends_on = [aws_iam_role_policy_attachment.policy_attachment]
}

output "name" {
  value       = aws_iam_role.role.name
  description = "Name of the role."
}
