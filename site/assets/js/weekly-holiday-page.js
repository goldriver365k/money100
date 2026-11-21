/**
 * 주휴수당 계산기 화면 코드. 판정은 weekly-holiday.js 에 위임한다.
 * 입력값은 이 페이지 안에서만 사용하며 네트워크로 보내지 않는다.
 */
import {
  CHECKED_DATE,
  CONFIRM,
  EMPLOYMENT_TYPES,
  MAX_WEEKS,
  RULES,
  SOURCES,
  STATUS_LABELS,
  evaluate,
  formatAverage,
  formatMinutes,
  isoOf,
  longDate,
  parseTime,
  resolvePeriod,
  shortDate,
  weekdayName,
} from './weekly-holiday.js';
import { formatNumber } from './proration.js';
import { showErrorSummary, hideErrorSummary } from './error-summary.js';

const $ = (id) => document.getElementById(id);
const form = $('whp-form');
const tabs = $('week-tabs');
const panels = $('week-panels');
const resultSection = $('result');
const resultStatus = $('result-status');

/** 날짜별 입력값 { h, m, att } — 주 범위를 바꿔도 유지 */
const dayData = new Map();
/** '이 주는 근무 없음'으로 확정한 주차 */
const noWork = new Set();
let period = null;
let activeWeek = null;
let announceTimer = 0;

const FIELD_ERRORS = {
  hireDate: ['hire-date', 'hire-date-error'],
  status: [null, 'status-error'],
  endDate: ['end-date', 'end-date-error'],
  checkStart: ['check-start', 'check-start-error'],
  wage: ['wage', 'wage-error'],
  employmentType: ['employment-type', 'employment-type-error'],
  normalWeekdays: [null, 'normal-weekdays-error'],
};

/* ---------------- 초기화 ---------------- */

function init() {
  const wc = $('week-count');
  for (let i = 1; i <= MAX_WEEKS; i += 1) wc.add(new Option(`${i}주`, String(i)));
  wc.value = '4';

  const picks = $('normal-weekdays');
  ['일', '월', '화', '수', '목', '금', '토'].forEach((name, d) => {
    const label = document.createElement('label');
    label.className = 'weekday-pick';
    label.innerHTML = `<input type="checkbox" name="normalWeekday" value="${d}" ${d >= 1 && d <= 5 ? 'checked' : ''}> <span>${name}</span>`;
    picks.append(label);
  });

  const list = $('source-list');
  for (const [id, s] of Object.entries(SOURCES)) {
    const li = document.createElement('li');
    li.innerHTML = `<a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.label}<span class="sr-only"> (새 창에서 열림)</span></a> — ${s.note}${s.version ? ` <span class="muted">(${s.version})</span>` : ''} <span class="muted">[${id}]</span>`;
    list.append(li);
  }

  form.addEventListener('input', onInput);
  form.addEventListener('change', onInput);
  form.addEventListener('submit', onSubmit);
  form.addEventListener('click', onClick);
  $('prev-week').addEventListener('click', () => moveWeek(-1));
  $('next-week').addEventListener('click', () => moveWeek(1));
  window.addEventListener('pageshow', () => {
    renderWeeks();
    updateScope();
  });
  updateScope();
  renderWeeks();
}

/* ---------------- 기본 정보 ---------------- */

function readBase() {
  return {
    hireDate: $('hire-date').value,
    status: form.querySelector('input[name="status"]:checked')?.value ?? 'employed',
    endDate: $('end-date').value,
    checkStart: $('check-start').value,
    weekCount: $('week-count').value,
  };
}

function updateScope() {
  const type = $('employment-type').value;
  const note = $('scope-note');
  if (type === 'hourly') {
    note.hidden = true;
    note.textContent = '';
  } else {
    note.hidden = false;
    note.textContent = type === 'monthly'
      ? `${CONFIRM}: 월급제는 월급에 주휴수당이 포함되는지 계약을 확인해야 합니다. 지급 요건은 판정하지만 예상액은 표시하지 않습니다.`
      : `${CONFIRM}: ${EMPLOYMENT_TYPES[type]}은(는) 판정 기준이 달라 이 계산기에서 판정하지 않습니다. 근로계약서와 관할 고용노동관서(1350)에서 확인하세요.`;
  }
  $('end-field').hidden = readBase().status !== 'left';
}

