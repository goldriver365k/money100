/**
 * 건강보험료 계산 — 국민건강보험법 제69조·제71조, 시행령 제41조.
 *  - 직장가입자: 보수월액 × 7.19% ÷ 2(근로자 부담) + 장기요양 0.9448% ÷ 2
 *    보수 외 소득이 연 2,000만 원을 넘으면 초과분 ÷ 12 × 소득평가율 × 7.19% (본인 전액) = 소득월액보험료
 *  - 지역가입자: 소득분만 계산 (연소득 × 평가율 ÷ 12 × 7.19%). 재산분(재산 점수)은 공단 점수표가 필요해 계산하지 않는다.
 * 10원 미만 버림.
 */
import { getRule, sourceList } from '../rules/index.js';
import { parseAmount, parseCount, collect, floor10, won, pct, result, fail, unavailable } from './common.js';

export function calculate(raw) {
  const type = raw.type === 'regional' ? 'regional' : raw.type === 'employee' ? 'employee' : null;
  const v = collect({
    year: parseCount(raw.year, { label: '기준 연도', min: 2000, max: 2100 }),
    pay: parseAmount(raw.pay, { label: type === 'regional' ? '연간 소득금액' : '보수월액', required: true }),
    extraIncome: parseAmount(raw.extraIncome, { label: '보수 외 연간 소득', required: false, allowZero: true }),
  });
  if (!type) { v.ok = false; v.errors.type = '가입자 유형을 선택해 주세요.'; }
  if (raw.incomeKind !== 'full' && raw.incomeKind !== 'half') { v.ok = false; v.errors.incomeKind = '소득 종류를 선택해 주세요.'; }
  if (!v.ok) return fail(v.errors);
  const { year, pay, extraIncome } = v.values;
  const health = getRule(year, 'health');
  const ltc = getRule(year, 'longTermCare');
  const ex = getRule(year, 'healthExtra');
  for (const x of [health, ltc, ex]) if (!x.ok) return unavailable(x.reason, sourceList(['healthAct']));
  const hr = health.value.rate; const lr = ltc.value.rateOfIncome;
  const evalRate = ex.value.evalRates[raw.incomeKind];
  const sources = sourceList([...health.value.sources, ...ltc.value.sources, ...ex.value.sources, 'roundingAct']);

  if (type === 'employee') {
    const h = floor10(pay * hr / 2);
    const l = floor10(pay * lr / 2);
    const over = Math.max(extraIncome - ex.value.threshold, 0);
    const extraMonthly = over * evalRate / 12;
    const eh = floor10(extraMonthly * hr);
    const el = floor10(extraMonthly * lr);
    const total = h + l + eh + el;
    return result({
      meta: `${year}년 · 직장가입자 · 보수월액 ${won(pay)} · 보수 외 소득 연 ${won(extraIncome)}`,
      headline: { label: '월 건강보험료 (근로자 부담, 장기요양 포함)', value: won(total) },
      stats: [
        { label: '건강보험 (근로자)', value: won(h) },
        { label: '장기요양 (근로자)', value: won(l) },
        { label: '월 합계 (소득월액보험료 포함)', value: won(total) },
      ],
      table: {
        head: ['구분', '산정 기준', '요율', '월 보험료'],
        rows: [
          ['보수월액 건강보험료', won(pay), `${pct(hr, 2)} ÷ 2`, won(h)],
          ['보수월액 장기요양보험료', won(pay), `${pct(lr, 4)} ÷ 2`, won(l)],
          ['소득월액 건강보험료', over ? `(${won(extraIncome)} − 2,000만) × ${evalRate * 100}% ÷ 12` : '연 2,000만 원 이하 → 없음', pct(hr, 2), won(eh)],
          ['소득월액 장기요양보험료', over ? '위와 같음' : '—', pct(lr, 4), won(el)],
        ],
        foot: ['합계', '', '', won(total)],
      },
      formulas: [`건강보험 = 보수월액 × ${pct(hr, 2)} ÷ 2 (사업주가 같은 금액 부담)`, `장기요양 = 보수월액 × ${pct(lr, 4)} ÷ 2`, '소득월액보험료 = (보수 외 소득 − 2,000만 원) × 소득평가율 ÷ 12 × 요율 (본인 전액)'],
      warnings: ['보수월액 상·하한과 경감(섬·벽지 등)은 반영하지 않았습니다.', '보수월액보험료는 다음 해 4월 보수총액 신고로 정산됩니다.'],
      sources,
    });
  }
  const monthly = pay * evalRate / 12;
  const h = floor10(monthly * hr);
  const l = floor10(monthly * lr);
  return result({
    meta: `${year}년 · 지역가입자 소득분 · 연소득 ${won(pay)} (${raw.incomeKind === 'half' ? '연금·근로소득 50% 평가' : '사업·이자·배당 등 100% 평가'})`,
    headline: { label: '월 소득분 보험료 (장기요양 포함, 재산분 제외)', value: won(h + l) },
    stats: [
      { label: '소득분 건강보험료', value: won(h) },
      { label: '소득분 장기요양보험료', value: won(l) },
      { label: '월 합계 (재산분 제외)', value: won(h + l) },
    ],
    rows: [
      { label: '소득월액', value: `${won(pay)} × ${evalRate * 100}% ÷ 12 = ${won(Math.floor(monthly))}` },
      { label: '건강보험료', value: `소득월액 × ${pct(hr, 2)} = ${won(h)}` },
      { label: '장기요양보험료', value: `소득월액 × ${pct(lr, 4)} = ${won(l)}` },
      { label: '재산분', value: '계산하지 않음 — 재산보험료부과점수(공단 점수표)가 필요합니다' },
    ],
    formulas: ['지역 소득분 = 연소득 × 소득평가율 ÷ 12 × 건강보험료율 (본인 전액)', '장기요양 = 소득월액 × 장기요양보험료율'],
    warnings: ['지역가입자는 주택·토지·자동차 등 재산분 보험료가 더해집니다. 정확한 금액은 국민건강보험공단 "지역보험료 모의계산"으로 확인하세요.', '지역가입자 최저보험료와 상한은 반영하지 않았습니다.'],
    sources,
  });
}
