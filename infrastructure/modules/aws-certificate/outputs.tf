output "certificate_arn" {
  value       = aws_acm_certificate_validation.certificate_validation.certificate_arn
  description = "The certificate arn"
}
