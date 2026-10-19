variable "api_http_name" {
  type        = string
  description = "Name of the HTTP API"
}

variable "allow_origins" {
  type        = list(string)
  description = "Origins the browsers call the API from (CORS)"
}

variable "allow_credentials" {
  type        = bool
  description = "Whether the browsers send their cookies to the API (CORS): the access cookies of a stage restricted to its owner"
  default     = false
}

variable "stage" {
  description = "Stage"
  type        = string
}
