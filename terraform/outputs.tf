output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "jenkins_public_ip" {
  description = "Public IP address of Jenkins server"
  value       = module.jenkins.public_ip
}

output "jenkins_url" {
  description = "Jenkins URL"
  value       = "http://${module.jenkins.public_ip}:8080"
}

output "app_server_public_ip" {
  description = "Public IP address of application server"
  value       = module.app_server.public_ip
}

output "app_server_private_ip" {
  description = "Private IP address of application server (for Jenkins deployment)"
  value       = module.app_server.private_ip
}

output "app_url" {
  description = "Application URL"
  value       = "http://${module.app_server.public_ip}:5000"
}

output "ssh_private_key_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the SSH private key. Retrieve with: aws secretsmanager get-secret-value --secret-id <arn> --query SecretString --output text"
  value       = module.keypair.private_key_secret_arn
}

output "ssh_jenkins" {
  description = "SSH command for Jenkins server (retrieve key from Secrets Manager first)"
  value       = "ssh -i <private-key-file> ec2-user@${module.jenkins.public_ip}"
}

output "ssh_app_server" {
  description = "SSH command for application server (retrieve key from Secrets Manager first)"
  value       = "ssh -i <private-key-file> ec2-user@${module.app_server.public_ip}"
}

output "monitoring_server_public_ip" {
  description = "Public IP address of the monitoring server"
  value       = module.monitoring_server.public_ip
}

output "prometheus_url" {
  description = "Prometheus URL"
  value       = "http://${module.monitoring_server.public_ip}:9090"
}

output "grafana_url" {
  description = "Grafana URL (login: admin / <grafana_admin_password>)"
  value       = "http://${module.monitoring_server.public_ip}:3000"
}

output "alertmanager_url" {
  description = "Alertmanager URL"
  value       = "http://${module.monitoring_server.public_ip}:9093"
}

output "ssh_monitoring_server" {
  description = "SSH command for monitoring server (retrieve key from Secrets Manager first)"
  value       = "ssh -i <private-key-file> ec2-user@${module.monitoring_server.public_ip}"
}
