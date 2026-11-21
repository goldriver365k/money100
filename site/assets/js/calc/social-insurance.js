/**
 * 4대보험 계산 (직장가입자 근로자·사업주 부담분, 월 기준).
 *
 * - 국민연금: 기준소득월액(월 과세소득, 천원 미만 버림)을 그 달의 상·하한으로 맞춘 뒤 × 보험료율, 근로자·사업주 반씩
 * - 건강보험: 보수월액 × 건강보험료율, 반씩
 * - 장기요양: 보수월액 × 소득 대비 장기요양보험료율, 반씩
 * - 고용보험: 보수 × 실업급여 요율(근로자·사업주 각각), 사업주는 고용안정·직업능력개발 요율 추가
 * - 산재보험: 사업주만 부담, 업종별 요율을 사용자가 입력한 경우에만 계산
 * - 끝수: 각 부담액을 10원 미만 버림 (국고금 관리법 제47조 방식). 공단 고지액과 수십 원 차이가 날 수 있다.
 */
import { getRule, getPensionLimit, sourceList } from '../rules/index.js';
import { parseAmount, parseDecimal, parseCount, collect, floor10, won, pct, num, result, fail, unavailable } from './common.js';

export const SIZE_LABELS = {
  under150: '150명 미만',
  priority150: '150명 이상 우선지원대상기업',
  under1000: '150명 이상 1,000명 미만',
  over1000: '1,000명 이상·국가·지방자치단체',
};

/**
 * 한 달 4대보험 (근로자·사업주). taxableMonthly = 비과세를 뺀 월 보수.
 * opts: { size='under150', industrialRate=null(소수, 예 0.007) }
 */
export function monthlyInsurance(year, month, taxableMonthly, opts = {}) {
  const { size = 'under150', industrialRate = null } = opts;
  const pension = getRule(year, 'pension');
  const health = getRule(year, 'health');
  const ltc = getRule(year, 'longTermCare');
  const emp = getRule(year, 'employment');
  const limit = getPensionLimit(year, month);
  for (const r of [pension, health, ltc, emp, limit]) if (!r.ok) return r;

  const pensionBaseRaw = Math.floor(taxableMonthly / 1000) * 1000;
  const pensionBase = Math.min(Math.max(pensionBaseRaw, limit.value.min), limit.value.max);
  const pensionEach = floor10(pensionBase * pension.value.rate / 2);
  const healthEach = floor10(taxableMonthly * health.value.rate / 2);
  const ltcEach = floor10(taxableMonthly * ltc.value.rateOfIncome / 2);
  const empEmployee = floor10(taxableMonthly * emp.value.employeeRate);
  const stabRate = emp.value.employerStabilityRates[size];
  const empEmployer = floor10(taxableMonthly * (emp.value.employerUnemploymentRate + stabRate));
  const industrial = industrialRate == null ? null : floor10(taxableMonthly * industrialRate);

  return {
    ok: true,
    value: {
      pensionBase, pensionBaseRaw, limit: limit.value,
      rates: { pension: pension.value.rate, health: health.value.rate, ltc: ltc.value.rateOfIncome, empEmployee: emp.value.employeeRate, empEmployer: emp.value.employerUnemploymentRate + stabRate, stabRate, industrialRate },
      employee: { pension: pensionEach, health: healthEach, ltc: ltcEach, employment: empEmployee },
      employer: { pension: pensionEach, health: healthEach, ltc: ltcEach, employment: empEmployer, industrial },
    },
    sources: [...pension.value.sources, limit.value.source, ...health.value.sources, ...ltc.value.sources, ...emp.value.sources, 'roundingAct'],
  };
}

export const sum = (o) => Object.values(o).reduce((a, b) => a + (b ?? 0), 0);

