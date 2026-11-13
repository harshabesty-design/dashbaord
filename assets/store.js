'use strict';
/* Data layer: in-memory DB synced to the PHP API (live) or localStorage (demo). */

const COLS = ['settings', 'leads', 'messages', 'patients', 'appointments', 'followups', 'doctors',
  'departments', 'staff', 'beds', 'admissions', 'invoices', 'campaigns'];
const DB = {};
COLS.forEach(c => { DB[c] = {}; });
const S = { mode: 'demo', user: null, lastSync: 0, users: [] };
const LS_KEY = 'hms_demo_v1';

/* ---------- small helpers ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowISO = () => new Date().toISOString();
const pad = n => String(n).padStart(2, '0');
const ymd = d => { d = d instanceof Date ? d : new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const today = () => ymd(new Date());
const addDays = (n, from) => { const d = from ? new Date(from + 'T00:00') : new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const toDate = s => new Date(s && s.length === 10 ? s + 'T00:00' : s);
const fmtDate = s => { if (!s) return ''; const d = toDate(s); return isNaN(d) ? s : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); };
const fmtTime = t => { if (!t) return ''; const h = +t.slice(0, 2); return ((h % 12) || 12) + ':' + t.slice(3, 5) + (h < 12 ? ' AM' : ' PM'); };
const fmtDT = s => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? s : fmtDate(ymd(d)) + ', ' + fmtTime(pad(d.getHours()) + ':' + pad(d.getMinutes())); };
const money = n => '₹' + (Math.round((+n || 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const digits = s => String(s || '').replace(/\D/g, '');
const phone10 = s => digits(s).slice(-10);

/* ---------- CRUD ---------- */
const all = c => Object.values(DB[c]);
const get = (c, id) => DB[c][id] || null;

function save(c, doc) {
  if (!doc.id) doc.id = uid();
  if (!doc.createdAt) doc.createdAt = nowISO();
  doc.updatedAt = nowISO();
  DB[c][doc.id] = doc;
  if (S.mode === 'api') api('save', { col: c, doc }).catch(e => toast('Could not save: ' + e.message, 'err'));
  else persistLocal();
  return doc;
}

function remove(c, id) {
  delete DB[c][id];
  if (S.mode === 'api') api('delete', { col: c, id }).catch(e => toast('Could not delete: ' + e.message, 'err'));
  else persistLocal();
}

let lsTimer = null;
function persistLocal() {
  clearTimeout(lsTimer);
  lsTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ DB, users: S.users })); } catch (e) { /* storage full or blocked */ }
  }, 150);
}

async function api(a, body) {
  let r, j;
  try {
    r = await fetch('api/index.php?a=' + a, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'hms' },
      body: JSON.stringify(body || {}),
    });
    j = JSON.parse(await r.text());
  } catch (e) { const err = new Error('Server not reachable'); err.noBackend = true; throw err; }
  if (!j.ok) { const err = new Error(j.error || 'Request failed'); err.status = r.status; throw err; }
  return j;
}

/** Pulls records changed on the server (new leads from webhooks, edits by other users). Returns true if anything changed. */
async function syncFromServer() {
  const j = await api('load', { since: S.lastSync });
  let changed = false;
  j.rows.forEach(([c, d]) => {
    if (!DB[c] || !d || !d.id) return;
    const cur = DB[c][d.id];
    if (cur && cur.updatedAt >= d.updatedAt) return;
    DB[c][d.id] = d; changed = true;
  });
  j.gone.forEach(([c, id]) => { if (DB[c] && DB[c][id]) { delete DB[c][id]; changed = true; } });
  S.lastSync = j.now;
  return changed;
}

