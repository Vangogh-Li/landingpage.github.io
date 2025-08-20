document.addEventListener('DOMContentLoaded', () => {
  // 1) Always start at the very top on load/refresh
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  // 2) If a hash is present from a previous click (e.g., #sat), remove it
  if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }

  // 3) Smooth-scroll to in-page sections WITHOUT changing the URL
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      const target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
});





/* =========================================================
   SECTION A — LOCAL AUTH (no server)
   - Users in localStorage, session in sessionStorage
   - Seeds admin (admin@gmail.com / admin123) on first run
   ========================================================= */

   const LS_USERS = "auth_users_v1";
   const SS_SESSION = "auth_session_v1";
   
   /* utils */
   const enc = new TextEncoder();
   const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
   const fromB64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
   
   function loadUsers(){ try { return JSON.parse(localStorage.getItem(LS_USERS)) ?? []; } catch { return []; } }
   function saveUsers(users){ localStorage.setItem(LS_USERS, JSON.stringify(users)); }
   function setSession(userId){ sessionStorage.setItem(SS_SESSION, JSON.stringify({ userId })); }
   function getSession(){ try { return JSON.parse(sessionStorage.getItem(SS_SESSION)); } catch { return null; } }
   function clearSession(){ sessionStorage.removeItem(SS_SESSION); }
   
   /* password derivation (PBKDF2) */
   async function derive(password, saltB64, iterations = 150000) {
     if (!window.crypto?.subtle) return { hash: password, salt: saltB64 ?? "", iterations: 1, weak: true };
     const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
     const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
     const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
     return { hash: b64(bits), salt: b64(salt), iterations, weak: false };
   }
   async function verify(password, user) {
     const { hash } = await derive(password, user.pw.salt, user.pw.iterations);
     return hash === user.pw.hash;
   }
   
   /* seed first admin */
   async function seedAdminIfEmpty() {
     const users = loadUsers();
     if (users.length) return;
     const pw = await derive("admin123");
     users.push({
       id: crypto.getRandomValues(new Uint32Array(1))[0],
       email: "admin@gmail.com",
       pw,
       is_admin: 1,
       created_at: new Date().toISOString(),
     });
     saveUsers(users);
   }
   
   /* public auth API (local) */
   async function signUp(email, password) {
     email = String(email||"").trim().toLowerCase();
     if (!email || !password) throw new Error("Email and password required");
     const users = loadUsers();
     if (users.some(u => u.email === email)) throw new Error("Email already registered");
     const pw = await derive(password);
     const user = {
       id: crypto.getRandomValues(new Uint32Array(1))[0],
       email, pw,
       is_admin: users.length === 0 ? 1 : 0,
       created_at: new Date().toISOString(),
     };
     users.push(user); saveUsers(users); setSession(user.id);
     return { user: { id:user.id, email:user.email, is_admin:user.is_admin, created_at:user.created_at } };
   }
   async function signIn(email, password) {
     email = String(email||"").trim().toLowerCase();
     const users = loadUsers();
     const user = users.find(u => u.email === email);
     if (!user) throw new Error("Invalid credentials");
     if (!(await verify(password, user))) throw new Error("Invalid credentials");
     setSession(user.id);
     return { user: { id:user.id, email:user.email, is_admin:user.is_admin, created_at:user.created_at } };
   }
   async function signOut(){ clearSession(); return { ok:true }; }
   async function getMe(){
     const s = getSession(); if (!s) return { user:null };
     const u = loadUsers().find(x => x.id === s.userId);
     return { user: u ? { id:u.id, email:u.email, is_admin:u.is_admin, created_at:u.created_at } : null };
   }
   async function adminListUsers({ page=1, pageSize=20, q="" }={}) {
     const me = await getMe(); if (!me.user?.is_admin) throw new Error("Admin only");
     let rows = loadUsers().map(u => ({ id:u.id, email:u.email, is_admin:u.is_admin, created_at:u.created_at }))
                          .sort((a,b)=>b.id-a.id);
     if (q) rows = rows.filter(u => u.email.toLowerCase().includes(q.toLowerCase()));
     const total = rows.length, start = (page-1)*pageSize;
     return { page, pageSize, total, users: rows.slice(start, start+pageSize) };
   }
   
   /* =========================================================
      SECTION B — AVATAR + LABEL HELPERS
      ========================================================= */
   function hashHue(str){ let h=0; for(let i=0;i<str.length;i++) h=(h*31+str.charCodeAt(i))>>>0; return h%360; }
   function formatUserLabel(email){
     const [local, domain=""] = String(email).split("@");
     const short = local.length > 10 ? local.slice(0,10) + "…" : local;
     return `${short} @ ${domain}`;
   }
   
   /* =========================================================
      SECTION C — SETTINGS PAGE NAV (from dropdown)
      ========================================================= */
   function openSettingsPage(){ location.href = "account/settings.html"; }


   // read the full, current user from storage
