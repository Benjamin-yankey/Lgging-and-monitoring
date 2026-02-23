output "instance_id" {
  description = "ID of the Jenkins instance"
  value       = aws_instance.jenkins.id
}

output "public_ip" {
  description = "Public IP address of Jenkins instance"
  value       = aws_eip.jenkins.public_ip
}

output "private_ip" {
  description = "Private IP address of Jenkins instance"
  value       = aws_instance.jenkins.private_ip
}