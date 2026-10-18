variable "stage" {
  description = "Stage the role deploys, the name of its GitHub environment"
  type        = string
}

variable "git_ref" {
  description = "Ref the jobs assuming the role run from: one branch (refs/heads/main), or a pattern (refs/heads/*)"
  type        = string
}

variable "account_id" {
  description = "ID of the AWS account"
  type        = string
}

variable "main_domain_name" {
  description = "Main domain name, the stage deploying its sub-domains (main_domain_name of the main configuration)"
  type        = string
}

variable "hosted_zone_id" {
  description = "ID of the Route 53 zone of the main domain"
  type        = string
}

variable "state_bucket" {
  description = "Name of the bucket of the Terraform states"
  type        = string
}

variable "lambda_permissions_boundary_arn" {
  description = "ARN of the boundary the roles of the lambdas of the stage carry"
  type        = string
}

variable "oidc_provider_arn" {
  description = "ARN of the OIDC provider of GitHub Actions"
  type        = string
}

variable "github_repository" {
  description = "Repository the jobs run in, as owner/name"
  type        = string
}

variable "github_repository_id" {
  description = "ID of that repository"
  type        = string
}

variable "github_repository_owner_id" {
  description = "ID of the owner of that repository"
  type        = string
}
