data "aws_iam_policy_document" "dynamodb_allows" {
  statement {
    effect = "Allow"

    actions = [
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:GetItem"
    ]

    resources = [
      var.connections_table_arn
    ]
  }

  statement {
    effect = "Allow"

    actions = [
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:UpdateItem",
      "dynamodb:GetItem"
    ]

    resources = [
      var.rooms_table_arn
    ]
  }
}

resource "aws_iam_policy" "policy" {
  name = "sc-manage-tables-${var.stage}"

  policy = data.aws_iam_policy_document.dynamodb_allows.json

  tags = {
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}
