'use strict';
/* Clinical, business and administration pages. */

/** Generic add / edit / delete page for simple lists. */
function crudPage(root, o) {
  const edit = doc => formModal({
    title: (doc ? 'Edit ' : 'Add ') + o.noun, fields: o.fields(), values: doc || {}, size: o.size,
    onSubmit: v => { if (o.validate) o.validate(v); save(o.col, Object.assign(doc || {}, v)); refresh(); },
  });
  listView(root, {
    key: o.col, title: o.title, subtitle: o.subtitle, above: o.above,
    actions: `<button class="btn primary" data-act="add">+ Add ${esc(o.noun)}</button>`,
    rows: () => all(o.col), dateOf: o.dateOf, filters: o.filters, columns: o.columns, exportExtra: o.exportExtra,
    sort: o.sort || ((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    rowActions: r => (o.rowActions ? o.rowActions(r) : '') + `<button class="btn ghost sm" data-act="edit">Edit</button><button class="btn ghost sm danger" data-act="del">✕</button>`,
    on: Object.assign({
      add: () => edit(), edit: id => edit(get(o.col, id)),
      del: async id => { if (await confirmBox('Delete this ' + o.noun + '?', 'Delete')) { remove(o.col, id); refresh(); } },
    }, o.on || {}),
  });
}

/* ================= IPD & BEDS ================= */
function admitModal(pat, bedId) {
  const busy = new Set(all('admissions').filter(a => a.status === 'Admitted').map(a => a.bedId));
  const free = all('beds').filter(b => !busy.has(b.id)).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  if (!free.length) { toast('No free beds available', 'err'); return; }
  formModal({
    title: 'Admit patient', submitLabel: 'Admit',
    fields: [patField(pat),
      { name: 'bedId', label: 'Bed', type: 'select', required: true, options: free.map(b => ({ value: b.id, label: b.number + ' — ' + b.ward + ' (' + money(b.rate) + '/day)' })) },
      { name: 'doctorId', label: 'Doctor', type: 'select', required: true, options: doctorOptions() },
      { name: 'admitDate', label: 'Admission date', type: 'date', required: true, value: today() },
      { name: 'reason', label: 'Reason / surgery', full: true }],
    values: { bedId, doctorId: pat ? pat.doctorId : '', reason: pat ? pat.surgeryName : '' },
    onReady: f => f.insertAdjacentHTML('beforeend', patDatalist()),
    onSubmit: v => {
      const p = resolvePatient(v.patient);
      if (all('admissions').some(a => a.patientId === p.id && a.status === 'Admitted')) throw new Error(p.name + ' is already admitted');
      save('admissions', { patientId: p.id, bedId: v.bedId, doctorId: v.doctorId, admitDate: v.admitDate, reason: v.reason, status: 'Admitted' });
      p.stage = 'Admitted'; save('patients', p);
      toast(p.name + ' admitted'); refresh();
    },
  });
}

PAGES.ipd = root => {
  const active = {};
  all('admissions').filter(a => a.status === 'Admitted').forEach(a => { active[a.bedId] = a; });
  const wards = {};
  all('beds').sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })).forEach(b => { (wards[b.ward] = wards[b.ward] || []).push(b); });
  const bedCard = b => {
    const a = active[b.id], p = a && patient(a.patientId);
    return `<div class="bed ${a ? 'occ' : 'free'}"><b>${esc(b.number)}</b><small>${money(b.rate)}/day</small>${a ? `<span>${esc(p ? p.name : '—')}</span><small>${esc(p ? p.pid : '')} · since ${fmtDate(a.admitDate)}</small><button class="btn ghost sm" data-act="discharge" data-id="${a.id}">Discharge</button>` : `<span class="muted">Free</span><button class="btn ghost sm" data-act="admit" data-id="${b.id}">Admit</button>`}</div>`;
  };
  const bedById = id => get('beds', id) || {};
  listView(root, {
    key: 'ipd', title: 'IPD & beds', subtitle: Object.keys(active).length + ' of ' + all('beds').length + ' beds occupied',
    actions: '<button class="btn ghost" data-act="addbed">+ Add bed</button><button class="btn primary" data-act="admit">+ Admit patient</button>',
    above: Object.entries(wards).map(([w, beds]) => `<div class="ward"><h4>${esc(w)}</h4><div class="beds">${beds.map(bedCard).join('')}</div></div>`).join(''),
    rows: () => all('admissions'), dateOf: a => a.admitDate,
    sort: (a, b) => b.admitDate.localeCompare(a.admitDate),
    filters: [{ key: 'status', label: 'Status', options: () => ['Admitted', 'Discharged'], get: a => a.status }],
    columns: [
      { label: 'Admitted on', get: a => fmtDate(a.admitDate), cls: 'nowrap' },
      { label: 'Patient ID', get: a => (patient(a.patientId) || {}).pid || '', html: a => `<a href="#" class="pid" data-act="pat" data-id="${a.patientId}">${esc((patient(a.patientId) || {}).pid || '—')}</a>` },
      { label: 'Patient', get: a => patName(a.patientId) },
      { label: 'Bed', get: a => bedById(a.bedId).number || '' }, { label: 'Ward', get: a => bedById(a.bedId).ward || '' },
      { label: 'Doctor', get: a => docName(a.doctorId) }, { label: 'Reason / surgery', get: a => a.reason || '' },
      { label: 'Discharged on', get: a => fmtDate(a.dischargeDate) },
      { label: 'Days', get: a => Math.max(1, Math.round((toDate(a.dischargeDate || today()) - toDate(a.admitDate)) / 864e5)) },
      { label: 'Status', get: a => a.status, html: a => badge(a.status, statusKind(a.status)) },
    ],
    rowActions: a => a.status === 'Admitted' ? `<button class="btn ghost sm" data-act="discharge">Discharge</button>` : '',
    on: {
      pat: id => patientView(id),
      admit: id => admitModal(null, id && get('beds', id) ? id : ''),
      addbed: () => formModal({
        title: 'Add bed',
        fields: [{ name: 'number', label: 'Bed number', required: true }, { name: 'ward', label: 'Ward', required: true, list: 'ward-list' }, { name: 'rate', label: 'Rate per day (₹)', type: 'number', value: 1500 }],
        onReady: f => f.insertAdjacentHTML('beforeend', `<datalist id="ward-list">${Object.keys(wards).map(w => `<option value="${esc(w)}">`).join('')}</datalist>`),
        onSubmit: v => { save('beds', v); refresh(); },
      }),
      discharge: async id => {
        const a = get('admissions', id), p = patient(a.patientId);
        if (!(await confirmBox('Discharge ' + (p ? p.name : 'patient') + ' today?', 'Discharge'))) return;
        a.status = 'Discharged'; a.dischargeDate = today(); save('admissions', a);
        if (p) { p.stage = 'Discharged'; save('patients', p); }
        toast('Discharged. Create the final bill from Billing.'); refresh();
      },
    },
  });
};

