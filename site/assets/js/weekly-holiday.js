/**
 * 정산노트 — 주휴수당 판정 로직 (화면 코드와 분리된 순수 함수)
 *
 * 명세: docs/weekly-holiday-pay-spec.md (3장 판정 규칙, 8장 쟁점)
 * - 모든 시간은 정수 분, 날짜는 연·월·일(UTC 일 번호)로만 다룬다.
 * - 각 판정 단계(S1~S9)는 RULES 에, 공식 근거(L·M)는 SOURCES 에 있으며
 *   주차별 결과에 rule 과 sources 를 실어 화면과 테스트에서 추적한다.
 * - 확정되지 않은 쟁점은 두 후보 기준으로 모두 계산해, 결과가 갈리면 판정을 보류한다.
 */
import { parseIsoDate, toIsoDate, formatNumber } from './proration.js';

export const CHECKED_DATE = '2026-11-21';

/** 공식 근거 (확인일 CHECKED_DATE) */
export const SOURCES = Object.freeze({
  L1: { label: '근로기준법 제2조제1항 제7·8호', note: '1주는 휴일을 포함한 7일, 소정근로시간은 법정근로시간 범위에서 정한 근로시간', version: '시행 2026.10.8. 법률 제21533호', url: 'https://www.law.go.kr/법령/근로기준법/제2조' },
  L2: { label: '근로기준법 제18조제3항', note: '4주(4주 미만 근로 시 그 기간) 평균 1주 소정근로시간 15시간 미만이면 제55조 미적용', version: '시행 2026.10.8. 법률 제21533호 (해당 항 개정 2008.3.21.)', url: 'https://www.law.go.kr/법령/근로기준법/제18조' },
  L3: { label: '근로기준법 제55조제1항', note: '1주 평균 1회 이상 유급휴일 보장', version: '시행 2026.10.8. 법률 제21533호 (해당 항 개정 2018.3.20.)', url: 'https://www.law.go.kr/법령/근로기준법/제55조' },
  L5: { label: '근로기준법 시행령 제30조제1항', note: '유급휴일은 1주 소정근로일을 개근한 자에게 부여', version: '시행 2025.10.23. 대통령령 제35436호 (해당 항 개정 2018.6.29.)', url: 'https://www.law.go.kr/법령/근로기준법시행령/제30조' },
  L6: { label: '근로기준법 시행령 별표 1', note: '상시 4명 이하 사업장에도 법 제18조·제55조제1항 적용', version: '별표 1 개정 2018.6.29.', url: 'https://www.law.go.kr/법령/근로기준법시행령' },
  L7: { label: '근로기준법 시행령 별표 2', note: '1일 소정근로시간 = 4주 소정근로시간 ÷ 그 기간 통상근로자 총 소정근로일수, 유급휴일 임금은 일급 통상임금 기준', version: '별표 2 개정 2021.10.14.', url: 'https://www.law.go.kr/법령/근로기준법시행령' },
  M1: { label: '고용노동부 빠른인터넷상담 (2024.1.8.)', note: '주휴 3요건, 약정한 소정근로시간 기준, 별표 2 계산 예시', url: 'https://www.moel.go.kr/minwon/fastcounsel/fastcounselView.do?inetDcssMngId=202401081620124231000' },
  M2: { label: '고용노동부 빠른인터넷상담 (2023.2.1.)', note: '주중 입사 시 입사일부터 7일이 1주 단위 (임금근로시간과-234, 2022.1.26.)', url: 'https://www.moel.go.kr/minwon/fastcounsel/fastcounselView.do?inetDcssMngId=202302011542216101000' },
  M3: { label: '고용노동부 빠른인터넷상담 (2024.5.9.)', note: '1주간 근로관계 존속·개근 시 8일째 근로 예정이 없어도 발생 (임금근로시간과-1736, 2021.8.4.)', url: 'https://www.moel.go.kr/minwon/fastcounsel/fastcounselView.do?inetDcssMngId=202405091127105300604' },
  M5: { label: '고용노동부 빠른인터넷상담 (2022.7.22.)', note: '실제 근로시간이 아닌 약정한 소정근로시간으로 판단', url: 'https://www.moel.go.kr/minwon/fastcounsel/fastcounselView.do?inetDcssMngId=202207221016589061000' },
  M6: { label: '고용노동부 빠른인터넷상담 (2022.2.21.)', note: '소정근로일 전부를 휴일·휴가로 출근하지 않은 주는 미지급해도 위반으로 보기 어려움 (근로조건지도과-3102, 2008.8.8.)', url: 'https://www.moel.go.kr/minwon/fastcounsel/fastcounselView.do?inetDcssMngId=202202211046386891000' },
  M7: { label: '고용노동부 1350 상담 사례', note: '지각·조퇴·휴일·휴가·휴업은 결근 아님 (근로기준과-5560, 2009.12.23.), 7일째 날 소속이면 1주 근로관계 유지', url: 'https://1350.moel.go.kr/rtmview.do?id=1000059852' },
  M8: { label: '고용노동부 빠른인터넷상담 (2024.1.30.)', note: '1일 8시간·주 40시간 초과 약정 시 주휴수당은 8시간분', url: 'https://www.moel.go.kr/minwon/fastcounsel/fastcounselView.do?inetDcssMngId=202401300917305551000' },
});

