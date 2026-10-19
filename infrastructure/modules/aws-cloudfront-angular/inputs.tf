
variable "name" {
  type        = string
  description = "CDN name"
}

variable "domain_name" {
  type        = string
  description = "Domain name of the website"
}

variable "origin_access_control" {
  type        = string
  description = "Id of the cloudfront origin access control"
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

variable "trusted_key_groups" {
  type        = list(string)
  description = "Key groups signing the cookies the distribution requires (signed cookies): none on a public stage"
  default     = []
}

variable "access_login_url" {
  type        = string
  description = "Login of a stage restricted to its owner, which the page answering its 403 sends to: null on a public stage"
  default     = null
}

variable "stage" {
  description = "Stage"
  type        = string
}
