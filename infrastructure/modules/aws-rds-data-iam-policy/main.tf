# The statements of the lambdas, through the Data API: it reads the credentials of the database in the secret of the
# cluster, with the rights of its caller
data "aws_iam_policy_document" "rds_data_allows" {
  statement {
    effect = "Allow"

    actions = [
      "rds-data:ExecuteStatement",
      "rds-data:BatchExecuteStatement",
      "rds-data:BeginTransaction",
      "rds-data:CommitTransaction",
      "rds-data:RollbackTransaction"
    ]

    resources = [
      var.cluster_arn
    ]
  }

  statement {
    effect = "Allow"

    actions = [
      "secretsmanager:GetSecretValue"
    ]

    resources = [
      var.secret_arn
    ]
  }
}

resource "aws_iam_policy" "policy" {
  name = "sc-database-${var.stage}"

  policy = data.aws_iam_policy_document.rds_data_allows.json

  tags = {
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}
