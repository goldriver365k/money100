/**
 * 월급 일할계산기 화면 코드. 계산은 proration.js 에 위임한다.
 * 입력값은 이 페이지 안에서만 사용하며 네트워크로 보내지 않는다.
 */
import {
  SETTLEMENT_TYPES,
  SETTLEMENT_TYPE_LABELS,
  MESSAGES,
  WEEKDAY_NAMES,
  calculateProration,
  dayOfWeek,
  daysInMonth,
  defaultWorkdays,
  describeDiff,
  describeFormula,
  formatWon,
  parseSalary,
  resolveEmploymentRange,
  toIsoDate,
} from './proration.js';

const $ = (id) => document.getElementById(id);

const form = $('proration-form');
const salaryInput = $('salary');
const salaryPreview = $('salary-preview');
const yearSelect = $('year');
const monthSelect = $('month');
const startInput = $('start-date');
const endInput = $('end-date');
const startField = $('start-field');
const endField = $('end-field');
const grid = $('calendar-grid');
const scheduleSummary = $('schedule-summary');
const resultSection = $('result');
const resultStatus = $('result-status');

const FIELD_ERROR_TARGETS = {
  salary: { input: salaryInput, error: $('salary-error') },
  startDate: { input: startInput, error: $('start-date-error') },
  endDate: { input: endInput, error: $('end-date-error') },
  workdays: { input: null, error: $('schedule-error') },
};

/* ---------- 상태 읽기 ---------- */

function selectedPeriod() {
  return { year: Number(yearSelect.value), month: Number(monthSelect.value) };
}

function selectedType() {
  return form.querySelector('input[name="type"]:checked')?.value ?? SETTLEMENT_TYPES.JOIN;
}

function selectedWorkdays() {
  return [...grid.querySelectorAll('input[type="checkbox"]:checked')].map((el) => Number(el.value));
}

/** type="date" 는 불완전·잘못된 입력이면 value 가 빈 문자열이므로 badInput 으로 구분한다. */
function dateValue(input) {
  if (input.validity && input.validity.badInput) return 'invalid';
  return input.value;
}

/* ---------- 초기화 ---------- */

function populatePeriodSelects() {
  const now = new Date();
  const thisYear = now.getFullYear();
  for (let y = thisYear - 5; y <= thisYear + 3; y += 1) {
    yearSelect.add(new Option(`${y}년`, String(y)));
  }
  for (let m = 1; m <= 12; m += 1) {
    monthSelect.add(new Option(`${m}월`, String(m)));
  }
  yearSelect.value = String(thisYear);
  monthSelect.value = String(now.getMonth() + 1);
}

function renderCalendar() {
  const { year, month } = selectedPeriod();
  const last = daysInMonth(year, month);
  const firstDow = dayOfWeek(year, month, 1);
  const defaults = new Set(defaultWorkdays(year, month));
  const frag = document.createDocumentFragment();

  for (let i = 0; i < firstDow; i += 1) {
    const blank = document.createElement('span');
    blank.className = 'day day-blank';
    blank.setAttribute('aria-hidden', 'true');
    frag.append(blank);
  }

  for (let d = 1; d <= last; d += 1) {
    const dow = dayOfWeek(year, month, d);
    const label = document.createElement('label');
    label.className = 'day';
    if (dow === 0) label.classList.add('sun');
    if (dow === 6) label.classList.add('sat');
    label.dataset.day = String(d);

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.name = 'workday';
    box.value = String(d);
    box.id = `workday-${d}`;
    box.checked = defaults.has(d);

    const text = document.createElement('span');
    text.className = 'day-num';
    text.innerHTML = `<span class="sr-only">${month}월 </span>${d}<span class="sr-only">일 ${WEEKDAY_NAMES[dow]}요일</span>`;

    label.append(box, text);
    frag.append(label);
  }

  grid.replaceChildren(frag);
  grid.dataset.period = `${year}-${month}`;
}

function applyDateBounds() {
  const { year, month } = selectedPeriod();
  const min = toIsoDate(year, month, 1);
  const max = toIsoDate(year, month, daysInMonth(year, month));
  for (const input of [startInput, endInput]) {
    input.min = min;
    input.max = max;
  }
}

