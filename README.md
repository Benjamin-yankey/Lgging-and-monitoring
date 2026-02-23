# Complete CI/CD Pipeline with Jenkins

Automated CI/CD pipeline that provisions AWS infrastructure with Terraform, runs Jenkins in Docker on EC2, and deploys a containerized Node.js application via SSH.

## Architecture

![CI/CD Pipeline Architecture](architecture-diagram.png)

```
Developer  →  GitHub  →  Jenkins (EC2 · Docker)  →  Docker Hub  →  App Server (EC2)

Pipeline stages:
  1. Checkout       – clone repo
  2. Install        – npm ci
  3. Test           – npm test (Jest)
  4. Docker Build   – build & tag image
  5. Push Image     – push to Docker Hub
  6. Deploy         – SSH into app server, pull & run container
```

**AWS resources created by Terraform:**

| Resource | Purpose |
|----------|---------|
| VPC + subnets | Network isolation |
| Security groups | Restrict access to your IP |
| EC2 `t3.micro` | Jenkins server (Docker) |
| EC2 `t3.micro` | Application server |
| Key pair | Auto-generated SSH keys |

## Prerequisites

- **AWS CLI** configured (`aws configure`)
- **Terraform** >= 1.0
- **Docker Hub** account
- **GitHub** repository with this code
- Your public IP — run `curl ifconfig.me`

## Quick Start

### 1. Configure Terraform

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — set allowed_ips, jenkins_admin_password, etc.
```

### 2. Deploy Infrastructure

```bash
terraform init
terraform plan
terraform apply
```

### 3. Access Jenkins

```bash
# Get URLs from Terraform output
terraform output

# SSH in and grab initial admin password
ssh -i <project>-<env>-keypair.pem ec2-user@<JENKINS_IP>
sudo docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Open `http://<JENKINS_IP>:8080`, complete setup, then install these plugins:

| Plugin | Purpose |
|--------|---------|
| Docker Pipeline | Docker build/push in pipeline |
| SSH Agent | SSH deploy step |
| NodeJS | Manage Node.js tool |

### 4. Add Jenkins Credentials

| ID | Kind | Value |
|----|------|-------|
| `registry_creds` | Username + password | Docker Hub username & access token |
| `ec2_ssh` | SSH private key | Contents of the generated `.pem` file |

### 5. Configure NodeJS Tool

**Manage Jenkins → Tools → NodeJS → Add NodeJS**
- Name: `nodejs-20`
- Version: NodeJS 20.x

### 6. Create Pipeline Job

1. **New Item** → `cicd-pipeline` → **Pipeline**
2. **Pipeline**: Pipeline script from SCM → Git
3. **Repository URL**: your GitHub repo
4. **Branch**: `*/main`
5. **Script Path**: `Jenkinsfile`
6. **Build with Parameters** → enter app server IP from `terraform output`

### 7. Verify

```bash
APP_IP=$(terraform output -raw app_server_public_ip)
curl http://$APP_IP:5000/          # HTML page
curl http://$APP_IP:5000/health    # {"status":"healthy"}
curl http://$APP_IP:5000/api/info  # version + deployment time
```

**Successful Deployment:**

![Successful Pipeline](screenshots/successful_pipeline.png)
*Jenkins pipeline completed successfully with all stages passing*

![Application Running](screenshots/successfull_app_deployment_site.png)
*Interactive timesheet application deployed and accessible*

## Project Structure

```
├── app.js                              # Express application
├── app.test.js                         # Jest tests
├── Dockerfile                          # Container image
├── Jenkinsfile                         # Pipeline definition
├── package.json                        # Dependencies
├── SETUP-GUIDE.md                      # Detailed walkthrough
├── RUNBOOK.md                          # Operations & troubleshooting
└── terraform/
    ├── main.tf                         # Root module — wires everything together
    ├── variables.tf                    # Input variables
    ├── outputs.tf                      # IPs, URLs, SSH commands
    ├── terraform.tfvars.example        # Example config (copy to .tfvars)
    ├── modules/
    │   ├── vpc/                        # VPC, subnets, IGW, routes
    │   ├── security/                   # Security groups
    │   ├── keypair/                    # Auto-generated SSH key pair
    │   ├── jenkins/                    # Jenkins EC2 + Docker setup script
    │   └── ec2/                        # App server EC2
    └── scripts/
        └── app-server-setup.sh         # App server user-data (Docker install)
```

## Terraform Variables

Key variables in `terraform.tfvars`:

| Variable | Description | Default |
|----------|-------------|---------|
| `aws_region` | AWS region | `us-east-1` |
| `project_name` | Resource name prefix | `cicd-pipeline` |
| `allowed_ips` | IPs allowed for SSH/Jenkins | `["0.0.0.0/0"]` — **change this** |
| `jenkins_instance_type` | Jenkins EC2 size | `t3.medium` |
| `app_instance_type` | App EC2 size | `t3.small` |
| `jenkins_admin_password` | Jenkins password | — (required) |

