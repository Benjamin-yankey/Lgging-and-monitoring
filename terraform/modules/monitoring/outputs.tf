output "cloudwatch_agent_role_arn" {
  description = "IAM role ARN for CloudWatch agent"
  value       = aws_iam_role.cloudwatch_agent.arn
}

output "sns_topic_arn" {
  description = "SNS topic ARN for alerts"
  value       = aws_sns_topic.alerts.arn
}

output "guardduty_detector_id" {
  description = "GuardDuty detector ID"
  value       = length(aws_guardduty_detector.main) > 0 ? aws_guardduty_detector.main[0].id : (length(data.aws_guardduty_detector.existing) > 0 ? data.aws_guardduty_detector.existing[0].id : null)
}

output "cloudwatch_dashboard_name" {
  description = "CloudWatch dashboard name"
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}

output "log_group_arns" {
  description = "ARNs of CloudWatch log groups"
  value = {
    jenkins    = aws_cloudwatch_log_group.jenkins.arn
    app        = aws_cloudwatch_log_group.app.arn
    monitoring = aws_cloudwatch_log_group.monitoring.arn
    vpc_flow   = aws_cloudwatch_log_group.vpc_flow.arn
  }
}