export function calculate(raw) {
  const v = collect({
    year: parseCount(raw.year, { label: '기준 연도', min: 2000, max: 2100 }),
    month: parseCount(raw.month, { label: '기준 월', min: 1, max: 12, unit: '월' }),
    pay: parseAmount(raw.pay, { label: '월 급여(세전)' }),
    nonTaxable: parseAmount(raw.nonTaxable, { label: '비과세 금액', required: false, allowZero: true }),
    industrialRate: parseDecimal(raw.industrialRate, { label: '산재보험료율', required: false, min: 0, max: 20, allowZero: true, decimals: 3, unit: '%' }),
  });
  const size = SIZE_LABELS[raw.size] ? raw.size : null;
  if (!size) { v.ok = false; v.errors.size = '사업장 규모를 선택해 주세요.'; }
  if (v.ok && v.values.nonTaxable >= v.values.pay) { v.ok = false; v.errors.nonTaxable = '비과세 금액은 월 급여보다 작아야 합니다.'; }
  if (!v.ok) return fail(v.errors);
  const { year, month, pay, nonTaxable } = v.values;
  const industrialRate = v.values.industrialRate == null ? null : v.values.industrialRate / 100;
  const taxable = pay - nonTaxable;

  const r = monthlyInsurance(year, month, taxable, { size, industrialRate });
  if (!r.ok) return unavailable(r.reason, sourceList(['pensionAct', 'healthAct', 'employmentRate']));
  const { employee: e, employer: c, rates, pensionBase, pensionBaseRaw, limit } = r.value;
  const eTotal = sum(e); const cTotal = sum(c);

  const warnings = [];
  if (pensionBaseRaw !== pensionBase) warnings.push(`국민연금은 기준소득월액 ${pensionBaseRaw < limit.min ? '하한' : '상한'} ${won(pensionBase)}을 적용했습니다.`);
  if (taxable < 1000000) warnings.push('월 보수가 적은 경우 건강보험 보수월액 하한, 주 15시간 미만·1개월 미만 근로자 적용 제외 등 예외가 있을 수 있습니다. 공단에 확인하세요.');
  if (taxable > 100000000) warnings.push('건강보험 보수월액 상한은 반영하지 않았습니다. 고소득자는 공단 고지액과 다를 수 있습니다.');
  if (industrialRate == null) warnings.push('산재보험료는 업종별 요율을 입력해야 계산됩니다(사업주만 부담).');
  warnings.push('보험료는 신고된 보수 기준으로 매달 고지되며, 건강보험은 다음 해 4월 연말정산으로 차액이 정산됩니다.');

  return result({
    meta: `${year}년 ${month}월 기준 · 월 보수 ${won(taxable)} (월 급여 ${won(pay)} − 비과세 ${won(nonTaxable)}) · 사업장 ${SIZE_LABELS[size]}`,
    headline: { label: '근로자 부담 합계 (월)', value: won(eTotal) },
    stats: [
      { label: '근로자 부담', value: won(eTotal) },
      { label: '사업주 부담', value: won(cTotal) },
      { label: '공제 후 금액 (소득세 제외)', value: won(pay - eTotal) },
    ],
    table: {
      head: ['보험', '산정 기준', '요율', '근로자', '사업주'],
      rows: [
        ['국민연금', `기준소득월액 ${won(pensionBase)}`, `${pct(rates.pension, 2)} (각 ${pct(rates.pension / 2, 3)})`, won(e.pension), won(c.pension)],
        ['건강보험', `보수월액 ${won(taxable)}`, `${pct(rates.health, 2)} (각 ${pct(rates.health / 2, 3)})`, won(e.health), won(c.health)],
        ['장기요양보험', `보수월액 ${won(taxable)}`, `${pct(rates.ltc, 4)} (각 ${pct(rates.ltc / 2, 4)})`, won(e.ltc), won(c.ltc)],
        ['고용보험', `보수 ${won(taxable)}`, `근로자 ${pct(rates.empEmployee, 2)} · 사업주 ${pct(rates.empEmployer, 2)}`, won(e.employment), won(c.employment)],
        ['산재보험', industrialRate == null ? '요율 미입력' : `보수 ${won(taxable)}`, industrialRate == null ? '—' : `사업주 ${num(industrialRate * 100, 3)}%`, '0원', c.industrial == null ? '미계산' : won(c.industrial)],
      ],
      foot: ['합계', '', '', won(eTotal), won(cTotal)],
    },
    formulas: [
      `국민연금 = 기준소득월액(천원 미만 버림, 상한 ${won(limit.max)}·하한 ${won(limit.min)}) × ${pct(rates.pension, 2)} ÷ 2`,
      `건강보험 = 보수월액 × ${pct(rates.health, 2)} ÷ 2`,
      `장기요양 = 보수월액 × ${pct(rates.ltc, 4)} ÷ 2`,
      `고용보험 = 보수 × ${pct(rates.empEmployee, 2)} (사업주는 실업급여 ${pct(rates.empEmployer - rates.stabRate, 2)} + 고용안정·직업능력개발 ${pct(rates.stabRate, 2)})`,
      '각 금액은 10원 미만을 버립니다.',
    ],
    warnings,
    sources: sourceList(r.sources),
  });
}
