
variable "name" {
  type        = string
  description = "Role name"
}

variable "policies" {
  type        = list(string)
  description = "List of the ARNs of the policies to assign to the role"
  default     = []
}

variable "stage" {
  description = "Stage"
  type        = string
}

variable "permissions_boundary" {
  description = "ARN of the policy capping the role, sc-lambda-boundary-<stage> of infrastructure/bootstrap"
  type        = string
}
