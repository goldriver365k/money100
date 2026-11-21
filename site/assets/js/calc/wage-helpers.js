/**
 * 입력 도우미용 계산 (화면과 분리 — 단위 테스트 대상). 계산기 본래 공식은 바꾸지 않고 입력값만 구한다.
 *
 * computeWages3m      퇴직 전·이직 전 3개월 임금총액 = 월급 × 3 또는 3개월 각각의 합
 * computeOrdinary     월 통상임금 = 기본급 + 고정 수당 + 정기 상여금 ÷ 12
 *                     → output 'monthly' 그대로 / 'hourly' ÷ 월 기준시간 / 'daily' 통상시급 × 1일 소정근로시간
 *                     (근로기준법 시행령 제6조, 월 기준시간은 시급 계산기와 같은 함수)
 * computeAnnualInsurance  총급여(연간, 비과세 제외)를 12달 같은 금액으로 받았다고 보고 4대보험 근로자 부담 연간 합계
 *                     (4대보험 계산기와 같은 monthlyInsurance — 국민연금 7월 상·하한 변경 반영)
 * computeLoanAnnual   기존 대출의 앞으로 1년(남은 기간이 더 짧으면 그 기간) 실제 원리금 상환액 (대출이자 계산기와 같은 상환표)
 * 원 미만 버림.
 */
import { parseAmount, parseDecimal, parseCount, collect, floorWon, won, num } from './common.js';
import { monthlyHours, holidayHours } from './hourly.js';
import { monthlyInsurance } from './social-insurance.js';
import { schedule, METHOD_LABELS } from './loan.js';

export function computeWages3m(raw) {
  if (raw.mode === 'each') {
    const v = collect({
      m1: parseAmount(raw.m1, { label: '1개월 전 임금' }),
      m2: parseAmount(raw.m2, { label: '2개월 전 임금' }),
      m3: parseAmount(raw.m3, { label: '3개월 전 임금' }),
    });
    if (!v.ok) return { ok: false, errors: v.errors };
    const { m1, m2, m3 } = v.values;
    const total = m1 + m2 + m3;
    return { ok: true, value: total, rows: [{ label: '3개월 임금총액', value: `${won(m1)} + ${won(m2)} + ${won(m3)} = ${won(total)}` }] };
  }
  if (raw.mode !== 'same') return { ok: false, errors: { mode: '계산 방식을 선택해 주세요.' } };
  const v = collect({ monthly: parseAmount(raw.monthly, { label: '월 임금' }) });
  if (!v.ok) return { ok: false, errors: v.errors };
  const total = v.values.monthly * 3;
  return { ok: true, value: total, rows: [{ label: '3개월 임금총액', value: `${won(v.values.monthly)} × 3 = ${won(total)}` }] };
}

