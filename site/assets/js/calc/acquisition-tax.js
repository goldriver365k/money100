/**
 * 취득세 계산 (유상 매매 취득) — 지방세법 제11조·제13조의2·제151조, 농어촌특별세법, 지방세특례제한법 제36조의3.
 *
 * 주택(개인) 기본세율: 6억 이하 1%, 6억 초과 9억 이하 (취득가 × 2/3억 − 3)%, 9억 초과 3%
 *   (세율은 소수점 다섯째 자리에서 반올림해 넷째 자리까지 — 백분율 기준 0.01%)
 * 중과(개인): 조정대상지역 2주택 8%·3주택 이상 12%, 비조정 3주택 8%·4주택 이상 12% / 법인 12%
 *   일시적 2주택은 기본세율. 주택 수 판정·중과 배제 주택은 사용자가 선택한다.
 * 지방교육세: 기본세율 주택 = 취득세율 × 1/2 × 20%, 중과·주택 외 = 0.4%
 * 농어촌특별세: 전용 85㎡ 초과 주택 0.2%(8% 중과 0.6%, 12% 중과 1.0%), 주택 외 0.2%
 * 생애최초 감면: 취득가 12억 이하 1주택, 취득세 최대 200만 원 감면
 */
import { getRule, sourceList } from '../rules/index.js';
import { parseAmount, parseCount, collect, floorWon, won, num, result, fail, unavailable } from './common.js';

export function houseRate(price, rule) {
  if (price <= rule.houseLow.upTo) return rule.houseLow.rate;
  if (price > rule.houseHigh.from) return rule.houseHigh.rate;
  const pctRate = (price * 2 / 300000000 - 3); // 백분율
  return Math.round(pctRate * 100) / 10000; // 0.01% 단위 (소수 넷째 자리)
}

export function calculate(raw) {
  const kind = raw.kind === 'nonHouse' ? 'nonHouse' : raw.kind === 'house' ? 'house' : null;
  const v = collect({
    year: parseCount(raw.year, { label: '취득 연도', min: 2000, max: 2100 }),
    price: parseAmount(raw.price, { label: '취득가액' }),
  });
  if (!kind) { v.ok = false; v.errors.kind = '취득 대상을 선택해 주세요.'; }
  const counts = { one: 1, two: 2, three: 3, four: 4, corp: 0 };
  if (kind === 'house' && !(raw.count in counts)) { v.ok = false; v.errors.count = '취득 후 주택 수를 선택해 주세요.'; }
  if (!v.ok) return fail(v.errors);
  const { year, price } = v.values;
  const rule = getRule(year, 'acquisition');
  if (!rule.ok) return unavailable(rule.reason, sourceList(['acqRate']));
  const a = rule.value;
  const regulated = raw.regulated === 'yes';
  const big = raw.area === 'over85';
  const temp = raw.temp === 'yes';

  let rate; let heavy = 0; let label;
  if (kind === 'nonHouse') { rate = a.nonHouse; label = '주택 외(토지·상가 등) 4%'; }
  else if (raw.count === 'corp') { rate = a.heavy12; heavy = 12; label = '법인 주택 취득 중과 12%'; }
  else {
    const n = counts[raw.count];
    if (n === 1 || (n === 2 && (!regulated || temp))) { rate = houseRate(price, a); label = n === 2 ? (temp ? '일시적 2주택 — 기본세율' : '비조정대상지역 2주택 — 기본세율') : '1주택 기본세율'; }
    else if ((n === 2 && regulated) || (n === 3 && !regulated)) { rate = a.heavy8; heavy = 8; label = n === 2 ? '조정대상지역 2주택 중과 8%' : '비조정대상지역 3주택 중과 8%'; }
    else { rate = a.heavy12; heavy = 12; label = n === 3 ? '조정대상지역 3주택 중과 12%' : '4주택 이상 중과 12%'; }
  }
  const acq = floorWon(price * rate);
  const eduRate = kind === 'house' && !heavy ? rate * 0.5 * 0.2 : 0.004;
  const edu = floorWon(price * eduRate);
  let farmRate = 0;
  if (kind === 'nonHouse') farmRate = 0.002;
  else if (big) farmRate = heavy === 12 ? 0.01 : heavy === 8 ? 0.006 : 0.002;
  const farm = floorWon(price * farmRate);

  let relief = 0;
  const firstHome = raw.firstHome === 'yes';
  if (firstHome) {
    if (kind !== 'house' || raw.count !== 'one') return fail({ firstHome: '생애최초 감면은 개인이 취득 후 1주택인 경우에만 선택할 수 있습니다.' });
    if (price > a.firstHome.maxPrice) return fail({ firstHome: `생애최초 감면은 취득가액 ${won(a.firstHome.maxPrice)} 이하 주택만 해당합니다.` });
    relief = Math.min(acq, a.firstHome.maxRelief);
  }
  const total = acq - relief + edu + farm;

  return result({
    meta: `${year}년 · ${kind === 'house' ? '주택' : '주택 외'} 매매 · 취득가 ${won(price)} · ${label}${kind === 'house' ? ` · ${regulated ? '조정대상지역' : '비조정대상지역'} · 전용 ${big ? '85㎡ 초과' : '85㎡ 이하'}` : ''}`,
    headline: { label: '예상 취득세 합계', value: won(total) },
    stats: [
      { label: '취득세', value: won(acq - relief) },
      { label: '지방교육세 + 농어촌특별세', value: won(edu + farm) },
      { label: '총 납부 예상', value: won(total) },
    ],
    table: {
      head: ['세목', '세율', '금액'],
      rows: [
        ['취득세', `${num(rate * 100, 2)}%`, won(acq)],
        ['생애최초 감면', firstHome ? `최대 ${num(a.firstHome.maxRelief / 10000)}만 원` : '해당 없음', relief ? `− ${won(relief)}` : '0원'],
        ['지방교육세', `${num(eduRate * 100, 3)}%`, won(edu)],
        ['농어촌특별세', farmRate ? `${num(farmRate * 100, 2)}%` : '비과세 (전용 85㎡ 이하 주택)', won(farm)],
      ],
      foot: ['합계', '', won(total)],
    },
    formulas: [
      '주택 기본세율: 6억 이하 1%, 6억~9억 (취득가 × 2/3억 − 3)%, 9억 초과 3%',
      '중과: 조정 2주택 8%, 조정 3주택·비조정 4주택 이상 12%, 비조정 3주택 8%, 법인 12%',
      '지방교육세: 기본세율 주택은 취득세율의 1/10, 중과·주택 외 0.4% / 농특세: 85㎡ 초과 주택 0.2%(중과 0.6%·1.0%)',
    ],
    warnings: [
      '조정대상지역 여부와 주택 수(분양권·입주권·오피스텔 포함 여부, 중과 배제 주택)는 직접 확인해 선택해야 합니다. 2025년 10월 15일부터 서울 전역과 경기 12곳이 조정대상지역입니다.',
      '증여·상속·원시취득, 지방 미분양·인구감소지역 감면, 생애최초 감면의 추징 요건(3개월 내 전입·3년 실거주)은 반영하지 않았습니다.',
      '감면액에 대한 농어촌특별세, 법무사 보수·채권 매입 비용은 포함하지 않았습니다. 정확한 세액은 위택스나 관할 시·군·구청에서 확인하세요.',
    ],
    sources: sourceList([...a.sources, ...(firstHome ? ['acqFirst'] : [])]),
  });
}
