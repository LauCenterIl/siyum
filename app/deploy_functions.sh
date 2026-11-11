#!/bin/bash
# Deploys the Cloud Functions (counters, referrals, reminders, unsubscribe) from Google Cloud Shell.
# Requires the Blaze plan. Run from Cloud Shell:  bash ~/s/app/deploy_functions.sh
set -e
PROJECT=atgar-hasiyum
DIR="$(cd "$(dirname "$0")" && pwd)"
gcloud config set project $PROJECT -q >/dev/null

echo "==> enabling APIs (takes a minute the first time)"
gcloud services enable cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com eventarc.googleapis.com pubsub.googleapis.com cloudscheduler.googleapis.com \
  secretmanager.googleapis.com firestore.googleapis.com --project $PROJECT -q

echo "==> creating placeholder secrets (message providers are connected later)"
for S in RESEND_API_KEY WA_TOKEN TWILIO_SID TWILIO_TOKEN; do
  if ! gcloud secrets describe $S --project $PROJECT >/dev/null 2>&1; then
    printf none | gcloud secrets create $S --data-file=- --replication-policy=automatic --project $PROJECT -q
  fi
done

echo "==> installing function dependencies"
cd "$DIR/firebase/functions" && npm install --no-audit --no-fund --silent && cd ..

echo "==> deploying functions"
deploy() { firebase deploy --only functions --project $PROJECT --non-interactive --force; }
if ! deploy; then echo "==> first deploy often fails while Google sets up permissions - retrying in 60s"; sleep 60; deploy; fi

echo "==> turning on the unsubscribe link and redeploying the site"
python3 - <<'PY'
import json
p="firebase.json"; c=json.load(open(p))
c["hosting"]["rewrites"]=[{"source":"/unsubscribe","function":{"functionId":"unsubscribe","region":"europe-west1"}}]
json.dump(c,open(p,"w"),indent=2,ensure_ascii=False)
PY
python3 "$DIR/deploy_rest.py"
echo "FUNCTIONS_DONE"
