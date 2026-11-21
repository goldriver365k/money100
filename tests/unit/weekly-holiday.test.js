import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, parseTime, dayIndex, isoOf } from '../../site/assets/js/weekly-holiday.js';

/**
 * 명세 7장 공통 조건: 재직 시작일 2026-07-06(월), 1주 = 월~일, 시급 10,320원,
 * 정규 근무자 월~금, 재직 중, 모든 근무일 '출근'.
 * schedule: [[요일오프셋(0=월), 'H:MM'], ...] 를 주차별로.
 */
const HIRE = '2026-07-06';
function build(scheduleByWeek, opts = {}) {
  const days = {};
  const hire = dayIndex(opts.hire ?? HIRE);
  scheduleByWeek.forEach((items, w) => {
    if (items === null) return; // 비어 있는 주
    for (const [off, hm, att = 'present'] of items) {
      const [h, m] = hm.split(':');
      days[isoOf(hire + 7 * w + off)] = { h, m, attendance: att };
    }
  });
  for (const [iso, patch] of Object.entries(opts.patch ?? {})) days[iso] = { ...days[iso], ...patch };
  return evaluate({
    hireDate: opts.hire ?? HIRE,
    status: opts.endDate ? 'left' : 'employed',
    endDate: opts.endDate ?? '',
    checkStart: opts.checkStart ?? '',
    weekCount: opts.weekCount ?? scheduleByWeek.length,
    employmentType: opts.employmentType ?? 'hourly',
    wage: opts.wage ?? '10320',
    normalWeekdays: opts.normalWeekdays ?? [1, 2, 3, 4, 5],
    days,
    noWorkWeeks: opts.noWorkWeeks ?? [],
  });
}
const MWF = (t) => [[0, t], [2, t], [4, t]];
const summarize = (r) => r.result.weeks.map((w) => ({ week: w.week, status: w.status, rule: w.rule, amount: w.amount }));

