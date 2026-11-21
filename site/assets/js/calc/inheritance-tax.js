/**
 * 상속세 모의계산 — 상속세 및 증여세법 제13조·제14조·제18조~제22조·제26조·제69조.
 *
 * 과세가액 = 상속재산 + 사전증여재산(상속인 10년·그 외 5년) − 채무 − 장례비용(500만~1,000만 원)
 * 상속공제 = 일괄공제 5억(또는 기초 2억 + 자녀 1인당 5천만 중 큰 금액, 배우자 단독상속은 기초공제만)
 *          + 배우자공제(배우자가 실제 상속받은 금액, 최소 5억·법정상속분 한도·최대 30억)
 *          + 금융재산공제(순금융재산 2천만 이하 전액, 1억 이하 2천만, 초과 20%·최대 2억)
 *   공제 합계는 과세가액에서 사전증여재산을 뺀 금액을 넘을 수 없다(공제 적용 한도).
 * 산출세액 = 세율(10~50%) − 신고세액공제 3%. 과세표준 50만 원 미만은 부과하지 않는다.
 * 동거주택·가업·영농 상속공제, 세대생략 할증, 증여세액공제, 단기재상속공제는 반영하지 않는다.
 */
import { getRule, sourceList } from '../rules/index.js';
import { parseAmount, parseCount, collect, floorWon, won, num, result, fail, unavailable } from './common.js';
import { progressive } from './tax-common.js';

export function financialDeduction(net) {
  if (net <= 20000000) return net;
  if (net <= 100000000) return 20000000;
  return Math.min(floorWon(net * 0.2), 200000000);
}

