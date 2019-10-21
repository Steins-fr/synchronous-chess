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
    enabled = true
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