## Troubleshooting

### Common Issues & Resolutions

#### 1. Terraform Circular Dependency Error
**Error**: `Error: Cycle: module.security_groups.aws_security_group.app, module.security_groups.aws_security_group.jenkins`

**Cause**: Security groups referencing each other in inline rules

**Fix**: Use separate `aws_security_group_rule` resources instead of inline rules:
```hcl
resource "aws_security_group_rule" "jenkins_to_app" {
  type                     = "egress"
  security_group_id        = aws_security_group.jenkins.id
  source_security_group_id = aws_security_group.app.id
  from_port                = 22
  to_port                  = 22
  protocol                 = "tcp"
}
```

#### 2. Docker-in-Docker Connection Failed
**Error**: `failed to connect to the docker API at tcp://docker:2376: lookup docker on 127.0.0.11:53: no such host`

**Cause**: Jenkins container can't reach Docker-in-Docker (DinD) container

**Fix**: 
1. Ensure both containers are on the same network:
```bash
sudo docker network inspect jenkins
```
2. Restart DinD container if missing:
```bash
sudo docker run --name jenkins-docker --rm --detach \
  --privileged --network jenkins --network-alias docker \
  --env DOCKER_TLS_CERTDIR=/certs \
  --volume jenkins-docker-certs:/certs/client \
  --volume jenkins-data:/var/jenkins_home \
  --publish 2376:2376 \
  docker:dind --storage-driver overlay2
```
3. Verify connection:
```bash
sudo docker exec jenkins-blueocean docker ps
```

#### 3. Java Installation Failed on Amazon Linux 2
**Error**: `Topic corretto21 is not found`

**Cause**: `amazon-linux-extras` doesn't have Java 21

**Fix**: Install directly via yum:
```bash
sudo yum install -y java-21-amazon-corretto-devel
```

#### 4. SSH Agent Plugin Missing
**Error**: `No such DSL method 'sshagent' found`

**Cause**: SSH Agent plugin not installed

**Fix**: Use `withCredentials` instead:
```groovy
withCredentials([sshUserPrivateKey(credentialsId: 'ec2_ssh', keyFileVariable: 'SSH_KEY', usernameVariable: 'SSH_USER')]) {
    sh 'ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SSH_USER@${EC2_HOST} "commands"'
}
```

#### 5. SSH Connection Timeout Between Instances
**Error**: `ssh: connect to host 18.196.224.159 port 22: Connection timed out`

**Cause**: Using public IP for inter-VPC communication

**Fix**: Use private IP instead:
1. Add private IP output in `terraform/outputs.tf`:
```hcl
output "app_server_private_ip" {
  value = module.app_server.private_ip
}
```
2. Use private IP in Jenkins build parameter:
```bash
terraform output app_server_private_ip
# Use this IP (e.g., 10.0.1.x) instead of public IP
```

#### 6. Jenkins Performance Issues
**Problem**: Jenkins UI slow, builds timing out

**Cause**: t3.micro (1 vCPU, 1GB RAM) insufficient for Jenkins + Docker

**Fix**: Upgrade to t3.small or t3.medium:
```hcl
# terraform.tfvars
jenkins_instance_type = "t3.small"  # 2 vCPU, 2GB RAM
```

### Quick Diagnostics

| Problem | Command |
|---------|---------|
| Jenkins container not running | `sudo docker ps -a && sudo docker logs jenkins` |
| Initial password not found | Container still starting — wait 30s, retry |
| `docker: command not found` in pipeline | Docker CLI missing in container — check `/var/log/jenkins-setup.log` |
| SSH deploy: permission denied | Verify `ec2_ssh` credential has full `.pem` contents |
| `npm: command not found` | Ensure NodeJS plugin installed + `nodejs-20` tool configured |
| App not responding after deploy | `ssh ec2-user@<APP_IP> "docker ps && docker logs node-app"` |

See [RUNBOOK.md](RUNBOOK.md) for comprehensive troubleshooting.

## Cleanup

```bash
cd terraform
terraform destroy    # type 'yes'
```

**Estimated cost**: ~$48/month (t3.medium + t3.small in us-east-1). Stop instances when not in use.

## Security Notes

- **Change `allowed_ips`** from `0.0.0.0/0` to your IP before deploying
- SSH keys are auto-generated by Terraform — never commit `.pem` files
- `terraform.tfvars` is in `.gitignore` — never commit secrets
- Rotate Docker Hub tokens and Jenkins passwords regularly

## Documentation

- [SETUP-GUIDE.md](SETUP-GUIDE.md) — Full step-by-step setup walkthrough
- [RUNBOOK.md](RUNBOOK.md) — Day-to-day operations, IP updates, troubleshooting