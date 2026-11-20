import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateProration,
  defaultWorkdays,
  daysInMonth,
  dayOfWeek,
  describeDiff,
  parseIsoDate,
  parseSalary,
  prorate,
} from '../../site/assets/js/proration.js';

const weekdays = defaultWorkdays;

describe('필수 검증 사례 5건', () => {
  test('사례 1: 2026-01-16 중도 입사, 3,100,000원', () => {
    const r = calculateProration({
      salary: '3100000', year: 2026, month: 1, type: 'join',
      startDate: '2026-01-16', workdays: weekdays(2026, 1),
    });
    assert.equal(r.ok, true);
    const { calendar, workday, diff } = r.result;
    assert.deepEqual([calendar.applied, calendar.total, calendar.amount], [16, 31, 1_600_000]);
    assert.deepEqual([workday.applied, workday.total, workday.amount], [11, 22, 1_550_000]);
    assert.deepEqual(diff, { comparable: true, amount: 50_000, larger: 'calendar' });
    assert.equal(describeDiff(diff), '50,000원 · 달력일 기준이 더 큽니다');
  });

  test('사례 2: 2028-02-10 마지막 재직일(윤년), 2,900,000원', () => {
    const r = calculateProration({
      salary: '2900000', year: 2028, month: 2, type: 'leave',
      endDate: '2028-02-10', workdays: weekdays(2028, 2),
    });
    const { calendar, workday, diff } = r.result;
    assert.deepEqual([calendar.applied, calendar.total, calendar.amount], [10, 29, 1_000_000]);
    assert.deepEqual([workday.applied, workday.total, workday.amount], [8, 21, 1_104_762]);
    assert.deepEqual(diff, { comparable: true, amount: 104_762, larger: 'workday' });
    assert.equal(describeDiff(diff), '104,762원 · 소정근로일 기준이 더 큽니다');
  });

  test('사례 3: 2026-01-17 하루 재직, 토요일 17일 일정 추가', () => {
    const r = calculateProration({
      salary: '3100000', year: 2026, month: 1, type: 'both',
      startDate: '2026-01-17', endDate: '2026-01-17', workdays: [...weekdays(2026, 1), 17],
    });
    const { calendar, workday, diff } = r.result;
    assert.deepEqual([calendar.applied, calendar.total, calendar.amount], [1, 31, 100_000]);
    assert.deepEqual([workday.applied, workday.total, workday.amount], [1, 23, 134_783]);
    assert.deepEqual(diff, { comparable: true, amount: 34_783, larger: 'workday' });
  });

  test('사례 4: 2026-01-01~31 전체 재직, 3,210,000원', () => {
    const r = calculateProration({
      salary: '3210000', year: 2026, month: 1, type: 'both',
      startDate: '2026-01-01', endDate: '2026-01-31', workdays: weekdays(2026, 1),
    });
    const { calendar, workday, diff } = r.result;
    assert.deepEqual([calendar.applied, calendar.total, calendar.amount], [31, 31, 3_210_000]);
    assert.deepEqual([workday.applied, workday.total, workday.amount], [22, 22, 3_210_000]);
    assert.deepEqual(diff, { comparable: true, amount: 0, larger: 'equal' });
    assert.equal(describeDiff(diff), '0원 · 두 방식의 예상액이 같습니다');
  });

  test('사례 5: 2026-01-17 하루 재직, 월 전체 일정 해제', () => {
    const r = calculateProration({
      salary: '3100000', year: 2026, month: 1, type: 'both',
      startDate: '2026-01-17', endDate: '2026-01-17', workdays: [],
    });
    const { calendar, workday, diff } = r.result;
    assert.equal(calendar.amount, 100_000);
    assert.equal(workday.available, false);
    assert.equal(workday.amount, null);
    assert.equal(diff.comparable, false);
    assert.equal(describeDiff(diff), '비교 불가');
  });
});

