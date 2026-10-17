locals {
  frontend_path = "${path.module}/../../../application/frontend/${var.domain}/${var.src_path}"
  # The type CloudFront serves each file with, by its extension: a browser refuses a script or a style of another type
  content_types = {
    css         = "text/css"
    gif         = "image/gif"
    html        = "text/html"
    ico         = "image/x-icon"
    jpeg        = "image/jpeg"
    jpg         = "image/jpeg"
    js          = "application/javascript"
    json        = "application/json"
    map         = "application/json"
    mp3         = "audio/mpeg"
    png         = "image/png"
    svg         = "image/svg+xml"
    ttf         = "font/ttf"
    txt         = "text/plain"
    wav         = "audio/wav"
    webmanifest = "application/manifest+json"
    webp        = "image/webp"
    woff        = "font/woff"
    woff2       = "font/woff2"
    xml         = "application/xml"
  }
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

# Every file of the build, the ones of its subfolders included (the assets of the app)
resource "aws_s3_object" "files" {
  for_each = fileset(local.frontend_path, "**")

  bucket = aws_s3_bucket.sc_bucket_static.id
  key    = each.value
  source = "${local.frontend_path}/${each.value}"
  #   Was 'public-read'
  acl          = "bucket-owner-full-control"
  content_type = lookup(local.content_types, lower(regex("[^.]*$", each.value)), "application/octet-stream")

  etag = filemd5("${local.frontend_path}/${each.value}")
}
