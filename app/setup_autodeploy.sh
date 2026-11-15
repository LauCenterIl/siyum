#!/bin/bash
# One-time setup: lets GitHub (only the LauCenterIl/siyum repository) publish the site, with no stored password or key.
# Run from Cloud Shell:  cd ~/s && git pull -q && bash app/setup_autodeploy.sh
set -e
PROJECT=atgar-hasiyum
REPO=LauCenterIl/siyum
SA=github-deployer@$PROJECT.iam.gserviceaccount.com
gcloud config set project $PROJECT -q >/dev/null
NUM=$(gcloud projects describe $PROJECT --format='value(projectNumber)')

echo "==> enabling the sign-in APIs"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com --project $PROJECT -q

echo "==> creating the deploy account (it can only publish the site and the security rules)"
gcloud iam service-accounts describe $SA --project $PROJECT >/dev/null 2>&1 || \
  gcloud iam service-accounts create github-deployer --display-name="GitHub auto-deploy (site only)" --project $PROJECT -q
for R in roles/firebasehosting.admin roles/firebaserules.admin roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$SA" --role=$R --condition=None -q >/dev/null && echo "    ok $R"
done

echo "==> trusting GitHub Actions from $REPO only"
gcloud iam workload-identity-pools describe github --location=global --project $PROJECT >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create github --location=global --display-name="GitHub" --project $PROJECT -q
gcloud iam workload-identity-pools providers describe github-repo --location=global --workload-identity-pool=github --project $PROJECT >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc github-repo --location=global --workload-identity-pool=github \
    --display-name="siyum repo" --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='$REPO'" --project $PROJECT -q
gcloud iam service-accounts add-iam-policy-binding $SA --project $PROJECT -q >/dev/null \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUM/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
echo "    ok"

echo "==> publishing the current site once from here"
python3 "$(dirname "$0")/deploy_rest.py"
echo "AUTODEPLOY_READY"