/* ---------------- 주별 근무표 ---------------- */

function renderWeeks() {
  const base = readBase();
  const p = resolvePeriod(base);
  const area = $('weeks-area');
  const placeholder = $('weeks-placeholder');
  if (!p.ok) {
    period = null;
    area.hidden = true;
    placeholder.hidden = false;
    $('week-rule').textContent = '';
    return;
  }
  period = p;
  area.hidden = false;
  placeholder.hidden = true;
  const startDay = weekdayName(p.hire);
  const endDay = weekdayName(p.hire + 6);
  $('week-rule').textContent = `1주 = ${startDay}요일~${endDay}요일 (재직 시작일 ${longDate(p.hire)} 기준). 날짜별로 시간을 비워 두면 휴무로 보고, 한 주 전체가 비어 있으면 ‘입력 안 됨’으로 봅니다.`;

  tabs.replaceChildren();
  panels.replaceChildren();
  for (const w of p.weeks) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'week-tab';
    tab.id = `tab-${w.week}`;
    tab.dataset.week = String(w.week);
    tab.setAttribute('aria-controls', `panel-${w.week}`);
    tabs.append(tab);
    panels.append(buildPanel(w));
  }
  if (!p.weeks.some((w) => w.week === activeWeek)) activeWeek = p.weeks[0].week;
  for (const w of p.weeks) refreshWeek(w.week);
  showWeek(activeWeek, false);
}

const employedAt = (i) => period && i >= period.hire && (period.end === null || i <= period.end);

function buildPanel(w) {
  const sec = document.createElement('section');
  sec.className = 'week-panel';
  sec.id = `panel-${w.week}`;
  sec.dataset.week = String(w.week);
  sec.setAttribute('aria-labelledby', `panel-title-${w.week}`);
  sec.hidden = true;
  const h = document.createElement('h3');
  h.id = `panel-title-${w.week}`;
  h.className = 'week-title';
  h.textContent = `${w.week}주차 · ${shortDate(w.start)}~${shortDate(w.end)}`;
  sec.append(h);

  const list = document.createElement('div');
  list.className = 'day-list';
  for (let i = w.start; i <= w.end; i += 1) {
    const iso = isoOf(i);
    const row = document.createElement('div');
    row.className = 'day-row';
    row.dataset.iso = iso;
    const name = longDate(i);
    if (!employedAt(i)) {
      row.classList.add('day-off');
      row.innerHTML = `<span class="day-label">${shortDate(i)}</span><span class="muted">재직 기간이 아닙니다</span>`;
      list.append(row);
      continue;
    }
    const v = dayData.get(iso) ?? { h: '', m: '', att: null };
    row.innerHTML = `
      <span class="day-label" id="lbl-${iso}">${shortDate(i)}</span>
      <span class="time-inputs">
        <input type="text" inputmode="numeric" maxlength="2" class="t-h" id="h-${iso}" data-iso="${iso}" data-part="h" value="${v.h}" aria-label="${name} 미리 정한 근무시간(시간)" aria-describedby="err-${iso}">
        <span aria-hidden="true">시간</span>
        <input type="text" inputmode="numeric" maxlength="2" class="t-m" id="m-${iso}" data-iso="${iso}" data-part="m" value="${v.m}" aria-label="${name} 미리 정한 근무시간(분)" aria-describedby="err-${iso}">
        <span aria-hidden="true">분</span>
      </span>
      <fieldset class="att" id="att-${iso}">
        <legend class="sr-only">${name} 출근 여부</legend>
        ${[['present', '출근'], ['absent', '결근'], ['excused', '휴가·휴업']].map(([val, txt]) =>
          `<label class="att-opt"><input type="radio" name="att-${iso}" value="${val}" data-iso="${iso}" ${v.att === val ? 'checked' : ''}> <span>${txt}</span></label>`).join('')}
      </fieldset>
      <p class="error day-error" id="err-${iso}" hidden></p>`;
    list.append(row);
  }
  sec.append(list);

  const foot = document.createElement('div');
  foot.className = 'week-foot';
  foot.innerHTML = `
    <p class="week-sum" id="sum-${w.week}"></p>
    <div class="week-actions">
      ${w.week > period.weeks[0].week ? `<button type="button" class="btn btn-ghost" data-action="copy" data-week="${w.week}">이전 주와 같게</button>` : ''}
      <button type="button" class="btn btn-ghost" data-action="nowork" data-week="${w.week}" aria-pressed="false" id="nowork-${w.week}">이 주는 근무 없음</button>
    </div>`;
  sec.append(foot);
  return sec;
}

