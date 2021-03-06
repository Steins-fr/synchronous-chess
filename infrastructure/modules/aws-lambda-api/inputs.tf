variable "domain" {
  description = "Directory name of the API"
  type        = string
}

variable "name" {
  description = "Function name"
  type        = string
}

variable "role" {
  description = "Role arn"
  type        = string
}

variable "layers" {
  description = "Layers arn"
  type        = list(string)
  default     = []
}


variable "stage" {
  description = "Stage"
  type        = string
}

variable "environment" {
  description = "Environment variables"
  type        = map(string)
  default     = {}
}
