/**
 * 기준 데이터 조회. 계산 모듈은 값을 직접 import 하지 않고 이 함수로 꺼낸다.
 * 값이 없거나(null) 연도가 없으면 { ok:false, reason } 을 돌려준다 — 임의 값으로 대신하지 않는다.
 */
import { YEARS, SOURCES, AVAILABLE_YEARS, DEFAULT_YEAR, CHECKED_DATE, STATIC_RULES } from './rules-data.js';

export { SOURCES, AVAILABLE_YEARS, DEFAULT_YEAR, CHECKED_DATE, STATIC_RULES };

export function getYear(year) {
  const y = YEARS[Number(year)];
  if (!y) return { ok: false, reason: `${year}년 기준은 아직 준비되지 않았습니다. 확인된 연도: ${AVAILABLE_YEARS.join('·')}년` };
  return { ok: true, value: y };
}

/** key: 'minimumWage' | 'pension' | 'health' | 'longTermCare' | 'employment' | 'incomeTax' | 'vat' */
export function getRule(year, key) {
  const y = getYear(year);
  if (!y.ok) return y;
  const v = y.value[key];
  if (v == null) {
    return { ok: false, reason: y.value.unavailable?.[key] ?? `${year}년 ${key} 기준을 공식 자료로 확인하지 못해 계산할 수 없습니다.` };
  }
  return { ok: true, value: v };
}

/** 국민연금 기준소득월액 상·하한 (월별) */
export function getPensionLimit(year, month) {
  const p = getRule(year, 'pension');
  if (!p.ok) return p;
  const lim = p.value.limits.find((l) => month >= l.fromMonth && month <= l.toMonth);
  if (!lim || lim.min == null || lim.max == null) {
    const y = getYear(year).value;
    return { ok: false, reason: y.unavailable?.pensionLimitH2 ?? `${year}년 ${month}월 국민연금 기준소득월액 상·하한을 확인하지 못했습니다.` };
  }
  return { ok: true, value: lim };
}

export function sourceList(keys) {
  return [...new Set(keys)].filter(Boolean).map((k) => ({ key: k, ...SOURCES[k] })).filter((s) => s.title);
}
