resource "tls_private_key" "main" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "main" {
  key_name   = "${var.project_name}-${var.environment}-keypair1"
  public_key = tls_private_key.main.public_key_openssh

  tags = {
    Name = "${var.project_name}-${var.environment}-keypair1"
  }
}

resource "aws_secretsmanager_secret" "private_key" {
  name                    = "${var.project_name}-${var.environment}-ssh-private-key1"
  description             = "SSH private key for ${var.project_name}-${var.environment} EC2 instances"
  recovery_window_in_days = 0

  tags = {
    Name = "${var.project_name}-${var.environment}-ssh-private-key1"
  }
}

resource "aws_secretsmanager_secret_version" "private_key" {
  secret_id     = aws_secretsmanager_secret.private_key.id
  secret_string = tls_private_key.main.private_key_pem
}
