# The login of the owner of a stage restricted to it, created by infrastructure/bootstrap: the pool outlives the
# destruction of the stage, and the owner, its one user, is created once with the AWS CLI (README), never by Terraform,
# whose plan would show the email. The stage reads it (data sources of infrastructure/main.tf)
resource "aws_cognito_user_pool" "pool" {
  name = var.name
  # The classic managed login, the TOTP and the email of Cognito: no cost under 10,000 users
  user_pool_tier           = "LITE"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  # It holds the user of the owner: deactivated by hand only, to destroy the bootstrap
  deletion_protection = "ACTIVE"

  # A code of an authenticator app at each login, set up at the first one
  mfa_configuration = "ON"
  software_token_mfa_configuration {
    enabled = true
  }

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  password_policy {
    minimum_length                   = 16
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  tags = {
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}

# A public client: the access lambda exchanges the code with the verifier of PKCE, and no secret of the client lands in
# the state. Its tokens are not kept: the access cookies of the stage replace them
resource "aws_cognito_user_pool_client" "client" {
  name         = var.name
  user_pool_id = aws_cognito_user_pool.pool.id

  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid"]
  callback_urls                        = [var.callback_url]
  supported_identity_providers         = ["COGNITO"]
  explicit_auth_flows                  = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors        = "ENABLED"
}

# The classic managed login: the version 2 takes a style (aws_cognito_managed_login_branding), a resource of the version
# 6 of the provider
resource "aws_cognito_user_pool_domain" "domain" {
  domain                = var.domain
  user_pool_id          = aws_cognito_user_pool.pool.id
  managed_login_version = 1
}

data "aws_region" "current" {}
