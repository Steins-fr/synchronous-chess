output "bucket_policy" {
  value       = aws_s3_bucket_policy.allow_access_from_distribution
  description = "Bucket policy for allowing access from the distribution"
}
