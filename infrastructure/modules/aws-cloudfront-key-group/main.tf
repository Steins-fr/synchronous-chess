# The public key checking the access cookies, its private key in SSM, written there by the owner of the stage. A key
# rotated is a new public key, of a new ID, created before the former one leaves the group: CloudFront refuses to delete
# a key a group holds
resource "aws_cloudfront_public_key" "key" {
  name_prefix = "${var.name}-"
  comment     = "The access cookies of ${var.name}"
  # As openssl writes it: one line break at the end
  encoded_key = "${trimspace(var.public_key)}\n"

  lifecycle {
    create_before_destroy = true
  }
}

# The signers the distribution trusts (trusted_key_groups of aws-cloudfront-angular)
resource "aws_cloudfront_key_group" "group" {
  name    = var.name
  comment = "The access cookies of ${var.name}"
  items   = [aws_cloudfront_public_key.key.id]
}