function weekDays(n) {
  const w = period.weeks.find((x) => x.week === n);
  const out = [];
  for (let i = w.start; i <= w.end; i += 1) if (employedAt(i)) out.push(i);
  return out;
}

function refreshWeek(n) {
  let total = 0;
  let workdays = 0;
  let any = false;
  for (const i of weekDays(n)) {
    const iso = isoOf(i);
    const v = dayData.get(iso) ?? { h: '', m: '', att: null };
    const t = parseTime(v.h, v.m);
    const att = $(`att-${iso}`);
    const minutes = t.ok ? t.minutes : null;
    if (minutes !== null) any = true;
    if (minutes) {
      total += minutes;
      workdays += 1;
    }
    if (att) att.hidden = !(minutes > 0);
  }
  const isNoWork = noWork.has(n);
  const sum = $(`sum-${n}`);
  sum.textContent = isNoWork
    ? '이 주는 근무 없음(0시간)으로 확정했습니다.'
    : any ? `이 주 합계 ${formatMinutes(total)} · 근무일 ${workdays}일` : '아직 입력하지 않았습니다.';
  const btn = $(`nowork-${n}`);
  btn.setAttribute('aria-pressed', String(isNoWork));
  const tab = $(`tab-${n}`);
  const w = period.weeks.find((x) => x.week === n);
  const state = isNoWork ? '근무 없음' : any ? '입력됨' : '비어 있음';
  tab.innerHTML = `<span class="tab-week">${n}주차</span><span class="tab-range">${shortDate(w.start)}~</span><span class="tab-state ${any || isNoWork ? 'is-done' : ''}">${state}</span>`;
}

function showWeek(n, focus = true) {
  activeWeek = n;
  for (const sec of panels.children) sec.hidden = Number(sec.dataset.week) !== n;
  for (const tab of tabs.children) tab.setAttribute('aria-current', Number(tab.dataset.week) === n ? 'true' : 'false');
  const idx = period.weeks.findIndex((w) => w.week === n);
  $('prev-week').disabled = idx <= 0;
  $('next-week').disabled = idx >= period.weeks.length - 1;
  $('week-progress').textContent = `${idx + 1} / ${period.weeks.length}주`;
  if (focus) $(`panel-title-${n}`).setAttribute('tabindex', '-1'), $(`panel-title-${n}`).focus();
}

function moveWeek(delta) {
  const idx = period.weeks.findIndex((w) => w.week === activeWeek);
  const next = period.weeks[idx + delta];
  if (next) showWeek(next.week);
}

/* ---------------- 이벤트 ---------------- */

function hideResult() {
  window.clearTimeout(announceTimer);
  $('basis-body').hidden = true; // 지난 판정의 적용 규칙은 숨기되, 접이식 영역의 열림 상태는 건드리지 않는다
  if (!resultSection.hidden) {
    resultSection.hidden = true;
    resultStatus.textContent = '';
  }
}

