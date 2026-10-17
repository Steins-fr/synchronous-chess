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

variable "timeout" {
  description = "Time the function runs at most, in seconds"
  type        = number
  default     = 3
}

variable "bundle_directory" {
  description = "Whether the bundle is the directory dist/<name>, with the files it reads, rather than the file dist/<name>.mjs"
  type        = bool
  default     = false
}

variable "log_retention_days" {
  description = "Days the logs of the function are kept"
  type        = number
  default     = 14
}
