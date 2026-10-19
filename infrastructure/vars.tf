variable "stage" {
  description = "Stage"
  type        = string
}

variable "main_domain_name" {
  description = "Domain name - Two first level"
  type        = string
}

# Not a secret: the private key never reaches Terraform, the owner writes it to SSM (README, Access to staging)
variable "access_public_key" {
  description = "Public key (PEM) of the access cookies of the stage restricted to its owner, staging: ACCESS_PUBLIC_KEY of its GitHub environment. Empty on the other stages"
  type        = string
  default     = ""
  nullable    = false

  validation {
    condition     = (var.stage == "staging") == (trimspace(var.access_public_key) != "")
    error_message = "The access_public_key is required on staging, restricted to its owner, and refused on the other stages, public."
  }

  validation {
    condition     = trimspace(var.access_public_key) == "" || can(regex("^-----BEGIN PUBLIC KEY-----\\n[A-Za-z0-9+/=\\n]+\\n-----END PUBLIC KEY-----$", trimspace(var.access_public_key)))
    error_message = "The access_public_key is a public key in PEM, as written by openssl rsa -pubout."
  }
}
