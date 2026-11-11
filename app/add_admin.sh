#!/bin/bash
# Adds an admin (by Google account email) who can open /admin.  Usage: bash app/add_admin.sh name@example.com
set -e
EMAIL="$1"; [ -z "$EMAIL" ] && { echo "usage: add_admin.sh email"; exit 1; }
curl -sS -X PATCH -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "x-goog-user-project: atgar-hasiyum" \
  -H "Content-Type: application/json" \
  "https://firestore.googleapis.com/v1/projects/atgar-hasiyum/databases/(default)/documents/admins/${EMAIL}" \
  -d '{"fields":{"role":{"stringValue":"admin"}}}' | grep -q '"name"' && echo "ADMIN_ADDED $EMAIL"
