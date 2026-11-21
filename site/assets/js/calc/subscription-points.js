/**
 * 청약 가점 계산 — 주택공급에 관한 규칙 제28조 및 별표 1 (민영주택 일반공급 가점제).
 * 무주택기간(32점): 만 30세(그 전에 혼인했으면 혼인신고일)부터 입주자모집공고일까지, 주택을 처분했다면 처분일 이후부터.
 *   만 30세 미만 미혼은 0점, 1년 미만 2점, 이후 1년마다 2점 (15년 이상 32점)
 * 부양가족(35점): 0명 5점, 1명마다 5점 (6명 이상 35점)
 * 입주자저축 가입기간(17점): 6개월 미만 1점, 6개월~1년 2점, 이후 1년마다 1점 (15년 이상 17점)
 *   배우자 가입기간 점수의 50%(최대 3점)를 합산하되 합계 17점 한도
 * 국민주택(공공분양)은 가점제가 아니라 순차제(납입 횟수·저축 총액)로 선정한다.
 */
import { STATIC_RULES, sourceList } from '../rules/index.js';
import { parseDate, parseCount, collect, dateFromParts, korDate, result, fail } from './common.js';

const fullYears = (from, to) => { let y = 0; while (dateFromParts(from.y + y + 1, from.m, from.d).t <= to.t) y += 1; return y; };
const fullMonths = (from, to) => { let m = 0; while (dateFromParts(from.y, from.m + m + 1, from.d).t <= to.t) m += 1; return m; };

export function accountPoints(from, to) {
  if (!from || from.t > to.t) return 0;
  const months = fullMonths(from, to);
  if (months < 6) return 1;
  if (months < 12) return 2;
  return Math.min(2 + Math.floor(months / 12), 17);
}

export function calculate(raw) {
  const v = collect({
    announce: parseDate(raw.announce, { label: '입주자모집공고일' }),
    birth: parseDate(raw.birth, { label: '생년월일' }),
    marriage: parseDate(raw.marriage, { label: '혼인신고일', required: false }),
    homeless: parseDate(raw.homeless, { label: '마지막 주택 처분일', required: false }),
    dependents: parseCount(raw.dependents, { label: '부양가족 수', min: 0, max: 20, unit: '명' }),
    account: parseDate(raw.account, { label: '청약통장 가입일' }),
    spouseAccount: parseDate(raw.spouseAccount, { label: '배우자 청약통장 가입일', required: false }),
  });
  if (!v.ok) return fail(v.errors);
  const { announce, birth, marriage, homeless, dependents, account, spouseAccount } = v.values;
  for (const [k, d, lab] of [['birth', birth, '생년월일'], ['account', account, '청약통장 가입일'], ['marriage', marriage, '혼인신고일'], ['homeless', homeless, '주택 처분일'], ['spouseAccount', spouseAccount, '배우자 가입일']]) {
    if (d && d.t > announce.t) return fail({ [k]: `${lab}은(는) 입주자모집공고일보다 이전이어야 합니다.` });
  }
  if (marriage && marriage.t < birth.t) return fail({ marriage: '혼인신고일이 생년월일보다 이릅니다.' });
  const H = STATIC_RULES.housingPoints;

  const age30 = dateFromParts(birth.y + 30, birth.m, birth.d);
  let start = null;
  if (age30.t <= announce.t) start = age30;
  if (marriage && marriage.t < age30.t) start = marriage;
  if (start && homeless && homeless.t > start.t) start = homeless;
  let homelessYears = null; let hp = 0;
  if (start) { homelessYears = fullYears(start, announce); hp = Math.min(2 + homelessYears * 2, H.homelessMax); }
  const dp = Math.min(5 + dependents * 5, H.dependentsMax);
  const ap = accountPoints(account, announce);
  const sp = spouseAccount ? Math.min(Math.floor(accountPoints(spouseAccount, announce) / 2), H.spouseAccountMax) : 0;
  const acc = Math.min(ap + sp, H.accountMax);
  const total = hp + dp + acc;

  return result({
    meta: `공고일 ${korDate(announce)} · 부양가족 ${dependents}명`,
    headline: { label: '청약 가점 합계 (84점 만점)', value: `${total}점` },
    stats: [
      { label: '무주택기간', value: `${hp}점 / 32` },
      { label: '부양가족', value: `${dp}점 / 35` },
      { label: '청약통장 가입기간', value: `${acc}점 / 17` },
    ],
    rows: [
      { label: '무주택기간 시작', value: start ? `${korDate(start)} (${marriage && start === marriage ? '30세 전 혼인신고일' : start === homeless ? '주택 처분 다음 기준' : '만 30세'})` : '만 30세 미만 미혼 → 0점' },
      { label: '무주택기간', value: start ? `${homelessYears}년 → ${hp}점` : '0점' },
      { label: '부양가족', value: `${dependents}명 → ${dp}점` },
      { label: '본인 통장', value: `${korDate(account)} 가입 → ${ap}점` },
      { label: '배우자 통장 (50%, 최대 3점)', value: spouseAccount ? `${sp}점` : '입력 안 함' },
      { label: '합계', value: `${hp} + ${dp} + ${acc} = ${total}점` },
    ],
    formulas: [
      '무주택기간: 1년 미만 2점, 1년마다 +2점, 15년 이상 32점 (만 30세 또는 30세 전 혼인신고일부터)',
      '부양가족: 0명 5점, 1명마다 +5점, 6명 이상 35점',
      '통장 가입기간: 6개월 미만 1점, 1년 미만 2점, 1년마다 +1점, 15년 이상 17점 (배우자 50% 최대 3점 합산)',
    ],
    warnings: [
      '가점제는 민영주택 일반공급에 적용됩니다. 국민주택(공공분양)은 순차제, 특별공급은 별도 기준으로 선정합니다.',
      '부양가족은 세대원으로 등록된 배우자·직계존속(3년 이상)·미혼 자녀 등 요건이 있습니다. 무주택 판정에서 소형·저가주택 예외도 있으니 청약홈에서 확인하세요.',
      '가점을 잘못 입력해 당첨되면 부적격으로 당첨이 취소될 수 있습니다.',
    ],
    sources: sourceList(H.sources),
  });
}
