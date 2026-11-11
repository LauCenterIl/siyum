/* Live store: Firebase Auth (Google + email link) and Firestore.
   Loaded as an ES module; config comes from /config.js (window.ATGAR_CONFIG). */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
         onAuthStateChanged, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
         signOut as fbSignOut, updateProfile, createUserWithEmailAndPassword, signInWithEmailAndPassword,
         sendEmailVerification, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, addDoc, query, orderBy,
         serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const cfg = window.ATGAR_CONFIG;
const app = initializeApp(cfg.firebase);
const auth = getAuth(app);
auth.languageCode = "he";
const db = getFirestore(app);
const EMAIL_KEY = "atgar_email_for_link";

function toUser(u){ return u ? {uid:u.uid, name:u.displayName||"", email:u.email||"", photo:u.photoURL||"", verified:!!u.emailVerified} : null; }
let authCb = () => {};
const verifyOpts = () => ({url: location.origin + location.pathname + "#join"});

// Finish an email-link sign-in if we arrived from one.
let pendingLink = false;
const linkReady = (async () => {
  try{
    if(isSignInWithEmailLink(auth, location.href)){
      let email = null; try{ email = localStorage.getItem(EMAIL_KEY); }catch(e){}
      if(email){ await signInWithEmailLink(auth, email, location.href); try{ localStorage.removeItem(EMAIL_KEY); }catch(e){} history.replaceState(null, "", location.pathname + "#join"); }
      else pendingLink = true;   // opened on another device: the page asks for the email
    }
    await getRedirectResult(auth).catch(()=>{});
  }catch(e){ console.warn("email-link sign-in", e); }
})();

window.Store = {
  mode: "live",
  init(cb){ authCb = cb; onAuthStateChanged(auth, u => cb(toUser(u))); },
  async signUpEmail(name, email, pass){
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, {displayName: name});
    await sendEmailVerification(cred.user, verifyOpts());
    authCb(toUser(auth.currentUser));
  },
  async signInEmail(email, pass){
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    if(!cred.user.emailVerified){ try{ await sendEmailVerification(cred.user, verifyOpts()); }catch(e){} }
  },
  async resetPassword(email){ await sendPasswordResetEmail(auth, email, verifyOpts()); },
  async resendVerification(){ if(auth.currentUser) await sendEmailVerification(auth.currentUser, verifyOpts()); },
  async checkVerified(){
    const u = auth.currentUser; if(!u) return false;
    await u.reload();
    if(!auth.currentUser.emailVerified) return false;
    await auth.currentUser.getIdToken(true);   // refresh the token so the database sees the verified email
    authCb(toUser(auth.currentUser));
    return true;
  },
  async signInGoogle(){
    const p = new GoogleAuthProvider(); p.setCustomParameters({prompt:"select_account"});
    try{ await signInWithPopup(auth, p); return "ok"; }
    catch(e){
      if(e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment" || e.code === "auth/cancelled-popup-request")){
        await signInWithRedirect(auth, p); return "redirect";
      }
      if(e && e.code === "auth/popup-closed-by-user") return "closed";
      throw e;
    }
  },
  async sendEmailLink(email){
    const url = location.origin + location.pathname + "?finishSignIn=1#join";
    await sendSignInLinkToEmail(auth, email, {url, handleCodeInApp:true});
    try{ localStorage.setItem(EMAIL_KEY, email); }catch(e){}
  },
  async signOut(){ await fbSignOut(auth); },
  needsEmailForLink(){ return pendingLink; },
  async finishEmailLink(email){
    await signInWithEmailLink(auth, email, location.href);
    pendingLink = false; history.replaceState(null, "", location.pathname + "#join");
  },
  async loadMe(){
    const u = auth.currentUser; if(!u) return null;
    const s = await getDoc(doc(db, "users", u.uid));
    return s.exists() ? s.data() : null;
  },
  async loadCommitments(){
    const u = auth.currentUser; if(!u) return [];
    const q = query(collection(db, "users", u.uid, "commitments"), orderBy("createdAt", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => Object.assign({id:d.id}, d.data(), {createdAt: d.data().createdAt && d.data().createdAt.toDate ? d.data().createdAt.toDate().toISOString() : d.data().start}));
  },
  async commit({profile, rem, consent, ref, name, lang, commitment}){
    const u = auth.currentUser; if(!u) throw new Error("not signed in");
    if(name && name !== u.displayName){ try{ await updateProfile(u, {displayName:name}); }catch(e){} }
    const uref = doc(db, "users", u.uid);
    const existing = await getDoc(uref);
    const data = {
      name: name || u.displayName || "", email: u.email || "", lang,
      profile, rem, reminderActive: true,
      consent: {at: serverTimestamp(), text: consent},
      updatedAt: serverTimestamp()
    };
    if(ref && !(existing.exists() && existing.data().ref)) data.ref = ref;
    await setDoc(uref, data, {merge:true});
    const c = Object.assign({}, commitment, {done:0, createdAt: serverTimestamp()});
    const r = await addDoc(collection(db, "users", u.uid, "commitments"), c);
    return r.id;
  },
  async updateProgress(id, done){
    const u = auth.currentUser; if(!u) return;
    await updateDoc(doc(db, "users", u.uid, "commitments", id), {done, updatedAt: serverTimestamp()});
  },
  async updatePhone(phone){
    const u = auth.currentUser; if(!u) return;
    await updateDoc(doc(db, "users", u.uid), {"profile.phone": phone, updatedAt: serverTimestamp()});
  },
  async updateReminders(rem, active){
    const u = auth.currentUser; if(!u) return;
    await updateDoc(doc(db, "users", u.uid), {rem, reminderActive: !!active, updatedAt: serverTimestamp()});
  },
  watchStats(cb){
    onSnapshot(doc(db, "stats", "global"), s => { if(s.exists()) cb(s.data()); }, () => {});
  },
  async communityCount(key){
    if(!key) return null;
    const s = await getDoc(doc(db, "communities", key));
    return s.exists() ? (s.data().commitments || 0) : 0;
  }
};
window.dispatchEvent(new Event("store-ready"));
