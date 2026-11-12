/* אתגר הסיום - admin dashboard (read-only). Access is granted by adding a document /admins/{email} in Firestore. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, orderBy, limit, getDocs, startAfter, collectionGroup, documentId } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const cfg = window.ATGAR_CONFIG;
const app = initializeApp(cfg.firebase);
const auth = getAuth(app); const db = getFirestore(app);
const $ = s => document.querySelector(s);
const nf = n => new Intl.NumberFormat("he-IL").format(n || 0);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
const NAMES = {
  track: { seed: "טבעת", growth: "צמיד", peak: "שרשרת" },
  subject: { tanach: "תנ״ך", mussar: "מוסר ופרקי אבות", machshava: "מחשבת ישראל", halacha: "הלכה", rambam: "רמב״ם", gemara: "גמרא", custom: "התחייבות אישית" },
  sector: { secular: "חילונית", traditional: "מסורתית", dati: "דתית-לאומית", haredi: "חרדית", other: "אחרת", unknown: "לא צוין", "": "לא צוין" }
};

$("#signin").onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(e => { $("#msg").textContent = "ההתחברות נכשלה: " + e.code; });
$("#signout").onclick = () => signOut(auth);

onAuthStateChanged(auth, async u => {
  $("#signin").hidden = !!u; $("#signout").hidden = !u; $("#who").textContent = u ? u.email : "";
  $("#app").hidden = true;
  if (!u) { $("#msg").textContent = "יש להתחבר עם חשבון שהוגדר כמנהל."; return; }
  try { await getDoc(doc(db, "admins", u.email)); }
  catch (e) { $("#msg").textContent = "לחשבון הזה אין הרשאת ניהול. יש להוסיף אותו ברשימת המנהלים (ראו מדריך ההתקנה)."; return; }
  $("#msg").textContent = ""; $("#app").hidden = false;
  load();
});

function table(el, obj, names) {
  const rows = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(r => r[1]));
  el.innerHTML = rows.length ? rows.map(([k, v]) => `<tr><td>${esc(names[k] || k)}</td><td style="width:45%"><div class="bar" style="width:${(v / max) * 100}%"></div></td><td>${nf(v)}</td></tr>`).join("") : `<tr><td class="muted">אין עדיין נתונים</td></tr>`;
}

async function load() {
  const s = await getDoc(doc(db, "stats", "global")); const st = s.exists() ? s.data() : {};
  const k = [["commitments", "התחייבויות"], ["participants", "נרשמים"], ["activeParticipants", "נרשמים שהתחייבו"], ["completed", "התחייבויות שהושלמו"], ["referredJoins", "הצטרפו דרך יהלומים"]];
  $("#kpis").innerHTML = k.map(([f, l]) => `<div class="kpi"><b>${nf(st[f])}</b><span>${l}</span></div>`).join("") +
    `<div class="kpi"><b>${nf(Math.max(0, 600000 - (st.commitments || 0)))}</b><span>נותרו ליעד 600,000</span></div>`;
  table($("#t-track"), st.byTrack, NAMES.track);
  table($("#t-subject"), st.bySubject, NAMES.subject);
  table($("#t-sector"), st.bySector, NAMES.sector);
  const cs = await getDocs(query(collection(db, "communities"), orderBy("commitments", "desc"), limit(50)));
  $("#t-comm").innerHTML = `<tr><th>שם</th><th>עיר</th><th>נרשמים</th><th>התחייבויות</th></tr>` + (cs.docs.map(d => { const c = d.data(); return `<tr><td>${esc(c.name)}</td><td>${esc(c.city)}</td><td>${nf(c.participants)}</td><td>${nf(c.commitments)}</td></tr>`; }).join("") || `<tr><td class="muted" colspan="4">אין עדיין נתונים</td></tr>`);
}

const base = (cfg.siteUrl || location.origin).replace(/\/$/, "");
const updLink = () => { const n = $("#commName").value.trim(); $("#commLink").textContent = n ? `${base}/?c=${encodeURIComponent(n)}` : "-"; };
$("#commName").oninput = updLink;
$("#copyComm").onclick = () => navigator.clipboard.writeText($("#commLink").textContent).then(() => { $("#copyComm").textContent = "הועתק"; setTimeout(() => $("#copyComm").textContent = "העתקה", 1500); });

function csv(rows) {
  const q = v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + rows.map(r => r.map(q).join(",")).join("\r\n");
}
function download(name, text) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = name; a.click();
}
const ts = v => v && v.toDate ? v.toDate().toISOString().replace("T", " ").slice(0, 16) : (v || "");
async function pageAll(q0, build) {
  const out = []; let last = null;
  for (;;) {
    const q = last ? query(q0, orderBy(documentId()), startAfter(last), limit(500)) : query(q0, orderBy(documentId()), limit(500));
    const snap = await getDocs(q); snap.docs.forEach(d => out.push(build(d)));
    $("#expStatus").textContent = `נטענו ${nf(out.length)}...`;
    if (snap.size < 500) break; last = snap.docs[snap.docs.length - 1];
  }
  return out;
}
$("#expUsers").onclick = async () => {
  const rows = await pageAll(collection(db, "users"), d => { const u = d.data(), p = u.profile || {}, r = u.rem || {};
    return [d.id, u.name, u.email, p.phone, p.age, p.gender, NAMES.sector[p.sector || ""], p.city, p.community, r.ch, r.fr, r.tm, u.reminderActive !== false && !u.unsubscribed ? "כן" : "לא", u.commitCount || 0, u.code, u.invitesCount || 0, u.ref || "", ts(u.createdAt)]; });
  download("participants.csv", csv([["id", "שם", "אימייל", "טלפון", "גיל (קטגוריה)", "מגדר", "קהילה", "עיר", "בית כנסת/ארגון", "ערוץ", "תדירות", "שעה", "תזכורות פעילות", "מספר התחייבויות", "קוד שגריר", "הצטרפו דרכו", "הוזמן ע״י קוד", "נרשם"], ...rows]));
  $("#expStatus").textContent = `יוצאו ${nf(rows.length)} משתתפים`;
};
$("#expCommit").onclick = async () => {
  const snap = await getDocs(collectionGroup(db, "commitments"));
  const rows = snap.docs.map(d => { const c = d.data(); return [d.ref.parent.parent.id, NAMES.track[c.track], NAMES.subject[c.subject], (c.label && c.label.he) || c.customText, c.n, c.done || 0, Math.round(((c.done || 0) / c.n) * 100) + "%", c.ded || "", ts(c.createdAt)]; });
  download("commitments.csv", csv([["id משתתף", "מסלול", "תחום", "התחייבות", "יעד", "הושלם", "אחוז", "הקדשה", "נוצר"], ...rows]));
  $("#expStatus").textContent = `יוצאו ${nf(rows.length)} התחייבויות`;
};