describe('명세 7장 검증 사례', () => {
  test('사례 1: 평균 14시간 59분 → 4주 모두 지급 대상 아님(S5)', () => {
    const r = build([[[0, '8:00'], [2, '8:00']], [[1, '7:00'], [3, '7:00']], MWF('5:00'), [[1, '7:28'], [3, '7:28']]]);
    assert.equal(r.ok, true);
    for (const w of r.result.weeks) {
      assert.equal(w.status, 'ineligible');
      assert.equal(w.rule, 'S5');
      assert.equal(w.window.sum, 3596);
      assert.equal(w.window.text, '7/6(월)~8/2(일) · 1~4주차');
      assert.match(w.reason, /14시간 59분으로 15시간 미만/);
      assert.equal(w.amount, null);
    }
    assert.match(r.result.weeks[0].reason, /이 주만 보면 16시간 0분/);
  });

  test('사례 2: 평균 정확히 15시간 → 지급 대상, 주당 30,960원', () => {
    const r = build([MWF('5:00'), MWF('5:00'), MWF('5:00'), MWF('5:00')]);
    for (const w of r.result.weeks) {
      assert.deepEqual([w.status, w.rule, w.amount], ['eligible', 'S9', 30960]);
      assert.equal(w.window.sum, 3600);
      assert.equal(w.formula, '1일 소정근로시간 3시간 0분 × 시급 10,320원');
    }
    assert.equal(r.result.summary.total, 30960 * 4);
  });

  test('사례 3: 주별 12:00·18:00·10:30·19:30, 평균 15시간 → 지급 대상', () => {
    const r = build([[[1, '6:00'], [3, '6:00']], MWF('6:00'), [[1, '5:15'], [3, '5:15']], MWF('6:30')]);
    assert.deepEqual(r.result.weeks.map((w) => w.weekMinutes), [720, 1080, 630, 1170]);
    for (const w of r.result.weeks) assert.deepEqual([w.status, w.amount], ['eligible', 30960]);
  });

  test('사례 4: 주 18시간, 2주차 7/15(수) 결근 → 2주차만 지급 대상 아님(S2)', () => {
    const r = build([MWF('6:00'), MWF('6:00'), MWF('6:00'), MWF('6:00')], { patch: { '2026-07-15': { attendance: 'absent' } } });
    assert.deepEqual(summarize(r), [
      { week: 1, status: 'eligible', rule: 'S9', amount: 37152 },
      { week: 2, status: 'ineligible', rule: 'S2', amount: null },
      { week: 3, status: 'eligible', rule: 'S9', amount: 37152 },
      { week: 4, status: 'eligible', rule: 'S9', amount: 37152 },
    ]);
    assert.match(r.result.weeks[1].reason, /7월 15일\(수\)에 결근/);
  });

  test('사례 4-1·4-2: 휴가·지각(출근)은 결근 아님 → 지급 대상', () => {
    const r1 = build([MWF('6:00'), MWF('6:00'), MWF('6:00'), MWF('6:00')], { patch: { '2026-07-15': { attendance: 'excused' } } });
    assert.deepEqual([r1.result.weeks[1].status, r1.result.weeks[1].amount], ['eligible', 37152]);
    assert.match(r1.result.weeks[1].reason, /휴가·휴업 1일은 결근으로 보지 않습니다/);
    const r2 = build([MWF('6:00'), MWF('6:00'), MWF('6:00'), MWF('6:00')]);
    assert.equal(r2.result.weeks[1].status, 'eligible');
  });

  test('사례 5A: 실제 재직 17일(7/22 퇴사) → 1·2주차 지급 대상(예상액 보류), 3주차 S1', () => {
    const r = build([MWF('6:00'), MWF('6:00'), [[0, '6:00'], [2, '6:00']]], { endDate: '2026-07-22' });
    assert.equal(r.result.isShort, true);
    const [w1, w2, w3] = r.result.weeks;
    for (const w of [w1, w2]) {
      assert.equal(w.status, 'eligible');
      assert.equal(w.window.text, '7/6(월)~7/22(수) · 재직 17일 전체');
      assert.equal(w.window.sum, 2880);
      assert.match(w.reason, /평균 19시간 45분/);
      assert.equal(w.amount, null);
      assert.match(w.amountNote, /쟁점 D/);
    }
    assert.deepEqual([w3.status, w3.rule], ['ineligible', 'S1']);
    assert.match(w3.reason, /7월 22일\(수\)까지 재직해 이 주의 7일째\(7월 26일\(일\)\)/);
  });

  test('사례 5B: 재직 중, 3주차 근무표 누락 → 4주 모두 정보 부족(S3)', () => {
    const r = build([MWF('6:00'), MWF('6:00'), null, MWF('6:00')]);
    for (const w of r.result.weeks) {
      assert.deepEqual([w.status, w.rule], ['insufficient', 'S3']);
      assert.deepEqual(w.needs, [{ type: 'schedule', weeks: [3] }]);
      assert.match(w.reason, /3주차 7\/20\(월\)~7\/26\(일\) 근무표가 비어 있습니다/);
    }
  });

  test('사례 5B-1: 3주차를 근무 없음으로 확정 → 평균 13시간 30분, 지급 대상 아님', () => {
    const r = build([MWF('6:00'), MWF('6:00'), null, MWF('6:00')], { noWorkWeeks: [3] });
    for (const w of r.result.weeks) {
      assert.deepEqual([w.status, w.rule], ['ineligible', 'S5']);
      assert.match(w.reason, /13시간 30분/);
    }
  });

  test('사례 5B-2: 2주차 7/17(금) 출근 여부 미선택 → 2주차만 정보 부족(S6)', () => {
    const r = build([MWF('6:00'), MWF('6:00'), MWF('6:00'), MWF('6:00')], { patch: { '2026-07-17': { attendance: null } } });
    assert.deepEqual(r.result.weeks.map((w) => w.status), ['eligible', 'insufficient', 'eligible', 'eligible']);
    assert.equal(r.result.weeks[1].rule, 'S6');
    assert.deepEqual(r.result.weeks[1].needs, [{ type: 'attendance', dates: ['2026-07-17'] }]);
  });
});

