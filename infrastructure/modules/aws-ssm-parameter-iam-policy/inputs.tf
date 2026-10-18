variable "name" {
  description = "Name of the policy"
  type        = string
}

variable "parameter_arn" {
  description = "ARN of the SecureString parameter"
  type        = string
}

variable "kms_key_arn" {
  description = "ARN of the KMS key encrypting the parameter"
  type        = string
}

variable "stage" {
  description = "Stage"
  type        = string
}
