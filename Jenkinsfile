pipeline {
    agent any
    
    tools {
        nodejs 'nodejs-20'
    }

    parameters {
        string(name: 'EC2_HOST', description: 'Address of the app server EC2 instance. Use Private IP (app_server_private_ip) for reliable inter-VPC deployment to avoid security group/routing issues.')
        string(name: 'MONITORING_IP', description: 'Private IP of the monitoring server (from Terraform output: monitoring_server_private_ip) for OpenTelemetry tracing.')
    }

    environment {
        DOCKER_IMAGE = "cicd-node-app"
        DOCKER_TAG = "${BUILD_NUMBER}"
        REGISTRY = "docker.io"
        REGISTRY_CREDS = credentials('registry_creds')
        CONTAINER_NAME = "node-app"
        EC2_HOST = "${params.EC2_HOST}"
        MONITORING_IP = "${params.MONITORING_IP}"
    }
    
    stages {
        stage('Checkout') {
            steps {
                echo 'Checking out code from repository...'
                checkout scm
            }
        }
        
        stage('Install/Build') {
            steps {
                echo 'Installing dependencies...'
                sh '''
                    npm ci
                '''
            }
        }
        
        stage('Test') {
            steps {
                echo 'Running unit tests...'
                sh '''
                    npm test
                '''
            }
        }
        
        stage('Security Scan - Dependencies') {
            steps {
                echo 'Scanning dependencies for vulnerabilities...'
                sh '''
                    npm audit --audit-level=moderate || true
                    npm audit --json > npm-audit-report.json || true
                '''
                archiveArtifacts artifacts: 'npm-audit-report.json', allowEmptyArchive: true
            }
        }
        
        stage('Docker Build') {
            steps {
                echo 'Building Docker image...'
                sh '''
                    docker build -t ${DOCKER_IMAGE}:${DOCKER_TAG} .
                    docker tag ${DOCKER_IMAGE}:${DOCKER_TAG} ${DOCKER_IMAGE}:latest
                '''
            }
        }
        
        stage('Security Scan - Docker Image') {
            steps {
                echo 'Scanning Docker image for vulnerabilities...'
                sh '''
                    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
                        aquasec/trivy:latest image \
                        --severity HIGH,CRITICAL \
                        --no-progress \
                        --format json \
                        --output trivy-report.json \
                        ${DOCKER_IMAGE}:${DOCKER_TAG} || true
                    
                    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
                        aquasec/trivy:latest image \
                        --severity HIGH,CRITICAL \
                        --no-progress \
                        ${DOCKER_IMAGE}:${DOCKER_TAG} || true
                '''
                archiveArtifacts artifacts: 'trivy-report.json', allowEmptyArchive: true
            }
        }
        
        stage('Push Image') {
            steps {
                echo 'Pushing image to registry...'
                sh '''
                    set +x
                    echo "$REGISTRY_CREDS_PSW" | docker login -u "$REGISTRY_CREDS_USR" --password-stdin 2>&1 | grep -v "WARNING"
                    set -x
                    docker tag ${DOCKER_IMAGE}:${DOCKER_TAG} $REGISTRY_CREDS_USR/${DOCKER_IMAGE}:${DOCKER_TAG}
                    docker tag ${DOCKER_IMAGE}:${DOCKER_TAG} $REGISTRY_CREDS_USR/${DOCKER_IMAGE}:latest
                    docker push $REGISTRY_CREDS_USR/${DOCKER_IMAGE}:${DOCKER_TAG}
                    docker push $REGISTRY_CREDS_USR/${DOCKER_IMAGE}:latest
                '''
            }
        }
        
        stage('Deploy') {
            when {
                expression { params.EC2_HOST?.trim() }
            }
            steps {
                echo 'Deploying to EC2...'
                withCredentials([sshUserPrivateKey(credentialsId: 'ec2_ssh', keyFileVariable: 'SSH_KEY', usernameVariable: 'SSH_USER')]) {
                    sh """
                        set +x
                        echo "Deploying to EC2 host: ${EC2_HOST}..."
                        
                        # Verify the key file exists (path provided by Jenkins)
                        if [ ! -f "${SSH_KEY}" ]; then
                            echo "ERROR: SSH key file not found at ${SSH_KEY}"
                            exit 1
                        fi
                        
                        echo "Connecting as user: ${SSH_USER}"
                        
                        ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR ${SSH_USER}@${EC2_HOST} << EOF
                            set +x
                            echo "Successfully connected to remote host!"
                            docker stop ${CONTAINER_NAME} || true
                            docker rm ${CONTAINER_NAME} || true
                            echo "\$REGISTRY_CREDS_PSW" | docker login -u "\$REGISTRY_CREDS_USR" --password-stdin 2>&1 | grep -v "WARNING" || true
                            docker pull \$REGISTRY_CREDS_USR/${DOCKER_IMAGE}:latest
                            docker run -d --name ${CONTAINER_NAME} \
                                -p 5000:5000 \
                                -e APP_VERSION=${DOCKER_TAG} \
                                -e OTEL_EXPORTER_OTLP_ENDPOINT=http://${MONITORING_IP}:4318/v1/traces \
                                \$REGISTRY_CREDS_USR/${DOCKER_IMAGE}:latest
                            docker ps
                            echo "Deployment complete"
EOF
                    """
                }
            }
        }
    }
    
    post {
        always {
            echo 'Cleaning up local Docker images...'
            sh '''
                docker rmi ${DOCKER_IMAGE}:${DOCKER_TAG} || true
                docker rmi ${DOCKER_IMAGE}:latest || true
                docker rmi $REGISTRY_CREDS_USR/${DOCKER_IMAGE}:${DOCKER_TAG} || true
                docker rmi $REGISTRY_CREDS_USR/${DOCKER_IMAGE}:latest || true
            '''
        }
        success {
            echo 'Pipeline completed successfully!'
        }
        failure {
            echo 'Pipeline failed!'
        }
    }
}
