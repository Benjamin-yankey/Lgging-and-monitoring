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
chown -R ec2-user:ec2-user /opt/app

# Clone the application repository (replace with your actual repo URL)
# For now, we'll create a startup script that can be triggered by Jenkins or run manually
cat > /opt/app/start-app.sh << 'APPSTART'
#!/bin/bash
# This script is called by Jenkins pipeline to start the application
# It pulls the latest image and runs the container

REGISTRY_CREDS_USR="${1:-}"
REGISTRY_CREDS_PSW="${2:-}"
CONTAINER_NAME="node-app"
DOCKER_IMAGE="cicd-node-app"

# If no credentials provided, try to start existing container or use local build
if [ -z "$REGISTRY_CREDS_USR" ]; then
    echo "No registry credentials provided, checking for existing setup..."
    
    # Check if we can run the app from local code (for testing)
    if [ -f /opt/app/package.json ]; then
        cd /opt/app
        npm install
        PORT=5000 node app.js &
        echo "App started locally on port 5000"
        exit 0
    fi
    
    echo "No app found. Please deploy via Jenkins pipeline or provide credentials."
    exit 1
fi

# Login to registry
echo "$REGISTRY_CREDS_PSW" | docker login -u "$REGISTRY_CREDS_USR" --password-stdin

# Stop and remove existing container
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# Pull and run the latest image
docker pull $REGISTRY_CREDS_USR/$DOCKER_IMAGE:latest
docker run -d --name $CONTAINER_NAME -p 5000:5000 $REGISTRY_CREDS_USR/$DOCKER_IMAGE:latest

echo "Application deployed successfully on port 5000"
APPSTART

chmod +x /opt/app/start-app.sh
chown ec2-user:ec2-user /opt/app/start-app.sh

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