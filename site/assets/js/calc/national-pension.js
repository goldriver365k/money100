/**
 * 국민연금 보험료 계산 — 국민연금법 제88조, 기준소득월액 상·하한(매년 7월 조정).
 * 기준소득월액 = 월 소득(천원 미만 버림)을 상·하한 안으로 맞춘 값
 * 사업장가입자: 기준소득월액 × 9.5% ÷ 2 씩 근로자·사업주 부담 / 지역·임의가입자: 9.5% 전액 본인 부담
 * 10원 미만 버림.
 */
import { getRule, getPensionLimit, sourceList } from '../rules/index.js';
import { parseAmount, parseCount, collect, floor10, won, pct, result, fail, unavailable } from './common.js';

export function calculate(raw) {
  const type = { workplace: '사업장가입자', regional: '지역가입자', voluntary: '임의(계속)가입자' }[raw.type];
  const v = collect({
    year: parseCount(raw.year, { label: '기준 연도', min: 2000, max: 2100 }),
    month: parseCount(raw.month, { label: '기준 월', min: 1, max: 12, unit: '월' }),
    income: parseAmount(raw.income, { label: '월 소득(신고 소득월액)' }),
  });
  if (!type) { v.ok = false; v.errors.type = '가입자 유형을 선택해 주세요.'; }
  if (!v.ok) return fail(v.errors);
  const { year, month, income } = v.values;
  const p = getRule(year, 'pension');
  const lim = getPensionLimit(year, month);
  for (const x of [p, lim]) if (!x.ok) return unavailable(x.reason, sourceList(['pensionAct']));
  const rate = p.value.rate;
  const rawBase = Math.floor(income / 1000) * 1000;
  const base = Math.min(Math.max(rawBase, lim.value.min), lim.value.max);
  const workplace = raw.type === 'workplace';
  const total = floor10(base * rate);
  const mine = workplace ? floor10(base * rate / 2) : total;
  const employer = workplace ? mine : 0;
  const warnings = [];
  if (rawBase !== base) warnings.push(`기준소득월액 ${rawBase < lim.value.min ? '하한' : '상한'} ${won(base)}을 적용했습니다.`);
  warnings.push('연금보험료율은 2026년 9.5%에서 매년 0.5%p씩 올라 2033년 13%가 됩니다 (2025년 국민연금법 개정).');
  if (!workplace) warnings.push('지역가입자는 저소득 지역가입자 보험료 지원 등으로 실제 부담액이 줄어들 수 있습니다.');

  return result({
    meta: `${year}년 ${month}월 · ${type} · 월 소득 ${won(income)}`,
    headline: { label: '월 국민연금 (본인 부담)', value: won(mine) },
    stats: [
      { label: '본인 부담', value: won(mine) },
      { label: '사업주 부담', value: won(employer) },
      { label: '월 보험료 합계', value: won(mine + employer) },
    ],
    rows: [
      { label: '기준소득월액', value: `${won(rawBase)} → 상·하한(${won(lim.value.min)}~${won(lim.value.max)}) 적용 ${won(base)}` },
      { label: '보험료율', value: `${pct(rate, 2)}${workplace ? ` (근로자·사업주 각 ${pct(rate / 2, 3)})` : ' (전액 본인)'}` },
      { label: '본인 부담', value: `${won(base)} × ${pct(workplace ? rate / 2 : rate, 3)} = ${won(mine)}` },
      { label: '연간 본인 부담 (같은 소득 가정)', value: won(mine * 12) },
    ],
    formulas: ['기준소득월액 = 월 소득(천원 미만 버림), 상·하한 안으로 조정', `보험료 = 기준소득월액 × ${pct(rate, 2)} (사업장가입자는 절반씩)`],
    warnings,
    sources: sourceList([...p.value.sources, lim.value.source, 'pensionRegional', 'roundingAct']),
  });
}
