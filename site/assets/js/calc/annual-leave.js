/**
 * 연차수당 계산 — 근로기준법 제60조, 시행령 제9조·별표 2.
 *
 * 발생 연차 (입사일 기준)
 *  - 근속 1년 미만: 1개월 개근마다 1일 (최대 11일)
 *  - 근속 1년 이상(직전 1년 출근율 80% 이상): 15일 + 3년차부터 2년마다 1일 (최대 25일)
 *    1년이 되는 날(입사 1주년)에도 재직해야 그해 연차가 발생한다 (고용노동부 행정해석).
 * 1일 연차 시간 = 1일 소정근로시간. 단시간근로자(주 40시간 미만)는 연차일수 × 8시간 × (주 소정근로시간 ÷ 40)
 * 연차수당 = 미사용 연차 시간 × 통상시급 (원 미만 버림)
 * 상시 5명 미만 사업장, 4주 평균 주 15시간 미만 근로자는 연차 규정이 적용되지 않는다.
 */
import { sourceList } from '../rules/index.js';
import { parseAmount, parseDecimal, parseDate, collect, dateFromParts, korDate, floorWon, won, num, result, fail } from './common.js';

const SOURCES = ['leaveAct', 'leaveScope', 'leaveShort', 'shortHours', 'ordinaryWage'];

/** 기준일(재직일) 현재 완성된 근속 연수와 개월 수 */
export function tenure(start, base) {
  let years = 0;
  while (dateFromParts(start.y + years + 1, start.m, start.d).t <= base.t) years += 1;
  let months = 0;
  while (months < 12 && dateFromParts(start.y, start.m + months + 1, start.d).t <= base.t) months += 1;
  return { years, months };
}

export function entitlement(years, months) {
  if (years === 0) return { days: Math.min(months, 11), kind: 'monthly' };
  return { days: Math.min(15 + Math.floor((years - 1) / 2), 25), kind: 'annual' };
}

