# The most a role of a lambda of a stage can do, whatever policy is attached to it: the union of the policies main.tf
# attaches (AWSLambdaBasicExecutionRole, aws-rds-data-iam-policy, aws-api-gateway-iam-policy,
# aws-ssm-parameter-iam-policy), on the resources of the stage. The deploy role of the stage writes those policies, and
# creates these roles with this boundary only: a policy it writes gives a lambda nothing beyond it
data "aws_iam_policy_document" "lambda_boundary" {
  for_each = toset(local.stages)

  # AWSLambdaBasicExecutionRole, on the log groups of the functions of the stage (aws-lambda-api)
  statement {
    sid     = "Logs"
    actions = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/sc_*_${each.key}",
      "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/sc_*_${each.key}:*",
    ]
  }

  # aws-rds-data-iam-policy, on the cluster of the stage, from the code of its functions only: a role of the stage
  # assumed elsewhere reaches nothing
  statement {
    sid       = "DataApi"
    actions   = ["rds-data:ExecuteStatement", "rds-data:BatchExecuteStatement", "rds-data:BeginTransaction", "rds-data:CommitTransaction", "rds-data:RollbackTransaction"]
    resources = ["arn:aws:rds:${local.region}:${local.account_id}:cluster:sc-database-${each.key}"]

    condition {
      test     = "ArnLike"
      variable = "lambda:SourceFunctionArn"
      values   = ["arn:aws:lambda:${local.region}:${local.account_id}:function:sc_*_${each.key}"]
    }
  }

  # The secret of the master user, which the Data API reads with the rights of the lambda, on its behalf. Its name holds
  # no stage (rds!cluster-<uuid>): to scope it to the cluster of the stage once its tags are known (README.md)
  statement {
    sid       = "DatabaseSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:rds!cluster-*"]
  }

  # Secrets Manager decrypts that secret with aws/secretsmanager, whose key policy grants it through Secrets Manager:
  # a boundary grants nothing by itself, but caps that grant too
  statement {
    sid       = "DatabaseSecretKey"
    actions   = ["kms:Decrypt"]
    resources = ["arn:aws:kms:${local.region}:${local.account_id}:key/*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${local.region}.amazonaws.com"]
    }
  }

  # aws-api-gateway-iam-policy: the connections of the WebSocket stage, named after the stage capitalized
  # (aws-api-gateway-stage), whatever the random ID of its API
  statement {
    sid       = "WebSocketConnections"
    actions   = ["execute-api:ManageConnections"]
    resources = ["arn:aws:execute-api:${local.region}:${local.account_id}:*/${title(each.key)}/*"]

    condition {
      test     = "ArnLike"
      variable = "lambda:SourceFunctionArn"
      values   = ["arn:aws:lambda:${local.region}:${local.account_id}:function:sc_*_${each.key}"]
    }
  }

  # aws-ssm-parameter-iam-policy, on the parameters of the stage
  statement {
    sid       = "Parameters"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${local.region}:${local.account_id}:parameter/sc/${each.key}/*"]

    condition {
      test     = "ArnLike"
      variable = "lambda:SourceFunctionArn"
      values   = ["arn:aws:lambda:${local.region}:${local.account_id}:function:sc_*_${each.key}"]
    }
  }

  # Parameter Store decrypts them with aws/ssm, with the ARN of the parameter as encryption context
  statement {
    sid       = "ParametersKey"
    actions   = ["kms:Decrypt"]
    resources = ["arn:aws:kms:${local.region}:${local.account_id}:key/*"]

    condition {
      test     = "StringLike"
      variable = "kms:EncryptionContext:PARAMETER_ARN"
      values   = ["arn:aws:ssm:${local.region}:${local.account_id}:parameter/sc/${each.key}/*"]
    }
  }
}

resource "aws_iam_policy" "lambda_boundary" {
  for_each = toset(local.stages)

  name   = "sc-lambda-boundary-${each.key}"
  policy = data.aws_iam_policy_document.lambda_boundary[each.key].json

  tags = merge(local.tags, { Environment = each.key })
}
