locals {
  frontend_path = "${path.module}/../../../application/frontend/${var.domain}/${var.src_path}"
}

resource "aws_s3_bucket" "site_logs" {
  bucket        = "${var.domain_name}-logs"
  force_destroy = "true"
  acl           = "log-delivery-write"
}

data "template_file" "bucket_static_policy" {
  template = "${file("${path.module}/bucket_static_policy.json")}"
  vars = {
    origin_access_identity_arn = var.origin_access_identity_arn
    bucket                     = var.domain_name
  }
}

resource "aws_s3_bucket" "sc_bucket_static" {
  bucket        = var.domain_name
  policy        = data.template_file.bucket_static_policy.rendered
  force_destroy = "true"

  website {
    index_document = "index.html"
  }

  logging {
    target_bucket = aws_s3_bucket.site_logs.bucket
    target_prefix = "${var.domain_name}/"
  }
}

resource "aws_s3_bucket_public_access_block" "sc_bucket_static" {
  bucket = "${aws_s3_bucket.sc_bucket_static.id}"

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = false
}

resource "aws_s3_bucket_object" "js" {
  for_each = fileset(local.frontend_path, "*.js")

  bucket       = aws_s3_bucket.sc_bucket_static.id
  key          = each.value
  source       = "${local.frontend_path}/${each.value}"
  acl          = "public-read"
  content_type = "application/javascript"

  etag = "${filemd5("${local.frontend_path}/${each.value}")}"
}

resource "aws_s3_bucket_object" "css" {
  for_each = fileset(local.frontend_path, "*.css")

  bucket       = aws_s3_bucket.sc_bucket_static.id
  key          = each.value
  source       = "${local.frontend_path}/${each.value}"
  acl          = "public-read"
  content_type = "text/css"

  etag = "${filemd5("${local.frontend_path}/${each.value}")}"
}

resource "aws_s3_bucket_object" "index" {

  bucket       = aws_s3_bucket.sc_bucket_static.id
  key          = "index.html"
  source       = "${local.frontend_path}/index.html"
  acl          = "public-read"
  content_type = "text/html"

  etag = "${filemd5("${local.frontend_path}/index.html")}"
}

resource "aws_s3_bucket_object" "favicon" {

  bucket       = aws_s3_bucket.sc_bucket_static.id
  key          = "favicon.ico"
  source       = "${local.frontend_path}/favicon.ico"
  acl          = "public-read"
  content_type = "image/x-icon"

  etag = "${filemd5("${local.frontend_path}/favicon.ico")}"
}
