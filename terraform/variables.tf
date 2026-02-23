variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-central-1"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "cicd-pipeline"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnets" {
  description = "Public subnet CIDR blocks"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnets" {
  description = "Private subnet CIDR blocks"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.20.0/24"]
}

variable "availability_zones" {
  description = "List of availability zones to use (hardcoded to avoid ec2:DescribeAvailabilityZones permission requirement)"
  type        = list(string)
}

variable "allowed_ips" {
  description = "List of allowed CIDR blocks for SSH, Jenkins, and application access. Must be explicitly provided (e.g., [\"203.0.113.10/32\"] for a single IP)."
  type        = list(string)

  validation {
    condition     = !contains(var.allowed_ips, "0.0.0.0/0")
    error_message = "allowed_ips must not contain 0.0.0.0/0. Specify trusted CIDR blocks (e.g., [\"YOUR_IP/32\"])."
  }
}

variable "jenkins_instance_type" {
  description = "Instance type for Jenkins server"
  type        = string
  default     = "t3.micro"
}

variable "app_instance_type" {
  description = "Instance type for application server"
  type        = string
  default     = "t3.micro"
}

variable "jenkins_admin_password" {
  description = "Jenkins admin password"
  type        = string
  sensitive   = true
}

variable "monitoring_instance_type" {
  description = "Instance type for the monitoring server (Prometheus + Grafana)"
  type        = string
  default     = "t3.small"
}

variable "grafana_admin_password" {
  description = "Grafana admin password. Avoid # and $ characters."
  type        = string
  sensitive   = true
}

variable "git_repo_url" {
  description = "HTTPS URL of this repository; used by the monitoring EC2 to clone configs and dashboard JSON."
  type        = string
}

variable "alert_email" {
  description = "Email address for CloudWatch alerts"
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}

variable "enable_guardduty" {
  description = "Enable GuardDuty security monitoring"
  type        = bool
  default     = true
}
