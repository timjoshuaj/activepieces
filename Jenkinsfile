pipeline {
  agent any

  environment {
    BUN_INSTALL = "${HOME}/.bun"
    PATH        = "${BUN_INSTALL}/bin:${PATH}"

    STAGING_URL = 'https://activepieces.staging.officesphere.ai'
    PROD_URL    = 'https://activepieces.app.officesphere.ai'
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  triggers {
    // Poll SCM every 5 minutes; each Jenkins job will be configured
    // with its own branch (staging vs main).
    pollSCM('H/5 * * * *')
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        sh '''
          set -euo pipefail
          pwd
          echo "Workspace: $(pwd)"
          echo "Git branch (from git):"
          git rev-parse --abbrev-ref HEAD || echo "detached HEAD"
        '''
      }
    }

    stage('Determine target environment from branch') {
      steps {
        script {
          def branch = sh(
            script: "git rev-parse --abbrev-ref HEAD",
            returnStdout: true
          ).trim()

          echo "Git branch detected: ${branch}"

          if (branch == 'main') {
            env.DEPLOY_ENV = 'prod'
          } else {
            // Default everything else (staging branch, feature branches, etc.) to staging
            env.DEPLOY_ENV = 'staging'
          }

          echo "Using DEPLOY_ENV=${env.DEPLOY_ENV}"
        }
      }
    }

    stage('Install dependencies (bun)') {
      steps {
        sh '''
          set -euo pipefail

          echo "Bun version:"
          bun --version

          echo "Setting up Python distutils shim for node-gyp..."
          mkdir -p .jenkins-python-hacks/distutils

          cat > .jenkins-python-hacks/distutils/__init__.py << 'EOF'
import importlib, types
_real_distutils = importlib.import_module('setuptools._distutils')
globals().update({k: v for k, v in _real_distutils.__dict__.items() if not k.startswith('_')})
EOF

          cat > .jenkins-python-hacks/sitecustomize.py << 'EOF'
import importlib, sys
if 'distutils' not in sys.modules:
    import setuptools._distutils as distutils
    sys.modules['distutils'] = distutils
EOF

          export PYTHONPATH="$(pwd)/.jenkins-python-hacks:${PYTHONPATH:-}"
          export PYTHON=/usr/bin/python3

          echo "Python version used by node-gyp:"
          python3 --version
          python3 - << 'EOF'
import distutils, distutils.version
print("distutils shim OK:", distutils.version.StrictVersion("1.0"))
EOF

          echo "Installing dependencies with bun..."
          bun install
        '''
      }
    }

    stage('Unit / integration tests') {
      steps {
        sh '''
          set -euo pipefail
          echo "Running focused unit tests (engine helpers only)..."
          echo "You can expand this list later as CI env is hardened."
          bun test packages/engine/test/helper
        '''
      }
    }

    stage('Vulnerability scan (Trivy filesystem)') {
      steps {
        sh '''
          set -euo pipefail
          echo "Running Trivy filesystem scan..."

          if ! command -v trivy >/dev/null 2>&1; then
            echo "ERROR: trivy is not installed on this Jenkins agent."
            exit 1
          fi

          trivy fs \
            --exit-code 1 \
            --severity HIGH,CRITICAL \
            --ignore-unfixed \
            --scanners vuln \
            --no-progress \
            .
        '''
      }
    }

    stage('Pre-deploy backup (prod only)') {
      when {
        expression { env.DEPLOY_ENV == 'prod' }
      }
      steps {
        sh '''
          set -euo pipefail
          echo "Running pre-deploy Postgres backup on prod-db..."
          ssh prod-db "sudo /usr/local/sbin/pgbackup-activepieces.sh"
        '''
      }
    }

    stage('Deploy to target environment') {
      steps {
        script {
          if (env.DEPLOY_ENV == 'staging') {
            sh '''
              set -euo pipefail
              echo "Deploying to STAGING via staging-app..."
              ssh staging-app "cd /opt/activepieces && ./scripts/deploy-staging.sh"
            '''
          } else if (env.DEPLOY_ENV == 'prod') {
            sh '''
              set -euo pipefail
              echo "Deploying to PROD via prod-app..."
              ssh prod-app "cd /opt/activepieces && ./scripts/deploy-prod.sh"
            '''
          } else {
            error "Unknown DEPLOY_ENV: ${env.DEPLOY_ENV}"
          }
        }
      }
    }

    stage('Post-deploy health check') {
      steps {
        script {
          def url = (env.DEPLOY_ENV == 'staging') ? env.STAGING_URL : env.PROD_URL

          sh """
            set -euo pipefail
            echo "Running post-deploy health check against ${url}..."
            curl -k --fail --max-time 10 -I "${url}" | head -n 10
          """
        }
      }
    }

    stage('Rollback if unhealthy (prod only)') {
      when {
        expression { env.DEPLOY_ENV == 'prod' }
      }
      steps {
        script {
          // Re-check health but don't immediately fail the shell before rollback
          def status = sh(
            script: '''
              set +e
              curl -k --max-time 10 -I "https://activepieces.app.officesphere.ai" >/dev/null 2>&1
              echo $?
            ''',
            returnStdout: true
          ).trim()

          if (status != '0') {
            echo "Post-deploy health check FAILED, invoking rollback on prod..."
            sh '''
              set -euo pipefail
              ssh prod-app "cd /opt/activepieces && ./scripts/rollback-prod.sh"
            '''
            error("Prod deployment rolled back due to failed health check.")
          } else {
            echo "Prod health OK, no rollback required."
          }
        }
      }
    }
  }

  post {
    success {
      script {
        def envLabel = env.DEPLOY_ENV ?: 'unknown'
        echo "✅ Activepieces ${envLabel} pipeline completed successfully."

        if (env.SLACK_WEBHOOK_URL) {
          sh """
            set -euo pipefail
            curl -X POST -H 'Content-type: application/json' \
              --data '{ "text": "✅ Activepieces ${envLabel} deployment succeeded: ${env.JOB_NAME} #${env.BUILD_NUMBER}" }' \
              "${env.SLACK_WEBHOOK_URL}"
          """
        } else {
          echo "SLACK_WEBHOOK_URL not set; skipping Slack notification."
        }
      }
    }

    failure {
      script {
        def envLabel = env.DEPLOY_ENV ?: 'unknown'
        echo "❌ Activepieces ${envLabel} pipeline FAILED – check stages above."

        if (env.SLACK_WEBHOOK_URL) {
          sh """
            set -euo pipefail
            curl -X POST -H 'Content-type: application/json' \
              --data '{ "text": "❌ Activepieces ${envLabel} deployment FAILED: ${env.JOB_NAME} #${env.BUILD_NUMBER}" }' \
              "${env.SLACK_WEBHOOK_URL}"
          """
        } else {
          echo "SLACK_WEBHOOK_URL not set; skipping Slack notification."
        }
      }
    }
  }
}