export function computeOrdinary(raw) {
  const output = ['monthly', 'hourly', 'daily'].includes(raw.output) ? raw.output : 'hourly';
  const checks = {
    base: parseAmount(raw.base, { label: '기본급' }),
    fixed: parseAmount(raw.fixed, { label: '고정 수당', required: false, allowZero: true }),
    bonus: parseAmount(raw.bonus, { label: '정기 상여금', required: false, allowZero: true }),
  };
  if (output !== 'monthly') checks.weeklyHours = parseDecimal(raw.weeklyHours, { label: '1주 소정근로시간', min: 1, max: 40, decimals: 1, unit: '시간' });
  if (output === 'daily') checks.dailyHours = parseDecimal(raw.dailyHours, { label: '1일 소정근로시간', min: 1, max: 8, decimals: 1, unit: '시간' });
  const v = collect(checks);
  if (!v.ok) return { ok: false, errors: v.errors };
  const { base, fixed, bonus } = v.values;
  const bonusMonthly = floorWon(bonus / 12);
  const monthly = base + fixed + bonusMonthly;
  const rows = [{ label: '월 통상임금', value: `${won(base)}${fixed ? ` + 고정 수당 ${won(fixed)}` : ''}${bonus ? ` + 상여금 ${won(bonus)} ÷ 12 (${won(bonusMonthly)})` : ''} = ${won(monthly)}` }];
  if (output === 'monthly') return { ok: true, value: monthly, monthly, rows };
  const mh = monthlyHours(v.values.weeklyHours);
  const hourly = floorWon(monthly / mh.hours);
  rows.push({ label: '월 기준시간', value: `(주 ${num(v.values.weeklyHours, 1)}시간 + 주휴 ${num(holidayHours(v.values.weeklyHours), 2)}시간) × 365 ÷ 7 ÷ 12 = ${num(mh.exact, 2)} → ${mh.hours}시간` });
  rows.push({ label: '통상시급', value: `${won(monthly)} ÷ ${mh.hours}시간 = ${won(hourly)} (원 미만 버림)` });
  if (output === 'hourly') return { ok: true, value: hourly, monthly, hourly, hours: mh.hours, rows };
  const daily = floorWon(hourly * v.values.dailyHours);
  rows.push({ label: '1일 통상임금', value: `${won(hourly)} × ${num(v.values.dailyHours, 1)}시간 = ${won(daily)}` });
  return { ok: true, value: daily, monthly, hourly, daily, hours: mh.hours, rows };
}

export function computeAnnualInsurance(raw) {
  const v = collect({
    year: parseCount(raw.year, { label: '귀속 연도', min: 2000, max: 2100 }),
    totalPay: parseAmount(raw.totalPay, { label: '총급여' }),
  });
  if (!v.ok) return { ok: false, errors: v.errors };
  const { year, totalPay } = v.values;
  const monthly = floorWon(totalPay / 12);
  let pension = 0; let other = 0;
  for (let m = 1; m <= 12; m += 1) {
    const r = monthlyInsurance(year, m, monthly);
    if (!r.ok) return { ok: false, errors: { totalPay: r.reason } };
    pension += r.value.employee.pension;
    other += r.value.employee.health + r.value.employee.ltc + r.value.employee.employment;
  }
  return {
    ok: true, value: pension + other, pension, other, total: pension + other,
    rows: [
      { label: '월 과세 보수 (총급여 ÷ 12)', value: won(monthly) },
      { label: '국민연금 (근로자, 연간)', value: won(pension) },
      { label: '건강·장기요양·고용보험 (근로자, 연간)', value: won(other) },
      { label: '합계', value: won(pension + other) },
    ],
  };
}

export function computeLoanAnnual(raw) {
  const v = collect({
    balance: parseAmount(raw.balance, { label: '대출 잔액' }),
    rate: parseDecimal(raw.rate, { label: '연 이자율', min: 0, max: 30, allowZero: true, decimals: 3, unit: '%' }),
    months: parseCount(raw.months, { label: '남은 기간', min: 1, max: 600, unit: '개월' }),
  });
  if (!['equalPayment', 'equalPrincipal'].includes(raw.method)) { v.ok = false; v.errors.method = '상환 방식을 선택해 주세요.'; }
  if (v.ok && raw.method === 'equalPrincipal' && v.values.balance < v.values.months) { v.ok = false; v.errors.balance = '원금균등 상환은 잔액이 개월 수보다 커야 합니다.'; }
  if (!v.ok) return { ok: false, errors: v.errors };
  const { balance, rate, months } = v.values;
  const s = schedule(balance, rate, months, raw.method);
  const n = Math.min(12, months);
  const annual = s.rows.slice(0, n).reduce((a, x) => a + x.payment, 0);
  return {
    ok: true, value: annual,
    rows: [
      { label: '상환 방식', value: `${METHOD_LABELS[raw.method]} · 잔액 ${won(balance)} · 연 ${num(rate, 3)}% · ${months}개월` },
      { label: `앞으로 ${n}개월 원리금`, value: won(annual) },
    ],
  };
}
