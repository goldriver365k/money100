/**
 * '세전 월급' 자동 계산 도우미: 연봉 ÷ 12 / 기본급 + 수당, 상여금 구분, 비과세 중복 차감 방지
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeMonthlyPay } from '../../site/assets/js/calc/monthly-pay-helper.js';
import * as mn from '../../site/assets/js/calc/monthly-net.js';
import * as ns from '../../site/assets/js/calc/net-salary.js';
import * as si from '../../site/assets/js/calc/social-insurance.js';

const A = (o) => computeMonthlyPay({ mode: 'annual', includedBonusPaid: 'monthly', extraBonusInAverage: 'no', nonTaxableIn: 'included', ...o });
const stat = (r, l) => r.stats.find((s) => s.label === l)?.value;

describe('연봉 ÷ 12', () => {
  test('연봉 5천만 → 4,166,666원 (원 미만 버림), 비과세는 연봉 안 — 더하지 않음', () => {
    const r = A({ annual: '50000000', nonTaxable: '200000' });
    assert.equal(r.pay, 4166666); assert.equal(r.nonTaxable, 200000); assert.equal(r.taxable, 3966666);
  });
  test('연봉에 포함된 상여금: 매달 받으면 포함, 따로 받으면 제외', () => {
    assert.equal(A({ annual: '60000000', includedBonus: '6000000' }).pay, 5000000);
    assert.equal(A({ annual: '60000000', includedBonus: '6000000', includedBonusPaid: 'separate' }).pay, 4500000);
  });
  test('연봉과 별도 상여금: 월 평균 포함 시 ÷ 12 더함, 아니면 제외', () => {
    assert.equal(A({ annual: '60000000', extraBonus: '12000000', extraBonusInAverage: 'yes' }).pay, 6000000);
    assert.equal(A({ annual: '60000000', extraBonus: '12000000' }).pay, 5000000);
  });
  test('비과세 수당을 연봉과 별도로 받으면 월급에 더함', () => {
    const r = A({ annual: '48000000', nonTaxable: '200000', nonTaxableIn: 'separate' });
    assert.equal(r.pay, 4200000); assert.equal(r.taxable, 4000000);
  });
  test('예외: 빈 값·음수·소수·상여금 ≥ 연봉·비과세 과다', () => {
    assert.ok(A({ annual: '' }).errors.annual);
    assert.ok(A({ annual: '-1' }).errors.annual);
    assert.ok(A({ annual: '1000.5' }).errors.annual);
    assert.ok(A({ annual: '10000000', includedBonus: '10000000' }).errors.includedBonus);
    assert.ok(A({ annual: '2000000', nonTaxable: '200000' }).errors.nonTaxable);
    assert.ok(computeMonthlyPay({ mode: '' }).errors.mode);
  });
});

describe('기본급 + 수당', () => {
  test('250만 + 과세 30만 + 비과세 20만 = 300만, 과세 280만', () => {
    const r = computeMonthlyPay({ mode: 'parts', base: '2500000', allowance: '300000', nonTaxable: '200000' });
    assert.equal(r.pay, 3000000); assert.equal(r.nonTaxable, 200000); assert.equal(r.taxable, 2800000);
  });
  test('예외: 기본급 없음·0·음수', () => {
    assert.ok(computeMonthlyPay({ mode: 'parts', base: '' }).errors.base);
    assert.ok(computeMonthlyPay({ mode: 'parts', base: '0' }).errors.base);
    assert.ok(computeMonthlyPay({ mode: 'parts', base: '100', allowance: '-5' }).errors.allowance);
  });
});

describe('중복 차감 방지 (계산기 연결)', () => {
  test('자동 계산 결과를 월급 실수령액에 넣으면 같은 조건의 연봉 실수령액과 결과가 같다', () => {
    const h = A({ annual: '50000000', nonTaxable: '200000' });
    const viaHelper = mn.calculate({ year: '2026', pay: String(h.pay), nonTaxable: String(h.nonTaxable), dependents: '1', children: '0' });
    const annual = ns.calculate({ year: '2026', salary: '50000000', nonTaxable: '200000', dependents: '1' });
    assert.equal(stat(viaHelper, '월 예상 실수령액'), stat(annual, '월 예상 실수령액'));
    assert.equal(stat(viaHelper, '월 예상 실수령액'), '3,553,771원');
  });
  test('기본급 + 수당 결과: 4대보험은 과세분(280만)에만 부과', () => {
    const h = computeMonthlyPay({ mode: 'parts', base: '2500000', allowance: '300000', nonTaxable: '200000' });
    const r = mn.calculate({ year: '2026', pay: String(h.pay), nonTaxable: String(h.nonTaxable), dependents: '1', children: '0' });
    assert.equal(r.table.rows.find((x) => x[0] === '고용보험')[1], '25,200원'); // 2,800,000 × 0.9%
  });
  test('4대보험: 기본급 + 수당 결과(300만·비과세 20만) → 근로자 부담 272,080원 (과세 280만 기준, 기존 검증값과 동일)', () => {
    const h = computeMonthlyPay({ mode: 'parts', base: '2500000', allowance: '300000', nonTaxable: '200000' });
    const r = si.calculate({ year: '2026', month: '3', pay: String(h.pay), nonTaxable: String(h.nonTaxable), size: 'under150', industrialRate: '' });
    assert.equal(stat(r, '근로자 부담'), '272,080원');
  });
});
