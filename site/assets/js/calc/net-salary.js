/**
 * 연봉 실수령액 계산.
 *
 * 1) 월 급여 = 연봉 ÷ 12 (원 미만 버림), 월 과세 보수 = 월 급여 − 월 비과세
 * 2) 4대보험(근로자분): 월별로 계산해 12개월을 더한다 (국민연금 상·하한이 7월에 바뀌므로)
 * 3) 소득세: 소득세법의 연간 결정세액 산식으로 계산한 뒤 12로 나눈다.
 *    총급여 − 근로소득공제 − 인적공제(150만 원 × 인원) − 연금보험료공제 [− 건강·장기요양·고용보험료 공제]
 *    → 기본세율 → 근로소득세액공제(한도) [− 표준세액공제 13만 원]
 *    특별소득공제(보험료)와 표준세액공제는 함께 받을 수 없으므로 두 방법 중 세액이 적은 쪽을 쓴다.
 * 4) 지방소득세 = 소득세 × 10%
 *
 * 매달 실제 원천징수액은 국세청 근로소득 간이세액표로 정해지므로 이 결과와 다를 수 있다(차이는 연말정산에서 정산).
 * 자녀세액공제·각종 소득공제·세액공제는 반영하지 않는다.
 */
import { getRule, sourceList } from '../rules/index.js';
import { parseAmount, parseCount, collect, floorWon, won, num, result, fail, unavailable } from './common.js';
import { monthlyInsurance, sum } from './social-insurance.js';

const bracketCalc = (amount, brackets) => {
  const b = brackets.find((x) => amount <= x.upTo);
  return b.base + (amount - b.from) * b.rate;
};

export function earnedIncomeDeduction(totalPay, rule) {
  return Math.min(floorWon(bracketCalc(totalPay, rule.earnedDeduction.brackets)), rule.earnedDeduction.cap);
}

export function basicTax(taxBase, rule) {
  if (taxBase <= 0) return 0;
  return floorWon(bracketCalc(taxBase, rule.rates));
}

export function earnedCreditLimit(totalPay, rule) {
  const l = rule.earnedCredit.limits.find((x) => totalPay <= x.upTo);
  if (l.kind === 'flat') return l.value;
  return Math.max(floorWon(l.start - (totalPay - l.from) * l.rate), l.floor);
}

export function earnedCredit(calculatedTax, totalPay, rule) {
  const c = rule.earnedCredit;
  const raw = calculatedTax <= c.threshold ? calculatedTax * c.lowRate : c.highBase + (calculatedTax - c.threshold) * c.highRate;
  return Math.min(floorWon(raw), earnedCreditLimit(totalPay, rule));
}

/** 연간 근로소득세 결정세액 (간이 추정). */
export function annualIncomeTax({ totalPay, dependents, pensionPaid, otherInsurancePaid }, rule) {
  const deduction = earnedIncomeDeduction(totalPay, rule);
  const earnedIncome = Math.max(totalPay - deduction, 0);
  const personal = rule.personalDeductionPerPerson * dependents;
  const run = (useInsurance) => {
    const base = Math.max(earnedIncome - personal - pensionPaid - (useInsurance ? otherInsurancePaid : 0), 0);
    const calc = basicTax(base, rule);
    const credit = earnedCredit(calc, totalPay, rule);
    const standard = useInsurance ? 0 : rule.standardCredit;
    const tax = Math.max(calc - credit - standard, 0);
    return { useInsurance, base, calc, credit, standard, tax };
  };
  const a = run(true); const b = run(false);
  const best = b.tax < a.tax ? b : a;
  return { deduction, earnedIncome, personal, ...best };
}

