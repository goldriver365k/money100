/**
 * 야간·연장·휴일수당 계산 (하루 근무) — 근로기준법 제56조, 기간제법 제6조.
 *
 * 실근로시간 = 근무 시간대 − 휴게시간. 종료 시각이 시작보다 이르거나 같으면 다음 날로 본다(자정 넘김).
 * 기본임금 = 실근로시간 × 시급
 * 가산수당 (상시 5명 이상 사업장)
 *  - 연장: 1일 기준시간(8시간, 단시간근로자는 1일 소정근로시간) 초과분 × 시급 × 50%  (휴일 근무일에는 휴일 규칙으로 대신)
 *  - 야간: 22:00~06:00 근로분 × 시급 × 50% (연장·휴일 가산과 중복 적용)
 *  - 휴일: 8시간 이내 × 50%, 8시간 초과 × 100%
 * 상시 5명 미만 사업장은 가산수당이 적용되지 않는다(근로기준법 시행령 별표 1). 주 40시간 초과 연장은 반영하지 않는다.
 */
import { sourceList } from '../rules/index.js';
import { josa, parseAmount, parseDecimal, parseCount, collect, floorWon, won, num, result, fail } from './common.js';

const SOURCES = ['overtimeAct', 'partTimeOT', 'leaveScope'];

export function parseTime(raw, label) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw ?? '').trim());
  if (!String(raw ?? '').trim()) return { ok: false, error: `${josa(label, '을', '를')} 입력해 주세요.` };
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return { ok: false, error: `${josa(label, '은', '는')} 00:00~23:59 형식으로 입력해 주세요.` };
  return { ok: true, value: Number(m[1]) * 60 + Number(m[2]) };
}

/** 근무 구간 [s, e)(분, e 는 1440 초과 가능) 중 22:00~06:00 겹치는 분 */
export function nightMinutes(s, e) {
  let total = 0;
  for (let day = -1; day <= 1; day += 1) {
    const o = day * 1440;
    for (const [a, b] of [[o + 0, o + 360], [o + 1320, o + 1440]]) total += Math.max(0, Math.min(e, b) - Math.max(s, a));
  }
  return total;
}

