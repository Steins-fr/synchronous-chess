
variable "name" {
  type        = string
  description = "DynamoDB table name"
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
