terraform {
  # The key of the hashes of the IPs (main.tf) is an ephemeral value, written through a write-only argument, and the S3
  # backend locks the state with use_lockfile: Terraform 1.11 at least. Terraform 1.16 from 1.16.4, the version of the
  # Terraform workflows, which apply a saved plan with the version it was made with: a later minor release could write a
  # state they cannot read
  required_version = "~> 1.16.4"

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # value_wo of aws_ssm_parameter
      version = "~> 5.87"
    }
    random = {
      source = "hashicorp/random"
      # The ephemeral random_password
      version = "~> 3.7"
    }
  }
}

provider "aws" {
  region = "eu-west-1"
}

provider "aws" {
  alias  = "us"
  region = "us-east-1"
}
