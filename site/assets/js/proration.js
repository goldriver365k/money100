/**
 * 정산노트 — 월급 일할계산 로직 (화면 코드와 분리된 순수 함수 모음)
 *
 * - 날짜는 연·월·일 정수로만 다룬다. Date 객체의 시간대 변환을 쓰지 않는다.
 *   (요일 계산만 Date.UTC 를 쓰며, UTC 로 생성하고 UTC 로 읽으므로 시간대 영향이 없다.)
 * - 금액 계산은 BigInt 정수 연산으로 하고, 마지막 단계에서 원 단위 사사오입한다.
 */

export const SETTLEMENT_TYPES = Object.freeze({
  JOIN: 'join', // 중도 입사: 입사일 ~ 월말
  LEAVE: 'leave', // 중도 퇴사: 월초 ~ 마지막 재직일
  BOTH: 'both', // 같은 달 입·퇴사: 입사일 ~ 마지막 재직일
});

export const SETTLEMENT_TYPE_LABELS = Object.freeze({
  join: '중도 입사',
  leave: '중도 퇴사',
  both: '같은 달 입·퇴사',
});

/** 입력 가능한 세전 월급 상한 (1조 원 미만). 표시·입력 안전을 위한 제한이다. */
export const MAX_SALARY = 999_999_999_999;

