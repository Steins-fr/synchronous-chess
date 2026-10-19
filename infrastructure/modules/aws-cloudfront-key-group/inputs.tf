variable "name" {
  description = "Name of the key group, and prefix of the name of its public key"
  type        = string
}

variable "public_key" {
  description = "Public key (PEM) checking the signed cookies: its private key never reaches Terraform"
  type        = string
}
