/**
 * 증여세 모의계산 — 상속세 및 증여세법 제47조·제53조·제53조의2·제56조·제57조·제58조·제69조.
 *
 * 증여세 과세가액 = 이번 증여재산 + 10년 내 동일인(직계존속은 배우자 포함) 증여재산 합산
 * 과세표준 = 과세가액 − 증여재산공제(관계별, 10년 합산 한도에서 이미 쓴 공제 차감) − 혼인·출산 공제(최대 1억)
 * 산출세액 = 세율(10~50%) [+ 세대생략 할증 30%/40%] − 납부세액공제(합산 과거 증여 세액) − 신고세액공제 3%
 * 과세표준 50만 원 미만은 부과하지 않는다. 재산 평가(시가·감정가)는 사용자가 입력한 금액을 그대로 쓴다.
 */
import { getRule, sourceList } from '../rules/index.js';
import { parseAmount, parseCount, collect, floorWon, won, num, result, fail, unavailable } from './common.js';
import { progressive } from './tax-common.js';

export const RELATIONS = {
  spouse: '배우자',
  ascendantAdult: '직계존속 → 성년 자녀·손자녀',
  ascendantMinor: '직계존속 → 미성년 자녀·손자녀',
  descendant: '직계비속 → 부모·조부모',
  relative: '기타 친족 (6촌 이내 혈족, 4촌 이내 인척)',
  other: '그 밖의 사람',
};

export function calculate(raw) {
  const v = collect({
    year: parseCount(raw.year, { label: '증여 연도', min: 2000, max: 2100 }),
    value: parseAmount(raw.value, { label: '이번 증여재산가액' }),
    prior: parseAmount(raw.prior, { label: '10년 내 합산 증여재산', required: false, allowZero: true }),
    priorDeduction: parseAmount(raw.priorDeduction, { label: '이미 받은 증여재산공제', required: false, allowZero: true }),
    priorTax: parseAmount(raw.priorTax, { label: '합산 증여의 기납부 증여세', required: false, allowZero: true }),
    marriage: parseAmount(raw.marriage, { label: '혼인·출산 증여재산공제', required: false, allowZero: true }),
  });
  if (!RELATIONS[raw.relation]) { v.ok = false; v.errors.relation = '증여자와의 관계를 선택해 주세요.'; }
  if (!v.ok) return fail(v.errors);
  const { year, value, prior, priorDeduction, priorTax, marriage } = v.values;
  const rule = getRule(year, 'gift');
  if (!rule.ok) return unavailable(rule.reason, sourceList(['giftRate']));
  const g = rule.value;
  const asc = raw.relation === 'ascendantAdult' || raw.relation === 'ascendantMinor';
  if (marriage > 0 && !asc) return fail({ marriage: '혼인·출산 공제는 직계존속에게 받은 증여에만 적용됩니다.' });
  if (marriage > g.marriageBirth) return fail({ marriage: `혼인·출산 공제는 최대 ${won(g.marriageBirth)}입니다.` });
  const limit = g.deductions[raw.relation];
  if (priorDeduction > limit) return fail({ priorDeduction: `이 관계의 10년 공제 한도는 ${won(limit)}입니다.` });

  const taxable = value + prior;
  const deduction = Math.min(limit - priorDeduction, taxable);
  const mb = Math.min(marriage, Math.max(taxable - deduction, 0));
  let taxBase = Math.max(taxable - deduction - mb, 0);
  const belowMin = taxBase < g.minTaxBase;
  if (belowMin) taxBase = 0;
  const calc = progressive(taxBase, g.brackets);
  const skip = raw.skip === 'yes' && asc;
  const skipRate = skip ? (raw.relation === 'ascendantMinor' && value > 2000000000 ? g.skipRateMinorOver2b : g.skipRate) : 0;
  const surcharge = floorWon(calc * skipRate);
  const afterPrior = Math.max(calc + surcharge - priorTax, 0);
  const filing = raw.filing === 'yes' ? floorWon(afterPrior * g.filingCredit) : 0;
  const due = afterPrior - filing;

  return result({
    meta: `${year}년 증여 · ${RELATIONS[raw.relation]} · 이번 증여 ${won(value)}${prior ? ` · 10년 내 합산 ${won(prior)}` : ''}`,
    headline: { label: '예상 증여세 (납부할 세액)', value: won(due) },
    stats: [
      { label: '예상 납부세액', value: won(due) },
      { label: '과세표준', value: won(taxBase) },
      { label: '산출세액', value: won(calc + surcharge) },
    ],
    rows: [
      { label: '증여세 과세가액', value: `${won(value)} + 합산 ${won(prior)} = ${won(taxable)}` },
      { label: `증여재산공제 (${RELATIONS[raw.relation]}, 10년 한도 ${won(limit)})`, value: `− ${won(deduction)}${priorDeduction ? ` (이미 사용 ${won(priorDeduction)})` : ''}` },
      { label: '혼인·출산 증여재산공제', value: `− ${won(mb)}` },
      { label: '과세표준', value: belowMin ? '50만 원 미만 → 부과하지 않음' : won(taxBase) },
      { label: '산출세액 (10~50%)', value: won(calc) },
      { label: '세대생략 할증', value: skip ? `+ ${won(surcharge)} (${num(skipRate * 100)}%)` : '해당 없음' },
      { label: '납부세액공제 (합산 증여 기납부)', value: `− ${won(Math.min(priorTax, calc + surcharge))}` },
      { label: '신고세액공제 3%', value: raw.filing === 'yes' ? `− ${won(filing)}` : '적용 안 함 (기한 후 신고)' },
    ],
    formulas: [
      '과세표준 = (이번 증여 + 10년 내 합산 증여) − 증여재산공제 − 혼인·출산 공제',
      '산출세액: 1억 이하 10%, 5억 이하 20%(누진공제 1천만), 10억 이하 30%(6천만), 30억 이하 40%(1억6천만), 30억 초과 50%(4억6천만)',
      '납부세액 = 산출세액 + 세대생략 할증 − 기납부세액 공제 − 신고세액공제 3%',
    ],
    warnings: [
      '단순 모의계산입니다. 재산 평가(시가·유사매매사례가·감정가), 부담부증여, 비과세·과세가액 불산입, 창업자금·가업승계 특례, 가산세는 반영하지 않았습니다. 실제 신고는 세무 전문가와 상의하세요.',
      '증여일이 속한 달의 말일부터 3개월 안에 신고해야 신고세액공제 3%를 받습니다.',
      '혼인·출산 공제는 혼인신고일 전후 2년, 자녀 출생일(입양신고일)부터 2년 이내 증여에 적용되며 둘을 합쳐 1억 원이 한도입니다.',
    ],
    sources: sourceList(g.sources),
  });
}
