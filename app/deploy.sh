#!/bin/bash
# Deploys the Siyum Challenge site from Google Cloud Shell.
# Usage: bash app/deploy.sh            -> site + database rules
#        bash app/deploy.sh functions  -> also Cloud Functions (needs Blaze plan)
set -e
cd "$(dirname "$0")/firebase"
PROJECT=atgar-hasiyum
if [ "$1" = "functions" ]; then
  (cd functions && npm install --no-audit --no-fund --silent)
  firebase deploy --only hosting,firestore,functions --project $PROJECT --non-interactive
else
  firebase deploy --only hosting,firestore:rules --project $PROJECT --non-interactive
fi
echo "DEPLOY_DONE"
