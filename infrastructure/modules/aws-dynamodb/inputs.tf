
variable "name" {
  type        = string
  description = "DynamoDB table name"
}

variable "hash-key" {
  type        = string
  description = "Primary key. To be defined as an attribute as well."
}

variable "range-key" {
  type        = string
  description = "Secondary sort key. To be defined as an attribute as well."
  default     = ""
}

variable "read-capacity" {
  type        = number
  description = "The number of read units for this table."
  default     = 5
}

variable "write-capacity" {
  type        = number
  description = "The number of write units for this table."
  default     = 5
}

variable "ttl-attribute" {
  type        = string
  description = "Attribute holding the expiry of an item, in epoch seconds: DynamoDB deletes the expired items. No TTL when empty."
  default     = ""
}

variable "global-secondary-indexes" {
  type = list(object({
    name               = string
    hash_key           = string
    non_key_attributes = list(string)
  }))
  description = "Secondary indexes, each one holding the key of the table and the non-key attributes listed. Their keys are defined as attributes as well. Provisioned like the table."
  default     = []
}

variable "attributes" {
  type        = list(string)
  description = "Table attributes values"
}

variable "stage" {
  description = "Stage"
  type        = string
}
