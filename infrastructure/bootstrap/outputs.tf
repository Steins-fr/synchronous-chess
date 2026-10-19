output "deploy_role_arns" {
  value       = { for stage, role in module.deploy_role : stage => role.role_arn }
  description = "The deploy role of each stage: the secret AWS_ROLE_ARN of its GitHub environment"
}

output "access_user_pool_ids" {
  value       = { for stage, login in module.access_login : stage => login.user_pool_id }
  description = "The user pool of each restricted stage, where its owner is created (README, Access to staging)"
}