/* ---------- settings ---------- */
const BOOK_OPD = 'Appointment / OPD booked';
const BOOK_SURG = 'Direct surgery';
const STAGES = ['OPD booked', 'OPD done', 'Surgery advised', 'Surgery scheduled', 'Admitted', 'Surgery done', 'Discharged', 'Treatment completed'];
const DEFAULTS = {
  id: 'main',
  hospitalName: 'My Hospital',
  address: 'Hospital address line, City, State – PIN',
  phone: '', email: '', gstin: '', countryCode: '91', defaultGst: 18,
  opdFee: 500,
  invoiceFooter: 'Thank you. Wishing you a speedy recovery.',
  leadSources: ['Meta Ads – Facebook', 'Meta Ads – Instagram', 'Facebook comment', 'Facebook message', 'Instagram comment',
    'Instagram message', 'WhatsApp', 'YouTube comment', 'Phone call', 'Website', 'Walk-in', 'Referral', 'Other'],
  leadStatuses: ['New', 'Interested', 'Call back later', 'Not reachable', 'Just an enquiry', 'Not interested', 'Fake caller'],
  paymentModes: ['Cash', 'UPI', 'Card', 'Net banking', 'Cheque', 'Insurance / TPA'],
  waTemplates: [
    { name: 'Follow-up', text: 'Hello {name}, this is {hospital}. We are following up on your enquiry. Would you like to book a consultation? Please reply here or call us.' },
    { name: 'Appointment confirmation', text: 'Hello {name}, your appointment at {hospital} is confirmed with {doctor} on {date} at {time}. Your patient ID is {pid}. Please arrive 10 minutes early.' },
    { name: 'Appointment rescheduled', text: 'Hello {name}, your appointment at {hospital} has been rescheduled to {date} at {time} with {doctor}. Patient ID: {pid}.' },
    { name: 'Surgery reminder', text: 'Hello {name}, this is a reminder from {hospital} about your surgery on {date} at {time} with {doctor}. Please follow the pre-surgery instructions given to you.' },
    { name: 'Payment reminder', text: 'Hello {name}, this is {hospital}. A balance of {balance} is pending on your bill {invoice}. Kindly clear it at your convenience. Thank you.' },
  ],
};
const cfg = () => Object.assign({}, DEFAULTS, DB.settings.main || {});
const leadStatusList = () => { const l = cfg().leadStatuses.slice(); l.splice(1, 0, BOOK_OPD, BOOK_SURG); return l; };

/* ---------- domain helpers ---------- */

/** Patient ID = first 4 letters of the name + last 4 digits of the mobile number (e.g. RAME4321). */
function makePid(name, phone, selfId) {
  const n = (String(name || '').toUpperCase().replace(/[^A-Z]/g, '') + 'XXXX').slice(0, 4);
  const p = ('0000' + digits(phone)).slice(-4);
  const base = n + p;
  const taken = id => all('patients').some(x => x.pid === id && x.id !== selfId);
  let pid = base, i = 2;
  while (taken(pid)) pid = base + '-' + (i++);
  return pid;
}

const patient = id => get('patients', id);
const doctor = id => get('doctors', id);
const docName = id => (doctor(id) || {}).name || '—';
const patName = id => (patient(id) || {}).name || '—';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Availability windows of a doctor on a given date. */
function docSlots(doc, date) {
  const dow = toDate(date).getDay();
  return ((doc && doc.slots) || []).filter(s =>
    s.repeat === 'everyday' ||
    ((s.repeat === 'date' || s.repeat === 'today') && s.date === date) ||
    (s.repeat === 'weekdays' && dow >= 1 && dow <= 6) ||
    (s.repeat === 'weekly' && (s.days || []).includes(dow))
  ).sort((a, b) => a.from.localeCompare(b.from));
}
function slotLabel(s) {
  const t = fmtTime(s.from) + ' – ' + fmtTime(s.to);
  if (s.repeat === 'everyday') return 'Every day, ' + t;
  if (s.repeat === 'weekdays') return 'Mon – Sat, ' + t;
  if (s.repeat === 'weekly') return (s.days || []).map(d => DAY_NAMES[d]).join(', ') + ', ' + t;
  return (s.repeat === 'today' ? 'Only ' : 'On ') + fmtDate(s.date) + ', ' + t;
}