function getStoredUser() {
    const s = getSession();
    if (!s) return null;
    return loadUsers().find(u => u.id === s.userId) || null;
  }
  
  // build avatar HTML (uses uploaded photo if present; else initial w/ color)
  function avatarMarkup(user) {
    const hue = hashHue(user.email || "");
    const initial = (user.profile?.displayName?.[0] || user.email?.[0] || "?").toUpperCase();
    return user.profile?.avatar
      ? `<span class="avatar" style="--avatar-hue:${hue}"><img src="${user.profile.avatar}" alt="" /></span>`
      : `<span class="avatar" style="--avatar-hue:${hue}">${initial}</span>`;
  }
  
  // re-render pill from the latest storage state
  function refreshUserMenu() {
    const u = getStoredUser();
    if (u) renderUserMenu(u);
  }
  
   
   /* =========================================================
      SECTION D — USER PILL (builds avatar, label, dropdown)
      ========================================================= */
      function displayLabel(user) {
        const name = (user.profile?.displayName || "").trim();
        if (name) return name;                                 // ✅ prefer display name
        if (user.profile?.username) return user.profile.username; // fallback
        return (user.email || "").split("@")[0] || "user";        // last fallback
      }
      

      function renderUserMenu(userLike) {
        const nav = document.querySelector(".navbar");
        if (!nav) return;
      
        // use freshest user from storage so Settings updates reflect
        const full = loadUsers().find(u => u.id === userLike.id) || userLike;
      
        // ✨ label is the Display Name (then username, then local part)
        const labelText = displayLabel(full);
      
        // clean previous
        nav.querySelector("#signInLink")?.closest("li")?.remove();
        nav.querySelectorAll(".user-menu").forEach(m => m.remove());
      
        const li = document.createElement("li");
        li.className = "user-menu";
        li.innerHTML = `
          <button class="user-btn" id="userBtn" aria-expanded="false">
            ${avatarMarkup(full)}
            <span class="user-label">${labelText}</span>
            <svg class="user-chev" viewBox="0 0 24 24"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>
          </button>
          <div class="user-dropdown" id="userDropdown" role="menu">
            <button class="user-item" id="settingsBtn" type="button">Settings</button>
            <button class="user-item danger" id="signoutBtn" type="button">Sign out</button>
          </div>
        `;
        nav.appendChild(li);
      
        const btn = li.querySelector("#userBtn");
        const toggle = open => { li.classList.toggle("open", open); btn.setAttribute("aria-expanded", open ? "true":"false"); };
        btn.addEventListener("click", () => toggle(!li.classList.contains("open")));
        document.addEventListener("click", e => { if (!li.contains(e.target)) toggle(false); });
        document.addEventListener("keydown", e => { if (e.key === "Escape") toggle(false); });
      
        li.querySelector("#settingsBtn").onclick = () => { location.href = "account/settings.html"; };
        li.querySelector("#signoutBtn").onclick = async () => {
          await signOut();
          li.remove();
          nav.insertAdjacentHTML("beforeend", '<li><a href="#" id="signInLink">Sign In</a></li>');
          document.getElementById("signInLink").addEventListener("click", (e) => { e.preventDefault(); createModal("signin"); });
        };
      }
      
      
   
   /* =========================================================
      SECTION E — AUTH MODAL (Sign in / Sign up)
      ========================================================= */
   function createModal(type) {
     document.querySelectorAll(".modal").forEach(m => m.remove());
     const modal = document.createElement("div");
     modal.className = "modal";
     modal.innerHTML = `
       <div class="modal__panel">
         <button class="modal__close" type="button" aria-label="Close">&times;</button>
         <h2>${type === 'signin' ? 'Sign in' : 'Create account'}</h2>
         <form id="${type}Form" autocomplete="on" novalidate>
           <label>Email
             <input type="email" name="email" required />
           </label>
           <label>Password
             <input type="password" name="password" required />
           </label>
           ${type === 'signup' ? `
             <label>Confirm Password
               <input type="password" name="confirm" required />
             </label>` : ''}
           <button type="submit" class="btn-primary">
             ${type === 'signin' ? 'Sign In' : 'Sign Up'}
           </button>
           <div class="form-error" aria-live="polite" style="margin-top:10px;color:#ffb3b3;"></div>
         </form>
         <p class="auth-footer">
           ${type === 'signin'
             ? `Don’t have an account?
                 <button class="linklike" id="switchToSignUp" type="button">Create one</button>`
             : `Already have an account?
                 <button class="linklike" id="switchToSignIn" type="button">Sign in</button>`}
         </p>
       </div>
     `;
   
     // close
     modal.querySelector(".modal__close").onclick = () => modal.remove();
     modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
     document.addEventListener("keydown", (e) => { if (e.key === "Escape") modal.remove(); }, { once: true });
   
     // switch
     if (type === "signin") {
       modal.querySelector("#switchToSignUp").onclick = () => { modal.remove(); createModal("signup"); };
     } else {
       modal.querySelector("#switchToSignIn").onclick = () => { modal.remove(); createModal("signin"); };
     }
   
     // submit
     const form = modal.querySelector("form");
     const errorBox = form.querySelector(".form-error");
     form.addEventListener("submit", async (e) => {
       e.preventDefault();
       errorBox.textContent = "";
       const email = form.elements.email.value.trim();
       const password = form.elements.password.value;
   
       if (type === "signup") {
         const confirm = form.elements.confirm.value;
         if (password !== confirm) { errorBox.textContent = "Passwords do not match"; return; }
       }
   
       try {
         const { user } = await (type === "signin" ? signIn(email, password) : signUp(email, password));
         renderUserMenu(user);   // swap Sign In -> user pill
         modal.remove();
       } catch (err) {
         errorBox.textContent = err.message || "Something went wrong";
       }
     });
   
     document.body.appendChild(modal);
   }
   
   /* =========================================================
      SECTION F — BOOTSTRAP ON LOAD
      ========================================================= */
   document.addEventListener("DOMContentLoaded", async () => {
     await seedAdminIfEmpty();
   
     // show pill if already signed in
     const me = await getMe();
     if (me.user) renderUserMenu(me.user);
   
     // wire "Sign In" link
     const signInBtn = document.getElementById("signInLink");
     if (signInBtn) {
       signInBtn.addEventListener("click", (e) => { e.preventDefault(); createModal("signin"); });
     } else {
       console.warn('No element with id="signInLink" found.');
     }
   });
   
   // When returning from settings (bfcache) or when localStorage changes
