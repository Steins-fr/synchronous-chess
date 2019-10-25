variable "stage" {
  description = "Stage"
  type        = string
}

variable "acm_certificate_arn" {
  description = "Arn of the certificate for cloudfront"
  type        = string
}

variable "main_domain_name" {
  description = "Domain name - Two first level"
  type        = string
}
