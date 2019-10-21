
variable "name" {
  type        = string
  description = "DynamoDB table name"
}

variable "actions" {
  type        = list(string)
  description = "A list of actions that this statement either allows or denies."
}

variable "resources" {
  type        = list(string)
  description = "A list of resource ARNs that this statement applies to."
}

variable "path" {
  type        = string
  description = "Path in which to create the policy."
  default     = "/"
}


variable "stage" {
  description = "Stage"
  type        = string
}
