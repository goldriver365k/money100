/**
 * 퇴직금 계산 (근로자퇴직급여 보장법 제8조, 근로기준법 제2조).
 *
 * 퇴직금 = 1일 평균임금 × 30일 × (재직일수 ÷ 365)
 * 1일 평균임금 = (퇴직 전 3개월 임금총액 + 연간 상여금 × 3/12 + 연차수당 × 3/12) ÷ 퇴직 전 3개월 달력일수
 * 평균임금이 1일 통상임금보다 적으면 통상임금을 평균임금으로 본다.
 *
 * - 퇴직일 = 마지막 근무일의 다음 날. 재직일수 = 입사일 ~ 마지막 근무일 (양 끝 포함)
 * - 퇴직 전 3개월 = 퇴직일의 3개월 전 같은 날 ~ 마지막 근무일
 * - 계속근로기간 1년 미만, 4주 평균 주 15시간 미만이면 퇴직금 지급 대상이 아니다.
 * - 산식의 나눗셈은 정수 분수로 계산해 마지막에 한 번만 원 미만을 버린다.
 * - 육아휴직·산재 휴업 등 평균임금 산정 제외기간(근로기준법 시행령 제2조)은 자동 반영하지 않는다.
 */
import { sourceList } from '../rules/index.js';
import { parseAmount, parseDate, collect, dateFromParts, addDays, DAY_MS, korDate, won, num, result, fail } from './common.js';

const SOURCES = ['severanceAct', 'severanceScope', 'avgWage', 'avgWageDecree', 'moelSeverance'];

