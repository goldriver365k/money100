/**
 * 주택 양도소득세 계산 — 소득세법 제89조·제95조·제103조·제104조.
 *
 * 양도차익 = 양도가액 − 취득가액 − 필요경비
 * 1세대1주택 비과세(요건 충족 시): 양도가액 12억 이하 전액 비과세, 초과 시 과세 양도차익 = 양도차익 × (양도가액 − 12억) ÷ 양도가액
 * 장기보유특별공제: 1세대1주택(보유 3년·거주 2년 이상) 보유 연 4% + 거주 연 4% (각 최대 40%)
 *                   그 외 보유 3년 이상 6% + 연 2% (최대 30%, 15년)
 *                   조정대상지역 다주택 중과 대상은 공제 없음
 * 과세표준 = 양도소득금액 − 기본공제 250만 원
 * 세율: 보유 1년 미만 70%, 2년 미만 60%, 그 외 기본세율. 조정대상지역 2주택 +20%p, 3주택 이상 +30%p (2026.5.10. 이후 양도분)
 *       중과와 단기세율이 겹치면 큰 세액. 지방소득세 10% 별도.
 */
import { getRule, sourceList } from '../rules/index.js';
import { parseAmount, parseDate, parseCount, collect, dateFromParts, korDate, floorWon, won, num, result, fail, unavailable } from './common.js';
import { progressive } from './tax-common.js';

export function fullYears(from, to) {
  let y = 0;
  while (dateFromParts(from.y + y + 1, from.m, from.d).t <= to.t) y += 1;
  return y;
}

