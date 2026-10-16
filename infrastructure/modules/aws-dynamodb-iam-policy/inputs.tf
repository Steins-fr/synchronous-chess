
variable "connections_table_arn" {
  type        = string
  description = "ARN of the connections table"
}

variable "rooms_table_arn" {
  type        = string
  description = "ARN of the rooms table"
}

variable "password_attempts_table_arn" {
  type        = string
  description = "ARN of the table of the passwords given to the private rooms"
}

variable "stage" {
  description = "Stage"
  type        = string
}
