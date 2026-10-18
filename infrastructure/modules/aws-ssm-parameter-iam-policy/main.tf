# Reads one SecureString parameter: Parameter Store decrypts it through KMS with the ARN of the parameter as encryption
# context, which binds the key to this parameter only
data "aws_iam_policy_document" "parameter_read" {
  statement {
    effect = "Allow"

    actions = [
      "ssm:GetParameter"
    ]

    resources = [
      var.parameter_arn
    ]
  }

  statement {
    effect = "Allow"

    actions = [
      "kms:Decrypt"
    ]

    resources = [
      var.kms_key_arn
    ]

    condition {
      test     = "StringEquals"
      variable = "kms:EncryptionContext:PARAMETER_ARN"
      values   = [var.parameter_arn]
    }
  }
}

resource "aws_iam_policy" "policy" {
  name = var.name

  policy = data.aws_iam_policy_document.parameter_read.json

  tags = {
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}
