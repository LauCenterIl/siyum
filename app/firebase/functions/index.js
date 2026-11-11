/* אתגר הסיום - Cloud Functions
   - onUserCreated:        referral code + unsubscribe token, participant counter
   - onUserWritten:        (re)schedules the next reminder when settings change
   - onCommitmentCreated:  global / track / subject / community counters, referral credit
   - onCommitmentUpdated:  completed counter
   - sendReminders:        every 15 minutes, sends due reminders (WhatsApp / SMS / email)
   - unsubscribe:          one-click removal link used in every message */
"use strict";
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const { setGlobalOptions, logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { nextReminder } = require("./schedule");
const { buildReminder } = require("./messages");
const { sendEmail, sendWhatsApp, sendSms } = require("./providers");

admin.initializeApp();
const db = admin.firestore();
const FV = admin.firestore.FieldValue;
const REGION = "europe-west1";
setGlobalOptions({ region: REGION, maxInstances: 10 });

const SITE_URL = defineString("SITE_URL");
const MAIL_FROM = defineString("MAIL_FROM", { default: "" });
const WA_PHONE_ID = defineString("WA_PHONE_ID", { default: "" });
const WA_TEMPLATE = defineString("WA_TEMPLATE", { default: "atgar_hasiyum_reminder" });
const WA_TEMPLATE_EN = defineString("WA_TEMPLATE_EN", { default: "" });
const WA_LANG = defineString("WA_LANG", { default: "he" });
const SMS_FROM = defineString("SMS_FROM", { default: "" });
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const WA_TOKEN = defineSecret("WA_TOKEN");
const TWILIO_SID = defineSecret("TWILIO_SID");
const TWILIO_TOKEN = defineSecret("TWILIO_TOKEN");
const SECRETS = [RESEND_API_KEY, WA_TOKEN, TWILIO_SID, TWILIO_TOKEN];
const MAX_COMMITMENTS_COUNTED = 12; // per person, protects the public counters from abuse

const randCode = n => crypto.randomBytes(8).toString("base64").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, n);
function unsubLink(uid, token) {
  return `${SITE_URL.value().replace(/\/$/, "")}/unsubscribe?u=${encodeURIComponent(uid)}&t=${encodeURIComponent(token)}`;
}
function remKey(d) { return d ? JSON.stringify([d.rem || null, d.reminderActive !== false, !!d.unsubscribed]) : ""; }

/* ---------- user created ---------- */
exports.onUserCreated = onDocumentCreated("users/{uid}", async (event) => {
  const uid = event.params.uid;
  let code;
  for (let i = 0; i < 6; i++) {
    const c = randCode(6);
    try { await db.doc(`codes/${c}`).create({ uid, at: FV.serverTimestamp() }); code = c; break; }
    catch (e) { /* collision, try again */ }
  }
  await event.data.ref.set({
    code: code || null, invitesCount: 0, unsubToken: randCode(24), sentCount: 0, commitCount: 0,
    createdAt: FV.serverTimestamp()
  }, { merge: true });
  await db.doc("stats/global").set({ participants: FV.increment(1), updatedAt: FV.serverTimestamp() }, { merge: true });
});

/* ---------- schedule the next reminder when settings change ---------- */
exports.onUserWritten = onDocumentWritten("users/{uid}", async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after) return;
  if (remKey(before) === remKey(after) && after.nextAt !== undefined) return;
  const active = after.reminderActive !== false && !after.unsubscribed && after.rem;
  const next = active ? nextReminder(after.rem, new Date()) : null;
  await event.data.after.ref.set({ nextAt: next ? admin.firestore.Timestamp.fromDate(next) : null }, { merge: true });
});

