variable "name" {
  description = "Name of the rule, without its prefix nor its stage"
  type        = string
}

variable "schedule_expression" {
  description = "When the rule invokes the function: rate() or cron() of EventBridge"
  type        = string
}

variable "function_name" {
  description = "Name of the function the rule invokes"
  type        = string
}

variable "function_arn" {
  description = "ARN of that function"
  type        = string
}

variable "stage" {
  description = "Stage"
  type        = string
}