export function calculate(raw) {
  const v = collect({
    sale: parseAmount(raw.sale, { label: '양도가액' }),
    acquisition: parseAmount(raw.acquisition, { label: '취득가액' }),
    expenses: parseAmount(raw.expenses, { label: '필요경비', required: false, allowZero: true }),
    acqDate: parseDate(raw.acqDate, { label: '취득일' }),
    saleDate: parseDate(raw.saleDate, { label: '양도일' }),
    residence: parseCount(raw.residence, { label: '거주기간', required: false, min: 0, max: 80, unit: '년' }),
  });
  const types = { oneHouse: '1세대1주택 (비과세 요건 충족)', general: '일반 (비과세 아님·중과 아님)', heavy2: '조정대상지역 2주택 중과', heavy3: '조정대상지역 3주택 이상 중과' };
  if (!types[raw.houseType]) { v.ok = false; v.errors.houseType = '주택 보유 상황을 선택해 주세요.'; }
  if (v.ok && v.values.saleDate.t <= v.values.acqDate.t) { v.ok = false; v.errors.saleDate = '양도일은 취득일보다 뒤여야 합니다.'; }
  if (!v.ok) return fail(v.errors);
  const { sale, acquisition, expenses, acqDate, saleDate } = v.values;
  const residence = v.values.residence ?? 0;
  const year = saleDate.y;
  const cg = getRule(year, 'capitalGains');
  const tax = getRule(year, 'incomeTax');
  for (const x of [cg, tax]) if (!x.ok) return unavailable(x.reason, sourceList(['cgtAct']));
  const c = cg.value; const r = tax.value;
  const holding = fullYears(acqDate, saleDate);
  if (residence > holding + 1) return fail({ residence: '거주기간은 보유기간보다 길 수 없습니다.' });
  const heavyCut = Date.UTC(2026, 4, 10);
  if ((raw.houseType === 'heavy2' || raw.houseType === 'heavy3') && saleDate.t < heavyCut) {
    return unavailable('2026년 5월 9일까지 양도분은 다주택 중과가 한시 배제되었습니다. 이 계산기는 2026년 5월 10일 이후 양도분의 중과를 계산합니다. 그 이전 양도는 "일반"을 선택하세요.', sourceList(['cgtHeavyEnd']));
  }

  const gain = sale - acquisition - expenses;
  const base = { meta: `양도 ${korDate(saleDate)} · 보유 ${holding}년 · 거주 ${residence}년 · ${types[raw.houseType]}`, sources: sourceList(c.sources) };
  if (gain <= 0) {
    return result({ ...base, headline: { label: '예상 양도소득세', value: '0원' }, stats: [{ label: '양도차익', value: won(gain) }, { label: '예상 세액', value: '0원' }],
      rows: [{ label: '판단', value: '양도차익이 없어 양도소득세가 없습니다. 양도차손은 같은 해 다른 양도소득과 통산될 수 있습니다.' }], formulas: [], warnings: [] });
  }
  if (raw.houseType === 'oneHouse' && sale <= c.highPriceLine) {
    return result({ ...base, headline: { label: '예상 양도소득세', value: '비과세 (0원)' }, stats: [{ label: '양도차익', value: won(gain) }, { label: '예상 세액', value: '0원' }],
      rows: [{ label: '판단', value: `1세대1주택 비과세 요건을 충족하고 양도가액이 ${won(c.highPriceLine)} 이하라 전액 비과세입니다.` }],
      formulas: ['1세대1주택 + 양도가액 12억 원 이하 → 비과세'], warnings: ['비과세 요건(2년 이상 보유, 조정대상지역 취득 시 2년 이상 거주, 1세대 판정 등)은 직접 확인해야 합니다.', '양도일이 속한 달의 말일부터 2개월 안에 예정신고합니다(비과세도 신고가 필요한 경우가 있습니다).'] });
  }

  const taxableGain = raw.houseType === 'oneHouse' ? floorWon(gain * (sale - c.highPriceLine) / sale) : gain;
  let ltRate = 0; let ltLabel = '해당 없음';
  const heavy = raw.houseType === 'heavy2' ? c.heavy.two : raw.houseType === 'heavy3' ? c.heavy.three : 0;
  if (!heavy && holding >= 3) {
    if (raw.houseType === 'oneHouse' && residence >= 2) {
      ltRate = Math.min(holding, 10) * 0.04 + Math.min(residence, 10) * 0.04;
      ltLabel = `1세대1주택: 보유 ${Math.min(holding, 10) * 4}% + 거주 ${Math.min(residence, 10) * 4}%`;
    } else {
      ltRate = Math.min(0.06 + (holding - 3) * 0.02, 0.3);
      ltLabel = `일반: 보유 ${holding}년 → ${num(ltRate * 100)}%`;
    }
  }
  const ltDed = floorWon(taxableGain * ltRate);
  const income = taxableGain - ltDed;
  const taxBase = Math.max(income - c.basicDeduction, 0);
  const basicTax = progressive(taxBase, r.rates);
  const heavyTax = heavy ? floorWon(basicTax + taxBase * heavy) : 0;
  const shortRate = holding < 1 ? c.shortTerm.under1 : holding < 2 ? c.shortTerm.under2 : 0;
  const shortTax = shortRate ? floorWon(taxBase * shortRate) : 0;
  const calc = Math.max(heavy ? heavyTax : basicTax, shortTax);
  const how = shortTax >= (heavy ? heavyTax : basicTax) && shortRate ? `단기 세율 ${num(shortRate * 100)}%` : heavy ? `기본세율 + ${num(heavy * 100)}%p 중과` : '기본세율';
  const local = floorWon(calc * r.localTaxRate);

  return result({
    ...base,
    headline: { label: '예상 양도소득세 (지방소득세 포함)', value: won(calc + local) },
    stats: [
      { label: '양도소득세', value: won(calc) },
      { label: '지방소득세', value: won(local) },
      { label: '합계', value: won(calc + local) },
    ],
    rows: [
      { label: '양도차익', value: `${won(sale)} − ${won(acquisition)} − 경비 ${won(expenses)} = ${won(gain)}` },
      { label: '과세 대상 양도차익', value: raw.houseType === 'oneHouse' ? `12억 초과분 안분: ${won(gain)} × (${won(sale)} − 12억) ÷ ${won(sale)} = ${won(taxableGain)}` : won(taxableGain) },
      { label: '장기보유특별공제', value: `${ltLabel} → − ${won(ltDed)}` },
      { label: '양도소득금액', value: won(income) },
      { label: '기본공제', value: `− ${won(c.basicDeduction)}` },
      { label: '과세표준', value: won(taxBase) },
      { label: '적용 세율', value: how },
      { label: '산출세액', value: won(calc) },
    ],
    formulas: [
      '양도차익 = 양도가액 − 취득가액 − 필요경비',
      '1세대1주택 12억 초과: 과세 양도차익 = 양도차익 × (양도가액 − 12억) ÷ 양도가액',
      '과세표준 = 양도차익 − 장기보유특별공제 − 기본공제 250만 원',
      '세율: 1년 미만 70%, 2년 미만 60%, 그 외 기본세율(조정대상지역 다주택 +20%p·+30%p, 장기보유특별공제 배제)',
    ],
    warnings: [
      '1세대1주택 비과세 요건, 주택 수 판정, 중과 배제 주택(일시적 2주택·장기임대·지방 저가주택 등)은 직접 확인해 선택해야 합니다. 판단이 어려우면 세무 전문가와 상의하세요.',
      '필요경비는 취득세·중개수수료·자본적 지출 등 증빙이 있는 금액만 인정됩니다.',
      '같은 해 다른 양도소득 합산, 감면(조세특례제한법), 부담부증여, 분양권·입주권은 반영하지 않았습니다.',
      '양도일이 속한 달의 말일부터 2개월 안에 예정신고해야 합니다.',
    ],
  });
}
