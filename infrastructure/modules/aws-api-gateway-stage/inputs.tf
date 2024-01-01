variable "api_gateway_id" {
  type        = string
  description = "API Gateway ID"
}

variable "deployment_id" {
  type        = string
  description = "API Gateway deployment ID"
}

variable "stage" {
  description = "Stage"
  type        = string
}
