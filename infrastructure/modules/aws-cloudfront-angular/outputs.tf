output "cloudfront" {
  value       = aws_cloudfront_distribution.website_cdn
  description = "Cloudfront object"
}