export const WEEKDAY_NAMES = Object.freeze(['일', '월', '화', '수', '목', '금', '토']);

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** 0=일요일 … 6=토요일 */
export function dayOfWeek(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** 정산월의 월~금 날짜(일) 목록 */
export function defaultWorkdays(year, month) {
  const days = [];
  const last = daysInMonth(year, month);
  for (let d = 1; d <= last; d += 1) {
    const w = dayOfWeek(year, month, d);
    if (w >= 1 && w <= 5) days.push(d);
  }
  return days;
}

/** 금액 표시: 1600000 → "1,600,000원" */
export function formatWon(value) {
  return `${formatNumber(value)}원`;
}

export function formatNumber(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 세전 월급 문자열 검증. 천 단위 쉼표와 앞뒤 공백은 허용한다.
 * @returns {{ok:true, value:number} | {ok:false, error:string}}
 */
export function parseSalary(raw) {
  const text = String(raw ?? '').trim().replace(/,/g, '');
  if (text === '') return { ok: false, error: '세전 월급을 입력해 주세요.' };
  if (/^[+-]?\d*\.\d*$/.test(text) && /\d/.test(text)) {
    return { ok: false, error: '소수 금액은 입력할 수 없습니다. 원 단위 정수로 입력해 주세요.' };
  }
  if (/^-\d+$/.test(text)) return { ok: false, error: '0보다 큰 금액을 입력해 주세요.' };
  if (!/^\+?\d+$/.test(text)) return { ok: false, error: '숫자만 입력해 주세요. (예: 3100000)' };
  const digits = text.replace(/^\+/, '').replace(/^0+(?=\d)/, '');
  if (/^0+$/.test(digits)) return { ok: false, error: '0보다 큰 금액을 입력해 주세요.' };
  if (digits.length > String(MAX_SALARY).length || Number(digits) > MAX_SALARY) {
    return { ok: false, error: '1조 원 미만의 금액을 입력해 주세요.' };
  }
  return { ok: true, value: Number(digits) };
}

/**
 * "YYYY-MM-DD" 문자열을 연·월·일 정수로 분해하고 실제 존재하는 날짜인지 확인한다.
 * @returns {{ok:true, year:number, month:number, day:number} | {ok:false, reason:'empty'|'invalid'}}
 */
export function parseIsoDate(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return { ok: false, reason: 'empty' };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return { ok: false, reason: 'invalid' };
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, year, month, day };
}

export function toIsoDate(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * salary × numerator ÷ denominator 를 원 단위 사사오입한다 (양수 전용, 정수 연산).
 */
export function prorate(salary, numerator, denominator) {
  if (!Number.isInteger(denominator) || denominator <= 0) {
    throw new RangeError('denominator must be a positive integer');
  }
  const s = BigInt(salary);
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  // floor((2·s·n + d) / (2·d)) = round-half-up(s·n/d)
  return Number((2n * s * n + d) / (2n * d));
}

const DATE_LABELS = { startDate: '입사일', endDate: '마지막 재직일' };

function checkDateInMonth(field, raw, year, month, errors) {
  const parsed = parseIsoDate(raw);
  if (!parsed.ok) {
    errors[field] =
      parsed.reason === 'empty'
        ? `${DATE_LABELS[field]}을 입력해 주세요.`
        : '존재하지 않는 날짜입니다. 날짜를 다시 확인해 주세요.';
    return null;
  }
  if (parsed.year !== year || parsed.month !== month) {
    errors[field] = `정산 대상 월(${year}년 ${month}월) 안의 날짜를 입력해 주세요.`;
    return null;
  }
  return parsed.day;
}

/**
 * 정산 유형과 날짜로 재직 구간(일)을 구한다.
 * @returns {{ok:true, startDay:number, endDay:number} | {ok:false, errors:Object}}
 */
export function resolveEmploymentRange({ year, month, type, startDate, endDate }) {
  const errors = {};
  const last = daysInMonth(year, month);
  let startDay = 1;
  let endDay = last;

  if (type === SETTLEMENT_TYPES.JOIN || type === SETTLEMENT_TYPES.BOTH) {
    startDay = checkDateInMonth('startDate', startDate, year, month, errors);
  }
  if (type === SETTLEMENT_TYPES.LEAVE || type === SETTLEMENT_TYPES.BOTH) {
    endDay = checkDateInMonth('endDate', endDate, year, month, errors);
  }
  if (!Object.values(SETTLEMENT_TYPES).includes(type)) {
    errors.type = '정산 유형을 선택해 주세요.';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (endDay < startDay) {
    return { ok: false, errors: { endDate: '마지막 재직일은 입사일과 같거나 그 이후여야 합니다.' } };
  }
  return { ok: true, startDay, endDay };
}

/**
 * 월급 일할계산 (두 방식 비교).
 *
 * @param {object} input
 * @param {string|number} input.salary   세전 월급 (원 단위 양의 정수)
 * @param {number} input.year            정산 연도
 * @param {number} input.month           정산 월 (1~12)
 * @param {'join'|'leave'|'both'} input.type
 * @param {string} [input.startDate]     입사일 YYYY-MM-DD (join, both)
 * @param {string} [input.endDate]       마지막 재직일 YYYY-MM-DD (leave, both)
 * @param {number[]} input.workdays      월 전체 소정근로일로 선택한 날짜(일) 목록
 */
export function calculateProration(input) {
  const errors = {};
  const year = Number(input.year);
  const month = Number(input.month);

  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, errors: { period: '정산 대상 월을 선택해 주세요.' } };
  }

  const salary = parseSalary(input.salary);
  if (!salary.ok) errors.salary = salary.error;

  const range = resolveEmploymentRange({
    year,
    month,
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (!range.ok) Object.assign(errors, range.errors);

  const totalDays = daysInMonth(year, month);
  const workdaySet = new Set();
  for (const value of input.workdays ?? []) {
    const d = Number(value);
    if (!Number.isInteger(d) || d < 1 || d > totalDays) {
      errors.workdays = '정산 대상 월에 없는 날짜가 일정에 포함되어 있습니다.';
      break;
    }
    workdaySet.add(d);
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const { startDay, endDay } = range;
  const employedCalendarDays = endDay - startDay + 1;
  const totalWorkdays = workdaySet.size;
  let employedWorkdays = 0;
  for (const d of workdaySet) if (d >= startDay && d <= endDay) employedWorkdays += 1;

  const calendarAmount = prorate(salary.value, employedCalendarDays, totalDays);
  const workdayAvailable = totalWorkdays > 0;
  const workdayAmount = workdayAvailable ? prorate(salary.value, employedWorkdays, totalWorkdays) : null;

  let diff;
  if (!workdayAvailable) {
    diff = { comparable: false, amount: null, larger: null };
  } else {
    const amount = Math.abs(calendarAmount - workdayAmount);
    let larger = 'equal';
    if (calendarAmount > workdayAmount) larger = 'calendar';
    else if (workdayAmount > calendarAmount) larger = 'workday';
    diff = { comparable: true, amount, larger };
  }

  return {
    ok: true,
    result: {
      salary: salary.value,
      year,
      month,
      type: input.type,
      startDay,
      endDay,
      calendar: { applied: employedCalendarDays, total: totalDays, amount: calendarAmount },
      workday: {
        available: workdayAvailable,
        applied: employedWorkdays,
        total: totalWorkdays,
        amount: workdayAmount,
      },
      diff,
    },
  };
}

export const MESSAGES = Object.freeze({
  noWorkdays: '월 전체 소정근로일을 1일 이상 선택해 주세요',
  notComparable: '비교 불가',
  equal: '두 방식의 예상액이 같습니다',
});

/** 차액 문구 */
export function describeDiff(diff) {
  if (!diff.comparable) return MESSAGES.notComparable;
  if (diff.larger === 'equal') return `${formatWon(0)} · ${MESSAGES.equal}`;
  const who = diff.larger === 'calendar' ? '달력일 기준' : '소정근로일 기준';
  return `${formatWon(diff.amount)} · ${who}이 더 큽니다`;
}

/** 산식 문구: "3,100,000원 × 16 ÷ 31" */
export function describeFormula(salary, applied, total) {
  return `${formatWon(salary)} × ${applied} ÷ ${total}`;
}
