output "public_key_id" {
  value       = aws_cloudfront_public_key.key.id
  description = "ID of the public key: the CloudFront-Key-Pair-Id of the cookies it checks"
}

output "key_group_id" {
  value       = aws_cloudfront_key_group.group.id
  description = "ID of the key group"
}