export function calculate(raw) {
  const v = collect({
    year: parseCount(raw.year, { label: '상속개시 연도', min: 2000, max: 2100 }),
    estate: parseAmount(raw.estate, { label: '상속재산가액' }),
    gifts: parseAmount(raw.gifts, { label: '합산 사전증여재산', required: false, allowZero: true }),
    debts: parseAmount(raw.debts, { label: '채무·공과금', required: false, allowZero: true }),
    funeral: parseAmount(raw.funeral, { label: '장례비용', required: false, allowZero: true }),
    financial: parseAmount(raw.financial, { label: '순금융재산', required: false, allowZero: true }),
    children: parseCount(raw.children, { label: '자녀 수', required: false, min: 0, max: 20, unit: '명' }),
    parents: parseCount(raw.parents, { label: '직계존속 수 (자녀가 없을 때)', required: false, min: 0, max: 4, unit: '명' }),
    spouseShare: parseAmount(raw.spouseShare, { label: '배우자가 실제 상속받는 금액', required: false, allowZero: true }),
  });
  if (raw.spouse !== 'yes' && raw.spouse !== 'no') { v.ok = false; v.errors.spouse = '배우자 생존 여부를 선택해 주세요.'; }
  if (v.ok && v.values.financial > v.values.estate) { v.ok = false; v.errors.financial = '순금융재산은 상속재산가액보다 클 수 없습니다.'; }
  if (!v.ok) return fail(v.errors);
  const { year, estate, gifts, debts, financial } = v.values;
  const children = v.values.children ?? 0;
  const parents = children > 0 ? 0 : (v.values.parents ?? 0);
  const spouse = raw.spouse === 'yes';
  const spouseShare = spouse ? (v.values.spouseShare ?? 0) : 0;
  if (!spouse && children === 0 && parents === 0) return fail({ children: '배우자·자녀·직계존속이 모두 없으면 이 계산기로 상속인 구성을 판단할 수 없습니다.' });
  const rule = getRule(year, 'inheritance');
  const gift = getRule(year, 'gift');
  for (const x of [rule, gift]) if (!x.ok) return unavailable(x.reason, sourceList(['inhStatus']));
  const h = rule.value; const g = gift.value;

  const funeralIn = v.values.funeral ?? 0;
  const funeral = Math.min(Math.max(funeralIn, h.funeralMin), h.funeralMax);
  const net = Math.max(estate - debts, 0); // 배우자 법정상속분 한도 계산의 기초
  const taxable = Math.max(estate + gifts - debts - funeral, 0);

  const spouseAlone = spouse && children === 0 && parents === 0;
  const personal = spouseAlone ? h.basic : Math.max(h.lumpSum, h.basic + h.childEach * children);
  const personalLabel = spouseAlone ? '기초공제 2억 (배우자 단독상속은 일괄공제 불가)' : (h.basic + h.childEach * children > h.lumpSum ? `기초 2억 + 자녀 ${children}명 × 5천만` : '일괄공제 5억');
  let spouseDed = 0; let ratio = 0;
  if (spouse) {
    ratio = children > 0 ? 1.5 / (1.5 + children) : parents > 0 ? 1.5 / (1.5 + parents) : 1;
    const legalLimit = Math.min(floorWon(net * ratio), h.spouseMax);
    spouseDed = Math.max(h.spouseMin, Math.min(spouseShare, legalLimit));
  }
  const finDed = financialDeduction(financial);
  const sumDed = personal + spouseDed + finDed;
  const cap = Math.max(taxable - gifts, 0);
  const deduction = Math.min(sumDed, cap);
  let taxBase = Math.max(taxable - deduction, 0);
  const belowMin = taxBase < g.minTaxBase;
  if (belowMin) taxBase = 0;
  const calc = progressive(taxBase, g.brackets);
  const filing = raw.filing === 'yes' ? floorWon(calc * g.filingCredit) : 0;
  const due = calc - filing;

  return result({
    meta: `${year}년 상속개시 · 상속재산 ${won(estate)} · ${spouse ? '배우자 있음' : '배우자 없음'} · 자녀 ${children}명${parents ? ` · 직계존속 ${parents}명` : ''}`,
    headline: { label: '예상 상속세 (납부할 세액)', value: won(due) },
    stats: [
      { label: '상속세 과세가액', value: won(taxable) },
      { label: '상속공제 합계', value: won(deduction) },
      { label: '예상 납부세액', value: won(due) },
    ],
    rows: [
      { label: '과세가액', value: `${won(estate)} + 사전증여 ${won(gifts)} − 채무 ${won(debts)} − 장례비 ${won(funeral)} = ${won(taxable)}` },
      { label: '인적공제', value: `${personalLabel} = ${won(personal)}` },
      { label: '배우자 상속공제', value: spouse ? `${won(spouseDed)} (법정상속분 ${num(ratio * 100, 1)}%, 최소 5억·최대 30억)` : '해당 없음' },
      { label: '금융재산 상속공제', value: won(finDed) },
      { label: '공제 적용 한도', value: sumDed > cap ? `공제 합계 ${won(sumDed)} → 한도 ${won(cap)} 적용` : `한도 ${won(cap)} 이내` },
      { label: '과세표준', value: belowMin ? '50만 원 미만 → 부과하지 않음' : won(taxBase) },
      { label: '산출세액 (10~50%)', value: won(calc) },
      { label: '신고세액공제 3%', value: raw.filing === 'yes' ? `− ${won(filing)}` : '적용 안 함' },
    ],
    formulas: [
      '과세가액 = 상속재산 + 사전증여재산 − 채무 − 장례비용',
      '상속공제 = 일괄공제 5억(또는 기초·인적공제) + 배우자공제(5억~30억) + 금융재산공제',
      '납부세액 = 과세표준 × 세율(10~50%, 누진공제) − 신고세액공제 3%',
    ],
    warnings: [
      '단순 모의계산입니다. 부동산·주식 평가, 동거주택·가업·영농 상속공제, 미성년자·연로자·장애인 공제, 세대생략 할증, 증여세액공제, 외국 납부세액은 반영하지 않았습니다. 실제 신고는 반드시 세무 전문가와 상의하세요.',
      '배우자공제가 5억 원을 넘으려면 신고기한 다음 날부터 9개월 안에 배우자 상속재산을 분할(등기 등)해야 합니다.',
      '2026년 정부 상속세 개정안(유산취득세 전환 등)은 국회 심사 중이라 반영하지 않았습니다. 확정되면 기준을 갱신합니다.',
      '상속개시일이 속한 달의 말일부터 6개월 안에 신고해야 신고세액공제 3%를 받습니다.',
    ],
    sources: sourceList(h.sources),
  });
}
