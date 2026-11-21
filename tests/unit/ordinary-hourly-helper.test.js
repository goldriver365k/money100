/**
 * '통상시급' 자동 계산 도우미 (연차수당 계산기) — 기대값은 손 계산
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeOrdinaryHourly } from '../../site/assets/js/calc/ordinary-hourly-helper.js';
import * as al from '../../site/assets/js/calc/annual-leave.js';

const stat = (r, l) => r.stats.find((s) => s.label === l)?.value;

describe('통상시급 자동 계산', () => {
  test('공식 대조: 2026 최저임금 월 환산액 2,156,880원 ÷ 209시간 = 10,320원', () => {
    const r = computeOrdinaryHourly({ base: '2156880', weeklyHours: '40' });
    assert.equal(r.hours, 209); assert.equal(r.hourly, 10320);
  });
  test('기본급 250만 + 고정 수당 20만 + 정기 상여금 연 240만(월 20만) = 290만 ÷ 209 = 13,875원', () => {
    const r = computeOrdinaryHourly({ base: '2500000', fixed: '200000', bonus: '2400000', weeklyHours: '40' });
    assert.equal(r.monthly, 2900000); assert.equal(r.hourly, 13875);
  });
  test('단시간: 주 20시간 → 104시간, 주 15시간 미만은 주휴 없음 (14시간 → 61시간)', () => {
    assert.equal(computeOrdinaryHourly({ base: '1200000', weeklyHours: '20' }).hours, 104);
    assert.equal(computeOrdinaryHourly({ base: '1200000', weeklyHours: '20' }).hourly, 11538);
    assert.equal(computeOrdinaryHourly({ base: '700000', weeklyHours: '14' }).hours, 61);
  });
  test('예외: 기본급 없음·음수, 1주 소정근로시간 없음·40시간 초과', () => {
    assert.ok(computeOrdinaryHourly({ base: '', weeklyHours: '40' }).errors.base);
    assert.ok(computeOrdinaryHourly({ base: '-1', weeklyHours: '40' }).errors.base);
    assert.ok(computeOrdinaryHourly({ base: '100', weeklyHours: '' }).errors.weeklyHours);
    assert.ok(computeOrdinaryHourly({ base: '100', weeklyHours: '41' }).errors.weeklyHours);
    assert.ok(computeOrdinaryHourly({ base: '100', bonus: '1.5', weeklyHours: '40' }).errors.bonus);
  });
  test('연차수당 연결: 통상시급 13,875원 × 미사용 6일 × 8시간 = 666,000원', () => {
    const h = computeOrdinaryHourly({ base: '2500000', fixed: '200000', bonus: '2400000', weeklyHours: '40' });
    const r = al.calculate({ startDate: '2023-03-02', baseDate: '2026-03-31', weeklyHours: '40', dailyHours: '8', hourly: String(h.hourly), used: '10', size5: 'yes', attendance: 'yes' });
    assert.equal(stat(r, '예상 연차수당'), '666,000원');
  });
});
