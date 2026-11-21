/**
 * 월급 실수령액 계산 — 연봉 실수령액 계산기와 같은 공통 엔진(netCore)을 쓴다.
 * 세전 월급 × 12 를 연간 총급여로 보고 4대보험·소득세(자녀세액공제 포함)·지방소득세를 뺀다.
 */
import { parseAmount, parseCount, collect, won, fail } from './common.js';
import { netCore } from './net-salary.js';

export function calculate(raw) {
  const v = collect({
    year: parseCount(raw.year, { label: '기준 연도', min: 2000, max: 2100 }),
    pay: parseAmount(raw.pay, { label: '세전 월급' }),
    nonTaxable: parseAmount(raw.nonTaxable, { label: '월 비과세 금액', required: false, allowZero: true }),
    dependents: parseCount(raw.dependents, { label: '부양가족 수(본인 포함)', min: 1, max: 20, unit: '명' }),
    children: parseCount(raw.children, { label: '자녀세액공제 대상 자녀 수', required: false, min: 0, max: 10, unit: '명' }),
  });
  if (v.ok && v.values.nonTaxable >= v.values.pay) { v.ok = false; v.errors.nonTaxable = '월 비과세 금액은 세전 월급보다 작아야 합니다.'; }
  if (v.ok && (v.values.children ?? 0) > v.values.dependents - 1) { v.ok = false; v.errors.children = '자녀 수는 부양가족 수(본인 제외)보다 많을 수 없습니다.'; }
  if (!v.ok) return fail(v.errors);
  const { year, pay, nonTaxable, dependents } = v.values;
  const children = v.values.children ?? 0;
  return netCore({ year, monthly: pay, nonTaxable, dependents, children, monthlyNote: '입력한 세전 월급',
    meta: `${year}년 기준 · 세전 월급 ${won(pay)} · 월 비과세 ${won(nonTaxable)} · 부양가족 ${dependents}명(본인 포함)${children ? ` · 공제 대상 자녀 ${children}명` : ''}` });
}
