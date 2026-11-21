/**
 * 프리랜서 3.3% 세금 계산 — 소득세법 제129조 제1항 제3호(인적용역 사업소득 원천징수 3%), 지방소득세 10%.
 * 원천징수 소득세 = 지급액 × 3% (10원 미만 버림), 지방소득세 = 원천징수 소득세 × 10% (10원 미만 버림)
 * 수령액 → 지급액 역산은 위 식을 만족하는 가장 작은 지급액을 찾는다.
 * 3.3%는 미리 떼는 세금일 뿐 1년 세금이 확정된 것이 아니다 — 다음 해 5월 종합소득세 신고로 정산한다.
 */
import { getRule, sourceList } from '../rules/index.js';
import { parseAmount, parseCount, collect, floor10, won, result, fail, unavailable } from './common.js';

export function withholding(pay, rule) {
  const income = floor10(pay * rule.incomeRate);
  const local = floor10(income * rule.localRate);
  return { income, local, net: pay - income - local };
}

export function grossFromNet(net, rule) {
  let pay = Math.floor(net / (1 - rule.incomeRate * (1 + rule.localRate)));
  while (withholding(pay, rule).net > net) pay -= 1;
  while (withholding(pay, rule).net < net) pay += 1;
  return withholding(pay, rule).net === net ? pay : null;
}

export function calculate(raw) {
  const mode = raw.mode === 'fromNet' ? 'fromNet' : raw.mode === 'fromGross' ? 'fromGross' : null;
  const v = collect({
    year: parseCount(raw.year, { label: '지급 연도', min: 2000, max: 2100 }),
    amount: parseAmount(raw.amount, { label: mode === 'fromNet' ? '실수령액' : '지급액(세전)' }),
  });
  if (!mode) { v.ok = false; v.errors.mode = '계산 방향을 선택해 주세요.'; }
  if (!v.ok) return fail(v.errors);
  const { year, amount } = v.values;
  const rule = getRule(year, 'freelancer');
  if (!rule.ok) return unavailable(rule.reason, sourceList(['withholdingBiz']));
  const r = rule.value;
  let pay = amount;
  let note = '';
  if (mode === 'fromNet') {
    pay = grossFromNet(amount, r);
    if (pay == null) {
      pay = Math.ceil(amount / (1 - r.incomeRate * (1 + r.localRate)));
      while (withholding(pay, r).net < amount) pay += 1;
      note = `10원 단위 끝수 때문에 실수령액을 정확히 ${won(amount)}으로 맞출 수 없어, 그보다 처음으로 많아지는 지급액을 보여 드립니다.`;
    }
  }
  const w = withholding(pay, r);
  return result({
    meta: `${year}년 · 사업소득 원천징수 3% + 지방소득세 0.3% · ${mode === 'fromNet' ? `실수령액 ${won(amount)} 기준 역산` : `지급액 ${won(amount)}`}`,
    headline: { label: mode === 'fromNet' ? '필요한 지급액 (세전)' : '실수령액', value: won(mode === 'fromNet' ? pay : w.net) },
    stats: [
      { label: '지급액 (세전)', value: won(pay) },
      { label: '원천징수 합계 (3.3%)', value: won(w.income + w.local) },
      { label: '실수령액', value: won(w.net) },
    ],
    rows: [
      { label: '소득세 (3%)', value: `${won(pay)} × 3% → ${won(w.income)} (10원 미만 버림)` },
      { label: '지방소득세 (소득세의 10%)', value: `${won(w.income)} × 10% → ${won(w.local)}` },
      { label: '실수령액', value: `${won(pay)} − ${won(w.income + w.local)} = ${won(w.net)}` },
    ],
    formulas: ['소득세 = 지급액 × 3%', '지방소득세 = 소득세 × 10%', '실수령액 = 지급액 − 소득세 − 지방소득세 (각 10원 미만 버림)'],
    warnings: [
      '3.3%는 지급할 때 미리 떼는 세금(원천징수)입니다. 1년 동안의 실제 세금은 다음 해 5월 종합소득세 신고에서 수입금액·필요경비·공제를 반영해 확정되며, 환급되거나 추가로 낼 수 있습니다.',
      '근로계약을 맺고 지휘·감독을 받으며 일한다면 사업소득이 아니라 근로소득일 수 있습니다.',
      ...(note ? [note] : []),
    ],
    sources: sourceList(r.sources),
  });
}
