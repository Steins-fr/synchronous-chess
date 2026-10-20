# What infrastructure/main.tf manages for one stage, scoped to that stage: by the stage in the ARN, by the Environment
# tag, by the record and domain names of the stage. "*" only for the actions without resource type nor condition key
# (Service Authorization Reference), each said why. A denied action in a run of the CI: the README of bootstrap
locals {
  region = "eu-west-1"
  # The certificate of CloudFront lives in us-east-1, where the global services (IAM, CloudFront, Route 53) also answer
  regions = ["eu-west-1", "us-east-1"]
  # Route 53 and ACM compare lowercase names, without the trailing dot
  domain               = lower(var.main_domain_name)
  front_domain_name    = "sc-${var.stage}.${local.domain}"
  api_ws_domain_name   = "sc-ws-${var.stage}.${local.domain}"
  api_http_domain_name = "sc-api-${var.stage}.${local.domain}"
  domain_names         = [local.front_domain_name, local.api_ws_domain_name, local.api_http_domain_name]

  iam        = "arn:aws:iam::${var.account_id}"
  apigateway = "arn:aws:apigateway:${local.region}::"
  functions  = "arn:aws:lambda:${local.region}:${var.account_id}:function:sc_*_${var.stage}"
  migrate    = "arn:aws:lambda:${local.region}:${var.account_id}:function:sc_migrate_${var.stage}"
  # The roles of the lambdas (aws-iam-lambda-role), and their policies by their exact names: never sc-*, which would take
  # in the boundaries and the policies of the deploy roles. A restricted stage adds the one reading its signing key, a
  # stage waking its database the one reading the capacity of its cluster
  lambda_roles    = "${local.iam}:role/sc_lambda_*_${var.stage}"
  lambda_policies = [for name in concat(["sc-database", "sc-manage-connection", "sc-source-hash-secret"], var.access_restricted ? ["sc-access-signing-key"] : [], var.wakes_database ? ["sc-database-capacity"] : []) : "${local.iam}:policy/${name}-${var.stage}"]
  certificates    = [for region in local.regions : "arn:aws:acm:${region}:${var.account_id}:certificate/*"]
  network         = ["arn:aws:ec2:${local.region}:${var.account_id}:vpc/*", "arn:aws:ec2:${local.region}:${var.account_id}:subnet/*"]
  database = [
    "arn:aws:rds:${local.region}:${var.account_id}:cluster:sc-database-${var.stage}",
    "arn:aws:rds:${local.region}:${var.account_id}:db:sc-database-${var.stage}-writer",
    "arn:aws:rds:${local.region}:${var.account_id}:subgrp:sc-database-${var.stage}",
  ]
  log_groups = flatten([for name in ["/aws/lambda/sc_*_${var.stage}", "/aws/apigateway/synchronous-chess-${var.stage}", "/aws/apigateway/synchronous-chess-http-${var.stage}"] : [
    "arn:aws:logs:${local.region}:${var.account_id}:log-group:${name}",
    "arn:aws:logs:${local.region}:${var.account_id}:log-group:${name}:*",
  ]])
  # The AWS managed keys of the parameter, the secret of the cluster and the storage of the cluster
  managed_key_aliases = ["alias/aws/ssm", "alias/aws/secretsmanager", "alias/aws/rds"]
  # The private key of the access cookies of a restricted stage, written by its owner (infrastructure/main.tf)
  access_signing_key = "arn:aws:ssm:${local.region}:${var.account_id}:parameter/sc/${var.stage}/access-signing-key"
  # The function waking the database of a stage doing so, and the rule invoking it (infrastructure/main.tf)
  wake_function = "arn:aws:lambda:${local.region}:${var.account_id}:function:sc_wakedatabase_${var.stage}"
  wake_rule     = "arn:aws:events:${local.region}:${var.account_id}:rule/sc-wake-database-${var.stage}"
}

