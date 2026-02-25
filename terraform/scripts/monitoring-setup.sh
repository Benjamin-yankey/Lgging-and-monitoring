#!/bin/bash
# monitoring-setup.sh  –  Terraform templatefile
#
# Template variables injected by Terraform:
#   ${app_server_ip}        – private IP of the app EC2 instance
#   ${grafana_admin_password} – Grafana admin password (from TF variable)
#   ${git_repo_url}         – HTTPS URL of this git repository

set -x  # Print commands for debugging
exec > >(tee /var/log/monitoring-setup.log) 2>&1
echo "=== Starting monitoring server setup at $(date) ==="

# ── 1. Install Docker and Git with retries ──────────────────────────────────
echo "Installing Docker and Git..."
max_retries=5
count=0
until yum install -y docker git || [ $count -eq $max_retries ]; do
    echo "Wait for yum lock..."
    sleep 10
    ((count++))
done

# ── 2. Docker service ─────────────────────────────────────────────────────
echo "Starting Docker..."
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# ── 3. Docker Compose (with fallback version) ──────────────────────────────
echo "Installing Docker Compose..."
COMPOSE_VERSION=$(curl -fsSL https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | sed 's/.*"tag_name": *"\(.*\)".*/\1/' || echo "v2.24.5")
curl -fsSL "https://github.com/docker/compose/releases/download/$COMPOSE_VERSION/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# ── 4. Clone repository ──────────────────────────────────────────────────
echo "Cloning repository: ${git_repo_url}"
rm -rf /opt/monitoring-repo
git clone ${git_repo_url} /opt/monitoring-repo
chown -R ec2-user:ec2-user /opt/monitoring-repo

MONITORING_DIR=/opt/monitoring-repo/monitoring

# ── 5. Write .env file ────────────────────────────────────────────────────
echo "Writing .env file..."
cat > "$MONITORING_DIR/.env" <<ENVEOF
APP_SERVER_IP=${app_server_ip}
GRAFANA_ADMIN_PASSWORD=${grafana_admin_password}
ENVEOF

chown ec2-user:ec2-user "$MONITORING_DIR/.env"
chmod 600 "$MONITORING_DIR/.env"

# ── 6. Start the monitoring stack ─────────────────────────────────────────
echo "Starting Docker Compose stack..."
cd "$MONITORING_DIR"
# Run as ec2-user to pick up group permissions
sudo -u ec2-user /usr/local/bin/docker-compose up -d

echo "=== Monitoring stack started at $(date) ==="
echo "  Grafana:      http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3000"
echo "  Prometheus:   http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):9090"
echo "  Alertmanager: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):9093"