function invCalc(inv) {
  let sub = 0;
  (inv.items || []).forEach(i => { sub += (+i.qty || 0) * (+i.rate || 0); });
  const disc = Math.min(+inv.discount || 0, sub);
  const f = sub ? (sub - disc) / sub : 0;
  let gst = 0;
  (inv.items || []).forEach(i => { gst += (+i.qty || 0) * (+i.rate || 0) * f * (+i.gst || 0) / 100; });
  const r2 = n => Math.round(n * 100) / 100;
  const total = r2(sub - disc + gst);
  const paid = r2((inv.payments || []).reduce((a, p) => a + (+p.amount || 0), 0));
  const balance = r2(total - paid);
  const status = paid <= 0 ? 'Unpaid' : balance > 0.009 ? 'Partially paid' : 'Paid';
  return { sub: r2(sub), disc: r2(disc), taxable: r2(sub - disc), gst: r2(gst), total, paid, balance, status };
}

function nextInvoiceNo(billType) {
  const prefix = { OPD: 'OPD', Surgery: 'SUR', IPD: 'IPD', Pharmacy: 'PHA' }[billType] || 'INV';
  const yr = new Date().getFullYear();
  const start = prefix + '-' + yr + '-';
  const max = all('invoices').filter(i => (i.number || '').startsWith(start)).reduce((m, i) => Math.max(m, +i.number.slice(start.length) || 0), 0);
  return start + String(max + 1).padStart(4, '0');
}

function fillTpl(text, ctx) {
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (ctx[k] !== undefined && ctx[k] !== '' ? ctx[k] : m === '{hospital}' ? cfg().hospitalName : ''));
}
function waLink(phone, text) {
  let d = digits(phone);
  if (d.length <= 10) d = cfg().countryCode + d;
  return 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : '');
}
function tplText(name, ctx) {
  const t = cfg().waTemplates.find(x => x.name === name) || cfg().waTemplates[0];
  return fillTpl(t ? t.text : '', Object.assign({ hospital: cfg().hospitalName }, ctx));
}

/** Demo-mode equivalent of the server webhooks: store an inbox message and create/refresh the lead. */
function ingestLocal({ platform, kind, from, phone, text, source, campaign }) {
  const map = { facebook_comment: 'Facebook comment', facebook_message: 'Facebook message', instagram_comment: 'Instagram comment', instagram_message: 'Instagram message', whatsapp_message: 'WhatsApp', youtube_comment: 'YouTube comment' };
  const src = source || map[platform + '_' + kind] || 'Other';
  let lead = all('leads').find(l => (phone && phone10(l.phone) === phone10(phone)) || (!phone && l.name === from && l.source === src));
  if (lead) { lead.lastMessage = text; lead.lastActivityAt = nowISO(); save('leads', lead); }
  else lead = save('leads', { name: from, phone: phone || '', source: src, campaign: campaign || '', status: 'New', notes: '', lastMessage: text || '', auto: true });
  if (platform) save('messages', { platform, kind, from, phone: phone || '', text, leadId: lead.id, read: false });
  return lead;
}

