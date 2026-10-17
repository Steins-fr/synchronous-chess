variable "domain_name" {
  type        = string
  description = "Domain name of the API"
}

variable "certificate_arn" {
  type        = string
  description = "Arn of the certificate"
}

variable "route_53_zone_id" {
  type        = string
  description = "Id of the route 53 zone"
}

variable "stage" {
  description = "Stage"
  type        = string
}
