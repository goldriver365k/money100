/**
 * 시급 계산 (월급 ↔ 시급, 최저임금 비교).
 *
 * 주휴시간 = 1주 소정근로시간 ÷ 40 × 8 (최대 8시간), 주 15시간 미만이면 0 (근로기준법 제18조 제3항, 제55조)
 * 월 소정근로시간(유급 포함) = (1주 소정근로시간 + 주휴시간) × 365 ÷ 7 ÷ 12 → 소수 첫째 자리에서 반올림
 *   (주 40시간이면 208.57 → 209시간으로, 고용노동부 최저임금 월 환산 기준 209시간과 같다)
 * 시급 = 월급 ÷ 월 소정근로시간 (원 미만 버림), 월급 = 시급 × 월 소정근로시간
 * 최저임금 비교는 단순 비교이며, 최저임금 산입범위(상여금·복리후생비 일부 제외 등)는 반영하지 않는다.
 */
import { getRule, sourceList } from '../rules/index.js';
import { parseAmount, parseDecimal, parseCount, collect, floorWon, won, num, result, fail, unavailable } from './common.js';

export function holidayHours(weekly) {
  if (weekly < 15) return 0;
  return Math.min((weekly / 40) * 8, 8);
}

export function monthlyHours(weekly) {
  const exact = (weekly + holidayHours(weekly)) * 365 / 7 / 12;
  return { exact, hours: Math.round(exact) };
}

export function calculate(raw) {
  const mode = raw.mode === 'hourlyToMonthly' ? 'hourlyToMonthly' : raw.mode === 'monthlyToHourly' ? 'monthlyToHourly' : null;
  const v = collect({
    year: parseCount(raw.year, { label: '기준 연도', min: 2000, max: 2100 }),
    amount: parseAmount(raw.amount, { label: mode === 'hourlyToMonthly' ? '시급' : '월급(세전)' }),
    weeklyHours: parseDecimal(raw.weeklyHours, { label: '1주 소정근로시간', min: 1, max: 40, decimals: 1, unit: '시간' }),
  });
  if (!mode) { v.ok = false; v.errors.mode = '계산 방향을 선택해 주세요.'; }
  if (!v.ok) return fail(v.errors);
  const { year, amount, weeklyHours } = v.values;
  const mw = getRule(year, 'minimumWage');
  if (!mw.ok) return unavailable(mw.reason, sourceList(['minWageAct']));
  const minWage = mw.value.hourly;

  const hol = holidayHours(weeklyHours);
  const mh = monthlyHours(weeklyHours);
  const hourly = mode === 'monthlyToHourly' ? floorWon(amount / mh.hours) : amount;
  const monthly = mode === 'monthlyToHourly' ? amount : amount * mh.hours;
  const minMonthly = minWage * mh.hours;
  const meetsMin = hourly >= minWage;

  const warnings = ['최저임금 비교는 단순 비교입니다. 최저임금에 산입되지 않는 임금(연장·야간·휴일수당, 일부 상여금·복리후생비 등)이 월급에 포함되어 있으면 결과가 달라집니다.'];
  if (weeklyHours < 15) warnings.push('1주 소정근로시간이 15시간 미만이면 주휴수당이 적용되지 않아 주휴시간을 0으로 계산했습니다.');
  if (!meetsMin) warnings.push(`${year}년 최저임금(${won(minWage)})보다 낮습니다. 근로계약서의 임금 항목을 확인하세요.`);

  const primary = mode === 'monthlyToHourly'
    ? { label: '환산 시급', value: won(hourly) }
    : { label: '환산 월급 (주휴 포함)', value: won(monthly) };
  return result({
    meta: `${year}년 기준 · 1주 소정근로 ${num(weeklyHours, 1)}시간 · 월 소정근로시간 ${mh.hours}시간 · ${mode === 'monthlyToHourly' ? `월급 ${won(amount)}` : `시급 ${won(amount)}`}`,
    headline: primary,
    stats: [
      primary,
      { label: `${year}년 최저임금 (시급)`, value: won(minWage) },
      { label: '최저임금 비교', value: meetsMin ? '최저임금 이상' : `최저임금 미달 (시간당 ${won(minWage - hourly)} 부족)` },
    ],
    rows: [
      { label: '주휴시간', value: weeklyHours < 15 ? '0시간 (주 15시간 미만)' : `${num(weeklyHours, 1)} ÷ 40 × 8 = ${num(hol, 2)}시간${hol === 8 ? ' (최대 8시간)' : ''}` },
      { label: '월 소정근로시간 (유급 포함)', value: `(${num(weeklyHours, 1)} + ${num(hol, 2)}) × 365 ÷ 7 ÷ 12 = ${num(mh.exact, 2)} → ${mh.hours}시간` },
      mode === 'monthlyToHourly'
        ? { label: '시급', value: `${won(amount)} ÷ ${mh.hours}시간 = ${won(hourly)} (원 미만 버림)` }
        : { label: '월급', value: `${won(amount)} × ${mh.hours}시간 = ${won(monthly)}` },
      { label: `${year}년 최저임금 월 환산액`, value: `${won(minWage)} × ${mh.hours}시간 = ${won(minMonthly)}` },
    ],
    formulas: [
      '주휴시간 = 1주 소정근로시간 ÷ 40 × 8 (최대 8시간, 주 15시간 미만은 0)',
      '월 소정근로시간 = (1주 소정근로시간 + 주휴시간) × 365 ÷ 7 ÷ 12, 소수 첫째 자리 반올림',
      '시급 = 월급 ÷ 월 소정근로시간 / 월급 = 시급 × 월 소정근로시간',
    ],
    warnings,
    sources: sourceList([...mw.value.sources, 'holidayPay', 'shortHours']),
  });
}
