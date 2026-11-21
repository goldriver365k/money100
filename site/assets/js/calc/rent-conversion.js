/**
 * 전월세 전환 계산 — 주택임대차보호법 제7조의2, 시행령 제9조.
 * 법정 전환율 상한 = min(연 10%, 한국은행 기준금리 + 연 2%)
 * 전세 → 월세: 월세 = (전세보증금 − 월세보증금) × 전환율 ÷ 12 (원 미만 버림)
 * 월세 → 전세: 전세보증금 = 월세보증금 + 월세 × 12 ÷ 전환율
 * 상한은 계약 기간 중 또는 갱신 시 보증금 일부를 월세로 바꿀 때 적용된다(신규 계약은 당사자 합의).
 */
import { getRule, sourceList } from '../rules/index.js';
import { parseAmount, parseDecimal, collect, floorWon, won, num, result, fail, unavailable } from './common.js';

export function calculate(raw) {
  const mode = raw.mode === 'toJeonse' ? 'toJeonse' : raw.mode === 'toMonthly' ? 'toMonthly' : null;
  const rule = getRule(2026, 'rentConversion');
  if (!rule.ok) return unavailable(rule.reason, sourceList(['rentConv']));
  const rc = rule.value;
  const v = collect({
    jeonse: parseAmount(raw.jeonse, { label: '전세보증금', required: mode === 'toMonthly' }),
    deposit: parseAmount(raw.deposit, { label: '월세 보증금', required: false, allowZero: true }),
    monthly: parseAmount(raw.monthly, { label: '월세', required: mode === 'toJeonse' }),
    baseRate: parseDecimal(raw.baseRate, { label: '한국은행 기준금리', required: false, min: 0, max: 20, allowZero: true, decimals: 2, unit: '%' }),
    rate: parseDecimal(raw.rate, { label: '적용 전환율', required: false, min: 0.1, max: 30, decimals: 2, unit: '%' }),
  });
  if (!mode) { v.ok = false; v.errors.mode = '계산 방향을 선택해 주세요.'; }
  if (mode === 'toMonthly') delete v.errors.monthly; else delete v.errors.jeonse;
  if (!v.errors.jeonse && mode === 'toMonthly' && (v.values.deposit ?? 0) >= v.values.jeonse) v.errors.deposit = '월세 보증금은 전세보증금보다 작아야 합니다.';
  if (Object.keys(v.errors).length) return fail(v.errors);
  const baseRate = v.values.baseRate ?? rc.baseRate;
  const legalCap = Math.min(rc.cap, baseRate + rc.add);
  const rate = v.values.rate ?? legalCap;
  const deposit = v.values.deposit ?? 0;
  const over = rate > legalCap + 1e-9;

  let headline; let rows;
  if (mode === 'toMonthly') {
    const diff = v.values.jeonse - deposit;
    const m = floorWon(diff * rate / 100 / 12);
    headline = { label: '환산 월세', value: won(m) };
    rows = [
      { label: '월세로 바꾸는 보증금', value: `${won(v.values.jeonse)} − ${won(deposit)} = ${won(diff)}` },
      { label: '월세', value: `${won(diff)} × ${num(rate, 2)}% ÷ 12 = ${won(m)}` },
    ];
  } else {
    const j = deposit + floorWon(v.values.monthly * 12 / (rate / 100));
    headline = { label: '환산 전세보증금', value: won(j) };
    rows = [
      { label: '월세 → 보증금', value: `${won(v.values.monthly)} × 12 ÷ ${num(rate, 2)}% = ${won(j - deposit)}` },
      { label: '전세보증금', value: `${won(deposit)} + ${won(j - deposit)} = ${won(j)}` },
    ];
  }
  const warnings = [
    '법정 전환율 상한은 계약 기간 중이나 갱신 때 보증금 일부를 월세로 바꾸는 경우에 적용됩니다. 신규 계약은 당사자가 정할 수 있습니다.',
    `기준금리는 ${rc.baseRateDate.replace(/-/g, '.')}. 기준 연 ${num(rc.baseRate, 2)}%입니다. 이후 변경되었다면 직접 입력하세요.`,
  ];
  if (over) warnings.unshift(`입력한 전환율 ${num(rate, 2)}%는 법정 상한 ${num(legalCap, 2)}%를 넘습니다. 상한을 넘는 월세 부분은 기존 계약 전환 시 무효가 될 수 있습니다.`);

  return result({
    meta: `전환율 ${num(rate, 2)}%${v.values.rate == null ? ' (법정 상한 자동 적용)' : ''} · 법정 상한 ${num(legalCap, 2)}% (기준금리 ${num(baseRate, 2)}% + 2%, 최대 10%)`,
    headline,
    stats: [headline, { label: '적용 전환율', value: `${num(rate, 2)}%` }, { label: '법정 전환율 상한', value: `${num(legalCap, 2)}%${over ? ' — 초과' : ''}` }],
    rows,
    formulas: ['법정 상한 = min(10%, 기준금리 + 2%)', '월세 = (전세보증금 − 월세보증금) × 전환율 ÷ 12', '전세보증금 = 월세보증금 + 월세 × 12 ÷ 전환율'],
    warnings,
    sources: sourceList(rc.sources),
  });
}
