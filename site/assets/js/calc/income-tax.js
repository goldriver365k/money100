/**
 * 소득세 계산 — 과세 방식 선택.
 *  - taxBase: 종합소득 과세표준 → 기본세율 산출세액 (소득세법 제55조)
 *  - earned: 근로소득만 있는 경우 총급여 → 근로소득공제·인적공제·근로소득세액공제·표준세액공제 반영 결정세액
 * 지방소득세는 각각 10%.
 */
import { getRule, sourceList } from '../rules/index.js';
import { parseAmount, parseCount, collect, floorWon, won, num, result, fail, unavailable } from './common.js';
import { progressive, marginalRate } from './tax-common.js';
import { annualIncomeTax } from './net-salary.js';

export function calculate(raw) {
  const mode = raw.mode === 'earned' ? 'earned' : raw.mode === 'taxBase' ? 'taxBase' : null;
  const v = collect({
    year: parseCount(raw.year, { label: '귀속 연도', min: 2000, max: 2100 }),
    amount: parseAmount(raw.amount, { label: mode === 'earned' ? '총급여 (비과세 제외)' : '과세표준' }),
    dependents: parseCount(raw.dependents, { label: '기본공제 인원(본인 포함)', required: false, min: 1, max: 20, unit: '명' }),
    insurance: parseAmount(raw.insurance, { label: '연금·건강·고용보험료(근로자 부담 연간)', required: false, allowZero: true }),
  });
  if (!mode) { v.ok = false; v.errors.mode = '과세 방식을 선택해 주세요.'; }
  if (!v.ok) return fail(v.errors);
  const { year, amount } = v.values;
  const rule = getRule(year, 'incomeTax');
  if (!rule.ok) return unavailable(rule.reason, sourceList(['incomeTaxRate']));
  const r = rule.value;

  if (mode === 'taxBase') {
    const tax = progressive(amount, r.rates);
    const b = r.rates.find((x) => amount <= x.upTo);
    const local = floorWon(tax * r.localTaxRate);
    return result({
      meta: `${year}년 귀속 · 과세표준 ${won(amount)} · 기본세율`,
      headline: { label: '산출세액 (소득세)', value: won(tax) },
      stats: [
        { label: '산출세액 (소득세)', value: won(tax) },
        { label: '지방소득세', value: won(local) },
        { label: '한계세율 · 실효세율', value: `${num(b.rate * 100)}% · ${num((tax / amount) * 100, 2)}%` },
      ],
      rows: [{ label: '적용 구간', value: `${won(b.from)} 초과 구간: ${won(b.base)} + (${won(amount)} − ${won(b.from)}) × ${num(b.rate * 100)}% = ${won(tax)}` }],
      table: { head: ['과세표준 구간', '세율', '누진공제 반영 기본세액'], rows: r.rates.map((x) => [x.upTo === Infinity ? `${won(x.from)} 초과` : `${won(x.upTo)} 이하`, `${num(x.rate * 100)}%`, won(x.base)]) },
      formulas: ['산출세액 = 구간 기본세액 + (과세표준 − 구간 시작 금액) × 세율', '지방소득세 = 소득세 × 10%'],
      warnings: ['과세표준은 소득금액에서 소득공제를 뺀 금액입니다. 세액공제·감면을 빼기 전 금액이며, 실제 납부세액은 공제에 따라 줄어듭니다.'],
      sources: sourceList(['incomeTaxRate', 'localTax']),
    });
  }
  const dependents = v.values.dependents ?? 1;
  const ins = v.values.insurance ?? 0;
  const t = annualIncomeTax({ totalPay: amount, dependents, pensionPaid: ins, otherInsurancePaid: 0 }, r);
  const local = floorWon(t.tax * r.localTaxRate);
  return result({
    meta: `${year}년 귀속 · 근로소득 총급여 ${won(amount)} · 기본공제 ${dependents}명 · 보험료 ${won(ins)}`,
    headline: { label: '결정세액 (소득세)', value: won(t.tax) },
    stats: [
      { label: '결정세액 (소득세)', value: won(t.tax) },
      { label: '지방소득세', value: won(local) },
      { label: '실효세율 (총급여 대비)', value: `${num(((t.tax + local) / amount) * 100, 2)}%` },
    ],
    rows: [
      { label: '근로소득공제', value: `− ${won(t.deduction)}` },
      { label: '인적공제', value: `− ${won(t.personal)}` },
      { label: '보험료 공제 (입력값)', value: `− ${won(ins)}` },
      { label: '과세표준', value: `${won(t.base)} (한계세율 ${num(marginalRate(t.base, r.rates) * 100)}%)` },
      { label: '산출세액', value: won(t.calc) },
      { label: '근로소득세액공제', value: `− ${won(t.credit)}` },
      { label: '표준세액공제', value: t.standard ? `− ${won(t.standard)}` : '적용 안 함' },
    ],
    formulas: ['과세표준 = 총급여 − 근로소득공제 − 인적공제 − 보험료', '결정세액 = 산출세액 − 근로소득세액공제 − 표준세액공제(13만 원)'],
    warnings: ['신용카드·의료비 등 개인별 공제는 반영하지 않았습니다. 상세한 정산은 연말정산 환급금 계산기를 이용하세요.'],
    sources: sourceList(r.sources),
  });
}
