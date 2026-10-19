locals {
  name      = "sc_${var.name}_${var.stage}"
  origin_id = "origin-bucket-${var.bucket.id}"
  # The page of the 403 of a restricted stage, beside the files of the app
  access_denied_page = "/access-denied.html"
}

# A restricted stage answers a request without the access cookies with this page, which sends to the login: rather than
# the XML of CloudFront (MissingKey)
resource "aws_s3_object" "access_denied" {
  count = var.access_login_url == null ? 0 : 1

  bucket       = var.bucket.id
  key          = trimprefix(local.access_denied_page, "/")
  content      = templatefile("${path.module}/access-denied.html.tftpl", { login_url = var.access_login_url })
  acl          = "bucket-owner-full-control"
  content_type = "text/html"
}

resource "aws_cloudfront_distribution" "website_cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2"
  price_class         = "PriceClass_100"
  default_root_object = "index.html"

  aliases = ["${var.domain_name}"]

  origin {
    origin_id                = local.origin_id
    domain_name              = var.bucket.bucket_regional_domain_name
    origin_access_control_id = var.origin_access_control
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = local.origin_id
    # A stage restricted to its owner: CloudFront answers 403 to a request without the access cookies, before its cache
    trusted_key_groups = var.trusted_key_groups

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  # The page of the 403, served without the access cookies: CloudFront gets an error page through the behavior of its path
  dynamic "ordered_cache_behavior" {
    for_each = var.access_login_url == null ? [] : [local.access_denied_page]

    content {
      path_pattern     = ordered_cache_behavior.value
      allowed_methods  = ["GET", "HEAD"]
      cached_methods   = ["GET", "HEAD"]
      target_origin_id = local.origin_id

      forwarded_values {
        query_string = false

        cookies {
          forward = "none"
        }
      }

      viewer_protocol_policy = "redirect-to-https"
      min_ttl                = 0
      default_ttl            = 3600
      max_ttl                = 86400
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = {
    Name        = local.name
    Application = "Synchronous chess"
    Tool        = "Terraform"
    Environment = var.stage
  }

  # The routes of the app, which no file holds: S3 answers 404 to a missing file, CloudFront being granted the listing of
  # the bucket (aws-bucket-angular-policy). A 403 stays a refusal, the one of the signed cookies included: CloudFront
  # applies its error responses to its own errors too. On a restricted stage, the 403 shows the page of the login, never
  # cached: a request signed once the owner signed in is served
  dynamic "custom_error_response" {
    for_each = var.access_login_url == null ? [] : [local.access_denied_page]

    content {
      error_code            = "403"
      response_code         = "403"
      response_page_path    = custom_error_response.value
      error_caching_min_ttl = 0
    }
  }

  custom_error_response {
    error_code         = "404"
    response_code      = "200"
    response_page_path = "/index.html"
  }

  viewer_certificate {
    acm_certificate_arn = var.acm_certificate_arn
    ssl_support_method  = "sni-only"
  }
}