function clearError(key) {
  const f = FIELD_ERRORS[key];
  if (!f) return;
  const err = $(f[1]);
  err.hidden = true;
  err.textContent = '';
  if (f[0]) $(f[0]).removeAttribute('aria-invalid');
}

function onInput(e) {
  const t = e.target;
  hideResult();
  if (t.dataset.iso) {
    const iso = t.dataset.iso;
    const v = { ...(dayData.get(iso) ?? { h: '', m: '', att: null }) };
    if (t.dataset.part) v[t.dataset.part] = t.value;
    if (t.type === 'radio') v.att = t.value;
    dayData.set(iso, v);
    const n = Number(t.closest('.week-panel').dataset.week);
    if (t.dataset.part && t.value !== '') noWork.delete(n);
    const errEl = $(`err-${iso}`);
    errEl.hidden = true;
    errEl.textContent = '';
    for (const id of [`h-${iso}`, `m-${iso}`]) $(id)?.removeAttribute('aria-invalid');
    refreshWeek(n);
    return;
  }
  if (t.name === 'normalWeekday') return clearError('normalWeekdays');
  if (t.id === 'wage') return clearError('wage');
  if (t.id === 'employment-type') {
    clearError('employmentType');
    return updateScope();
  }
  if (['hire-date', 'end-date', 'check-start', 'week-count'].includes(t.id) || t.name === 'status') {
    if (e.type === 'input' && t.type === 'date' && t.validity.badInput) return;
    if (t.id === 'hire-date') noWork.clear();
    ['hireDate', 'endDate', 'checkStart', 'status'].forEach(clearError);
    updateScope();
    renderWeeks();
  }
}

function onClick(e) {
  const tab = e.target.closest('.week-tab');
  if (tab) return showWeek(Number(tab.dataset.week));
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const n = Number(btn.dataset.week);
  hideResult();
  if (btn.dataset.action === 'nowork') {
    if (noWork.has(n)) {
      noWork.delete(n);
    } else {
      noWork.add(n);
      for (const i of weekDays(n)) {
        const iso = isoOf(i);
        dayData.set(iso, { h: '', m: '', att: null });
        $(`h-${iso}`).value = '';
        $(`m-${iso}`).value = '';
        form.querySelectorAll(`input[name="att-${iso}"]`).forEach((r) => { r.checked = false; });
      }
    }
    refreshWeek(n);
  } else if (btn.dataset.action === 'copy') {
    const prev = period.weeks[period.weeks.findIndex((w) => w.week === n) - 1];
    noWork.delete(n);
    for (let k = 0; k < 7; k += 1) {
      const src = isoOf(prev.start + k);
      const dst = prev.start + 7 + k;
      if (!employedAt(dst)) continue;
      const iso = isoOf(dst);
      const s = dayData.get(src) ?? { h: '', m: '' };
      const cur = dayData.get(iso) ?? { att: null };
      dayData.set(iso, { h: s.h ?? '', m: s.m ?? '', att: cur.att ?? null });
      $(`h-${iso}`).value = s.h ?? '';
      $(`m-${iso}`).value = s.m ?? '';
    }
    if (noWork.has(prev.week)) noWork.add(n);
    refreshWeek(n);
  }
}

function collectRaw() {
  const days = {};
  if (period) {
    for (const w of period.weeks) {
      for (const i of weekDays(w.week)) {
        const iso = isoOf(i);
        const v = dayData.get(iso) ?? { h: '', m: '', att: null };
        days[iso] = { h: v.h, m: v.m, attendance: v.att };
      }
    }
  }
  return {
    ...readBase(),
    hireDate: $('hire-date').validity.badInput ? 'invalid' : $('hire-date').value,
    endDate: $('end-date').validity.badInput ? 'invalid' : $('end-date').value,
    checkStart: $('check-start').validity.badInput ? 'invalid' : $('check-start').value,
    employmentType: $('employment-type').value,
    wage: $('wage').value,
    normalWeekdays: [...form.querySelectorAll('input[name="normalWeekday"]:checked')].map((x) => Number(x.value)),
    days,
    noWorkWeeks: [...noWork],
  };
}

