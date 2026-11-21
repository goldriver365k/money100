/**
 * 부동산 중개수수료(중개보수) 상한 계산 — 공인중개사법 시행규칙 제20조·별표 1 (2021.10.19. 시행), 시·도 조례.
 * 거래금액: 매매 = 매매가, 전세 = 보증금, 월세 = 보증금 + 월세 × 100 (그 값이 5천만 원 미만이면 보증금 + 월세 × 70)
 * 중개보수 상한 = 거래금액 × 상한요율 (구간별 한도액이 있으면 그 금액 이하). 원 미만 버림. 부가세 별도.
 * 주택 외(토지·상가 등)는 0.9% 이내에서 협의한다. 실제 금액은 상한 안에서 협의로 정한다.
 */
import { STATIC_RULES, sourceList } from '../rules/index.js';
import { parseAmount, collect, floorWon, won, num, result, fail } from './common.js';

export function dealAmount(deal, price, rent) {
  if (deal !== 'monthly') return { amount: price, note: deal === 'sale' ? '매매가' : '전세 보증금' };
  const a = price + rent * 100;
  if (a < 50000000) return { amount: price + rent * 70, note: `보증금 + 월세 × 70 (×100 환산 ${won(a)}이 5천만 원 미만)` };
  return { amount: a, note: '보증금 + 월세 × 100' };
}

export function calculate(raw) {
  const types = { house: '주택', officetel: '오피스텔 (전용 85㎡ 이하·주거용 설비)', other: '주택 외 (토지·상가·건물 등)' };
  const deals = { sale: '매매·교환', lease: '전세', monthly: '월세' };
  const v = collect({
    price: parseAmount(raw.price, { label: raw.deal === 'sale' ? '매매가' : '보증금', allowZero: raw.deal === 'monthly' }),
    rent: parseAmount(raw.rent, { label: '월세', required: raw.deal === 'monthly', allowZero: false }),
  });
  if (!types[raw.type]) { v.ok = false; v.errors.type = '부동산 종류를 선택해 주세요.'; }
  if (!deals[raw.deal]) { v.ok = false; v.errors.deal = '거래 유형을 선택해 주세요.'; }
  if (raw.deal !== 'monthly') delete v.errors.rent;
  if (Object.keys(v.errors).length) return fail(v.errors);
  const price = v.values.price ?? 0;
  const rent = raw.deal === 'monthly' ? v.values.rent : 0;
  const b = STATIC_RULES.brokerage;
  const { amount, note } = dealAmount(raw.deal, price, rent);
  const kind = raw.deal === 'sale' ? 'sale' : 'lease';

  let rate; let cap = null; let range = '';
  if (raw.type === 'house') {
    const tbl = b.house[kind];
    const i = tbl.findIndex((x) => amount < x.under);
    const seg = tbl[i];
    rate = seg.rate; cap = seg.cap ?? null;
    const lo = i === 0 ? 0 : tbl[i - 1].under;
    range = seg.under === Infinity ? `${num(lo / 1e8, 1)}억 원 이상` : `${lo ? `${lo >= 1e8 ? `${num(lo / 1e8, 1)}억` : `${num(lo / 1e4)}만`} 원 이상 ` : ''}${seg.under >= 1e8 ? `${num(seg.under / 1e8, 1)}억` : `${num(seg.under / 1e4)}만`} 원 미만`;
  } else if (raw.type === 'officetel') { rate = b.officetel[kind]; range = '오피스텔 고정 상한요율'; }
  else { rate = b.other; range = '주택 외 — 0.9% 이내 협의'; }
  const byRate = floorWon(amount * rate);
  const fee = cap != null ? Math.min(byRate, cap) : byRate;
  const vat = floorWon(fee * 0.1);

  return result({
    meta: `${types[raw.type]} · ${deals[raw.deal]} · 거래금액 ${won(amount)}`,
    headline: { label: '중개보수 상한 (부가세 별도)', value: won(fee) },
    stats: [
      { label: '중개보수 상한', value: won(fee) },
      { label: '상한요율', value: `${num(rate * 100, 1)}%${cap != null ? ` (한도 ${won(cap)})` : ''}` },
      { label: '부가세 포함 (일반과세 중개사)', value: won(fee + vat) },
    ],
    rows: [
      { label: '거래금액', value: `${note} = ${won(amount)}` },
      { label: '적용 구간', value: range },
      { label: '계산', value: `${won(amount)} × ${num(rate * 100, 1)}% = ${won(byRate)}${cap != null && byRate > cap ? ` → 한도 ${won(cap)} 적용` : ''}` },
      { label: '부가세 10% (일반과세자인 경우)', value: won(vat) },
    ],
    formulas: [
      '중개보수 상한 = 거래금액 × 상한요율 (구간 한도액 이하)',
      '월세 거래금액 = 보증금 + 월세 × 100 (5천만 원 미만이면 × 70)',
      '주택 매매 0.4~0.7%, 임대차 0.3~0.6% (구간별), 오피스텔 매매 0.5%·임대 0.4%, 그 밖 0.9% 이내',
    ],
    warnings: [
      '표시 금액은 법정 상한이며 실제 보수는 이 범위 안에서 중개사와 협의해 정합니다.',
      '간이과세자 중개사의 부가세는 다르게 적용될 수 있습니다. 중개사무소에 게시된 보수표를 확인하세요.',
      '분양권 매매는 거래금액 산정(납입금액 + 프리미엄)이 달라 이 계산과 다를 수 있습니다.',
    ],
    sources: sourceList(b.sources),
  });
}
