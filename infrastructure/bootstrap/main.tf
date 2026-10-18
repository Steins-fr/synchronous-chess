# What the stages share, and what the Terraform workflows cannot create for themselves: the trust of AWS in GitHub
# Actions, the deploy role of each stage, the boundaries of the roles of the lambdas, and the account of API Gateway.
# Applied by hand with an admin profile (README.md), before any stage
terraform {
  backend "s3" {
    bucket = "synchronous-chess-terraform"
    # Beside the states of the stages, out of reach of their deploy roles
    key    = "bootstrap/terraform.tfstate"
    region = "eu-west-1"
    # A lock object <key>.tflock beside the state while Terraform runs: two applies never write the state at once
    use_lockfile = true
  }
}

locals {
  github_repository = "Steins-fr/synchronous-chess"
  # The IDs of the repository and of its owner, which GitHub never gives another repository, unlike its name once freed
  # by a rename
  github_repository_id       = "206330696"
  github_repository_owner_id = "36641258"
  # Every stage caps the roles of its lambdas, development included
  stages = ["development", "staging", "production"]
  # The stages the Terraform workflows deploy, and the branches each deploys from, which its GitHub environment also
  # enforces. Development is deployed locally only, without a deploy role
  deploy_refs = {
    staging    = "refs/heads/*"
    production = "refs/heads/main"
  }
  main_domain_name = "steins.fr"
  state_bucket     = "synchronous-chess-terraform"
  region           = "eu-west-1"
  account_id       = data.aws_caller_identity.current.account_id
  # Shared by the stages: no Environment tag
  tags = {
    Application = "Synchronous chess"
    Tool        = "Terraform"
  }
}

data "aws_caller_identity" "current" {}

# The zone the deploy role of a stage adds the records of that stage to
data "aws_route53_zone" "main" {
  name = "${local.main_domain_name}."
}

# STS checks the token of each job against this provider. No thumbprint: AWS checks the certificate of GitHub against
# its own library of trusted authorities, and ignores any thumbprint
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  tags = merge(local.tags, { Name = "GitHub Actions" })
}

module "deploy_role" {
  source   = "./modules/stage-deploy-role"
  for_each = local.deploy_refs

  stage                           = each.key
  git_ref                         = each.value
  account_id                      = local.account_id
  main_domain_name                = local.main_domain_name
  hosted_zone_id                  = data.aws_route53_zone.main.zone_id
  state_bucket                    = local.state_bucket
  lambda_permissions_boundary_arn = aws_iam_policy.lambda_boundary[each.key].arn
  oidc_provider_arn               = aws_iam_openid_connect_provider.github.arn
  github_repository               = local.github_repository
  github_repository_id            = local.github_repository_id
  github_repository_owner_id      = local.github_repository_owner_id
}

# One per account and region, which each stage would otherwise create again: the role the WebSocket stages write their
# execution logs with (logging_level of aws-api-gateway-stage)
module "api_gateway_account" {
  source = "../modules/aws-api-gateway-account"
}
