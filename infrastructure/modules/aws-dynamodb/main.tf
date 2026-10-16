locals {
  name = "sc_${var.name}_${var.stage}"
}

resource "aws_dynamodb_table" "table" {
  name = local.name

  billing_mode   = "PROVISIONED"
  read_capacity  = var.read-capacity
  write_capacity = var.write-capacity
  hash_key       = var.hash-key
  range_key      = var.range-key

  server_side_encryption {
    enabled = false
  }

  dynamic "ttl" {
    for_each = var.ttl-attribute == "" ? [] : [var.ttl-attribute]

    content {
      attribute_name = ttl.value
      enabled        = true
    }
  }

  dynamic "global_secondary_index" {
    for_each = var.global-secondary-indexes

    content {
      name               = global_secondary_index.value.name
      hash_key           = global_secondary_index.value.hash_key
      range_key          = global_secondary_index.value.range_key
      projection_type    = "INCLUDE"
      non_key_attributes = global_secondary_index.value.non_key_attributes
      read_capacity      = var.read-capacity
      write_capacity     = var.write-capacity
    }
  }

  dynamic "attribute" {
    for_each = var.attributes

    content {
      name = attribute.value
      type = "S"
    }
  }

  tags = {
    Name        = "Database - ${var.name}"
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}
