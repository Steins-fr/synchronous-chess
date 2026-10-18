terraform {
  # The key of the hashes of the IPs (main.tf) is an ephemeral value, written through a write-only argument
  required_version = ">= 1.11"

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