function showErrors(errors) {
  let first = null;
  const items = [];
  for (const [key, msg] of Object.entries(errors)) {
    if (key.startsWith('day:')) {
      const iso = key.slice(4);
      const el = $(`err-${iso}`);
      el.textContent = msg;
      el.hidden = false;
      for (const id of [`h-${iso}`, `m-${iso}`]) $(id).setAttribute('aria-invalid', 'true');
      items.push({ target: $(`h-${iso}`), message: msg });
      if (!first) {
        const n = Number(el.closest('.week-panel').dataset.week);
        showWeek(n, false);
        first = $(`h-${iso}`);
      }
      continue;
    }
    const f = FIELD_ERRORS[key];
    if (!f) continue;
    const err = $(f[1]);
    err.textContent = msg;
    err.hidden = false;
    if (key === 'normalWeekdays') form.querySelector('details.advanced').open = true;
    const target = f[0] ? $(f[0]) : key === 'status' ? form.querySelector('input[name="status"]') : form.querySelector('input[name="normalWeekday"]');
    if (f[0]) target.setAttribute('aria-invalid', 'true');
    items.push({ target, message: msg });
    if (!first) first = target;
  }
  (showErrorSummary(form, items) ?? first)?.focus();
}

function onSubmit(e) {
  e.preventDefault();
  hideErrorSummary(form);
  Object.keys(FIELD_ERRORS).forEach(clearError);
  form.querySelectorAll('.day-error').forEach((el) => { el.hidden = true; el.textContent = ''; });
  const out = evaluate(collectRaw());
  window.clearTimeout(announceTimer);
  if (!out.ok) {
    resultSection.hidden = true;
    resultStatus.textContent = '';
    showErrors(out.errors);
    return;
  }
  renderResult(out.result);
}

/* ---------------- 결과 ---------------- */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function sourceText(ids) {
  return ids.map((id) => SOURCES[id]?.label).filter(Boolean).join(', ');
}

