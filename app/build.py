#!/usr/bin/env python3
"""Builds two outputs from src/:
   1. dist/preview.html  - single-file demo (browser-only storage) for the Claude artifact
   2. firebase/public/   - the live site (Firebase Auth + Firestore)"""
import base64, os, re, shutil
ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src"); PUB = os.path.join(ROOT, "firebase", "public"); DIST = os.path.join(ROOT, "dist")
A = os.path.join(PUB, "assets")
rd = lambda p: open(p, encoding="utf-8").read()
def datauri(path, mime):
    return f"data:{mime};base64," + base64.b64encode(open(path, "rb").read()).decode()

page = rd(os.path.join(SRC, "page.html"))
split = page.index('<svg width="0" height="0"')
head_part, body_part = page[:split], page[split:]
head_part = head_part.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
i18n, app = rd(os.path.join(SRC, "i18n.js")), rd(os.path.join(SRC, "app.js"))
lau = "data:image/webp;base64," + rd(os.path.join(SRC, "lau-logo.b64")).strip()

# ---------- 1. preview (single file) ----------
os.makedirs(DIST, exist_ok=True)
assets_inline = {
    "LOGO_COMPACT": datauri(os.path.join(A, "logo-horizontal-compact.svg"), "image/svg+xml"),
    "LOGO_STACKED": datauri(os.path.join(A, "logo-stacked.svg"), "image/svg+xml"),
    "LOGO_HORIZ": datauri(os.path.join(A, "logo-horizontal.svg"), "image/svg+xml"),
    "LAU_LOGO": lau,
}
pv = '<meta name="claude:viewport-fit-sides" content="cover">\n' + head_part + body_part
for k, v in assets_inline.items(): pv = pv.replace("{{%s}}" % k, v)
pv = pv.replace('href="privacy.html"', 'href="#home"')
pv += "<script>window.ATGAR_ASSETS=" + str({
    "emblem": datauri(os.path.join(A, "emblem.svg"), "image/svg+xml"),
    "emblemLight": datauri(os.path.join(A, "emblem-light.svg"), "image/svg+xml")}).replace("'", '"') + ";</script>\n"
pv += "<script>\n" + i18n + "\n</script>\n<script>\n" + rd(os.path.join(SRC, "store-demo.js")) + "\n</script>\n<script>\n" + app + "\n</script>\n"
open(os.path.join(DIST, "preview.html"), "w", encoding="utf-8").write(pv)

# ---------- 2. live site ----------
os.makedirs(A, exist_ok=True)
lau_path = os.path.join(A, "lau-center-logo.webp")
open(lau_path, "wb").write(base64.b64decode(rd(os.path.join(SRC, "lau-logo.b64")).strip()))
assets_live = {"LOGO_COMPACT": "/assets/logo-horizontal-compact.svg", "LOGO_STACKED": "/assets/logo-stacked.svg",
               "LOGO_HORIZ": "/assets/logo-horizontal.svg", "LAU_LOGO": "/assets/lau-center-logo.webp"}
body = body_part
for k, v in assets_live.items(): body = body.replace("{{%s}}" % k, v)
head = head_part.replace("<title>אתגר הסיום</title>", "")
DESC = "הרב הראשי, הרב דוד לאו שליט״א, נשיא ״מרכז לאו״, מזמין אתכם להצטרף לסיום הגדול. בוחרים לימוד, מציבים יעד, ומצטרפים ל-600,000 התחייבויות עד חג השבועות תשפ״ז."
import hashlib
VER = {f: hashlib.sha1(open(os.path.join(SRC, f), "rb").read()).hexdigest()[:8] for f in ["i18n.js", "app.js", "store-firebase.js"]}
index = f"""<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>אתגר הסיום - מהסיום שלך ועד סיום הש״ס</title>
<meta name="description" content="{DESC}">
<meta name="theme-color" content="#16100b">
<link rel="icon" href="/assets/favicon-32.png" sizes="32x32">
<link rel="icon" href="/assets/emblem.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:title" content="אתגר הסיום - היו חלק מהסיום הגדול">
<meta property="og:description" content="{DESC}">
<meta property="og:image" content="/assets/og-v2.jpg">
<meta property="og:locale" content="he_IL">
<meta name="twitter:card" content="summary_large_image">
{head}
</head>
<body>
{body}
<script src="/config.js"></script>
<script>window.ATGAR_ASSETS={{emblem:"/assets/emblem.svg",emblemLight:"/assets/emblem-light.svg"}};</script>
<script src="/i18n.js?v={VER['i18n.js']}"></script>
<script type="module" src="/store-firebase.js?v={VER['store-firebase.js']}"></script>
<script src="/app.js?v={VER['app.js']}" defer></script>
</body>
</html>
"""
open(os.path.join(PUB, "index.html"), "w", encoding="utf-8").write(index)
for f in ["i18n.js", "app.js", "store-firebase.js"]:
    shutil.copy(os.path.join(SRC, f), os.path.join(PUB, f))
for f in ["admin.html", "admin.js", "privacy.html", "404.html"]:
    p = os.path.join(SRC, f)
    if os.path.exists(p): shutil.copy(p, os.path.join(PUB, f))
if not os.path.exists(os.path.join(PUB, "config.js")):
    shutil.copy(os.path.join(SRC, "config.example.js"), os.path.join(PUB, "config.js"))
print("built", os.path.join(DIST, "preview.html"), len(pv), "bytes; live site in", PUB)
