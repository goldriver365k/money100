/**
 * 전세보증금 안전 점검 — 전세가율·선순위 포함 부채비율, 소액임차인 최우선변제, HUG 보증 주택가격 요건(참고).
 * 전세가율 = 보증금 ÷ 주택 시세
 * 부채비율 = (선순위 채권 + 선순위 임차보증금 + 내 보증금) ÷ 주택 시세
 * 위험 신호 구간(전세가율 70%·80%, 부채비율 70%·90%)은 정산노트 참고 기준(가정값)이며 법정 기준이 아니다.
 * 최우선변제: 주택임대차보호법 시행령 제10조·제11조 (기준일은 선순위 담보물권 설정일 — 현행 금액은 2023.2.21. 이후 설정분)
 * HUG 전세보증금반환보증: (선순위 채권 + 보증금) ≤ 공시가격 × 140% × 90% (참고, 상품·시기별 요건 별도)
 * 이 결과는 안전을 보증하지 않는다.
 */
import { STATIC_RULES, sourceList } from '../rules/index.js';
import { parseAmount, collect, floorWon, won, num, result, fail } from './common.js';

export function calculate(raw) {
  const S = STATIC_RULES;
  const v = collect({
    deposit: parseAmount(raw.deposit, { label: '내 전세보증금' }),
    price: parseAmount(raw.price, { label: '주택 시세(매매가)' }),
    senior: parseAmount(raw.senior, { label: '선순위 채권(근저당 채권최고액 등)', required: false, allowZero: true }),
    seniorDeposits: parseAmount(raw.seniorDeposits, { label: '선순위 임차보증금 합계', required: false, allowZero: true }),
    publicPrice: parseAmount(raw.publicPrice, { label: '공시가격', required: false, allowZero: true }),
  });
  const region = S.smallTenant.regions[raw.region];
  if (!region) { v.ok = false; v.errors.region = '주택 소재 지역을 선택해 주세요.'; }
  if (!v.ok) return fail(v.errors);
  const { deposit, price, senior, seniorDeposits, publicPrice } = v.values;
  const ref = S.jeonseReference;
  const ratio = deposit / price;
  const debt = (senior + seniorDeposits + deposit) / price;
  const level = (x, c, d) => (x >= d ? '위험' : x >= c ? '주의' : '양호');
  const ratioLevel = level(ratio, ref.ratioCaution, ref.ratioDanger);
  const debtLevel = level(debt, ref.debtCaution, ref.debtDanger);
  const small = deposit <= region.limit;
  const priority = small ? Math.min(region.amount, deposit) : 0;
  const hugLimit = publicPrice ? floorWon(publicPrice * S.hug.priceMultiplier * S.hug.ltv) : null;
  const hugOk = hugLimit != null ? senior + deposit <= hugLimit : null;
  const signals = [];
  if (ratioLevel !== '양호') signals.push(`전세가율 ${num(ratio * 100, 1)}% (${ratioLevel})`);
  if (debtLevel !== '양호') signals.push(`부채비율 ${num(debt * 100, 1)}% (${debtLevel})`);
  if (senior + seniorDeposits + deposit > price) signals.push('선순위와 보증금 합계가 시세보다 많음 — 경매 시 보증금 손실 가능성이 큽니다');
  if (hugOk === false) signals.push('HUG 보증 주택가격 요건(공시가격 126%) 초과 가능성');
  const overall = signals.length === 0 ? '뚜렷한 위험 신호 없음' : `위험 신호 ${signals.length}개`;

  return result({
    meta: `보증금 ${won(deposit)} · 시세 ${won(price)} · 선순위 채권 ${won(senior)} · 선순위 보증금 ${won(seniorDeposits)} · ${region.label}`,
    headline: { label: '점검 결과', value: overall },
    stats: [
      { label: '전세가율', value: `${num(ratio * 100, 1)}% · ${ratioLevel}` },
      { label: '부채비율 (선순위 포함)', value: `${num(debt * 100, 1)}% · ${debtLevel}` },
      { label: '최우선변제 (소액임차인)', value: small ? `해당 가능 · 최대 ${won(priority)}` : '해당 안 됨' },
    ],
    rows: [
      { label: '위험 신호', value: signals.length ? signals.join(' / ') : '없음 (참고 기준 이내)' },
      { label: '전세가율', value: `${won(deposit)} ÷ ${won(price)} = ${num(ratio * 100, 1)}% (참고: 70% 이상 주의, 80% 이상 위험)` },
      { label: '부채비율', value: `(${won(senior)} + ${won(seniorDeposits)} + ${won(deposit)}) ÷ ${won(price)} = ${num(debt * 100, 1)}% (참고: 70% 이상 주의, 90% 이상 위험)` },
      { label: '소액임차인 기준', value: `${region.label}: 보증금 ${won(region.limit)} 이하 → 최대 ${won(region.amount)} 우선변제 (2023.2.21. 이후 담보 설정 기준)` },
      { label: 'HUG 보증 주택가격 요건 (참고)', value: hugLimit == null ? '공시가격 미입력' : `공시가격 × 140% × 90% = ${won(hugLimit)} → 선순위 + 보증금 ${won(senior + deposit)} ${hugOk ? '이내' : '초과'}` },
    ],
    formulas: [
      '전세가율 = 보증금 ÷ 시세',
      '부채비율 = (선순위 채권 + 선순위 임차보증금 + 내 보증금) ÷ 시세',
      '최우선변제는 소액임차인 보증금 기준 이하일 때, 지역별 한도 안에서 주택가액의 1/2까지',
    ],
    warnings: [
      '이 점검은 입력한 숫자로 계산한 참고 지표이며 보증금의 안전을 보증하거나 법적으로 판단하지 않습니다.',
      '위험 신호 구간(70%·80%·90%)은 정산노트가 정한 참고 기준(가정값)입니다. 법정 기준이 아닙니다.',
      '최우선변제 기준은 계약일이 아니라 그 집에 가장 먼저 설정된 담보물권(근저당 등)의 설정일에 시행되던 법령으로 정해집니다. 등기부등본으로 확인하세요.',
      '계약 전 등기부등본(근저당·가압류·신탁), 건축물대장(위반건축물), 임대인 국세·지방세 완납증명, 확정일자·전입신고를 반드시 확인하세요. HUG 보증 가입 요건은 상품·시기별로 다릅니다.',
    ],
    sources: sourceList([...S.smallTenant.sources, ...S.hug.sources]),
  });
}