/* ---------- new commitment: counters + referral credit ---------- */
exports.onCommitmentCreated = onDocumentCreated("users/{uid}/commitments/{cid}", async (event) => {
  const uid = event.params.uid;
  const c = event.data.data();
  const userRef = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const us = await tx.get(userRef);
    const u = us.exists ? us.data() : {};
    const count = (u.commitCount || 0) + 1;
    tx.set(userRef, { commitCount: count }, { merge: true });
    if (count > MAX_COMMITMENTS_COUNTED) return;

    const sector = (u.profile && u.profile.sector) || "unknown";
    const upd = {
      commitments: FV.increment(1),
      [`byTrack.${c.track}`]: FV.increment(1),
      [`bySubject.${c.subject}`]: FV.increment(1),
      updatedAt: FV.serverTimestamp()
    };
    if (count === 1) upd[`bySector.${sector}`] = FV.increment(1);
    if (count === 1) upd.activeParticipants = FV.increment(1);
    tx.set(db.doc("stats/global"), upd, { merge: true });

    const key = u.profile && u.profile.communityKey;
    if (key) {
      tx.set(db.doc(`communities/${key.replace(/\//g, "-")}`), {
        name: u.profile.community || "", city: u.profile.city || "",
        commitments: FV.increment(1), updatedAt: FV.serverTimestamp(),
        ...(count === 1 ? { participants: FV.increment(1) } : {})
      }, { merge: true });
    }
  });

  // Referral: credit the inviter once, when the invitee makes a first commitment.
  const us = await userRef.get(); const u = us.data() || {};
  if (u.ref && !u.refCredited) {
    const codeDoc = await db.doc(`codes/${String(u.ref).toLowerCase()}`).get();
    const inviter = codeDoc.exists ? codeDoc.data().uid : null;
    await userRef.set({ refCredited: true }, { merge: true });
    if (inviter && inviter !== uid) {
      await db.doc(`users/${inviter}`).set({ invitesCount: FV.increment(1) }, { merge: true });
      await db.doc("stats/global").set({ referredJoins: FV.increment(1) }, { merge: true });
    }
  }
});

/* ---------- completion counter ---------- */
exports.onCommitmentUpdated = onDocumentUpdated("users/{uid}/commitments/{cid}", async (event) => {
  const b = event.data.before.data(), a = event.data.after.data();
  const wasDone = (b.done || 0) >= b.n, isDone = (a.done || 0) >= a.n;
  if (wasDone === isDone) return;
  await db.doc("stats/global").set({ completed: FV.increment(isDone ? 1 : -1), updatedAt: FV.serverTimestamp() }, { merge: true });
  if (isDone) await event.data.after.ref.set({ completedAt: FV.serverTimestamp() }, { merge: true }).catch(() => {});
});

/* ---------- reminders ---------- */
async function sendOne(env, uid, u) {
  const cs = await db.collection(`users/${uid}/commitments`).get();
  const list = cs.docs.map(d => ({ id: d.id, ...d.data() }));
  const unsubUrl = unsubLink(uid, u.unsubToken || "");
  const msg = buildReminder(u, list, { siteUrl: env.SITE_URL, unsubUrl, seq: u.sentCount || 0 });
  if (!msg) return "nothing";                         // everything completed
  const ch = (u.rem && u.rem.ch) || "mail";
  const phone = u.profile && u.profile.phone;
  try {
    if (ch === "wa") await sendWhatsApp(env, { to: phone, params: msg.params, lang: msg.lang });
    else if (ch === "sms") await sendSms(env, { to: phone, text: msg.smsText });
    else await sendEmail(env, { to: u.email, subject: msg.subject, html: msg.html, text: msg.text, unsubUrl });
    return ch;
  } catch (e) {
    // Fall back to email so the participant still hears from us.
    if (ch !== "mail" && u.email) {
      logger.warn("channel failed, falling back to email", { uid, ch, err: String(e.message || e) });
      await sendEmail(env, { to: u.email, subject: msg.subject, html: msg.html, text: msg.text, unsubUrl });
      return "mail-fallback";
    }
    throw e;
  }
}

