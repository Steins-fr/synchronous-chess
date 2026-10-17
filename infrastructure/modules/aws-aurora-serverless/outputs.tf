output "arn" {
  value       = aws_rds_cluster.cluster.arn
  description = "ARN of the cluster, the resource of the Data API"
}

output "secret_arn" {
  value       = aws_rds_cluster.cluster.master_user_secret[0].secret_arn
  description = "ARN of the secret of the master user, which the Data API reads"
}

output "database_name" {
  value       = aws_rds_cluster.cluster.database_name
  description = "Name of the database"
}

output "writer_identifier" {
  value       = aws_rds_cluster_instance.writer.identifier
  description = "Identifier of the instance, which pauses (ServerlessDatabaseCapacity of CloudWatch)"
}
