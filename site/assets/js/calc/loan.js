/**
 * 대출이자 계산 (원리금균등·원금균등·만기일시 상환).
 *
 * 월 이자율 r = 연이율 ÷ 12. 매달 이자 = 남은 원금 × r (원 단위 반올림).
 * - 원리금균등: 월 상환액 = P × r × (1+r)^n ÷ ((1+r)^n − 1) (원 단위 반올림), 마지막 달에 남은 원금을 모두 갚는다.
 * - 원금균등: 매달 원금 = P ÷ n (원 미만 버림), 마지막 달에 나머지 원금을 더한다.
 * - 만기일시: 매달 이자만 내고 마지막 달에 원금을 갚는다.
 * 금융회사마다 일수 계산(일할 365일 기준 등)과 끝수 처리가 달라 실제 상환액과 몇 원~수천 원 차이가 날 수 있다.
 */
import { sourceList } from '../rules/index.js';
import { parseAmount, parseDecimal, parseCount, collect, won, num, result, fail } from './common.js';

export const METHOD_LABELS = { equalPayment: '원리금균등 상환', equalPrincipal: '원금균등 상환', bullet: '만기일시 상환' };

export function schedule(principal, annualRatePct, months, method) {
  const r = annualRatePct / 100 / 12;
  const rows = [];
  let balance = principal;
  let fixed = 0;
  if (method === 'equalPayment') {
    fixed = r === 0 ? Math.round(principal / months) : Math.round(principal * r * (1 + r) ** months / ((1 + r) ** months - 1));
  }
  const basePrincipal = Math.floor(principal / months);
  for (let i = 1; i <= months; i += 1) {
    const interest = Math.round(balance * r);
    let pay;
    if (method === 'equalPayment') pay = i === months ? balance : Math.min(fixed - interest, balance);
    else if (method === 'equalPrincipal') pay = i === months ? balance : basePrincipal;
    else pay = i === months ? balance : 0;
    balance -= pay;
    rows.push({ month: i, principal: pay, interest, payment: pay + interest, balance });
  }
  const totalInterest = rows.reduce((a, x) => a + x.interest, 0);
  return { rows, totalInterest, totalPayment: principal + totalInterest, fixed };
}

export function calculate(raw) {
  const v = collect({
    principal: parseAmount(raw.principal, { label: '대출 원금', max: 100_000_000_000 }),
    rate: parseDecimal(raw.rate, { label: '연 이자율', min: 0, max: 30, allowZero: true, decimals: 3, unit: '%' }),
    months: parseCount(raw.months, { label: '대출 기간', min: 1, max: 600, unit: '개월' }),
  });
  if (!METHOD_LABELS[raw.method]) { v.ok = false; v.errors.method = '상환 방식을 선택해 주세요.'; }
  if (v.ok && raw.method === 'equalPrincipal' && v.values.principal < v.values.months) { v.ok = false; v.errors.principal = '원금균등 상환은 대출 원금이 개월 수보다 커야 합니다.'; }
  if (!v.ok) return fail(v.errors);
  const { principal, rate, months } = v.values;
  const s = schedule(principal, rate, months, raw.method);
  const first = s.rows[0]; const last = s.rows[s.rows.length - 1];
  const years = months % 12 === 0 ? `${months / 12}년` : `${months}개월`;

  const warnings = ['실제 대출은 금융회사의 일수 계산 방식, 변동금리, 중도상환수수료, 거치기간 등에 따라 달라집니다. 약정서의 상환 계획표를 확인하세요.'];
  if (rate === 0) warnings.push('이자율 0%로 계산했습니다 (무이자).');

  const firstLabel = raw.method === 'bullet' ? '매달 이자' : raw.method === 'equalPrincipal' ? '첫 달 상환액' : '매달 상환액';
  return result({
    meta: `${METHOD_LABELS[raw.method]} · 원금 ${won(principal)} · 연 ${num(rate, 3)}% · ${years}`,
    headline: { label: firstLabel, value: won(first.payment) },
    stats: [
      { label: firstLabel, value: won(raw.method === 'equalPayment' ? s.fixed : first.payment) },
      { label: '총 이자', value: won(s.totalInterest) },
      { label: '총 상환액', value: won(s.totalPayment) },
    ],
    rows: [
      { label: '월 이자율', value: `${num(rate, 3)}% ÷ 12 = ${num(rate / 12, 6)}%` },
      { label: '첫 달', value: `원금 ${won(first.principal)} + 이자 ${won(first.interest)} = ${won(first.payment)}` },
      { label: `마지막 달 (${months}회차)`, value: `원금 ${won(last.principal)} + 이자 ${won(last.interest)} = ${won(last.payment)}` },
    ],
    table: {
      head: ['회차', '상환 원금', '이자', '월 상환액', '남은 원금'],
      rows: s.rows.map((x) => [`${x.month}회`, won(x.principal), won(x.interest), won(x.payment), won(x.balance)]),
      foot: ['합계', won(principal), won(s.totalInterest), won(s.totalPayment), ''],
      collapsible: `월별 상환 계획표 (${months}회차) 펼치기`,
    },
    formulas: {
      equalPayment: ['월 상환액 = 원금 × r × (1+r)^n ÷ ((1+r)^n − 1), r = 연이율 ÷ 12, n = 개월 수', '매달 이자 = 남은 원금 × r, 상환 원금 = 월 상환액 − 이자', '원 단위 반올림, 마지막 달에 남은 원금을 정리합니다.'],
      equalPrincipal: ['매달 상환 원금 = 원금 ÷ 개월 수 (원 미만 버림, 나머지는 마지막 달)', '매달 이자 = 남은 원금 × 연이율 ÷ 12 (원 단위 반올림)'],
      bullet: ['매달 이자 = 원금 × 연이율 ÷ 12 (원 단위 반올림)', '마지막 달에 원금 전액 상환'],
    }[raw.method],
    warnings,
    sources: sourceList(['fss']),
  });
}