/** 판정 단계 (명세 3.3절) */
export const RULES = Object.freeze({
  S1: { title: '1주(7일) 근로관계 유지', sources: ['L1', 'M3', 'M7'] },
  S2: { title: '소정근로일 결근', sources: ['L5', 'M7'] },
  S3: { title: '평균 기간 근무표 입력', sources: ['L2'] },
  S4: { title: '평균 기간 기준 미확정', sources: ['L2'] },
  S5: { title: '4주 평균 1주 소정근로시간 15시간', sources: ['L2', 'L1', 'M1', 'M5'] },
  S6: { title: '출근 여부 입력', sources: ['L5'] },
  S7: { title: '소정근로일 없음', sources: ['L5'] },
  S8: { title: '실제 출근일 없음', sources: ['M6'] },
  S9: { title: '지급 요건 충족', sources: ['L2', 'L3', 'L5', 'L6'] },
  AMOUNT: { title: '예상액 = 1일 소정근로시간 × 시급', sources: ['L7', 'M1', 'M8'] },
});

export const STATUS_LABELS = Object.freeze({
  eligible: '지급 대상',
  ineligible: '지급 대상 아님',
  insufficient: '정보 부족',
});

export const EMPLOYMENT_TYPES = Object.freeze({
  hourly: '시급제',
  monthly: '월급제',
  daily: '일 단위 계약(일용직)',
  surveillance: '감시·단속적 근로(고용노동부 승인)',
});

export const MAX_WEEKS = 12;
export const DAY_CAP = 480; // 하루 8시간 (L1 제8호, M8)
export const WEEK_CAP = 2400; // 1주 40시간
export const THRESHOLD = 900; // 15시간
export const CONFIRM = '별도 확인 필요';

const MS_DAY = 86400000;
const WD = ['일', '월', '화', '수', '목', '금', '토'];

/* ---------------- 날짜 ---------------- */

export function dayIndex(iso) {
  const p = parseIsoDate(iso);
  return p.ok ? Date.UTC(p.year, p.month - 1, p.day) / MS_DAY : null;
}
export function isoOf(index) {
  const d = new Date(index * MS_DAY);
  return toIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
export function weekdayOf(index) {
  return new Date(index * MS_DAY).getUTCDay();
}
/** "7월 15일(수)" */
export function longDate(index) {
  const d = new Date(index * MS_DAY);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${WD[d.getUTCDay()]})`;
}
/** "7/15(수)" */
export function shortDate(index) {
  const d = new Date(index * MS_DAY);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`;
}
export function weekdayName(index) {
  return WD[weekdayOf(index)];
}

