/**
 * DSR 기준 신규 대출 한도 추정 — 금융위원회 차주단위 DSR, 스트레스 DSR.
 * DSR = (모든 대출의 연간 원리금 상환액) ÷ 연소득
 * 신규 대출 연간 상환 가능액 = 연소득 × DSR 한도 − 기존 대출 연간 원리금
 * 한도 원금 = 원리금균등 상환으로 (금리 + 스트레스 금리)를 적용했을 때 연간 상환액이 위 금액이 되는 원금
 * 스트레스 금리·DSR 한도는 대출 종류·지역·금융회사마다 달라 사용자가 입력한다(기본값은 참고 가정값).
 */
import { getRule, sourceList } from '../rules/index.js';
import { parseAmount, parseDecimal, parseCount, collect, floorWon, won, num, result, fail, unavailable } from './common.js';

export function principalFor(monthlyPay, annualRatePct, months) {
  const r = annualRatePct / 100 / 12;
  if (r === 0) return monthlyPay * months;
  return monthlyPay * (1 - (1 + r) ** -months) / r;
}
export function paymentFor(principal, annualRatePct, months) {
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / months;
  return principal * r * (1 + r) ** months / ((1 + r) ** months - 1);
}

export function calculate(raw) {
  const rule = getRule(2026, 'dsr');
  if (!rule.ok) return unavailable(rule.reason, sourceList(['dsrRule']));
  const d = rule.value;
  const v = collect({
    income: parseAmount(raw.income, { label: '연소득' }),
    existing: parseAmount(raw.existing, { label: '기존 대출 연간 원리금', required: false, allowZero: true }),
    rate: parseDecimal(raw.rate, { label: '신규 대출 금리', min: 0, max: 30, allowZero: true, decimals: 3, unit: '%' }),
    stress: parseDecimal(raw.stress, { label: '스트레스 금리', required: false, min: 0, max: 5, allowZero: true, decimals: 2, unit: '%p' }),
    years: parseCount(raw.years, { label: '만기', min: 1, max: 50, unit: '년' }),
    limit: parseDecimal(raw.limit, { label: 'DSR 한도', required: false, min: 1, max: 100, decimals: 1, unit: '%' }),
  });
  if (!v.ok) return fail(v.errors);
  const { income, existing, rate, years } = v.values;
  const stress = v.values.stress ?? d.stressReference;
  const limit = v.values.limit ?? d.bankLimit;
  const months = years * 12;
  const allowYear = income * limit / 100 - existing;
  const currentDsr = existing / income * 100;
  if (allowYear <= 0) {
    return result({
      meta: `연소득 ${won(income)} · DSR 한도 ${num(limit, 1)}%`, headline: { label: '추가 대출 가능 한도', value: '0원' },
      stats: [{ label: '현재 DSR', value: `${num(currentDsr, 1)}%` }, { label: '추가 한도', value: '0원' }],
      rows: [{ label: '판단', value: `기존 대출 원리금만으로 DSR ${num(currentDsr, 1)}%가 한도 ${num(limit, 1)}% 이상입니다.` }],
      formulas: ['DSR = 연간 원리금 상환액 ÷ 연소득'], warnings: ['DSR 산정 제외 대출(전세자금대출 등)이 있다면 기존 원리금에서 빼고 다시 계산하세요.'], sources: sourceList(d.sources),
    });
  }
  const testRate = rate + stress;
  const maxPrincipal = Math.floor(principalFor(allowYear / 12, testRate, months) / 10000) * 10000;
  const actualMonthly = floorWon(paymentFor(maxPrincipal, rate, months));
  const testMonthly = floorWon(paymentFor(maxPrincipal, testRate, months));

  return result({
    meta: `연소득 ${won(income)} · 기존 원리금 연 ${won(existing)} · 금리 ${num(rate, 3)}% + 스트레스 ${num(stress, 2)}%p · ${years}년 원리금균등 · DSR 한도 ${num(limit, 1)}%`,
    headline: { label: 'DSR 기준 신규 대출 한도 (추정)', value: won(maxPrincipal) },
    stats: [
      { label: '신규 대출 한도 (추정)', value: won(maxPrincipal) },
      { label: '실제 금리 기준 월 상환액', value: won(actualMonthly) },
      { label: '현재 DSR (기존 대출)', value: `${num(currentDsr, 1)}%` },
    ],
    rows: [
      { label: '연간 상환 가능액', value: `${won(income)} × ${num(limit, 1)}% − ${won(existing)} = ${won(floorWon(allowYear))}` },
      { label: 'DSR 산정 금리', value: `${num(rate, 3)}% + 스트레스 ${num(stress, 2)}%p = ${num(testRate, 3)}%` },
      { label: 'DSR 산정용 월 상환액', value: won(testMonthly) },
      { label: '한도 원금 (1만 원 미만 버림)', value: won(maxPrincipal) },
    ],
    formulas: [
      'DSR = (기존 + 신규 대출 연간 원리금) ÷ 연소득 ≤ DSR 한도',
      '신규 한도 = 연간 상환 가능액 ÷ 12 를 월 상환액으로 하는 원리금균등 대출 원금 (금리 + 스트레스 금리 적용)',
    ],
    warnings: [
      `DSR 한도(은행권 ${d.bankLimit}%·제2금융권 ${d.nonBankLimit}%)와 스트레스 금리(3단계 기본 ${d.stressReference}%p)는 대출 종류·지역·금리 유형(변동·혼합·주기형)·금융회사에 따라 다르므로 입력값은 참고 가정값입니다. 수도권·규제지역은 더 강한 기준이 적용될 수 있습니다.`,
      'LTV(담보인정비율)·DTI, 주택 수·지역별 대출 규제, 금융회사 내부 심사는 반영하지 않았습니다. 실제 한도는 금융회사 상담으로 확인하세요.',
      '원리금균등 상환만 계산합니다. 만기일시·원금균등 상환은 DSR 산정 방식이 다릅니다.',
    ],
    sources: sourceList(d.sources),
  });
}
