/**
 * 계산기 공통 화면 코드. <form data-calc="모듈명"> 하나를 찾아 해당 계산 모듈(calc/모듈명.js)과 연결한다.
 * 입력값은 브라우저 안에서만 쓰며 네트워크로 보내지 않는다.
 */
import { AVAILABLE_YEARS, DEFAULT_YEAR } from './rules/index.js';

const form = document.querySelector('form[data-calc]');
const $ = (id) => document.getElementById(id);
const resultSection = $('result');
const status = $('result-status');

const el = (tag, attrs = {}, text) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};

function fillSelects() {
  form.querySelectorAll('select[data-years]').forEach((s) => {
    AVAILABLE_YEARS.forEach((y) => s.add(new Option(`${y}년`, String(y))));
    s.value = String(DEFAULT_YEAR);
    s.dataset.default = s.value;
  });
  form.querySelectorAll('select[data-months]').forEach((s) => {
    for (let m = 1; m <= 12; m += 1) s.add(new Option(`${m}월`, String(m)));
    s.value = String(new Date().getMonth() + 1);
    s.dataset.default = s.value;
  });
}

const koUnit = (n) => {
  if (n >= 1e8) { const e = Math.floor(n / 1e8); const r = Math.floor((n % 1e8) / 1e4); return `${e}억${r ? ` ${r.toLocaleString('ko-KR')}만` : ''} 원`; }
  if (n >= 1e4) return `${Math.floor(n / 1e4).toLocaleString('ko-KR')}만 원`;
  return '';
};
function updatePreview(input) {
  const p = $(`${input.name}-preview`);
  if (!p) return;
  const t = input.value.replace(/[,\s원]/g, '');
  p.textContent = /^\d+$/.test(t) && Number(t) > 0 ? `${Number(t).toLocaleString('ko-KR')}원${koUnit(Number(t)) ? ` (${koUnit(Number(t))})` : ''}` : '';
}

function applyMode() {
  const mode = form.querySelector('input[name="mode"]:checked')?.value;
  if (!mode) return;
  form.querySelectorAll('[data-mode-label]').forEach((lab) => {
    const text = lab.dataset[`label${mode[0].toUpperCase()}${mode.slice(1)}`];
    if (text) lab.querySelector('.label-text').textContent = text;
  });
}

function readRaw() {
  const raw = {};
  for (const e of form.elements) {
    if (!e.name) continue;
    if (e.type === 'radio') { if (e.checked) raw[e.name] = e.value; else if (!(e.name in raw)) raw[e.name] = ''; continue; }
    if (e.type === 'checkbox') { raw[e.name] = e.checked ? e.value : ''; continue; }
    raw[e.name] = e.type === 'date' && e.validity?.badInput ? 'invalid' : e.value;
  }
  return raw;
}

function clearErrors() {
  form.querySelectorAll('.error').forEach((p) => { p.hidden = true; p.textContent = ''; });
  form.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
}

function showErrors(errors) {
  let first = null;
  for (const [name, msg] of Object.entries(errors)) {
    const p = $(`${name}-error`);
    if (p) { p.textContent = msg; p.hidden = false; }
    const input = form.elements[name];
    const target = input instanceof RadioNodeList ? input[0] : input;
    if (target) { target.setAttribute('aria-invalid', 'true'); first ??= target; }
  }
  first?.focus();
  status.textContent = `입력값을 확인해 주세요. ${Object.values(errors).join(' ')}`;
}

function list(id, items) {
  const ul = $(id); ul.replaceChildren();
  items.forEach((t) => ul.append(el('li', {}, t)));
  ul.closest('[data-block]').hidden = items.length === 0;
}

