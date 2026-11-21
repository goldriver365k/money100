/**
 * 2차-B 세금·보험 8종 (기대값은 손 계산)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as ci from '../../site/assets/js/calc/comprehensive-income.js';
import * as ye from '../../site/assets/js/calc/year-end-tax.js';
import * as fl from '../../site/assets/js/calc/freelancer-tax.js';
import * as it from '../../site/assets/js/calc/income-tax.js';
import * as hi from '../../site/assets/js/calc/health-insurance.js';
import * as np from '../../site/assets/js/calc/national-pension.js';
import * as gt from '../../site/assets/js/calc/gift-tax.js';
import * as ih from '../../site/assets/js/calc/inheritance-tax.js';
import { getRule } from '../../site/assets/js/rules/index.js';
import { progressive } from '../../site/assets/js/calc/tax-common.js';

const stat = (r, label) => r.stats.find((s) => s.label === label)?.value;
const row = (r, label) => r.rows.find((x) => x.label.startsWith(label))?.value;

describe('종합소득세', () => {
  const base = { year: '2026', revenue: '40000000', expense: '16000000', otherIncome: '0', dependents: '1', deductions: '0', credits: '0', standard: 'yes', prepaid: '1200000' };
  test('사업소득 2,400만 − 기본공제 150만 = 2,250만 → 2,115,000 − 7만 = 2,045,000, 기납부 120만 → 845,000 납부', () => {
    const r = ci.calculate(base);
    assert.equal(stat(r, '결정세액 (소득세)'), '2,045,000원');
    assert.equal(stat(r, '추가 납부 예상 (소득세)'), '845,000원');
    assert.equal(stat(r, '지방소득세 추가 납부'), '84,500원');
  });
  test('기납부가 크면 환급', () => {
    const r = ci.calculate({ ...base, prepaid: '3000000' });
    assert.equal(stat(r, '환급 예상 (소득세)'), '955,000원');
  });
  test('세액공제가 산출세액보다 크면 0', () => {
    assert.equal(stat(ci.calculate({ ...base, credits: '9000000' }), '결정세액 (소득세)'), '0원');
  });
  test('예외: 소득 없음·경비 초과·음수', () => {
    assert.ok(ci.calculate({ ...base, revenue: '0' }).errors.revenue);
    assert.ok(ci.calculate({ ...base, expense: '50000000' }).errors.expense);
    assert.ok(ci.calculate({ ...base, prepaid: '-1' }).errors.prepaid);
    assert.ok(ci.calculate({ ...base, year: '2027' }).unavailable);
  });
});

describe('연말정산 환급금', () => {
  const base = { year: '2026', totalPay: '50000000', dependents: '2', children: '1', pension: '2375000', insurance: '2276000', deductions: '1500000', credits: '300000', withheld: '2100000' };
  test('특별공제 경로 결정세액 1,819,850원 → 기납부 210만 대비 환급 280,150원', () => {
    const r = ye.calculate(base);
    assert.equal(stat(r, '결정세액'), '1,819,850원');
    assert.equal(r.headline.value, '280,150원');
    assert.equal(stat(r, '예상 환급 (소득세+지방소득세)'), '308,165원');
  });
  test('공제가 적으면 표준세액공제 경로 선택', () => {
    const r = ye.calculate({ ...base, insurance: '0', credits: '0', deductions: '0' });
    assert.equal(row(r, '표준세액공제'), '− 130,000원');
  });
  test('예외', () => {
    assert.ok(ye.calculate({ ...base, totalPay: '' }).errors.totalPay);
    assert.ok(ye.calculate({ ...base, children: '2' }).errors.children);
    assert.ok(ye.calculate({ ...base, withheld: '1.5' }).errors.withheld);
    assert.ok(ye.calculate({ ...base, year: '2027' }).unavailable);
  });
});

describe('3.3% 프리랜서', () => {
  const rule = getRule(2026, 'freelancer').value;
  test('1,234,567원 → 소득세 37,030 + 지방 3,700 → 실수령 1,193,837원', () => {
    const r = fl.calculate({ year: '2026', mode: 'fromGross', amount: '1234567' });
    assert.equal(stat(r, '원천징수 합계 (3.3%)'), '40,730원');
    assert.equal(stat(r, '실수령액'), '1,193,837원');
  });
  test('역산: 실수령 100만 원 → 지급액 1,034,120원', () => {
    assert.equal(fl.grossFromNet(1000000, rule), 1034120);
    assert.equal(fl.withholding(1034120, rule).net, 1000000);
  });
  test('소액: 10,000원 → 300 + 30', () => {
    assert.deepEqual(fl.withholding(10000, rule), { income: 300, local: 30, net: 9670 });
  });
  test('예외', () => {
    assert.ok(fl.calculate({ year: '2026', mode: 'fromGross', amount: '0' }).errors.amount);
    assert.ok(fl.calculate({ year: '2026', mode: '', amount: '100' }).errors.mode);
  });
});

describe('소득세', () => {
  test('과세표준 6,000만 → 6,240,000 + 1,000만 × 24% = 8,640,000원', () => {
    const r = it.calculate({ year: '2026', mode: 'taxBase', amount: '60000000' });
    assert.equal(stat(r, '산출세액 (소득세)'), '8,640,000원');
    assert.equal(stat(r, '지방소득세'), '864,000원');
  });
  test('세율 구간 경계 (1,400만·1.5억·10억)', () => {
    const rates = getRule(2026, 'incomeTax').value.rates;
    assert.equal(progressive(14000001, rates), 840000);
    assert.equal(progressive(150000000, rates), 37060000);
    assert.equal(progressive(1000000000, rates), 384060000);
    assert.equal(progressive(2000000000, rates), 834060000);
  });
  test('근로소득 방식은 연봉 엔진과 같은 산식', () => {
    const r = it.calculate({ year: '2026', mode: 'earned', amount: '30000000', dependents: '1', insurance: '0' });
    assert.ok(r.ok);
  });
  test('예외', () => {
    assert.ok(it.calculate({ year: '2026', mode: 'taxBase', amount: '-5' }).errors.amount);
    assert.ok(it.calculate({ year: '2027', mode: 'taxBase', amount: '5' }).unavailable);
  });
});

describe('건강보험료', () => {
  const base = { year: '2026', type: 'employee', pay: '3000000', extraIncome: '26000000', incomeKind: 'full' };
  test('직장: 107,850 + 14,170 + 소득월액(600만÷12=50만) 35,950 + 4,720 = 162,690원', () => {
    const r = hi.calculate(base);
    assert.equal(stat(r, '월 합계 (소득월액보험료 포함)'), '162,690원');
  });
  test('보수 외 소득 2,000만 원 이하는 추가 없음, 연금·근로는 50% 평가', () => {
    assert.equal(stat(hi.calculate({ ...base, extraIncome: '20000000' }), '월 합계 (소득월액보험료 포함)'), '122,020원'); // 107,850 + 14,170
    assert.equal(stat(hi.calculate({ ...base, incomeKind: 'half' }), '월 합계 (소득월액보험료 포함)'), '142,350원'); // + 25만 × (7.19%·0.9448%) = 17,970 + 2,360
  });
  test('지역 소득분: 연 3,600만 → 월 300만 × 7.19% = 215,700 + 28,340', () => {
    const r = hi.calculate({ ...base, type: 'regional', pay: '36000000' });
    assert.equal(stat(r, '월 합계 (재산분 제외)'), '244,040원');
  });
  test('예외·연도', () => {
    assert.ok(hi.calculate({ ...base, pay: '' }).errors.pay);
    assert.ok(hi.calculate({ ...base, type: '' }).errors.type);
    assert.ok(hi.calculate({ ...base, year: '2031' }).unavailable);
    assert.ok(hi.calculate({ ...base, year: '2027' }).ok); // 2027 건강·장기요양 요율 확정
  });
});

describe('국민연금', () => {
  const base = { year: '2026', month: '8', type: 'workplace', income: '3500000' };
  test('사업장: 350만 × 4.75% = 166,250원 (사업주 동일)', () => {
    const r = np.calculate(base);
    assert.equal(stat(r, '본인 부담'), '166,250원');
    assert.equal(stat(r, '사업주 부담'), '166,250원');
  });
  test('지역: 전액 본인 332,500원', () => {
    assert.equal(stat(np.calculate({ ...base, type: 'regional' }), '본인 부담'), '332,500원');
  });
  test('상한: 6월 637만·8월 659만, 하한 41만', () => {
    assert.equal(stat(np.calculate({ ...base, month: '6', income: '10000000' }), '본인 부담'), '302,570원');
    assert.equal(stat(np.calculate({ ...base, income: '10000000' }), '본인 부담'), '313,020원');
    assert.equal(stat(np.calculate({ ...base, income: '100000', type: 'regional' }), '본인 부담'), '38,950원');
  });
  test('예외·연도: 2027년 7월 이후 상·하한 미고시', () => {
    assert.ok(np.calculate({ ...base, income: '-1' }).errors.income);
    assert.ok(np.calculate({ ...base, year: '2027', month: '8' }).unavailable);
    assert.equal(stat(np.calculate({ ...base, year: '2027', month: '3', income: '3000000' }), '본인 부담'), '150,000원'); // 10% ÷ 2
  });
});

describe('증여세', () => {
  const base = { year: '2026', value: '150000000', relation: 'ascendantAdult', prior: '0', priorDeduction: '0', priorTax: '0', marriage: '0', skip: 'no', filing: 'yes' };
  test('성년 자녀 1.5억: 공제 5천만 → 과세표준 1억 → 1천만 − 3% = 970만 원', () => {
    const r = gt.calculate(base);
    assert.equal(stat(r, '예상 납부세액'), '9,700,000원');
  });
  test('혼인 공제 1억 추가 → 0원, 배우자 7억 → 970만 원', () => {
    assert.equal(stat(gt.calculate({ ...base, marriage: '100000000' }), '예상 납부세액'), '0원');
    assert.equal(stat(gt.calculate({ ...base, relation: 'spouse', value: '700000000' }), '예상 납부세액'), '9,700,000원');
  });
  test('세율 구간: 과세표준 5억 9천만, 10억 2.4억, 30억 10.4억', () => {
    const b = getRule(2026, 'gift').value.brackets;
    assert.deepEqual([progressive(500000000, b), progressive(1000000000, b), progressive(3000000000, b)], [90000000, 240000000, 1040000000]);
  });
  test('세대생략 30% 할증, 10년 합산·기납부세액 공제', () => {
    const r = gt.calculate({ ...base, skip: 'yes', filing: 'no' });
    assert.equal(stat(r, '예상 납부세액'), '13,000,000원');
    const s = gt.calculate({ ...base, value: '100000000', prior: '50000000', priorDeduction: '50000000', priorTax: '0' });
    assert.equal(stat(s, '과세표준'), '150,000,000원'); // 10년 공제 5천만을 이미 사용 → 합산 1.5억 전액 과세
  });
  test('과세최저한: 과세표준 50만 원 미만 0원', () => {
    assert.equal(stat(gt.calculate({ ...base, value: '50400000' }), '예상 납부세액'), '0원');
  });
  test('예외: 혼인공제는 직계존속만·1억 한도, 공제 한도 초과', () => {
    assert.ok(gt.calculate({ ...base, relation: 'spouse', marriage: '1000' }).errors.marriage);
    assert.ok(gt.calculate({ ...base, marriage: '100000001' }).errors.marriage);
    assert.ok(gt.calculate({ ...base, priorDeduction: '60000000' }).errors.priorDeduction);
    assert.ok(gt.calculate({ ...base, year: '2027' }).unavailable);
  });
});

describe('상속세', () => {
  const base = { year: '2026', estate: '2000000000', gifts: '0', debts: '100000000', funeral: '8000000', financial: '300000000', spouse: 'yes', spouseShare: '0', children: '2', parents: '0', filing: 'yes' };
  test('과세가액 18.92억 − 공제(5억+배우자 5억+금융 6천만) = 8.32억 → 1.896억 − 3% = 183,912,000원', () => {
    const r = ih.calculate(base);
    assert.equal(stat(r, '상속공제 합계'), '1,060,000,000원');
    assert.equal(stat(r, '예상 납부세액'), '183,912,000원');
  });
  test('금융재산공제 구간', () => {
    assert.deepEqual([ih.financialDeduction(15000000), ih.financialDeduction(80000000), ih.financialDeduction(500000000), ih.financialDeduction(2000000000)], [15000000, 20000000, 100000000, 200000000]);
  });
  test('배우자 단독상속은 기초공제 2억, 배우자공제 법정상속분 100%', () => {
    const r = ih.calculate({ ...base, children: '0', spouseShare: '1900000000' });
    assert.match(row(r, '인적공제'), /기초공제 2억/);
    assert.match(row(r, '배우자 상속공제'), /1,900,000,000원/);
  });
  test('10억 이하·배우자+자녀 → 0원, 장례비 하한 500만', () => {
    assert.equal(stat(ih.calculate({ ...base, estate: '1000000000', debts: '0', financial: '0', funeral: '0' }), '예상 납부세액'), '0원');
  });
  test('예외', () => {
    assert.ok(ih.calculate({ ...base, estate: '' }).errors.estate);
    assert.ok(ih.calculate({ ...base, financial: '3000000000' }).errors.financial);
    assert.ok(ih.calculate({ ...base, spouse: 'no', children: '0', parents: '0' }).errors.children);
    assert.ok(ih.calculate({ ...base, year: '2027' }).unavailable);
  });
});
