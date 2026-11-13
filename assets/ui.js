'use strict';
/* UI helpers: escaping, toasts, modals, forms, list views, Excel export. */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function toast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.textContent = msg;
  $('#toast-root').appendChild(t);
  setTimeout(() => t.remove(), type === 'err' ? 6000 : 3500);
}

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  leads: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
  patients: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  appointments: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  followups: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  ipd: '<path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/>',
  doctors: '<circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0M12 14v4M10 16h4"/>',
  departments: '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  staff: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  billing: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  campaigns: '<path d="M3 11v2a1 1 0 0 0 1 1h3l7 4V6L7 10H4a1 1 0 0 0-1 1zM17 9a4 4 0 0 1 0 6"/>',
  reports: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  integrations: '<path d="M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1 1"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1-1"/>',
  users: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2M19 8v6M22 11h-6"/>',
  settings: '<path d="M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
};
const icon = n => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;

/* ---------- modal ---------- */
function modal({ title, body, size, onOpen }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-bg';
  wrap.innerHTML = `<div class="modal ${size || ''}" role="dialog" aria-modal="true"><div class="modal-head"><h3>${esc(title)}</h3><button class="x" aria-label="Close">×</button></div><div class="modal-body">${body}</div></div>`;
  const m = { el: wrap, onClose: null, close() { wrap.remove(); } };
  const dismiss = () => { m.close(); if (m.onClose) m.onClose(); };
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) dismiss(); });
  $('.x', wrap).onclick = dismiss;
  $('#modal-root').appendChild(wrap);
  if (onOpen) onOpen(wrap, m);
  const f = $('input:not([type=hidden]):not([readonly]),select,textarea', wrap);
  if (f) f.focus();
  return m;
}
const modalOpen = () => !!$('#modal-root').children.length;