/** 분 → "14시간 59분" (분수는 소수 첫째 자리까지) */
export function formatMinutes(num, den = 1) {
  const total = num / den;
  const h = Math.floor(total / 60);
  let m = total - h * 60;
  m = Math.round(m * 10) / 10;
  return `${h}시간 ${Number.isInteger(m) ? m : m.toFixed(1)}분`;
}

/** 평균 분을 내림해 표시 (15시간 미만을 15시간으로 보이지 않게) */
export function formatAverage(num, den) {
  const floor = Math.floor(num / den);
  return `${Math.floor(floor / 60)}시간 ${floor % 60}분`;
}

/* ---------------- 입력 검증 ---------------- */

/** 시간·분 문자열 → 분 | null(빈 값) | {error} */
export function parseTime(hRaw, mRaw) {
  const h = String(hRaw ?? '').trim();
  const m = String(mRaw ?? '').trim();
  if (h === '' && m === '') return { ok: true, minutes: null };
  const isInt = (s) => s === '' || /^\d{1,2}$/.test(s);
  if (!isInt(h) || !isInt(m)) return { ok: false, error: '시간과 분은 0 이상의 정수로 입력하세요.' };
  const hv = h === '' ? 0 : Number(h);
  const mv = m === '' ? 0 : Number(m);
  if (hv > 24) return { ok: false, error: '시간은 0~24 사이로 입력하세요.' };
  if (mv > 59) return { ok: false, error: '분은 0~59 사이로 입력하세요.' };
  if (hv * 60 + mv > 1440) return { ok: false, error: '하루 24시간을 넘을 수 없습니다.' };
  return { ok: true, minutes: hv * 60 + mv };
}

export function parseWage(raw) {
  const t = String(raw ?? '').trim().replace(/,/g, '');
  if (t === '') return { ok: true, value: null };
  if (/^\d*\.\d+$/.test(t)) return { ok: false, error: '시급은 원 단위 정수로 입력하세요.' };
  if (!/^\d+$/.test(t)) return { ok: false, error: '시급은 숫자만 입력하세요. (예: 10320)' };
  const v = Number(t);
  if (v <= 0) return { ok: false, error: '0보다 큰 시급을 입력하세요.' };
  if (v > 10_000_000) return { ok: false, error: '시급이 너무 큽니다.' };
  return { ok: true, value: v };
}

