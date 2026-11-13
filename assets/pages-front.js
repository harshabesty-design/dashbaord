'use strict';
/* Front-desk pages: dashboard, enquiries (leads), inbox, patients, appointments, follow-ups. */

const PAGES = {};
const isAdmin = () => S.user && S.user.role === 'Admin';
const GENDERS = ['Male', 'Female', 'Other'];

const callBtn = phone => phone ? `<a class="btn ghost sm" href="tel:+${cfg().countryCode}${phone10(phone)}" title="Call">📞 Call</a>` : '';
const waBtn = (phone, text, label) => phone ? `<a class="btn wa sm" target="_blank" rel="noopener" href="${esc(waLink(phone, text))}" title="Open WhatsApp with the message ready">${label || 'WhatsApp'}</a>` : '';
const stageBadge = s => badge(s || '—', /Surgery done|Discharged|completed/.test(s) ? 'green' : /Surgery|Admitted/.test(s) ? 'purple' : 'blue');
const statusKind = s => ({ New: 'blue', [BOOK_OPD]: 'green', [BOOK_SURG]: 'purple', Interested: 'teal', 'Call back later': 'amber', 'Not reachable': 'amber', 'Fake caller': 'red', 'Not interested': 'grey', 'Just an enquiry': 'grey', Scheduled: 'blue', Completed: 'green', Cancelled: 'red', 'No show': 'amber', Pending: 'amber', Done: 'green', Paid: 'green', Unpaid: 'red', 'Partially paid': 'amber', Admitted: 'purple', Discharged: 'green' }[s] || 'grey');

/* ---------- patient picker (datalist) ---------- */
const patLabel = p => `${p.pid} · ${p.name} · ${p.phone}`;
const patField = (val) => ({ name: 'patient', label: 'Patient', required: true, full: true, list: 'pat-list', value: val ? patLabel(val) : '', placeholder: 'Type patient ID, name or mobile number' });
const patDatalist = () => `<datalist id="pat-list">${all('patients').map(p => `<option value="${esc(patLabel(p))}">`).join('')}</datalist>`;
function resolvePatient(str) {
  const pid = String(str).split(' · ')[0].trim().toUpperCase();
  const p = all('patients').find(x => x.pid === pid) || all('patients').find(x => x.phone === digits(str) && digits(str).length === 10);
  if (!p) throw new Error('Pick a patient from the suggestions');
  return p;
}

/* ---------- availability ---------- */
function availHint(docId, date, skipId) {
  if (!docId || !date) return '';
  const sl = docSlots(doctor(docId), date);
  let h = sl.length ? '🟢 Available: ' + sl.map(s => fmtTime(s.from) + ' – ' + fmtTime(s.to)).join(', ') : '🟠 Doctor has no availability set for this date';
  const booked = all('appointments').filter(a => a.doctorId === docId && a.date === date && a.status === 'Scheduled' && a.id !== skipId).map(a => a.time).sort();
  if (booked.length) h += ' · Already booked: ' + booked.map(fmtTime).join(', ');
  return h;
}
const inAvail = (docId, date, time) => docSlots(doctor(docId), date).some(s => time >= s.from && time < s.to);
const clash = (docId, date, time, skipId) => all('appointments').some(a => a.doctorId === docId && a.date === date && a.time === time && a.status === 'Scheduled' && a.id !== skipId);
const doctorOptions = () => all('doctors').filter(d => d.active !== false).map(d => ({ value: d.id, label: d.name + ' — ' + d.department }));

function wireAvail(form, skipId) {
  const upd = () => { $('[data-html=avail]', form).innerHTML = `<div class="hint-box">${esc(availHint(form.doctorId.value, form.date.value, skipId)) || 'Choose doctor and date to see availability'}</div>`; };
  form.doctorId.onchange = form.date.onchange = upd;
  upd();
}
async function checkSlot(v, skipId) {
  if (clash(v.doctorId, v.date, v.time, skipId)) throw new Error(docName(v.doctorId) + ' already has an appointment at ' + fmtTime(v.time) + ' on ' + fmtDate(v.date) + '. Choose another time.');
  if (!inAvail(v.doctorId, v.date, v.time)) return confirmBox(docName(v.doctorId) + ' is not marked available at ' + fmtTime(v.time) + ' on ' + fmtDate(v.date) + '. Book anyway?', 'Book anyway');
  return true;
}

const apptCtx = a => { const p = patient(a.patientId) || {}; return { name: p.name, pid: p.pid, doctor: docName(a.doctorId), date: fmtDate(a.date), time: fmtTime(a.time) }; };