function applyTypeVisibility() {
  const type = selectedType();
  startField.hidden = type === SETTLEMENT_TYPES.LEAVE;
  endField.hidden = type === SETTLEMENT_TYPES.JOIN;
}

/* ---------- 보조 표시 ---------- */

function updateSalaryPreview() {
  const parsed = parseSalary(salaryInput.value);
  salaryPreview.textContent = parsed.ok ? `입력 금액: ${formatWon(parsed.value)}` : '';
}

/** 날짜가 유효할 때 달력에 재직 구간을 표시하고 선택 일수 요약을 갱신한다. */
function updateScheduleState() {
  const { year, month } = selectedPeriod();
  const range = resolveEmploymentRange({
    year,
    month,
    type: selectedType(),
    startDate: dateValue(startInput),
    endDate: dateValue(endInput),
  });
  const workdays = selectedWorkdays();
  let inRange = 0;
  for (const label of grid.querySelectorAll('label.day')) {
    const d = Number(label.dataset.day);
    const within = range.ok && d >= range.startDay && d <= range.endDay;
    label.classList.toggle('in-range', within);
    if (within && label.querySelector('input').checked) inRange += 1;
  }
  let text = `월 전체 선택 근로일 ${workdays.length}일`;
  if (range.ok) text += ` · 재직 구간(${month}월 ${range.startDay}일~${range.endDay}일) 안 ${inRange}일`;
  scheduleSummary.textContent = text;
}

/* ---------- 오류 표시 ---------- */

function clearError(field) {
  const target = FIELD_ERROR_TARGETS[field];
  if (!target) return;
  target.error.hidden = true;
  target.error.textContent = '';
  if (target.input) target.input.removeAttribute('aria-invalid');
}

function clearAllErrors() {
  Object.keys(FIELD_ERROR_TARGETS).forEach(clearError);
}

function showErrors(errors) {
  let firstFocus = null;
  for (const [field, message] of Object.entries(errors)) {
    const target = FIELD_ERROR_TARGETS[field];
    if (!target) continue;
    target.error.textContent = message;
    target.error.hidden = false;
    if (target.input) {
      target.input.setAttribute('aria-invalid', 'true');
      if (!firstFocus) firstFocus = target.input;
    } else if (!firstFocus) {
      firstFocus = grid.querySelector('input');
    }
  }
  firstFocus?.focus();
}

/* ---------- 결과 ---------- */

let announceTimer = 0;

function hideResult() {
  // 결과 알림이 예약된 직후 입력이 바뀌면, 숨긴 결과를 뒤늦게 읽지 않도록 예약을 취소한다.
  window.clearTimeout(announceTimer);
  if (!resultSection.hidden) {
    resultSection.hidden = true;
    resultStatus.textContent = '';
  }
}

function fillRow(row, values) {
  for (const [col, value] of Object.entries(values)) {
    row.querySelector(`[data-col="${col}"]`).textContent = value;
  }
}

function describePeriod(r) {
  const parts = [`${r.year}년 ${r.month}월`, SETTLEMENT_TYPE_LABELS[r.type], (r.startDay === r.endDay ? `재직 ${r.month}월 ${r.startDay}일` : `재직 ${r.month}월 ${r.startDay}일~${r.endDay}일`), `세전 월급 ${formatWon(r.salary)}`];
  return parts.join(' · ');
}