# The state of the stage, the bucket of its app, its CDN, certificates and records, and the guards of the role
data "aws_iam_policy_document" "edge" {
  # Key names only. No s3:prefix condition: without ListBucket, S3 answers 403 instead of 404 to the state not created
  # yet, at the first run of a stage
  statement {
    sid       = "StateList"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::${var.state_bucket}"]
  }

  statement {
    sid       = "State"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["arn:aws:s3:::${var.state_bucket}/${var.stage}/terraform.tfstate"]
  }

  # The lock of the state (use_lockfile), which plan takes too
  statement {
    sid       = "StateLock"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::${var.state_bucket}/${var.stage}/terraform.tfstate.tflock"]
  }

  # The bucket of the app, named after its domain (aws-bucket-angular): the reads of aws_s3_bucket, which fails on any
  # AccessDenied, and the listings force_destroy empties it with
  statement {
    sid = "AppBucket"
    actions = [
      "s3:CreateBucket", "s3:DeleteBucket", "s3:ListBucket", "s3:ListBucketVersions",
      "s3:GetBucketPolicy", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy",
      "s3:GetBucketAcl", "s3:GetBucketCORS", "s3:GetBucketWebsite", "s3:GetBucketVersioning",
      "s3:GetAccelerateConfiguration", "s3:GetBucketRequestPayment", "s3:GetBucketLogging",
      "s3:GetLifecycleConfiguration", "s3:GetReplicationConfiguration", "s3:GetEncryptionConfiguration",
      "s3:GetBucketObjectLockConfiguration", "s3:GetBucketTagging",
      "s3:GetBucketPublicAccessBlock", "s3:PutBucketPublicAccessBlock",
    ]
    resources = ["arn:aws:s3:::${local.front_domain_name}"]
  }

  # Its files. PutObjectAcl for the acl of aws_s3_object, DeleteObjectVersion for the null versions force_destroy lists
  statement {
    sid       = "AppFiles"
    actions   = ["s3:GetObject", "s3:GetObjectTagging", "s3:PutObject", "s3:PutObjectAcl", "s3:DeleteObject", "s3:DeleteObjectVersion", "s3:AbortMultipartUpload"]
    resources = ["arn:aws:s3:::${local.front_domain_name}/*"]
  }

  # CreateDistribution has no resource type: by the Environment tag the request carries
  statement {
    sid       = "CdnCreate"
    actions   = ["cloudfront:CreateDistribution"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Environment"
      values   = [var.stage]
    }
  }

  # The tags of a new distribution, which has none yet. An existing distribution without Environment tag could be taken
  # in this way: the README of bootstrap has none left in the account
  statement {
    sid       = "CdnTagOnCreate"
    actions   = ["cloudfront:TagResource"]
    resources = ["arn:aws:cloudfront::${var.account_id}:distribution/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Environment"
      values   = [var.stage]
    }

    condition {
      test     = "StringEqualsIfExists"
      variable = "aws:ResourceTag/Environment"
      values   = [var.stage]
    }
  }

  # The read of the distributions, without tag condition: once deleted a distribution has no tag left, and the provider
  # waits for its NoSuchDistribution by reading it. Metadata only
  statement {
    sid       = "CdnRead"
    actions   = ["cloudfront:GetDistribution"]
    resources = ["arn:aws:cloudfront::${var.account_id}:distribution/*"]
  }

  # The distribution of the stage, by its Environment tag (its ID is random)
  statement {
    sid       = "Cdn"
    actions   = ["cloudfront:UpdateDistribution", "cloudfront:DeleteDistribution", "cloudfront:ListTagsForResource", "cloudfront:TagResource", "cloudfront:UntagResource"]
    resources = ["arn:aws:cloudfront::${var.account_id}:distribution/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Environment"
      values   = [var.stage]
    }

    condition {
      test     = "StringEqualsIfExists"
      variable = "aws:RequestTag/Environment"
      values   = [var.stage]
    }
  }

  # CreateOriginAccessControl has no resource type
  statement {
    sid       = "CdnOriginAccessCreate"
    actions   = ["cloudfront:CreateOriginAccessControl"]
    resources = ["*"]
  }

  # An origin access control takes no tag and no condition key, and its ID is random: those of the account
  statement {
    sid       = "CdnOriginAccess"
    actions   = ["cloudfront:GetOriginAccessControl", "cloudfront:UpdateOriginAccessControl", "cloudfront:DeleteOriginAccessControl"]
    resources = ["arn:aws:cloudfront::${var.account_id}:origin-access-control/*"]
  }

  # RequestCertificate has no resource type: the three names of the stage only, validated by DNS, tagged with the stage
  statement {
    sid       = "CertificateRequest"
    actions   = ["acm:RequestCertificate"]
    resources = ["*"]

    condition {
      test     = "ForAllValues:StringEquals"
      variable = "acm:DomainNames"
      values   = local.domain_names
    }

    condition {
      test     = "Null"
      variable = "acm:DomainNames"
      values   = ["false"]
    }

    condition {
      test     = "StringEquals"
      variable = "acm:ValidationMethod"
      values   = ["DNS"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Environment"
      values   = [var.stage]
    }
  }

  # The tags of a new certificate, which has none yet. An existing certificate without Environment tag could be taken in
  # this way: the README of bootstrap has none left in the account
  statement {
    sid       = "CertificateTagOnCreate"
    actions   = ["acm:AddTagsToCertificate"]
    resources = local.certificates

    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Environment"
      values   = [var.stage]
    }

    condition {
      test     = "StringEqualsIfExists"
      variable = "aws:ResourceTag/Environment"
      values   = [var.stage]
    }
  }

  # The certificates of the stage in both regions, by their Environment tag (their IDs are random)
  statement {
    sid       = "Certificates"
    actions   = ["acm:DescribeCertificate", "acm:ListTagsForCertificate", "acm:AddTagsToCertificate", "acm:RemoveTagsFromCertificate", "acm:DeleteCertificate"]
    resources = local.certificates

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Environment"
      values   = [var.stage]
    }

    condition {
      test     = "StringEqualsIfExists"
      variable = "aws:RequestTag/Environment"
      values   = [var.stage]
    }
  }

  # The zone of the main domain, by its ID (data.aws_route53_zone)
  statement {
    sid       = "DnsZone"
    actions   = ["route53:GetHostedZone", "route53:ListResourceRecordSets", "route53:ListTagsForResource"]
    resources = ["arn:aws:route53:::hostedzone/${var.hosted_zone_id}"]
  }

  # Route 53 takes no tag condition: the A records of the three names of the stage, and the CNAME records validating
  # their certificates, by their normalized names
  statement {
    sid       = "DnsRecords"
    actions   = ["route53:ChangeResourceRecordSets"]
    resources = ["arn:aws:route53:::hostedzone/${var.hosted_zone_id}"]

    condition {
      test     = "ForAllValues:StringLike"
      variable = "route53:ChangeResourceRecordSetsNormalizedRecordNames"
      values   = concat(local.domain_names, [for name in local.domain_names : "_*.${name}"])
    }

    condition {
      test     = "ForAllValues:StringEquals"
      variable = "route53:ChangeResourceRecordSetsRecordTypes"
      values   = ["A", "CNAME"]
    }

    condition {
      test     = "Null"
      variable = "route53:ChangeResourceRecordSetsNormalizedRecordNames"
      values   = ["false"]
    }
  }

  # Change IDs are random and take no condition key
  statement {
    sid       = "DnsChanges"
    actions   = ["route53:GetChange"]
    resources = ["arn:aws:route53:::change/*"]
  }

  # Guards, for every policy of the role: no boundary removed from any role
  statement {
    sid       = "KeepBoundaries"
    effect    = "Deny"
    actions   = ["iam:DeleteRolePermissionsBoundary"]
    resources = ["*"]
  }

  # Neither the boundaries, the deploy roles, their policies nor the OIDC provider are edited by a deploy role
  statement {
    sid    = "KeepBootstrap"
    effect = "Deny"
    actions = [
      "iam:CreatePolicyVersion", "iam:DeletePolicy", "iam:DeletePolicyVersion", "iam:SetDefaultPolicyVersion", "iam:TagPolicy", "iam:UntagPolicy",
      "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:PutRolePermissionsBoundary",
      "iam:UpdateAssumeRolePolicy", "iam:UpdateRole", "iam:DeleteRole", "iam:TagRole", "iam:UntagRole", "iam:*OpenIDConnectProvider*",
    ]
    resources = [
      "${local.iam}:policy/sc-lambda-boundary-*",
      "${local.iam}:policy/sc-github-deploy-*",
      "${local.iam}:role/sc-github-deploy-*",
      var.oidc_provider_arn,
    ]
  }

  # The two regions of the main configuration: the "*" statements reach no other
  statement {
    sid       = "OnlyTheTwoRegions"
    effect    = "Deny"
    actions   = ["*"]
    resources = ["*"]

    condition {
      test     = "StringNotEquals"
      variable = "aws:RequestedRegion"
      values   = local.regions
    }
  }
}

