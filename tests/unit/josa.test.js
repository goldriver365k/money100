/** 오류 문구 조사: 받침에 맞게 을/를·이/가 (괄호 설명은 건너뜀) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { josa, parseAmount } from '../../site/assets/js/calc/common.js';

test('받침 있으면 을·이, 없으면 를·가', () => {
  assert.equal(josa('연봉(세전)', '을', '를'), '연봉(세전)을');
  assert.equal(josa('주택 시세(매매가)', '을', '를'), '주택 시세(매매가)를');
  assert.equal(josa('입사일', '이', '가'), '입사일이');
  assert.equal(josa('3개월 임금총액', '을', '를'), '3개월 임금총액을');
});
test('숫자로 끝나면 읽는 소리로, 영문은 둘 다 표기', () => {
  assert.equal(josa('기준 2', '을', '를'), '기준 2를');
  assert.equal(josa('기준 3', '을', '를'), '기준 3을');
  assert.equal(josa('DSR', '을', '를'), 'DSR을(를)');
});
test('검증 오류 문구에 적용', () => {
  assert.equal(parseAmount('', { label: '공급가액' }).error, '공급가액을 입력해 주세요.');
  assert.equal(parseAmount('', { label: '주택 시세(매매가)' }).error, '주택 시세(매매가)를 입력해 주세요.');
});