/* ---------- booking (creates the patient ID when needed) ---------- */
function bookModal({ lead, pat, kind, onCancel }) {
  const src = pat || lead || {};
  const fields = [
    { name: 'name', label: 'Patient name', required: true, readonly: !!pat },
    { name: 'phone', label: 'Mobile number', type: 'tel', required: true, readonly: !!pat, attrs: 'inputmode="numeric"' },
    { name: 'age', label: 'Age', type: 'number', attrs: 'min="0" max="120"' },
    { name: 'gender', label: 'Gender', type: 'select', options: GENDERS, blank: 'Select…' },
    { name: 'vtype', label: 'Booking for', type: 'select', required: true, noBlank: true, options: ['OPD consultation', 'Surgery'], value: kind === 'Surgery' ? 'Surgery' : 'OPD consultation' },
    { name: 'surgeryName', label: 'Surgery / procedure', placeholder: 'Only for surgery bookings' },
    { name: 'doctorId', label: 'Doctor', type: 'select', required: true, options: doctorOptions() },
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'time', label: 'Time', type: 'time', required: true },
    { name: 'avail', type: 'html' },
  ];
  if (!lead && !pat) fields.push({ name: 'source', label: 'Source', type: 'select', options: cfg().leadSources, value: 'Walk-in', noBlank: true });
  fields.push({ name: 'notes', label: 'Notes', type: 'textarea', rows: 2 });
  formModal({
    title: pat ? 'Book for ' + pat.name + ' (' + pat.pid + ')' : lead ? 'Book appointment – ' + lead.name : 'New patient – book OPD / surgery',
    size: 'lg', submitLabel: 'Confirm booking', onCancel,
    fields, values: { name: src.name, phone: src.phone, age: src.age, gender: src.gender, doctorId: src.doctorId, surgeryName: src.surgeryName },
    onReady: form => wireAvail(form),
    onSubmit: async v => {
      if (phone10(v.phone).length !== 10) throw new Error('Enter a valid 10-digit mobile number');
      const surg = v.vtype === 'Surgery';
      if (surg && !v.surgeryName) throw new Error('Enter the surgery / procedure name');
      if (!(await checkSlot(v))) return false;
      let p = pat || all('patients').find(x => phone10(x.phone) === phone10(v.phone) && x.name.trim().toLowerCase() === v.name.toLowerCase());
      const isNew = !p;
      if (!p) p = { name: v.name, phone: phone10(v.phone), pid: makePid(v.name, v.phone), type: surg ? 'Direct surgery' : 'OPD', source: lead ? lead.source : v.source, leadId: lead ? lead.id : '', address: '' };
      Object.assign(p, { age: v.age || p.age || '', gender: v.gender || p.gender || '', doctorId: v.doctorId, stage: surg ? 'Surgery scheduled' : 'OPD booked' });
      if (surg) p.surgeryName = v.surgeryName;
      save('patients', p);
      const ap = save('appointments', { patientId: p.id, type: surg ? 'Surgery' : 'OPD', doctorId: v.doctorId, date: v.date, time: v.time, status: 'Scheduled', surgeryName: surg ? v.surgeryName : '', notes: v.notes });
      if (lead) {
        Object.assign(lead, { status: surg ? BOOK_SURG : BOOK_OPD, patientId: p.id, name: v.name, phone: phone10(v.phone) });
        save('leads', lead);
      }
      refresh();
      bookedDialog(p, ap, isNew);
    },
  });
}

function bookedDialog(p, ap, isNew) {
  const m = modal({
    title: 'Booking confirmed',
    body: `<div class="booked"><div class="pid-big">${esc(p.pid)}</div><p>${isNew ? 'New patient ID generated for' : 'Patient'} <b>${esc(p.name)}</b></p>
      <p>${esc(ap.type === 'Surgery' ? 'Surgery – ' + ap.surgeryName : 'OPD consultation')} with <b>${esc(docName(ap.doctorId))}</b><br>${fmtDate(ap.date)} at ${fmtTime(ap.time)}</p></div>
      <div class="modal-foot">${waBtn(p.phone, tplText(ap.type === 'Surgery' ? 'Surgery reminder' : 'Appointment confirmation', apptCtx(ap)), 'Send WhatsApp confirmation')}<button class="btn primary" data-ok>Done</button></div>`,
  });
  $('[data-ok]', m.el).onclick = () => m.close();
}

/* ---------- follow-up + WhatsApp composer ---------- */
function followupModal({ lead, pat, fu, onDone }) {
  const who = fu || pat || lead || {};
  formModal({
    title: (fu ? 'Edit follow-up – ' : 'Set follow-up – ') + (who.name || ''), submitLabel: fu ? 'Save' : 'Add follow-up', onCancel: onDone,
    fields: [
      { name: 'dueDate', label: 'Follow-up date', type: 'date', required: true, value: addDays(1) },
      { name: 'dueTime', label: 'Time (optional)', type: 'time' },
      { name: 'note', label: 'Note', type: 'textarea', placeholder: 'What to discuss on the next call' },
    ],
    values: fu || {},
    onSubmit: v => {
      save('followups', Object.assign(fu || { name: who.name, phone: who.phone, leadId: lead ? lead.id : '', patientId: pat ? pat.id : '', status: 'Pending' }, v));
      toast('Follow-up saved for ' + fmtDate(v.dueDate));
      if (onDone) onDone(); else refresh();
    },
  });
}

