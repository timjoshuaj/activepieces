pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
  }

  environment {
    // Staging deployment target
    STAGING_HOST = '10.10.0.20'
    STAGING_USER = 'tjjavelosa'
    STAGING_DEPLOY_SCRIPT = '/opt/activepieces/scripts/deploy-staging.sh'

    // Trivy severity threshold: fail build on CRITICAL vulns
    TRIVY_SEVERITY = 'CRITICAL'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        sh '''
          echo "Workspace: $(pwd)"
          echo "Git branch:"
          git rev-parse --abbrev-ref HEAD
        '''
      }
    }

    stage('Install dependencies (bun)') {
      steps {
        sh '''
          echo "Bun version:"
          bun --version || { echo "bun not found in PATH"; exit 1; }
          echo "Installing dependencies with bun..."
          bun install
        '''
      }
    }

    stage('Unit / integration tests') {
      steps {
        sh '''
          echo "Running tests via bun test (replace with Nx/Jest later if desired)..."
          bun test
        '''
      }
    }

    stage('Vulnerability scan (Trivy filesystem)') {
      steps {
        sh '''
          echo "Running Trivy filesystem scan..."
          trivy fs \
            --exit-code 1 \
            --severity ${TRIVY_SEVERITY} \
            --ignore-unfixed \
            --scanners vuln \
            --no-progress \
            .
        '''
      }
    }

    stage('Deploy to staging (SSH → deploy-staging.sh)') {
      steps {
        sshagent(credentials: ['ap-staging-ssh']) {
          sh '''
            echo "Deploying to staging via SSH..."
            ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new ${STAGING_USER}@${STAGING_HOST} \
              "${STAGING_DEPLOY_SCRIPT}"
          '''
        }
      }
    }
  }

  post {
    success {
      echo '✅ Staging CI/CD pipeline completed successfully.'
    }
    failure {
      echo '❌ Staging CI/CD pipeline FAILED – check stages above.'
    }
  }
}
