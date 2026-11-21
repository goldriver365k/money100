/**
 * 주택 재산세 계산 — 지방세법 제110조·제111조·제111조의2·제112조·제151조, 시행령 제109조.
 * 과세기준일 6월 1일 소유자에게 7월(주택분 1/2)·9월(1/2) 부과.
 * 과세표준 = 공시가격 × 공정시장가액비율 (일반 60%, 1세대1주택 공시가 3억 이하 43%·6억 이하 44%·초과 45%), 천원 미만 버림
 * 세율: 일반 0.1~0.4% 누진 / 1세대1주택 공시가격 9억 이하 특례 0.05~0.35%
 * 지방교육세 = 재산세 × 20%, 도시지역분 = 과세표준 × 0.14% (도시지역인 경우)
 * 세부담 상한(전년 대비)은 전년도 세액이 필요해 반영하지 않는다. 10원 미만 버림.
 */
import { getRule, sourceList } from '../rules/index.js';
import { parseAmount, parseCount, collect, floor10, won, num, result, fail, unavailable } from './common.js';
import { progressive } from './tax-common.js';

export function calculate(raw) {
  const v = collect({
    year: parseCount(raw.year, { label: '과세 연도', min: 2000, max: 2100 }),
    price: parseAmount(raw.price, { label: '주택 공시가격' }),
  });
  if (raw.owner !== 'one' && raw.owner !== 'multi') { v.ok = false; v.errors.owner = '1세대1주택 여부를 선택해 주세요.'; }
  if (!v.ok) return fail(v.errors);
  const { year, price } = v.values;
  const rule = getRule(year, 'propertyTax');
  if (!rule.ok) return unavailable(rule.reason, sourceList(['propRatio']));
  const p = rule.value;
  const one = raw.owner === 'one';
  const urban = raw.urban !== 'no';
  const ratio = one ? p.ratio.one.find((x) => price <= x.upTo).ratio : p.ratio.general;
  const taxBase = Math.floor(price * ratio / 1000) * 1000;
  const special = one && price <= p.specialMaxPrice;
  const prop = floor10(progressive(taxBase, special ? p.special : p.standard));
  const edu = floor10(prop * p.eduRate);
  const urb = urban ? floor10(taxBase * p.urbanRate) : 0;
  const total = prop + edu + urb;

  return result({
    meta: `${year}년 · 공시가격 ${won(price)} · ${one ? '1세대1주택' : '다주택·일반'} · ${urban ? '도시지역' : '도시지역 외'}`,
    headline: { label: '연간 예상 재산세 합계', value: won(total) },
    stats: [
      { label: '재산세 (본세)', value: won(prop) },
      { label: '지방교육세 + 도시지역분', value: won(edu + urb) },
      { label: '연간 합계 (7월·9월 반씩)', value: won(total) },
    ],
    rows: [
      { label: '공정시장가액비율', value: `${num(ratio * 100)}%${one ? ' (1세대1주택 특례)' : ''}` },
      { label: '과세표준', value: `${won(price)} × ${num(ratio * 100)}% = ${won(taxBase)} (천원 미만 버림)` },
      { label: '적용 세율', value: special ? '1세대1주택 특례세율 (0.05~0.35%)' : '표준세율 (0.1~0.4%)' },
      { label: '재산세', value: won(prop) },
      { label: '지방교육세 (20%)', value: won(edu) },
      { label: '도시지역분 (과세표준 × 0.14%)', value: urban ? won(urb) : '해당 없음' },
      { label: '7월·9월 각각', value: `약 ${won(floor10(total / 2))}` },
    ],
    formulas: [
      '과세표준 = 공시가격 × 공정시장가액비율',
      '재산세(표준): 6천만 이하 0.1%, 1.5억 이하 6만+0.15%, 3억 이하 19.5만+0.25%, 초과 57만+0.4%',
      '1세대1주택(공시가 9억 이하): 0.05%, 3만+0.1%, 9만+0.2%, 24만+0.35%',
      '지방교육세 = 재산세 × 20%, 도시지역분 = 과세표준 × 0.14%',
    ],
    warnings: [
      '전년 대비 세부담 상한(105~130%)은 전년도 세액이 필요해 반영하지 않았습니다. 집값이 많이 오른 해에는 실제 고지액이 더 적을 수 있습니다.',
      '부속토지·건축물 분리 과세, 감면(임대주택 등), 지역자원시설세는 반영하지 않았습니다. 종합부동산세는 별도입니다.',
      '세액이 20만 원 이하면 7월에 한 번에 부과될 수 있습니다.',
    ],
    sources: sourceList(p.sources),
  });
}
