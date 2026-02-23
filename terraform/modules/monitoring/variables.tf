variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "account_id" {
  description = "AWS account ID"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID for flow logs"
  type        = string
}

variable "jenkins_instance_id" {
  description = "Jenkins EC2 instance ID"
  type        = string
}

variable "app_instance_id" {
  description = "App server EC2 instance ID"
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

variable "enable_memory_alarms" {
  description = "Enable memory utilization alarms (requires CloudWatch agent)"
  type        = bool
  default     = false
}

variable "enable_guardduty" {
  description = "Enable GuardDuty security monitoring"
  type        = bool
  default     = true
}

variable "guardduty_bucket_name" {
  description = "S3 bucket name for GuardDuty findings export"
  type        = string
  default     = ""
}