function renderTable(t) {
  const wrap = $('result-table'); wrap.replaceChildren();
  if (!t) { wrap.hidden = true; return; }
  wrap.hidden = false;
  const table = el('table', { class: 'detail-table' });
  const thead = el('thead'); const hr = el('tr');
  t.head.forEach((h) => hr.append(el('th', { scope: 'col' }, h)));
  thead.append(hr); table.append(thead);
  const tbody = el('tbody');
  t.rows.forEach((r) => { const tr = el('tr'); r.forEach((c, i) => tr.append(i === 0 ? el('th', { scope: 'row' }, c) : el('td', { 'data-label': t.head[i] }, c))); tbody.append(tr); });
  table.append(tbody);
  if (t.foot) { const tf = el('tfoot'); const tr = el('tr'); t.foot.forEach((c, i) => tr.append(i === 0 ? el('th', { scope: 'row' }, c) : el('td', { 'data-label': t.head[i] }, c))); tf.append(tr); table.append(tf); }
  const scroller = el('div', { class: 'table-scroll' }); scroller.append(table);
  if (t.collapsible) {
    const d = el('details', { class: 'schedule-fold' }); d.append(el('summary', {}, t.collapsible), scroller); wrap.append(d);
  } else wrap.append(scroller);
}

function render(r) {
  resultSection.hidden = false;
  $('result-unavailable').hidden = true;
  $('result-body').hidden = false;
  $('result-meta').textContent = r.meta;
  const stats = $('result-stats'); stats.replaceChildren();
  r.stats.forEach((s, i) => {
    const d = el('div', { class: `stat${i === 0 ? ' stat-main' : ''}` });
    d.append(el('span', { class: 'stat-label' }, s.label), el('span', { class: 'stat-value' }, s.value));
    stats.append(d);
  });
  renderTable(r.table);
  const dl = $('result-rows'); dl.replaceChildren();
  r.rows.forEach((x) => { const row = el('div', { class: 'kv' }); row.append(el('dt', {}, x.label), el('dd', {}, x.value)); dl.append(row); });
  dl.hidden = r.rows.length === 0;
  list('result-formulas', r.formulas);
  list('result-warnings', r.warnings);
  status.textContent = `계산 결과: ${r.headline.label} ${r.headline.value}`;
}

function renderUnavailable(r) {
  resultSection.hidden = false;
  $('result-body').hidden = true;
  const box = $('result-unavailable'); box.hidden = false;
  $('unavailable-reason').textContent = r.unavailable;
  status.textContent = `계산할 수 없습니다. ${r.unavailable}`;
}

function hideResult() { resultSection.hidden = true; }

function hasInput() {
  return [...form.elements].some((e) => (e.type === 'text' || e.type === 'date') && e.value !== (e.defaultValue ?? ''));
}

async function init() {
  if (!form) return;
  const mod = await import(`./calc/${form.dataset.calc}.js`);
  fillSelects();
  applyMode();
  form.querySelectorAll('input[data-amount]').forEach((i) => { updatePreview(i); i.addEventListener('input', () => updatePreview(i)); });
  form.addEventListener('change', (e) => { if (e.target.name === 'mode') applyMode(); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors();
    const r = mod.calculate(readRaw());
    if (r.ok) { render(r); $('result-title').focus(); resultSection.scrollIntoView({ block: 'start' }); }
    else if (r.unavailable) { renderUnavailable(r); $('result-title').focus(); }
    else { hideResult(); showErrors(r.errors); }
  });
  $('reset-all').addEventListener('click', () => {
    if (hasInput() && !window.confirm('입력한 내용과 결과를 모두 지우고 처음 상태로 되돌릴까요?')) return;
    form.reset();
    form.querySelectorAll('select[data-default]').forEach((s) => { s.value = s.dataset.default; });
    form.querySelectorAll('input[data-amount]').forEach(updatePreview);
    applyMode(); clearErrors(); hideResult(); status.textContent = '입력을 초기화했습니다.';
    form.querySelector('input[type="text"], input[type="date"]')?.focus();
  });
  // 뒤로 가기 복원 시 화면 상태 맞추기
  window.addEventListener('pageshow', () => { applyMode(); form.querySelectorAll('input[data-amount]').forEach(updatePreview); });
  form.dataset.ready = 'true';
}

init();
