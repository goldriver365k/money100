/**
 * 연말정산 환급금 계산 — 근로소득 결정세액과 기납부(원천징수) 세액 비교.
 *
 * 총급여 − 근로소득공제 − 인적공제 − 연금보험료공제 − 건강·장기요양·고용보험료 − 그 밖의 소득공제 = 과세표준
 * 결정세액 = 산출세액 − 근로소득세액공제 − 자녀세액공제 − 그 밖의 세액공제(특별세액공제 등)
 *   특별세액공제·보험료 공제를 받지 않으면 표준세액공제 13만 원을 받을 수 있으므로 두 방법 중 세액이 적은 쪽을 쓴다.
 * 차감 = 결정세액 − 기납부세액 (음수면 환급), 지방소득세 10% 별도
 */
import { getRule, sourceList } from '../rules/index.js';
import { parseAmount, parseCount, collect, floorWon, won, result, fail, unavailable } from './common.js';
import { earnedIncomeDeduction, basicTax, earnedCredit, childTaxCredit } from './net-salary.js';

export function calculate(raw) {
  const v = collect({
    year: parseCount(raw.year, { label: '귀속 연도', min: 2000, max: 2100 }),
    totalPay: parseAmount(raw.totalPay, { label: '총급여 (비과세 제외)' }),
    dependents: parseCount(raw.dependents, { label: '기본공제 인원(본인 포함)', min: 1, max: 20, unit: '명' }),
    children: parseCount(raw.children, { label: '자녀세액공제 대상 자녀 수', required: false, min: 0, max: 10, unit: '명' }),
    pension: parseAmount(raw.pension, { label: '국민연금 보험료(근로자 부담)', required: false, allowZero: true }),
    insurance: parseAmount(raw.insurance, { label: '건강·장기요양·고용보험료(근로자 부담)', required: false, allowZero: true }),
    deductions: parseAmount(raw.deductions, { label: '그 밖의 소득공제', required: false, allowZero: true }),
    credits: parseAmount(raw.credits, { label: '그 밖의 세액공제', required: false, allowZero: true }),
    withheld: parseAmount(raw.withheld, { label: '기납부 소득세(원천징수)', required: false, allowZero: true }),
  });
  if (v.ok && (v.values.children ?? 0) > v.values.dependents - 1) { v.ok = false; v.errors.children = '자녀 수는 기본공제 인원(본인 제외)보다 많을 수 없습니다.'; }
  if (!v.ok) return fail(v.errors);
  const { year, totalPay, dependents, pension, insurance, deductions, credits, withheld } = v.values;
  const children = v.values.children ?? 0;
  const rule = getRule(year, 'incomeTax');
  if (!rule.ok) return unavailable(rule.reason, sourceList(['incomeTaxRate']));
  let child = 0;
  if (children) {
    const cr = getRule(year, 'childCredit');
    if (!cr.ok) return unavailable(cr.reason, sourceList(['childCredit']));
    child = childTaxCredit(children, cr.value);
  }
  const r = rule.value;
  const ded = earnedIncomeDeduction(totalPay, r);
  const earned = Math.max(totalPay - ded, 0);
  const personal = r.personalDeductionPerPerson * dependents;

  const run = (special) => {
    const base = Math.max(earned - personal - pension - (special ? insurance : 0) - deductions, 0);
    const calc = basicTax(base, r);
    const ec = earnedCredit(calc, totalPay, r);
    let left = Math.max(calc - ec, 0);
    const childUsed = Math.min(child, left); left -= childUsed;
    const otherUsed = special ? Math.min(credits, left) : 0; left -= otherUsed;
    const std = special ? 0 : Math.min(r.standardCredit, left); left -= std;
    return { special, base, calc, ec, childUsed, otherUsed, std, tax: left };
  };
  const a = run(true); const b = run(false);
  const t = b.tax < a.tax ? b : a;
  const diff = t.tax - withheld;
  const local = floorWon(t.tax * r.localTaxRate);
  const localDiff = local - floorWon(withheld * r.localTaxRate);

  return result({
    meta: `${year}년 귀속 · 총급여 ${won(totalPay)} · 기본공제 ${dependents}명${children ? ` · 자녀 ${children}명` : ''}`,
    headline: { label: diff <= 0 ? '예상 환급액 (소득세)' : '예상 추가 납부액 (소득세)', value: won(Math.abs(diff)) },
    stats: [
      { label: '결정세액', value: won(t.tax) },
      { label: '기납부세액', value: won(withheld) },
      { label: diff <= 0 ? '예상 환급 (소득세+지방소득세)' : '예상 추가 납부 (소득세+지방소득세)', value: won(Math.abs(diff + localDiff)) },
    ],
    rows: [
      { label: '근로소득공제', value: `− ${won(ded)}` },
      { label: '근로소득금액', value: won(earned) },
      { label: `인적공제 (${dependents}명)`, value: `− ${won(personal)}` },
      { label: '연금보험료공제', value: `− ${won(pension)}` },
      { label: '보험료 공제 (건강·장기요양·고용)', value: t.special ? `− ${won(insurance)}` : '적용 안 함 (표준세액공제가 유리)' },
      { label: '그 밖의 소득공제', value: `− ${won(deductions)}` },
      { label: '과세표준', value: won(t.base) },
      { label: '산출세액', value: won(t.calc) },
      { label: '근로소득세액공제', value: `− ${won(t.ec)}` },
      { label: '자녀세액공제', value: `− ${won(t.childUsed)}` },
      { label: '그 밖의 세액공제', value: t.special ? `− ${won(t.otherUsed)}` : '적용 안 함' },
      { label: '표준세액공제', value: t.special ? '적용 안 함' : `− ${won(t.std)}` },
      { label: '결정세액', value: won(t.tax) },
      { label: '지방소득세 차감', value: `${localDiff <= 0 ? '환급' : '납부'} ${won(Math.abs(localDiff))}` },
    ],
    formulas: [
      '과세표준 = 총급여 − 근로소득공제 − 인적공제 − 연금보험료 − 보험료 − 그 밖의 소득공제',
      '결정세액 = 산출세액 − 근로소득세액공제 − 자녀세액공제 − 그 밖의 세액공제 (또는 표준세액공제 13만 원)',
      '환급(추가 납부)액 = 결정세액 − 기납부세액, 지방소득세는 각각의 10%',
    ],
    warnings: [
      '그 밖의 소득공제(신용카드·주택자금 등)와 세액공제(보험료·의료비·교육비·기부금·연금계좌·월세 등)는 공제 요건과 한도를 적용한 "공제액"을 입력해야 합니다. 지출액을 그대로 넣으면 과대 계산됩니다.',
      '보험료 공제·특별세액공제를 받으면 표준세액공제 13만 원을 받을 수 없어, 두 방법 중 세액이 적은 쪽을 자동으로 골랐습니다.',
      '정확한 금액은 홈택스 연말정산 미리보기·간소화 자료로 확인하세요.',
    ],
    sources: sourceList([...r.sources, ...(children ? ['childCredit'] : [])]),
  });
}
