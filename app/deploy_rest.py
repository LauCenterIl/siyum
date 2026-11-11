#!/usr/bin/env python3
"""Deploys the Siyum Challenge site (Firebase Hosting) and Firestore security rules
using the Cloud Shell user's gcloud credentials - no `firebase login` needed.
Run from Google Cloud Shell:  python3 app/deploy_rest.py"""
import gzip, hashlib, json, os, subprocess, sys, urllib.request, urllib.error

PROJECT = "atgar-hasiyum"
SITE = PROJECT
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "firebase")
PUBLIC = os.path.join(ROOT, "public")
TOKEN = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()

def call(method, url, body=None, raw=None, ctype="application/json", ok=(200,)):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + TOKEN, "x-goog-user-project": PROJECT, "Content-Type": ctype})
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read().decode() or "{}"
            return r.status, json.loads(txt) if txt.strip().startswith("{") else {}
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        return e.code, (json.loads(txt) if txt.strip().startswith("{") else {"error": txt})

def step(msg): print("==> " + msg, flush=True)

# 0. make sure the APIs are on
step("enabling APIs")
subprocess.run(["gcloud", "services", "enable", "firebasehosting.googleapis.com",
                "firebaserules.googleapis.com", "firestore.googleapis.com", "--project", PROJECT, "-q"], check=False)

# 1. security rules
step("deploying Firestore security rules")
src = open(os.path.join(ROOT, "firestore.rules"), encoding="utf-8").read()
s, rs = call("POST", f"https://firebaserules.googleapis.com/v1/projects/{PROJECT}/rulesets",
             {"source": {"files": [{"name": "firestore.rules", "content": src}]}})
if s != 200: sys.exit(f"rules compile failed: {rs}")
rel = f"projects/{PROJECT}/releases/cloud.firestore"
s, r = call("POST", f"https://firebaserules.googleapis.com/v1/projects/{PROJECT}/releases",
            {"name": rel, "rulesetName": rs["name"]})
if s == 409:
    s, r = call("PATCH", f"https://firebaserules.googleapis.com/v1/{rel}",
                {"release": {"name": rel, "rulesetName": rs["name"]}})
if s != 200: sys.exit(f"rules release failed: {r}")
print("    rules live:", rs["name"])

# 2. hosting site
step("preparing hosting site")
s, r = call("GET", f"https://firebasehosting.googleapis.com/v1beta1/projects/{PROJECT}/sites/{SITE}")
if s == 404:
    s, r = call("POST", f"https://firebasehosting.googleapis.com/v1beta1/projects/{PROJECT}/sites?siteId={SITE}", {})
    if s != 200: sys.exit(f"site create failed: {r}")

cfg = json.load(open(os.path.join(ROOT, "firebase.json")))["hosting"]
vconf = {"cleanUrls": True, "headers": [{"glob": h["source"], "headers": {x["key"]: x["value"] for x in h["headers"]}} for h in cfg.get("headers", [])]}
# 2nd-gen functions run on Cloud Run: the service id is the lowercase function name
rewrites = [{"glob": rw["source"], "run": {"serviceId": rw["function"]["functionId"].lower(), "region": rw["function"].get("region", "us-central1")}}
            for rw in cfg.get("rewrites", []) if "function" in rw]
if rewrites: vconf["rewrites"] = rewrites
s, ver = call("POST", f"https://firebasehosting.googleapis.com/v1beta1/sites/{SITE}/versions", {"config": vconf})
if s != 200: sys.exit(f"version create failed: {ver}")
vname = ver["name"]

files, blobs = {}, {}
for d, _, fs in os.walk(PUBLIC):
    for f in fs:
        if f.startswith("."): continue
        p = os.path.join(d, f)
        gz = gzip.compress(open(p, "rb").read(), mtime=0)
        h = hashlib.sha256(gz).hexdigest()
        files["/" + os.path.relpath(p, PUBLIC).replace(os.sep, "/")] = h
        blobs[h] = gz
step(f"uploading {len(files)} files")
s, pop = call("POST", f"https://firebasehosting.googleapis.com/v1beta1/{vname}:populateFiles", {"files": files})
if s != 200: sys.exit(f"populate failed: {pop}")
for h in pop.get("uploadRequiredHashes", []):
    s, r = call("POST", pop["uploadUrl"] + "/" + h, raw=blobs[h], ctype="application/octet-stream")
    if s != 200: sys.exit(f"upload failed for {h}: {r}")

step("publishing")
s, r = call("PATCH", f"https://firebasehosting.googleapis.com/v1beta1/{vname}?update_mask=status", {"status": "FINALIZED"})
if s != 200: sys.exit(f"finalize failed: {r}")
s, r = call("POST", f"https://firebasehosting.googleapis.com/v1beta1/sites/{SITE}/releases?versionName={vname}", {})
if s != 200: sys.exit(f"release failed: {r}")
print(f"\nDEPLOY_DONE  https://{SITE}.web.app")
