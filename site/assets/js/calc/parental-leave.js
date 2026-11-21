/**
 * 육아휴직급여 예상 계산 — 고용보험법 시행령 제95조·제95조의3 (2025년 개편 기준, 2026년 적용).
 *
 * 일반: 1~3개월 통상임금 100%(상한 250만 원), 4~6개월 100%(상한 200만 원), 7개월~ 80%(상한 160만 원), 하한 70만 원
 * 6+6 부모육아휴직제(자녀 생후 18개월 이내 부모 모두 사용): 각자 첫 6개월 100%, 상한 250·250·300·350·400·450만 원, 7개월부터 일반 기준
 * 매달 전액 지급(사후지급금 폐지). 1개월 단위로 계산하며, 한 달 미만 기간의 일할 계산은 하지 않는다.
 * 한부모 특례는 공식 원문 확인 전이라 계산하지 않는다.
 */
import { getRule, sourceList } from '../rules/index.js';
import { parseAmount, parseCount, parseDate, collect, dateFromParts, korDate, floorWon, won, num, result, fail, unavailable } from './common.js';

const PLANS = { general: '일반', sixPlusSix: '6+6 부모육아휴직제', singleParent: '한부모 특례' };

export function monthlyBenefit(k, wage, rule, plan) {
  if (plan === 'sixPlusSix' && k <= 6) {
    const cap = rule.sixPlusSixCaps[k - 1];
    return { amount: Math.max(Math.min(floorWon(wage), cap), rule.floor), rate: 1, cap };
  }
  const seg = rule.general.find((s) => k >= s.from && k <= s.to);
  const amount = Math.max(Math.min(floorWon(wage * seg.rate), seg.cap), rule.floor);
  return { amount, rate: seg.rate, cap: seg.cap };
}

export function calculate(raw) {
  const v = collect({
    startDate: parseDate(raw.startDate, { label: '육아휴직 시작일' }),
    wage: parseAmount(raw.wage, { label: '월 통상임금' }),
    months: parseCount(raw.months, { label: '휴직 기간', min: 1, max: 18, unit: '개월' }),
  });
  if (!PLANS[raw.plan]) { v.ok = false; v.errors.plan = '적용 기준을 선택해 주세요.'; }
  if (v.ok && v.values.months > 12 && raw.extended !== 'yes') { v.ok = false; v.errors.months = '12개월을 넘는 기간은 연장 요건(부모 모두 3개월 이상 사용 등)을 충족한 경우에만 선택할 수 있습니다.'; }
  if (!v.ok) return fail(v.errors);
  const { startDate, wage, months } = v.values;
  const year = startDate.y;
  const rule = getRule(year, 'parentalLeave');
  if (!rule.ok) return unavailable(rule.reason, sourceList(['plAct']));
  if (raw.plan === 'singleParent' && !rule.value.singleParent) {
    return unavailable('한부모 근로자 육아휴직 급여 특례의 2026년 상한액은 공식 원문으로 확인하기 전이라 계산하지 않습니다. 고용24 또는 고용노동부 고객상담센터(1350)에서 확인하세요.', sourceList(['plAct']));
  }

  const rows = [];
  let total = 0;
  for (let k = 1; k <= months; k += 1) {
    const b = monthlyBenefit(k, wage, rule.value, raw.plan);
    const from = dateFromParts(startDate.y, startDate.m + k - 1, startDate.d);
    total += b.amount;
    rows.push([`${k}개월째`, `${from.y}.${String(from.m).padStart(2, '0')}~`, `${num(b.rate * 100)}% · 상한 ${num(b.cap / 10000)}만 원`, won(b.amount)]);
  }
  const first = monthlyBenefit(1, wage, rule.value, raw.plan).amount;

  const warnings = [
    '고용보험 피보험단위기간 180일 이상, 30일 이상 휴직 등 수급 요건은 고용센터가 확인합니다.',
    '한 달을 채우지 못한 기간은 일할 계산되며, 휴직 중 회사에서 받은 금품이 있으면 감액될 수 있습니다.',
    '6+6 부모육아휴직제는 자녀 생후 18개월 안에 부모가 모두 육아휴직을 사용해야 하며, 상한은 두 번째 사용자의 사용 개월 수에 따라 정해집니다.',
  ];
  if (wage * 0.8 < rule.value.floor || wage < rule.value.floor) warnings.push(`하한액 ${won(rule.value.floor)}을 적용한 달이 있습니다.`);

  return result({
    meta: `${korDate(startDate)} 시작 · ${months}개월 · 월 통상임금 ${won(wage)} · ${PLANS[raw.plan]} · ${year}년 기준`,
    headline: { label: '총 예상 육아휴직급여', value: won(total) },
    stats: [
      { label: '첫 달 예상 급여', value: won(first) },
      { label: '월 평균', value: won(floorWon(total / months)) },
      { label: '총 예상 급여', value: won(total) },
    ],
    table: { head: ['기간', '시작 월', '지급 기준', '예상 급여'], rows, foot: ['합계', '', '', won(total)] },
    formulas: raw.plan === 'sixPlusSix'
      ? ['1~6개월: 통상임금 100%, 월 상한 250·250·300·350·400·450만 원', '7개월~: 통상임금 80%, 상한 160만 원', `하한 ${won(rule.value.floor)}`]
      : ['1~3개월: 통상임금 100% (상한 250만 원)', '4~6개월: 통상임금 100% (상한 200만 원)', '7개월~: 통상임금 80% (상한 160만 원)', `하한 ${won(rule.value.floor)}`],
    warnings,
    sources: sourceList(rule.value.sources),
  });
}
