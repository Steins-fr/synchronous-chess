data "aws_iam_policy_document" "api_gateway_allow" {
  statement {
    effect = "Allow"

    actions = [
      "execute-api:ManageConnections"
    ]

    resources = [
      var.api_gateway_arn
    ]
  }
}

resource "aws_iam_policy" "policy" {
  name = "sc-manage-connection-${var.stage}"

  policy = data.aws_iam_policy_document.api_gateway_allow.json

  tags = {
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}
