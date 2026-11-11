/* Reminder message texts (Hebrew + English). Kept short for WhatsApp/SMS. */
"use strict";
const SHAVUOT = new Date("2027-06-11T00:00:00+03:00");
const SIYUM_HASHAS = new Date("2027-06-07T00:00:00+03:00");
const daysLeft = (now, to) => Math.max(0, Math.ceil((to - now) / 86400000));

const ENCOURAGE = {
  he: [
    "כל יחידה קטנה מצטרפת לסיום הגדול.",
    "התמדה קטנה בונה דברים גדולים.",
    "הלימוד שלך הוא חלק מ-600,000 התחייבויות של עם ישראל.",
    "עוד צעד אחד היום, ואתם קרובים יותר לסיום.",
    "גם כמה דקות היום נספרות.",
    "״לא עליך המלאכה לגמור״ - אבל יש לך חלק בה.",
    "כל יהודי מסיים משהו. וביחד, כולנו מסיימים."
  ],
  en: [
    "Every small unit joins the great Siyum.",
    "Small consistency builds great things.",
    "Your learning is part of 600,000 commitments of Klal Yisroel.",
    "One more step today brings you closer to your siyum.",
    "Even a few minutes today count.",
    "\"It is not upon you to finish the work\" - but you have a part in it.",
    "Every Jew completes something. And together, we all complete."
  ]
};

/** Pick the commitment to talk about: the active one furthest behind. */
function pickCommitment(list) {
  const open = list.filter(c => (c.done || 0) < c.n);
  if (!open.length) return null;
  open.sort((a, b) => (a.done || 0) / a.n - (b.done || 0) / b.n);
  return open[0];
}

/**
 * Build the reminder for one user.
 * Returns {subject, text, html, params} or null if nothing to remind (all done).
 * params feed the WhatsApp template: [name, goal, percent, days].
 */
function buildReminder(user, commitments, { siteUrl, unsubUrl, now = new Date(), seq = 0 }) {
  const lang = user.lang === "en" ? "en" : "he";
  const c = pickCommitment(commitments);
  if (!c) return null;
  const name = (user.name || "").split(" ")[0] || (lang === "he" ? "חבר/ה יקר/ה" : "friend");
  const goal = (c.label && c.label[lang]) || (c.label && c.label.he) || c.customText || "";
  const pct = Math.round(Math.min(1, (c.done || 0) / c.n) * 100);
  const days = daysLeft(now, SHAVUOT);
  const toSiyum = daysLeft(now, SIYUM_HASHAS);
  const enc = ENCOURAGE[lang][seq % ENCOURAGE[lang].length];
  const link = siteUrl.replace(/\/$/, "") + "/#me";
  let text;
  if (lang === "he") {
    text = `${name}, ${enc}\nהאתגר שלך: ${goal} - ${pct}% מהדרך.\n` +
      (toSiyum > 0 ? `${toSiyum} ימים לסיום הש״ס, ${days} ימים לשבועות.\n` : `${days} ימים לשבועות.\n`) +
      `לעדכון ההתקדמות: ${link}`;
  } else {
    text = `${name}, ${enc}\nYour challenge: ${goal} - ${pct}% of the way.\n` +
      (toSiyum > 0 ? `${toSiyum} days to the Siyum HaShas, ${days} days to Shavuos.\n` : `${days} days to Shavuos.\n`) +
      `Update your progress: ${link}`;
  }
  const subject = lang === "he" ? `אתגר הסיום: ${pct}% מהדרך ל${goal}` : `The Siyum Challenge: ${pct}% of the way`;
  const dir = lang === "he" ? "rtl" : "ltr";
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]));
  const html = `<!doctype html><html lang="${lang}" dir="${dir}"><body style="margin:0;background:#16100b;font-family:Arial,sans-serif;color:#efe4cf">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#16100b"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#201710;border:1px solid #4a3a26;border-radius:14px">
<tr><td align="center" style="padding:26px 20px 6px"><img src="${esc(siteUrl.replace(/\/$/, ""))}/assets/email-logo.png" width="260" alt="${lang === "he" ? "אתגר הסיום" : "The Siyum Challenge"}" style="display:block;max-width:80%;height:auto"></td></tr>
<tr><td style="padding:10px 30px 4px;font-size:20px;line-height:1.5;color:#ecd391;text-align:${lang === "he" ? "right" : "left"}">${esc(name)}, ${esc(enc)}</td></tr>
<tr><td style="padding:6px 30px;font-size:16px;line-height:1.6;text-align:${lang === "he" ? "right" : "left"}">
${lang === "he" ? "האתגר שלך" : "Your challenge"}: <b>${esc(goal)}</b><br>
<div style="margin:12px 0;background:#3a2b1f;border-radius:8px;height:12px"><div style="width:${pct}%;background:#d9b55e;height:12px;border-radius:8px"></div></div>
${pct}% ${lang === "he" ? "מהדרך" : "of the way"} · ${days} ${lang === "he" ? "ימים לשבועות" : "days to Shavuos"}</td></tr>
<tr><td align="center" style="padding:20px 30px 28px"><a href="${esc(link)}" style="display:inline-block;background:#d9b55e;color:#20160d;text-decoration:none;font-weight:bold;padding:12px 26px;border-radius:999px">${lang === "he" ? "לעדכון ההתקדמות" : "Update my progress"}</a></td></tr>
</table>
<p style="font-size:12px;color:#8e806b;margin:16px 0 0">${lang === "he" ? "קיבלת הודעה זו כי נרשמת לתזכורות באתגר הסיום של מרכז לאו." : "You're receiving this because you signed up for Siyum Challenge reminders from the Lau Center."}
<a href="${esc(unsubUrl)}" style="color:#bfb19a">${lang === "he" ? "להסרה מהתזכורות" : "Unsubscribe"}</a></p>
</td></tr></table></body></html>`;
  const smsText = text + (lang === "he" ? `\nלהסרה: ${unsubUrl}` : `\nUnsubscribe: ${unsubUrl}`);
  return { lang, subject, text, smsText, html, params: [name, goal, String(pct), String(days)], commitmentId: c.id };
}

module.exports = { buildReminder, pickCommitment };