/** 재직 기간·확인 범위 계산 (화면에서 주 카드를 그릴 때도 사용) */
export function resolvePeriod({ hireDate, status, endDate, checkStart, weekCount }) {
  const errors = {};
  const hire = dayIndex(hireDate);
  if (String(hireDate ?? '').trim() === '') errors.hireDate = '재직 시작일을 입력하세요.';
  else if (hire === null) errors.hireDate = '존재하지 않는 날짜입니다.';

  let end = null;
  if (status !== 'employed' && status !== 'left') errors.status = '재직 상태를 선택하세요.';
  if (status === 'left') {
    if (String(endDate ?? '').trim() === '') errors.endDate = '마지막 재직일을 입력하세요.';
    else if ((end = dayIndex(endDate)) === null) errors.endDate = '존재하지 않는 날짜입니다.';
    else if (hire !== null && end < hire) errors.endDate = '마지막 재직일은 재직 시작일과 같거나 그 이후여야 합니다.';
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  let firstWeek = 1;
  if (String(checkStart ?? '').trim() !== '') {
    const cs = dayIndex(checkStart);
    if (cs === null) return { ok: false, errors: { checkStart: '존재하지 않는 날짜입니다.' } };
    if (cs < hire) return { ok: false, errors: { checkStart: '확인 시작일은 재직 시작일 이후여야 합니다.' } };
    if (end !== null && cs > end) return { ok: false, errors: { checkStart: '확인 시작일은 마지막 재직일 이전이어야 합니다.' } };
    firstWeek = Math.floor((cs - hire) / 7) + 1;
  }
  let count = Number(weekCount) || 4;
  count = Math.min(Math.max(count, 1), MAX_WEEKS);
  if (end !== null) {
    const lastWeek = Math.floor((end - hire) / 7) + 1;
    count = Math.min(count, lastWeek - firstWeek + 1);
  }
  const weeks = [];
  for (let n = firstWeek; n < firstWeek + count; n += 1) {
    const start = hire + 7 * (n - 1);
    weeks.push({ week: n, start, end: start + 6 });
  }
  return { ok: true, hire, end, firstWeek, weeks };
}

/**
 * 화면 입력(문자열)을 검증해 판정 입력으로 바꾼다.
 * raw.days: { ISO날짜: { h, m, attendance } }, raw.noWorkWeeks: [주차]
 */
export function parseInputs(raw) {
  const errors = {};
  const period = resolvePeriod(raw);
  if (!period.ok) Object.assign(errors, period.errors);

  const wage = parseWage(raw.wage);
  if (!wage.ok) errors.wage = wage.error;
  if (!Object.keys(EMPLOYMENT_TYPES).includes(raw.employmentType)) errors.employmentType = '근무 형태를 선택하세요.';
  const normalWeekdays = (raw.normalWeekdays ?? []).map(Number).filter((d) => d >= 0 && d <= 6);
  if (normalWeekdays.length === 0) errors.normalWeekdays = '정규 근무자의 근무요일을 하루 이상 선택하세요.';

  const days = {};
  for (const [iso, v] of Object.entries(raw.days ?? {})) {
    const t = parseTime(v.h, v.m);
    if (!t.ok) {
      errors[`day:${iso}`] = t.error;
      continue;
    }
    days[iso] = { minutes: t.minutes, attendance: v.attendance ?? null };
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      hire: period.hire,
      end: period.end,
      weeks: period.weeks,
      employmentType: raw.employmentType,
      wage: wage.value,
      normalWeekdays,
      days,
      noWorkWeeks: new Set((raw.noWorkWeeks ?? []).map(Number)),
    },
  };
}

/* ---------------- 판정 ---------------- */

function roundHalfUp(num, den) {
  return Number((2n * BigInt(num) + BigInt(den)) / (2n * BigInt(den)));
}

/**
 * 주휴수당 주차별 판정.
 * @param {ReturnType<typeof parseInputs>['value']} input
 */