/* ---------- forms ---------- */
function fieldHTML(f, v) {
  const val = v[f.name] ?? f.value ?? '';
  const req = f.required ? 'required' : '';
  let inp;
  if (f.type === 'select') {
    const opts = (f.options || []).map(o => typeof o === 'object' ? o : { value: o, label: o });
    inp = `<select name="${f.name}" ${req}>${f.required && !f.noBlank ? '<option value="">Select…</option>' : f.blank ? `<option value="">${esc(f.blank)}</option>` : ''}${opts.map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(val) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  } else if (f.type === 'textarea') {
    inp = `<textarea name="${f.name}" rows="${f.rows || 3}" ${req} placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>`;
  } else if (f.type === 'checkbox') {
    return `<label class="field check ${f.full ? 'full' : ''}"><input type="checkbox" name="${f.name}" ${val ? 'checked' : ''}> ${esc(f.label)}</label>`;
  } else if (f.type === 'html') {
    return `<div class="field full" data-html="${f.name}">${f.html || ''}</div>`;
  } else {
    inp = `<input type="${f.type || 'text'}" name="${f.name}" value="${esc(val)}" ${req} ${f.readonly ? 'readonly' : ''} ${f.list ? `list="${f.list}"` : ''} ${f.attrs || ''} placeholder="${esc(f.placeholder || '')}" autocomplete="off">`;
  }
  return `<label class="field ${f.full || f.type === 'textarea' ? 'full' : ''}"><span>${esc(f.label)}${f.required ? ' <b class="req">*</b>' : ''}</span>${inp}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`;
}

function readForm(form) {
  const o = {};
  $$('[name]', form).forEach(el => { o[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : +el.value) : el.value.trim(); });
  return o;
}

/** onSubmit(values, form) may return false / throw Error(msg) to keep the modal open. */
function formModal({ title, fields, values, onSubmit, submitLabel, size, onReady, onCancel, extraButtons }) {
  const body = `<form class="form"><div class="grid">${fields.map(f => fieldHTML(f, values || {})).join('')}</div>
    <div class="form-err" hidden></div>
    <div class="modal-foot">${extraButtons || ''}<button type="button" class="btn ghost" data-cancel>Cancel</button><button class="btn primary">${esc(submitLabel || 'Save')}</button></div></form>`;
  const m = modal({ title, body, size });
  const form = $('form', m.el);
  m.onClose = onCancel || null;
  $('[data-cancel]', form).onclick = () => { m.close(); if (onCancel) onCancel(); };
  form.onsubmit = async e => {
    e.preventDefault();
    const err = $('.form-err', form);
    err.hidden = true;
    try {
      const r = await onSubmit(readForm(form), form, m);
      if (r !== false) m.close();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  };
  if (onReady) onReady(form, m);
  return m;
}

function confirmBox(msg, yesLabel) {
  return new Promise(res => {
    const m = modal({ title: 'Please confirm', body: `<p class="confirm-msg">${esc(msg)}</p><div class="modal-foot"><button class="btn ghost" data-n>Cancel</button><button class="btn primary" data-y>${esc(yesLabel || 'Yes')}</button></div>` });
    m.onClose = () => res(false);
    $('[data-n]', m.el).onclick = () => { m.close(); res(false); };
    $('[data-y]', m.el).onclick = () => { m.close(); res(true); };
  });
}

/* ---------- Excel export ---------- */
function exportXLSX(name, sheets) {
  const file = name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '_' + today();
  if (!sheets.some(s => s.rows.length)) { toast('Nothing to export for this date range', 'err'); return; }
  if (window.XLSX) {
    const wb = XLSX.utils.book_new();
    sheets.forEach(s => {
      const ws = XLSX.utils.json_to_sheet(s.rows);
      const keys = Object.keys(s.rows[0] || {});
      ws['!cols'] = keys.map(k => ({ wch: Math.min(45, Math.max(k.length, ...s.rows.slice(0, 200).map(r => String(r[k] ?? '').length)) + 2) }));
      XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
    });
    XLSX.writeFile(wb, file + '.xlsx');
  } else { // fallback: CSV that Excel opens
    const s = sheets[0], keys = Object.keys(s.rows[0] || {});
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const csv = '﻿' + [keys.map(q).join(',')].concat(s.rows.map(r => keys.map(k => q(r[k])).join(','))).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = file + '.csv';
    a.click();
  }
  toast('Excel file downloaded');
}

/* ---------- list view (search + date range + filters + Excel export + table) ---------- */
const VS = {}; // per-view filter state, kept while navigating

function listView(root, o) {
  const st = VS[o.key] = VS[o.key] || { q: '', from: '', to: '', f: {}, limit: 100 };
  root.innerHTML = `
    <div class="page-head"><div><h1>${esc(o.title)}</h1>${o.subtitle ? `<p>${esc(o.subtitle)}</p>` : ''}</div><div class="head-actions">${o.actions || ''}</div></div>
    ${o.above || ''}
    <div class="card">
      <div class="toolbar">
        <input type="search" class="tb-q" placeholder="Search in this list…" value="${esc(st.q)}">
        ${(o.filters || []).map(f => `<select data-f="${f.key}"><option value="">${esc(f.label)}: All</option>${f.options().map(x => `<option ${st.f[f.key] === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`).join('')}
        ${o.dateOf ? `<label class="tb-date">From <input type="date" class="tb-from" value="${st.from}"></label><label class="tb-date">To <input type="date" class="tb-to" value="${st.to}"></label>
        <button class="btn ghost sm" data-range="today">Today</button><button class="btn ghost sm" data-range="month">This month</button><button class="btn ghost sm" data-range="all">All</button>` : ''}
        <span class="spacer"></span>
        <button class="btn excel" data-export>⬇ Export Excel</button>
      </div>
      <div class="table-wrap"><table><thead><tr>${o.columns.map(c => `<th>${esc(c.label)}</th>`).join('')}${o.rowActions ? '<th></th>' : ''}</tr></thead><tbody></tbody></table></div>
      <div class="table-foot"></div>
    </div>`;
  const filtered = () => {
    const q = st.q.toLowerCase();
    return o.rows().filter(r => {
      if (o.dateOf) { const d = (o.dateOf(r) || '').slice(0, 10); if (st.from && d < st.from) return false; if (st.to && d > st.to) return false; }
      for (const f of (o.filters || [])) if (st.f[f.key] && f.get(r) !== st.f[f.key]) return false;
      if (q && !o.columns.some(c => String(c.get(r) ?? '').toLowerCase().includes(q))) return false;
      return true;
    }).sort(o.sort || ((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
  };
  const draw = () => {
    const rows = filtered();
    $('tbody', root).innerHTML = rows.slice(0, st.limit).map(r => `<tr data-id="${esc(r.id)}" class="${o.rowClass ? o.rowClass(r) : ''}">${o.columns.map(c => `<td class="${c.cls || ''}">${c.html ? c.html(r) : esc(c.get(r))}</td>`).join('')}${o.rowActions ? `<td class="row-actions">${o.rowActions(r)}</td>` : ''}</tr>`).join('')
      || `<tr><td colspan="${o.columns.length + 1}" class="empty">${esc(o.empty || 'Nothing here yet.')}</td></tr>`;
    $('.table-foot', root).innerHTML = `<span>${rows.length} record${rows.length === 1 ? '' : 's'}</span>${rows.length > st.limit ? '<button class="btn ghost sm" data-more>Show more</button>' : ''}`;
  };
  draw();
  $('.tb-q', root).oninput = e => { st.q = e.target.value; draw(); };
  root.onchange = e => {
    const t = e.target;
    if (t.classList.contains('tb-from')) { st.from = t.value; draw(); }
    else if (t.classList.contains('tb-to')) { st.to = t.value; draw(); }
    else if (t.dataset.f) { st.f[t.dataset.f] = t.value; draw(); }
    else if (t.dataset.chg && o.change && o.change[t.dataset.chg]) o.change[t.dataset.chg](t.closest('tr').dataset.id, t.value, t);
  };
  root.onclick = e => {
    const b = e.target.closest('[data-range],[data-export],[data-more],[data-act]');
    if (!b) return;
    if (b.tagName === 'A' && b.getAttribute('href') === '#') e.preventDefault();
    if (b.dataset.range) {
      const r = b.dataset.range;
      st.from = r === 'today' ? today() : r === 'month' ? today().slice(0, 8) + '01' : '';
      st.to = r === 'all' ? '' : today();
      $('.tb-from', root).value = st.from; $('.tb-to', root).value = st.to; draw();
    } else if (b.hasAttribute('data-export')) {
      const cols = o.columns.concat(o.exportExtra || []);
      exportXLSX(o.title, [{ name: o.title, rows: filtered().map(r => Object.fromEntries(cols.map(c => [c.label, c.get(r) ?? '']))) }]);
    } else if (b.hasAttribute('data-more')) { st.limit += 200; draw(); }
    else if (b.dataset.act && o.on && o.on[b.dataset.act]) {
      const tr = b.closest('tr');
      o.on[b.dataset.act](b.dataset.id || (tr && tr.dataset.id), b);
    }
  };
}

const badge = (text, kind) => `<span class="badge ${kind || ''}">${esc(text)}</span>`;
const selectHTML = (name, options, val) => `<select data-chg="${name}" class="inline-select">${options.includes(val) || !val ? '' : `<option selected>${esc(val)}</option>`}${options.map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;

/** Indian-style amount in words for invoices. */
function inWords(num) {
  num = Math.round(+num || 0);
  if (!num) return 'Zero';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = n => n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
  const three = n => (n >= 100 ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + two(n % 100);
  let out = '';
  const cr = Math.floor(num / 1e7), lk = Math.floor(num / 1e5) % 100, th = Math.floor(num / 1e3) % 100, rest = num % 1000;
  if (cr) out += three(cr) + ' Crore ';
  if (lk) out += two(lk) + ' Lakh ';
  if (th) out += two(th) + ' Thousand ';
  if (rest) out += three(rest);
  return out.trim();
}
