variable "cluster_arn" {
  description = "ARN of the Aurora cluster"
  type        = string
}

variable "secret_arn" {
  description = "ARN of the secret of the cluster, which the Data API reads"
  type        = string
}

variable "stage" {
  description = "Stage"
  type        = string
}
