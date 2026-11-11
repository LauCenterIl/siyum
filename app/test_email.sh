#!/bin/bash
# Email test. Run from Cloud Shell:  bash ~/s/app/test_email.sh you@example.com
# 1) sends one test email straight through Resend (checks the key and the domain)
# 2) if that address is registered on the site with a commitment, sends it a real reminder now
set -e
PROJECT=atgar-hasiyum; TO="$1"
[ -z "$TO" ] && { echo "usage: bash test_email.sh you@example.com"; exit 1; }
KEY=$(gcloud secrets versions access latest --secret=RESEND_API_KEY --project $PROJECT)
echo "==> 1. direct test email to $TO"
curl -sS https://api.resend.com/emails -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"from\":\"אתגר הסיום <reminders@siyums.com>\",\"to\":[\"$TO\"],\"subject\":\"בדיקה - אתגר הסיום\",\"html\":\"<div dir=rtl style='font-family:Arial'><h2>זה עובד!</h2><p>מיילים מאתר אתגר הסיום יוצאים כמו שצריך.</p><p><a href='https://siyums.com'>siyums.com</a></p></div>\"}"
echo; unset KEY

echo "==> 2. real reminder (only if $TO is registered on the site)"
TO="$TO" python3 - <<'PY'
import json, os, subprocess, time, urllib.request, urllib.error, datetime
P="atgar-hasiyum"; TO=os.environ["TO"].lower()
T=subprocess.check_output(["gcloud","auth","print-access-token"]).decode().strip()
B=f"https://firestore.googleapis.com/v1/projects/{P}/databases/(default)/documents"
def call(m,u,b=None):
    r=urllib.request.Request(u,data=json.dumps(b).encode() if b is not None else None,method=m,
      headers={"Authorization":"Bearer "+T,"Content-Type":"application/json","x-goog-user-project":P})
    try:
        with urllib.request.urlopen(r) as x: return json.loads(x.read() or b"{}")
    except urllib.error.HTTPError as e: return {"error":e.read().decode()}
q={"structuredQuery":{"from":[{"collectionId":"users"}],"where":{"fieldFilter":{"field":{"fieldPath":"email"},"op":"EQUAL","value":{"stringValue":TO}}},"limit":1}}
res=[r for r in call("POST",B+":runQuery",q) if "document" in r]
if not res: print("    this address is not registered on the site yet - skipping (part 1 is enough)"); raise SystemExit
doc=res[0]["document"]; name=doc["name"]; f=doc["fields"]
if "rem" not in f: print("    registered, but no reminder settings yet (finish a commitment on the site first)"); raise SystemExit
now=datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
call("PATCH",f"https://firestore.googleapis.com/v1/{name}?updateMask.fieldPaths=nextAt&updateMask.fieldPaths=reminderActive",
     {"fields":{"nextAt":{"timestampValue":now},"reminderActive":{"booleanValue":True}}})
subprocess.run(["gcloud","scheduler","jobs","run","firebase-schedule-sendReminders-europe-west1","--location","europe-west1","--project",P,"-q"],check=False)
print("    reminder run started, waiting 40s ..."); time.sleep(40)
f=call("GET",f"https://firestore.googleapis.com/v1/{name}").get("fields",{})
print("    lastSentAt:", f.get("lastSentAt",{}).get("timestampValue","-"))
print("    lastError :", f.get("lastError",{}).get("stringValue","none"))
PY
echo "EMAIL_TEST_DONE"