/* ================= DOCTORS ================= */
function availabilityModal(d) {
  const draw = m => {
    $('.modal-body', m.el).innerHTML = `
      <p class="muted">Add the times when ${esc(d.name)} sees patients. These are shown while booking.</p>
      <div class="slots">${(d.slots || []).map(s => `<div class="slot"><span>${esc(slotLabel(s))}</span><button class="btn ghost sm danger" data-rm="${s.id}">Remove</button></div>`).join('') || '<p class="empty">No availability added yet.</p>'}</div>
      <form class="form slot-form"><h4>Add availability</h4><div class="grid">
        <label class="field"><span>When</span><select name="repeat"><option value="everyday">Every day</option><option value="today">Only today</option><option value="date">Specific date</option><option value="weekdays">Monday to Saturday</option><option value="weekly">Selected weekdays</option></select></label>
        <label class="field" data-date hidden><span>Date</span><input type="date" name="date" value="${today()}"></label>
        <div class="field full" data-days hidden><span>Weekdays</span><div class="daypick">${DAY_NAMES.map((n, i) => `<label><input type="checkbox" value="${i}"> ${n}</label>`).join('')}</div></div>
        <label class="field"><span>From</span><input type="time" name="from" value="10:00" required></label>
        <label class="field"><span>To</span><input type="time" name="to" value="13:00" required></label>
      </div><div class="form-err" hidden></div><div class="modal-foot"><button type="button" class="btn ghost" data-close>Close</button><button class="btn primary">+ Add</button></div></form>`;
    const f = $('form', m.el);
    f.repeat.onchange = () => { $('[data-date]', f).hidden = f.repeat.value !== 'date'; $('[data-days]', f).hidden = f.repeat.value !== 'weekly'; };
    $('[data-close]', f).onclick = () => m.close();
    $$('[data-rm]', m.el).forEach(b => { b.onclick = () => { d.slots = d.slots.filter(s => s.id !== b.dataset.rm); save('doctors', d); draw(m); refresh(); }; });
    f.onsubmit = e => {
      e.preventDefault();
      const err = $('.form-err', f), r = f.repeat.value;
      const s = { id: uid(), repeat: r, from: f.from.value, to: f.to.value };
      let msg = '';
      if (s.to <= s.from) msg = '"To" time must be after "From" time';
      if (r === 'today') s.date = today();
      if (r === 'date') { s.date = f.date.value; if (!s.date) msg = 'Choose a date'; }
      if (r === 'weekly') { s.days = $$('.daypick input:checked', f).map(c => +c.value); if (!s.days.length) msg = 'Tick at least one weekday'; }
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      (d.slots = d.slots || []).push(s); save('doctors', d); draw(m); refresh();
    };
  };
  draw(modal({ title: 'Availability – ' + d.name, body: '', size: 'lg' }));
}

PAGES.doctors = root => {
  const t = today();
  crudPage(root, {
    col: 'doctors', noun: 'doctor', title: 'Doctors', subtitle: 'Set each doctor\'s available days and times – every day, only today, a specific date or chosen weekdays.',
    fields: () => [
      { name: 'name', label: 'Name', required: true }, { name: 'department', label: 'Department', type: 'select', required: true, options: all('departments').map(d => d.name) },
      { name: 'qualification', label: 'Qualification' }, { name: 'phone', label: 'Mobile number', type: 'tel' },
      { name: 'fee', label: 'OPD fee (₹)', type: 'number' }, { name: 'active', label: 'Active (available for booking)', type: 'checkbox', value: true },
    ],
    columns: [
      { label: 'Name', get: d => d.name, html: d => `<b>${esc(d.name)}</b><br><small class="muted">${esc(d.qualification || '')}</small>` },
      { label: 'Department', get: d => d.department }, { label: 'OPD fee', get: d => d.fee || '', html: d => d.fee ? money(d.fee) : '' }, { label: 'Mobile', get: d => d.phone || '' },
      { label: 'Availability', get: d => (d.slots || []).map(slotLabel).join(' | '), html: d => (d.slots || []).map(s => `<div class="nowrap">${esc(slotLabel(s))}</div>`).join('') || '<span class="muted">Not set</span>' },
      { label: 'Today', get: d => docSlots(d, t).map(s => fmtTime(s.from) + '–' + fmtTime(s.to)).join(', ') || 'Not available', html: d => { const s = docSlots(d, t); return s.length ? badge(s.map(x => fmtTime(x.from) + '–' + fmtTime(x.to)).join(', '), 'green') : badge('Not available', 'grey'); } },
      { label: 'Appointments today', get: d => all('appointments').filter(a => a.doctorId === d.id && a.date === t && a.status !== 'Cancelled').length },
      { label: 'Status', get: d => d.active === false ? 'Inactive' : 'Active', html: d => badge(d.active === false ? 'Inactive' : 'Active', d.active === false ? 'grey' : 'green') },
    ],
    rowActions: () => `<button class="btn primary sm" data-act="avail">Availability</button>`,
    on: { avail: id => availabilityModal(doctor(id)) },
  });
};

/* ================= DEPARTMENTS / STAFF ================= */
PAGES.departments = root => crudPage(root, {
  col: 'departments', noun: 'department', title: 'Departments',
  fields: () => [{ name: 'name', label: 'Department name', required: true }, { name: 'head', label: 'Head of department', type: 'select', blank: '—', options: all('doctors').map(d => d.name) }, { name: 'notes', label: 'Notes', type: 'textarea' }],
  columns: [
    { label: 'Department', get: d => d.name, html: d => `<b>${esc(d.name)}</b>` }, { label: 'Head', get: d => d.head || '' },
    { label: 'Doctors', get: d => all('doctors').filter(x => x.department === d.name).map(x => x.name).join(', ') },
    { label: 'Patients', get: d => all('patients').filter(p => (doctor(p.doctorId) || {}).department === d.name).length },
    { label: 'Notes', get: d => d.notes || '' },
  ],
});

PAGES.staff = root => crudPage(root, {
  col: 'staff', noun: 'staff member', title: 'Staff & shifts',
  fields: () => [
    { name: 'name', label: 'Name', required: true }, { name: 'role', label: 'Role', required: true, placeholder: 'Nurse, Receptionist, Technician…' },
    { name: 'phone', label: 'Mobile number', type: 'tel' }, { name: 'department', label: 'Department' },
    { name: 'shift', label: 'Shift', type: 'select', noBlank: true, options: ['Morning', 'Evening', 'Night', 'General'] },
    { name: 'from', label: 'Shift starts', type: 'time' }, { name: 'to', label: 'Shift ends', type: 'time' },
    { name: 'weeklyOff', label: 'Weekly off', type: 'select', blank: '—', options: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] },
    { name: 'joinDate', label: 'Joining date', type: 'date' },
  ],
  filters: [{ key: 'shift', label: 'Shift', options: () => ['Morning', 'Evening', 'Night', 'General'], get: s => s.shift }],
  columns: [
    { label: 'Name', get: s => s.name, html: s => `<b>${esc(s.name)}</b>` }, { label: 'Role', get: s => s.role }, { label: 'Mobile', get: s => s.phone || '' },
    { label: 'Department', get: s => s.department || '' }, { label: 'Shift', get: s => s.shift, html: s => badge(s.shift, { Morning: 'amber', Evening: 'purple', Night: 'blue' }[s.shift] || 'grey') },
    { label: 'Timing', get: s => s.from ? fmtTime(s.from) + ' – ' + fmtTime(s.to) : '' }, { label: 'Weekly off', get: s => s.weeklyOff || '' }, { label: 'Joined', get: s => fmtDate(s.joinDate) },
  ],
});

