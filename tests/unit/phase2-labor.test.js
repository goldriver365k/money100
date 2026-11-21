/**
 * 2차-A 노동·급여 5종: 정상·예외·경계·연도 변경·공식 기준 대조 (기대값은 손 계산)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as mn from '../../site/assets/js/calc/monthly-net.js';
import * as ns from '../../site/assets/js/calc/net-salary.js';
import * as ue from '../../site/assets/js/calc/unemployment.js';
import * as al from '../../site/assets/js/calc/annual-leave.js';
import * as ot from '../../site/assets/js/calc/overtime.js';
import * as pl from '../../site/assets/js/calc/parental-leave.js';
import { getRule } from '../../site/assets/js/rules/index.js';

const stat = (r, label) => r.stats.find((s) => s.label === label)?.value;
const row = (r, label) => r.rows.find((x) => x.label === label)?.value;

describe('월급 실수령액', () => {
  const base = { year: '2026', pay: '3000000', nonTaxable: '200000', dependents: '1', children: '0' };
  test('연봉 실수령액 엔진과 같은 결과 (월 4,166,666원 = 연봉 5천만)', () => {
    const a = mn.calculate({ ...base, pay: '4166666' });
    const b = ns.calculate({ year: '2026', salary: '50000000', nonTaxable: '200000', dependents: '1' });
    assert.equal(stat(a, '월 예상 실수령액'), stat(b, '월 예상 실수령액'));
  });
  test('자녀세액공제: 1명 25만·2명 55만·3명 95만 (소득세법 제59조의2)', () => {
    const rule = getRule(2026, 'childCredit').value;
    assert.deepEqual([1, 2, 3, 4].map((n) => ns.childTaxCredit(n, rule)), [250000, 550000, 950000, 1350000]);
    const r = mn.calculate({ ...base, pay: '5000000', dependents: '4', children: '2' });
    assert.equal(row(r, '자녀세액공제 (2명)'), '− 550,000원');
  });
  test('세액보다 큰 자녀공제는 세액까지만 (결정세액 0 미만 불가)', () => {
    const r = mn.calculate({ ...base, pay: '1800000', nonTaxable: '0', dependents: '5', children: '4' });
    assert.equal(row(r, '결정세액 (연간 소득세)'), '0원');
  });
  test('예외: 빈 값·음수·소수·비과세 초과·자녀 수 초과', () => {
    assert.ok(mn.calculate({ ...base, pay: '' }).errors.pay);
    assert.ok(mn.calculate({ ...base, pay: '-1' }).errors.pay);
    assert.ok(mn.calculate({ ...base, pay: '1.5' }).errors.pay);
    assert.ok(mn.calculate({ ...base, nonTaxable: '3000000' }).errors.nonTaxable);
    assert.ok(mn.calculate({ ...base, children: '1' }).errors.children);
    assert.ok(mn.calculate({ ...base, children: '-1' }).errors.children);
  });
  test('연도 변경: 2027 미확정 → 계산 불가', () => {
    assert.ok(mn.calculate({ ...base, year: '2027' }).unavailable);
  });
});

describe('실업급여', () => {
  const base = { lastDate: '2026-06-30', age: '35', period: '3to5', wages3m: '9000000', dailyHours: '8', reason: 'involuntary', days180: 'yes', disabled: 'no' };
  test('하한 적용: 900만 ÷ 91일 × 60% = 59,340 < 하한 66,048 → 66,048원 × 180일', () => {
    const r = ue.calculate(base);
    assert.equal(stat(r, '예상 1일 구직급여'), '66,048원');
    assert.equal(stat(r, '예상 지급일수'), '180일');
    assert.equal(stat(r, '예상 총 구직급여'), '11,888,640원');
  });
  test('상한 적용: 1,500만 원 → 68,100원, 55세·10년 이상 270일', () => {
    const r = ue.calculate({ ...base, wages3m: '15000000', age: '55', period: 'over10' });
    assert.equal(stat(r, '예상 1일 구직급여'), '68,100원');
    assert.equal(stat(r, '예상 지급일수'), '270일');
  });
  test('경계: 50세 미만 장애인은 50세 이상 표, 1년 미만 120일', () => {
    assert.equal(stat(ue.calculate({ ...base, disabled: 'yes', period: '1to3' }), '예상 지급일수'), '180일');
    assert.equal(stat(ue.calculate({ ...base, period: 'under1' }), '예상 지급일수'), '120일');
    assert.equal(stat(ue.calculate({ ...base, age: '49', period: 'over10' }), '예상 지급일수'), '240일');
    assert.equal(stat(ue.calculate({ ...base, age: '50', period: 'over10' }), '예상 지급일수'), '270일');
  });
  test('단시간: 1일 4시간이면 하한 33,024원', () => {
    const r = ue.calculate({ ...base, wages3m: '3000000', dailyHours: '4' });
    assert.equal(stat(r, '예상 1일 구직급여'), '33,024원');
  });
  test('자발적 이직·180일 미만은 요건 미충족 안내 (확정하지 않음)', () => {
    assert.match(row(ue.calculate({ ...base, reason: 'voluntary' }), '수급 요건 확인'), /미충족/);
    assert.match(row(ue.calculate({ ...base, days180: 'no' }), '수급 요건 확인'), /미충족/);
  });
  test('예외·연도 변경', () => {
    assert.ok(ue.calculate({ ...base, wages3m: '' }).errors.wages3m);
    assert.ok(ue.calculate({ ...base, lastDate: '2026-02-30' }).errors.lastDate);
    assert.ok(ue.calculate({ ...base, age: '-3' }).errors.age);
    assert.ok(ue.calculate({ ...base, dailyHours: '9' }).errors.dailyHours);
    assert.ok(ue.calculate({ ...base, period: '' }).errors.period);
    assert.ok(ue.calculate({ ...base, lastDate: '2027-01-15' }).unavailable);
  });
});

describe('연차수당', () => {
  const base = { startDate: '2023-03-02', baseDate: '2026-03-31', weeklyHours: '40', dailyHours: '8', hourly: '12000', used: '10', size5: 'yes', attendance: 'yes' };
  test('근속 3년: 16일 − 사용 10일 = 6일 × 8시간 × 12,000 = 576,000원', () => {
    const r = al.calculate(base);
    assert.equal(stat(r, '발생 연차'), '16일');
    assert.equal(stat(r, '예상 연차수당'), '576,000원');
  });
  test('경계: 1주년 전날은 1년 미만(11일), 1주년 당일 재직이면 15일', () => {
    assert.equal(stat(al.calculate({ ...base, startDate: '2025-03-02', baseDate: '2026-03-01', used: '0' }), '발생 연차'), '11일');
    assert.equal(stat(al.calculate({ ...base, startDate: '2025-03-02', baseDate: '2026-03-02', used: '0' }), '발생 연차'), '15일');
  });
  test('1년 미만 월 단위: 4개월 개근 → 4일, 최대 25일', () => {
    assert.equal(stat(al.calculate({ ...base, startDate: '2026-01-05', baseDate: '2026-05-10', used: '0' }), '발생 연차'), '4일');
    assert.equal(al.entitlement(30, 0).days, 25);
    assert.equal(al.entitlement(21, 0).days, 25);
    assert.equal(al.entitlement(5, 0).days, 17);
  });
  test('단시간 주 20시간: 15일 × 4시간 = 60시간', () => {
    const r = al.calculate({ ...base, startDate: '2025-01-02', baseDate: '2026-01-10', weeklyHours: '20', dailyHours: '4', used: '0' });
    assert.equal(stat(r, '예상 연차수당'), '720,000원');
  });
  test('적용 제외: 5명 미만·주 15시간 미만, 출근율 80% 미만은 추가 정보 필요', () => {
    assert.equal(stat(al.calculate({ ...base, size5: 'no' }), '예상 연차수당'), '0원');
    assert.equal(stat(al.calculate({ ...base, weeklyHours: '14' }), '예상 연차수당'), '0원');
    assert.equal(al.calculate({ ...base, attendance: 'no' }).headline.value, '추가 정보 필요');
  });
  test('예외: 사용 연차 초과·날짜 순서·소수 자리', () => {
    assert.ok(al.calculate({ ...base, used: '20' }).errors.used);
    assert.ok(al.calculate({ ...base, baseDate: '2020-01-01' }).errors.baseDate);
    assert.ok(al.calculate({ ...base, used: '1.25' }).errors.used);
    assert.ok(al.calculate({ ...base, hourly: '0' }).errors.hourly);
  });
});

describe('야간·연장·휴일수당', () => {
  const base = { hourly: '12000', start: '18:00', end: '06:00', breakMin: '60', nightBreakMin: '60', contractHours: '8', holiday: 'no', size5: 'yes' };
  test('자정 넘김: 11시간 근로, 연장 3시간·야간 7시간 → 192,000원', () => {
    const r = ot.calculate(base);
    assert.equal(stat(r, '실근로시간'), '11시간');
    assert.deepEqual(r.table.rows.map((x) => x[3]), ['132,000원', '18,000원', '42,000원', '0원']);
    assert.equal(stat(r, '예상 총지급액'), '192,000원');
  });
  test('휴일 10시간: 8시간 50% + 2시간 100% (연장 가산 따로 없음)', () => {
    const r = ot.calculate({ ...base, start: '09:00', end: '20:00', nightBreakMin: '0', holiday: 'yes' });
    assert.deepEqual(r.table.rows.map((x) => x[3]), ['120,000원', '0원', '0원', '72,000원']);
  });
  test('5명 미만: 가산 없이 기본임금만', () => {
    assert.equal(stat(ot.calculate({ ...base, size5: 'no' }), '예상 총지급액'), '132,000원');
  });
  test('단시간: 소정 4시간, 6시간 근무 → 2시간 연장 가산', () => {
    const r = ot.calculate({ ...base, start: '10:00', end: '16:00', breakMin: '0', nightBreakMin: '0', contractHours: '4' });
    assert.equal(r.table.rows[1][3], '12,000원');
  });
  test('야간 구간 계산: 21:00~07:00 = 8시간, 23:00~01:00 = 2시간', () => {
    assert.equal(ot.nightMinutes(21 * 60, 31 * 60), 480);
    assert.equal(ot.nightMinutes(23 * 60, 25 * 60), 120);
    assert.equal(ot.nightMinutes(9 * 60, 18 * 60), 0);
  });
  test('예외: 시각 형식·휴게 초과·야간 휴게 초과', () => {
    assert.ok(ot.calculate({ ...base, start: '25:00' }).errors.start);
    assert.ok(ot.calculate({ ...base, end: '' }).errors.end);
    assert.ok(ot.calculate({ ...base, breakMin: '720' }).errors.breakMin);
    assert.ok(ot.calculate({ ...base, nightBreakMin: '90' }).errors.nightBreakMin);
    assert.ok(ot.calculate({ ...base, hourly: '-1' }).errors.hourly);
  });
});

describe('육아휴직급여', () => {
  const base = { startDate: '2026-03-01', wage: '3500000', months: '12', plan: 'general', extended: 'no' };
  test('일반 12개월: 250만×3 + 200만×3 + 160만×6 = 2,310만 원', () => {
    assert.equal(stat(pl.calculate(base), '총 예상 급여'), '23,100,000원');
  });
  test('6+6: 250·250·300·350·350·350(통상임금 350만 한도) + 160만×6 = 2,810만 원', () => {
    assert.equal(stat(pl.calculate({ ...base, plan: 'sixPlusSix' }), '총 예상 급여'), '28,100,000원');
  });
  test('하한 70만 원: 통상임금 80만 원 7개월째 64만 → 70만', () => {
    const r = pl.calculate({ ...base, wage: '800000' });
    assert.equal(r.table.rows[6][3], '700,000원');
    assert.equal(r.table.rows[0][3], '800,000원');
  });
  test('경계: 13개월 이상은 연장 요건 필요, 18개월까지', () => {
    assert.ok(pl.calculate({ ...base, months: '13' }).errors.months);
    assert.equal(pl.calculate({ ...base, months: '18', extended: 'yes' }).table.rows.length, 18);
    assert.ok(pl.calculate({ ...base, months: '19', extended: 'yes' }).errors.months);
  });
  test('한부모 특례·2027년은 공식 확인 전 → 계산 불가', () => {
    assert.ok(pl.calculate({ ...base, plan: 'singleParent' }).unavailable);
    assert.ok(pl.calculate({ ...base, startDate: '2027-01-02' }).unavailable);
  });
  test('예외: 빈 값·음수·0개월', () => {
    assert.ok(pl.calculate({ ...base, wage: '' }).errors.wage);
    assert.ok(pl.calculate({ ...base, wage: '-1' }).errors.wage);
    assert.ok(pl.calculate({ ...base, months: '0' }).errors.months);
    assert.ok(pl.calculate({ ...base, startDate: 'invalid' }).errors.startDate);
  });
});
