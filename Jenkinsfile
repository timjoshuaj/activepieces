pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  environment {
    // Staging deployment target
    STAGING_HOST          = '10.10.0.20'
    STAGING_USER          = 'tjjavelosa'
    STAGING_DEPLOY_SCRIPT = '/opt/activepieces/scripts/deploy-staging.sh'

    // Trivy severity threshold: fail build on CRITICAL vulns
    TRIVY_SEVERITY        = 'CRITICAL'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        sh '''
          echo "Workspace: $(pwd)"
          echo "Git branch:"
          git rev-parse --abbrev-ref HEAD || true
        '''
      }
    }

    stage('Install dependencies (bun)') {
      steps {
        sh '''
          set -euo pipefail

          echo "Bun version:"
          bun --version || { echo "bun not found in PATH"; exit 1; }

          echo "Setting up Python distutils shim for node-gyp..."
          mkdir -p .jenkins-python-hacks/distutils

          cat > .jenkins-python-hacks/distutils/__init__.py << 'PY'
from .version import StrictVersion
PY

          cat > .jenkins-python-hacks/distutils/version.py << 'PY'
import re

class StrictVersion:
    def __init__(self, v):
        self.version = str(v)
        self._parts = tuple(int(x) for x in re.findall(r"\\d+", self.version))

    def _cmp(self, other):
        if not isinstance(other, StrictVersion):
            other = StrictVersion(other)
        return (self._parts > other._parts) - (self._parts < other._parts)

    def __lt__(self, other): return self._cmp(other) < 0
    def __le__(self, other): return self._cmp(other) <= 0
    def __eq__(self, other): return self._cmp(other) == 0
    def __ne__(self, other): return self._cmp(other) != 0
    def __gt__(self, other): return self._cmp(other) > 0
    def __ge__(self, other): return self._cmp(other) >= 0

    def __repr__(self):
        return f"StrictVersion({self.version!r})"
PY

          # Safely set PYTHONPATH even if it was previously unset
          export PYTHONPATH="$(pwd)/.jenkins-python-hacks:${PYTHONPATH:-}"
          export PYTHON="/usr/bin/python3"

          echo "Python version used by node-gyp:"
          python3 --version || true
          python3 -c "import distutils, distutils.version; print('distutils shim OK:', distutils.version.StrictVersion('1.0'))"

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

          # Only run tests that do NOT require DB/Redis/dev pieces
          bun test packages/engine/test/helper
        '''
      }
    }

    stage('Vulnerability scan (Trivy filesystem)') {
      steps {
        sh '''
          set -euo pipefail

          echo "Running Trivy filesystem scan..."
          trivy fs \
            --exit-code 1 \
            --severity "$TRIVY_SEVERITY" \
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
            set -euo pipefail

            echo "Deploying to staging via SSH..."
            ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$STAGING_USER@$STAGING_HOST" \
              "$STAGING_DEPLOY_SCRIPT"
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
