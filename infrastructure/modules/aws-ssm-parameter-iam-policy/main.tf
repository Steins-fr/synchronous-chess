# Reads one SecureString parameter: Parameter Store decrypts it through KMS, with the ARN of the parameter as encryption
# context, the only one kms:Decrypt is granted for. The AWS managed key aws/ssm takes no access policy of its own, and
# lets any principal of the account decrypt through Parameter Store: ssm:GetParameter on the parameter is what limits a
# role to it
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
