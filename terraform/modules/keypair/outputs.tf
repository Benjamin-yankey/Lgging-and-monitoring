output "key_name" {
  description = "Name of the created key pair"
  value       = aws_key_pair.main.key_name
}

output "private_key_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the SSH private key"
  value       = aws_secretsmanager_secret.private_key.arn
}

output "private_key_secret_name" {
  description = "Name of the Secrets Manager secret containing the SSH private key"
  value       = aws_secretsmanager_secret.private_key.name
}

output "public_key_openssh" {
  description = "Public key in OpenSSH format"
  value       = tls_private_key.main.public_key_openssh
}
