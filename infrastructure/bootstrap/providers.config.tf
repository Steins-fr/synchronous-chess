terraform {
  # use_lockfile of the S3 backend needs Terraform 1.11 at least. Terraform 1.16 from 1.16.4, like the Terraform
  # workflows and the main configuration (../providers.config.tf): a later minor release could write a state they cannot
  # read
  required_version = "~> 1.16.4"

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # The version of the main configuration: thumbprint_list of aws_iam_openid_connect_provider is optional since 5.81
      version = "~> 5.87"
    }
  }
}

provider "aws" {
  region = "eu-west-1"
}
