resource "aws_s3_bucket_policy" "allow_access_from_distribution" {
  bucket = var.bucket_id
  policy = data.aws_iam_policy_document.allow_access_from_distribution.json
}

data "aws_iam_policy_document" "allow_access_from_distribution" {
  statement {
    sid    = "AllowCloudFrontServicePrincipal"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions = [
      "s3:GetObject",
    ]

    resources = [
      "${var.bucket_arn}/*",
    ]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = ["${var.distribution_arn}"]
    }
  }
}
