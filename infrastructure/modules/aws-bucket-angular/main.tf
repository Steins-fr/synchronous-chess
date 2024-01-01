locals {
  frontend_path = "${path.module}/../../../application/frontend/${var.domain}/${var.src_path}"
}

resource "aws_s3_bucket" "sc_bucket_static" {
  bucket        = var.domain_name
  force_destroy = "true"
}

resource "aws_s3_bucket_public_access_block" "sc_bucket_static" {
  bucket = aws_s3_bucket.sc_bucket_static.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_object" "js" {
  for_each = fileset(local.frontend_path, "*.js")

  bucket = aws_s3_bucket.sc_bucket_static.id
  key    = each.value
  source = "${local.frontend_path}/${each.value}"
  #   Was 'public-read'
  acl          = "bucket-owner-full-control"
  content_type = "application/javascript"

  etag = filemd5("${local.frontend_path}/${each.value}")
}

resource "aws_s3_object" "css" {
  for_each = fileset(local.frontend_path, "*.css")

  bucket       = aws_s3_bucket.sc_bucket_static.id
  key          = each.value
  source       = "${local.frontend_path}/${each.value}"
  acl          = "bucket-owner-full-control"
  content_type = "text/css"

  etag = filemd5("${local.frontend_path}/${each.value}")
}

resource "aws_s3_object" "index" {

  bucket       = aws_s3_bucket.sc_bucket_static.id
  key          = "index.html"
  source       = "${local.frontend_path}/index.html"
  acl          = "bucket-owner-full-control"
  content_type = "text/html"

  etag = filemd5("${local.frontend_path}/index.html")
}

resource "aws_s3_object" "favicon" {

  bucket       = aws_s3_bucket.sc_bucket_static.id
  key          = "favicon.ico"
  source       = "${local.frontend_path}/favicon.ico"
  acl          = "bucket-owner-full-control"
  content_type = "image/x-icon"

  etag = filemd5("${local.frontend_path}/favicon.ico")
}
