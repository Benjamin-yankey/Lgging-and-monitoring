#!/bin/bash
# monitoring-setup.sh  –  Terraform templatefile
#
# Template variables injected by Terraform:
#   ${app_server_ip}        – private IP of the app EC2 instance
#   ${grafana_admin_password} – Grafana admin password (from TF variable)
#   ${git_repo_url}         – HTTPS URL of this git repository
#
# All shell variables use single $ in this script

set -e
exec > >(tee /var/log/monitoring-setup.log) 2>&1
echo "=== Starting monitoring server setup at $(date) ==="

# ── 1. System packages ────────────────────────────────────────────────────
yum update -y
yum install -y docker git

# ── 2. Docker service ─────────────────────────────────────────────────────
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# ── 3. Docker Compose ─────────────────────────────────────────────────────
COMPOSE_VERSION=$(curl -fsSL https://api.github.com/repos/docker/compose/releases/latest \
  | grep '"tag_name"' | sed 's/.*"tag_name": *"\(.*\)".*/\1/')
curl -fsSL "https://github.com/docker/compose/releases/download/$COMPOSE_VERSION/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# ── 4. Clone repository (gets dashboard JSON and config templates) ─────────
git clone ${git_repo_url} /opt/monitoring-repo
chown -R ec2-user:ec2-user /opt/monitoring-repo

MONITORING_DIR=/opt/monitoring-repo/monitoring

# ── 5. Write .env file (runtime variables for docker-compose) ─────────────
#    IMPORTANT: do not use # or $ in the password value.
cat > "$MONITORING_DIR/.env" <<'ENVEOF'
APP_SERVER_IP=${app_server_ip}
GRAFANA_ADMIN_PASSWORD=${grafana_admin_password}
ENVEOF

chown ec2-user:ec2-user "$MONITORING_DIR/.env"
chmod 600 "$MONITORING_DIR/.env"

# ── 6. Start the monitoring stack ─────────────────────────────────────────
# Run as ec2-user so volume-mounted files are owned correctly
su -c "cd $MONITORING_DIR && docker-compose up -d" ec2-user

echo "=== Monitoring stack started at $(date) ==="
echo "  Grafana:      http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3000"
echo "  Prometheus:   http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):9090"
echo "  Alertmanager: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):9093"