/* ---------- seed data ---------- */
function seedBase() {
  save('settings', Object.assign({}, DEFAULTS));
  const depts = ['General Surgery', 'Orthopaedics', 'Urology', 'Gynaecology', 'ENT', 'General Medicine'];
  depts.forEach(n => save('departments', { name: n, head: '', notes: '' }));
  const docs = [
    ['Dr. Arjun Mehta', 'General Surgery', 'MS (General Surgery)', 600, [{ repeat: 'everyday', from: '10:00', to: '13:00' }, { repeat: 'weekdays', from: '17:00', to: '20:00' }]],
    ['Dr. Priya Nair', 'Orthopaedics', 'MS (Ortho)', 700, [{ repeat: 'weekdays', from: '09:30', to: '14:00' }]],
    ['Dr. Sandeep Rao', 'Urology', 'MCh (Urology)', 800, [{ repeat: 'weekly', days: [1, 3, 5], from: '11:00', to: '15:00' }]],
    ['Dr. Kavitha Reddy', 'Gynaecology', 'MD, DGO', 600, [{ repeat: 'everyday', from: '10:00', to: '16:00' }]],
    ['Dr. Imran Sheikh', 'ENT', 'MS (ENT)', 500, [{ repeat: 'weekly', days: [2, 4, 6], from: '16:00', to: '20:00' }]],
  ];
  docs.forEach(([name, department, qualification, fee, slots], i) => save('doctors', {
    id: 'doc' + (i + 1), name, department, qualification, fee, phone: '', active: true, slots: slots.map(s => Object.assign({ id: uid() }, s)),
  }));
  [['General ward', 'G', 6, 1500], ['Semi-private', 'S', 4, 3000], ['Private room', 'P', 3, 5000], ['ICU', 'ICU-', 2, 9000]]
    .forEach(([ward, pre, n, rate]) => { for (let i = 1; i <= n; i++) save('beds', { id: 'bed' + pre + i, ward, number: pre + i, rate }); });
  save('staff', { name: 'Reception desk', role: 'Receptionist', phone: '', department: 'Front desk', shift: 'Morning', from: '08:00', to: '16:00' });
}

