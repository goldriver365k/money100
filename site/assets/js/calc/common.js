/**
 * 계산기 공통 입력 검증·끝수 처리·표시 함수. 화면(DOM)에 의존하지 않는다 — 단위 테스트 대상.
 *
 * 입력값은 화면의 문자열을 그대로 받는다. 검증 실패는 { ok:false, error } 로 돌려준다.
 */

export const MAX_AMOUNT = 999_999_999_999; // 1조 원 미만

/**
 * 받침에 맞는 조사: josa('연봉(세전)', '을', '를') → '연봉(세전)을'. 괄호 안 설명은 건너뛰고 앞 낱말의 끝 글자로 판단.
 * 한글·숫자가 아닌 글자로 끝나면 '을(를)'처럼 둘 다 적는다.
 */
export function josa(label, withFinal, withoutFinal) {
  const base = String(label).replace(/\s*\([^)]*\)\s*$/, '').trim();
  const ch = base.slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  let final;
  if (code >= 0 && code <= 11171) final = code % 28 !== 0;
  else if (/\d/.test(ch)) final = '013678'.includes(ch);
  else return `${label}${withFinal}(${withoutFinal})`;
  return `${label}${final ? withFinal : withoutFinal}`;
}

const clean = (raw) => String(raw ?? '').trim().replace(/[,\s]/g, '').replace(/원$/, '');

/**
 * 원 단위 금액. opts: { label, required=true, allowZero=false, max=MAX_AMOUNT }
 * 빈 값이 허용되면(required:false) 0 을 돌려준다.
 */
export function parseAmount(raw, opts = {}) {
  const { label = '금액', required = true, allowZero = false, max = MAX_AMOUNT } = opts;
  const text = clean(raw);
  if (text === '') {
    if (!required) return { ok: true, value: 0 };
    return { ok: false, error: `${josa(label, '을', '를')} 입력해 주세요.` };
  }
  if (/^-/.test(text) && /\d/.test(text)) return { ok: false, error: `${label}은(는) 0보다 작을 수 없습니다.` };
  if (/^\+?\d*\.\d*$/.test(text) && /\d/.test(text)) return { ok: false, error: `${label}은(는) 원 단위 정수로 입력해 주세요. (소수 불가)` };
  if (!/^\+?\d+$/.test(text)) return { ok: false, error: `${label}에는 숫자만 입력해 주세요.` };
  const value = Number(text.replace(/^\+/, ''));
  if (!Number.isSafeInteger(value) || value > max) return { ok: false, error: `${label}은(는) ${max.toLocaleString('ko-KR')}원 이하로 입력해 주세요.` };
  if (value === 0 && !allowZero) return { ok: false, error: `${label}은(는) 0보다 커야 합니다.` };
  return { ok: true, value };
}

/**
 * 소수 허용 숫자 (시간·이율 등). opts: { label, required=true, min, max, allowZero=false, decimals=2, unit='' }
 */
export function parseDecimal(raw, opts = {}) {
  const { label = '값', required = true, min = 0, max = Infinity, allowZero = false, decimals = 2, unit = '' } = opts;
  const text = clean(raw).replace(/%$/, '');
  if (text === '') {
    if (!required) return { ok: true, value: null };
    return { ok: false, error: `${josa(label, '을', '를')} 입력해 주세요.` };
  }
  if (/^-/.test(text) && /\d/.test(text)) return { ok: false, error: `${label}은(는) 0보다 작을 수 없습니다.` };
  if (!/^\+?(\d+(\.\d*)?|\.\d+)$/.test(text)) return { ok: false, error: `${label}에는 숫자만 입력해 주세요.` };
  const frac = (text.split('.')[1] || '');
  if (frac.length > decimals) return { ok: false, error: `${label}은(는) 소수점 ${decimals}자리까지 입력할 수 있습니다.` };
  const value = Number(text);
  if (value === 0 && !allowZero) return { ok: false, error: `${label}은(는) 0보다 커야 합니다.` };
  if (value < min || value > max) return { ok: false, error: `${label}은(는) ${min}${unit} 이상 ${max}${unit} 이하로 입력해 주세요.` };
  return { ok: true, value };
}