window.addEventListener("pageshow", refreshUserMenu);
window.addEventListener("storage", (e) => {
  if (e.key === LS_USERS) refreshUserMenu();
});

















/* ===== Home personalization & practice ===== */
const LS_PROGRESS = "math_progress_v1";

// tiny sample topics & daily problems
const TOPICS = [
  { id:"alg",  title:"Algebra",         color:220 },
  { id:"geo",  title:"Geometry",        color:140 },
  { id:"tri",  title:"Trigonometry",    color:10  },
  { id:"cal",  title:"Calculus",        color:270 },
  { id:"prob", title:"Probability",     color:35  },
  { id:"nt",   title:"Number Theory",   color:300 }
];
const DAILY = [
  { id:"d1", text:"Solve: \\(2x + 3 = 11\\). What is x?", answer:"4" },
  { id:"d2", text:"Compute: \\(\\frac{3}{4} + \\frac{5}{8}\\).", answer:"1.375" },
  { id:"d3", text:"Derivative of \\(x^3\\)?", answer:"3x^2" }
];

function getProgress(){ try { return JSON.parse(localStorage.getItem(LS_PROGRESS)) ?? {}; } catch { return {}; } }
function setProgress(p){ localStorage.setItem(LS_PROGRESS, JSON.stringify(p)); }

