
variable "connections_table_arn" {
  type        = string
  description = "ARN of the connections table"
}

variable "rooms_table_arn" {
  type        = string
  description = "ARN of the rooms table"
}

variable "stage" {
  description = "Stage"
  type        = string
}
