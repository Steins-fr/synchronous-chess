# Reads the metrics of CloudWatch, as the capacity of the Aurora cluster: GetMetricData has no resource type, so the
# metrics of the account. The boundary of the lambdas narrows it to the function of the stage needing it
data "aws_iam_policy_document" "metrics_read" {
  statement {
    effect = "Allow"

    actions = [
      "cloudwatch:GetMetricData"
    ]

    resources = [
      "*"
    ]
  }
}

resource "aws_iam_policy" "policy" {
  name = var.name

  policy = data.aws_iam_policy_document.metrics_read.json

  tags = {
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}
