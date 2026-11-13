'use strict';
/* App shell: boot, login, sidebar, routing, global search, live sync. */

const NAV = [
  ['', [['dashboard', 'Dashboard']]],
  ['Front desk', [['leads', 'Patient enquiries'], ['inbox', 'Inbox'], ['patients', 'Patients'], ['appointments', 'Appointments'], ['followups', 'Follow-ups']]],
  ['Clinical', [['ipd', 'IPD & beds'], ['doctors', 'Doctors'], ['departments', 'Departments'], ['staff', 'Staff & shifts']]],
  ['Business', [['billing', 'Billing & invoices'], ['campaigns', 'Campaigns'], ['reports', 'Reports']]],
  ['Administration', [['integrations', 'Integrations'], ['users', 'User management'], ['settings', 'Settings']]],
];
const ADMIN_ONLY = ['integrations', 'users', 'settings'];
const app = () => $('#app');

function badgeCounts() {
  const t = today();
  return {
    leads: all('leads').filter(l => l.status === 'New').length,
    inbox: all('messages').filter(m => !m.read).length,
    followups: all('followups').filter(f => f.status === 'Pending' && f.dueDate <= t).length,
  };
}
function updateBadges() {
  const c = badgeCounts();
  $$('.nav a').forEach(a => { const n = c[a.dataset.page], b = $('.count', a); if (b) { b.textContent = n || ''; b.hidden = !n; } });
}

function renderShell() {
  const nav = NAV.map(([sec, items]) => {
    if (sec === 'Administration' && !isAdmin()) return '';
    return (sec ? `<div class="nav-sec">${sec}</div>` : '') + items.map(([id, label]) => `<a href="#/${id}" data-page="${id}">${icon(id)}<span>${label}</span><b class="count" hidden></b></a>`).join('');
  }).join('');
  app().innerHTML = `
    <aside class="side"><div class="brand"><span class="logo">✚</span><div><b>${esc(cfg().hospitalName)}</b><small>Hospital dashboard</small></div></div><nav class="nav">${nav}</nav></aside>
    <div class="main">
      <header class="top"><button class="menu-btn" aria-label="Menu">${icon('menu')}</button>
        <div class="search">${icon('search')}<input type="search" id="gsearch" placeholder="Search patient ID, name or mobile…" autocomplete="off"><div class="suggest" hidden></div></div>
        <span class="spacer"></span>
        <div class="me"><b>${esc(S.user.name)}</b><small>${esc(S.user.role)}${S.mode === 'demo' ? ' · demo' : ''}</small></div>
        ${S.mode === 'api' ? '<button class="btn ghost sm" id="logout">Log out</button>' : ''}</header>
      ${S.mode === 'demo' ? '<div class="demo-bar">Demo mode – sample data saved only in this browser. After hosting on Hostinger with the database, real data and integrations become active.</div>' : ''}
      <main id="page"></main>
    </div>`;
  $('.menu-btn').onclick = () => document.body.classList.toggle('nav-open');
  $('.nav').onclick = () => document.body.classList.remove('nav-open');
  const lo = $('#logout');
  if (lo) lo.onclick = async () => { await api('logout').catch(() => {}); location.reload(); };
  wireSearch();
  route();
}

function wireSearch() {
  const inp = $('#gsearch'), box = $('.suggest');
  const run = () => {
    const q = inp.value.trim().toLowerCase(), qd = digits(q);
    if (q.length < 2) { box.hidden = true; return; }
    const hit = (x, pid) => (pid && pid.toLowerCase().includes(q)) || x.name.toLowerCase().includes(q) || (qd.length >= 3 && String(x.phone).includes(qd));
    const pats = all('patients').filter(p => hit(p, p.pid)).sort((a, b) => (b.pid.toLowerCase().startsWith(q) - a.pid.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name)).slice(0, 7);
    const leads = all('leads').filter(l => !l.patientId && hit(l)).slice(0, 5);
    box.innerHTML = (pats.length ? '<small>Patients</small>' + pats.map(p => `<a href="#" data-pat="${p.id}"><b class="pid">${esc(p.pid)}</b><span>${esc(p.name)}</span><i>${esc(p.phone)}</i>${stageBadge(p.stage)}</a>`).join('') : '') +
      (leads.length ? '<small>Enquiries (no patient ID yet)</small>' + leads.map(l => `<a href="#" data-lead="${l.id}"><span>${esc(l.name)}</span><i>${esc(l.phone)}</i>${badge(l.status, statusKind(l.status))}</a>`).join('') : '') ||
      '<p class="empty">No patient or enquiry found.</p>';
    box.hidden = false;
  };
  inp.oninput = run;
  inp.onfocus = run;
  inp.onkeydown = e => { if (e.key === 'Enter') { const a = $('a', box); if (a && !box.hidden) a.click(); } else if (e.key === 'Escape') box.hidden = true; };
  box.onclick = e => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault(); box.hidden = true; inp.value = '';
    if (a.dataset.pat) patientView(a.dataset.pat);
    else { const l = get('leads', a.dataset.lead); VS.leads = { q: l.phone || l.name, from: '', to: '', f: {}, limit: 100 }; if (location.hash === '#/leads') refresh(); else location.hash = '#/leads'; }
  };
  document.addEventListener('click', e => { if (!e.target.closest('.search')) box.hidden = true; });
}

