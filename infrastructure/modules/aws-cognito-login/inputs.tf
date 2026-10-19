variable "name" {
  description = "Name of the user pool and of its app client"
  type        = string
}

variable "domain" {
  description = "Prefix of the domain of the managed login, <domain>.auth.<region>.amazoncognito.com: unique in the region"
  type        = string
}

variable "callback_url" {
  description = "Where the managed login sends the code of a login: the callback of the access lambda"
  type        = string
}

variable "stage" {
  description = "Stage"
  type        = string
}
