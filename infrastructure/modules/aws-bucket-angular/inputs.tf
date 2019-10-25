
variable "domain" {
  type        = string
  description = "Directory name of the angular app"
}

variable "domain_name" {
  type        = string
  description = "Domain name of the website"
}

variable "origin_access_identity_arn" {
  type        = string
  description = "Arn of the allowed origin identity"
}

variable "src_path" {
  type        = string
  description = "Path of the app files in the domain"
}

variable "stage" {
  description = "Stage"
  type        = string
}