export function calculate(raw) {
  const v = collect({
    startDate: parseDate(raw.startDate, { label: '입사일' }),
    lastDate: parseDate(raw.lastDate, { label: '마지막 근무일' }),
    wages3m: parseAmount(raw.wages3m, { label: '퇴직 전 3개월 임금총액' }),
    bonus: parseAmount(raw.bonus, { label: '연간 상여금', required: false, allowZero: true }),
    leavePay: parseAmount(raw.leavePay, { label: '연차수당', required: false, allowZero: true }),
    ordinaryDaily: parseAmount(raw.ordinaryDaily, { label: '1일 통상임금', required: false, allowZero: true }),
  });
  if (raw.hours15 !== 'yes' && raw.hours15 !== 'no') { v.ok = false; v.errors.hours15 = '주 15시간 이상 근무 여부를 선택해 주세요.'; }
  if (v.ok && v.values.lastDate.t < v.values.startDate.t) { v.ok = false; v.errors.lastDate = '마지막 근무일은 입사일과 같거나 뒤여야 합니다.'; }
  if (!v.ok) return fail(v.errors);
  const { startDate, lastDate, wages3m, bonus, leavePay, ordinaryDaily } = v.values;

  const retireDate = addDays(lastDate, 1);
  const tenureDays = Math.round((retireDate.t - startDate.t) / DAY_MS);
  const oneYear = dateFromParts(startDate.y + 1, startDate.m, startDate.d);
  const eligibleTenure = retireDate.t >= oneYear.t;

  const from3m = dateFromParts(retireDate.y, retireDate.m - 3, retireDate.d);
  const periodStart = from3m.t < startDate.t ? startDate : from3m;
  const days3m = Math.round((retireDate.t - periodStart.t) / DAY_MS);

  const meta = `입사 ${korDate(startDate)} · 마지막 근무 ${korDate(lastDate)} (퇴직일 ${korDate(retireDate)}) · 재직 ${num(tenureDays)}일`;
  const base = { meta, sources: sourceList(SOURCES) };

  if (raw.hours15 === 'no') {
    return result({ ...base, headline: { label: '예상 퇴직금', value: '지급 대상 아님' },
      stats: [{ label: '예상 퇴직금', value: '0원' }, { label: '재직일수', value: `${num(tenureDays)}일` }],
      rows: [{ label: '판단', value: '4주 평균 1주 소정근로시간이 15시간 미만이면 퇴직금 제도가 적용되지 않습니다 (근로자퇴직급여 보장법 제4조).' }],
      formulas: [], warnings: ['근무시간이 주마다 달랐다면 4주 단위 평균으로 다시 확인하세요.'] });
  }
  if (!eligibleTenure) {
    return result({ ...base, headline: { label: '예상 퇴직금', value: '지급 대상 아님' },
      stats: [{ label: '예상 퇴직금', value: '0원' }, { label: '재직일수', value: `${num(tenureDays)}일` }, { label: '1년이 되는 퇴직일', value: korDate(oneYear) }],
      rows: [{ label: '판단', value: `계속근로기간이 1년 미만입니다. 마지막 근무일이 ${korDate(addDays(oneYear, -1))} 이후여야 퇴직금 대상이 됩니다.` }],
      formulas: [], warnings: ['회사 규정으로 1년 미만 근로자에게도 퇴직금을 주는 경우가 있으니 취업규칙을 확인하세요.'] });
  }

  // 정수 분수: 3개월 임금 총액(상여·연차 3/12 반영) × 12 를 분자로 써서 소수 없이 계산
  const total12 = BigInt(wages3m) * 12n + BigInt(bonus) * 3n + BigInt(leavePay) * 3n; // = 3개월 임금총액 × 12
  const avgIsLower = ordinaryDaily > 0 && total12 < BigInt(ordinaryDaily) * 12n * BigInt(days3m);
  let severance;
  let dailyShown;
  if (avgIsLower) {
    severance = (BigInt(ordinaryDaily) * 30n * BigInt(tenureDays)) / 365n;
    dailyShown = ordinaryDaily;
  } else {
    severance = (total12 * 30n * BigInt(tenureDays)) / (12n * BigInt(days3m) * 365n);
    dailyShown = Number(total12) / 12 / days3m;
  }
  const avgDaily = Number(total12) / 12 / days3m;
  const total3m = Number(total12) / 12;

  const warnings = [
    '육아휴직, 출산전후휴가, 업무상 부상·질병 휴업, 수습기간 등 평균임금 산정에서 빼야 하는 기간이 3개월 안에 있으면 결과가 달라집니다.',
    '퇴직소득세는 반영하지 않은 세전 금액입니다. 퇴직연금(DB·DC)에 가입했다면 지급액 산정 방식이 다를 수 있습니다.',
  ];
  if (periodStart === startDate) warnings.push('재직기간이 3개월보다 짧은 구간이 있어 입사일부터 계산했습니다.');

  return result({
    ...base,
    headline: { label: '예상 퇴직금 (세전)', value: won(Number(severance)) },
    stats: [
      { label: '예상 퇴직금 (세전)', value: won(Number(severance)) },
      { label: '1일 평균임금', value: `${num(dailyShown, 2)}원${avgIsLower ? ' (통상임금 적용)' : ''}` },
      { label: '재직일수', value: `${num(tenureDays)}일` },
    ],
    rows: [
      { label: '평균임금 산정기간', value: `${korDate(periodStart)} ~ ${korDate(lastDate)} (${days3m}일)` },
      { label: '3개월 임금총액', value: won(wages3m) },
      { label: '상여금 가산 (연간 × 3/12)', value: `${won(bonus)} × 3/12 = ${num(bonus * 3 / 12, 2)}원` },
      { label: '연차수당 가산 (× 3/12)', value: `${won(leavePay)} × 3/12 = ${num(leavePay * 3 / 12, 2)}원` },
      { label: '평균임금 계산 총액', value: `${num(total3m, 2)}원` },
      { label: '1일 평균임금', value: `${num(total3m, 2)} ÷ ${days3m}일 = ${num(avgDaily, 2)}원` },
      { label: '1일 통상임금 비교', value: ordinaryDaily > 0 ? `${won(ordinaryDaily)} → ${avgIsLower ? '평균임금보다 커서 통상임금 적용' : '평균임금이 더 커서 평균임금 적용'}` : '입력 안 함' },
      { label: '퇴직금', value: `${num(dailyShown, 2)}원 × 30일 × ${num(tenureDays)} ÷ 365 = ${won(Number(severance))}` },
    ],
    formulas: [
      '퇴직금 = 1일 평균임금 × 30일 × 재직일수 ÷ 365',
      '1일 평균임금 = (3개월 임금총액 + 연간 상여금 × 3/12 + 연차수당 × 3/12) ÷ 3개월 달력일수',
      '1일 평균임금이 1일 통상임금보다 적으면 통상임금을 적용 (근로기준법 제2조 제2항)',
      '원 미만은 마지막에 한 번 버립니다.',
    ],
    warnings,
  });
}