/* ================= BILLING ================= */
const BILL_TYPES = ['OPD', 'Surgery', 'IPD', 'Pharmacy', 'Other'];
const GST_RATES = [0, 5, 12, 18, 28];

function invoiceModal(inv) {
  const isNew = !inv.id;
  const pat0 = patient(inv.patientId);
  let items = (inv.items || []).map(i => Object.assign({}, i));
  const itemRow = (i, n) => `<tr data-i="${n}"><td><input data-k="desc" value="${esc(i.desc)}" placeholder="Description" required></td><td><input data-k="qty" type="number" min="0" step="any" value="${esc(i.qty)}"></td><td><input data-k="rate" type="number" min="0" step="any" value="${esc(i.rate)}"></td><td><select data-k="gst">${GST_RATES.map(g => `<option ${+i.gst === g ? 'selected' : ''}>${g}</option>`).join('')}</select></td><td class="amt"></td><td><button type="button" class="btn ghost sm danger" data-rm>✕</button></td></tr>`;
  const m = modal({
    title: isNew ? 'New bill' : 'Edit bill ' + inv.number, size: 'xl',
    body: `<form class="form"><div class="grid g3">
        ${fieldHTML(patField(pat0), {})}
        ${fieldHTML({ name: 'billType', label: 'Bill type', type: 'select', noBlank: true, options: BILL_TYPES }, inv)}
        ${fieldHTML({ name: 'date', label: 'Bill date', type: 'date', required: true, value: today() }, inv)}
      </div>${patDatalist()}
      <table class="items"><thead><tr><th>Item / service</th><th>Qty</th><th>Rate (₹)</th><th>GST %</th><th>Amount</th><th></th></tr></thead><tbody></tbody></table>
      <button type="button" class="btn ghost sm" data-additem>+ Add item</button>
      <div class="inv-bottom"><div class="grid">
          ${fieldHTML({ name: 'discount', label: 'Discount (₹)', type: 'number', attrs: 'min="0" step="any"' }, inv)}
          ${fieldHTML({ name: 'notes', label: 'Notes on bill' }, inv)}
          ${isNew ? fieldHTML({ name: 'payNow', label: 'Amount received now (₹)', type: 'number', attrs: 'min="0" step="any"', hint: 'Leave 0 for unpaid. Less than total = partial payment.' }, {}) + fieldHTML({ name: 'payMode', label: 'Payment mode', type: 'select', noBlank: true, options: cfg().paymentModes }, {}) : ''}
        </div><div class="totals"></div></div>
      <div class="form-err" hidden></div>
      <div class="modal-foot">${isNew ? '<button type="button" class="btn ghost" data-full>Received full amount</button>' : ''}<button type="button" class="btn ghost" data-cancel>Cancel</button><button class="btn primary">${isNew ? 'Save bill' : 'Save changes'}</button></div></form>`,
  });
  const f = $('form', m.el), tb = $('.items tbody', f);
  const collect = () => { items = $$('tr', tb).map(tr => ({ desc: $('[data-k=desc]', tr).value.trim(), qty: +$('[data-k=qty]', tr).value || 0, rate: +$('[data-k=rate]', tr).value || 0, gst: +$('[data-k=gst]', tr).value || 0 })); };
  const calc = () => invCalc({ items, discount: f.discount.value, payments: inv.payments });
  const totals = () => {
    collect();
    $$('tr', tb).forEach((tr, n) => { $('.amt', tr).textContent = money(items[n].qty * items[n].rate); });
    const c = calc();
    $('.totals', f).innerHTML = `<div><span>Subtotal</span><b>${money(c.sub)}</b></div><div><span>Discount</span><b>− ${money(c.disc)}</b></div><div><span>CGST</span><b>${money(c.gst / 2)}</b></div><div><span>SGST</span><b>${money(c.gst / 2)}</b></div><div class="grand"><span>Total</span><b>${money(c.total)}</b></div>`;
  };
  const drawItems = () => { tb.innerHTML = items.map(itemRow).join(''); totals(); };
  const defaultItem = () => {
    const p = patient(inv.patientId) || {}, d = doctor(p.doctorId), t = f.billType.value;
    if (t === 'OPD') return { desc: 'OPD consultation' + (d ? ' – ' + d.name : ''), qty: 1, rate: d && d.fee ? d.fee : cfg().opdFee, gst: 0 };
    if (t === 'Surgery') return { desc: (p.surgeryName || 'Surgery') + ' – package', qty: 1, rate: 0, gst: 0 };
    return { desc: '', qty: 1, rate: 0, gst: cfg().defaultGst };
  };
  if (!items.length) items = [defaultItem()];
  drawItems();
  let touched = false;
  f.billType.onchange = () => { if (isNew && items.length === 1 && !touched) { items = [defaultItem()]; drawItems(); } };
  f.patient.onchange = () => { try { inv.patientId = resolvePatient(f.patient.value).id; f.billType.onchange(); } catch (e) { /* not picked yet */ } };
  f.oninput = e => { if (e.target.dataset.k) touched = true; totals(); };
  f.onclick = e => {
    if (e.target.closest('[data-additem]')) { collect(); items.push({ desc: '', qty: 1, rate: 0, gst: cfg().defaultGst }); drawItems(); }
    else if (e.target.closest('[data-rm]')) { collect(); items.splice(+e.target.closest('tr').dataset.i, 1); drawItems(); }
    else if (e.target.closest('[data-cancel]')) m.close();
    else if (e.target.closest('[data-full]')) { f.payNow.value = calc().total; }
  };
  f.onsubmit = e => {
    e.preventDefault();
    const err = $('.form-err', f);
    try {
      const p = resolvePatient(f.patient.value);
      collect();
      items = items.filter(i => i.desc);
      if (!items.length) throw new Error('Add at least one item');
      const c = invCalc({ items, discount: f.discount.value });
      const pay = isNew ? +f.payNow.value || 0 : 0;
      if (pay > c.total + 0.009) throw new Error('Amount received is more than the bill total');
      Object.assign(inv, { patientId: p.id, billType: f.billType.value, date: f.date.value, items, discount: +f.discount.value || 0, notes: f.notes.value.trim() });
      if (isNew) {
        inv.number = nextInvoiceNo(inv.billType);
        inv.payments = pay > 0 ? [{ id: uid(), date: inv.date, amount: pay, mode: f.payMode.value, ref: '', by: S.user.name }] : [];
      }
      save('invoices', inv); m.close(); refresh();
      toast('Bill ' + inv.number + ' saved – ' + invCalc(inv).status);
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  };
}

function paymentModal(inv) {
  const c = invCalc(inv), p = patient(inv.patientId) || {};
  const m = formModal({
    title: 'Payments – ' + inv.number + ' (' + (p.name || '') + ')', submitLabel: 'Record payment', size: 'lg',
    fields: [
      { name: 'summary', type: 'html', html: `<div class="pay-sum"><div><small>Bill total</small><b>${money(c.total)}</b></div><div><small>Paid so far</small><b>${money(c.paid)}</b></div><div><small>Balance</small><b class="red">${money(c.balance)}</b></div></div>
        ${(inv.payments || []).length ? `<table class="mini"><thead><tr><th>Date</th><th>Amount</th><th>Mode</th><th>Reference</th><th></th></tr></thead><tbody>${inv.payments.map(x => `<tr><td>${fmtDate(x.date)}</td><td>${money(x.amount)}</td><td>${esc(x.mode)}</td><td>${esc(x.ref || '')}</td><td>${isAdmin() ? `<button type="button" class="btn ghost sm danger" data-delpay="${x.id}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table>` : ''}` },
      { name: 'kind', label: 'Payment type', type: 'select', noBlank: true, options: ['Full payment (clear balance)', 'Partial payment'] },
      { name: 'amount', label: 'Amount (₹)', type: 'number', required: true, value: c.balance, attrs: 'min="0.01" step="any"' },
      { name: 'mode', label: 'Payment mode', type: 'select', noBlank: true, options: cfg().paymentModes },
      { name: 'date', label: 'Payment date', type: 'date', required: true, value: today() },
      { name: 'ref', label: 'Reference / transaction no.', full: true },
    ],
    onReady: (f, mm) => {
      f.kind.onchange = () => { if (f.kind.value.startsWith('Full')) f.amount.value = c.balance; else { f.amount.value = ''; f.amount.focus(); } };
      f.amount.oninput = () => { f.kind.value = +f.amount.value >= c.balance ? 'Full payment (clear balance)' : 'Partial payment'; };
      if (c.balance <= 0) { $$('label.field', f).forEach(l => { l.hidden = true; }); $('.btn.primary', f).hidden = true; }
      f.onclick = async e => {
        const b = e.target.closest('[data-delpay]');
        if (!b || !(await confirmBox('Remove this payment entry?', 'Remove'))) return;
        inv.payments = inv.payments.filter(x => x.id !== b.dataset.delpay); save('invoices', inv); mm.close(); refresh(); paymentModal(inv);
      };
    },
    onSubmit: v => {
      if (!(v.amount > 0)) throw new Error('Enter the amount received');
      if (v.amount > c.balance + 0.009) throw new Error('Amount is more than the balance of ' + money(c.balance));
      (inv.payments = inv.payments || []).push({ id: uid(), date: v.date, amount: v.amount, mode: v.mode, ref: v.ref, by: S.user.name });
      save('invoices', inv); refresh();
      toast('Payment recorded – bill is now ' + invCalc(inv).status.toLowerCase());
    },
  });
  return m;
}

function printInvoice(inv) {
  const s = cfg(), c = invCalc(inv), p = patient(inv.patientId) || {};
  const f = c.sub ? (c.sub - c.disc) / c.sub : 0;
  const rows = inv.items.map((i, n) => { const amt = i.qty * i.rate, tax = amt * f * i.gst / 100; return `<tr><td>${n + 1}</td><td class="l">${esc(i.desc)}</td><td>${i.qty}</td><td>${money(i.rate)}</td><td>${money(amt)}</td><td>${i.gst}%</td><td>${money(tax)}</td><td>${money(amt * f + tax)}</td></tr>`; }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.number)}</title><style>
    *{box-sizing:border-box}body{font:13px/1.5 Arial,Helvetica,sans-serif;color:#111;margin:0;padding:28px}
    .top{display:flex;justify-content:space-between;border-bottom:3px solid #0e5a52;padding-bottom:12px}
    h1{margin:0;font-size:22px;color:#0e5a52}h2{margin:0;font-size:16px;letter-spacing:1px;text-align:right}
    .meta{display:flex;justify-content:space-between;margin:16px 0;gap:24px}.meta div{flex:1}.box{border:1px solid #ccc;border-radius:6px;padding:10px}
    table{width:100%;border-collapse:collapse;margin-top:6px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:right}th{background:#eef5f4}td.l,th.l{text-align:left}
    .tot{width:46%;margin-left:auto;margin-top:12px}.tot td{border:0;padding:3px 8px}.tot .g td{border-top:2px solid #111;font-weight:bold;font-size:15px}
    .words{margin-top:10px;font-style:italic}.foot{display:flex;justify-content:space-between;margin-top:46px}.small{color:#555;font-size:12px}
    @media print{body{padding:0}.noprint{display:none}}</style></head><body>
    <div class="top"><div><h1>${esc(s.hospitalName)}</h1><div class="small">${esc(s.address)}<br>${s.phone ? 'Phone: ' + esc(s.phone) : ''}${s.email ? ' · ' + esc(s.email) : ''}${s.gstin ? '<br><b>GSTIN: ' + esc(s.gstin) + '</b>' : ''}</div></div>
      <div><h2>${c.gst > 0 ? 'TAX INVOICE' : 'BILL OF SUPPLY'}</h2><div class="small" style="text-align:right">${esc(inv.billType)} bill<br>No: <b>${esc(inv.number)}</b><br>Date: ${fmtDate(inv.date)}</div></div></div>
    <div class="meta"><div class="box"><b>Patient</b><br>${esc(p.name || '')}<br>Patient ID: <b>${esc(p.pid || '')}</b><br>Mobile: ${esc(p.phone || '')}${p.age ? '<br>Age / gender: ' + esc(p.age) + ' / ' + esc(p.gender || '') : ''}${p.address ? '<br>' + esc(p.address) : ''}</div>
      <div class="box"><b>Details</b><br>Doctor: ${esc(p.doctorId ? docName(p.doctorId) : '—')}<br>Payment status: <b>${c.status}</b>${inv.notes ? '<br>Note: ' + esc(inv.notes) : ''}</div></div>
    <table><thead><tr><th>#</th><th class="l">Description</th><th>Qty</th><th>Rate</th><th>Amount</th><th>GST</th><th>GST amt</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="tot"><tr><td>Subtotal</td><td>${money(c.sub)}</td></tr>${c.disc ? `<tr><td>Discount</td><td>− ${money(c.disc)}</td></tr><tr><td>Taxable value</td><td>${money(c.taxable)}</td></tr>` : ''}
      <tr><td>CGST</td><td>${money(c.gst / 2)}</td></tr><tr><td>SGST</td><td>${money(c.gst / 2)}</td></tr><tr class="g"><td>Grand total</td><td>${money(c.total)}</td></tr>
      <tr><td>Paid</td><td>${money(c.paid)}</td></tr><tr><td><b>Balance due</b></td><td><b>${money(c.balance)}</b></td></tr></table>
    <div class="words">Amount in words: Rupees ${inWords(c.total)} only</div>
    ${(inv.payments || []).length ? `<p class="small"><b>Payments:</b> ${inv.payments.map(x => fmtDate(x.date) + ' – ' + money(x.amount) + ' (' + esc(x.mode) + (x.ref ? ', ' + esc(x.ref) : '') + ')').join('; ')}</p>` : ''}
    <div class="foot"><div class="small">${esc(s.invoiceFooter)}</div><div style="text-align:center">_______________________<br>Authorised signatory</div></div>
    <p class="noprint" style="text-align:center;margin-top:30px"><button onclick="print()" style="padding:8px 22px;font-size:14px">Print / Save as PDF</button></p></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print the bill', 'err'); return; }
  w.document.write(html); w.document.close();
}

PAGES.billing = root => {
  let billed = 0, paid = 0;
  all('invoices').forEach(i => { const c = invCalc(i); billed += c.total; paid += c.paid; });
  listView(root, {
    key: 'billing', title: 'Billing & invoices', subtitle: 'GST bills with separate OPD and surgery series. Take full or partial payments against any bill.',
    actions: '<button class="btn ghost" data-act="pays">⬇ Payments report</button><button class="btn primary" data-act="add">+ New bill</button>',
    above: `<div class="kpis three"><div class="kpi"><span>Total billed</span><b>${money(billed)}</b></div><div class="kpi"><span>Collected</span><b>${money(paid)}</b></div><div class="kpi"><span>Outstanding</span><b class="red">${money(billed - paid)}</b></div></div>`,
    rows: () => all('invoices'), dateOf: i => i.date,
    sort: (a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt),
    filters: [{ key: 'type', label: 'Bill type', options: () => BILL_TYPES, get: i => i.billType }, { key: 'st', label: 'Payment', options: () => ['Paid', 'Partially paid', 'Unpaid'], get: i => invCalc(i).status }],
    columns: [
      { label: 'Bill no.', get: i => i.number, html: i => `<b>${esc(i.number)}</b>` }, { label: 'Date', get: i => fmtDate(i.date), cls: 'nowrap' },
      { label: 'Patient ID', get: i => (patient(i.patientId) || {}).pid || '', html: i => `<a href="#" class="pid" data-act="pat" data-id="${i.patientId}">${esc((patient(i.patientId) || {}).pid || '—')}</a>` },
      { label: 'Patient', get: i => patName(i.patientId) },
      { label: 'Type', get: i => i.billType, html: i => badge(i.billType, i.billType === 'OPD' ? 'blue' : i.billType === 'Surgery' ? 'purple' : 'grey') },
      { label: 'Total', get: i => invCalc(i).total, html: i => money(invCalc(i).total), cls: 'num' },
      { label: 'Paid', get: i => invCalc(i).paid, html: i => money(invCalc(i).paid), cls: 'num' },
      { label: 'Balance', get: i => invCalc(i).balance, html: i => money(invCalc(i).balance), cls: 'num' },
      { label: 'Payment status', get: i => invCalc(i).status, html: i => badge(invCalc(i).status, statusKind(invCalc(i).status)) },
    ],
    exportExtra: [{ label: 'Mobile', get: i => (patient(i.patientId) || {}).phone || '' }, { label: 'Taxable value', get: i => invCalc(i).taxable }, { label: 'GST', get: i => invCalc(i).gst }, { label: 'Discount', get: i => invCalc(i).disc },
      { label: 'Items', get: i => i.items.map(x => x.desc + ' x' + x.qty + ' @' + x.rate).join('; ') }, { label: 'Payments', get: i => (i.payments || []).map(x => x.date + ' ' + x.amount + ' ' + x.mode).join('; ') }, { label: 'Notes', get: i => i.notes || '' }],
    rowActions: i => `<button class="btn primary sm" data-act="pay">${invCalc(i).balance > 0 ? 'Take payment' : 'Payments'}</button><button class="btn ghost sm" data-act="print">Print</button><button class="btn ghost sm" data-act="edit">Edit</button>` +
      (invCalc(i).balance > 0 ? waBtn((patient(i.patientId) || {}).phone, tplText('Payment reminder', { name: patName(i.patientId), balance: money(invCalc(i).balance), invoice: i.number }), 'Remind') : '') + (isAdmin() ? `<button class="btn ghost sm danger" data-act="del">✕</button>` : ''),
    on: {
      add: () => invoiceModal({}), edit: id => invoiceModal(get('invoices', id)), pay: id => paymentModal(get('invoices', id)),
      print: id => printInvoice(get('invoices', id)), pat: id => patientView(id),
      del: async id => { if (await confirmBox('Delete this bill and its payments?', 'Delete')) { remove('invoices', id); refresh(); } },
      pays: () => { const st = VS.billing; exportXLSX('Payments', [{ name: 'Payments', rows: paymentRows(st.from, st.to) }]); },
    },
  });
};

function paymentRows(from, to) {
  const rows = [];
  all('invoices').forEach(i => (i.payments || []).forEach(x => {
    if ((from && x.date < from) || (to && x.date > to)) return;
    const p = patient(i.patientId) || {};
    rows.push({ 'Payment date': fmtDate(x.date), 'Bill no.': i.number, 'Bill type': i.billType, 'Patient ID': p.pid || '', Patient: p.name || '', Amount: +x.amount, Mode: x.mode, Reference: x.ref || '', 'Received by': x.by || '', _d: x.date });
  }));
  return rows.sort((a, b) => a._d.localeCompare(b._d)).map(r => { delete r._d; return r; });
}

/* ================= CAMPAIGNS ================= */
PAGES.campaigns = root => {
  // campaigns seen in auto-fetched leads are added automatically
  const known = new Set(all('campaigns').map(c => c.name));
  [...new Set(all('leads').map(l => l.campaign).filter(Boolean))].filter(n => !known.has(n)).forEach(n => save('campaigns', { name: n, platform: 'Meta (Facebook + Instagram)', status: 'Active', budget: 0, spend: 0 }));
  const leadsOf = c => all('leads').filter(l => l.campaign === c.name);
  const booked = c => leadsOf(c).filter(l => l.status === BOOK_OPD || l.status === BOOK_SURG).length;
  crudPage(root, {
    col: 'campaigns', noun: 'campaign', title: 'Campaigns', subtitle: 'Leads are matched to campaigns by name. Enter the spend to see cost per lead and per booking.',
    dateOf: c => c.startDate || ymd(c.createdAt),
    fields: () => [
      { name: 'name', label: 'Campaign name (same as in Meta Ads)', required: true, full: true },
      { name: 'platform', label: 'Platform', type: 'select', noBlank: true, options: ['Meta (Facebook + Instagram)', 'Google Ads', 'YouTube', 'WhatsApp broadcast', 'Offline / camp', 'Other'] },
      { name: 'status', label: 'Status', type: 'select', noBlank: true, options: ['Active', 'Paused', 'Completed'] },
      { name: 'startDate', label: 'Start date', type: 'date' }, { name: 'endDate', label: 'End date', type: 'date' },
      { name: 'budget', label: 'Budget (₹)', type: 'number' }, { name: 'spend', label: 'Spent so far (₹)', type: 'number' },
    ],
    columns: [
      { label: 'Campaign', get: c => c.name, html: c => `<b>${esc(c.name)}</b>` }, { label: 'Platform', get: c => c.platform || '' },
      { label: 'Start', get: c => fmtDate(c.startDate) }, { label: 'End', get: c => fmtDate(c.endDate) },
      { label: 'Budget', get: c => +c.budget || 0, html: c => money(c.budget), cls: 'num' }, { label: 'Spent', get: c => +c.spend || 0, html: c => money(c.spend), cls: 'num' },
      { label: 'Leads', get: c => leadsOf(c).length, cls: 'num' }, { label: 'Booked', get: c => booked(c), cls: 'num' },
      { label: 'Conversion %', get: c => leadsOf(c).length ? Math.round(booked(c) / leadsOf(c).length * 100) : 0, cls: 'num' },
      { label: 'Cost per lead', get: c => leadsOf(c).length ? Math.round((+c.spend || 0) / leadsOf(c).length) : 0, html: c => leadsOf(c).length ? money((+c.spend || 0) / leadsOf(c).length) : '—', cls: 'num' },
      { label: 'Status', get: c => c.status || '', html: c => badge(c.status || '—', c.status === 'Active' ? 'green' : 'grey') },
    ],
    rowActions: () => `<button class="btn ghost sm" data-act="leads">View leads</button>`,
    on: { leads: id => { VS.leads = { q: get('campaigns', id).name, from: '', to: '', f: {}, limit: 100 }; location.hash = '#/leads'; } },
  });
};

/* ================= REPORTS ================= */
PAGES.reports = root => {
  const st = VS.reports = VS.reports || { from: today().slice(0, 8) + '01', to: today() };
  const inR = d => d && d.slice(0, 10) >= st.from && d.slice(0, 10) <= st.to;
  const tally = (list, keyFn, valFn) => { const o = {}; list.forEach(x => { const k = keyFn(x) || '—'; o[k] = (o[k] || 0) + (valFn ? valFn(x) : 1); }); return Object.entries(o).sort((a, b) => b[1] - a[1]); };
  const leads = all('leads').filter(l => inR(ymd(l.createdAt)));
  const appts = all('appointments').filter(a => inR(a.date));
  const invs = all('invoices').filter(i => inR(i.date));
  const pats = all('patients').filter(p => inR(ymd(p.createdAt)));
  const pays = paymentRows(st.from, st.to);
  const bookedN = leads.filter(l => l.status === BOOK_OPD || l.status === BOOK_SURG).length;
  const sections = [
    ['Enquiries by source', ['Source', 'Enquiries'], tally(leads, l => l.source)],
    ['Enquiries by status', ['Status', 'Enquiries'], tally(leads, l => l.status)],
    ['Appointments by doctor', ['Doctor', 'Appointments'], tally(appts, a => docName(a.doctorId))],
    ['Appointments by type & status', ['Type / status', 'Count'], tally(appts, a => a.type + ' – ' + a.status)],
    ['Billing by type', ['Bill type', 'Billed (₹)'], tally(invs, i => i.billType, i => invCalc(i).total)],
    ['Collection by payment mode', ['Mode', 'Collected (₹)'], tally(pays, p => p.Mode, p => p.Amount)],
    ['New patients by type', ['Type', 'Patients'], tally(pats, p => p.type)],
  ];
  const isMoney = h => h.includes('₹');
  root.innerHTML = `
    <div class="page-head"><div><h1>Reports</h1><p>Summary for the selected dates. Export gives one Excel file with every sheet.</p></div>
      <div class="head-actions"><label class="tb-date">From <input type="date" data-from value="${st.from}"></label><label class="tb-date">To <input type="date" data-to value="${st.to}"></label><button class="btn excel" data-export>⬇ Export Excel</button></div></div>
    <div class="kpis">
      <div class="kpi"><span>Enquiries</span><b>${leads.length}</b><small>${bookedN} booked (${leads.length ? Math.round(bookedN / leads.length * 100) : 0}%)</small></div>
      <div class="kpi"><span>New patients</span><b>${pats.length}</b><small>IDs generated</small></div>
      <div class="kpi"><span>OPD visits</span><b>${appts.filter(a => a.type === 'OPD').length}</b><small>${appts.filter(a => a.type === 'OPD' && a.status === 'Completed').length} completed</small></div>
      <div class="kpi"><span>Surgeries</span><b>${appts.filter(a => a.type === 'Surgery').length}</b><small>${appts.filter(a => a.type === 'Surgery' && a.status === 'Completed').length} completed</small></div>
      <div class="kpi"><span>Billed</span><b>${money(invs.reduce((a, i) => a + invCalc(i).total, 0))}</b><small>${invs.length} bills</small></div>
      <div class="kpi"><span>Collected</span><b>${money(pays.reduce((a, p) => a + p.Amount, 0))}</b><small>${pays.length} payments</small></div>
    </div>
    <div class="cols">${sections.map(([title, head, rows]) => `<div class="card"><div class="card-head"><h3>${title}</h3></div><table class="mini"><thead><tr><th>${head[0]}</th><th class="num">${head[1]}</th></tr></thead><tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${isMoney(head[1]) ? money(v) : v}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">No data in this period.</td></tr>'}</tbody></table></div>`).join('')}</div>`;
  $('[data-from]', root).onchange = e => { st.from = e.target.value; refresh(); };
  $('[data-to]', root).onchange = e => { st.to = e.target.value; refresh(); };
  $('[data-export]', root).onclick = () => exportXLSX('Hospital report ' + st.from + ' to ' + st.to, [
    ...sections.map(([title, head, rows]) => ({ name: title.replace(/[&]/g, 'and'), rows: rows.map(([k, v]) => ({ [head[0]]: k, [head[1]]: v })) })),
    { name: 'Enquiries', rows: leads.map(l => ({ Received: fmtDT(l.createdAt), Name: l.name, Mobile: l.phone, Source: l.source, Campaign: l.campaign || '', Status: l.status, 'Patient ID': (patient(l.patientId) || {}).pid || '', Notes: l.notes || '' })) },
    { name: 'Appointments', rows: appts.map(a => ({ Date: fmtDate(a.date), Time: fmtTime(a.time), 'Patient ID': (patient(a.patientId) || {}).pid || '', Patient: patName(a.patientId), Type: a.type, Surgery: a.surgeryName || '', Doctor: docName(a.doctorId), Status: a.status })) },
    { name: 'Bills', rows: invs.map(i => { const c = invCalc(i); return { 'Bill no.': i.number, Date: fmtDate(i.date), 'Patient ID': (patient(i.patientId) || {}).pid || '', Patient: patName(i.patientId), Type: i.billType, Taxable: c.taxable, GST: c.gst, Total: c.total, Paid: c.paid, Balance: c.balance, Status: c.status }; }) },
    { name: 'Payments', rows: pays },
  ]);
};

/* ================= INTEGRATIONS ================= */
PAGES.integrations = async root => {
  const base = location.origin + location.pathname.replace(/[^/]*$/, '') + 'api/';
  const live = S.mode === 'api';
  let sec = { values: {}, set: {} };
  if (live) { try { sec = await api('secrets_get'); } catch (e) { toast(e.message, 'err'); } }
  const v = sec.values, isSet = sec.set;
  const inp = (k, label, secret) => `<label class="field"><span>${label}</span><input name="${k}" ${live ? '' : 'disabled'} ${secret ? `type="password" placeholder="${isSet[k] ? '•••••••• saved – type to replace' : 'Not set'}"` : `value="${esc(v[k] || '')}"`} autocomplete="off"></label>`;
  const copy = (label, val) => `<label class="field full"><span>${label}</span><div class="copy"><input readonly value="${esc(val)}"><button type="button" class="btn ghost sm" data-copy>Copy</button></div></label>`;
  const st = ok => badge(ok ? 'Connected' : 'Not connected', ok ? 'green' : 'grey');
  const metaOk = isSet.meta_app_secret && isSet.meta_page_token, waOk = isSet.wa_token && v.wa_phone_id, ytOk = isSet.yt_api_key && v.yt_channel_id;
  const key = v.hook_key || 'YOUR_KEY';
  root.innerHTML = `
    <div class="page-head"><div><h1>Integrations</h1><p>Connect your channels once. New leads, comments and messages then flow into Patient enquiries and Inbox automatically.</p></div></div>
    ${live ? '' : `<div class="banner">Demo mode: integrations need the site running on your Hostinger domain (HTTPS). Use the buttons below to see how incoming leads will look.
      <div class="sim"><button class="btn sm primary" data-sim="ad">Simulate Meta ad lead</button><button class="btn sm primary" data-sim="wa">Simulate WhatsApp message</button><button class="btn sm primary" data-sim="ig">Simulate Instagram comment</button><button class="btn sm primary" data-sim="yt">Simulate YouTube comment</button><button class="btn sm primary" data-sim="call">Simulate incoming call</button></div></div>`}
    <form class="integ">
      <div class="card"><div class="card-head"><h3>Meta – Facebook, Instagram &amp; Lead Ads</h3>${st(metaOk)}</div>
        <p class="muted">Auto-fetches leads from Meta ad forms, plus comments and messages on your Facebook Page and Instagram account.</p>
        <ol class="steps-list"><li>Create an app at developers.facebook.com (type: Business) and add the <b>Webhooks</b>, <b>Messenger</b> and <b>Instagram</b> products.</li>
        <li>In Webhooks, add the callback URL and verify token below. Subscribe the <b>Page</b> object to <code>leadgen</code>, <code>feed</code>, <code>messages</code> and the <b>Instagram</b> object to <code>comments</code>, <code>messages</code>.</li>
        <li>Generate a long-lived <b>Page access token</b> with permissions <code>leads_retrieval</code>, <code>pages_manage_metadata</code>, <code>pages_read_engagement</code>, <code>pages_messaging</code>, <code>instagram_manage_comments</code>, <code>instagram_manage_messages</code> and paste it here with the App secret.</li></ol>
        <div class="grid">${copy('Webhook callback URL', base + 'webhook-meta.php')}${copy('Verify token', v.meta_verify_token || '(shown after hosting)')}
        ${inp('meta_app_secret', 'App secret', true)}${inp('meta_page_token', 'Page access token', true)}${inp('meta_page_id', 'Facebook Page ID')}</div></div>
      <div class="card"><div class="card-head"><h3>WhatsApp Business (Cloud API)</h3>${st(waOk)}</div>
        <p class="muted">Incoming WhatsApp messages appear in Inbox and create enquiries. One-click WhatsApp buttons work even without this, using WhatsApp on the receptionist's phone or computer.</p>
        <ol class="steps-list"><li>In the same Meta app add the <b>WhatsApp</b> product and register the hospital number.</li><li>In WhatsApp → Configuration use the same callback URL and verify token as above and subscribe to <code>messages</code>.</li><li>Paste a permanent access token (System User) and the Phone number ID.</li></ol>
        <div class="grid">${inp('wa_token', 'Access token', true)}${inp('wa_phone_id', 'Phone number ID')}</div></div>
      <div class="card"><div class="card-head"><h3>YouTube comments</h3>${st(ytOk)}</div>
        <p class="muted">New comments on your channel's videos are checked every few minutes while the dashboard is open.</p>
        <ol class="steps-list"><li>In Google Cloud Console enable <b>YouTube Data API v3</b> and create an API key.</li><li>Paste the key and your Channel ID (starts with UC…).</li><li>Optional: add a Hostinger cron job for the URL below to sync even when nobody is logged in.</li></ol>
        <div class="grid">${inp('yt_api_key', 'API key', true)}${inp('yt_channel_id', 'Channel ID')}${copy('Cron URL (optional, every 15 min)', base + 'cron-youtube.php?key=' + key)}</div>
        ${live ? '<button type="button" class="btn ghost sm" data-yt>Sync YouTube comments now</button>' : ''}</div>
      <div class="card"><div class="card-head"><h3>Office phone calls</h3>${badge('Needs a cloud telephony number', 'amber')}</div>
        <p class="muted">Calls can only be captured when the office number runs on a cloud telephony / IVR service (Exotel, MyOperator, Knowlarity, Tata Smartflo, Airtel IQ…). A normal landline or SIM cannot send call data to software. In the provider's panel, set the "incoming call webhook" to the URL below – every caller becomes an enquiry with source "Phone call".</p>
        <div class="grid">${copy('Incoming call webhook URL', base + 'webhook-call.php?key=' + key)}</div></div>
      ${live ? '<div class="sticky-save"><button class="btn primary">Save integration settings</button></div>' : ''}
    </form>`;
  root.onclick = e => {
    const c = e.target.closest('[data-copy]');
    if (c) { const i = c.previousElementSibling; i.select(); navigator.clipboard && navigator.clipboard.writeText(i.value); toast('Copied'); return; }
    if (e.target.closest('[data-yt]')) { api('yt_sync').then(j => { toast(j.count + ' recent comments checked'); return pollNow(); }).catch(x => toast(x.message, 'err')); return; }
    const s = e.target.closest('[data-sim]');
    if (!s) return;
    const n = Math.floor(1000 + Math.random() * 9000), names = ['Ravi Teja', 'Meena Kumari', 'Abdul Rahman', 'Divya Menon', 'Harish Goud'], nm = names[n % names.length];
    const sim = {
      ad: { from: nm, phone: '98765' + n + '1', source: 'Meta Ads – Facebook', campaign: 'Piles Laser – Nov', text: 'city: Hyderabad' },
      wa: { platform: 'whatsapp', kind: 'message', from: nm, phone: '90000' + n + '2', text: 'Hello, I want to book an appointment' },
      ig: { platform: 'instagram', kind: 'comment', from: nm.toLowerCase().replace(' ', '_') + n, text: 'How much does this treatment cost?' },
      yt: { platform: 'youtube', kind: 'comment', from: nm, text: 'Please share your contact number' },
      call: { from: 'Caller 99887' + n + '3', phone: '99887' + n + '3', source: 'Phone call', text: 'Incoming call (missed)' },
    }[s.dataset.sim];
    ingestLocal(sim); updateBadges();
    toast('New enquiry added from ' + (sim.source || sim.platform) + ' – see Patient enquiries');
  };
  const form = $('form.integ', root);
  form.onsubmit = async e => {
    e.preventDefault();
    const vals = {};
    $$('input[name]', form).forEach(i => { if (i.type !== 'password' || i.value) vals[i.name] = i.value; });
    try { await api('secrets_save', { values: vals }); toast('Integration settings saved'); refresh(); } catch (x) { toast(x.message, 'err'); }
  };
};

/* ================= USER MANAGEMENT ================= */
PAGES.users = async root => {
  const live = S.mode === 'api';
  if (live) { try { S.users = (await api('users')).users; } catch (e) { toast(e.message, 'err'); } }
  const edit = u => formModal({
    title: u ? 'Edit user' : 'Add user',
    fields: [
      { name: 'name', label: 'Full name', required: true }, { name: 'username', label: 'Username (for login)', required: true },
      { name: 'role', label: 'Role', type: 'select', noBlank: true, options: ['Receptionist', 'Admin', 'Doctor', 'Accounts'] },
      { name: 'password', label: u ? 'New password (leave blank to keep)' : 'Password (min 8 characters)', type: 'password', required: !u },
      { name: 'active', label: 'Active – can log in', type: 'checkbox', value: true },
    ],
    values: u ? Object.assign({}, u, { active: !!+u.active }) : {},
    onSubmit: async v => {
      if (live) await api('user_save', Object.assign({ id: u ? u.id : '' }, v));
      else { delete v.password; if (u) Object.assign(u, v); else S.users.push(Object.assign({ id: uid() }, v)); persistLocal(); }
      refresh();
    },
  });
  listView(root, {
    key: 'users', title: 'User management', subtitle: 'Admins can change integrations, settings and users. Receptionists work on enquiries, patients, appointments and billing.',
    actions: '<button class="btn primary" data-act="add">+ Add user</button>',
    rows: () => S.users, sort: (a, b) => a.name.localeCompare(b.name),
    columns: [
      { label: 'Name', get: u => u.name, html: u => `<b>${esc(u.name)}</b>` }, { label: 'Username', get: u => u.username },
      { label: 'Role', get: u => u.role, html: u => badge(u.role, u.role === 'Admin' ? 'purple' : 'blue') },
      { label: 'Status', get: u => +u.active ? 'Active' : 'Disabled', html: u => badge(+u.active ? 'Active' : 'Disabled', +u.active ? 'green' : 'grey') },
    ],
    rowActions: u => `<button class="btn ghost sm" data-act="edit">Edit</button>` + (u.id !== S.user.id ? `<button class="btn ghost sm danger" data-act="del">✕</button>` : ''),
    on: {
      add: () => edit(), edit: id => edit(S.users.find(u => u.id === id)),
      del: async id => {
        if (!(await confirmBox('Delete this user?', 'Delete'))) return;
        try { if (live) await api('user_delete', { id }); else { S.users = S.users.filter(u => u.id !== id); persistLocal(); } refresh(); } catch (e) { toast(e.message, 'err'); }
      },
    },
  });
};

/* ================= SETTINGS ================= */
PAGES.settings = root => {
  const s = cfg();
  const tplRow = t => `<div class="tpl"><input data-tn value="${esc(t.name)}" placeholder="Template name"><textarea data-tt rows="2" placeholder="Message text">${esc(t.text)}</textarea><button type="button" class="btn ghost sm danger" data-rmtpl>✕</button></div>`;
  root.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><p>Hospital details used on bills, dropdown options and WhatsApp templates.</p></div></div>
    <form class="form settings">
      <div class="card"><div class="card-head"><h3>Hospital &amp; billing</h3></div><div class="grid">
        ${fieldHTML({ name: 'hospitalName', label: 'Hospital name', required: true }, s)}${fieldHTML({ name: 'gstin', label: 'GSTIN' }, s)}
        ${fieldHTML({ name: 'address', label: 'Address', full: true }, s)}
        ${fieldHTML({ name: 'phone', label: 'Phone' }, s)}${fieldHTML({ name: 'email', label: 'Email' }, s)}
        ${fieldHTML({ name: 'defaultGst', label: 'Default GST % for new bill items', type: 'select', noBlank: true, options: GST_RATES }, s)}
        ${fieldHTML({ name: 'opdFee', label: 'Default OPD fee (₹)', type: 'number' }, s)}
        ${fieldHTML({ name: 'countryCode', label: 'Country code for WhatsApp / calls', hint: '91 for India' }, s)}
        ${fieldHTML({ name: 'invoiceFooter', label: 'Bill footer text' }, s)}</div></div>
      <div class="card"><div class="card-head"><h3>Dropdown options</h3></div><p class="muted">One option per line. "${BOOK_OPD}" and "${BOOK_SURG}" are always available as statuses because they create the patient ID.</p><div class="grid g3">
        ${fieldHTML({ name: 'leadStatuses', label: 'Enquiry statuses', type: 'textarea', rows: 8 }, { leadStatuses: s.leadStatuses.join('\n') })}
        ${fieldHTML({ name: 'leadSources', label: 'Enquiry sources', type: 'textarea', rows: 8 }, { leadSources: s.leadSources.join('\n') })}
        ${fieldHTML({ name: 'paymentModes', label: 'Payment modes', type: 'textarea', rows: 8 }, { paymentModes: s.paymentModes.join('\n') })}</div></div>
      <div class="card"><div class="card-head"><h3>WhatsApp message templates</h3><button type="button" class="btn ghost sm" data-addtpl>+ Add template</button></div>
        <p class="muted">Placeholders: {name} {pid} {doctor} {date} {time} {hospital} {balance} {invoice}. The first template is used by the one-click follow-up button.</p><div class="tpls">${s.waTemplates.map(tplRow).join('')}</div></div>
      <div class="sticky-save">${S.mode === 'api' ? '<button type="button" class="btn ghost" data-pw>Change my password</button>' : '<button type="button" class="btn ghost danger" data-reset>Reset demo data</button>'}<button class="btn primary">Save settings</button></div>
    </form>`;
  const f = $('form', root);
  root.onclick = async e => {
    if (e.target.closest('[data-addtpl]')) $('.tpls', f).insertAdjacentHTML('beforeend', tplRow({ name: '', text: '' }));
    else if (e.target.closest('[data-rmtpl]')) e.target.closest('.tpl').remove();
    else if (e.target.closest('[data-reset]')) { if (await confirmBox('Erase all demo data in this browser and start again?', 'Reset')) { clearTimeout(lsTimer); localStorage.removeItem(LS_KEY); location.reload(); } }
    else if (e.target.closest('[data-pw]')) formModal({
      title: 'Change my password', fields: [{ name: 'old', label: 'Current password', type: 'password', required: true, full: true }, { name: 'new', label: 'New password (min 8 characters)', type: 'password', required: true, full: true }],
      onSubmit: async v => { await api('password', v); toast('Password changed'); },
    });
  };
  f.onsubmit = e => {
    e.preventDefault();
    const v = readForm(f), lines = t => t.split('\n').map(x => x.trim()).filter(Boolean);
    const special = [BOOK_OPD, BOOK_SURG];
    const doc = Object.assign({}, s, v, {
      defaultGst: +v.defaultGst, countryCode: digits(v.countryCode) || '91',
      leadStatuses: lines(v.leadStatuses).filter(x => !special.includes(x)), leadSources: lines(v.leadSources), paymentModes: lines(v.paymentModes),
      waTemplates: $$('.tpl', f).map(t => ({ name: $('[data-tn]', t).value.trim(), text: $('[data-tt]', t).value.trim() })).filter(t => t.name && t.text),
    });
    if (!doc.leadStatuses.includes('New')) doc.leadStatuses.unshift('New');
    if (!doc.leadSources.length || !doc.paymentModes.length || !doc.waTemplates.length) { toast('Keep at least one source, payment mode and template', 'err'); return; }
    save('settings', doc); toast('Settings saved'); renderShell();
  };
};
