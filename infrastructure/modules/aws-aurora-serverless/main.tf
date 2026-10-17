locals {
  # Letters, digits and hyphens only in the identifiers of RDS
  name = "sc-${var.name}-${var.stage}"
  tags = {
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }
}

# A network of its own, without internet access: the lambdas reach the cluster through its Data API (HTTPS), outside
# any VPC. The subnets of two zones at least, which Aurora requires
data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "vpc" {
  cidr_block = "10.0.0.0/16"

  tags = merge(local.tags, { Name = "Database network - ${var.name}" })
}

resource "aws_subnet" "subnets" {
  count = 2

  vpc_id            = aws_vpc.vpc.id
  cidr_block        = cidrsubnet(aws_vpc.vpc.cidr_block, 8, count.index)
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = merge(local.tags, { Name = "Database subnet - ${var.name} ${count.index}" })
}

resource "aws_db_subnet_group" "subnets" {
  name       = local.name
  subnet_ids = aws_subnet.subnets[*].id

  tags = merge(local.tags, { Name = "Database subnets - ${var.name}" })
}

resource "aws_rds_cluster" "cluster" {
  cluster_identifier = local.name
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned"
  engine_version     = var.engine_version
  database_name      = var.database_name
  master_username    = "sc_admin"
  # The password lives in a secret of Secrets Manager, rotated by RDS: the Data API reads it
  manage_master_user_password = true
  enable_http_endpoint        = true

  db_subnet_group_name = aws_db_subnet_group.subnets.name
  storage_encrypted    = true
  # The rooms live for a game: nothing to restore
  backup_retention_period = 1
  skip_final_snapshot     = true

  # Paused at 0 ACU once nobody plays: an RDS Proxy, or a connection kept open, would keep it awake
  serverlessv2_scaling_configuration {
    min_capacity             = 0
    max_capacity             = var.max_capacity
    seconds_until_auto_pause = var.seconds_until_auto_pause
  }

  # AWS upgrades the minor version itself (auto_minor_version_upgrade of the instance): never planned back
  lifecycle {
    ignore_changes = [engine_version]
  }

  tags = merge(local.tags, { Name = "Database - ${var.name}" })
}

resource "aws_rds_cluster_instance" "writer" {
  identifier         = "${local.name}-writer"
  cluster_identifier = aws_rds_cluster.cluster.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.cluster.engine
  engine_version     = aws_rds_cluster.cluster.engine_version

  lifecycle {
    ignore_changes = [engine_version]
  }

  tags = merge(local.tags, { Name = "Database instance - ${var.name}" })
}
