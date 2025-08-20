// Storage keys (must match index.js)
const LS_USERS = "auth_users_v1";
const SS_SESSION = "auth_session_v1";

function loadUsers(){ try { return JSON.parse(localStorage.getItem(LS_USERS)) ?? []; } catch { return []; } }
function saveUsers(users){ localStorage.setItem(LS_USERS, JSON.stringify(users)); }
function getSession(){ try { return JSON.parse(sessionStorage.getItem(SS_SESSION)); } catch { return null; } }

function hashHue(str){ let h=0; for(let i=0;i<str.length;i++) h=(h*31+str.charCodeAt(i))>>>0; return h%360; }
function setAvatarCircle(el, email, dataUrl){
  if (dataUrl){ el.style.backgroundImage = `url(${dataUrl})`; el.style.backgroundSize='cover'; el.textContent = ''; return; }
  const initial = (email||'?').charAt(0).toUpperCase();
  el.textContent = initial;
  el.style.backgroundImage = 'none';
  el.style.backgroundColor = `hsl(${hashHue(email)} 70% 40%)`;
}

function deriveDefaults(user){
  const [local] = user.email.split('@');
  const display = user.profile?.displayName || (user.profile?.firstName || local);
  const username = user.profile?.username || local;
  return { display, username };
}

function uniqueUsername(desired, users, currentId){
  const base = desired.trim() || "user";
  let u = base, i = 1;
  const taken = new Set(users.filter(x => x.id !== currentId).map(x => (x.profile?.username||"").toLowerCase()));
  while (taken.has(u.toLowerCase())) u = `${base}${i++}`;
  return u;
}

document.addEventListener('DOMContentLoaded', () => {
  const status = document.getElementById('status');
  const emailEl = document.getElementById('email');
  const displayEl = document.getElementById('displayName');
  const firstEl = document.getElementById('firstName');
  const lastEl = document.getElementById('lastName');
  const userEl = document.getElementById('username');
  const photoInput = document.getElementById('photoInput');
  const avatar = document.getElementById('avatar');
  const form = document.getElementById('settingsForm');
  const cancelBtn = document.getElementById('cancelBtn');

  // auth guard
  const sess = getSession();
  if (!sess) { alert("Sign in first"); location.href = "../Index.html"; return; }

  const users = loadUsers();
  const user = users.find(u => u.id === sess.userId);
  if (!user) { alert("Session expired"); location.href = "../Index.html"; return; }

  // populate
  emailEl.value = user.email;
  const { display, username } = deriveDefaults(user);
  displayEl.value = display;
  firstEl.value = user.profile?.firstName || '';
  lastEl.value = user.profile?.lastName || '';
  userEl.value = username;
  setAvatarCircle(avatar, user.email, user.profile?.avatar);

  // avatar upload
  photoInput.addEventListener('change', () => {
    const f = photoInput.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { setAvatarCircle(avatar, user.email, reader.result); avatar.dataset.new = reader.result; };
    reader.readAsDataURL(f);
  });

  // cancel
  cancelBtn.addEventListener('click', () => history.back());

  // save
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    status.textContent = ''; status.classList.remove('error');

    // basic validation
    const disp = displayEl.value.trim();
    if (!disp) { status.textContent = "Display name cannot be empty"; status.classList.add('error'); return; }

    // ensure username uniqueness
    let desired = userEl.value.trim();
    desired = desired || user.email.split('@')[0];
    const finalUsername = uniqueUsername(desired, users, user.id);

    // apply updates
    user.profile = user.profile || {};
    user.profile.displayName = disp;
    user.profile.firstName = firstEl.value.trim();
    user.profile.lastName = lastEl.value.trim();
    user.profile.username = finalUsername;
    if (avatar.dataset.new) user.profile.avatar = avatar.dataset.new;

    saveUsers(users);
    status.textContent = "Saved!";
    // optional: go back after a short delay
    setTimeout(() => { history.back(); }, 600);
  });
});
