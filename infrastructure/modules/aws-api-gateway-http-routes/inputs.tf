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

variable "authorizer" {
  type = object({
    invoke_arn    = string
    function_name = string
  })
  description = "Lambda authorizing the routes of the app on a stage restricted to its owner (httpauthorizer), null on a public stage"
  default     = null
}

variable "access_lambda" {
  type = object({
    invoke_arn    = string
    function_name = string
  })
  description = "Lambda of the login of the owner on a restricted stage (access), its routes outside the authorizer, null on a public stage"
  default     = null
}