# The APIs, lambdas, logs, parameter and keys of the stage
data "aws_iam_policy_document" "api" {
  # An API, or a stage of an API of the stage, tagged with the stage
  statement {
    sid       = "ApiCreate"
    actions   = ["apigateway:POST"]
    resources = ["${local.apigateway}/apis", "${local.apigateway}/apis/*/stages"]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Environment"
      values   = [var.stage]
    }

    condition {
      test     = "StringEqualsIfExists"
      variable = "aws:ResourceTag/Environment"
      values   = [var.stage]
    }
  }

  # The tags a stage is created with: API Gateway also authorizes them as apigateway:TagResource, which is no IAM action
  # (the console and Access Analyzer refuse it), so that only apigateway:* matches it. On the stages of an API of the
  # stage, tagged with the stage
  statement {
    sid       = "ApiStageTags"
    actions   = ["apigateway:*"]
    resources = ["${local.apigateway}/apis/*/stages"]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Environment"
      values   = [var.stage]
    }

    condition {
      test     = "StringEqualsIfExists"
      variable = "aws:ResourceTag/Environment"
      values   = [var.stage]
    }
  }

  # The APIs and stages of the stage, by their Environment tag (their IDs are random). apigateway:* for the same
  # apigateway:TagResource and UntagResource when their tags change
  statement {
    sid       = "Apis"
    actions   = ["apigateway:*"]
    resources = ["${local.apigateway}/apis/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Environment"
      values   = [var.stage]
    }
  }

  # Routes, integrations, deployments and CORS take no tag of their own: by the tag of their API, which the Service
  # Authorization Reference gives them
  statement {
    sid       = "ApiChildren"
    actions   = ["apigateway:GET", "apigateway:POST", "apigateway:PATCH", "apigateway:DELETE"]
    resources = [for child in ["routes", "routes/*", "integrations", "integrations/*", "deployments", "deployments/*", "cors"] : "${local.apigateway}/apis/*/${child}"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Environment"
      values   = [var.stage]
    }
  }

  # The Tags resource takes no aws:ResourceTag: a tag of another stage is refused, and changing the tags of a resource
  # also takes PATCH on it (Apis), on the resources of the stage only
  statement {
    sid       = "ApiTags"
    actions   = ["apigateway:GET", "apigateway:POST", "apigateway:PUT", "apigateway:DELETE"]
    resources = ["${local.apigateway}/tags/*"]

    condition {
      test     = "StringEqualsIfExists"
      variable = "aws:RequestTag/Environment"
      values   = [var.stage]
    }
  }

  # Nor is the tag naming the stage of a resource ever removed (AWS's DenyChangingTag, the tags at creation spared)
  statement {
    sid       = "ApiKeepEnvironmentTag"
    effect    = "Deny"
    actions   = ["apigateway:DELETE"]
    resources = ["arn:aws:apigateway:*::/tags/*"]

    condition {
      test     = "ForAnyValue:StringEqualsIgnoreCase"
      variable = "aws:TagKeys"
      values   = ["Environment"]
    }
  }

  # A custom domain carries its name in the body only, without condition key: it needs a certificate of that name, which
  # ACM issues this role for the names of the stage only
  statement {
    sid       = "ApiDomainCreate"
    actions   = ["apigateway:POST"]
    resources = ["${local.apigateway}/domainnames"]
  }

  # The two custom domains of the stage and their API mappings, by their names; the certificate actions for the
  # replacement of their certificates
  statement {
    sid     = "ApiDomains"
    actions = ["apigateway:GET", "apigateway:POST", "apigateway:PATCH", "apigateway:DELETE", "apigateway:AddCertificateToDomain", "apigateway:RemoveCertificateFromDomain"]
    resources = flatten([for name in [local.api_ws_domain_name, local.api_http_domain_name] : [
      "${local.apigateway}/domainnames/${name}",
      "${local.apigateway}/domainnames/${name}/*",
    ]])
  }

  # The functions of the stage, by their names; CreateFunction passes their role (PassLambdaRoles)
  statement {
    sid = "Functions"
    actions = [
      "lambda:CreateFunction", "lambda:GetFunction", "lambda:GetFunctionConfiguration", "lambda:GetFunctionCodeSigningConfig",
      "lambda:ListVersionsByFunction", "lambda:ListTags", "lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration",
      "lambda:DeleteFunction", "lambda:TagResource", "lambda:UntagResource", "lambda:GetPolicy", "lambda:RemovePermission",
    ]
    resources = [local.functions]
  }

  # Their invocation by API Gateway only (aws_lambda_permission of the routes)
  statement {
    sid       = "FunctionInvokers"
    actions   = ["lambda:AddPermission"]
    resources = [local.functions]

    condition {
      test     = "StringEquals"
      variable = "lambda:Principal"
      values   = ["apigateway.amazonaws.com"]
    }
  }

  # aws_lambda_invocation.migrate, the migrate function of the stage only. It always sends Qualifier=$LATEST, which
  # Lambda authorizes against the qualified ARN
  statement {
    sid       = "Migrations"
    actions   = ["lambda:InvokeFunction"]
    resources = [local.migrate, "${local.migrate}:$LATEST"]
  }

  # The log groups of the stage; CreateLogGroup with tags also checks TagLogGroup and TagResource
  statement {
    sid       = "LogGroups"
    actions   = ["logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:PutRetentionPolicy", "logs:TagResource", "logs:TagLogGroup", "logs:UntagResource", "logs:ListTagsForResource"]
    resources = local.log_groups
  }

  # The access logs of the stage $default of the HTTP API go through a log delivery, set up with the rights of its
  # caller: these actions have no resource type
  statement {
    sid       = "HttpApiLogDelivery"
    actions   = ["logs:CreateLogDelivery", "logs:GetLogDelivery", "logs:UpdateLogDelivery", "logs:DeleteLogDelivery", "logs:ListLogDeliveries", "logs:PutResourcePolicy", "logs:DescribeResourcePolicies"]
    resources = ["*"]
  }

  # The parameters of the stage. The refresh of aws_ssm_parameter decrypts the key of the hashes of the IPs, which the
  # key policy of aws/ssm grants through Parameter Store
  statement {
    sid       = "Parameters"
    actions   = ["ssm:PutParameter", "ssm:GetParameter", "ssm:DeleteParameter", "ssm:AddTagsToResource", "ssm:RemoveTagsFromResource", "ssm:ListTagsForResource"]
    resources = ["arn:aws:ssm:${local.region}:${var.account_id}:parameter/sc/${var.stage}/*"]
  }

  # The AWS managed keys shared by every stage, by the alias of the request (data.aws_kms_key.ssm)...
  statement {
    sid       = "ManagedKeysByAlias"
    actions   = ["kms:DescribeKey"]
    resources = ["arn:aws:kms:${local.region}:${var.account_id}:key/*"]

    condition {
      test     = "StringEquals"
      variable = "kms:RequestAlias"
      values   = local.managed_key_aliases
    }
  }

  # ...or by their aliases, when RDS describes aws/secretsmanager by its ARN for the secret of the cluster
  statement {
    sid       = "ManagedKeys"
    actions   = ["kms:DescribeKey"]
    resources = ["arn:aws:kms:${local.region}:${var.account_id}:key/*"]

    condition {
      test     = "ForAnyValue:StringEquals"
      variable = "kms:ResourceAliases"
      values   = local.managed_key_aliases
    }
  }

  # RDS creates and tags the secret of the master user with the rights of its caller, and deletes it with the cluster.
  # Its name holds no stage: a new secret, or the secret of the cluster of the stage, by the tag RDS sets on it, which
  # no one can set (an aws: key). This role can neither read, untag nor delete it
  statement {
    sid       = "DatabaseSecret"
    actions   = ["secretsmanager:CreateSecret", "secretsmanager:TagResource"]
    resources = ["arn:aws:secretsmanager:${local.region}:${var.account_id}:secret:rds!cluster-*"]

    condition {
      test     = "StringEqualsIfExists"
      variable = "aws:ResourceTag/aws:rds:primaryDBClusterArn"
      values   = ["arn:aws:rds:${local.region}:${var.account_id}:cluster:sc-database-${var.stage}"]
    }
  }
}

