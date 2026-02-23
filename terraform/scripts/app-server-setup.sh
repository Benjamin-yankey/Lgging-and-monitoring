#!/bin/bash
set -e

# Log all output
exec > >(tee /var/log/app-server-setup.log) 2>&1
echo "Starting app server setup at $(date)"

yum update -y
yum install -y docker git

# Start Docker service
systemctl start docker
systemctl enable docker

# Add ec2-user to docker group
usermod -a -G docker ec2-user

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Create application directory
mkdir -p /opt/app
chown ec2-user:ec2-user /opt/app


# Run Node Exporter for Prometheus scraping
docker run -d \
  --name node-exporter \
  --restart=unless-stopped \
  --network="host" \
  --pid="host" \
  -v "/:/host:ro,rslave" \
  prom/node-exporter:latest \
  --path.rootfs=/host \
  --web.listen-address=0.0.0.0:9100

echo "Node Exporter running on port 9100"
echo "App server setup completed at $(date)"