exports.sendReminders = onSchedule({ schedule: "every 15 minutes", timeZone: "Asia/Jerusalem", secrets: SECRETS, timeoutSeconds: 540, memory: "512MiB" }, async () => {
  const v = x => { const val = x.value(); return val && val !== "none" ? val : ""; };
  const env = {
    SITE_URL: SITE_URL.value(), MAIL_FROM: v(MAIL_FROM), RESEND_API_KEY: v(RESEND_API_KEY),
    WA_TOKEN: v(WA_TOKEN), WA_PHONE_ID: v(WA_PHONE_ID), WA_TEMPLATE: v(WA_TEMPLATE),
    WA_TEMPLATE_EN: v(WA_TEMPLATE_EN), WA_LANG: v(WA_LANG) || "he",
    TWILIO_SID: v(TWILIO_SID), TWILIO_TOKEN: v(TWILIO_TOKEN), SMS_FROM: v(SMS_FROM)
  };
  const started = Date.now(), BUDGET_MS = 8 * 60 * 1000, PAGE = 400, CONCURRENCY = 40;
  let sent = 0, failed = 0, seen = 0;
  // Keep taking pages of due reminders until none are left or the time budget runs out.
  while (Date.now() - started < BUDGET_MS) {
    const now = new Date();
    const due = await db.collection("users")
      .where("nextAt", "<=", admin.firestore.Timestamp.fromDate(now))
      .orderBy("nextAt").limit(PAGE).get();
    if (due.empty) break;
    seen += due.size;
    const work = async (doc) => {
      const u = doc.data();
      const active = u.reminderActive !== false && !u.unsubscribed && u.rem;
      const update = {};
      if (active) {
        try {
          const r = await sendOne(env, doc.id, u);
          if (r !== "nothing") { sent++; update.lastSentAt = FV.serverTimestamp(); update.sentCount = FV.increment(1); update.lastError = null; }
        } catch (e) {
          failed++; update.lastError = String(e.message || e).slice(0, 300);
          logger.error("reminder failed", { uid: doc.id, err: update.lastError });
        }
      }
      const next = active ? nextReminder(u.rem, new Date(Date.now() + 60000)) : null;
      update.nextAt = next ? admin.firestore.Timestamp.fromDate(next) : null;
      await doc.ref.set(update, { merge: true });
    };
    for (let i = 0; i < due.docs.length; i += CONCURRENCY) await Promise.all(due.docs.slice(i, i + CONCURRENCY).map(work));
  }
  logger.info("reminders run", { due: seen, sent, failed, ms: Date.now() - started });
});

/* ---------- unsubscribe link ---------- */
exports.unsubscribe = onRequest(async (req, res) => {
  const uid = String(req.query.u || ""), token = String(req.query.t || "");
  let ok = false;
  if (uid && token && !uid.includes("/")) {
    const ref = db.doc(`users/${uid}`); const s = await ref.get();
    if (s.exists && s.data().unsubToken && s.data().unsubToken === token) {
      await ref.set({ unsubscribed: true, reminderActive: false, nextAt: null }, { merge: true }); ok = true;
    }
  }
  if (req.method === "POST") { res.status(ok ? 200 : 400).send(ok ? "ok" : "bad link"); return; }
  const site = SITE_URL.value();
  res.set("Content-Type", "text/html; charset=utf-8").status(ok ? 200 : 400).send(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>אתגר הסיום</title>
<body style="margin:0;background:#16100b;color:#efe4cf;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center;padding:20px">
<div><img src="/assets/emblem.svg" width="90" height="90" alt=""><h1 style="color:#ecd391;font-size:28px">${ok ? "הוסרת מהתזכורות" : "הקישור לא תקין"}</h1>
<p>${ok ? "לא נשלח לך יותר תזכורות. ההתחייבות שלך נשארת שמורה, ואפשר לחדש תזכורות בכל עת מהאזור האישי." : "אפשר לעצור את התזכורות גם מהאזור האישי באתר."}</p>
<p><a style="color:#ecd391" href="${site}/#me">לאזור האישי</a></p></div></body></html>`);
});