async function route() {
  let id = location.hash.replace(/^#\/?/, '') || 'dashboard';
  if (!PAGES[id] || (ADMIN_ONLY.includes(id) && !isAdmin())) id = 'dashboard';
  const root = $('#page');
  if (!root) return;
  root.onclick = root.onchange = null;
  $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.page === id));
  try { await PAGES[id](root); } catch (e) { console.error(e); root.innerHTML = `<div class="card"><p class="empty">Something went wrong showing this page: ${esc(e.message)}</p></div>`; }
  updateBadges();
}
function refresh() { const y = window.scrollY; return route().then(() => window.scrollTo(0, y)); }
window.addEventListener('hashchange', () => { if ($('#page')) { window.scrollTo(0, 0); route(); } });

/* ---------- login / first-time setup ---------- */
function authScreen(kind, msg) {
  const setup = kind === 'setup';
  app().innerHTML = `<div class="auth"><form class="auth-card form">
    <div class="brand dark"><span class="logo">✚</span><div><b>Hospital dashboard</b><small>${kind === 'error' ? 'Setup needed' : setup ? 'Create the admin account' : 'Sign in to continue'}</small></div></div>
    ${kind === 'error' ? `<p class="form-err">${esc(msg)}</p><p class="muted">See the README for the 3 hosting steps. You can still look around with sample data.</p><button type="button" class="btn primary" data-demo>Open demo mode</button>` : `
    ${setup ? '<label class="field full"><span>Your name</span><input name="name" required></label>' : ''}
    <label class="field full"><span>Username</span><input name="username" required autocomplete="username"></label>
    <label class="field full"><span>Password${setup ? ' (min 8 characters)' : ''}</span><input name="password" type="password" required autocomplete="${setup ? 'new-password' : 'current-password'}"></label>
    <div class="form-err" hidden></div><button class="btn primary">${setup ? 'Create account' : 'Log in'}</button>`}
  </form></div>`;
  const f = $('form', app()), demo = $('[data-demo]', f);
  if (demo) demo.onclick = startDemo;
  f.onsubmit = async e => {
    e.preventDefault();
    const err = $('.form-err', f);
    try { S.user = (await api(setup ? 'setup' : 'login', readForm(f))).user; await startLive(); }
    catch (x) { err.textContent = x.message; err.hidden = false; }
  };
  const first = $('input', f);
  if (first) first.focus();
}

/* ---------- live mode ---------- */
let pollTimer = null;
async function pollNow() {
  const before = all('leads').length;
  try {
    if (!(await syncFromServer())) return;
  } catch (e) { if (e.status === 401) { clearInterval(pollTimer); authScreen('login'); } return; }
  const added = all('leads').length - before;
  if (added > 0) toast(added + ' new enquir' + (added === 1 ? 'y' : 'ies') + ' received');
  const busy = modalOpen() || /^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '');
  if (busy) updateBadges(); else refresh();
}
async function startLive() {
  S.mode = 'api'; S.lastSync = 0;
  await syncFromServer();
  if (!DB.settings.main && !all('doctors').length && isAdmin()) seedBase(); // first run: sample doctors, departments, beds
  renderShell();
  clearInterval(pollTimer);
  pollTimer = setInterval(pollNow, 15000);
  const yt = () => api('yt_sync').catch(() => {});
  yt(); setInterval(yt, 5 * 60000);
}

function startDemo() {
  S.mode = 'demo';
  S.user = { id: 'u1', username: 'admin', name: 'Demo Admin', role: 'Admin' };
  let ok = false;
  try {
    const j = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (j && j.DB && j.DB.doctors) { COLS.forEach(c => { DB[c] = j.DB[c] || {}; }); S.users = j.users || []; ok = true; }
  } catch (e) { /* ignore */ }
  if (!ok) seedDemo();
  renderShell();
}

(async function boot() {
  try {
    const j = await api('status');
    if (j.setup) return authScreen('setup');
    if (!j.user) return authScreen('login');
    S.user = j.user;
    await startLive();
  } catch (e) {
    if (e.noBackend) startDemo(); else authScreen('error', e.message);
  }
})();
