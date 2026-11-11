/* Message senders. Each provider is optional: a channel whose keys are missing is skipped (logged), not crashed.
   - Email:    Resend (https://resend.com)               -> RESEND_API_KEY, MAIL_FROM
   - WhatsApp: Meta WhatsApp Cloud API (approved template) -> WA_TOKEN, WA_PHONE_ID, WA_TEMPLATE, WA_LANG
   - SMS:      Twilio (or swap in an Israeli SMS provider) -> TWILIO_SID, TWILIO_TOKEN, SMS_FROM */
"use strict";

/** 050-123-4567 / 0501234567 / +972501234567 -> +972501234567 ; null if not an Israeli/intl mobile. */
function normalizePhone(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "972" + d.slice(1);
  if (!/^\d{10,15}$/.test(d)) return null;
  return "+" + d;
}

async function sendEmail(env, { to, subject, html, text, unsubUrl }) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw new Error("email not configured");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM, to: [to], subject, html, text,
      headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    })
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

async function sendWhatsApp(env, { to, params, lang }) {
  if (!env.WA_TOKEN || !env.WA_PHONE_ID || !env.WA_TEMPLATE) throw new Error("whatsapp not configured");
  const phone = normalizePhone(to); if (!phone) throw new Error("bad phone");
  const r = await fetch(`https://graph.facebook.com/v20.0/${env.WA_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: phone.slice(1), type: "template",
      template: {
        name: lang === "en" && env.WA_TEMPLATE_EN ? env.WA_TEMPLATE_EN : env.WA_TEMPLATE,
        language: { code: lang === "en" ? "en" : (env.WA_LANG || "he") },
        components: [{ type: "body", parameters: params.map(p => ({ type: "text", text: String(p).slice(0, 200) })) }]
      }
    })
  });
  if (!r.ok) throw new Error(`whatsapp ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

async function sendSms(env, { to, text }) {
  if (!env.TWILIO_SID || !env.TWILIO_TOKEN || !env.SMS_FROM) throw new Error("sms not configured");
  const phone = normalizePhone(to); if (!phone) throw new Error("bad phone");
  const body = new URLSearchParams({ To: phone, From: env.SMS_FROM, Body: text });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`).toString("base64"),
               "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!r.ok) throw new Error(`twilio ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

module.exports = { normalizePhone, sendEmail, sendWhatsApp, sendSms };