function seedDemo() {
  seedBase();
  const ago = (d, h) => { const x = new Date(); x.setDate(x.getDate() - d); x.setHours(h || 10, 15, 0, 0); return x.toISOString(); };
  save('campaigns', { name: 'Piles Laser – Nov', platform: 'Meta (Facebook + Instagram)', startDate: addDays(-12), endDate: addDays(18), budget: 30000, spend: 11400, status: 'Active' });
  save('campaigns', { name: 'Knee Replacement Camp', platform: 'Meta (Facebook + Instagram)', startDate: addDays(-25), endDate: addDays(5), budget: 50000, spend: 37250, status: 'Active' });
  const L = [
    ['Ramesh Kumar', '9876504321', 'Meta Ads – Facebook', 'Piles Laser – Nov', 'New', 0, 'city: Hyderabad'],
    ['Sunita Sharma', '9812345678', 'Meta Ads – Instagram', 'Knee Replacement Camp', 'New', 0, 'problem: knee pain 2 years'],
    ['Mohammed Faiz', '9900112233', 'WhatsApp', '', 'Interested', 1, 'Hi, what is the cost of hernia surgery?'],
    ['Lakshmi Devi', '9848012345', 'Phone call', '', 'New', 0, 'Incoming call (missed)'],
    ['Anil Varma', '', 'Facebook comment', '', 'New', 1, 'Price please? Is insurance accepted?'],
    ['pooja_reddy22', '', 'Instagram comment', '', 'Just an enquiry', 2, 'Where is the hospital located?'],
    ['Vikram Singh', '9000090000', 'YouTube comment', '', 'Call back later', 3, 'Sir please share contact number for kidney stone treatment'],
    ['Test Lead', '9999999999', 'Meta Ads – Facebook', 'Piles Laser – Nov', 'Fake caller', 4, ''],
    ['Geeta Joshi', '9123456780', 'Meta Ads – Facebook', 'Knee Replacement Camp', 'Not interested', 5, ''],
  ];
  L.forEach(([name, phone, source, campaign, status, d, msg]) => save('leads', { name, phone, source, campaign, status, notes: '', lastMessage: msg, auto: true, createdAt: ago(d, 9 + d) }));
  const M = [
    ['whatsapp', 'message', 'Mohammed Faiz', '9900112233', 'Hi, what is the cost of hernia surgery?', 1],
    ['facebook', 'comment', 'Anil Varma', '', 'Price please? Is insurance accepted?', 1],
    ['instagram', 'comment', 'pooja_reddy22', '', 'Where is the hospital located?', 2],
    ['youtube', 'comment', 'Vikram Singh', '', 'Sir please share contact number for kidney stone treatment', 3],
    ['instagram', 'message', 'pooja_reddy22', '', 'Do you have Sunday OPD?', 0],
  ];
  M.forEach(([platform, kind, from, phone, text, d]) => {
    const lead = all('leads').find(l => l.name === from);
    save('messages', { platform, kind, from, phone, text, leadId: lead && lead.id, read: d > 1, createdAt: ago(d, 11) });
  });
  const P = [
    ['Suresh Babu', '9885011122', 54, 'Male', 'OPD', 'Surgery advised', 'doc1', 'Referral', 'Hernia repair'],
    ['Fatima Begum', '9700055566', 47, 'Female', 'Direct surgery', 'Surgery scheduled', 'doc2', 'Meta Ads – Facebook', 'Total knee replacement'],
    ['Kiran Rao', '9666077788', 33, 'Male', 'OPD', 'OPD booked', 'doc5', 'Walk-in', ''],
  ];
  const pts = P.map(([name, phone, age, gender, type, stage, doctorId, source, surgeryName], i) =>
    save('patients', { name, phone, age, gender, type, stage, doctorId, source, surgeryName, pid: makePid(name, phone), address: '', createdAt: ago(6 - i * 2) }));
  save('appointments', { patientId: pts[0].id, type: 'OPD', doctorId: 'doc1', date: addDays(-4), time: '10:30', status: 'Completed', notes: 'Inguinal hernia. Surgery advised.' });
  save('appointments', { patientId: pts[1].id, type: 'Surgery', doctorId: 'doc2', date: addDays(3), time: '09:30', status: 'Scheduled', surgeryName: 'Total knee replacement', notes: '' });
  save('appointments', { patientId: pts[2].id, type: 'OPD', doctorId: 'doc5', date: today(), time: '16:30', status: 'Scheduled', notes: '' });
  save('followups', { name: 'Mohammed Faiz', phone: '9900112233', leadId: (all('leads').find(l => l.name === 'Mohammed Faiz') || {}).id, dueDate: today(), note: 'Share hernia package details', status: 'Pending' });
  save('followups', { name: 'Suresh Babu', phone: '9885011122', patientId: pts[0].id, dueDate: addDays(-1), note: 'Ask for surgery date decision', status: 'Pending' });
  save('invoices', { number: 'OPD-' + new Date().getFullYear() + '-0001', date: addDays(-4), patientId: pts[0].id, billType: 'OPD', discount: 0, notes: '',
    items: [{ desc: 'OPD consultation – Dr. Arjun Mehta', qty: 1, rate: 600, gst: 0 }], payments: [{ id: uid(), date: addDays(-4), amount: 600, mode: 'UPI', ref: '' }] });
  save('invoices', { number: 'SUR-' + new Date().getFullYear() + '-0001', date: addDays(-1), patientId: pts[1].id, billType: 'Surgery', discount: 5000, notes: 'Advance received',
    items: [{ desc: 'Total knee replacement – package', qty: 1, rate: 180000, gst: 0 }, { desc: 'Private room (3 days)', qty: 3, rate: 5000, gst: 5 }], payments: [{ id: uid(), date: addDays(-1), amount: 50000, mode: 'Card', ref: 'Advance' }] });
  save('admissions', { patientId: pts[0].id, bedId: 'bedS2', doctorId: 'doc1', admitDate: today(), reason: 'Hernia repair', status: 'Admitted' });
  S.users = [{ id: 'u1', username: 'admin', name: 'Demo Admin', role: 'Admin', active: 1 }, { id: 'u2', username: 'reception', name: 'Front Desk', role: 'Receptionist', active: 1 }];
}
