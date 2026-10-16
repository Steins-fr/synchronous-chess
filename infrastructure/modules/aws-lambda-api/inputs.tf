variable "directory" {
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

variable "stage" {
  description = "Stage"
  type        = string
}

variable "environment" {
  description = "Environment variables"
  type        = map(string)
  default     = {}
}

variable "memory_size" {
  description = "Memory of the function, in MB: Lambda gives it CPU in proportion"
  type        = number
  default     = 128
}
