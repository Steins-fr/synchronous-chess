locals {
  tags = {
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}

# Assumed with the OIDC token of the jobs of terraform-plan.yml and terraform-apply.yml, which reference the GitHub
# environment of the stage
data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [var.oidc_provider_arn]
    }

    # The audience configure-aws-credentials asks for
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # The subject of a job referencing an environment names the environment instead of the branch
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:environment:${var.stage}"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:environment"
      values   = [var.stage]
    }

    # The branch, which the deployment branch policy of the environment checks too: AWS still refuses another one if
    # that policy is loosened, and never takes a tag nor the ref of a pull request
    condition {
      test     = strcontains(var.git_ref, "*") ? "StringLike" : "StringEquals"
      variable = "token.actions.githubusercontent.com:ref"
      values   = [var.git_ref]
    }

    # The IDs a repository taking the name after a rename would not have
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:repository_id"
      values   = [var.github_repository_id]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:repository_owner_id"
      values   = [var.github_repository_owner_id]
    }
  }
}

# Named outside the patterns of the roles and policies it manages (sc_lambda_*_<stage>, and the policies of the lambdas
# by their exact names): it cannot edit its own rights
resource "aws_iam_role" "deploy" {
  name               = "sc-github-deploy-${var.stage}"
  assume_role_policy = data.aws_iam_policy_document.trust.json
  # A first apply chains the certificates, the Aurora cluster and the CloudFront distribution, which can outlast the
  # hour by default: role-duration-seconds of terraform-apply.yml asks for these two hours
  max_session_duration = 7200

  tags = merge(local.tags, { Name = "Role - sc-github-deploy-${var.stage}" })
}

# Three managed policies (deploy-policy.tf): the rights of a stage outgrow the 6,144 characters of one. A fourth one on a
# stage restricted to its owner, its access
resource "aws_iam_policy" "deploy" {
  for_each = { for name, policy in {
    edge   = data.aws_iam_policy_document.edge.json
    api    = data.aws_iam_policy_document.api.json
    data   = data.aws_iam_policy_document.data.json
    access = data.aws_iam_policy_document.access.json
  } : name => policy if name != "access" || var.access_restricted }

  name   = "sc-github-deploy-${var.stage}-${each.key}"
  policy = each.value

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "deploy" {
  for_each = aws_iam_policy.deploy

  role       = aws_iam_role.deploy.name
  policy_arn = each.value.arn
}