describe('추가 검증', () => {
  test('사례 3에서 토요일을 추가하지 않으면 소정근로일 예상액은 0원', () => {
    const r = calculateProration({
      salary: '3100000', year: 2026, month: 1, type: 'both',
      startDate: '2026-01-17', endDate: '2026-01-17', workdays: weekdays(2026, 1),
    });
    assert.equal(r.result.workday.available, true);
    assert.deepEqual([r.result.workday.applied, r.result.workday.total, r.result.workday.amount], [0, 22, 0]);
    assert.deepEqual(r.result.diff, { comparable: true, amount: 100_000, larger: 'calendar' });
  });

  test('한 달 전체 재직이면 두 방식 모두 월급과 같다 (여러 달·유형·일정)', () => {
    for (const [year, month] of [[2026, 1], [2026, 2], [2028, 2], [2026, 4], [2100, 2], [2000, 2]]) {
      const last = daysInMonth(year, month);
      const iso = (d) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const inputs = [
        { type: 'join', startDate: iso(1) },
        { type: 'leave', endDate: iso(last) },
        { type: 'both', startDate: iso(1), endDate: iso(last) },
      ];
      for (const extra of inputs) {
        for (const workdays of [weekdays(year, month), [5], [1, 2, 3, last]]) {
          const r = calculateProration({ salary: '2345677', year, month, workdays, ...extra });
          assert.equal(r.result.calendar.amount, 2_345_677);
          assert.equal(r.result.workday.amount, 2_345_677);
        }
      }
    }
  });

  test('마지막 재직일이 입사일보다 빠르면 오류', () => {
    const r = calculateProration({
      salary: '3000000', year: 2026, month: 1, type: 'both',
      startDate: '2026-01-20', endDate: '2026-01-19', workdays: weekdays(2026, 1),
    });
    assert.equal(r.ok, false);
    assert.match(r.errors.endDate, /같거나 그 이후/);
  });

  test('정산월 밖 날짜, 존재하지 않는 날짜, 빈 날짜는 오류', () => {
    const base = { salary: '3000000', year: 2026, month: 2, workdays: weekdays(2026, 2) };
    assert.match(calculateProration({ ...base, type: 'join', startDate: '2026-03-01' }).errors.startDate, /정산 대상 월/);
    assert.match(calculateProration({ ...base, type: 'join', startDate: '2026-02-29' }).errors.startDate, /존재하지 않는/);
    assert.match(calculateProration({ ...base, type: 'leave', endDate: '2026-02-30' }).errors.endDate, /존재하지 않는/);
    assert.match(calculateProration({ ...base, type: 'leave', endDate: '' }).errors.endDate, /입력해 주세요/);
    assert.match(calculateProration({ ...base, type: 'both', startDate: '2026-2-3', endDate: '2026-02-05' }).errors.startDate, /존재하지 않는/);
    // 윤년 2월 29일은 정상
    assert.equal(calculateProration({ ...base, year: 2028, workdays: weekdays(2028, 2), type: 'join', startDate: '2028-02-29' }).ok, true);
  });

  test('금액 검증: 빈 값, 0, 음수, 소수, 문자 → 오류 / 쉼표는 허용', () => {
    assert.equal(parseSalary('').ok, false);
    assert.equal(parseSalary('   ').ok, false);
    assert.equal(parseSalary('0').ok, false);
    assert.equal(parseSalary('000').ok, false);
    assert.equal(parseSalary('-100').ok, false);
    assert.match(parseSalary('3100000.5').error, /소수/);
    assert.match(parseSalary('3100000.0').error, /소수/);
    assert.match(parseSalary('.5').error, /소수/);
    assert.equal(parseSalary('삼백만').ok, false);
    assert.equal(parseSalary('1e6').ok, false);
    assert.equal(parseSalary('1000000000000').ok, false);
    assert.deepEqual(parseSalary('3,100,000'), { ok: true, value: 3_100_000 });
    assert.deepEqual(parseSalary(' 0123 '), { ok: true, value: 123 });
    assert.deepEqual(parseSalary('999999999999'), { ok: true, value: 999_999_999_999 });
  });

  test('월 전체 일정에 정산월 밖 날짜가 있으면 오류', () => {
    const r = calculateProration({
      salary: '3000000', year: 2026, month: 2, type: 'join', startDate: '2026-02-02', workdays: [29],
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.workdays);
  });

  test('사사오입: 0.5는 올림, 0.4999…는 버림, 큰 금액에서도 정확', () => {
    assert.equal(prorate(1, 1, 2), 1); // 0.5 → 1
    assert.equal(prorate(3, 1, 2), 2); // 1.5 → 2
    assert.equal(prorate(1, 1, 3), 0); // 0.333 → 0
    assert.equal(prorate(2, 1, 3), 1); // 0.667 → 1
    assert.equal(prorate(2_900_000, 8, 21), 1_104_762);
    // 999,999,999,999 × 30 ÷ 31 = 967,741,935,482.903… → 967,741,935,483
    assert.equal(prorate(999_999_999_999, 30, 31), 967_741_935_483);
    // 부동소수점이면 틀리기 쉬운 경계: 1,000,005 × 1 ÷ 2 = 500,002.5 → 500,003
    assert.equal(prorate(1_000_005, 1, 2), 500_003);
  });

  test('달력: 윤년과 월말 일수, 요일', () => {
    assert.equal(daysInMonth(2026, 2), 28);
    assert.equal(daysInMonth(2028, 2), 29);
    assert.equal(daysInMonth(2100, 2), 28);
    assert.equal(daysInMonth(2000, 2), 29);
    assert.equal(daysInMonth(2026, 4), 30);
    assert.equal(daysInMonth(2026, 12), 31);
    assert.equal(dayOfWeek(2026, 1, 1), 4); // 목요일
    assert.equal(dayOfWeek(2026, 1, 17), 6); // 토요일
    assert.equal(dayOfWeek(2028, 2, 1), 2); // 화요일
    assert.equal(weekdays(2026, 1).length, 22);
    assert.equal(weekdays(2028, 2).length, 21);
  });

  test('parseIsoDate는 시간대와 무관하게 연·월·일 그대로 분해', () => {
    assert.deepEqual(parseIsoDate('2026-01-31'), { ok: true, year: 2026, month: 1, day: 31 });
    assert.deepEqual(parseIsoDate('2026-13-01'), { ok: false, reason: 'invalid' });
    assert.deepEqual(parseIsoDate('2026-00-10'), { ok: false, reason: 'invalid' });
  });

  test('중도 입사: 입사일~월말, 중도 퇴사: 월초~마지막 재직일 (양 끝 포함)', () => {
    const j = calculateProration({ salary: '3000000', year: 2026, month: 4, type: 'join', startDate: '2026-04-30', workdays: weekdays(2026, 4) });
    assert.deepEqual([j.result.startDay, j.result.endDay, j.result.calendar.applied], [30, 30, 1]);
    const l = calculateProration({ salary: '3000000', year: 2026, month: 4, type: 'leave', endDate: '2026-04-01', workdays: weekdays(2026, 4) });
    assert.deepEqual([l.result.startDay, l.result.endDay, l.result.calendar.applied], [1, 1, 1]);
  });
});