function renderResult(r) {
  const base = readBase();
  $('result-meta').textContent = `재직 시작일 ${longDate(period.hire)} · 1주 = ${weekdayName(period.hire)}요일~${weekdayName(period.hire + 6)}요일 · ` +
    (period.end === null ? '재직 중' : `마지막 재직일 ${longDate(period.end)}`) + ` · 근무 형태 ${EMPLOYMENT_TYPES[$('employment-type').value]}`;
  const table = $('whp-table');
  const blocked = $('blocked-note');
  const needsBox = $('needs');
  const tbody = $('whp-rows');
  tbody.replaceChildren();

  if (r.blocked) {
    blocked.hidden = false;
    blocked.textContent = r.note;
    table.hidden = true;
    needsBox.hidden = true;
    $('result-summary').textContent = '';
    $('basis-body').innerHTML = '';
    $('basis-body').hidden = true;
    finishResult(`판정하지 않음. ${r.note}`);
    return;
  }
  blocked.hidden = true;
  table.hidden = false;

  const s = r.summary;
  let summary = `지급 대상 ${s.eligible}주 · 지급 대상 아님 ${s.ineligible}주 · 정보 부족 ${s.insufficient}주`;
  if (s.total !== null && s.eligible > 0) summary += ` · 지급 대상 주의 세전 예상액 합계 ${formatNumber(s.total)}원`;
  $('result-summary').textContent = summary;

  // 추가로 입력할 값
  const needWeeks = new Set();
  const needDates = new Set();
  for (const w of r.weeks) for (const n of w.needs) {
    if (n.type === 'schedule') n.weeks.forEach((k) => needWeeks.add(k));
    if (n.type === 'attendance') n.dates.forEach((d) => needDates.add(d));
  }
  const list = $('needs-list');
  list.replaceChildren();
  const inRange = new Set(period.weeks.map((w) => w.week));
  for (const k of [...needWeeks].sort((a, b) => a - b)) {
    const li = document.createElement('li');
    const start = period.hire + 7 * (k - 1);
    const label = `${k}주차 ${shortDate(start)}~${shortDate(start + 6)} 근무표 (근무가 없었다면 ‘이 주는 근무 없음’)`;
    li.innerHTML = inRange.has(k)
      ? `<button type="button" class="link-btn" data-goto-week="${k}">${esc(label)}</button>`
      : `${esc(label)} — 확인 시작일·주 수를 조정해 이 주를 포함하세요.`;
    list.append(li);
  }
  for (const iso of [...needDates].sort()) {
    const li = document.createElement('li');
    const n = period.weeks.find((w) => iso >= isoOf(w.start) && iso <= isoOf(w.end))?.week;
    const idx = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
    li.innerHTML = `<button type="button" class="link-btn" data-goto-week="${n}" data-goto-iso="${iso}">${esc(longDate(idx))} 출근 여부</button>`;
    list.append(li);
  }
  needsBox.hidden = list.children.length === 0;

  for (const w of r.weeks) {
    const tr = document.createElement('tr');
    tr.setAttribute('role', 'row');
    tr.className = `st-${w.status}`;
    tr.dataset.week = String(w.week);
    const win = w.window;
    const applied = win
      ? `평균 ${formatAverage(win.avgNum, win.avgDen)} <span class="muted">(이 주 ${formatMinutes(w.weekMinutes)})</span>`
      : `이 주 ${formatMinutes(w.weekMinutes)}`;
    const alt = w.altWindow ? `<br><span class="muted">비교 기간 ${shortDate(w.altWindow.start)}~${shortDate(w.altWindow.end)} 평균 ${formatAverage(w.altWindow.avgNum, w.altWindow.avgDen)}</span>` : '';
    const reason = `${esc(w.reason)}${w.capped ? ' <span class="muted">하루 8시간·1주 40시간을 넘는 시간은 반영하지 않았습니다.</span>' : ''}` +
      (w.confirm ? `<br><strong class="confirm">${CONFIRM}</strong> ${esc(w.confirm.replace(` ${CONFIRM}.`, '').replace(`${CONFIRM}: `, ''))}` : '') +
      `<br><span class="rule-ref">근거: ${esc(RULES[w.rule].title)} — ${esc(SOURCES[w.sources[0]].label)}${w.sources.length > 1 ? ` 외 ${w.sources.length - 1}건` : ''}</span>`;
    const amount = w.amount !== null
      ? `<span class="amount-value">${formatNumber(w.amount)}원</span> <span class="muted">${esc(w.formula)}</span>`
      : `<span class="muted">${w.status === 'eligible' ? esc(w.amountNote) : '—'}</span>`;
    tr.innerHTML = `
      <th role="rowheader" scope="row">${w.week}주차</th>
      <td role="cell" data-label="판정" data-col="status"><div class="cell-v"><span class="badge badge-${w.status}">${STATUS_LABELS[w.status]}</span></div></td>
      <td role="cell" data-label="세전 예상액" data-col="amount" class="amount${w.amount !== null ? ' has-amount' : ''}"><div class="cell-v">${amount}</div></td>
      <td role="cell" data-label="판정 이유" data-col="reason" class="reason"><div class="cell-v">${reason}</div></td>
      <td role="cell" data-label="판정 기간" data-col="range"><div class="cell-v">${shortDate(w.start)}~${shortDate(w.end)}</div></td>
      <td role="cell" data-label="평균 기간" data-col="window"><div class="cell-v">${win ? esc(win.text) : '—'}${alt}</div></td>
      <td role="cell" data-label="적용 시간" data-col="applied"><div class="cell-v">${applied}</div></td>`;
    tbody.append(tr);
  }

  // 적용 규칙과 근거
  const used = [...new Set(r.weeks.map((w) => w.rule))];
  if (r.weeks.some((w) => w.amount !== null)) used.push('AMOUNT');
  const ids = [...new Set(used.flatMap((u) => RULES[u].sources))];
  $('basis-body').hidden = false;
  $('basis-body').innerHTML =
    `<h3>이번 판정에 적용한 규칙</h3><ul>${used.map((u) => `<li><strong>${u}</strong> ${esc(RULES[u].title)} — ${esc(sourceText(RULES[u].sources))}</li>`).join('')}</ul>` +
    `<ul class="sources">${ids.map((id) => `<li><a href="${SOURCES[id].url}" target="_blank" rel="noopener noreferrer">${esc(SOURCES[id].label)}<span class="sr-only"> (새 창에서 열림)</span></a> — ${esc(SOURCES[id].note)}</li>`).join('')}</ul>` +
    `<p class="checked-date">공식 자료 확인일: <time datetime="${CHECKED_DATE}">2026년 11월 21일</time> · 명세: 생활계산서 주휴수당 계산기 구현 명세 v0.1</p>`;

  finishResult(`판정 결과: ${summary}.`);
}