function renderResult(r) {
  $('result-meta').textContent = describePeriod(r);

  fillRow($('row-calendar'), {
    applied: `${r.calendar.applied}일`,
    total: `${r.calendar.total}일`,
    formula: describeFormula(r.salary, r.calendar.applied, r.calendar.total),
    amount: formatWon(r.calendar.amount),
  });

  const workdayRow = $('row-workday');
  workdayRow.classList.toggle('unavailable', !r.workday.available);
  fillRow(workdayRow, {
    applied: `${r.workday.applied}일`,
    total: `${r.workday.total}일`,
    formula: r.workday.available ? describeFormula(r.salary, r.workday.applied, r.workday.total) : '—',
    amount: r.workday.available ? formatWon(r.workday.amount) : MESSAGES.noWorkdays,
  });

  $('hl-calendar').textContent = formatWon(r.calendar.amount);
  const hlWork = $('hl-workday');
  hlWork.textContent = r.workday.available ? formatWon(r.workday.amount) : MESSAGES.noWorkdays;
  hlWork.classList.toggle('stat-note', !r.workday.available);

  const diffText = describeDiff(r.diff);
  $('diff-value').textContent = diffText;

  resultSection.hidden = false;
  // 결과로 이동 (모바일에서 결과가 화면 밖에 있지 않도록)
  const title = $('result-title');
  title.focus({ preventScroll: true });
  title.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });

  const workdayText = r.workday.available ? formatWon(r.workday.amount) : MESSAGES.noWorkdays;
  const announcement = `계산 결과: 달력일 기준 ${formatWon(r.calendar.amount)}, 소정근로일 기준 ${workdayText}. 차액 ${diffText}.`;
  // 같은 결과를 다시 계산해도 읽어 주도록 비운 뒤 다음 프레임에 갱신한다.
  resultStatus.textContent = '';
  window.clearTimeout(announceTimer);
  announceTimer = window.setTimeout(() => {
    resultStatus.textContent = announcement;
  }, 50);
}

/* ---------- 이벤트 ---------- */

function onInputChanged(event) {
  hideResult();
  const id = event.target.id;
  if (id === 'salary') {
    clearError('salary');
    updateSalaryPreview();
  } else if (id === 'start-date') {
    clearError('startDate');
    clearError('endDate');
  } else if (id === 'end-date') {
    clearError('endDate');
  } else if (event.target.name === 'workday') {
    clearError('workdays');
  } else if (event.target.name === 'type') {
    clearError('startDate');
    clearError('endDate');
    applyTypeVisibility();
  }
  updateScheduleState();
}

function onPeriodChanged() {
  hideResult();
  startInput.value = '';
  endInput.value = '';
  clearError('startDate');
  clearError('endDate');
  clearError('workdays');
  applyDateBounds();
  renderCalendar();
  updateScheduleState();
}

function setAllWorkdays(predicate) {
  for (const box of grid.querySelectorAll('input[type="checkbox"]')) {
    box.checked = predicate(Number(box.value));
  }
  hideResult();
  clearError('workdays');
  updateScheduleState();
}

function onSubmit(event) {
  event.preventDefault();
  clearAllErrors();
  const { year, month } = selectedPeriod();
  const outcome = calculateProration({
    salary: salaryInput.value,
    year,
    month,
    type: selectedType(),
    startDate: dateValue(startInput),
    endDate: dateValue(endInput),
    workdays: selectedWorkdays(),
  });
  if (!outcome.ok) {
    window.clearTimeout(announceTimer);
    resultSection.hidden = true;
    resultStatus.textContent = '';
    showErrors(outcome.errors);
    return;
  }
  renderResult(outcome.result);
}

/**
 * 뒤로가기 등으로 페이지가 다시 표시될 때, 브라우저가 되살린 정산월과
 * 스크립트가 그린 달력이 어긋나 있으면 선택된 정산월 기준으로 다시 맞춘다.
 */
function resyncAfterRestore() {
  const { year, month } = selectedPeriod();
  if (grid.dataset.period !== `${year}-${month}`) {
    onPeriodChanged();
  }
  applyTypeVisibility();
  updateSalaryPreview();
  updateScheduleState();
}

function init() {
  populatePeriodSelects();
  applyDateBounds();
  renderCalendar();
  applyTypeVisibility();
  updateScheduleState();

  yearSelect.addEventListener('change', onPeriodChanged);
  monthSelect.addEventListener('change', onPeriodChanged);
  form.addEventListener('input', (e) => {
    if (e.target === yearSelect || e.target === monthSelect) return;
    onInputChanged(e);
  });
  form.addEventListener('change', (e) => {
    if (e.target === yearSelect || e.target === monthSelect) return;
    onInputChanged(e);
  });
  $('reset-weekdays').addEventListener('click', () => {
    const { year, month } = selectedPeriod();
    const defaults = new Set(defaultWorkdays(year, month));
    setAllWorkdays((d) => defaults.has(d));
  });
  $('clear-workdays').addEventListener('click', () => setAllWorkdays(() => false));
  form.addEventListener('submit', onSubmit);
  window.addEventListener('pageshow', resyncAfterRestore);
}

init();