/** 정수(인원·개월 수). */
export function parseCount(raw, opts = {}) {
  const { label = '값', required = true, min = 1, max = 1000, unit = '' } = opts;
  const text = clean(raw);
  if (text === '') {
    if (!required) return { ok: true, value: null };
    return { ok: false, error: `${josa(label, '을', '를')} 입력해 주세요.` };
  }
  if (/^-/.test(text) && /\d/.test(text)) return { ok: false, error: `${label}은(는) 0보다 작을 수 없습니다.` };
  if (/\./.test(text)) return { ok: false, error: `${label}은(는) 정수로 입력해 주세요.` };
  if (!/^\+?\d+$/.test(text)) return { ok: false, error: `${label}에는 숫자만 입력해 주세요.` };
  const value = Number(text);
  if (value < min || value > max) return { ok: false, error: `${label}은(는) ${min}${unit} 이상 ${max}${unit} 이하로 입력해 주세요.` };
  return { ok: true, value };
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 'YYYY-MM-DD' → {ok, value:{y,m,d,t}} (t = UTC 자정 ms). 존재하지 않는 날짜는 오류. */
export function parseDate(raw, opts = {}) {
  const { label = '날짜', required = true } = opts;
  const text = String(raw ?? '').trim();
  if (text === '') return required ? { ok: false, error: `${josa(label, '을', '를')} 입력해 주세요.` } : { ok: true, value: null };
  if (text === 'invalid') return { ok: false, error: `${josa(label, '이', '가')} 올바른 날짜가 아닙니다.` };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return { ok: false, error: `${josa(label, '이', '가')} 올바른 날짜가 아닙니다. (예: 2026-03-02)` };
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
  if (y < 1950 || y > 2100) return { ok: false, error: `${label}은(는) 1950년부터 2100년 사이로 입력해 주세요.` };
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return { ok: false, error: `${josa(label, '이', '가')} 존재하지 않는 날짜입니다.` };
  return { ok: true, value: { y, m: mo, d, t: Date.UTC(y, mo - 1, d) } };
}

export const DAY_MS = 86_400_000;
export const dateFromParts = (y, m, d) => {
  // 월 넘침 보정 + 말일 맞춤 (예: 5월 31일의 3개월 전 → 2월 말일)
  const base = new Date(Date.UTC(y, m - 1, 1));
  const yy = base.getUTCFullYear(); const mm = base.getUTCMonth() + 1;
  const dd = Math.min(d, daysInMonth(yy, mm));
  return { y: yy, m: mm, d: dd, t: Date.UTC(yy, mm - 1, dd) };
};
export const addDays = (date, n) => {
  const t = date.t + n * DAY_MS; const dt = new Date(t);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), t };
};
export const isoOf = (date) => `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
export const korDate = (date) => `${date.y}년 ${date.m}월 ${date.d}일`;

/* ---------- 끝수 처리 ---------- */
export const floorWon = (v) => Math.floor(v + 1e-9);
export const roundWon = (v) => Math.round(v);
/** 10원 미만 버림 (국고금 관리법 제47조 방식) */
export const floor10 = (v) => Math.floor((v + 1e-9) / 10) * 10;

/* ---------- 표시 ---------- */
export const won = (v) => `${Math.round(v).toLocaleString('ko-KR')}원`;
export const num = (v, digits = 0) => Number(v).toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
export const pct = (rate, digits = 4) => `${num(rate * 100, digits)}%`;

/** 여러 필드 검증 결과를 모은다. */
export function collect(checks) {
  const errors = {}; const values = {};
  for (const [name, r] of Object.entries(checks)) {
    if (r.ok) values[name] = r.value; else errors[name] = r.error;
  }
  return { ok: Object.keys(errors).length === 0, errors, values };
}

/** 계산 결과 객체를 만든다 (화면 공통 렌더러가 읽는 형태). */
export function result({ headline, stats = [], rows = [], formulas = [], warnings = [], sources = [], meta = '', table = null }) {
  return { ok: true, headline, stats, rows, formulas, warnings, sources, meta, table };
}
export const fail = (errors) => ({ ok: false, errors });
export const unavailable = (reason, sources = []) => ({ ok: false, unavailable: reason, sources });