export function calculate(raw) {
  const v = collect({
    startDate: parseDate(raw.startDate, { label: '입사일' }),
    baseDate: parseDate(raw.baseDate, { label: '계산 기준일(마지막 근무일)' }),
    weeklyHours: parseDecimal(raw.weeklyHours, { label: '1주 소정근로시간', min: 1, max: 40, decimals: 1, unit: '시간' }),
    dailyHours: parseDecimal(raw.dailyHours, { label: '1일 소정근로시간', min: 1, max: 8, decimals: 1, unit: '시간' }),
    hourly: parseAmount(raw.hourly, { label: '통상시급' }),
    used: parseDecimal(raw.used, { label: '사용한 연차', required: false, min: 0, max: 25, allowZero: true, decimals: 1, unit: '일' }),
  });
  if (raw.size5 !== 'yes' && raw.size5 !== 'no') { v.ok = false; v.errors.size5 = '상시 근로자 5명 이상 여부를 선택해 주세요.'; }
  if (raw.attendance !== 'yes' && raw.attendance !== 'no') { v.ok = false; v.errors.attendance = '출근율 80% 이상 여부를 선택해 주세요.'; }
  if (v.ok && v.values.baseDate.t < v.values.startDate.t) { v.ok = false; v.errors.baseDate = '기준일은 입사일과 같거나 뒤여야 합니다.'; }
  if (!v.ok) return fail(v.errors);
  const { startDate, baseDate, weeklyHours, dailyHours, hourly } = v.values;
  const used = v.values.used ?? 0;
  const meta = `입사 ${korDate(startDate)} · 기준일 ${korDate(baseDate)} · 주 ${num(weeklyHours, 1)}시간 · 통상시급 ${won(hourly)}`;
  const base = { meta, sources: sourceList(SOURCES) };

  const blocked = raw.size5 === 'no' ? '상시 근로자 5명 미만 사업장에는 연차 유급휴가 규정이 적용되지 않습니다 (근로기준법 시행령 별표 1).'
    : weeklyHours < 15 ? '4주 평균 1주 소정근로시간이 15시간 미만이면 연차 유급휴가가 적용되지 않습니다 (근로기준법 제18조 제3항).' : null;
  if (blocked) {
    return result({ ...base, headline: { label: '예상 연차수당', value: '적용 대상 아님' },
      stats: [{ label: '발생 연차', value: '0일' }, { label: '예상 연차수당', value: '0원' }],
      rows: [{ label: '판단', value: blocked }], formulas: [], warnings: ['회사 취업규칙으로 연차를 별도로 주는 경우에는 그 기준을 따릅니다.'] });
  }

  const t = tenure(startDate, baseDate);
  const ent = entitlement(t.years, t.months);
  if (ent.kind === 'annual' && raw.attendance === 'no') {
    return result({ ...base, headline: { label: '예상 연차수당', value: '추가 정보 필요' },
      stats: [{ label: '근속', value: `${t.years}년` }],
      rows: [{ label: '판단', value: '직전 1년 출근율이 80% 미만이면 15일 대신 1개월 개근마다 1일이 발생합니다 (근로기준법 제60조 제2항). 개근한 달 수를 회사 기록으로 확인하세요.' }],
      formulas: [], warnings: ['출근율 계산에서 업무상 재해·출산휴가·육아휴직 기간은 출근한 것으로 봅니다.'] });
  }
  if (used > ent.days) return fail({ used: `사용한 연차(${num(used, 1)}일)가 발생 연차(${ent.days}일)보다 많습니다.` });

  const short = weeklyHours < 40;
  const hoursPerDay = short ? 8 * (weeklyHours / 40) : dailyHours;
  const unused = ent.days - used;
  const unusedHours = unused * hoursPerDay;
  const pay = floorWon(unusedHours * hourly);
  const lastAnniv = dateFromParts(startDate.y + t.years, startDate.m, startDate.d);

  const warnings = [
    '회사가 회계연도(1월 1일) 기준으로 연차를 운영하면 발생일수가 다를 수 있습니다. 퇴사 시에는 입사일 기준으로 다시 정산하는 것이 원칙입니다.',
    '회사가 법정 연차 사용촉진(근로기준법 제61조)을 했다면 미사용 연차수당 지급 의무가 없을 수 있습니다.',
    '이전 연차 기간의 미사용분, 1년 미만 기간의 월 단위 연차는 따로 확인하세요.',
  ];
  if (ent.kind === 'monthly') warnings.unshift('근속 1년 미만은 매월 개근을 가정했습니다. 결근한 달은 연차가 생기지 않습니다.');

  return result({
    ...base,
    headline: { label: '예상 연차수당', value: won(pay) },
    stats: [
      { label: '발생 연차', value: `${ent.days}일` },
      { label: '미사용 연차', value: `${num(unused, 1)}일 (${num(unusedHours, 2)}시간)` },
      { label: '예상 연차수당', value: won(pay) },
    ],
    rows: [
      { label: '근속', value: `${t.years}년${t.years === 0 ? ` ${t.months}개월` : ''} (기준일 재직 기준)` },
      { label: '발생 기준', value: ent.kind === 'monthly' ? `1년 미만: 개근 ${t.months}개월 → ${ent.days}일 (최대 11일)` : `${korDate(lastAnniv)} 발생: 15일 + 가산 ${ent.days - 15}일 = ${ent.days}일 (최대 25일)` },
      { label: '사용 연차', value: `${num(used, 1)}일` },
      { label: '1일 연차 시간', value: short ? `8시간 × 주 ${num(weeklyHours, 1)}시간 ÷ 40 = ${num(hoursPerDay, 2)}시간 (단시간근로자)` : `${num(dailyHours, 1)}시간` },
      { label: '연차수당', value: `${num(unusedHours, 2)}시간 × ${won(hourly)} = ${won(pay)}` },
    ],
    formulas: [
      '1년 미만: 1개월 개근마다 1일(최대 11일) / 1년 이상: 15일 + (근속연수 − 1) ÷ 2 일(최대 25일)',
      '단시간근로자 1일 연차 시간 = 8시간 × 주 소정근로시간 ÷ 40',
      '연차수당 = 미사용 연차 시간 × 통상시급 (원 미만 버림)',
    ],
    warnings,
  });
}
