variable "api_gateway_id" {
  type        = string
  description = "API Gateway ID"
}

variable "api_gateway_execution_arn" {
  type        = string
  description = "API Gateway execution ARN"
}

variable "lambda_connect_arn" {
  type        = string
  description = "ARN of the lambda connect"
}

variable "lambda_connect_name" {
  type        = string
  description = "Name of the lambda connect"
}

variable "lambda_disconnect_arn" {
  type        = string
  description = "ARN of the lambda disconnect"
}

variable "lambda_disconnect_name" {
  type        = string
  description = "Name of the lambda disconnect"
}

variable "lambda_sendmessage_arn" {
  type        = string
  description = "ARN of the lambda send message"
}

variable "lambda_sendmessage_name" {
  type        = string
  description = "Name of the lambda send message"
}

variable "stage" {
  description = "Stage"
  type        = string
}
