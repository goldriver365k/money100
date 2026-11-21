/**
 * 입력 도우미 계산 (3개월 임금총액·통상임금 일/월·연간 4대보험료·기존 대출 연간 원리금)
 * 기대값은 손 계산 또는 기존 계산기 결과와의 대조
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeWages3m, computeOrdinary, computeAnnualInsurance, computeLoanAnnual } from '../../site/assets/js/calc/wage-helpers.js';
import * as ns from '../../site/assets/js/calc/net-salary.js';
import * as sv from '../../site/assets/js/calc/severance.js';
import * as ln from '../../site/assets/js/calc/loan.js';

const stat = (r, l) => r.stats.find((s) => s.label === l)?.value;

describe('3개월 임금총액', () => {
  test('월급 × 3, 3개월 각각 합산', () => {
    assert.equal(computeWages3m({ mode: 'same', monthly: '3000000' }).value, 9000000);
    assert.equal(computeWages3m({ mode: 'each', m1: '3100000', m2: '2900000', m3: '3000000' }).value, 9000000);
  });
  test('예외', () => {
    assert.ok(computeWages3m({ mode: 'same', monthly: '' }).errors.monthly);
    assert.ok(computeWages3m({ mode: 'each', m1: '1', m2: '-1', m3: '1' }).errors.m2);
    assert.ok(computeWages3m({ mode: '' }).errors.mode);
  });
});

describe('통상임금 (월·시간·1일)', () => {
  const base = { base: '2500000', fixed: '200000', bonus: '2400000', weeklyHours: '40', dailyHours: '8' };
  test('월 290만 → 시급 13,875원 → 1일 8시간 111,000원', () => {
    assert.equal(computeOrdinary({ ...base, output: 'monthly' }).value, 2900000);
    assert.equal(computeOrdinary({ ...base, output: 'hourly' }).value, 13875);
    assert.equal(computeOrdinary({ ...base, output: 'daily' }).value, 111000);
  });
  test('월 통상임금은 근로시간 없이 계산, 1일은 1일 소정근로시간 필요', () => {
    assert.equal(computeOrdinary({ base: '3500000', output: 'monthly' }).value, 3500000);
    assert.ok(computeOrdinary({ ...base, dailyHours: '', output: 'daily' }).errors.dailyHours);
    assert.ok(computeOrdinary({ ...base, weeklyHours: '41', output: 'hourly' }).errors.weeklyHours);
  });
  test('퇴직금 연결: 1일 통상임금 111,000원이 평균임금보다 크면 통상임금 적용', () => {
    const d = computeOrdinary({ ...base, output: 'daily' }).value;
    const r = sv.calculate({ startDate: '2023-03-02', lastDate: '2026-02-28', wages3m: '9000000', bonus: '0', leavePay: '0', ordinaryDaily: String(d), hours15: 'yes' });
    assert.match(stat(r, '1일 평균임금'), /111,000원 \(통상임금 적용\)/);
    assert.equal(stat(r, '예상 퇴직금 (세전)'), '9,990,000원'); // 111,000 × 30 × 1095 / 365
  });
});

describe('연간 4대보험료 (총급여 기준)', () => {
  test('연봉 실수령액 계산기와 같은 값: 총급여 47,599,992원 → 국민연금 2,260,560 · 기타 2,364,240', () => {
    const r = computeAnnualInsurance({ year: '2026', totalPay: '47599992' });
    assert.equal(r.pension, 2260560); assert.equal(r.other, 2364240); assert.equal(r.total, 4624800);
    const kv = Object.fromEntries(ns.calculate({ year: '2026', salary: '50000000', nonTaxable: '200000', dependents: '1' }).rows.map((x) => [x.label, x.value]));
    assert.equal(kv['연금보험료공제'], '− 2,260,560원');
    assert.equal(kv['건강·장기요양·고용보험료 공제'], '− 2,364,240원');
  });
  test('예외: 총급여 없음, 2027년(고용보험 미확정)은 사유', () => {
    assert.ok(computeAnnualInsurance({ year: '2026', totalPay: '' }).errors.totalPay);
    assert.match(computeAnnualInsurance({ year: '2027', totalPay: '40000000' }).errors.totalPay, /고용보험/);
  });
});

describe('기존 대출 연간 원리금', () => {
  test('원리금균등 1억·4.5%·360개월 → 12 × 506,685 = 6,080,220원 (대출이자 계산기와 같은 상환표)', () => {
    assert.equal(computeLoanAnnual({ balance: '100000000', rate: '4.5', months: '360', method: 'equalPayment' }).value, 6080220);
    assert.equal(ln.schedule(100000000, 4.5, 360, 'equalPayment').fixed * 12, 6080220);
  });
  test('원금균등 1,200만·6%·12개월 → 원금 1,200만 + 이자 39만 = 12,390,000원, 남은 기간이 1년 미만이면 그 기간만', () => {
    assert.equal(computeLoanAnnual({ balance: '12000000', rate: '6', months: '12', method: 'equalPrincipal' }).value, 12390000);
    assert.equal(computeLoanAnnual({ balance: '6000000', rate: '0', months: '6', method: 'equalPayment' }).value, 6000000);
  });
  test('예외', () => {
    assert.ok(computeLoanAnnual({ balance: '', rate: '4', months: '12', method: 'equalPayment' }).errors.balance);
    assert.ok(computeLoanAnnual({ balance: '100', rate: '31', months: '12', method: 'equalPayment' }).errors.rate);
    assert.ok(computeLoanAnnual({ balance: '100', rate: '4', months: '0', method: 'equalPayment' }).errors.months);
    assert.ok(computeLoanAnnual({ balance: '100', rate: '4', months: '12', method: '' }).errors.method);
  });
});
