pipeline {
    agent any
    
    tools {
        nodejs 'nodejs-20'
    }

    parameters {
        string(name: 'EC2_HOST', description: 'Public IP of the app server EC2 instance (from Terraform output: app_server_public_ip)')
    }

    environment {
        DOCKER_IMAGE = "cicd-node-app"
        DOCKER_TAG = "${BUILD_NUMBER}"
        REGISTRY = "docker.io"
        REGISTRY_CREDS = credentials('registry_creds')
        CONTAINER_NAME = "node-app"
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
                    echo $REGISTRY_CREDS_PSW | docker login -u $REGISTRY_CREDS_USR --password-stdin 2>&1 | grep -v "WARNING"
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
                    sh '''
                        set +x
                        echo "Deploying to EC2..."
                        
                        ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR $SSH_USER@${EC2_HOST} << 'EOF'
                            set +x
                            docker stop ${CONTAINER_NAME} || true
                            docker rm ${CONTAINER_NAME} || true
                            echo "$REGISTRY_CREDS_PSW" | docker login -u "$REGISTRY_CREDS_USR" --password-stdin 2>&1 | grep -v "WARNING" || true
                            docker pull $REGISTRY_CREDS_USR/${DOCKER_IMAGE}:latest
                            docker run -d --name ${CONTAINER_NAME} -p 5000:5000 $REGISTRY_CREDS_USR/${DOCKER_IMAGE}:latest
                            docker ps
                            echo "Deployment complete"
EOF
                    '''
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
