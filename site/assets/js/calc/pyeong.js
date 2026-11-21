/**
 * 평수 계산 — 1평 = 400/121 ㎡ (≈ 3.305785㎡). 법정 계량 단위는 ㎡.
 * 결과는 소수 둘째 자리까지 반올림해 보여 주고, 계산은 정확한 분수로 한다.
 */
import { STATIC_RULES, sourceList } from '../rules/index.js';
import { parseDecimal, collect, num, result, fail } from './common.js';

export const M2_PER_PYEONG = STATIC_RULES.pyeongM2;
export const toPyeong = (m2) => m2 / M2_PER_PYEONG;
export const toM2 = (p) => p * M2_PER_PYEONG;

export function calculate(raw) {
  const mode = raw.mode === 'toM2' ? 'toM2' : raw.mode === 'toPyeong' ? 'toPyeong' : null;
  const v = collect({ value: parseDecimal(raw.value, { label: mode === 'toM2' ? '평' : '면적(㎡)', min: 0.01, max: 1000000, decimals: 4 }) });
  if (!mode) { v.ok = false; v.errors.mode = '변환 방향을 선택해 주세요.'; }
  if (!v.ok) return fail(v.errors);
  const x = v.values.value;
  const out = mode === 'toPyeong' ? toPyeong(x) : toM2(x);
  const head = mode === 'toPyeong' ? { label: '평', value: `${num(out, 2)}평` } : { label: '제곱미터', value: `${num(out, 2)}㎡` };
  const common = [59, 84, 114].map((m) => `${m}㎡ ≈ ${num(toPyeong(m), 1)}평`).join(' · ');
  return result({
    meta: mode === 'toPyeong' ? `${num(x, 4)}㎡ → 평` : `${num(x, 4)}평 → ㎡`,
    headline: head,
    stats: [
      { label: '제곱미터', value: `${num(mode === 'toPyeong' ? x : out, 2)}㎡` },
      { label: '평', value: `${num(mode === 'toPyeong' ? out : x, 2)}평` },
      { label: '1평', value: '400/121㎡ ≈ 3.3058㎡' },
    ],
    rows: [
      { label: '계산', value: mode === 'toPyeong' ? `${num(x, 4)} ÷ 3.305785 = ${num(out, 4)}평` : `${num(x, 4)} × 3.305785 = ${num(out, 4)}㎡` },
      { label: '자주 쓰는 면적 (전용)', value: common },
    ],
    formulas: ['1평 = 400 ÷ 121 ㎡ ≈ 3.305785㎡', '평 = ㎡ ÷ 3.305785, ㎡ = 평 × 3.305785'],
    warnings: ['아파트 분양 광고의 "평형"은 공급면적(전용 + 주거공용) 기준인 경우가 많습니다. 전용면적과 구분하세요.', '부동산 거래·등기의 법정 단위는 ㎡입니다.'],
    sources: sourceList(['areaUnit']),
  });
}
