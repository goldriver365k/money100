/**
 * 부가세 계산 (일반과세자, 세율 10%).
 * - 공급가액 → 부가세 = 공급가액 × 10% (원 미만 버림), 합계 = 공급가액 + 부가세
 * - 합계(부가세 포함) → 공급가액 = 합계 ÷ 1.1 (원 단위 반올림), 부가세 = 합계 − 공급가액
 * 세금계산서의 끝수 처리는 거래 당사자 관행에 따라 다를 수 있다. 간이과세자 납부세액(업종별 부가가치율)은 계산하지 않는다.
 */
import { getRule, sourceList } from '../rules/index.js';
import { parseAmount, parseCount, collect, won, num, result, fail, unavailable } from './common.js';

export function calculate(raw) {
  const mode = raw.mode === 'fromTotal' ? 'fromTotal' : raw.mode === 'fromSupply' ? 'fromSupply' : null;
  const v = collect({
    year: parseCount(raw.year, { label: '기준 연도', min: 2000, max: 2100 }),
    amount: parseAmount(raw.amount, { label: mode === 'fromTotal' ? '합계 금액(부가세 포함)' : '공급가액' }),
  });
  if (!mode) { v.ok = false; v.errors.mode = '계산 방향을 선택해 주세요.'; }
  if (!v.ok) return fail(v.errors);
  const { year, amount } = v.values;
  const rule = getRule(year, 'vat');
  if (!rule.ok) return unavailable(rule.reason, sourceList(['vatAct']));
  const rate = rule.value.rate;
  const pctText = `${num(rate * 100, 2)}%`;

  let supply; let vat; let total;
  if (mode === 'fromSupply') {
    supply = amount;
    vat = Math.floor(supply * rate + 1e-9);
    total = supply + vat;
  } else {
    total = amount;
    supply = Math.round(total / (1 + rate));
    vat = total - supply;
  }
  return result({
    meta: `${year}년 기준 · 일반과세자 부가세율 ${pctText} · ${mode === 'fromSupply' ? `공급가액 ${won(amount)} 입력` : `합계 ${won(amount)} 입력`}`,
    headline: { label: mode === 'fromSupply' ? '합계 금액 (부가세 포함)' : '공급가액', value: won(mode === 'fromSupply' ? total : supply) },
    stats: [
      { label: '공급가액', value: won(supply) },
      { label: '부가세', value: won(vat) },
      { label: '합계 금액', value: won(total) },
    ],
    rows: mode === 'fromSupply'
      ? [{ label: '부가세', value: `${won(supply)} × ${pctText} = ${num(supply * rate, 1)}원 → ${won(vat)} (원 미만 버림)` }, { label: '합계', value: `${won(supply)} + ${won(vat)} = ${won(total)}` }]
      : [{ label: '공급가액', value: `${won(total)} ÷ ${num(1 + rate, 2)} = ${num(total / (1 + rate), 2)}원 → ${won(supply)} (원 단위 반올림)` }, { label: '부가세', value: `${won(total)} − ${won(supply)} = ${won(vat)}` }],
    formulas: [
      `부가세 = 공급가액 × ${pctText}`,
      `공급가액 = 합계 ÷ ${num(1 + rate, 2)}, 부가세 = 합계 − 공급가액`,
    ],
    warnings: [
      '일반과세자 기준입니다. 간이과세자는 업종별 부가가치율을 곱해 납부세액을 계산하므로 이 결과와 다릅니다.',
      '면세 품목(기초 농수산물, 의료·교육 용역 등)과 영세율 거래는 부가세가 없거나 0%입니다.',
      '세금계산서의 원 미만 끝수 처리는 거래 관행에 따라 1원 차이가 날 수 있습니다.',
    ],
    sources: sourceList(rule.value.sources),
  });
}