function waCompose(phone, ctx, startTpl) {
  const tpls = cfg().waTemplates;
  const m = modal({
    title: 'WhatsApp message to ' + (ctx.name || phone),
    body: `<div class="form"><div class="grid">
      <label class="field full"><span>Template</span><select data-tpl>${tpls.map(t => `<option ${t.name === startTpl ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <label class="field full"><span>Message</span><textarea rows="6" data-msg></textarea></label></div>
      <div class="form-err" hidden></div>
      <div class="modal-foot">${S.mode === 'api' ? '<button class="btn ghost" data-api title="Needs WhatsApp Cloud API connected in Integrations">Send from dashboard</button>' : ''}<button class="btn wa" data-open>Open WhatsApp</button></div></div>`,
  });
  const sel = $('[data-tpl]', m.el), ta = $('[data-msg]', m.el);
  const fill = () => { ta.value = tplText(sel.value, ctx); };
  sel.onchange = fill; fill();
  $('[data-open]', m.el).onclick = () => { window.open(waLink(phone, ta.value), '_blank', 'noopener'); m.close(); };
  const apiBtn = $('[data-api]', m.el);
  if (apiBtn) apiBtn.onclick = async () => {
    try { let d = digits(phone); if (d.length <= 10) d = cfg().countryCode + d; await api('wa_send', { to: d, text: ta.value }); toast('WhatsApp message sent'); m.close(); }
    catch (e) { const er = $('.form-err', m.el); er.textContent = e.message; er.hidden = false; }
  };
}

/* ================= DASHBOARD ================= */
PAGES.dashboard = root => {
  const t = today(), leads = all('leads'), appts = all('appointments');
  const todayAppts = appts.filter(a => a.date === t && a.status !== 'Cancelled').sort((a, b) => a.time.localeCompare(b.time));
  const newLeads = leads.filter(l => l.status === 'New').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const dueFu = all('followups').filter(f => f.status === 'Pending' && f.dueDate <= t).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const occupied = all('admissions').filter(a => a.status === 'Admitted').length;
  let collected = 0, outstanding = 0;
  all('invoices').forEach(i => { outstanding += invCalc(i).balance; (i.payments || []).forEach(p => { if (p.date === t) collected += +p.amount || 0; }); });
  const bySrc = {};
  leads.filter(l => ymd(l.createdAt) >= addDays(-30)).forEach(l => { bySrc[l.source] = (bySrc[l.source] || 0) + 1; });
  const srcRows = Object.entries(bySrc).sort((a, b) => b[1] - a[1]);
  const maxSrc = Math.max(1, ...srcRows.map(r => r[1]));
  const kpi = (label, val, sub, href) => `<a class="kpi" href="#/${href}"><span>${label}</span><b>${val}</b><small>${sub}</small></a>`;
  root.innerHTML = `
    <div class="page-head"><div><h1>Dashboard</h1><p>${esc(new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</p></div>
      <div class="head-actions"><button class="btn primary" data-new>+ New patient</button></div></div>
    <div class="kpis">
      ${kpi('New enquiries', newLeads.length, leads.filter(l => ymd(l.createdAt) === t).length + ' received today', 'leads')}
      ${kpi('Appointments today', todayAppts.length, todayAppts.filter(a => a.type === 'Surgery').length + ' surgeries', 'appointments')}
      ${kpi('Follow-ups due', dueFu.length, 'today and overdue', 'followups')}
      ${kpi('Beds occupied', occupied + ' / ' + all('beds').length, 'IPD', 'ipd')}
      ${kpi('Collected today', money(collected), 'all payment modes', 'billing')}
      ${kpi('Outstanding', money(outstanding), 'unpaid balances', 'billing')}
    </div>
    <div class="cols">
      <div class="card"><div class="card-head"><h3>Today's appointments</h3><a href="#/appointments">View all</a></div>
        <div class="list">${todayAppts.map(a => { const p = patient(a.patientId) || {}; return `<div class="li"><b class="time">${fmtTime(a.time)}</b><div><b>${esc(p.name)}</b> <span class="muted">${esc(p.pid)}</span><br><small>${esc(a.type === 'Surgery' ? 'Surgery – ' + a.surgeryName : 'OPD')} · ${esc(docName(a.doctorId))}</small></div>${badge(a.status, statusKind(a.status))}</div>`; }).join('') || '<p class="empty">No appointments today.</p>'}</div></div>
      <div class="card"><div class="card-head"><h3>New enquiries to call</h3><a href="#/leads">View all</a></div>
        <div class="list">${newLeads.slice(0, 7).map(l => `<div class="li"><div><b>${esc(l.name)}</b> <span class="muted">${esc(l.phone)}</span><br><small>${esc(l.source)}${l.campaign ? ' · ' + esc(l.campaign) : ''} · ${fmtDT(l.createdAt)}</small></div>${callBtn(l.phone)}</div>`).join('') || '<p class="empty">All enquiries have been handled.</p>'}</div></div>
      <div class="card"><div class="card-head"><h3>Follow-ups due</h3><a href="#/followups">View all</a></div>
        <div class="list">${dueFu.slice(0, 7).map(f => `<div class="li"><div><b>${esc(f.name)}</b> <span class="muted">${esc(f.phone)}</span><br><small>${f.dueDate < t ? '<span class="red">Overdue · </span>' : ''}${fmtDate(f.dueDate)} · ${esc(f.note || '')}</small></div>${waBtn(f.phone, tplText('Follow-up', { name: f.name }))}</div>`).join('') || '<p class="empty">No follow-ups pending.</p>'}</div></div>
      <div class="card"><div class="card-head"><h3>Enquiries by source (last 30 days)</h3></div>
        <div class="bars">${srcRows.map(([k, v]) => `<div class="bar-row"><span>${esc(k)}</span><div class="bar"><i style="width:${v / maxSrc * 100}%"></i></div><b>${v}</b></div>`).join('') || '<p class="empty">No enquiries yet.</p>'}</div></div>
    </div>`;
  $('[data-new]', root).onclick = () => bookModal({});
};

/* ================= PATIENT ENQUIRIES (LEADS) ================= */
function leadModal(lead) {
  formModal({
    title: lead ? 'Edit enquiry' : 'Add enquiry',
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'phone', label: 'Mobile number', type: 'tel' },
      { name: 'email', label: 'Email' },
      { name: 'source', label: 'Source', type: 'select', options: cfg().leadSources, noBlank: true, value: 'Phone call' },
      { name: 'campaign', label: 'Campaign / ad', list: 'camp-list' },
      { name: 'notes', label: 'Call notes', type: 'textarea' },
    ],
    values: lead || {},
    onReady: f => f.insertAdjacentHTML('beforeend', `<datalist id="camp-list">${all('campaigns').map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>`),
    onSubmit: v => {
      if (v.phone && phone10(v.phone).length !== 10) throw new Error('Enter a valid 10-digit mobile number');
      if (v.phone) v.phone = phone10(v.phone);
      save('leads', Object.assign(lead || { status: 'New' }, v));
      refresh();
    },
  });
}

PAGES.leads = root => {
  const count = s => all('leads').filter(l => l.status === s).length;
  listView(root, {
    key: 'leads', title: 'Patient enquiries',
    subtitle: 'Leads from Meta ads, comments, messages, WhatsApp and phone calls land here automatically.',
    actions: '<button class="btn primary" data-act="add">+ Add enquiry</button>',
    above: `<div class="chips">${['New', 'Interested', 'Call back later', BOOK_OPD, BOOK_SURG].map(s => `<span class="chip">${badge(s, statusKind(s))} <b>${count(s)}</b></span>`).join('')}</div>`,
    rows: () => all('leads'), dateOf: l => ymd(l.createdAt),
    filters: [
      { key: 'status', label: 'Status', options: leadStatusList, get: l => l.status },
      { key: 'source', label: 'Source', options: () => cfg().leadSources, get: l => l.source },
    ],
    rowClass: l => l.status === 'New' ? 'row-new' : '',
    columns: [
      { label: 'Received', get: l => fmtDT(l.createdAt), cls: 'nowrap' },
      { label: 'Name', get: l => l.name, html: l => `<b>${esc(l.name)}</b>${l.lastMessage ? `<br><small class="muted clip" title="${esc(l.lastMessage)}">${esc(l.lastMessage)}</small>` : ''}` },
      { label: 'Mobile', get: l => l.phone, cls: 'nowrap' },
      { label: 'Source', get: l => l.source, html: l => selectHTML('source', cfg().leadSources, l.source) },
      { label: 'Campaign', get: l => l.campaign || '' },
      { label: 'Status', cls: 'nowrap', get: l => l.status, html: l => `<span class="dot ${statusKind(l.status)}"></span>` + selectHTML('status', leadStatusList(), l.status) },
      { label: 'Patient ID', get: l => (patient(l.patientId) || {}).pid || '', html: l => l.patientId && patient(l.patientId) ? `<a href="#" data-act="pat" data-id="${l.patientId}" class="pid">${esc(patient(l.patientId).pid)}</a>` : '<span class="muted">—</span>' },
      { label: 'Call notes', get: l => l.notes || '', cls: 'notes' },
    ],
    exportExtra: [{ label: 'Email', get: l => l.email || '' }, { label: 'Message / form answers', get: l => l.lastMessage || '' }, { label: 'Auto-captured', get: l => l.auto ? 'Yes' : 'No' }],
    rowActions: l => callBtn(l.phone) + waBtn(l.phone, tplText('Follow-up', { name: l.name })) + `<button class="btn ghost sm" data-act="edit">Edit</button>` + (isAdmin() ? `<button class="btn ghost sm danger" data-act="del">✕</button>` : ''),
    change: {
      source: (id, val) => { const l = get('leads', id); l.source = val; save('leads', l); toast('Source updated'); },
      status: (id, val) => {
        const l = get('leads', id);
        if (val === BOOK_OPD || val === BOOK_SURG) { bookModal({ lead: l, pat: l.patientId ? patient(l.patientId) : null, kind: val === BOOK_SURG ? 'Surgery' : 'OPD', onCancel: refresh }); return; }
        l.status = val; save('leads', l);
        if (['Interested', 'Call back later', 'Not reachable'].includes(val)) followupModal({ lead: l, onDone: refresh }); else refresh();
      },
    },
    on: {
      add: () => leadModal(), edit: id => leadModal(get('leads', id)),
      pat: (id, b) => patientView(id),
      del: async id => { if (await confirmBox('Delete this enquiry permanently?', 'Delete')) { remove('leads', id); refresh(); } },
    },
  });
};

/* ================= INBOX ================= */
const PLATFORM = { facebook: ['Facebook', 'blue'], instagram: ['Instagram', 'pink'], whatsapp: ['WhatsApp', 'green'], youtube: ['YouTube', 'red'] };
PAGES.inbox = root => {
  listView(root, {
    key: 'inbox', title: 'Inbox', subtitle: 'Comments and messages from Facebook, Instagram, WhatsApp and YouTube.',
    actions: '<button class="btn ghost" data-act="readall">Mark all read</button>',
    rows: () => all('messages'), dateOf: m => ymd(m.createdAt),
    filters: [
      { key: 'p', label: 'Platform', options: () => Object.values(PLATFORM).map(x => x[0]), get: m => (PLATFORM[m.platform] || [m.platform])[0] },
      { key: 'k', label: 'Type', options: () => ['Comment', 'Message'], get: m => m.kind === 'comment' ? 'Comment' : 'Message' },
    ],
    rowClass: m => m.read ? '' : 'row-new',
    columns: [
      { label: 'Received', get: m => fmtDT(m.createdAt), cls: 'nowrap' },
      { label: 'Platform', get: m => (PLATFORM[m.platform] || [m.platform])[0], html: m => badge(...(PLATFORM[m.platform] || [m.platform, 'grey'])) },
      { label: 'Type', get: m => m.kind === 'comment' ? 'Comment' : 'Message' },
      { label: 'From', get: m => m.from, html: m => `<b>${esc(m.from)}</b>${m.phone ? `<br><small class="muted">${esc(m.phone)}</small>` : ''}` },
      { label: 'Text', get: m => m.text, cls: 'msg' },
      { label: 'Enquiry status', get: m => (get('leads', m.leadId) || {}).status || '', html: m => { const l = get('leads', m.leadId); return l ? badge(l.status, statusKind(l.status)) : ''; } },
    ],
    exportExtra: [{ label: 'Mobile', get: m => m.phone || '' }, { label: 'Link', get: m => m.ref || '' }],
    rowActions: m => (m.ref ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="${esc(m.ref)}">Open post</a>` : '') + waBtn(m.phone, '', 'Reply') + (m.leadId ? `<button class="btn ghost sm" data-act="lead">Open enquiry</button>` : '') + (m.read ? '' : `<button class="btn ghost sm" data-act="read">✓ Read</button>`),
    on: {
      read: id => { const m = get('messages', id); m.read = true; save('messages', m); refresh(); },
      readall: () => { all('messages').filter(m => !m.read).forEach(m => { m.read = true; save('messages', m); }); refresh(); },
      lead: id => { const l = get('leads', get('messages', id).leadId); VS.leads = { q: l ? l.name : '', from: '', to: '', f: {}, limit: 100 }; location.hash = '#/leads'; },
    },
  });
};

/* ================= PATIENTS ================= */
function patientEdit(p) {
  formModal({
    title: 'Edit patient – ' + p.pid, size: 'lg',
    fields: [
      { name: 'name', label: 'Name', required: true }, { name: 'phone', label: 'Mobile number', type: 'tel', required: true },
      { name: 'age', label: 'Age', type: 'number' }, { name: 'gender', label: 'Gender', type: 'select', options: GENDERS, blank: 'Select…' },
      { name: 'address', label: 'Address', full: true }, { name: 'city', label: 'City' },
      { name: 'source', label: 'Source', type: 'select', options: cfg().leadSources, blank: 'Select…' },
      { name: 'type', label: 'Patient type', type: 'select', options: ['OPD', 'Direct surgery'], noBlank: true },
      { name: 'stage', label: 'Stage', type: 'select', options: STAGES, noBlank: true },
      { name: 'doctorId', label: 'Doctor', type: 'select', options: doctorOptions(), blank: 'Select…' },
      { name: 'surgeryName', label: 'Surgery / procedure' },
      { name: 'notes', label: 'Medical / other notes', type: 'textarea' },
    ],
    values: p,
    onSubmit: v => {
      if (phone10(v.phone).length !== 10) throw new Error('Enter a valid 10-digit mobile number');
      v.phone = phone10(v.phone);
      save('patients', Object.assign(p, v)); refresh(); patientView(p.id);
    },
  });
}

function patientView(id) {
  const p = patient(id);
  if (!p) return;
  const appts = all('appointments').filter(a => a.patientId === id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const invs = all('invoices').filter(i => i.patientId === id).sort((a, b) => b.date.localeCompare(a.date));
  const adms = all('admissions').filter(a => a.patientId === id);
  const path = p.type === 'Direct surgery' ? ['Surgery scheduled', 'Admitted', 'Surgery done', 'Discharged'] : ['OPD booked', 'OPD done', 'Surgery advised', 'Surgery scheduled', 'Admitted', 'Surgery done', 'Discharged'];
  const at = path.indexOf(p.stage);
  const info = (l, v) => `<div><small>${l}</small><b>${esc(v || '—')}</b></div>`;
  const m = modal({
    title: p.name, size: 'xl',
    body: `<div class="pv-head"><span class="pid-big">${esc(p.pid)}</span>${badge(p.type, p.type === 'OPD' ? 'blue' : 'purple')} ${stageBadge(p.stage)}
        <span class="spacer"></span>${callBtn(p.phone)}${waBtn(p.phone, '')}
        <button class="btn ghost sm" data-a="edit">Edit details</button></div>
      <div class="steps">${path.map((s, i) => `<span class="${at >= 0 && i <= at ? 'done' : ''}">${esc(s)}</span>`).join('')}</div>
      <div class="info-grid">${info('Mobile', p.phone)}${info('Age / gender', [p.age, p.gender].filter(Boolean).join(' / '))}${info('Doctor', p.doctorId ? docName(p.doctorId) : '')}${info('Surgery / procedure', p.surgeryName)}${info('Source', p.source)}${info('Registered', fmtDate(ymd(p.createdAt)))}${info('Address', [p.address, p.city].filter(Boolean).join(', '))}${info('Notes', p.notes)}</div>
      <div class="pv-actions"><button class="btn primary sm" data-a="opd">+ Book OPD</button><button class="btn primary sm" data-a="surg">+ Schedule surgery</button><button class="btn ghost sm" data-a="bill">+ New bill</button><button class="btn ghost sm" data-a="fu">+ Follow-up</button><button class="btn ghost sm" data-a="admit">Admit (IPD)</button></div>
      <h4>Appointments</h4>
      <table class="mini"><thead><tr><th>Date</th><th>Time</th><th>Type</th><th>Doctor</th><th>Status</th><th></th></tr></thead><tbody>
      ${appts.map(a => `<tr><td>${fmtDate(a.date)}</td><td>${fmtTime(a.time)}</td><td>${esc(a.type)}${a.surgeryName ? ' – ' + esc(a.surgeryName) : ''}</td><td>${esc(docName(a.doctorId))}</td><td>${badge(a.status, statusKind(a.status))}</td><td><button class="btn ghost sm" data-a="appt" data-id="${a.id}">Edit / reschedule</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No appointments.</td></tr>'}</tbody></table>
      <h4>Bills</h4>
      <table class="mini"><thead><tr><th>Bill no.</th><th>Date</th><th>Type</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>
      ${invs.map(i => { const c = invCalc(i); return `<tr><td>${esc(i.number)}</td><td>${fmtDate(i.date)}</td><td>${esc(i.billType)}</td><td>${money(c.total)}</td><td>${money(c.paid)}</td><td>${money(c.balance)}</td><td>${badge(c.status, statusKind(c.status))}</td><td><button class="btn ghost sm" data-a="inv" data-id="${i.id}">Open</button></td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">No bills.</td></tr>'}</tbody></table>
      ${adms.length ? `<h4>Admissions</h4><table class="mini"><thead><tr><th>Admitted</th><th>Bed</th><th>Reason</th><th>Discharged</th></tr></thead><tbody>${adms.map(a => `<tr><td>${fmtDate(a.admitDate)}</td><td>${esc((get('beds', a.bedId) || {}).number || '')}</td><td>${esc(a.reason || '')}</td><td>${a.dischargeDate ? fmtDate(a.dischargeDate) : badge('Admitted', 'purple')}</td></tr>`).join('')}</tbody></table>` : ''}`,
  });
  m.el.onclick = e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    m.close();
    const a = b.dataset.a;
    if (a === 'edit') patientEdit(p);
    else if (a === 'opd') bookModal({ pat: p, kind: 'OPD' });
    else if (a === 'surg') bookModal({ pat: p, kind: 'Surgery' });
    else if (a === 'bill') invoiceModal({ patientId: p.id });
    else if (a === 'fu') followupModal({ pat: p });
    else if (a === 'admit') admitModal(p);
    else if (a === 'appt') apptEdit(get('appointments', b.dataset.id));
    else if (a === 'inv') invoiceModal(get('invoices', b.dataset.id));
  };
}

PAGES.patients = root => {
  listView(root, {
    key: 'patients', title: 'Patients',
    subtitle: 'Only OPD-booked and direct-surgery patients get a patient ID (first 4 letters of name + last 4 digits of mobile).',
    actions: '<button class="btn primary" data-act="add">+ New patient</button>',
    rows: () => all('patients'), dateOf: p => ymd(p.createdAt),
    filters: [{ key: 'type', label: 'Type', options: () => ['OPD', 'Direct surgery'], get: p => p.type }, { key: 'stage', label: 'Stage', options: () => STAGES, get: p => p.stage }],
    columns: [
      { label: 'Patient ID', get: p => p.pid, html: p => `<a href="#" class="pid" data-act="view">${esc(p.pid)}</a>` },
      { label: 'Name', get: p => p.name, html: p => `<b>${esc(p.name)}</b>` },
      { label: 'Mobile', get: p => p.phone }, { label: 'Age', get: p => p.age || '' }, { label: 'Gender', get: p => p.gender || '' },
      { label: 'Type', get: p => p.type, html: p => badge(p.type, p.type === 'OPD' ? 'blue' : 'purple') },
      { label: 'Stage', get: p => p.stage, html: p => selectHTML('stage', STAGES, p.stage) },
      { label: 'Doctor', get: p => p.doctorId ? docName(p.doctorId) : '' },
      { label: 'Surgery', get: p => p.surgeryName || '' },
      { label: 'Source', get: p => p.source || '' },
      { label: 'Registered', get: p => fmtDate(ymd(p.createdAt)), cls: 'nowrap' },
    ],
    exportExtra: [{ label: 'Address', get: p => p.address || '' }, { label: 'City', get: p => p.city || '' }, { label: 'Notes', get: p => p.notes || '' },
      { label: 'Total billed', get: p => all('invoices').filter(i => i.patientId === p.id).reduce((a, i) => a + invCalc(i).total, 0) },
      { label: 'Total paid', get: p => all('invoices').filter(i => i.patientId === p.id).reduce((a, i) => a + invCalc(i).paid, 0) }],
    rowActions: p => `<button class="btn ghost sm" data-act="view">View</button>` + waBtn(p.phone, '') + (isAdmin() ? `<button class="btn ghost sm danger" data-act="del">✕</button>` : ''),
    change: { stage: (id, val) => { const p = patient(id); p.stage = val; save('patients', p); toast('Stage updated'); } },
    on: {
      add: () => bookModal({}), view: id => patientView(id),
      del: async id => { if (await confirmBox('Delete this patient record? Appointments and bills are kept.', 'Delete')) { remove('patients', id); refresh(); } },
    },
  });
};

/* ================= APPOINTMENTS ================= */
function apptEdit(a) {
  const p = patient(a.patientId) || {};
  formModal({
    title: 'Edit / reschedule – ' + (p.name || '') + ' (' + (p.pid || '') + ')', size: 'lg',
    fields: [
      { name: 'doctorId', label: 'Doctor', type: 'select', required: true, options: doctorOptions() },
      { name: 'status', label: 'Status', type: 'select', noBlank: true, options: ['Scheduled', 'Completed', 'Cancelled', 'No show'] },
      { name: 'date', label: 'Date', type: 'date', required: true }, { name: 'time', label: 'Time', type: 'time', required: true },
      { name: 'avail', type: 'html' },
      ...(a.type === 'Surgery' ? [{ name: 'surgeryName', label: 'Surgery / procedure', full: true }] : []),
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    values: a,
    onReady: form => wireAvail(form, a.id),
    onSubmit: async v => {
      const moved = v.date !== a.date || v.time !== a.time || v.doctorId !== a.doctorId;
      if (moved && v.status === 'Scheduled' && !(await checkSlot(v, a.id))) return false;
      if (moved) (a.history = a.history || []).push({ date: a.date, time: a.time, doctorId: a.doctorId, changedAt: nowISO(), by: S.user.name });
      Object.assign(a, v); save('appointments', a);
      if (a.type === 'Surgery' && p.id) { p.surgeryName = a.surgeryName; save('patients', p); }
      refresh();
      if (moved && p.phone) {
        const m = modal({ title: 'Appointment rescheduled', body: `<p class="confirm-msg">New time: <b>${fmtDate(a.date)} at ${fmtTime(a.time)}</b> with ${esc(docName(a.doctorId))}.</p><div class="modal-foot">${waBtn(p.phone, tplText('Appointment rescheduled', apptCtx(a)), 'Inform patient on WhatsApp')}<button class="btn primary" data-ok>Done</button></div>` });
        $('[data-ok]', m.el).onclick = () => m.close();
      }
    },
  });
}

function apptComplete(a) {
  const p = patient(a.patientId);
  const opd = a.type === 'OPD';
  formModal({
    title: (opd ? 'OPD completed – ' : 'Surgery completed – ') + (p ? p.name : ''), submitLabel: 'Mark completed', onCancel: refresh,
    fields: [
      ...(opd ? [{ name: 'outcome', label: 'OPD outcome', type: 'select', noBlank: true, full: true, options: ['Consultation done – no surgery', 'Surgery advised – schedule now', 'Surgery advised – patient will decide', 'Review visit needed'] },
        { name: 'surgeryName', label: 'Surgery advised (if any)', full: true }] : []),
      { name: 'fuDate', label: 'Follow-up call date (optional)', type: 'date' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    values: { notes: a.notes, surgeryName: p ? p.surgeryName : '' },
    onSubmit: v => {
      a.status = 'Completed'; a.notes = v.notes; if (opd) a.outcome = v.outcome;
      save('appointments', a);
      const advised = opd && v.outcome.startsWith('Surgery advised');
      if (p) {
        p.stage = opd ? (advised ? 'Surgery advised' : 'OPD done') : 'Surgery done';
        if (v.surgeryName) p.surgeryName = v.surgeryName;
        save('patients', p);
        if (v.fuDate) save('followups', { name: p.name, phone: p.phone, patientId: p.id, dueDate: v.fuDate, note: opd ? v.outcome : 'Post-surgery follow-up', status: 'Pending' });
      }
      refresh();
      if (p && opd && v.outcome === 'Surgery advised – schedule now') bookModal({ pat: p, kind: 'Surgery' });
    },
  });
}

PAGES.appointments = root => {
  listView(root, {
    key: 'appointments', title: 'Appointments', subtitle: 'OPD consultations and surgeries. Date, time and doctor can be changed any time.',
    actions: '<button class="btn ghost" data-act="newpat">+ New patient</button><button class="btn primary" data-act="add">+ New appointment</button>',
    rows: () => all('appointments'), dateOf: a => a.date,
    sort: (a, b) => (b.date + b.time).localeCompare(a.date + a.time),
    filters: [
      { key: 'type', label: 'Type', options: () => ['OPD', 'Surgery'], get: a => a.type },
      { key: 'status', label: 'Status', options: () => ['Scheduled', 'Completed', 'Cancelled', 'No show'], get: a => a.status },
      { key: 'doc', label: 'Doctor', options: () => all('doctors').map(d => d.name), get: a => docName(a.doctorId) },
    ],
    columns: [
      { label: 'Date', get: a => fmtDate(a.date), cls: 'nowrap', html: a => `<b>${fmtDate(a.date)}</b>${a.date === today() ? ' ' + badge('Today', 'teal') : ''}` },
      { label: 'Time', get: a => fmtTime(a.time), cls: 'nowrap', html: a => fmtTime(a.time) + ((a.history || []).length ? ' <span class="muted" title="Rescheduled ' + a.history.length + ' time(s)">↻</span>' : '') },
      { label: 'Patient ID', get: a => (patient(a.patientId) || {}).pid || '', html: a => `<a href="#" class="pid" data-act="pat" data-id="${a.patientId}">${esc((patient(a.patientId) || {}).pid || '—')}</a>` },
      { label: 'Patient', get: a => patName(a.patientId), html: a => `<b>${esc(patName(a.patientId))}</b>` },
      { label: 'Mobile', get: a => (patient(a.patientId) || {}).phone || '' },
      { label: 'Type', get: a => a.type, html: a => badge(a.type, a.type === 'OPD' ? 'blue' : 'purple') },
      { label: 'Surgery', get: a => a.surgeryName || '' },
      { label: 'Doctor', get: a => docName(a.doctorId) },
      { label: 'Status', cls: 'nowrap', get: a => a.status, html: a => `<span class="dot ${statusKind(a.status)}"></span>` + selectHTML('status', ['Scheduled', 'Completed', 'Cancelled', 'No show'], a.status) },
      { label: 'Notes', get: a => a.notes || '', cls: 'notes' },
    ],
    exportExtra: [{ label: 'OPD outcome', get: a => a.outcome || '' }, { label: 'Times rescheduled', get: a => (a.history || []).length }],
    rowActions: a => `<button class="btn ghost sm" data-act="edit">Edit / reschedule</button>` + (a.status === 'Scheduled' ? waBtn((patient(a.patientId) || {}).phone, tplText(a.type === 'Surgery' ? 'Surgery reminder' : 'Appointment confirmation', apptCtx(a)), 'Remind') : ''),
    change: {
      status: (id, val) => {
        const a = get('appointments', id);
        if (val === 'Completed') { apptComplete(a); return; }
        a.status = val; save('appointments', a); refresh();
      },
    },
    on: {
      edit: id => apptEdit(get('appointments', id)), pat: id => patientView(id), newpat: () => bookModal({}),
      add: () => formModal({
        title: 'New appointment for existing patient', submitLabel: 'Continue',
        fields: [patField(), { name: 'kind', label: 'Booking for', type: 'select', noBlank: true, options: ['OPD consultation', 'Surgery'] }],
        onReady: f => f.insertAdjacentHTML('beforeend', patDatalist()),
        onSubmit: v => { const p = resolvePatient(v.patient); setTimeout(() => bookModal({ pat: p, kind: v.kind === 'Surgery' ? 'Surgery' : 'OPD' })); },
      }),
    },
  });
};

/* ================= FOLLOW-UPS ================= */
PAGES.followups = root => {
  const t = today();
  listView(root, {
    key: 'followups', title: 'Follow-ups', subtitle: 'One click opens WhatsApp with the follow-up message ready to send.',
    actions: '<button class="btn primary" data-act="add">+ Add follow-up</button>',
    rows: () => all('followups'), dateOf: f => f.dueDate,
    sort: (a, b) => (a.status === b.status ? a.dueDate.localeCompare(b.dueDate) : a.status === 'Pending' ? -1 : 1),
    filters: [{ key: 'status', label: 'Status', options: () => ['Pending', 'Done'], get: f => f.status }],
    rowClass: f => f.status === 'Pending' && f.dueDate <= t ? 'row-new' : '',
    columns: [
      { label: 'Due date', get: f => fmtDate(f.dueDate) + (f.dueTime ? ' ' + fmtTime(f.dueTime) : ''), cls: 'nowrap', html: f => `<b>${fmtDate(f.dueDate)}</b>${f.dueTime ? ' ' + fmtTime(f.dueTime) : ''} ${f.status === 'Pending' ? (f.dueDate < t ? badge('Overdue', 'red') : f.dueDate === t ? badge('Today', 'teal') : '') : ''}` },
      { label: 'Name', get: f => f.name, html: f => `<b>${esc(f.name)}</b>` },
      { label: 'Mobile', get: f => f.phone },
      { label: 'Patient ID', get: f => (patient(f.patientId) || {}).pid || '' },
      { label: 'For', get: f => f.patientId ? 'Patient' : 'Enquiry' },
      { label: 'Note', get: f => f.note || '', cls: 'notes' },
      { label: 'Status', get: f => f.status, html: f => badge(f.status, statusKind(f.status)) },
    ],
    rowActions: f => callBtn(f.phone) + waBtn(f.phone, tplText('Follow-up', { name: f.name, pid: (patient(f.patientId) || {}).pid })) +
      (f.phone ? `<button class="btn ghost sm" data-act="tpl" title="Choose another template">✎</button>` : '') +
      (f.status === 'Pending' ? `<button class="btn ghost sm" data-act="done">✓ Done</button>` : '') + `<button class="btn ghost sm" data-act="edit">Edit</button>`,
    on: {
      tpl: id => { const f = get('followups', id); waCompose(f.phone, { name: f.name, pid: (patient(f.patientId) || {}).pid }, 'Follow-up'); },
      done: id => { const f = get('followups', id); f.status = 'Done'; f.doneAt = nowISO(); save('followups', f); refresh(); },
      edit: id => followupModal({ fu: get('followups', id) }),
      add: () => formModal({
        title: 'Add follow-up',
        fields: [{ name: 'name', label: 'Name', required: true }, { name: 'phone', label: 'Mobile number', type: 'tel', required: true },
          { name: 'dueDate', label: 'Follow-up date', type: 'date', required: true, value: addDays(1) }, { name: 'dueTime', label: 'Time (optional)', type: 'time' },
          { name: 'note', label: 'Note', type: 'textarea' }],
        onSubmit: v => { v.phone = phone10(v.phone); const p = all('patients').find(x => x.phone === v.phone); save('followups', Object.assign(v, { status: 'Pending', patientId: p ? p.id : '' })); refresh(); },
      }),
    },
  });
};
