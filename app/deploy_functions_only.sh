#!/bin/bash
# Redeploys only the Cloud Functions (after changing .env or a secret). Run from Cloud Shell:
#   cd ~/s && git pull -q && bash app/deploy_functions_only.sh
set -e
PROJECT=atgar-hasiyum
DIR="$(cd "$(dirname "$0")" && pwd)"
gcloud config set project $PROJECT -q >/dev/null
cd "$DIR/firebase/functions" && npm install --no-audit --no-fund --silent && cd ..
firebase deploy --only functions --project $PROJECT --non-interactive --force
echo "FUNCTIONS_DONE"
