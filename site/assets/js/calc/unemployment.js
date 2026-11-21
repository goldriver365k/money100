/**
 * 실업급여(구직급여) 예상 계산 — 고용보험법 제45조·제46조·제50조.
 *
 * 기초일액 = 이직 전 3개월 임금총액 ÷ 그 기간 달력일수
 * 구직급여일액 = 기초일액 × 60%, 상한 68,100원(2026), 하한 = 최저임금 × 80% × 1일 소정근로시간(최대 8시간)
 * 소정급여일수 = 이직일 나이(50세 이상·장애인 여부)와 고용보험 가입기간별 표(별표 1)
 * 수급 자격(이직 전 18개월 중 피보험단위기간 180일, 비자발적 이직 등)은 고용센터가 판단한다 — 이 계산은 확정하지 않는다.
 */
import { getRule, sourceList } from '../rules/index.js';
import { parseAmount, parseDecimal, parseCount, parseDate, collect, dateFromParts, addDays, DAY_MS, korDate, floorWon, won, num, result, fail, unavailable } from './common.js';

export const PERIODS = [
  ['under1', '1년 미만'], ['1to3', '1년 이상 3년 미만'], ['3to5', '3년 이상 5년 미만'], ['5to10', '5년 이상 10년 미만'], ['over10', '10년 이상'],
];
const REASONS = {
  involuntary: '비자발적 이직 (권고사직·계약만료·폐업 등)',
  justified: '자발적 이직 중 정당한 사유 (임금체불·통근 곤란 등)',
  voluntary: '자발적 이직 (개인 사정)',
};

export function calculate(raw) {
  const v = collect({
    lastDate: parseDate(raw.lastDate, { label: '마지막 근무일' }),
    age: parseCount(raw.age, { label: '이직일 기준 나이', min: 15, max: 100, unit: '세' }),
    wages3m: parseAmount(raw.wages3m, { label: '이직 전 3개월 임금총액' }),
    dailyHours: parseDecimal(raw.dailyHours, { label: '1일 소정근로시간', min: 1, max: 8, decimals: 1, unit: '시간' }),
  });
  const pIdx = PERIODS.findIndex(([k]) => k === raw.period);
  if (pIdx < 0) { v.ok = false; v.errors.period = '고용보험 가입기간을 선택해 주세요.'; }
  if (!REASONS[raw.reason]) { v.ok = false; v.errors.reason = '이직 사유를 선택해 주세요.'; }
  if (raw.days180 !== 'yes' && raw.days180 !== 'no') { v.ok = false; v.errors.days180 = '피보험단위기간 180일 충족 여부를 선택해 주세요.'; }
  if (!v.ok) return fail(v.errors);
  const { lastDate, age, wages3m, dailyHours } = v.values;
  const disabled = raw.disabled === 'yes';
  const year = lastDate.y;

  const rule = getRule(year, 'unemployment');
  if (!rule.ok) return unavailable(rule.reason, sourceList(['ueAct']));
  const mw = getRule(year, 'minimumWage');
  if (!mw.ok) return unavailable(mw.reason, sourceList(['ueAct']));
  const u = rule.value;

  const retire = addDays(lastDate, 1);
  const from = dateFromParts(retire.y, retire.m - 3, retire.d);
  const days3m = Math.round((retire.t - from.t) / DAY_MS);
  const baseDaily = wages3m / days3m;
  const raw60 = floorWon(baseDaily * u.replaceRate);
  const floor = floorWon(mw.value.hourly * u.floorRatio * dailyHours);
  const daily = Math.min(Math.max(raw60, floor), u.dailyMax);
  const older = age >= 50 || disabled;
  const days = (older ? u.days.over50 : u.days.under50)[pIdx];
  const total = daily * days;

  const eligibleLikely = raw.days180 === 'yes' && raw.reason !== 'voluntary';
  const status = eligibleLikely ? '요건 충족 가능 (최종 판단은 고용센터)' : '수급 요건 미충족 가능성 높음';
  const warnings = [
    '수급 자격은 고용센터가 이직 사유·피보험단위기간·재취업 노력 등을 확인해 결정합니다. 이 계산은 예상 금액이며 수급을 보장하지 않습니다.',
    '이직 전 3개월에 휴업·출산휴가 등 평균임금 산정 제외기간이 있거나, 기초일액이 통상임금보다 낮으면 결과가 달라질 수 있습니다.',
    '실업인정일마다 구직활동을 인정받아야 지급되며, 재취업·소득 발생 시 감액·중단됩니다.',
  ];
  if (raw.reason === 'voluntary') warnings.unshift('개인 사정에 의한 자발적 이직은 원칙적으로 구직급여를 받을 수 없습니다 (고용보험법 제58조).');
  if (raw.days180 === 'no') warnings.unshift('이직 전 18개월 동안 피보험단위기간(유급 근로일)이 180일 미만이면 구직급여를 받을 수 없습니다.');
  if (daily === u.dailyMax) warnings.push(`1일 상한액 ${won(u.dailyMax)}을 적용했습니다.`);
  if (daily === floor && raw60 < floor) warnings.push(`1일 하한액(최저임금 ${won(mw.value.hourly)} × 80% × ${num(dailyHours, 1)}시간)을 적용했습니다.`);

  return result({
    meta: `마지막 근무 ${korDate(lastDate)} · 이직 연도 ${year}년 기준 · ${age}세${disabled ? ' (장애인)' : ''} · 가입기간 ${PERIODS[pIdx][1]} · ${REASONS[raw.reason]}`,
    headline: { label: '예상 총 구직급여', value: won(total) },
    stats: [
      { label: '예상 1일 구직급여', value: won(daily) },
      { label: '예상 지급일수', value: `${days}일` },
      { label: '예상 총 구직급여', value: won(total) },
    ],
    rows: [
      { label: '수급 요건 확인', value: status },
      { label: '평균임금 산정기간', value: `${korDate(from)} ~ ${korDate(lastDate)} (${days3m}일)` },
      { label: '기초일액', value: `${won(wages3m)} ÷ ${days3m}일 = ${num(baseDaily, 2)}원` },
      { label: '기초일액 × 60%', value: won(raw60) },
      { label: `${year}년 상한·하한`, value: `상한 ${won(u.dailyMax)} · 하한 ${won(floor)}` },
      { label: '소정급여일수', value: `${older ? '50세 이상·장애인' : '50세 미만'}, 가입기간 ${PERIODS[pIdx][1]} → ${days}일` },
      { label: '월 환산 참고 (30일)', value: won(daily * 30) },
    ],
    formulas: [
      '구직급여일액 = 기초일액(이직 전 3개월 임금총액 ÷ 달력일수) × 60%',
      `상한 ${won(u.dailyMax)}, 하한 = 최저임금 × 80% × 1일 소정근로시간`,
      '총 구직급여 = 구직급여일액 × 소정급여일수',
    ],
    warnings,
    sources: sourceList(u.sources),
  });
}