function finishResult(text) {
  resultSection.hidden = false;
  // 판정 결과로 이동 (모바일에서 결과가 화면 밖에 있지 않도록)
  const title = $('result-title');
  title.focus({ preventScroll: true });
  title.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  resultStatus.textContent = '';
  announceTimer = window.setTimeout(() => { resultStatus.textContent = text; }, 50);
}

/* ---------- 전체 초기화 ---------- */

function hasUserInput() {
  const anyDay = [...dayData.values()].some((v) => (v.h ?? '') !== '' || (v.m ?? '') !== '' || v.att);
  const weekdays = [...form.querySelectorAll('input[name="normalWeekday"]:checked')].map((x) => x.value).join(',');
  return anyDay || noWork.size > 0 || $('hire-date').value !== '' || $('end-date').value !== '' || $('wage').value.trim() !== '' ||
    $('check-start').value !== '' || $('week-count').value !== '4' || $('employment-type').value !== 'hourly' ||
    readBase().status !== 'employed' || weekdays !== '1,2,3,4,5' || !resultSection.hidden;
}

/** 모든 입력·근무표를 처음 상태로 되돌린다. 접이식 영역의 열림 상태는 그대로 둔다. */
function resetAll() {
  if (hasUserInput() && !window.confirm('입력한 근무표와 결과를 모두 지우고 처음 상태로 되돌릴까요?')) return;
  hideErrorSummary(form);
  dayData.clear();
  noWork.clear();
  activeWeek = null;
  $('employment-type').value = 'hourly';
  for (const id of ['hire-date', 'end-date', 'wage', 'check-start']) $(id).value = '';
  $('week-count').value = '4';
  form.querySelector('input[name="status"][value="employed"]').checked = true;
  for (const box of form.querySelectorAll('input[name="normalWeekday"]')) box.checked = ['1', '2', '3', '4', '5'].includes(box.value);
  Object.keys(FIELD_ERRORS).forEach(clearError);
  hideResult();
  $('basis-body').innerHTML = '';
  updateScope();
  renderWeeks();
  $('employment-type').focus();
  window.clearTimeout(announceTimer);
  resultStatus.textContent = '';
  announceTimer = window.setTimeout(() => { resultStatus.textContent = '입력과 근무표를 모두 지우고 처음 상태로 되돌렸습니다.'; }, 50);
}
$('reset-all').addEventListener('click', resetAll);

resultSection.addEventListener('click', (e) => {
  const b = e.target.closest('[data-goto-week]');
  if (!b) return;
  const n = Number(b.dataset.gotoWeek);
  showWeek(n, false);
  const iso = b.dataset.gotoIso;
  const target = iso ? form.querySelector(`input[name="att-${iso}"]`) : $(`panel-${n}`).querySelector('input');
  (target ?? $(`panel-title-${n}`)).focus();
});

init();
