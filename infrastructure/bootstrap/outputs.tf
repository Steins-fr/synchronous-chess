output "deploy_role_arns" {
  value       = { for stage, role in module.deploy_role : stage => role.role_arn }
  description = "The deploy role of each stage: the secret AWS_ROLE_ARN of its GitHub environment"
}
