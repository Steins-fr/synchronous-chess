
variable "name" {
  type        = string
  description = "CDN name"
}

variable "domain_name" {
  type        = string
  description = "Domain name of the website"
}

variable "origin_access_identity" {
  type        = string
  description = "Path of the cloudfront identity"
}

variable "acm_certificate_arn" {
  type        = string
  description = "Arn of the certificate"
}

variable "bucket" {
  type = object({
    id                          = string
    bucket_regional_domain_name = string
  })
  description = "Bucket of the hosted site"
}

variable "stage" {
  description = "Stage"
  type        = string
}
