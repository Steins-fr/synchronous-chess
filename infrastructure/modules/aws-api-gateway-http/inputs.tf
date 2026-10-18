variable "api_http_name" {
  type        = string
  description = "Name of the HTTP API"
}

variable "allow_origins" {
  type        = list(string)
  description = "Origins the browsers call the API from (CORS)"
}

variable "stage" {
  description = "Stage"
  type        = string
}