describe('경계와 미확정 쟁점', () => {
  test('합계 3,599분은 미달, 3,600분은 충족', () => {
    const below = build([MWF('5:00'), MWF('5:00'), MWF('5:00'), [[0, '5:00'], [2, '5:00'], [4, '4:59']]]);
    assert.equal(below.result.weeks[0].status, 'ineligible');
    assert.match(below.result.weeks[0].reason, /14시간 59분/); // 899.75분 → 내림 표시
    const exact = build([MWF('5:00'), MWF('5:00'), MWF('5:00'), MWF('5:00')]);
    assert.equal(exact.result.weeks[0].status, 'eligible');
  });

  test('퇴직: 7일째(일요일)까지 재직하면 지급, 6일째(토요일) 퇴직이면 S1', () => {
    const sched = [MWF('6:00'), MWF('6:00'), MWF('6:00'), MWF('6:00'), MWF('6:00')];
    const sun = build(sched, { endDate: '2026-08-09' });
    assert.equal(sun.result.weeks[4].status, 'eligible');
    const sat = build(sched, { endDate: '2026-08-08' });
    assert.deepEqual([sat.result.weeks[4].status, sat.result.weeks[4].rule], ['ineligible', 'S1']);
  });

  test('빈칸과 0시간 구분: 0:00만 입력한 주는 입력된 주(근무 없음)로 본다', () => {
    const r = build([MWF('6:00'), MWF('6:00'), [[0, '0:00']], MWF('6:00')]);
    assert.equal(r.result.weeks[0].rule, 'S5'); // 누락(S3)이 아니라 평균 13:30으로 판정
    assert.equal(r.result.weeks[2].weekMinutes, 0);
  });

  test('쟁점 B: 5주차 이후 두 후보 기간의 결론이 다르면 정보 부족 + 별도 확인 필요(S4)', () => {
    // 1~4주차 주 16시간, 5~8주차 주 12시간 → 5주차: B1(2~5) 평균 15시간 / B2(5~8) 평균 12시간
    const s16 = [[0, '8:00'], [2, '8:00']];
    const s12 = [[0, '6:00'], [2, '6:00']];
    const r = build([s16, s16, s16, s16, s12, s12, s12, s12]);
    const w5 = r.result.weeks[4];
    assert.deepEqual([w5.status, w5.rule], ['insufficient', 'S4']);
    assert.match(w5.confirm, /별도 확인 필요/);
    // 4주차·8주차는 두 기준의 기간이 같아 확정
    assert.equal(r.result.weeks[3].status, 'eligible');
    assert.deepEqual([r.result.weeks[7].status, r.result.weeks[7].rule], ['ineligible', 'S5']);
  });

  test('쟁점 B: 두 후보 결론은 같지만 금액이 다르면 예상액만 보류', () => {
    const s20 = [[0, '8:00'], [2, '8:00'], [4, '4:00']];
    const s16 = [[0, '8:00'], [2, '8:00']];
    const r = build([s20, s20, s20, s20, s16, s16, s16, s16]);
    const w5 = r.result.weeks[4];
    assert.equal(w5.status, 'eligible');
    assert.equal(w5.amount, null);
    assert.match(w5.amountNote, /쟁점 B/);
    assert.equal(r.result.summary.total, null);
  });

  test('확인 시작일이 중간 주이면 평균에 필요한 앞 주를 요청', () => {
    const r = build([MWF('6:00'), MWF('6:00')], { checkStart: '2026-08-10', weekCount: 2 });
    assert.equal(r.result.weeks[0].week, 6);
    assert.equal(r.result.weeks[0].status, 'insufficient');
    assert.match(r.result.weeks[0].reason, /확인할 주 범위를 넓혀야/);
  });

  test('주중 입사: 1주 = 입사 요일부터 7일 (수요일 입사 → 수~화)', () => {
    const r = build([[[0, '5:00'], [2, '5:00'], [4, '5:00']]], { hire: '2026-07-08', weekCount: 1, endDate: '2026-07-14' });
    assert.equal(r.result.weeks[0].window.text, '7/8(수)~7/14(화) · 재직 7일 전체');
    assert.equal(r.result.weeks[0].status, 'eligible');
  });

  test('하루 8시간 초과분은 반영하지 않음, 월급제·일용직은 별도 확인', () => {
    const r = build([[[0, '10:00']], [[0, '10:00']], [[0, '10:00']], [[0, '10:00']]]);
    assert.equal(r.result.weeks[0].weekMinutes, 480);
    assert.equal(r.result.weeks[0].capped, true);
    const m = build([MWF('6:00'), MWF('6:00'), MWF('6:00'), MWF('6:00')], { employmentType: 'monthly' });
    assert.equal(m.result.weeks[0].status, 'eligible');
    assert.match(m.result.weeks[0].amountNote, /월급제/);
    const d = build([MWF('6:00')], { employmentType: 'daily' });
    assert.equal(d.result.blocked, true);
  });

  test('전부 휴가로 쉰 주는 지급 대상 아님(S8) + 별도 확인 필요', () => {
    const r = build([MWF('6:00'), MWF('6:00'), MWF('6:00'), MWF('6:00')], {
      patch: { '2026-07-13': { attendance: 'excused' }, '2026-07-15': { attendance: 'excused' }, '2026-07-17': { attendance: 'excused' } },
    });
    assert.deepEqual([r.result.weeks[1].status, r.result.weeks[1].rule], ['ineligible', 'S8']);
    assert.match(r.result.weeks[1].confirm, /취업규칙/);
  });

  test('입력 검증', () => {
    assert.deepEqual(parseTime('', ''), { ok: true, minutes: null });
    assert.deepEqual(parseTime('0', '0'), { ok: true, minutes: 0 });
    assert.deepEqual(parseTime('7', ''), { ok: true, minutes: 420 });
    assert.equal(parseTime('25', '0').ok, false);
    assert.equal(parseTime('3', '60').ok, false);
    assert.equal(parseTime('3.5', '').ok, false);
    const bad = evaluate({ hireDate: '', status: 'left', endDate: '', employmentType: 'hourly', wage: '1.5', normalWeekdays: [], days: { '2026-07-06': { h: 'a', m: '' } } });
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.hireDate && bad.errors.endDate && bad.errors.wage && bad.errors.normalWeekdays);
    const before = evaluate({ hireDate: '2026-07-10', status: 'left', endDate: '2026-07-09', employmentType: 'hourly', wage: '', normalWeekdays: [1] });
    assert.match(before.errors.endDate, /같거나 그 이후/);
  });
});
