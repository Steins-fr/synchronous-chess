variable "api_ws_domain_name" {
  type        = string
  description = "Domain name of the api websocket"
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
