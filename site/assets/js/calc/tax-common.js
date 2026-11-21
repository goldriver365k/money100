/** 세금 계산 공통: 누진세율 구간 계산 */
import { floorWon } from './common.js';

export function progressive(amount, brackets) {
  if (amount <= 0) return 0;
  const b = brackets.find((x) => amount <= x.upTo);
  return floorWon(b.base + (amount - b.from) * b.rate);
}

/** 해당 구간의 한계세율 */
export function marginalRate(amount, brackets) {
  return (brackets.find((x) => amount <= x.upTo) ?? brackets[brackets.length - 1]).rate;
}
