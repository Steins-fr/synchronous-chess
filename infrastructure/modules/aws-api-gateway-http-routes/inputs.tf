variable "api_gateway_id" {
  type        = string
  description = "API Gateway ID"
}

variable "api_gateway_execution_arn" {
  type        = string
  description = "API Gateway execution ARN"
}

variable "lambda_httpapi_arn" {
  type        = string
  description = "Invoke ARN of the lambda of the HTTP API"
}

variable "lambda_httpapi_name" {
  type        = string
  description = "Name of the lambda of the HTTP API"
}
