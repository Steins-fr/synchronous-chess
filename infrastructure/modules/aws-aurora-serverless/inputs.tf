variable "name" {
  description = "Name of the cluster"
  type        = string
}

variable "database_name" {
  description = "Name of the database the cluster creates"
  type        = string
}

variable "engine_version" {
  description = "Version of Aurora PostgreSQL, one with the Data API and the pause at 0 ACU"
  type        = string
}

variable "max_capacity" {
  description = "Most capacity of the cluster, in ACUs: what it costs at worst"
  type        = number
  default     = 2
}

variable "seconds_until_auto_pause" {
  description = "Time without request before the cluster pauses, in seconds: 300 at least"
  type        = number
  default     = 300
}

variable "stage" {
  description = "Stage"
  type        = string
}
