/**
 * '통상시급' 자동 계산 도우미 (연차수당 계산기용, 화면과 분리된 계산 로직).
 *
 * 통상시급 = 월 통상임금 ÷ 월 통상임금 산정 기준시간 (근로기준법 시행령 제6조 제2항)
 *   월 통상임금 = 기본급 + 매달 고정으로 주는 수당 + 정기 상여금(연간) ÷ 12
 *     — 연장·야간·휴일수당, 실적에 따라 달라지는 성과급은 넣지 않는다.
 *     — 정기 상여금: 대법원 2024. 12. 19. 전원합의체 판결로 재직 조건이 붙은 정기 상여금도 통상임금에 해당.
 *   기준시간 = (1주 소정근로시간 + 주휴시간) × 365 ÷ 7 ÷ 12, 반올림 (주 40시간 → 209시간) — 시급 계산기와 같은 함수
 * 원 미만 버림.
 */
import { parseAmount, parseDecimal, collect, floorWon, won, num } from './common.js';
import { monthlyHours, holidayHours } from './hourly.js';

export function computeOrdinaryHourly(raw) {
  const v = collect({
    base: parseAmount(raw.base, { label: '기본급' }),
    fixed: parseAmount(raw.fixed, { label: '고정 수당', required: false, allowZero: true }),
    bonus: parseAmount(raw.bonus, { label: '정기 상여금', required: false, allowZero: true }),
    weeklyHours: parseDecimal(raw.weeklyHours, { label: '1주 소정근로시간', min: 1, max: 40, decimals: 1, unit: '시간' }),
  });
  if (!v.ok) return { ok: false, errors: v.errors };
  const { base, fixed, bonus, weeklyHours } = v.values;
  const bonusMonthly = floorWon(bonus / 12);
  const monthly = base + fixed + bonusMonthly;
  const mh = monthlyHours(weeklyHours);
  const hol = holidayHours(weeklyHours);
  const hourly = floorWon(monthly / mh.hours);
  return {
    ok: true, hourly, monthly, hours: mh.hours,
    rows: [
      { label: '월 통상임금', value: `${won(base)}${fixed ? ` + 고정 수당 ${won(fixed)}` : ''}${bonus ? ` + 상여금 ${won(bonus)} ÷ 12 (${won(bonusMonthly)})` : ''} = ${won(monthly)}` },
      { label: '월 기준시간', value: `(주 ${num(weeklyHours, 1)}시간 + 주휴 ${num(hol, 2)}시간) × 365 ÷ 7 ÷ 12 = ${num(mh.exact, 2)} → ${mh.hours}시간` },
      { label: '통상시급', value: `${won(monthly)} ÷ ${mh.hours}시간 = ${won(hourly)} (원 미만 버림)` },
    ],
  };
}
