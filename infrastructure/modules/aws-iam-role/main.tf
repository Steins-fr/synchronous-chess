locals {
  name = "sc_${var.name}_${var.stage}"
}

resource "aws_iam_role" "role" {
  name = local.name

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow"
    }
  ]
}
EOF

  tags = {
    Name        = "Role - ${var.name}"
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}

# Attach policies to the newly created role
resource "aws_iam_role_policy_attachment" "policy-attachment" {
  count = length(var.policies)
  role  = aws_iam_role.role.name

  policy_arn = var.policies[count.index]
}