export function calculate(raw) {
  const v = collect({
    year: parseCount(raw.year, { label: '기준 연도', min: 2000, max: 2100 }),
    salary: parseAmount(raw.salary, { label: '연봉(세전)' }),
    nonTaxable: parseAmount(raw.nonTaxable, { label: '월 비과세 금액', required: false, allowZero: true }),
    dependents: parseCount(raw.dependents, { label: '부양가족 수(본인 포함)', min: 1, max: 20, unit: '명' }),
  });
  if (v.ok && v.values.salary < 12) { v.ok = false; v.errors.salary = '연봉은 12원 이상이어야 월 급여를 계산할 수 있습니다.'; }
  if (v.ok && v.values.nonTaxable * 12 >= v.values.salary) { v.ok = false; v.errors.nonTaxable = '월 비과세 금액 × 12가 연봉보다 작아야 합니다.'; }
  if (!v.ok) return fail(v.errors);
  const { year, salary, nonTaxable, dependents } = v.values;

  const taxRule = getRule(year, 'incomeTax');
  if (!taxRule.ok) return unavailable(taxRule.reason, sourceList(['incomeTaxRate']));

  const monthly = floorWon(salary / 12);
  const taxableMonthly = monthly - nonTaxable;
  const months = [];
  for (let m = 1; m <= 12; m += 1) {
    const r = monthlyInsurance(year, m, taxableMonthly);
    if (!r.ok) return unavailable(r.reason, sourceList(['pensionAct', 'employmentRate']));
    months.push(r);
  }
  const yearly = (k) => months.reduce((a, r) => a + r.value.employee[k], 0);
  const ins = { pension: yearly('pension'), health: yearly('health'), ltc: yearly('ltc'), employment: yearly('employment') };
  const insYear = sum(ins);
  const totalPay = taxableMonthly * 12; // 총급여 (비과세 제외)

  const t = annualIncomeTax({ totalPay, dependents, pensionPaid: ins.pension, otherInsurancePaid: ins.health + ins.ltc + ins.employment }, taxRule.value);
  const localYear = floorWon(t.tax * taxRule.value.localTaxRate);
  const taxMonthly = floorWon(t.tax / 12);
  const localMonthly = floorWon(localYear / 12);
  const insMonthly = floorWon(insYear / 12);
  const netMonthly = monthly - insMonthly - taxMonthly - localMonthly;
  const netYear = monthly * 12 - insYear - t.tax - localYear;

  const first = months[0].value; const last = months[11].value;
  const pensionNote = first.employee.pension === last.employee.pension
    ? `월 ${won(first.employee.pension)}`
    : `1~6월 ${won(first.employee.pension)}, 7~12월 ${won(last.employee.pension)} (기준소득월액 상·하한 변경)`;

  const warnings = [
    '매달 실제 원천징수 소득세는 국세청 근로소득 간이세액표로 정해져 이 금액과 다를 수 있으며, 차이는 연말정산에서 정산됩니다.',
    '자녀세액공제, 신용카드·의료비·교육비·월세 등 개인별 공제와 상여·성과급 지급 시기는 반영하지 않았습니다.',
  ];
  if (salary % 12 !== 0) warnings.push(`연봉 ÷ 12의 원 미만(${num((salary / 12) - monthly, 2)}원)은 버렸습니다.`);

  return result({
    meta: `${year}년 기준 · 연봉 ${won(salary)} · 월 비과세 ${won(nonTaxable)} · 부양가족 ${dependents}명(본인 포함)`,
    headline: { label: '월 예상 실수령액', value: won(netMonthly) },
    stats: [
      { label: '월 예상 실수령액', value: won(netMonthly) },
      { label: '연 예상 실수령액', value: won(netYear) },
      { label: '월 공제액 합계', value: won(monthly - netMonthly) },
    ],
    table: {
      head: ['항목', '월 (평균)', '연간', '산정 방법'],
      rows: [
        ['세전 월급', won(monthly), won(monthly * 12), '연봉 ÷ 12'],
        ['국민연금', won(floorWon(ins.pension / 12)), won(ins.pension), pensionNote],
        ['건강보험', won(first.employee.health), won(ins.health), `월 과세 보수 × ${num(first.rates.health * 50, 3)}%`],
        ['장기요양보험', won(first.employee.ltc), won(ins.ltc), `월 과세 보수 × ${num(first.rates.ltc * 50, 4)}%`],
        ['고용보험', won(first.employee.employment), won(ins.employment), `월 과세 보수 × ${num(first.rates.empEmployee * 100, 2)}%`],
        ['소득세', won(taxMonthly), won(t.tax), '연간 결정세액 ÷ 12'],
        ['지방소득세', won(localMonthly), won(localYear), '소득세 × 10%'],
      ],
      foot: ['실수령액', won(netMonthly), won(netYear), '세전 − 공제 합계'],
    },
    rows: [
      { label: '총급여 (비과세 제외)', value: won(totalPay) },
      { label: '근로소득공제', value: `− ${won(t.deduction)}` },
      { label: '근로소득금액', value: won(t.earnedIncome) },
      { label: `인적공제 (${dependents}명 × 150만 원)`, value: `− ${won(t.personal)}` },
      { label: '연금보험료공제', value: `− ${won(ins.pension)}` },
      { label: '건강·장기요양·고용보험료 공제', value: t.useInsurance ? `− ${won(ins.health + ins.ltc + ins.employment)}` : '적용 안 함 (표준세액공제가 유리)' },
      { label: '과세표준', value: won(t.base) },
      { label: '산출세액 (기본세율)', value: won(t.calc) },
      { label: '근로소득세액공제', value: `− ${won(t.credit)}` },
      { label: '표준세액공제', value: t.standard ? `− ${won(t.standard)}` : '적용 안 함 (보험료 공제가 유리)' },
      { label: '결정세액 (연간 소득세)', value: won(t.tax) },
    ],
    formulas: [
      '월 실수령액 = 세전 월급 − 4대보험(근로자분) − 소득세 − 지방소득세',
      '과세표준 = 총급여 − 근로소득공제 − 인적공제 − 연금보험료공제 (− 건강·장기요양·고용보험료)',
      '결정세액 = 기본세율 산출세액 − 근로소득세액공제 (− 표준세액공제 13만 원), 보험료 공제와 표준세액공제 중 세액이 적은 쪽 적용',
      '4대보험은 비과세를 뺀 월 보수로 계산하고 10원 미만을 버립니다.',
    ],
    warnings,
    sources: sourceList([...months[0].sources, ...months[11].sources, ...taxRule.value.sources]),
  });
}