export function calculate(raw) {
  const v = collect({
    hourly: parseAmount(raw.hourly, { label: '시급' }),
    start: parseTime(raw.start, '시작 시각'),
    end: parseTime(raw.end, '종료 시각'),
    breakMin: parseCount(raw.breakMin, { label: '휴게시간', required: false, min: 0, max: 600, unit: '분' }),
    nightBreakMin: parseCount(raw.nightBreakMin, { label: '휴게시간 중 야간(22~06시) 시간', required: false, min: 0, max: 480, unit: '분' }),
    contractHours: parseDecimal(raw.contractHours, { label: '1일 소정근로시간', min: 1, max: 8, decimals: 1, unit: '시간' }),
  });
  if (raw.holiday !== 'yes' && raw.holiday !== 'no') { v.ok = false; v.errors.holiday = '휴일 근무 여부를 선택해 주세요.'; }
  if (raw.size5 !== 'yes' && raw.size5 !== 'no') { v.ok = false; v.errors.size5 = '상시 근로자 5명 이상 여부를 선택해 주세요.'; }
  if (!v.ok) return fail(v.errors);
  const { hourly, start, contractHours } = v.values;
  const breakMin = v.values.breakMin ?? 0;
  const nightBreak = v.values.nightBreakMin ?? 0;
  const end = v.values.end <= start ? v.values.end + 1440 : v.values.end;
  const span = end - start;
  const nightSpan = nightMinutes(start, end);
  if (breakMin >= span) return fail({ breakMin: '휴게시간이 근무 시간보다 깁니다.' });
  if (nightBreak > breakMin) return fail({ nightBreakMin: '야간 휴게시간은 전체 휴게시간보다 길 수 없습니다.' });
  if (nightBreak > nightSpan) return fail({ nightBreakMin: '야간 휴게시간이 근무 중 야간 시간보다 깁니다.' });

  const work = span - breakMin;
  const night = nightSpan - nightBreak;
  const holiday = raw.holiday === 'yes';
  const premium = raw.size5 === 'yes';
  const threshold = Math.min(8, contractHours) * 60;
  const overtime = holiday ? 0 : Math.max(work - threshold, 0);
  const holidayIn = holiday ? Math.min(work, 480) : 0;
  const holidayOver = holiday ? Math.max(work - 480, 0) : 0;
  const perMin = hourly / 60;

  const basePay = floorWon(work * perMin);
  const otPay = premium ? floorWon(overtime * perMin * 0.5) : 0;
  const nightPay = premium ? floorWon(night * perMin * 0.5) : 0;
  const holPay = premium ? floorWon(holidayIn * perMin * 0.5 + holidayOver * perMin * 1.0) : 0;
  const total = basePay + otPay + nightPay + holPay;
  const h = (m) => `${num(m / 60, 2)}시간`;
  const hm = (m) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  const warnings = [
    '하루 근무 기준입니다. 1주 40시간을 넘는 연장근로, 주휴수당은 따로 계산해야 합니다.',
    '휴일근로는 주휴일·약정휴일 등 유급휴일에 일한 경우입니다. 휴일 대체·보상휴가를 했다면 결과가 다릅니다.',
  ];
  if (!premium) warnings.unshift('상시 5명 미만 사업장은 연장·야간·휴일 가산수당이 적용되지 않아 기본임금만 계산했습니다.');
  if (contractHours < 8 && !holiday) warnings.push(`단시간근로자는 1일 소정근로시간(${num(contractHours, 1)}시간)을 넘는 근로부터 50%를 가산했습니다 (기간제법 제6조).`);

  return result({
    meta: `${hm(start)} ~ ${end >= 1440 ? '다음 날 ' : ''}${hm(end)} · 휴게 ${breakMin}분(야간 ${nightBreak}분) · 시급 ${won(hourly)} · ${holiday ? '휴일 근무' : '평일 근무'} · ${premium ? '5명 이상' : '5명 미만'} 사업장`,
    headline: { label: '예상 총지급액 (하루)', value: won(total) },
    stats: [
      { label: '예상 총지급액', value: won(total) },
      { label: '가산수당 합계', value: won(otPay + nightPay + holPay) },
      { label: '실근로시간', value: h(work) },
    ],
    table: {
      head: ['항목', '대상 시간', '계산', '금액'],
      rows: [
        ['기본임금', h(work), `${won(hourly)} × ${h(work)}`, won(basePay)],
        ['연장근로 가산', h(overtime), holiday ? '휴일은 휴일 가산으로 계산' : premium ? `기준 ${h(threshold)} 초과 × 50%` : '미적용', won(otPay)],
        ['야간근로 가산', h(night), premium ? '22:00~06:00 × 50%' : '미적용', won(nightPay)],
        ['휴일근로 가산', holiday ? `${h(holidayIn)} + 8시간 초과 ${h(holidayOver)}` : '0시간', premium ? '8시간 이내 50%, 초과 100%' : '미적용', won(holPay)],
      ],
      foot: ['합계', '', '', won(total)],
    },
    formulas: [
      '기본임금 = 실근로시간 × 시급 (실근로시간 = 근무 시간 − 휴게시간)',
      '연장 가산 = 1일 8시간(단시간근로자는 소정근로시간) 초과 시간 × 시급 × 50%',
      '야간 가산 = 22시~06시 근로시간 × 시급 × 50% (연장·휴일 가산과 중복)',
      '휴일 가산 = 8시간 이내 × 50% + 8시간 초과 × 100%',
      '각 항목은 원 미만을 버립니다.',
    ],
    warnings,
    sources: sourceList(SOURCES),
  });
}
