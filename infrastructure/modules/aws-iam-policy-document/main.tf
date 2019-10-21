locals {
  name = "sc_${var.name}_${var.stage}"
}

data "aws_iam_policy_document" "document" {
  version = "2012-10-17"
  statement {
    actions   = var.actions
    resources = var.resources
  }
}

resource "aws_iam_policy" "policy" {
  name   = local.name
  path   = var.path
  policy = data.aws_iam_policy_document.document.json
}
