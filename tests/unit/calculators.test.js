/**
 * 1차 계산기 6종 검증: 정상 입력 / 빈 입력 / 음수 / 비정상 날짜 / 0원·소수점 / 경계값 / 연도 변경 / 공식 자료 대조
 * 공식 자료 대조값은 손으로 계산한 값 또는 공식 발표 수치(최저임금 월 환산액 등)를 쓴다.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as ns from '../../site/assets/js/calc/net-salary.js';
import * as si from '../../site/assets/js/calc/social-insurance.js';
import * as sv from '../../site/assets/js/calc/severance.js';
import * as ln from '../../site/assets/js/calc/loan.js';
import * as hr from '../../site/assets/js/calc/hourly.js';
import * as vt from '../../site/assets/js/calc/vat.js';
import { getRule, getPensionLimit, getYear } from '../../site/assets/js/rules/index.js';
import { YEARS, SOURCES } from '../../site/assets/js/rules/rules-data.js';
import { parseAmount, parseDecimal, parseDate, floor10 } from '../../site/assets/js/calc/common.js';

const stat = (r, label) => r.stats.find((s) => s.label === label)?.value;

describe('기준 데이터', () => {
  test('2026 공식 수치', () => {
    assert.equal(getRule(2026, 'minimumWage').value.hourly, 10320);
    assert.equal(getRule(2026, 'pension').value.rate, 0.095);
    assert.equal(getRule(2026, 'health').value.rate, 0.0719);
    assert.equal(getRule(2026, 'longTermCare').value.rateOfIncome, 0.009448);
    assert.equal(getRule(2026, 'employment').value.employeeRate, 0.009);
    assert.deepEqual([getPensionLimit(2026, 6).value.max, getPensionLimit(2026, 7).value.max], [6370000, 6590000]);
    assert.deepEqual([getPensionLimit(2026, 6).value.min, getPensionLimit(2026, 7).value.min], [400000, 410000]);
  });
  test('확인 전 값은 null + 사유, 없는 연도는 거부', () => {
    assert.equal(getRule(2027, 'incomeTax').ok, false);
    assert.match(getRule(2027, 'employment').reason, /확정되기 전/);
    assert.equal(getPensionLimit(2027, 7).ok, false);
    assert.equal(getPensionLimit(2027, 1).ok, true);
    assert.equal(getYear(2031).ok, false);
  });
  test('모든 출처 키가 정의되어 있다', () => {
    for (const y of Object.values(YEARS)) {
      for (const v of Object.values(y)) {
        if (v && Array.isArray(v.sources)) v.sources.forEach((k) => assert.ok(SOURCES[k], k));
      }
    }
  });
});

describe('공통 입력 검증', () => {
  test('금액: 빈 값·음수·소수·문자·0', () => {
    assert.equal(parseAmount('').ok, false);
    assert.match(parseAmount('-100').error, /0보다 작을/);
    assert.match(parseAmount('1000.5').error, /소수/);
    assert.match(parseAmount('abc').error, /숫자만/);
    assert.match(parseAmount('0').error, /0보다 커야/);
    assert.equal(parseAmount('0', { allowZero: true }).value, 0);
    assert.equal(parseAmount('1,234,567원').value, 1234567);
    assert.equal(parseAmount('', { required: false }).value, 0);
    assert.equal(parseAmount('1000000000000').ok, false);
  });
  test('소수: 자리수·범위', () => {
    assert.equal(parseDecimal('4.125', { decimals: 3, max: 30 }).value, 4.125);
    assert.equal(parseDecimal('4.1255', { decimals: 3 }).ok, false);
    assert.equal(parseDecimal('31', { max: 30 }).ok, false);
  });
  test('날짜: 존재하지 않는 날짜·형식 오류·브라우저 badInput', () => {
    assert.equal(parseDate('2026-02-30').ok, false);
    assert.equal(parseDate('2025-02-29').ok, false);
    assert.equal(parseDate('2024-02-29').ok, true);
    assert.equal(parseDate('2026/01/01').ok, false);
    assert.equal(parseDate('invalid').ok, false);
    assert.equal(parseDate('').ok, false);
  });
  test('10원 미만 버림', () => { assert.equal(floor10(13227.2), 13220); assert.equal(floor10(100660), 100660); });
});

describe('4대보험 계산기', () => {
  const base = { year: '2026', month: '3', pay: '3000000', nonTaxable: '200000', size: 'under150', industrialRate: '' };
  test('정상: 손 계산과 일치 (보수 280만 원)', () => {
    const r = si.calculate(base);
    // 국민연금 2,800,000×4.75%=133,000 / 건강 ×3.595%=100,660 / 장기요양 ×0.4724%=13,227→13,220 / 고용 ×0.9%=25,200
    assert.equal(stat(r, '근로자 부담'), '272,080원');
    // 사업주: 133,000+100,660+13,220+ 2,800,000×1.15%=32,200
    assert.equal(stat(r, '사업주 부담'), '279,080원');
  });
  test('국민연금 상한: 7월 전후 다르게 적용', () => {
    const jun = si.calculate({ ...base, month: '6', pay: '10000000', nonTaxable: '0' });
    const jul = si.calculate({ ...base, month: '7', pay: '10000000', nonTaxable: '0' });
    assert.equal(jun.table.rows[0][3], '302,570원'); // 6,370,000 × 4.75% = 302,575 → 302,570
    assert.equal(jul.table.rows[0][3], '313,020원'); // 6,590,000 × 4.75% = 313,025 → 313,020
    assert.ok(jul.warnings.some((w) => /상한/.test(w)));
  });
  test('국민연금 하한', () => {
    const r = si.calculate({ ...base, month: '7', pay: '300000', nonTaxable: '0' });
    assert.equal(r.table.rows[0][3], '19,470원'); // 410,000 × 4.75% = 19,475 → 19,470
  });
  test('산재 요율 입력 시 사업주에만 반영', () => {
    const r = si.calculate({ ...base, industrialRate: '0.7' });
    assert.equal(r.table.rows[4][4], '19,600원');
    assert.equal(r.table.rows[4][3], '0원');
  });
  test('빈 입력·음수·소수·0·비과세 초과', () => {
    assert.ok(si.calculate({ ...base, pay: '' }).errors.pay);
    assert.ok(si.calculate({ ...base, pay: '-1' }).errors.pay);
    assert.ok(si.calculate({ ...base, pay: '100.5' }).errors.pay);
    assert.ok(si.calculate({ ...base, pay: '0' }).errors.pay);
    assert.ok(si.calculate({ ...base, nonTaxable: '3000000' }).errors.nonTaxable);
    assert.ok(si.calculate({ ...base, size: '' }).errors.size);
    assert.ok(si.calculate({ ...base, industrialRate: '-1' }).errors.industrialRate);
  });
  test('연도 변경: 2027은 고용보험 미확정 → 계산 불가 사유', () => {
    const r = si.calculate({ ...base, year: '2027' });
    assert.equal(r.ok, false);
    assert.match(r.unavailable, /고용보험/);
  });
});

describe('연봉 실수령액 계산기', () => {
  const base = { year: '2026', salary: '50000000', nonTaxable: '200000', dependents: '1' };
  test('정상: 소득세법 산식 손 계산과 일치', () => {
    const r = ns.calculate(base);
    const kv = Object.fromEntries(r.rows.map((x) => [x.label, x.value]));
    // 총급여 47,599,992 → 근로소득공제 12,000,000 + 2,599,992×5% = 12,129,999
    assert.equal(kv['근로소득공제'], '− 12,129,999원');
    // 산출세액 = 840,000 + (29,345,193 − 14,000,000) × 15% = 3,141,778
    assert.equal(kv['과세표준'], '29,345,193원');
    assert.equal(kv['산출세액 (기본세율)'], '3,141,778원');
    // 근로소득세액공제 한도: 740,000 − 14,599,992×0.008 = 623,200 → 최소 660,000
    assert.equal(kv['근로소득세액공제'], '− 660,000원');
    assert.equal(kv['결정세액 (연간 소득세)'], '2,481,778원');
    assert.equal(stat(r, '월 예상 실수령액'), '3,553,771원');
  });
  test('세율 구간 경계: 과세표준 1,400만 원·5,000만 원', () => {
    const rule = getRule(2026, 'incomeTax').value;
    assert.equal(ns.basicTax(14000000, rule), 840000);
    assert.equal(ns.basicTax(50000000, rule), 6240000);
    assert.equal(ns.basicTax(88000000, rule), 15360000);
    assert.equal(ns.basicTax(0, rule), 0);
  });
  test('근로소득공제 한도 2,000만 원', () => {
    const rule = getRule(2026, 'incomeTax').value;
    assert.equal(ns.earnedIncomeDeduction(500000000, rule), 20000000);
    assert.equal(ns.earnedIncomeDeduction(5000000, rule), 3500000);
  });
  test('저소득: 1,500만 원은 표준세액공제 경로로 12,764원, 1,200만 원은 0원', () => {
    const k = (r) => Object.fromEntries(r.rows.map((x) => [x.label, x.value]));
    // 1,500만: 국민연금 59,370×12=712,440 → 과세표준 5,287,560 → 산출 317,253 − 세액공제 174,489 − 표준 130,000 = 12,764
    assert.equal(k(ns.calculate({ ...base, salary: '15000000', nonTaxable: '0' }))['결정세액 (연간 소득세)'], '12,764원');
    const r = ns.calculate({ ...base, salary: '12000000', nonTaxable: '0' });
    const kv = Object.fromEntries(r.rows.map((x) => [x.label, x.value]));
    assert.equal(kv['결정세액 (연간 소득세)'], '0원');
  });
  test('부양가족이 많을수록 세금이 줄어든다', () => {
    const a = ns.calculate(base); const b = ns.calculate({ ...base, dependents: '4' });
    const tax = (r) => Number(r.rows.at(-1).value.replace(/[^\d]/g, ''));
    assert.ok(tax(b) < tax(a));
  });
  test('빈 입력·음수·소수·0·범위', () => {
    assert.ok(ns.calculate({ ...base, salary: '' }).errors.salary);
    assert.ok(ns.calculate({ ...base, salary: '-5' }).errors.salary);
    assert.ok(ns.calculate({ ...base, salary: '5.5' }).errors.salary);
    assert.ok(ns.calculate({ ...base, salary: '0' }).errors.salary);
    assert.ok(ns.calculate({ ...base, dependents: '0' }).errors.dependents);
    assert.ok(ns.calculate({ ...base, dependents: '1.5' }).errors.dependents);
    assert.ok(ns.calculate({ ...base, nonTaxable: '5000000' }).errors.nonTaxable);
  });
  test('연도 변경: 2027 소득세 미확정 → 계산 불가', () => {
    const r = ns.calculate({ ...base, year: '2027' });
    assert.equal(r.ok, false);
    assert.match(r.unavailable, /2027년 귀속 소득세/);
  });
});

describe('퇴직금 계산기', () => {
  const base = { startDate: '2023-03-02', lastDate: '2026-02-28', wages3m: '9000000', bonus: '3000000', leavePay: '0', ordinaryDaily: '', hours15: 'yes' };
  test('정상: 고용노동부 산식 (평균임금 × 30 × 재직일수 ÷ 365)', () => {
    const r = sv.calculate(base);
    // 평균임금 총액 9,000,000 + 3,000,000×3/12 = 9,750,000, 3개월 90일 → 108,333.33원, 재직 1,095일
    assert.equal(stat(r, '예상 퇴직금 (세전)'), '9,750,000원');
    assert.equal(stat(r, '재직일수'), '1,095일');
  });
  test('통상임금이 더 크면 통상임금 적용', () => {
    const r = sv.calculate({ ...base, ordinaryDaily: '120000' });
    assert.equal(stat(r, '예상 퇴직금 (세전)'), '10,800,000원'); // 120,000 × 30 × 1095/365
    assert.match(stat(r, '1일 평균임금'), /통상임금/);
  });
  test('경계: 정확히 1년 (2025-03-02 ~ 2026-03-01) 대상, 하루 모자라면 대상 아님', () => {
    const ok = sv.calculate({ ...base, startDate: '2025-03-02', lastDate: '2026-03-01' });
    assert.notEqual(stat(ok, '예상 퇴직금 (세전)'), '0원');
    assert.equal(stat(ok, '재직일수'), '365일');
    const ng = sv.calculate({ ...base, startDate: '2025-03-02', lastDate: '2026-02-28' });
    assert.equal(stat(ng, '예상 퇴직금'), '0원');
  });
  test('윤년 포함 1년 (2023-03-01 ~ 2024-02-29) = 366일', () => {
    const r = sv.calculate({ ...base, startDate: '2023-03-01', lastDate: '2024-02-29' });
    assert.equal(stat(r, '재직일수'), '366일');
  });
  test('3개월 기간: 퇴직일 5월 31일 → 2월 말일부터', () => {
    const r = sv.calculate({ ...base, startDate: '2020-01-01', lastDate: '2026-05-30' });
    assert.match(r.rows[0].value, /2026년 2월 28일 ~ 2026년 5월 30일 \(92일\)/);
  });
  test('주 15시간 미만은 대상 아님', () => {
    assert.equal(stat(sv.calculate({ ...base, hours15: 'no' }), '예상 퇴직금'), '0원');
  });
  test('빈 입력·비정상 날짜·순서 오류·음수·소수', () => {
    assert.ok(sv.calculate({ ...base, startDate: '' }).errors.startDate);
    assert.ok(sv.calculate({ ...base, lastDate: '2026-02-30' }).errors.lastDate);
    assert.ok(sv.calculate({ ...base, lastDate: 'invalid' }).errors.lastDate);
    assert.ok(sv.calculate({ ...base, lastDate: '2020-01-01' }).errors.lastDate);
    assert.ok(sv.calculate({ ...base, wages3m: '-1' }).errors.wages3m);
    assert.ok(sv.calculate({ ...base, wages3m: '100.5' }).errors.wages3m);
    assert.ok(sv.calculate({ ...base, wages3m: '0' }).errors.wages3m);
    assert.ok(sv.calculate({ ...base, hours15: '' }).errors.hours15);
  });
});

describe('대출이자 계산기', () => {
  const base = { principal: '100000000', rate: '4.5', months: '360', method: 'equalPayment' };
  test('원리금균등: 1억·4.5%·30년 = 월 506,685원 (표준 공식)', () => {
    const r = ln.calculate(base);
    assert.equal(stat(r, '매달 상환액'), '506,685원');
  });
  test('원금균등: 1,200만 원·연 6%·12개월', () => {
    const s = ln.schedule(12000000, 6, 12, 'equalPrincipal');
    assert.equal(s.rows[0].principal, 1000000);
    assert.equal(s.rows[0].interest, 60000);
    assert.equal(s.totalInterest, 390000); // 60,000 × (12+11+…+1)/12 = 390,000
  });
  test('만기일시: 매달 이자만, 마지막에 원금', () => {
    const s = ln.schedule(12000000, 6, 12, 'bullet');
    assert.equal(s.rows[0].payment, 60000);
    assert.equal(s.rows[11].payment, 12060000);
    assert.equal(s.totalInterest, 720000);
  });
  test('모든 방식에서 원금 합계 = 대출 원금, 남은 원금 0', () => {
    for (const m of ['equalPayment', 'equalPrincipal', 'bullet']) {
      const s = ln.schedule(123456789, 3.875, 97, m);
      assert.equal(s.rows.reduce((a, x) => a + x.principal, 0), 123456789);
      assert.equal(s.rows.at(-1).balance, 0);
    }
  });
  test('이자율 0%·기간 1개월 경계', () => {
    const z = ln.schedule(1200000, 0, 12, 'equalPayment');
    assert.equal(z.totalInterest, 0); assert.equal(z.rows[0].payment, 100000);
    const one = ln.schedule(1000000, 12, 1, 'equalPayment');
    assert.equal(one.rows[0].payment, 1010000);
  });
  test('빈 입력·음수·소수·범위', () => {
    assert.ok(ln.calculate({ ...base, principal: '' }).errors.principal);
    assert.ok(ln.calculate({ ...base, rate: '-1' }).errors.rate);
    assert.ok(ln.calculate({ ...base, rate: '31' }).errors.rate);
    assert.ok(ln.calculate({ ...base, months: '0' }).errors.months);
    assert.ok(ln.calculate({ ...base, months: '12.5' }).errors.months);
    assert.ok(ln.calculate({ ...base, months: '601' }).errors.months);
    assert.ok(ln.calculate({ ...base, method: '' }).errors.method);
  });
});

describe('시급 계산기', () => {
  const base = { year: '2026', mode: 'monthlyToHourly', amount: '2156880', weeklyHours: '40' };
  test('공식 대조: 2026 최저임금 월 환산액 2,156,880원 = 10,320원 × 209시간', () => {
    const r = hr.calculate(base);
    assert.equal(stat(r, '환산 시급'), '10,320원');
    const back = hr.calculate({ ...base, mode: 'hourlyToMonthly', amount: '10320' });
    assert.equal(stat(back, '환산 월급 (주휴 포함)'), '2,156,880원');
  });
  test('공식 대조: 2027 최저임금 10,700원 × 209시간 = 2,236,300원', () => {
    const r = hr.calculate({ year: '2027', mode: 'hourlyToMonthly', amount: '10700', weeklyHours: '40' });
    assert.equal(stat(r, '환산 월급 (주휴 포함)'), '2,236,300원');
    assert.equal(stat(r, '2027년 최저임금 (시급)'), '10,700원');
  });
  test('주휴시간 경계: 15시간 미만 0, 15시간부터 비례, 40시간 8', () => {
    assert.equal(hr.holidayHours(14.9), 0);
    assert.equal(hr.holidayHours(15), 3);
    assert.equal(hr.holidayHours(20), 4);
    assert.equal(hr.monthlyHours(20).hours, 104); // (20+4)×365/84 = 104.29
    assert.equal(hr.monthlyHours(40).hours, 209);
  });
  test('최저임금 미달 표시', () => {
    const r = hr.calculate({ ...base, amount: '2000000' });
    assert.match(stat(r, '최저임금 비교'), /미달/);
  });
  test('빈 입력·음수·0·소수 자리·40시간 초과', () => {
    assert.ok(hr.calculate({ ...base, amount: '' }).errors.amount);
    assert.ok(hr.calculate({ ...base, amount: '-1' }).errors.amount);
    assert.ok(hr.calculate({ ...base, amount: '0' }).errors.amount);
    assert.ok(hr.calculate({ ...base, weeklyHours: '40.5' }).errors.weeklyHours);
    assert.ok(hr.calculate({ ...base, weeklyHours: '20.25' }).errors.weeklyHours);
    assert.ok(hr.calculate({ ...base, weeklyHours: '0' }).errors.weeklyHours);
    assert.ok(hr.calculate({ ...base, year: '2031' }).unavailable);
  });
});

describe('부가세 계산기', () => {
  const base = { year: '2026', mode: 'fromSupply', amount: '100000' };
  test('공급가액 → 합계', () => {
    const r = vt.calculate(base);
    assert.equal(stat(r, '부가세'), '10,000원'); assert.equal(stat(r, '합계 금액'), '110,000원');
  });
  test('합계 → 공급가액 (반올림, 합계 보존)', () => {
    const r = vt.calculate({ ...base, mode: 'fromTotal', amount: '1234567' });
    assert.equal(stat(r, '공급가액'), '1,122,334원'); // 1,234,567 ÷ 1.1 = 1,122,333.6 → 1,122,334
    assert.equal(stat(r, '부가세'), '112,233원');
  });
  test('끝수: 공급가액 15원 → 부가세 1원(버림)', () => {
    assert.equal(stat(vt.calculate({ ...base, amount: '15' }), '부가세'), '1원');
    assert.equal(stat(vt.calculate({ ...base, mode: 'fromTotal', amount: '1' }), '공급가액'), '1원');
  });
  test('빈 입력·음수·0·소수', () => {
    assert.ok(vt.calculate({ ...base, amount: '' }).errors.amount);
    assert.ok(vt.calculate({ ...base, amount: '-100' }).errors.amount);
    assert.ok(vt.calculate({ ...base, amount: '0' }).errors.amount);
    assert.ok(vt.calculate({ ...base, amount: '100.5' }).errors.amount);
    assert.ok(vt.calculate({ ...base, mode: '' }).errors.mode);
  });
  test('연도 변경: 2027도 10%', () => {
    assert.equal(stat(vt.calculate({ ...base, year: '2027' }), '부가세'), '10,000원');
  });
});
