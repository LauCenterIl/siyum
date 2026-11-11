/* אתגר הסיום - application logic (shared by the demo preview and the live site). Requires i18n.js and a Store. */
(function(){
"use strict";
const CFG = window.ATGAR_CONFIG || {};
const SHAVUOT = new Date("2027-06-11T00:00:00+03:00");
const MILESTONES = [
  {k:"chanukah", date:"2026-12-05", goal:10000},
  {k:"purim", date:"2027-03-23", goal:150000},
  {k:"pesach", date:"2027-04-22", goal:400000},
  {k:"shavuot", date:"2027-06-11", goal:600000}
];
const TRACKS = ["seed","growth","peak"];
const GLYPH = {seed:"g-seed",growth:"g-growth",peak:"g-peak"};
const T = window.T, U = window.U, SUBJECTS = window.SUBJECTS;
const LIVE = () => window.Store && window.Store.mode === "live";

/* ---------- state ---------- */
let lang = "he";
let view = "home";
const S = {auth:null, me:null, commitments:[], stats:null, ready:false, community:null};
let W = freshWizard();
function freshWizard(){ return {step:0, track:null, subject:null, optIdx:null, n:null, customText:"", customUnit:"", name:"", details:{age:"",gender:"",sector:"",city:"",community:"",phone:"",ded:""}, rem:{ch:"wa",fr:"daily",tm:"evening"}, consent:false, t:Date.now()}; }
const LS = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};
function saveDraft(){ LS.set("atgar_draft", JSON.stringify(W)); }
function loadDraft(){ try{ const d = JSON.parse(LS.get("atgar_draft")||"null"); if(d && Date.now()-d.t < 86400000 && d.step>0 && d.step<5) return d; }catch(e){} return null; }

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
function t(k, vars){ let v = T[lang][k]; if(v==null) v = T.he[k]; if(typeof v==="string" && vars){ v = v.replace(/\{(\w+)\}/g,(m,p)=> vars[p]!=null?vars[p]:m); } return v; }
function lines(str){ return String(str).split("|").map(x=>`<span class="ln">${esc(x)}</span>`).join(""); }
const nf = n => new Intl.NumberFormat(lang==="he"?"he-IL":"en-US").format(n);
function daysLeft(){ return Math.max(0, Math.ceil((SHAVUOT - new Date())/86400000)); }
function gem(n){ const L=[[400,"ת"],[300,"ש"],[200,"ר"],[100,"ק"],[90,"צ"],[80,"פ"],[70,"ע"],[60,"ס"],[50,"נ"],[40,"מ"],[30,"ל"],[20,"כ"],[10,"י"],[9,"ט"],[8,"ח"],[7,"ז"],[6,"ו"],[5,"ה"],[4,"ד"],[3,"ג"],[2,"ב"],[1,"א"]]; let out=""; n=n%1000; for(const [v,c] of L){ while(n>=v){ if(n===15){out+="טו";n=0;break;} if(n===16){out+="טז";n=0;break;} out+=c; n-=v; } } return out.length>1? out.slice(0,-1)+"״"+out.slice(-1) : out+"׳"; }
function hebDate(d){ try{
  if(lang==="he"){ const parts=new Intl.DateTimeFormat("he-IL-u-ca-hebrew",{day:"numeric",month:"long",year:"numeric"}).formatToParts(d); const g=k=>(parts.find(p=>p.type===k)||{}).value; return gem(parseInt(g("day")))+" "+g("month")+" "+gem(parseInt(g("year"))); }
  return new Intl.DateTimeFormat("en-u-ca-hebrew",{day:"numeric",month:"long",year:"numeric"}).format(d); }catch(e){ return d.toLocaleDateString(); } }
function gregShort(iso){ try{ return new Intl.DateTimeFormat(lang==="he"?"he-IL":"en-GB",{day:"numeric",month:"short",year:"numeric"}).format(new Date(iso+"T12:00:00")); }catch(e){ return iso; } }
function unitLabel(u){ return (U[lang]&&U[lang][u])||u; }
function subjById(id){ return SUBJECTS.find(s=>s.id===id); }
function toast(msg){ const el=$("#toast"); el.textContent=msg; el.classList.add("on"); clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.remove("on"),2000); }
function copyText(txt, btn){ try{ navigator.clipboard.writeText(txt).then(()=>toast(t("copied")),fallback); }catch(e){ fallback(); } function fallback(){ const code = btn && btn.parentElement.querySelector("code"); if(code){ const r=document.createRange(); r.selectNodeContents(code); const s=getSelection(); s.removeAllRanges(); s.addRange(r);} } }
function waLink(text){ return "https://wa.me/?text="+encodeURIComponent(text); }
function initials(name){ return (name||"?").trim().charAt(0); }
function siteBase(){ return (CFG.siteUrl || (location.origin + location.pathname)).replace(/\/$/, "") + (CFG.siteUrl ? "/" : ""); }
function inviteLink(){ const code = S.me && S.me.code; if(!code) return siteBase(); return LIVE() ? siteBase()+"?ref="+code : location.href.split("#")[0]+"#ref-"+code; }
function communityKey(name, city){ const n=(name||"").trim(); if(!n) return ""; return (n+"|"+(city||"").trim()).toLowerCase().replace(/["'״׳`]/g,"").replace(/\s+/g," ").replace(/\//g,"-").slice(0,120); }
function firstName(){ const n = (S.auth&&S.auth.name) || (S.me&&S.me.name) || W.name || ""; return n.split(" ")[0]; }

/* ---------- commitment text ---------- */
function labelFor(c, lg){
  const L = lg || lang;
  if(c.subject==="custom") return c.customText;
  const o = subjById(c.subject).opts[c.track][c.optIdx];
  if(c.n===o.n || c.u==="pct") return o[L];
  const sub = subjById(c.subject)[L]; const ul = (U[L]&&U[L][c.u])||c.u;
  return L==="he" ? `${c.n} ${ul} ב${sub}` : `${c.n} ${ul} of ${sub}`;
}
function cGoal(c){ return labelFor(c); }
function cUnit(c){ return c.u==="custom" ? (c.customUnit||"") : unitLabel(c.u); }

/* ---------- i18n apply ---------- */
function applyLang(){
  document.documentElement.lang = lang; document.documentElement.dir = lang==="he"?"rtl":"ltr";
  document.querySelectorAll("[data-t]").forEach(el=>{ const v=t(el.dataset.t); if(typeof v!=="string") return; if(v.includes("|")) el.innerHTML=lines(v); else el.textContent=v; });
  $("#langBtn").textContent = lang==="he"?"EN":"עב";
  renderTrackCards(); renderSubjChips(); renderRoad(); renderCountdown(); renderStats();
  const ref = LS.get("atgar_ref"); if(ref){ const b=$("#refBanner"); b.hidden=false; b.textContent=t("refBanner"); }
  if(view==="join") renderWizard(); if(view==="me") renderMe();
}

/* ---------- home ---------- */
function trackKey(k){ return k==="peak"?"VENTURE":k.toUpperCase(); }
function renderTrackCards(){
  $("#trackCards").innerHTML = TRACKS.map(k=>`
    <button type="button" class="track" data-start-track="${k}"><svg class="glyph" style="color:var(--gold-lo)"><use href="#${GLYPH[k]}"/></svg>
    <div class="en">${trackKey(k)}</div>
    <h3>${esc(t("trackName")[k])}</h3><div class="promise">${esc(t("trackPromise")[k])}</div>
    <ul>${t("trackEx")[k].map(x=>`<li>${esc(x)}</li>`).join("")}</ul><span class="go">${esc(t("pickTrack"))}</span></button>`).join("");
}
function renderSubjChips(){
  $("#subjChips").innerHTML = SUBJECTS.map(s=>`<button type="button" class="subj-chip" data-start-subj="${s.id}">${esc(s[lang])}<span>${esc(lang==="he"?s.dh:s.de)}</span></button>`).join("") + `<button type="button" class="subj-chip" style="border-style:dashed" data-start-subj="custom">${esc(t("customSubj"))}</button>`;
}
function renderRoad(){
  const names = lang==="he"?{chanukah:"חנוכה",purim:"פורים",pesach:"פסח",shavuot:"שבועות"}:{chanukah:"Chanukah",purim:"Purim",pesach:"Pesach",shavuot:"Shavuos"};
  const el=$("#roadEl"); el.querySelectorAll(".ms").forEach(n=>n.remove());
  MILESTONES.forEach((m,i)=>{ const d=document.createElement("div"); d.className="ms"+(i===MILESTONES.length-1?" last":"");
    d.innerHTML=`<div class="node">${i+1}</div><h4>${esc(names[m.k])}</h4><div class="date">${esc(gregShort(m.date))}</div><div class="goal">${nf(m.goal)}</div>`; el.appendChild(d); });
  const first=new Date(MILESTONES[0].date), now=new Date();
  const frac = Math.min(1,Math.max(0,(now-first)/(SHAVUOT-first)));
  $("#roadProg").style.width = (frac*88)+"%";
}
function renderCountdown(){ $("#daysLeft").textContent = nf(daysLeft()); }
function renderStats(){
  const n = S.stats && S.stats.commitments;
  const box = $("#liveCount"); if(!box) return;
  if(n && n>0){ box.hidden=false; $("#liveNum").textContent = nf(n); } else box.hidden = true;
}

/* ---------- routing ---------- */
function go(v, anchor){
  view=v; document.querySelectorAll(".view").forEach(x=>x.classList.remove("on")); $("#v-"+v).classList.add("on");
  document.querySelectorAll(".nav a").forEach(a=>a.classList.toggle("on", a.dataset.go===v && v==="me"));
  if(v==="join") renderWizard(); if(v==="me") renderMe();
  try{ const h = v==="home" ? "" : "#"+v; if(location.hash!==h) history.replaceState(null,"",location.pathname+location.search.replace(/[?&]finishSignIn=1/,"")+h); }catch(e){}
  if(anchor){ const a=document.getElementById(anchor); if(a) setTimeout(()=>a.scrollIntoView({behavior:"smooth"}),30); } else window.scrollTo(0,0);
}
document.addEventListener("click", e=>{
  const g=e.target.closest("[data-go]"); if(!g) return; e.preventDefault();
  if(g.dataset.go==="join" && view!=="join"){ W=freshWizard(); prefillCommunity(); }
  go(g.dataset.go, g.dataset.anchor);
});
$("#langBtn").addEventListener("click",()=>{ lang = lang==="he"?"en":"he"; LS.set("atgar_lang",lang); applyLang(); });

/* ---------- wizard ---------- */
const STEPS = ["track","signin","subject","goal","details","done"];
function stepperHTML(){ const total=STEPS.length-1; let h='<div class="stepper">'; for(let i=0;i<total;i++){ h+=`<i class="${i<W.step?"done":i===W.step?"cur":""}"></i>`; } return h+"</div>"; }
function metaHTML(){ return `<div class="wiz-meta">${W.step>0?`<button class="back" data-act="back">${lang==="he"?"→":"←"} ${esc(t("back"))}</button>`:"<span></span>"}<span>${esc(t("stepOf",{a:W.step+1,b:STEPS.length-1}))}</span></div>`; }
const G_ICON = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.8c-.5-1.5-.8-3.1-.8-4.8s.3-3.3.8-4.8l-7.8-6C1 16.5 0 20.1 0 24s1 7.5 2.7 10.8l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.7l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>`;

function signInBlock(){
  let h="";
  if(window.Store.needsEmailForLink && window.Store.needsEmailForLink()){
    h+=`<div class="field"><label for="f-linkmail">${esc(t("fEmail"))}</label><div class="linkbox" style="padding:4px"><input id="f-linkmail" type="email" dir="ltr" autocomplete="email" style="border:0;background:transparent"><button class="btn btn-gold btn-sm" data-act="finishlink">${esc(t("next"))}</button></div></div><div class="err" id="err"></div>`;
    return h;
  }
  const mode = W._authMode || "signup";
  h+=`<div class="auth-google"><button class="gbtn" data-act="google">${G_ICON}${esc(t("gBtn"))}</button></div>
  <div class="or"><span>${esc(t("orEmailPass"))}</span></div>
  <div class="tabs" role="tablist"><button type="button" role="tab" class="${mode==="signup"?"sel":""}" data-act="mode-signup">${esc(t("tabSignup"))}</button><button type="button" role="tab" class="${mode==="login"?"sel":""}" data-act="mode-login">${esc(t("tabLogin"))}</button></div>`;
  if(mode==="signup"){
    h+=`<div class="field"><label for="a-name">${esc(t("fName"))}</label><input id="a-name" type="text" autocomplete="name" maxlength="80" value="${esc(W._aname||"")}"></div>
    <div class="row2"><div class="field"><label for="a-email">${esc(t("fEmail"))}</label><input id="a-email" type="email" dir="ltr" autocomplete="email" value="${esc(W._aemail||"")}"></div>
    <div class="field"><label for="a-pass">${esc(t("fPass"))}</label><input id="a-pass" type="password" dir="ltr" autocomplete="new-password" minlength="8"><span class="hint">${esc(t("passHint"))}</span></div></div>
    <div><button class="btn btn-gold" data-act="signup">${esc(t("signupBtn"))}</button></div>`;
  } else if(mode==="login"){
    h+=`<div class="row2"><div class="field"><label for="a-email">${esc(t("fEmail"))}</label><input id="a-email" type="email" dir="ltr" autocomplete="email" value="${esc(W._aemail||"")}"></div>
    <div class="field"><label for="a-pass">${esc(t("fPass"))}</label><input id="a-pass" type="password" dir="ltr" autocomplete="current-password"></div></div>
    <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><button class="btn btn-gold" data-act="login">${esc(t("loginBtn"))}</button><button class="back" data-act="reset">${esc(t("forgot"))}</button></div>`;
  }
  h+=`<div class="hint">${esc(t("inApp2"))}</div><div class="err" id="err"></div>`;
  return h;
}
function verifyBlock(){
  return `<div class="verify"><div class="verify-ico">✉</div><h3>${esc(t("verifyH"))}</h3>
    <p>${esc(t("verifyP",{e:S.auth.email}))}</p>
    ${!LIVE()?`<div class="demo-note">${esc(t("demoVerify"))}</div>`:""}
    <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><button class="btn btn-gold" data-act="verified">${esc(t("verifiedBtn"))}</button><button class="btn btn-ghost btn-sm" data-act="resend">${esc(t("resendBtn"))}</button><button class="btn btn-ghost btn-sm" data-act="signout">${esc(t("change"))}</button></div>
    <p class="hint">${esc(t("verifySpam"))}</p><div class="err" id="err"></div></div>`;
}
function authErr(e){
  const c = (e && e.code) || "";
  if(c.includes("email-already-in-use")) return t("errInUse");
  if(c.includes("invalid-credential")||c.includes("wrong-password")||c.includes("user-not-found")) return t("errCreds");
  if(c.includes("weak-password")) return t("passHint");
  if(c.includes("invalid-email")) return t("errEmail");
  if(c.includes("too-many-requests")) return t("errTooMany");
  return t("authErr");
}

function renderWizard(){
  const box=$("#wiz"); const s=STEPS[W.step];
  let h = s==="done" ? "" : metaHTML()+stepperHTML();
  if(s==="track"){
    h+=`<h2>${esc(t("w1h"))}</h2><p class="sub">${esc(t("w1s"))}</p><div class="choice-grid c3">`+
     TRACKS.map(k=>`<button class="choice ${W.track===k?"sel":""}" data-track="${k}"><svg width="48" height="48" style="color:var(--gold)"><use href="#${GLYPH[k]}"/></svg><span class="k">${trackKey(k)}</span><h3>${esc(t("trackName")[k])}</h3><p>${esc(t("trackPromise")[k])}</p><p style="color:var(--cream-faint);font-size:14px">${t("trackEx")[k].map(esc).join(" · ")}</p></button>`).join("")+`</div>`;
  }
  else if(s==="signin"){
    h+=`<h2>${esc(t("w2h"))}</h2><p class="sub">${esc(t("w2s"))}</p><div class="panel form">`;
    if(S.auth && !S.auth.verified){ h+=verifyBlock(); }
    else if(S.auth){
      h+=`<div class="signed"><div class="avatar">${esc(initials(S.auth.name||S.auth.email))}</div><div style="flex:1;min-width:0"><div style="font-size:13px;color:var(--cream-faint)">${esc(t("signedAs"))}</div>${S.auth.name?`<b>${esc(S.auth.name)}</b> · `:""}<span style="direction:ltr;unicode-bidi:isolate">${esc(S.auth.email)}</span></div><button class="btn btn-ghost btn-sm" data-act="signout">${esc(t("change"))}</button></div>`;
    } else h+=signInBlock();
    h+=`</div>`;
  }
  else if(s==="subject"){
    h+=`<h2>${esc(t("w3h"))}</h2><p class="sub">${esc(t("w3s",{track:t("trackName")[W.track]}))}</p><div class="choice-grid c3">`+
     SUBJECTS.map(sb=>`<button class="choice ${W.subject===sb.id?"sel":""}" data-subj="${sb.id}"><span class="k">${esc(lang==="he"?sb.dh:sb.de)}</span><h3>${esc(sb[lang])}</h3><p>${sb.opts[W.track].map(o=>esc(o[lang])).join(" · ")}</p></button>`).join("")+
     `<button class="choice custom ${W.subject==="custom"?"sel":""}" data-subj="custom"><span class="k">+</span><h3>${esc(t("customSubj"))}</h3><p>${esc(t("customSubjD"))}</p></button></div>`;
  }
  else if(s==="goal"){
    h+=`<h2>${esc(t("w4h"))}</h2><p class="sub">${esc(t("w4s"))}</p>`;
    if(W.subject==="custom"){
      h+=`<div class="panel form"><div class="field"><label for="c-what">${esc(t("customWhat"))}</label><input id="c-what" type="text" maxlength="140" placeholder="${esc(t("customWhatPh"))}" value="${esc(W.customText)}"></div><div class="row2"><div class="field"><label for="c-n">${esc(t("customN"))}</label><input id="c-n" type="number" min="1" max="9999" value="${esc(W.n||10)}"></div><div class="field"><label for="c-u">${esc(t("customU"))}</label><input id="c-u" type="text" maxlength="30" placeholder="${esc(t("customUPh"))}" value="${esc(W.customUnit)}"></div></div><div id="paceBox"></div><div class="err" id="err"></div></div>`;
    } else {
      const sb=subjById(W.subject); const opts=sb.opts[W.track];
      h+=`<div class="choice-grid c3">`+opts.map((o,i)=>`<button class="choice ${W.optIdx===i?"sel":""}" data-opt="${i}"><span class="k">${esc(sb[lang])} · ${esc(t("trackName")[W.track])}</span><h3 style="font-size:22px">${esc(o[lang])}</h3>${o.u!=="pct"?`<span class="amt">${nf(o.n)} ${esc(unitLabel(o.u))}</span>`:""}</button>`).join("")+`</div>`;
      if(W.optIdx!=null){
        const o=opts[W.optIdx]; const ti=TRACKS.indexOf(W.track);
        h+=`<div class="panel goal-box" style="margin-top:18px"><div class="adjust">
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" data-act="smaller" ${ti===0?"disabled":""}>− ${esc(t("smaller"))}</button><button class="btn btn-ghost btn-sm" data-act="bigger" ${ti===2?"disabled":""}>+ ${esc(t("bigger"))}</button></div>
          ${o.u!=="pct"?`<div style="display:flex;gap:10px;align-items:center"><span style="color:var(--cream-faint);font-size:14px">${esc(t("amount"))}</span><div class="stepper-num"><button data-act="dec" aria-label="-">−</button><output id="nOut">${nf(W.n)} ${esc(unitLabel(o.u))}</output><button data-act="inc" aria-label="+">+</button></div></div>`:""}
        </div><div id="paceBox"></div></div>`;
      }
    }
  }
  else if(s==="details"){
    const d=W.details, r=W.rem;
    const segBtns=(key,val,opts)=>opts.map(([v,l])=>`<button type="button" class="${val===v?"sel":""}" data-seg="${key}" data-val="${v}">${esc(l)}</button>`).join("");
    const needName = !(S.auth && S.auth.name);
    h+=`<h2>${esc(t("w5h"))}</h2><p class="sub">${esc(t("w5s"))}</p><div class="panel form">
     ${needName?`<div class="field"><label for="d-name">${esc(t("fName"))}</label><input id="d-name" type="text" autocomplete="name" value="${esc(W.name)}"></div>`:""}
     <div class="row2"><div class="field"><label for="d-age">${esc(t("fAge"))}</label><select id="d-age"><option value=""></option>${t("ageOpts").map((a,i)=>`<option value="${i}" ${String(d.age)===String(i)?"selected":""}>${esc(a)}</option>`).join("")}</select></div>
     <div class="field"><span class="lbl">${esc(t("fGender"))}</span><div class="seg">${segBtns("gender",d.gender,[["m",t("male")],["f",t("female")]])}</div></div></div>
     <div class="row2"><div class="field"><label for="d-city">${esc(t("fCity"))}</label><input id="d-city" type="text" maxlength="60" autocomplete="address-level2" value="${esc(d.city)}"></div>
     <div class="field"><label for="d-comm">${esc(t("fCommunity"))}</label><input id="d-comm" type="text" maxlength="80" value="${esc(d.community)}"><span class="hint">${esc(t("fCommunityHint"))}</span></div></div>
     <div class="field"><span class="lbl">${esc(t("fSector"))}</span><div class="seg">${segBtns("sector",d.sector,t("sectorOpts"))}</div></div>
     <div class="field"><label for="d-ded">${esc(t("fDed"))}</label><input id="d-ded" type="text" maxlength="120" placeholder="${esc(t("fDedPh"))}" value="${esc(d.ded)}"></div>
    </div>
    <div class="panel form" style="margin-top:18px"><h3 style="font-size:24px">${esc(t("remH"))}</h3>
     ${remControls(r, d.phone)}
     <div class="field"><span class="lbl" style="color:var(--cream-faint);font-weight:600">${esc(t("remPreview"))}</span><div class="preview-msg">${esc(t("remSample",{name:firstName(),goal:currentGoalText(),pct:12}))}<small>20:30</small></div></div>
     <label class="check"><input id="d-consent" type="checkbox" ${W.consent?"checked":""}><span>${esc(t("consent"))}</span></label>
     <div class="hint" style="font-size:13px;color:var(--cream-faint)">${esc(t("privacy"))} <a href="privacy.html" target="_blank" rel="noopener">${esc(t("footPrivacy"))}</a></div>
     <div class="err" id="err"></div>
    </div>`;
  }
  else if(s==="done"){ h+=doneHTML(S.commitments[S.commitments.length-1]); }

  if(s!=="done"){
    const ready = canNext();
    const label = s==="details"? t("commit") : t("next");
    const hideNext = s==="signin" && !(S.auth && S.auth.verified);
    h+=`<div class="wiz-actions">${hideNext?"":`<button class="btn btn-gold" data-act="next" ${ready?"":"disabled"}>${esc(label)}</button>`}</div>`;
  }
  box.innerHTML=h;
  bindWizard();
  if(s==="goal") renderPace();
  saveDraft();
}
function remControls(r, phone, prefix){
  const p = prefix||"d";
  const segBtns=(key,val,opts)=>opts.map(([v,l])=>`<button type="button" class="${val===v?"sel":""}" data-seg="${key}" data-val="${v}">${esc(l)}</button>`).join("");
  return `<div class="field"><span class="lbl">${esc(t("remChannel"))}</span><div class="seg">${segBtns("ch",r.ch,[["wa",t("chWA")],["sms",t("chSMS")],["mail",t("chMail")]])}</div></div>
     ${r.ch!=="mail"?`<div class="field"><label for="${p}-phone">${esc(t("fPhone"))}</label><input id="${p}-phone" type="tel" dir="ltr" autocomplete="tel" placeholder="050-0000000" value="${esc(phone||"")}"><span class="hint">${esc(t("fPhoneHint"))}</span></div>`:""}
     <div class="row2"><div class="field"><span class="lbl">${esc(t("remFreq"))}</span><div class="seg">${segBtns("fr",r.fr,[["daily",t("fDaily")],["2w",t("f2w")],["weekly",t("fWeekly")]])}</div></div>
     <div class="field"><span class="lbl">${esc(t("remTime"))}</span><div class="seg">${segBtns("tm",r.tm,[["morning",t("tMorning")],["noon",t("tNoon")],["evening",t("tEvening")]])}</div></div></div>
     <div class="hint" style="font-size:13px;color:var(--cream-faint)">${esc(t("noShabbat"))}</div>`;
}
function currentGoalText(){
  if(W.subject==="custom") return W.customText || "...";
  if(!W.subject||W.optIdx==null) return "...";
  return labelFor({subject:W.subject,track:W.track,optIdx:W.optIdx,n:W.n,u:subjById(W.subject).opts[W.track][W.optIdx].u});
}
function canNext(){
  const s=STEPS[W.step];
  if(s==="track") return !!W.track;
  if(s==="signin") return !!(S.auth && S.auth.verified);
  if(s==="subject") return !!W.subject;
  if(s==="goal") return W.subject==="custom" ? true : W.optIdx!=null;
  return true;
}
function renderPace(){
  const el=$("#paceBox"); if(!el) return;
  let n, u;
  if(W.subject==="custom"){ n = Math.max(1, parseInt(($("#c-n")||{}).value)||0); u = ($("#c-u")||{}).value || t("customUPh"); }
  else { if(W.optIdx==null){ el.innerHTML=""; return; } const o=subjById(W.subject).opts[W.track][W.optIdx]; n=W.n; u=unitLabel(o.u); if(o.u==="pct"){ el.innerHTML=`<div class="pace"><div>${esc(t("paceA",{d:nf(daysLeft())}))}</div></div>`; return; } }
  const d=Math.max(1,daysLeft()); const perDay=n/d; let r, per;
  if(perDay>=1){ r=(Math.round(perDay*10)/10).toString(); per=t("perDay"); }
  else { r=(Math.round(n/(d/7)*10)/10).toString(); per=t("perWeek"); }
  el.innerHTML=`<div class="pace"><svg width="34" height="34" style="color:var(--gold);flex:none"><use href="#${GLYPH[W.track]||"g-seed"}"/></svg><div><div>${esc(t("paceA",{d:nf(daysLeft())}))}</div><div>${esc(lang==="he"?"זה בערך ":"That's about ")}<b>${esc(r)}</b> ${esc(u)} ${esc(lang==="he"?"ב"+per:"per "+per)}.</div></div></div>`;
}
function bindWizard(){
  const box=$("#wiz");
  box.querySelectorAll("[data-track]").forEach(b=>b.onclick=()=>{ W.track=b.dataset.track; W.optIdx=null; W.step = (S.auth&&S.auth.verified) ? afterSignin() : 1; renderWizard(); window.scrollTo(0,0); });
  box.querySelectorAll("[data-subj]").forEach(b=>b.onclick=()=>{ W.subject=b.dataset.subj; W.optIdx=null; if(W.subject==="custom") W.n=W.n||10; W.step++; renderWizard(); window.scrollTo(0,0); });
  box.querySelectorAll("[data-opt]").forEach(b=>b.onclick=()=>{ W.optIdx=+b.dataset.opt; W.n=subjById(W.subject).opts[W.track][W.optIdx].n; renderWizard(); });
  box.querySelectorAll("[data-seg]").forEach(b=>b.onclick=()=>{ captureDetails(); const k=b.dataset.seg,v=b.dataset.val; if(k==="gender") W.details.gender=v; else if(k==="sector") W.details.sector = W.details.sector===v ? "" : v; else W.rem[k]=v; renderWizard(); });
  ["c-n","c-u","c-what"].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener("input",()=>{ W.customText=$("#c-what").value; W.customUnit=$("#c-u").value; W.n=Math.max(1,parseInt($("#c-n").value)||1); renderPace(); saveDraft(); }); });
  box.querySelectorAll("[data-act]").forEach(b=>b.onclick=()=>act(b.dataset.act, b));
}
function captureDetails(){
  const v=id=>{ const el=document.getElementById(id); return el?el.value.trim():undefined; };
  const d=W.details; [["age","age"],["city","city"],["comm","community"],["ded","ded"],["phone","phone"]].forEach(([id,k])=>{ const val=v("d-"+id); if(val!==undefined) d[k]=val; });
  const nm=v("d-name"); if(nm!==undefined) W.name=nm;
  const c=document.getElementById("d-consent"); if(c) W.consent=c.checked;
}
function setErr(m){ const e=$("#err"); if(e) e.textContent=m; return false; }
async function act(a, btn){
  if(a==="back"){ captureDetails(); W.step = Math.max(0, W.step-1); renderWizard(); return; }
  const em = () => (($("#a-email")||{}).value||"").trim();
  const pw = () => (($("#a-pass")||{}).value||"");
  const keep = () => { const n=$("#a-name"); if(n) W._aname=n.value.trim(); W._aemail=em(); };
  if(a==="google"){
    if(!LIVE()){ toast(t("demoGoogle")); W._authMode="signup"; renderWizard(); return; }
    saveDraft();
    try{ await window.Store.signInGoogle(); }catch(e){ console.warn(e); setErr(authErr(e)); }
    return;
  }
  if(a==="mode-signup"||a==="mode-login"){ keep(); W._authMode=a.slice(5); renderWizard(); return; }
  if(a==="signup"){
    keep(); const name=W._aname, email=W._aemail, pass=pw();
    if(!name) return setErr(t("errName"));
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErr(t("errEmail"));
    if(pass.length<8) return setErr(t("passHint"));
    btn.disabled=true; saveDraft();
    try{ await window.Store.signUpEmail(name, email, pass); W.name=name; }catch(e){ console.warn(e); btn.disabled=false; setErr(authErr(e)); }
    return;
  }
  if(a==="login"){
    keep(); const email=W._aemail, pass=pw();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErr(t("errEmail"));
    if(!pass) return setErr(t("errCreds"));
    btn.disabled=true; saveDraft();
    try{ await window.Store.signInEmail(email, pass); }catch(e){ console.warn(e); btn.disabled=false; setErr(authErr(e)); }
    return;
  }
  if(a==="reset"){
    keep(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(W._aemail)) return setErr(t("errEmailFirst"));
    try{ await window.Store.resetPassword(W._aemail); toast(t("resetSent")); setErr(t("resetSent")); }catch(e){ setErr(authErr(e)); }
    return;
  }
  if(a==="verified"){
    btn.disabled=true;
    try{ const ok = await window.Store.checkVerified(); if(!ok){ btn.disabled=false; setErr(t("notVerifiedYet")); } }catch(e){ btn.disabled=false; setErr(authErr(e)); }
    return;
  }
  if(a==="resend"){
    try{ await window.Store.resendVerification(); toast(t("resent")); }catch(e){ setErr(authErr(e)); }
    return;
  }
  if(a==="finishlink"){
    const em=($("#f-linkmail").value||"").trim();
    try{ await window.Store.finishEmailLink(em); }catch(e){ setErr(t("authErr")); }
    return;
  }
  if(a==="signout"){ await window.Store.signOut(); renderWizard(); return; }
  if(a==="smaller"||a==="bigger"){ const ti=TRACKS.indexOf(W.track)+(a==="bigger"?1:-1); if(ti<0||ti>2) return; W.track=TRACKS[ti]; W.n=subjById(W.subject).opts[W.track][W.optIdx].n; renderWizard(); toast(t("trackName")[W.track]); return; }
  if(a==="inc"||a==="dec"){ const o=subjById(W.subject).opts[W.track][W.optIdx]; const step=o.n>=50?5:1; W.n=Math.max(1,Math.min(9999,W.n+(a==="inc"?step:-step))); $("#nOut").textContent=nf(W.n)+" "+unitLabel(o.u); renderPace(); saveDraft(); return; }
  if(a==="next"){
    const s=STEPS[W.step];
    if(s==="goal" && W.subject==="custom"){ W.customText=$("#c-what").value.trim(); W.customUnit=$("#c-u").value.trim()||t("customUPh"); W.n=Math.max(1,parseInt($("#c-n").value)||1); if(!W.customText) return setErr(t("errCustom")); }
    if(s==="details"){
      captureDetails();
      if(!(S.auth&&S.auth.name) && !W.name) return setErr(t("errName"));
      if(W.rem.ch!=="mail" && !/\d{9,}/.test(W.details.phone.replace(/\D/g,""))) return setErr(t("errPhone"));
      if(!W.consent) return setErr(t("errConsent"));
      btn.disabled=true; btn.textContent=t("saving");
      try{ await commit(); }catch(e){ console.warn(e); btn.disabled=false; btn.textContent=t("commit"); return setErr(t("saveErr")); }
      W.step++; LS.del("atgar_draft"); renderWizard(); window.scrollTo(0,0); return;
    }
    W.step = (s==="signin") ? afterSignin() : W.step+1; renderWizard(); window.scrollTo(0,0);
  }
}
async function commit(){
  const isCustom = W.subject==="custom";
  const o = isCustom?null:subjById(W.subject).opts[W.track][W.optIdx];
  const base = {track:W.track, subject:W.subject, optIdx: isCustom?null:W.optIdx, n:W.n, u: isCustom?"custom":o.u, customText: isCustom?W.customText:"", customUnit: isCustom?W.customUnit:"", ded:W.details.ded||""};
  const commitment = Object.assign({}, base, {
    label:{he:labelFor(base,"he"), en:labelFor(base,"en")},
    unitLabel:{he: isCustom?W.customUnit:U.he[o.u], en: isCustom?W.customUnit:U.en[o.u]},
    start: new Date().toISOString()
  });
  const d=W.details;
  const profile = {age:d.age, gender:d.gender, sector:d.sector, city:d.city, community:d.community, communityKey: communityKey(d.community, d.city), phone: W.rem.ch==="mail" ? (d.phone||"") : d.phone};
  await window.Store.commit({profile, rem:Object.assign({},W.rem), consent:t("consent"), ref:LS.get("atgar_ref")||null, name: W.name || "", lang, commitment});
  await refreshMine();
}
async function refreshMine(){
  if(!S.auth){ S.me=null; S.commitments=[]; return; }
  try{ S.me = await window.Store.loadMe(); S.commitments = await window.Store.loadCommitments(); }catch(e){ console.warn(e); }
  const key = S.me && S.me.profile && S.me.profile.communityKey;
  S.community = null;
  if(key){ try{ const n = await window.Store.communityCount(key); if(n!=null) S.community = {name:S.me.profile.community, n}; }catch(e){} }
}

function doneHTML(c){
  if(!c) return "";
  const goal=cGoal(c), link=inviteLink();
  const fam=t("famMsg",{goal})+" "+siteBase(), inv=t("invMsg",{goal,link});
  const name=(S.auth&&S.auth.name)||W.name||"";
  return `<div class="cert">
    <img class="seal" src="${esc(window.ATGAR_ASSETS && window.ATGAR_ASSETS.emblemLight || "")}" alt="">
    <div class="eyebrow">${esc(t("certEye"))}</div>
    <div class="name">${esc(name)}</div>
    <h2>${esc(t("certH"))}</h2>
    <div class="what">${esc(goal)}</div>
    <div class="meta">${esc(c.subject==="custom"?t("customSubj"):t("certTrack",{t:t("trackName")[c.track]}))} · ${esc(t("certDate",{d:hebDate(new Date(c.start||Date.now()))}))}</div>
    ${c.ded?`<div class="ded">${esc(c.ded)}</div>`:""}
  </div>
  <div class="peak"><div class="eyebrow">600,000</div><h3>${esc(t("peakH"))}</h3><p>${esc(t("peakP1"))}</p><p>${esc(t("peakP2"))}</p></div>
  <div class="share-grid">
    <div class="share-card"><h4>${esc(t("famH"))}</h4><p>${esc(t("famP"))}</p><a class="btn btn-sm wa" href="${waLink(fam)}" target="_blank" rel="noopener">${esc(t("sendWA"))}</a></div>
    <div class="share-card"><h4>${esc(t("invH"))}</h4><p>${esc(t("invP"))}</p><div class="linkbox"><code>${esc(link)}</code><button class="btn btn-ghost btn-sm" data-copy="${esc(link)}">${esc(t("copy"))}</button></div><a class="btn btn-sm wa" href="${waLink(inv)}" target="_blank" rel="noopener">${esc(t("sendWA"))}</a></div>
  </div>
  <div class="wiz-actions"><button class="btn btn-gold" data-go="me">${esc(t("toMe"))}</button><button class="btn btn-ghost" data-act2="more">${esc(t("addMore"))}</button></div>`;
}

/* ---------- dashboard ---------- */
function expectedFor(c){ const st=new Date(c.start||c.createdAt||Date.now()), now=new Date(); const tot=SHAVUOT-st; if(tot<=0) return c.n; return Math.min(c.n, c.n*Math.max(0,(now-st))/tot); }
function encFor(p){ if(p>=1) return t("enc5"); if(p>=.75) return t("enc4"); if(p>=.5) return t("enc3"); if(p>=.25) return t("enc2"); if(p>0) return t("enc1"); return t("enc0"); }
function ringSVG(p){ const r=40, C=2*Math.PI*r; return `<svg class="ring" viewBox="0 0 96 96"><circle class="bg" cx="48" cy="48" r="${r}"/><circle class="fg" cx="48" cy="48" r="${r}" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-p)}" transform="rotate(-90 48 48)"/><text x="48" y="55" text-anchor="middle">${Math.round(p*100)}%</text></svg>`; }
let remEditing = false, remDraft = null;
function renderMe(){
  const box=$("#me");
  if(!S.ready){ box.innerHTML=`<div class="empty"><p style="color:var(--cream-dim)">…</p></div>`; return; }
  if(!S.auth){
    box.innerHTML=`<div class="me-head"><h2 style="font-size:40px">${esc(t("meH"))}</h2></div><div class="empty"><img src="${esc(window.ATGAR_ASSETS&&window.ATGAR_ASSETS.emblem||"")}" alt="" width="80" height="80"><h3 style="font-size:26px">${esc(t("meSignIn"))}</h3><button class="gbtn" data-act3="google">${G_ICON}${esc(t("gBtn"))}</button><button class="btn btn-ghost" data-act3="emaillogin">${esc(t("loginWithEmail"))}</button><button class="btn btn-gold" data-go="join">${esc(t("ctaJoin"))}</button></div>`;
    return;
  }
  if(!S.commitments.length){
    box.innerHTML=`<div class="me-head"><h2 style="font-size:40px">${esc(t("meHello",{name:firstName()}))}</h2></div><div class="empty"><svg width="56" height="56" style="color:var(--gold)"><use href="#g-seed"/></svg><h3 style="font-size:28px">${esc(t("meEmptyH"))}</h3><p style="color:var(--cream-dim)">${esc(t("meEmptyP"))}</p><button class="btn btn-gold" data-go="join">${esc(t("ctaJoin"))}</button></div>`;
    return;
  }
  const chName={wa:t("chWA"),sms:t("chSMS"),mail:t("chMail")}, frName={daily:t("fDaily"),"2w":t("f2w"),weekly:t("fWeekly")}, tmName={morning:t("tMorning"),noon:t("tNoon"),evening:t("tEvening")};
  const cards = S.commitments.map(c=>{
    const p = Math.min(1, (c.done||0)/c.n); const exp=expectedFor(c); const done=(c.done||0)>=c.n;
    const st = done?`<span class="status done">✓ ${esc(t("doneS"))}</span>` : ((c.done||0)+0.001>=exp?`<span class="status ok">● ${esc(t("onTrack"))}</span>`:`<span class="status behind">● ${esc(t("behind"))}</span>`);
    const u=cUnit(c);
    return `<article class="cm"><div class="cm-top">${ringSVG(p)}<div style="display:grid;gap:6px;min-width:0"><span class="tag">${esc(c.subject==="custom"?t("customSubj"):(subjById(c.subject)[lang]+" · "+t("trackName")[c.track]))}</span><h3>${esc(cGoal(c))}</h3><div>${st}</div></div></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px 16px;justify-content:space-between;color:var(--cream-dim);font-size:15px;font-variant-numeric:tabular-nums"><span>${esc(t("progress"))}: <b style="color:var(--cream)">${nf(c.done||0)}</b> / ${nf(c.n)} ${esc(u)}</span><span>${esc(t("paceA",{d:nf(daysLeft())}))}</span></div>
      ${!done?`<div style="font-size:14px;color:var(--cream-faint)">${esc(t("expected",{e:nf(Math.floor(exp))+" "+u}))}</div>`:""}
      <div class="log"><button class="btn btn-gold btn-sm" data-log="${esc(c.id)}" ${done?"disabled":""}>${c.u==="pct"?"+10%":"+1"}</button><label class="field" style="display:flex;gap:8px;align-items:center"><span style="font-size:14px;color:var(--cream-faint)">${esc(t("setTo"))}</span><input type="number" min="0" max="${c.n}" value="${c.done||0}" style="width:96px" id="set-${esc(c.id)}"></label><button class="btn btn-ghost btn-sm" data-set="${esc(c.id)}">${esc(t("save"))}</button></div>
      <p class="encourage">${esc(encFor(p))}</p>
      ${c.ded?`<p style="color:var(--cream-faint);font-style:italic">${esc(c.ded)}</p>`:""}
    </article>`;
  }).join("");
  const me=S.me||{}; const r=me.rem||{ch:"mail",fr:"weekly",tm:"evening"}; const active = me.reminderActive!==false;
  const link=inviteLink();
  let remPanel;
  if(remEditing){
    remPanel=`<div class="panel form" id="remPanel"><h3 style="font-size:22px">${esc(t("remSet"))}</h3>${remControls(remDraft.rem, remDraft.phone, "m")}<div class="err" id="err"></div><div style="display:flex;gap:8px"><button class="btn btn-gold btn-sm" data-rem="save">${esc(t("save"))}</button><button class="btn btn-ghost btn-sm" data-rem="cancel">${esc(t("cancel"))}</button></div></div>`;
  } else {
    remPanel=`<div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="font-size:22px">${esc(t("remSet"))}</h3><button class="btn btn-ghost btn-sm" data-rem="edit">${esc(t("remEdit"))}</button></div>
      ${active?`<dl class="kv"><dt>${esc(t("remCh"))}</dt><dd>${esc(chName[r.ch])}</dd><dt>${esc(t("remFr"))}</dt><dd>${esc(frName[r.fr])}</dd><dt>${esc(t("remAt"))}</dt><dd>${esc(tmName[r.tm])}</dd></dl>`:`<p style="color:var(--warn)">${esc(t("remPaused"))}</p>`}
      <button class="back" style="margin-top:10px;font-size:14px" data-rem="${active?"pause":"resume"}">${esc(active?t("remPause"):t("remResume"))}</button></div>`;
  }
  box.innerHTML=`<div class="me-head"><div><div class="eyebrow">${esc(t("meH"))}</div><h2 style="font-size:clamp(30px,4.4vw,44px)">${esc(t("meHello",{name:firstName()}))}</h2></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" data-act2="more">+ ${esc(t("addMore"))}</button><button class="btn btn-ghost btn-sm" data-act3="signout">${esc(t("signOut"))}</button></div></div>
   <div class="me-grid"><div>${cards}</div>
   <aside class="side">
     ${remPanel}
     ${S.community?`<div class="panel"><p style="font-family:var(--f-display);font-size:19px;color:var(--gold-hi)">${esc(t("commCount",{c:S.community.name,n:nf(S.community.n)}))}</p></div>`:""}
     <div class="panel" style="display:grid;gap:12px"><div style="display:flex;gap:12px;align-items:center"><svg width="44" height="44" style="color:var(--gold)"><use href="#g-angel"/></svg><div><h3 style="font-size:22px">${esc(t("angelBox"))}</h3><div style="color:var(--cream-dim)"><b style="font-family:var(--f-display);font-size:22px;color:var(--gold-hi)">${nf(me.invitesCount||0)}</b> ${esc(t("angelCount"))}</div></div></div><p style="color:var(--cream-dim);font-size:15px">${esc(t("invP"))}</p><div class="linkbox"><code>${esc(link)}</code><button class="btn btn-ghost btn-sm" data-copy="${esc(link)}">${esc(t("copy"))}</button></div><a class="btn btn-sm wa" href="${waLink(t("invMsg",{goal:cGoal(S.commitments[0]),link}))}" target="_blank" rel="noopener">${esc(t("sendWA"))}</a><span style="font-size:12px;color:var(--cream-faint)">${esc(t("angelDemo"))}</span></div>
   </aside></div>`;
}

/* ---------- global clicks ---------- */
function afterSignin(){ return W.subject ? 3 : 2; }
document.addEventListener("click", e=>{
  const st=e.target.closest("[data-start-track]");
  if(st){ W=freshWizard(); prefillCommunity(); W.track=st.dataset.startTrack; W.step = (S.auth&&S.auth.verified) ? 2 : 1; go("join"); return; }
  const ss=e.target.closest("[data-start-subj]");
  if(ss){ W=freshWizard(); prefillCommunity(); W.subject=ss.dataset.startSubj; if(W.subject==="custom") W.n=10; W.step=0; go("join"); return; }
});
document.addEventListener("click", async e=>{
  const c=e.target.closest("[data-copy]"); if(c){ copyText(c.dataset.copy,c); return; }
  if(e.target.closest("[data-act2='more']")){ W=freshWizard(); prefillCommunity(); W.step = 0; go("join"); return; }
  const a3=e.target.closest("[data-act3]");
  if(a3){ if(a3.dataset.act3==="signout"){ await window.Store.signOut(); go("home"); } else if(a3.dataset.act3==="google"){ if(!LIVE()){ toast(t("demoGoogle")); return; } try{ await window.Store.signInGoogle(); }catch(err){ toast(t("authErr")); } } else if(a3.dataset.act3==="emaillogin"){ W=freshWizard(); W.track="seed"; W.step=1; W._authMode="login"; W._fromMe=true; go("join"); } return; }
  const l=e.target.closest("[data-log]");
  if(l){ const cm=S.commitments.find(x=>x.id===l.dataset.log); const step=cm.u==="pct"?10:1; const v=Math.min(cm.n,(cm.done||0)+step); await saveProgress(cm, v); return; }
  const s=e.target.closest("[data-set]");
  if(s){ const cm=S.commitments.find(x=>x.id===s.dataset.set); const v=parseFloat(document.getElementById("set-"+cm.id).value); if(!isNaN(v)) await saveProgress(cm, Math.max(0,Math.min(cm.n,v))); return; }
  const rb=e.target.closest("[data-rem]");
  if(rb){ await remAction(rb.dataset.rem); return; }
  const sg=e.target.closest("#remPanel [data-seg]");
  if(sg){ const ph=document.getElementById("m-phone"); if(ph) remDraft.phone=ph.value; remDraft.rem[sg.dataset.seg]=sg.dataset.val; renderMe(); return; }
});
async function saveProgress(cm, v){
  const prev=cm.done||0; cm.done=v; renderMe();
  try{ await window.Store.updateProgress(cm.id, v); toast(v>=cm.n?t("doneS"):"✓"); }
  catch(e){ cm.done=prev; renderMe(); toast(t("saveErr")); }
}
async function remAction(k){
  const me=S.me||(S.me={});
  if(k==="edit"){ remEditing=true; remDraft={rem:Object.assign({ch:"wa",fr:"daily",tm:"evening"},me.rem||{}), phone:(me.profile&&me.profile.phone)||""}; renderMe(); return; }
  if(k==="cancel"){ remEditing=false; renderMe(); return; }
  if(k==="save"){
    const ph=document.getElementById("m-phone"); if(ph) remDraft.phone=ph.value.trim();
    if(remDraft.rem.ch!=="mail" && !/\d{9,}/.test((remDraft.phone||"").replace(/\D/g,""))) return setErr(t("errPhone"));
    try{
      if(remDraft.phone !== ((me.profile&&me.profile.phone)||"")){ me.profile=Object.assign({},me.profile,{phone:remDraft.phone}); if(window.Store.updatePhone) await window.Store.updatePhone(remDraft.phone); }
      await window.Store.updateReminders(remDraft.rem, true); me.rem=remDraft.rem; me.reminderActive=true; remEditing=false; renderMe(); toast(t("remSaved"));
    }catch(e){ setErr(t("saveErr")); }
    return;
  }
  if(k==="pause"||k==="resume"){
    try{ await window.Store.updateReminders(me.rem||{ch:"mail",fr:"weekly",tm:"evening"}, k==="resume"); me.reminderActive = k==="resume"; renderMe(); toast(t("remSaved")); }catch(e){ toast(t("saveErr")); }
  }
}

/* ---------- hero sparks ---------- */
function sparks(){
  const cv=$("#sparks"); if(!cv) return; const ctx=cv.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W2,H2,P=[]; const dpr=Math.min(2,window.devicePixelRatio||1);
  function size(){ const r=cv.getBoundingClientRect(); W2=r.width; H2=r.height; cv.width=W2*dpr; cv.height=H2*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); const count=Math.round(Math.min(140,W2/8)); P=Array.from({length:count},()=>mk(true)); }
  function mk(init){ return {x:Math.random()*W2, y: init?Math.random()*H2:H2+10, r:.6+Math.random()*1.8, v:.15+Math.random()*.55, a:.2+Math.random()*.7, w:Math.random()*Math.PI*2}; }
  function draw(){ ctx.clearRect(0,0,W2,H2); for(const p of P){ p.y-=p.v; p.w+=.02; p.x+=Math.sin(p.w)*.25; if(p.y<-10) Object.assign(p,mk(false)); const fade=Math.min(1,p.y/(H2*.35)); ctx.beginPath(); ctx.fillStyle=`rgba(236,211,145,${p.a*fade})`; ctx.shadowColor="rgba(236,180,90,.9)"; ctx.shadowBlur=8; ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); } if(!reduce) requestAnimationFrame(draw); }
  size(); addEventListener("resize",size); draw();
}

