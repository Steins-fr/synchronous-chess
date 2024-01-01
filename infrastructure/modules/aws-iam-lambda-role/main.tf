data "aws_iam_policy_document" "instance_assume_role_policy" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    effect = "Allow"
  }
}

resource "aws_iam_role" "role" {
  name = var.name

  assume_role_policy = data.aws_iam_policy_document.instance_assume_role_policy.json

  tags = {
    Name        = "Role - ${var.name}"
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}

# Attach policies to the newly created role
resource "aws_iam_role_policy_attachment" "policy_attachment" {
  count = length(var.policies)
  role  = aws_iam_role.role.name

  policy_arn = var.policies[count.index]
}
