/**
 * 2차-C 주거·부동산 9종 (기대값은 손 계산)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as aq from '../../site/assets/js/calc/acquisition-tax.js';
import * as cg from '../../site/assets/js/calc/capital-gains-tax.js';
import * as bf from '../../site/assets/js/calc/brokerage-fee.js';
import * as rc from '../../site/assets/js/calc/rent-conversion.js';
import * as ds from '../../site/assets/js/calc/dsr-limit.js';
import * as pt from '../../site/assets/js/calc/property-tax.js';
import * as py from '../../site/assets/js/calc/pyeong.js';
import * as sp from '../../site/assets/js/calc/subscription-points.js';
import * as js from '../../site/assets/js/calc/jeonse-safety.js';
import * as ln from '../../site/assets/js/calc/loan.js';
import { getRule } from '../../site/assets/js/rules/index.js';

const stat = (r, label) => r.stats.find((s) => s.label === label)?.value;

describe('취득세', () => {
  const base = { year: '2026', kind: 'house', price: '700000000', count: 'one', regulated: 'no', temp: 'no', area: 'under85', firstHome: 'no' };
  const a = getRule(2026, 'acquisition').value;
  test('6~9억 세율: 7억 1.67%, 7.5억 2.00%, 경계 6억 1%·9억 3%', () => {
    assert.equal(aq.houseRate(700000000, a), 0.0167);
    assert.equal(aq.houseRate(750000000, a), 0.02);
    assert.equal(aq.houseRate(600000000, a), 0.01);
    assert.equal(aq.houseRate(900000000, a), 0.03);
    assert.equal(aq.houseRate(900000001, a), 0.03);
  });
  test('7억 1주택 85㎡ 이하: 11,690,000 + 교육세 1,169,000 = 12,859,000원', () => {
    assert.equal(stat(aq.calculate(base), '총 납부 예상'), '12,859,000원');
  });
  test('10억 85㎡ 초과: 3% + 0.3% + 0.2% = 3,500만 원', () => {
    assert.equal(stat(aq.calculate({ ...base, price: '1000000000', area: 'over85' }), '총 납부 예상'), '35,000,000원');
  });
  test('조정 2주택 5억 85㎡ 초과: 8% + 0.4% + 0.6% = 4,500만 원, 일시적 2주택은 기본세율', () => {
    assert.equal(stat(aq.calculate({ ...base, price: '500000000', count: 'two', regulated: 'yes', area: 'over85' }), '총 납부 예상'), '45,000,000원');
    assert.equal(stat(aq.calculate({ ...base, price: '500000000', count: 'two', regulated: 'yes', temp: 'yes' }), '취득세'), '5,000,000원');
  });
  test('생애최초 3억: 300만 − 200만 + 교육세 30만 = 130만 원', () => {
    assert.equal(stat(aq.calculate({ ...base, price: '300000000', firstHome: 'yes' }), '총 납부 예상'), '1,300,000원');
  });
  test('주택 외 1억: 4.6%', () => {
    assert.equal(stat(aq.calculate({ ...base, kind: 'nonHouse', price: '100000000' }), '총 납부 예상'), '4,600,000원');
  });
  test('예외: 생애최초 다주택·12억 초과, 빈 값, 2027년', () => {
    assert.ok(aq.calculate({ ...base, firstHome: 'yes', count: 'two' }).errors.firstHome);
    assert.ok(aq.calculate({ ...base, firstHome: 'yes', price: '1300000000' }).errors.firstHome);
    assert.ok(aq.calculate({ ...base, price: '' }).errors.price);
    assert.ok(aq.calculate({ ...base, year: '2027' }).unavailable);
  });
});

describe('양도소득세', () => {
  const base = { sale: '1500000000', acquisition: '800000000', expenses: '20000000', acqDate: '2016-05-20', saleDate: '2026-08-31', residence: '6', houseType: 'oneHouse' };
  test('1세대1주택 15억: 안분 1.36억 − 장특공 64% → 과세표준 46,460,000 → 5,709,000 + 지방 570,900', () => {
    const r = cg.calculate(base);
    assert.equal(stat(r, '양도소득세'), '5,709,000원');
    assert.equal(stat(r, '합계'), '6,279,900원');
  });
  test('1세대1주택 12억 이하 비과세', () => {
    assert.equal(stat(cg.calculate({ ...base, sale: '1200000000' }), '예상 세액'), '0원');
  });
  test('일반 5년 보유: 장특공 10% → 47,510,000원', () => {
    const r = cg.calculate({ ...base, sale: '500000000', acquisition: '300000000', expenses: '0', acqDate: '2021-01-10', saleDate: '2026-06-10', houseType: 'general', residence: '0' });
    assert.equal(stat(r, '양도소득세'), '47,510,000원');
  });
  test('단기 1년 미만 70%가 기본세율보다 크면 단기세율', () => {
    const r = cg.calculate({ ...base, sale: '400000000', acquisition: '300000000', expenses: '0', acqDate: '2026-01-10', saleDate: '2026-09-10', houseType: 'general', residence: '0' });
    assert.equal(stat(r, '양도소득세'), '68,250,000원');
  });
  test('조정 2주택 중과(2026.5.10. 이후): 장특공 없음, 기본세율 + 20%p = 94,610,000원', () => {
    const r = cg.calculate({ ...base, sale: '500000000', acquisition: '300000000', expenses: '0', acqDate: '2021-01-10', saleDate: '2026-06-10', houseType: 'heavy2', residence: '0' });
    assert.equal(stat(r, '양도소득세'), '94,610,000원');
  });
  test('중과 배제 기간(2026.5.9. 이전) 양도는 중과 계산 제한, 양도차손은 0원', () => {
    assert.ok(cg.calculate({ ...base, saleDate: '2026-05-09', houseType: 'heavy2' }).unavailable);
    assert.equal(stat(cg.calculate({ ...base, sale: '700000000' }), '예상 세액'), '0원');
  });
  test('보유연수 경계: 2016-05-20 → 2026-05-19 9년, 2026-05-20 10년', () => {
    const d = (s) => { const [y, m, dd] = s.split('-').map(Number); return { y, m, d: dd, t: Date.UTC(y, m - 1, dd) }; };
    assert.equal(cg.fullYears(d('2016-05-20'), d('2026-05-19')), 9);
    assert.equal(cg.fullYears(d('2016-05-20'), d('2026-05-20')), 10);
  });
  test('예외: 날짜 순서·거주기간 초과·빈 값·2027년', () => {
    assert.ok(cg.calculate({ ...base, saleDate: '2015-01-01' }).errors.saleDate);
    assert.ok(cg.calculate({ ...base, residence: '30' }).errors.residence);
    assert.ok(cg.calculate({ ...base, sale: '' }).errors.sale);
    assert.ok(cg.calculate({ ...base, saleDate: '2027-03-01' }).unavailable);
  });
});

describe('중개수수료', () => {
  const fee = (o) => stat(bf.calculate({ type: 'house', deal: 'sale', rent: '', ...o }), '중개보수 상한');
  test('주택 매매 구간: 8.5억 0.4%, 9.5억 0.5%, 1억 0.5%, 4,500만 한도 25만', () => {
    assert.equal(fee({ price: '850000000' }), '3,400,000원');
    assert.equal(fee({ price: '950000000' }), '4,750,000원');
    assert.equal(fee({ price: '100000000' }), '500,000원');
    assert.equal(fee({ price: '45000000' }), '250,000원');
    assert.equal(fee({ price: '1500000000' }), '10,500,000원');
  });
  test('월세 환산: 1천만+50만 → 6천만 × 0.4% = 24만, 500만+30만 → 2,600만 × 0.5% = 13만', () => {
    assert.equal(fee({ deal: 'monthly', price: '10000000', rent: '500000' }), '240,000원');
    assert.equal(fee({ deal: 'monthly', price: '5000000', rent: '300000' }), '130,000원');
  });
  test('오피스텔·주택 외', () => {
    assert.equal(fee({ type: 'officetel', price: '300000000' }), '1,500,000원');
    assert.equal(fee({ type: 'other', price: '300000000' }), '2,700,000원');
  });
  test('예외', () => {
    assert.ok(bf.calculate({ type: 'house', deal: 'sale', price: '' }).errors.price);
    assert.ok(bf.calculate({ type: 'house', deal: 'monthly', price: '0', rent: '' }).errors.rent);
    assert.ok(bf.calculate({ type: '', deal: 'sale', price: '1' }).errors.type);
  });
});

describe('전월세 전환', () => {
  test('법정 상한 = min(10%, 3% + 2%) = 5%: 2.5억 × 5% ÷ 12 = 1,041,666원', () => {
    const r = rc.calculate({ mode: 'toMonthly', jeonse: '300000000', deposit: '50000000', monthly: '', rate: '', baseRate: '3.00' });
    assert.equal(stat(r, '환산 월세'), '1,041,666원');
    assert.equal(stat(r, '법정 전환율 상한'), '5%');
  });
  test('월세 100만 → 전세: 5천만 + 2.4억 = 2.9억, 기준금리 9%면 상한 10%', () => {
    assert.equal(stat(rc.calculate({ mode: 'toJeonse', jeonse: '', deposit: '50000000', monthly: '1000000', rate: '', baseRate: '3' }), '환산 전세보증금'), '290,000,000원');
    assert.equal(stat(rc.calculate({ mode: 'toJeonse', deposit: '0', monthly: '1000000', baseRate: '9' }), '법정 전환율 상한'), '10%');
  });
  test('상한 초과 전환율 경고', () => {
    const r = rc.calculate({ mode: 'toMonthly', jeonse: '300000000', deposit: '0', rate: '6', baseRate: '3' });
    assert.match(r.warnings[0], /법정 상한/);
  });
  test('예외', () => {
    assert.ok(rc.calculate({ mode: 'toMonthly', jeonse: '', deposit: '0' }).errors.jeonse);
    assert.ok(rc.calculate({ mode: 'toMonthly', jeonse: '100', deposit: '100' }).errors.deposit);
    assert.ok(rc.calculate({ mode: 'toJeonse', monthly: '' }).errors.monthly);
  });
});

describe('DSR 대출한도', () => {
  test('원리금균등 역산: 1억·4.5%·30년 월 506,685원 ↔ 원금 1억 (대출이자 계산기와 일치)', () => {
    assert.equal(Math.round(ds.paymentFor(100000000, 4.5, 360)), 506685);
    assert.equal(ln.schedule(100000000, 4.5, 360, 'equalPayment').fixed, 506685);
    assert.ok(Math.abs(ds.principalFor(506685, 4.5, 360) - 100000000) < 100); // 월 상환액 원 단위 반올림 오차
  });
  test('연소득 6천만·기존 300만: 연 2,100만 상환 가능, 5.7%로 산정한 한도의 실제 상환액 ≤ 가능액', () => {
    const r = ds.calculate({ income: '60000000', existing: '3000000', rate: '4.2', stress: '1.5', years: '30', limit: '40' });
    const principal = Number(stat(r, '신규 대출 한도 (추정)').replace(/[^\d]/g, ''));
    assert.ok(ds.paymentFor(principal, 5.7, 360) * 12 <= 21000000);
    assert.ok(ds.paymentFor(principal + 10000, 5.7, 360) * 12 > 21000000 - 1000);
  });
  test('스트레스 금리가 크면 한도가 줄고, 기존 대출이 한도를 넘으면 0원', () => {
    const a = ds.calculate({ income: '60000000', existing: '0', rate: '4', stress: '0', years: '30' });
    const b = ds.calculate({ income: '60000000', existing: '0', rate: '4', stress: '3', years: '30' });
    const n = (r) => Number(stat(r, '신규 대출 한도 (추정)').replace(/[^\d]/g, ''));
    assert.ok(n(b) < n(a));
    assert.equal(stat(ds.calculate({ income: '50000000', existing: '20000000', rate: '4', years: '30' }), '추가 한도'), '0원');
  });
  test('예외', () => {
    assert.ok(ds.calculate({ income: '', rate: '4', years: '30' }).errors.income);
    assert.ok(ds.calculate({ income: '1', rate: '-1', years: '30' }).errors.rate);
    assert.ok(ds.calculate({ income: '1', rate: '4', years: '0' }).errors.years);
  });
});

describe('재산세', () => {
  test('1세대1주택 공시 5억: 44% → 2.2억 → 특례 230,000 + 교육 46,000 + 도시 308,000 = 584,000원', () => {
    assert.equal(stat(pt.calculate({ year: '2026', price: '500000000', owner: 'one', urban: 'yes' }), '연간 합계 (7월·9월 반씩)'), '584,000원');
  });
  test('다주택 공시 5억: 60% → 3억 → 570,000 + 114,000 + 420,000 = 1,104,000원', () => {
    assert.equal(stat(pt.calculate({ year: '2026', price: '500000000', owner: 'multi', urban: 'yes' }), '연간 합계 (7월·9월 반씩)'), '1,104,000원');
  });
  test('1세대1주택 공시 10억은 특례세율 미적용(9억 초과): 45% → 4.5억 → 1,170,000원', () => {
    assert.equal(stat(pt.calculate({ year: '2026', price: '1000000000', owner: 'one', urban: 'no' }), '재산세 (본세)'), '1,170,000원');
  });
  test('공정시장가액비율 경계: 3억 43%, 3억 1원 44%', () => {
    assert.match(pt.calculate({ year: '2026', price: '300000000', owner: 'one' }).rows[0].value, /43%/);
    assert.match(pt.calculate({ year: '2026', price: '300000001', owner: 'one' }).rows[0].value, /44%/);
  });
  test('예외·2027년', () => {
    assert.ok(pt.calculate({ year: '2026', price: '0', owner: 'one' }).errors.price);
    assert.ok(pt.calculate({ year: '2026', price: '1', owner: '' }).errors.owner);
    assert.ok(pt.calculate({ year: '2027', price: '500000000', owner: 'one' }).unavailable);
  });
});

describe('평수', () => {
  test('1평 = 400/121㎡, 84.97㎡ = 25.70평, 33평 = 109.09㎡', () => {
    assert.equal(py.M2_PER_PYEONG, 400 / 121);
    assert.equal(stat(py.calculate({ mode: 'toPyeong', value: '84.97' }), '평'), '25.7평');
    assert.equal(stat(py.calculate({ mode: 'toM2', value: '33' }), '제곱미터'), '109.09㎡');
    assert.ok(Math.abs(py.toM2(py.toPyeong(59)) - 59) < 1e-9);
  });
  test('예외: 0·음수·문자·소수 5자리', () => {
    assert.ok(py.calculate({ mode: 'toPyeong', value: '0' }).errors.value);
    assert.ok(py.calculate({ mode: 'toPyeong', value: '-3' }).errors.value);
    assert.ok(py.calculate({ mode: 'toPyeong', value: 'abc' }).errors.value);
    assert.ok(py.calculate({ mode: 'toPyeong', value: '1.12345' }).errors.value);
  });
});

describe('청약가점', () => {
  const base = { announce: '2026-12-01', birth: '1988-04-15', marriage: '2016-10-01', homeless: '', dependents: '3', account: '2012-03-10', spouseAccount: '2015-06-20' };
  test('30세 전 혼인 10년 22점 + 부양 3명 20점 + 통장 16점·배우자 3점(17점 한도) = 59점', () => {
    const r = sp.calculate(base);
    assert.equal(r.headline.value, '59점');
    assert.equal(stat(r, '청약통장 가입기간'), '17점 / 17');
  });
  test('만 30세 미만 미혼 0점, 부양가족 6명 이상 35점, 무주택 15년 이상 32점', () => {
    assert.equal(stat(sp.calculate({ ...base, birth: '2000-01-01', marriage: '' }), '무주택기간'), '0점 / 32');
    assert.equal(stat(sp.calculate({ ...base, dependents: '7' }), '부양가족'), '35점 / 35');
    assert.equal(stat(sp.calculate({ ...base, birth: '1970-01-01', marriage: '' }), '무주택기간'), '32점 / 32');
  });
  test('통장 점수 경계: 5개월 1점, 6개월 2점, 1년 3점, 15년 17점', () => {
    const d = (s) => { const [y, m, dd] = s.split('-').map(Number); return { y, m, d: dd, t: Date.UTC(y, m - 1, dd) }; };
    const to = d('2026-12-01');
    assert.deepEqual([d('2026-07-02'), d('2026-06-01'), d('2025-12-01'), d('2011-12-01')].map((f) => sp.accountPoints(f, to)), [1, 2, 3, 17]);
  });
  test('주택 처분일이 있으면 그 이후부터 무주택기간', () => {
    assert.equal(stat(sp.calculate({ ...base, homeless: '2023-05-01' }), '무주택기간'), '8점 / 32');
  });
  test('예외: 공고일 이후 날짜, 빈 값', () => {
    assert.ok(sp.calculate({ ...base, account: '2027-01-01' }).errors.account);
    assert.ok(sp.calculate({ ...base, birth: '' }).errors.birth);
    assert.ok(sp.calculate({ ...base, dependents: '-1' }).errors.dependents);
  });
});

describe('전세보증금 안전', () => {
  const base = { deposit: '250000000', price: '320000000', senior: '0', seniorDeposits: '0', publicPrice: '230000000', region: 'seoul' };
  test('전세가율 78.1% 주의, 부채비율 78.1% 주의, 서울 소액임차인 아님, HUG 요건 이내', () => {
    const r = js.calculate(base);
    assert.equal(stat(r, '전세가율'), '78.1% · 주의');
    assert.equal(stat(r, '최우선변제 (소액임차인)'), '해당 안 됨');
    assert.match(r.rows.at(-1).value, /이내/);
  });
  test('선순위 합계가 시세 초과 → 위험 신호, 소액임차인 서울 1.65억 이하 5,500만', () => {
    const r = js.calculate({ ...base, deposit: '150000000', senior: '200000000' });
    assert.equal(stat(r, '부채비율 (선순위 포함)'), '109.4% · 위험');
    assert.equal(stat(r, '최우선변제 (소액임차인)'), '해당 가능 · 최대 55,000,000원');
    assert.match(r.rows[0].value, /시세보다 많음/);
  });
  test('경계: 전세가율 정확히 70% 주의, 69.9% 양호', () => {
    assert.match(stat(js.calculate({ ...base, deposit: '224000000' }), '전세가율'), /주의/);
    assert.match(stat(js.calculate({ ...base, deposit: '223680000' }), '전세가율'), /양호/);
  });
  test('예외', () => {
    assert.ok(js.calculate({ ...base, deposit: '' }).errors.deposit);
    assert.ok(js.calculate({ ...base, price: '0' }).errors.price);
    assert.ok(js.calculate({ ...base, region: '' }).errors.region);
  });
});