/* ---------- boot ---------- */
function prefillCommunity(){ const c=LS.get("atgar_comm"); if(c && !W.details.community) W.details.community=c; }
function captureParams(){
  const q=new URLSearchParams(location.search);
  const ref=q.get("ref"); if(ref && /^[a-z0-9]{4,12}$/i.test(ref)) LS.set("atgar_ref", ref);
  const comm=q.get("c"); if(comm) LS.set("atgar_comm", comm.slice(0,80));
  const h=(location.hash||"").slice(1);
  if(/^ref-[a-z0-9]{4,12}$/i.test(h)) LS.set("atgar_ref", h.slice(4));
}
function boot(){
  const l=LS.get("atgar_lang"); if(l==="en"||l==="he") lang=l;
  captureParams();
  const draft=loadDraft(); if(draft){ W=draft; W._linkSent=null; }
  prefillCommunity();
  applyLang(); sparks();
  window.Store.watchStats(st=>{ S.stats=st; renderStats(); });
  window.Store.init(async user=>{
    S.auth=user; await refreshMine(); S.ready=true;
    if(view==="join"){ if(user && user.verified && W._fromMe){ W=freshWizard(); LS.del("atgar_draft"); go("me"); return; } if(user && user.verified && STEPS[W.step]==="signin"){ W.step = afterSignin(); } renderWizard(); }
    if(view==="me") renderMe();
  });
  const h=(location.hash||"").slice(1);
  if(h==="join") go("join"); else if(h==="me") go("me");
}
if(window.Store) boot(); else window.addEventListener("store-ready", boot, {once:true});
})();