# The network and the database of the stage, and the roles and policies of its lambdas
data "aws_iam_policy_document" "data" {
  # Reads without resource type, account wide by nature: the network, the global clusters (the read of aws_rds_cluster
  # fails on AccessDenied), the log groups, the parameters and the zones by name
  statement {
    sid = "ReadsWithoutResourceLevel"
    actions = [
      "ec2:DescribeAvailabilityZones", "ec2:DescribeVpcs", "ec2:DescribeSubnets", "ec2:DescribeRouteTables",
      "ec2:DescribeNetworkAcls", "ec2:DescribeSecurityGroups", "ec2:DescribeNetworkInterfaces",
      "rds:DescribeGlobalClusters", "logs:DescribeLogGroups", "ssm:DescribeParameters",
      "route53:ListHostedZones", "route53:ListHostedZonesByName",
    ]
    resources = ["*"]
  }

  # A VPC or a subnet tagged with the stage at its creation (TagSpecifications)
  statement {
    sid       = "NetworkCreate"
    actions   = ["ec2:CreateVpc", "ec2:CreateSubnet"]
    resources = local.network

    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Environment"
      values   = [var.stage]
    }
  }

  # ...a subnet in a VPC of the stage only: CreateSubnet also authorizes the VPC, which the request does not tag
  statement {
    sid       = "NetworkSubnetInVpc"
    actions   = ["ec2:CreateSubnet"]
    resources = ["arn:aws:ec2:${local.region}:${var.account_id}:vpc/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Environment"
      values   = [var.stage]
    }
  }

  # The tags of these creations
  statement {
    sid       = "NetworkTagOnCreate"
    actions   = ["ec2:CreateTags"]
    resources = local.network

    condition {
      test     = "StringEquals"
      variable = "ec2:CreateAction"
      values   = ["CreateVpc", "CreateSubnet"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Environment"
      values   = [var.stage]
    }
  }

  # The VPC and subnets of the stage, by their Environment tag (their IDs are random)
  statement {
    sid       = "Network"
    actions   = ["ec2:DescribeVpcAttribute", "ec2:DeleteVpc", "ec2:DeleteSubnet", "ec2:CreateTags", "ec2:DeleteTags"]
    resources = local.network

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Environment"
      values   = [var.stage]
    }

    condition {
      test     = "StringEqualsIfExists"
      variable = "aws:RequestTag/Environment"
      values   = [var.stage]
    }
  }

  # The cluster, instance and subnet group of the stage, by their names; their tags at creation go through
  # AddTagsToResource
  statement {
    sid = "Database"
    actions = [
      "rds:DescribeDBClusters", "rds:DescribeDBInstances", "rds:DescribeDBSubnetGroups", "rds:ListTagsForResource",
      "rds:CreateDBCluster", "rds:ModifyDBCluster", "rds:DeleteDBCluster", "rds:EnableHttpEndpoint",
      "rds:CreateDBInstance", "rds:ModifyDBInstance", "rds:DeleteDBInstance",
      "rds:CreateDBSubnetGroup", "rds:ModifyDBSubnetGroup", "rds:DeleteDBSubnetGroup",
      "rds:AddTagsToResource", "rds:RemoveTagsFromResource",
    ]
    resources = local.database
  }

  # The default parameter and option groups of Aurora PostgreSQL, which these creations authorize too
  statement {
    sid     = "DatabaseDefaultGroups"
    actions = ["rds:CreateDBCluster", "rds:CreateDBInstance", "rds:ModifyDBCluster", "rds:ModifyDBInstance"]
    resources = [
      "arn:aws:rds:${local.region}:${var.account_id}:cluster-pg:default.aurora-postgresql*",
      "arn:aws:rds:${local.region}:${var.account_id}:pg:default.aurora-postgresql*",
      "arn:aws:rds:${local.region}:${var.account_id}:og:default:aurora-postgresql-*",
    ]
  }

  # The roles of the lambdas of the stage, created and deleted with the boundary of the stage only
  statement {
    sid       = "LambdaRoles"
    actions   = ["iam:CreateRole", "iam:DeleteRole"]
    resources = [local.lambda_roles]

    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [var.lambda_permissions_boundary_arn]
    }
  }

  # The policies attached to those roles: the four main.tf attaches, nothing else, on roles carrying the boundary
  statement {
    sid       = "LambdaRolePolicies"
    actions   = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
    resources = [local.lambda_roles]

    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [var.lambda_permissions_boundary_arn]
    }

    condition {
      test     = "ArnEquals"
      variable = "iam:PolicyARN"
      values   = concat(["arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"], local.lambda_policies)
    }
  }

  # Their reads and tags; CreateRole with tags also checks TagRole, which takes no boundary key
  statement {
    sid       = "LambdaRoleReads"
    actions   = ["iam:GetRole", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole", "iam:ListRoleTags", "iam:TagRole", "iam:UntagRole"]
    resources = [local.lambda_roles]
  }

  # Passed to Lambda only
  statement {
    sid       = "PassLambdaRoles"
    actions   = ["iam:PassRole"]
    resources = [local.lambda_roles]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

  # The policies of the lambdas of the stage
  statement {
    sid       = "LambdaPolicies"
    actions   = ["iam:CreatePolicy", "iam:CreatePolicyVersion", "iam:DeletePolicyVersion", "iam:DeletePolicy", "iam:GetPolicy", "iam:GetPolicyVersion", "iam:ListPolicyVersions", "iam:ListPolicyTags", "iam:TagPolicy", "iam:UntagPolicy"]
    resources = local.lambda_policies
  }

  # The roles RDS and API Gateway create once per account, if they are missing
  statement {
    sid     = "ServiceLinkedRoles"
    actions = ["iam:CreateServiceLinkedRole"]
    resources = [
      "${local.iam}:role/aws-service-role/rds.amazonaws.com/AWSServiceRoleForRDS",
      "${local.iam}:role/aws-service-role/ops.apigateway.amazonaws.com/AWSServiceRoleForAPIGateway",
    ]

    condition {
      test     = "StringEquals"
      variable = "iam:AWSServiceName"
      values   = ["rds.amazonaws.com", "ops.apigateway.amazonaws.com"]
    }
  }
}

# A stage restricted to its owner only (access_restricted): the login of Cognito, the key group of the signed cookies of
# the distribution, the authorizers of the APIs. Its functions, roles and log groups take the names of the stage
data "aws_iam_policy_document" "access" {
  # The user pool of the stage, created by the bootstrap (module access_login), read only: the app client and the domain
  # of its login, by its Environment tag (its ID is random). Never its users, which the owner creates with an admin profile
  statement {
    sid       = "LoginPool"
    actions   = ["cognito-idp:DescribeUserPool", "cognito-idp:GetUserPoolMfaConfig", "cognito-idp:ListUserPoolClients"]
    resources = ["arn:aws:cognito-idp:${local.region}:${var.account_id}:userpool/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Environment"
      values   = [var.stage]
    }
  }

  # ListUserPools has no resource type: the pools of the account, found by name. Metadata only
  statement {
    sid       = "LoginPools"
    actions   = ["cognito-idp:ListUserPools"]
    resources = ["*"]
  }

  # The public keys and key groups of CloudFront take no tag and have no resource type, and their IDs are random: those
  # of the account. A key group lets a distribution trusting it check cookies, it opens none
  statement {
    sid = "CdnKeys"
    actions = [
      "cloudfront:CreatePublicKey", "cloudfront:GetPublicKey", "cloudfront:GetPublicKeyConfig", "cloudfront:UpdatePublicKey", "cloudfront:DeletePublicKey",
      "cloudfront:CreateKeyGroup", "cloudfront:GetKeyGroup", "cloudfront:GetKeyGroupConfig", "cloudfront:UpdateKeyGroup", "cloudfront:DeleteKeyGroup",
    ]
    resources = ["*"]
  }

  # The authorizers of the APIs of the stage, by the tag of their API (ApiChildren of the api policy)
  statement {
    sid       = "ApiAuthorizers"
    actions   = ["apigateway:GET", "apigateway:POST", "apigateway:PATCH", "apigateway:DELETE"]
    resources = ["${local.apigateway}/apis/*/authorizers", "${local.apigateway}/apis/*/authorizers/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Environment"
      values   = [var.stage]
    }
  }

  # The signing key of the access cookies: Terraform never reads nor writes it, and the Parameters statement of the api
  # policy (with aws/ssm, which decrypts for the account) would let the role read it
  statement {
    sid       = "KeepAccessSigningKey"
    effect    = "Deny"
    actions   = ["ssm:*"]
    resources = [local.access_signing_key]
  }
}

# A stage waking its database on a schedule only (wakes_database): the rule of EventBridge invoking the function waking
# it. The function, its role, its policy and its log group take the names of the stage
data "aws_iam_policy_document" "wake" {
  # The rule of the stage and its target, by its name; PutRule with tags also checks TagResource
  statement {
    sid = "WakeRule"
    actions = [
      "events:PutRule", "events:DescribeRule", "events:DeleteRule", "events:PutTargets", "events:RemoveTargets",
      "events:ListTargetsByRule", "events:ListTagsForResource", "events:TagResource", "events:UntagResource",
    ]
    resources = [local.wake_rule]
  }

  # The invocation of the function by EventBridge (aws_lambda_permission of aws-lambda-schedule), its function only
  statement {
    sid       = "WakeInvoker"
    actions   = ["lambda:AddPermission"]
    resources = [local.wake_function]

    condition {
      test     = "StringEquals"
      variable = "lambda:Principal"
      values   = ["events.amazonaws.com"]
    }
  }
}