// hero personalization
async function personalizeHero() {
  const me = await getMe();
  const heroTitle = document.getElementById("heroTitle");
  const heroSub   = document.getElementById("heroSub");
  const btn       = document.getElementById("primaryCta");
  if (!heroTitle || !btn) return;

  if (me.user) {
    // display name (≤20) from your helper if present
    const name = (me.user.profile?.displayName || me.user.email.split("@")[0]).slice(0,20);
    heroTitle.textContent = `Welcome back, ${name}!`;
    heroSub.textContent   = "Pick up where you left off.";
    const last = getProgress().lastTopicId || TOPICS[0].id;
    btn.textContent = "Continue practicing";
    btn.href = `practice.html?topic=${encodeURIComponent(last)}`; // stub page
  } else {
    btn.textContent = "Start practicing";
    btn.href = "#topics";
  }
}

// topics grid
function renderTopics() {
  const wrap = document.getElementById("topics");
  if (!wrap) return;
  const prog = getProgress();
  wrap.innerHTML = TOPICS.map(t => {
    const pct = Math.round((prog[t.id]?.completed ?? 0) * 100);
    return `
      <article class="topic" style="--h:${t.color}">
        <h3>${t.title}</h3>
        <div class="progress">${pct}% complete</div>
        <a class="btn" href="practice.html?topic=${t.id}">Practice</a>
      </article>`;
  }).join("");
}

// daily challenge (very small demo)
function pickDaily() {
  const dayIndex = Math.floor(Date.now() / (1000*60*60*24)) % DAILY.length;
  return DAILY[dayIndex];
}
function setupDaily() {
  const p = pickDaily();
  const el = document.getElementById("dailyProblem");
  const badge = document.getElementById("streakBadge");
  const form = document.getElementById("dailyForm");
  const ans = document.getElementById("dailyAnswer");
  const fb  = document.getElementById("dailyFeedback");
  if (!el || !form) return;

  el.innerHTML = p.text;
  // MathJax (optional) – add this <script> tag in your Index.html <head> once:
  // <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js" defer></script>
  if (window.MathJax?.typesetPromise) MathJax.typesetPromise([el]);

  const store = getProgress();
  const streak = store.streak ?? 0;
  badge.textContent = `🔥 ${streak}-day streak`;
  fb.textContent = "";

  form.onsubmit = (e) => {
    e.preventDefault();
    const ok = ans.value.trim() === p.answer;
    fb.textContent = ok ? "Correct! +10 XP" : "Not quite — try again";
    fb.style.color = ok ? "#9fdf9f" : "#ffb3b3";
    if (ok) {
      store.streak = (store.lastDailyId === p.id) ? streak : streak + 1;
      store.lastDailyId = p.id;
      setProgress(store);
      badge.textContent = `🔥 ${store.streak}-day streak`;
    }
  };
}

// boot this section after your existing DOMContentLoaded runs
document.addEventListener("DOMContentLoaded", () => {
  personalizeHero();
  renderTopics();
  setupDaily();
});
