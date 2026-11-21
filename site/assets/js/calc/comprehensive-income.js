/**
 * 종합소득세 계산 — 소득세법 제14조(과세표준)·제55조(세율)·제59조의4(표준세액공제).
 *
 * 종합소득금액 = 사업소득금액(수입금액 − 필요경비) + 그 밖의 종합소득금액(근로·이자·배당·연금·기타 소득금액)
 * 과세표준 = 종합소득금액 − 기본공제(150만 원 × 인원) − 그 밖의 소득공제
 * 결정세액 = 기본세율 산출세액 − 세액공제·감면 (표준세액공제 7만 원은 근로소득이 없는 경우 선택)
 * 납부(환급)할 세액 = 결정세액 − 기납부세액(중간예납·원천징수 3% 등), 지방소득세 10% 별도
 * 필요경비는 장부(실제 경비) 또는 국세청 경비율로 계산한 금액을 사용자가 입력한다 — 업종별 경비율은 자동 적용하지 않는다.
 */
import { getRule, sourceList } from '../rules/index.js';
import { parseAmount, parseCount, collect, floorWon, won, num, result, fail, unavailable } from './common.js';
import { progressive, marginalRate } from './tax-common.js';

export function calculate(raw) {
  const v = collect({
    year: parseCount(raw.year, { label: '귀속 연도', min: 2000, max: 2100 }),
    revenue: parseAmount(raw.revenue, { label: '사업 수입금액', required: false, allowZero: true }),
    expense: parseAmount(raw.expense, { label: '필요경비', required: false, allowZero: true }),
    otherIncome: parseAmount(raw.otherIncome, { label: '그 밖의 종합소득금액', required: false, allowZero: true }),
    dependents: parseCount(raw.dependents, { label: '기본공제 인원(본인 포함)', min: 1, max: 20, unit: '명' }),
    deductions: parseAmount(raw.deductions, { label: '그 밖의 소득공제', required: false, allowZero: true }),
    credits: parseAmount(raw.credits, { label: '세액공제·감면 합계', required: false, allowZero: true }),
    prepaid: parseAmount(raw.prepaid, { label: '기납부세액', required: false, allowZero: true }),
  });
  if (v.ok && v.values.revenue === 0 && v.values.otherIncome === 0) { v.ok = false; v.errors.revenue = '사업 수입금액 또는 그 밖의 종합소득금액 중 하나는 입력해 주세요.'; }
  if (v.ok && v.values.expense > v.values.revenue) { v.ok = false; v.errors.expense = '필요경비가 수입금액보다 큽니다. 결손금은 이 계산기에서 다루지 않습니다.'; }
  if (!v.ok) return fail(v.errors);
  const { year, revenue, expense, otherIncome, dependents, deductions, credits, prepaid } = v.values;
  const tax = getRule(year, 'incomeTax');
  if (!tax.ok) return unavailable(tax.reason, sourceList(['incomeTaxRate']));
  const stdBiz = getRule(year, 'standardCreditBiz');

  const bizIncome = revenue - expense;
  const total = bizIncome + otherIncome;
  const basic = tax.value.personalDeductionPerPerson * dependents;
  const taxBase = Math.max(total - basic - deductions, 0);
  const calc = progressive(taxBase, tax.value.rates);
  const useStd = raw.standard === 'yes' && stdBiz.ok;
  const std = useStd ? stdBiz.value : 0;
  const decided = Math.max(calc - credits - std, 0);
  const due = decided - prepaid;
  const local = floorWon(decided * tax.value.localTaxRate);
  const localPrepaid = floorWon(prepaid * tax.value.localTaxRate);
  const localDue = local - localPrepaid;

  return result({
    meta: `${year}년 귀속 · 사업소득금액 ${won(bizIncome)} · 그 밖의 소득금액 ${won(otherIncome)} · 기본공제 ${dependents}명`,
    headline: { label: due >= 0 ? '추가 납부 예상 소득세' : '환급 예상 소득세', value: won(Math.abs(due)) },
    stats: [
      { label: '결정세액 (소득세)', value: won(decided) },
      { label: due >= 0 ? '추가 납부 예상 (소득세)' : '환급 예상 (소득세)', value: won(Math.abs(due)) },
      { label: localDue >= 0 ? '지방소득세 추가 납부' : '지방소득세 환급', value: won(Math.abs(localDue)) },
    ],
    rows: [
      { label: '사업소득금액', value: `${won(revenue)} − 필요경비 ${won(expense)} = ${won(bizIncome)}` },
      { label: '종합소득금액', value: won(total) },
      { label: `기본공제 (${dependents}명 × 150만 원)`, value: `− ${won(basic)}` },
      { label: '그 밖의 소득공제', value: `− ${won(deductions)}` },
      { label: '과세표준', value: `${won(taxBase)} (한계세율 ${num(marginalRate(taxBase, tax.value.rates) * 100)}%)` },
      { label: '산출세액', value: won(calc) },
      { label: '세액공제·감면', value: `− ${won(credits)}` },
      { label: '표준세액공제', value: useStd ? `− ${won(std)}` : '적용 안 함' },
      { label: '결정세액', value: won(decided) },
      { label: '기납부세액', value: `− ${won(prepaid)}` },
      { label: due >= 0 ? '납부할 세액' : '환급받을 세액', value: won(Math.abs(due)) },
    ],
    formulas: [
      '종합소득금액 = (사업 수입금액 − 필요경비) + 그 밖의 종합소득금액',
      '과세표준 = 종합소득금액 − 기본공제 − 그 밖의 소득공제',
      '결정세액 = 기본세율(6~45%) 산출세액 − 세액공제·감면 (− 표준세액공제 7만 원)',
      '납부(환급)할 세액 = 결정세액 − 기납부세액, 지방소득세는 결정세액의 10%',
    ],
    warnings: [
      '필요경비는 장부나 국세청 단순·기준경비율로 계산한 금액을 직접 입력해야 합니다. 업종별 경비율은 홈택스에서 확인하세요.',
      '분리과세 소득(금융소득 2천만 원 이하, 분리과세 선택 기타소득 등)은 종합소득금액에 넣지 마세요.',
      '표준세액공제 7만 원은 근로소득이 없고 특별세액공제를 받지 않는 경우에 선택할 수 있습니다. 성실신고확인 대상자 등은 공제액이 다릅니다.',
      '가산세·결손금 이월공제·중간예납 계산은 반영하지 않았습니다.',
    ],
    sources: sourceList([...tax.value.sources.filter((k) => k !== 'earnedDeduction' && k !== 'earnedCredit' && k !== 'ntsWithholding'), 'standardCreditBiz']),
  });
}
