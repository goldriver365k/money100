/**
 * '세전 월급' 자동 계산 도우미 (화면과 분리된 계산 로직 — 단위 테스트 대상).
 *
 * 두 방식
 *  - annual (연봉 ÷ 12)
 *      연봉에 포함된 상여금: 매달 나눠 받으면 월급에 포함, 상여 달에 따로 받으면 월급에서 제외
 *      연봉과 별도로 받는 상여금: '월 평균에 포함'을 고르면 ÷ 12 해서 더하고, 아니면 제외
 *      비과세 수당: 연봉에 포함되어 있으면 그대로(이미 연봉 안), 별도로 받으면 월급에 더한다
 *  - parts (기본급 + 수당)
 *      세전 월급 = 기본급 + 과세 수당 + 비과세 수당
 *
 * 중복 차감 방지: 계산기 엔진은 '과세 보수 = 세전 월급 − 월 비과세'로 계산하므로,
 * 여기서는 세전 월급에 비과세 수당을 반드시 포함하고 비과세 금액은 따로 돌려준다(비과세 칸에 한 번만 입력).
 * 원 단위: 12로 나눈 값은 원 미만을 버린다.
 */
import { parseAmount, collect, floorWon, won } from './common.js';

export function computeMonthlyPay(raw) {
  const mode = raw.mode === 'parts' ? 'parts' : raw.mode === 'annual' ? 'annual' : null;
  if (!mode) return { ok: false, errors: { mode: '계산 방식을 선택해 주세요.' } };

  if (mode === 'parts') {
    const v = collect({
      base: parseAmount(raw.base, { label: '기본급' }),
      allowance: parseAmount(raw.allowance, { label: '과세 수당', required: false, allowZero: true }),
      nonTaxable: parseAmount(raw.nonTaxable, { label: '비과세 수당', required: false, allowZero: true }),
    });
    if (!v.ok) return { ok: false, errors: v.errors };
    const { base, allowance, nonTaxable } = v.values;
    const pay = base + allowance + nonTaxable;
    return {
      ok: true, pay, nonTaxable, taxable: pay - nonTaxable,
      rows: [
        { label: '기본급', value: won(base) },
        { label: '과세 수당', value: won(allowance) },
        { label: '비과세 수당', value: won(nonTaxable) },
        { label: '세전 월급', value: `${won(pay)} (과세 ${won(pay - nonTaxable)} + 비과세 ${won(nonTaxable)})` },
      ],
      formula: '세전 월급 = 기본급 + 과세 수당 + 비과세 수당',
    };
  }

  const v = collect({
    annual: parseAmount(raw.annual, { label: '연봉' }),
    includedBonus: parseAmount(raw.includedBonus, { label: '연봉에 포함된 상여금', required: false, allowZero: true }),
    extraBonus: parseAmount(raw.extraBonus, { label: '연봉과 별도로 받는 상여금', required: false, allowZero: true }),
    nonTaxable: parseAmount(raw.nonTaxable, { label: '비과세 수당(월)', required: false, allowZero: true }),
  });
  if (v.ok && v.values.includedBonus >= v.values.annual) { v.ok = false; v.errors.includedBonus = '연봉에 포함된 상여금은 연봉보다 작아야 합니다.'; }
  if (v.ok && raw.nonTaxableIn === 'included' && v.values.nonTaxable * 12 >= v.values.annual - (raw.includedBonusPaid === 'separate' ? v.values.includedBonus : 0)) {
    v.ok = false; v.errors.nonTaxable = '연봉에 포함된 비과세 수당(월 × 12)이 월급으로 받는 연봉보다 큽니다.';
  }
  if (!v.ok) return { ok: false, errors: v.errors };
  const { annual, includedBonus, extraBonus, nonTaxable } = v.values;
  const bonusSeparate = raw.includedBonusPaid === 'separate';
  const extraInAvg = raw.extraBonusInAverage === 'yes';
  const ntIncluded = raw.nonTaxableIn !== 'separate'; // 기본: 연봉에 포함

  const monthlyBase = floorWon((annual - (bonusSeparate ? includedBonus : 0)) / 12);
  const extraMonthly = extraInAvg ? floorWon(extraBonus / 12) : 0;
  const ntAdd = ntIncluded ? 0 : nonTaxable;
  const pay = monthlyBase + extraMonthly + ntAdd;
  const rows = [
    { label: bonusSeparate && includedBonus ? '월급으로 받는 연봉 ÷ 12' : '연봉 ÷ 12', value: bonusSeparate && includedBonus ? `(${won(annual)} − 상여금 ${won(includedBonus)}) ÷ 12 = ${won(monthlyBase)}` : `${won(annual)} ÷ 12 = ${won(monthlyBase)}` },
  ];
  if (extraBonus) rows.push({ label: '별도 상여금', value: extraInAvg ? `${won(extraBonus)} ÷ 12 = ${won(extraMonthly)} (월 평균에 포함)` : '월급에서 제외 (상여 달에 따로 지급)' });
  if (nonTaxable) rows.push({ label: '비과세 수당', value: ntIncluded ? `${won(nonTaxable)} (연봉에 포함 — 더하지 않음)` : `+ ${won(nonTaxable)} (연봉과 별도)` });
  rows.push({ label: '세전 월급', value: `${won(pay)} (과세 ${won(pay - nonTaxable)} + 비과세 ${won(nonTaxable)})` });
  return {
    ok: true, pay, nonTaxable, taxable: pay - nonTaxable, rows,
    formula: '세전 월급 = (연봉 − 따로 받는 포함 상여금) ÷ 12 + 별도 상여금 ÷ 12(포함 시) + 연봉 외 비과세 수당, 원 미만 버림',
  };
}