export function judgeWeeklyHoliday(input) {
  const { hire, end, weeks, employmentType, wage, normalWeekdays, days, noWorkWeeks } = input;

  if (employmentType === 'daily' || employmentType === 'surveillance') {
    return {
      blocked: true,
      note: `${EMPLOYMENT_TYPES[employmentType]}은(는) 주휴수당 판정 기준이 달라 이 계산기의 출시 범위에 포함되지 않습니다. ${CONFIRM}: 근로계약서와 관할 고용노동관서(1350)에서 확인하세요.`,
      weeks: [],
    };
  }

  const enteredRange = new Set(weeks.map((w) => w.week));
  const employed = (i) => i >= hire && (end === null || i <= end);
  const totalDays = end === null ? null : end - hire + 1;
  const isShort = totalDays !== null && totalDays < 28;
  const lastEmployedWeek = end === null ? Infinity : Math.floor((end - hire) / 7) + 1;
  const weekStart = (n) => hire + 7 * (n - 1);

  const dayInfo = (i) => days[isoOf(i)] ?? { minutes: null, attendance: null };
  const employedDays = (n) => {
    const out = [];
    for (let i = weekStart(n); i <= weekStart(n) + 6; i += 1) if (employed(i)) out.push(i);
    return out;
  };
  const isEntered = (n) =>
    enteredRange.has(n) && (noWorkWeeks.has(n) || employedDays(n).some((i) => dayInfo(i).minutes !== null));
  const dayMinutes = (i) => (noWorkWeeks.has(Math.floor((i - hire) / 7) + 1) ? 0 : dayInfo(i).minutes ?? 0);
  const weekStats = (n) => {
    let raw = 0;
    let capped = 0;
    let dayCapped = false;
    const workdays = [];
    for (const i of employedDays(n)) {
      const m = dayMinutes(i);
      raw += m;
      if (m > DAY_CAP) dayCapped = true;
      capped += Math.min(m, DAY_CAP);
      if (m > 0) workdays.push(i);
    }
    const weekCapped = capped > WEEK_CAP;
    return { raw, minutes: Math.min(capped, WEEK_CAP), capped: dayCapped || weekCapped, workdays };
  };

  /** 후보 평균 기간(주 번호 배열)을 집계 */
  const windowOf = (weekNums, label) => {
    const ws = weekNums.filter((n) => n >= 1 && n <= lastEmployedWeek);
    let sum = 0;
    let dayCount = 0;
    let normalDays = 0;
    const missing = [];
    for (const n of ws) {
      if (!isEntered(n)) missing.push(n);
      sum += weekStats(n).minutes;
      for (const i of employedDays(n)) {
        dayCount += 1;
        if (normalWeekdays.includes(weekdayOf(i))) normalDays += 1;
      }
    }
    const first = weekStart(ws[0]);
    let last = weekStart(ws[ws.length - 1]) + 6;
    if (end !== null && last > end) last = end;
    return { label, weeks: ws, start: first, end: last, sum, days: dayCount, normalDays, missing, meets: sum * 7 >= THRESHOLD * dayCount };
  };

  const results = [];
  for (const { week: n, start, end: wEnd } of weeks) {
    const stats = weekStats(n);
    const row = {
      week: n,
      start,
      end: wEnd,
      entered: isEntered(n),
      weekMinutes: stats.minutes,
      capped: stats.capped,
      status: null,
      rule: null,
      reason: '',
      needs: [],
      confirm: null,
      window: null,
      amount: null,
      amountNote: '',
      formula: '',
    };
    const finish = (status, rule, reason, extra = {}) => Object.assign(row, { status, rule, reason, sources: RULES[rule].sources }, extra);

    // S1 1주 근로관계 유지 (7일째 날 소속)
    if (end !== null && wEnd > end) {
      finish('ineligible', 'S1', `${longDate(end)}까지 재직해 이 주의 7일째(${longDate(wEnd)})까지 근로관계가 이어지지 않았습니다.`);
      results.push(row);
      continue;
    }
    // 평균 기간 후보
    let candidates;
    if (isShort) {
      const all = [];
      for (let k = 1; k <= lastEmployedWeek; k += 1) all.push(k);
      candidates = [windowOf(all, 'short')];
    } else {
      const b1 = n <= 3 ? [1, 2, 3, 4] : [n - 3, n - 2, n - 1, n];
      const s = 4 * Math.floor((n - 1) / 4) + 1;
      const b2 = [s, s + 1, s + 2, s + 3];
      candidates = [windowOf(b1, 'B1')];
      if (b1.join() !== b2.join()) candidates.push(windowOf(b2, 'B2'));
    }
    const missing = [...new Set(candidates.flatMap((c) => c.missing))].sort((a, b) => a - b);

    // 평균 기간 표시용 정보 (자료가 모두 있을 때)
    if (!missing.length) {
      const c0 = candidates[0];
      row.window = isShort
        ? { ...c0, avgNum: c0.sum * 7, avgDen: c0.days, text: `${shortDate(c0.start)}~${shortDate(c0.end)} · 재직 ${c0.days}일 전체` }
        : { ...c0, avgNum: c0.sum, avgDen: c0.weeks.length, text: `${shortDate(c0.start)}~${shortDate(c0.end)} · ${c0.weeks[0]}~${c0.weeks[c0.weeks.length - 1]}주차` };
      if (candidates.length > 1) row.altWindow = { ...candidates[1], avgNum: candidates[1].sum, avgDen: candidates[1].weeks.length };
    }
    // S2 결근 (평균 기간 자료와 관계없이 확정, 명세 S2)
    const absent = stats.workdays.filter((i) => dayInfo(i).attendance === 'absent');
    if (row.entered && absent.length) {
      finish('ineligible', 'S2', `소정근로일인 ${absent.map(longDate).join(', ')}에 결근해 개근 요건을 충족하지 않습니다.`);
      results.push(row);
      continue;
    }

    // S3 평균 기간 근무표
    if (missing.length) {
      const list = missing.map((k) => `${k}주차 ${shortDate(weekStart(k))}~${shortDate(weekStart(k) + 6)}`);
      const outside = missing.filter((k) => !enteredRange.has(k));
      finish('insufficient', 'S3',
        `평균 기간에 필요한 ${list.join(', ')} 근무표가 비어 있습니다. 근무가 없었다면 '이 주는 근무 없음'을 선택하세요.` +
        (outside.length ? ` (${outside.join(', ')}주차는 확인할 주 범위를 넓혀야 입력할 수 있습니다.)` : ''),
        { needs: [{ type: 'schedule', weeks: missing }] });
      if (candidates.length > 1) row.confirm = '평균 기간 기준(쟁점 B)이 확정되지 않아, 두 후보 기간의 근무표가 모두 필요합니다.';
      results.push(row);
      continue;
    }

    // 4주 미만 재직: 일수 평균과 주 수 평균이 모두 같은 결론이어야 확정
    if (isShort) {
      const c = candidates[0];
      const byWeeks = c.sum >= THRESHOLD * c.weeks.length;
      if (byWeeks !== c.meets) {
        finish('insufficient', 'S4', `재직 기간이 4주보다 짧고, 평균 방식(일수 기준 ${formatAverage(c.sum * 7, c.days)} / 주 수 기준 ${formatAverage(c.sum, c.weeks.length)})에 따라 15시간 기준 충족 여부가 달라집니다.`,
          { confirm: `4주 미만 재직 시 평균 방식이 확정되지 않았습니다. ${CONFIRM}.` });
        results.push(row);
        continue;
      }
    } else {
      const verdicts = new Set(candidates.map((c) => c.meets));
      const c = candidates[0];
      if (verdicts.size > 1) {
        const [a, b] = candidates;
        finish('insufficient', 'S4',
          `평균 기간을 ${a.weeks[0]}~${a.weeks[3]}주차로 보면 평균 ${formatAverage(a.sum, 4)}, ${b.weeks[0]}~${b.weeks[3]}주차로 보면 평균 ${formatAverage(b.sum, 4)}이라 15시간 기준 충족 여부가 달라집니다.`,
          { confirm: `어느 4주를 평균할지(쟁점 B) 공식 기준이 확인되지 않았습니다. ${CONFIRM}.` });
        results.push(row);
        continue;
      }
    }

    // S5 15시간
    const w = row.window;
    if (!candidates[0].meets) {
      finish('ineligible', 'S5', `평균 기간(${shortDate(w.start)}~${shortDate(w.end)})의 1주 평균 소정근로시간이 ${formatAverage(w.avgNum, w.avgDen)}으로 15시간 미만입니다.` +
        (stats.minutes >= THRESHOLD ? ` 이 주만 보면 ${formatMinutes(stats.minutes)}이지만, 주 15시간 기준은 평균으로 판단합니다.` : ''));
      results.push(row);
      continue;
    }
    // S6 출근 여부 입력
    const unknown = stats.workdays.filter((i) => !['present', 'absent', 'excused'].includes(dayInfo(i).attendance));
    if (unknown.length) {
      finish('insufficient', 'S6', `${unknown.map(longDate).join(', ')}의 출근 여부를 선택하세요.`, { needs: [{ type: 'attendance', dates: unknown.map(isoOf) }] });
      results.push(row);
      continue;
    }
    // S7 소정근로일 없음
    if (stats.workdays.length === 0) {
      finish('ineligible', 'S7', '이 주에는 미리 정한 근무일이 없습니다.');
      results.push(row);
      continue;
    }
    // S8 실제 출근일 없음
    const present = stats.workdays.filter((i) => dayInfo(i).attendance === 'present');
    if (present.length === 0) {
      finish('ineligible', 'S8', '근무일 전부를 휴가·휴업으로 쉬어 이 주에 실제로 일한 날이 없습니다.',
        { confirm: `취업규칙에서 휴가일을 출근으로 본다고 정했다면 지급 대상일 수 있습니다. ${CONFIRM}.` });
      results.push(row);
      continue;
    }
    // S9 지급 대상
    const excused = stats.workdays.length - present.length;
    finish('eligible', 'S9',
      `평균 ${formatAverage(w.avgNum, w.avgDen)}(15시간 이상)이고 소정근로일 ${stats.workdays.length}일을 모두 출근했습니다.` +
      (excused ? ` 휴가·휴업 ${excused}일은 결근으로 보지 않습니다.` : ''));

    // 예상액
    if (employmentType === 'monthly') {
      row.amountNote = `월급제는 월급에 주휴수당이 포함되는지 계약을 확인해야 해 예상액을 표시하지 않습니다. ${CONFIRM}.`;
    } else if (wage === null) {
      row.amountNote = '시급을 입력하면 예상액을 볼 수 있습니다.';
    } else if (isShort) {
      row.amountNote = `재직 기간이 4주 미만일 때 1일 소정근로시간 산정 기준(쟁점 D)이 확정되지 않아 예상액을 표시하지 않습니다. ${CONFIRM}.`;
    } else {
      const amounts = candidates.map((c) => {
        if (c.normalDays === 0) return null;
        const overCap = c.sum > DAY_CAP * c.normalDays;
        return {
          amount: overCap ? wage * 8 : roundHalfUp(wage * c.sum, c.normalDays * 60),
          dailyNum: overCap ? DAY_CAP : c.sum,
          dailyDen: overCap ? 1 : c.normalDays,
        };
      });
      if (amounts.some((a) => a === null)) {
        row.amountNote = '평균 기간에 정규 근무자의 근무일이 없어 1일 소정근로시간을 계산할 수 없습니다.';
      } else if (new Set(amounts.map((a) => a.amount)).size > 1) {
        row.amountNote = `평균 기간 기준(쟁점 B)에 따라 예상액이 ${amounts.map((a) => `${formatNumber(a.amount)}원`).join(' 또는 ')}으로 달라져 표시하지 않습니다. ${CONFIRM}.`;
      } else {
        const a = amounts[0];
        row.amount = a.amount;
        row.formula = `1일 소정근로시간 ${formatMinutes(a.dailyNum, a.dailyDen)} × 시급 ${formatNumber(wage)}원`;
        row.amountSources = RULES.AMOUNT.sources;
      }
    }
    results.push(row);
  }

  const count = (s) => results.filter((r) => r.status === s).length;
  const eligibleAmounts = results.filter((r) => r.amount !== null);
  return {
    blocked: false,
    isShort,
    weeks: results,
    summary: {
      eligible: count('eligible'),
      ineligible: count('ineligible'),
      insufficient: count('insufficient'),
      total: eligibleAmounts.length && eligibleAmounts.length === count('eligible') ? eligibleAmounts.reduce((s, r) => s + r.amount, 0) : null,
    },
  };
}

/** 문자열 입력 → 검증 → 판정 */
export function evaluate(raw) {
  const parsed = parseInputs(raw);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  return { ok: true, result: judgeWeeklyHoliday(parsed.value) };
}
