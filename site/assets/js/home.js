/**
 * 홈 계산기 목록: 검색과 분야별 보기.
 * 카드 내용은 HTML에 그대로 있으며(검색엔진·JavaScript 없이도 보임), 이 스크립트는 걸러 보이기만 한다.
 */
const grid = document.getElementById('calc-grid');
const search = document.getElementById('calc-search');
const count = document.getElementById('calc-count');
const empty = document.getElementById('no-results');
const chips = [...document.querySelectorAll('.chip[data-filter]')];
const items = [...grid.querySelectorAll('.calc-item')];

let category = 'all';

/** 공백·대소문자를 무시하고 비교 */
const norm = (s) => s.toLowerCase().replace(/\s+/g, '');

function apply() {
  // 낱말별 AND 검색: '퇴사 월급', '알바 주휴'처럼 순서·띄어쓰기가 달라도 찾는다
  const terms = search.value.toLowerCase().split(/\s+/).filter(Boolean);
  const q = terms.join('');
  let shown = 0;
  let live = 0;
  for (const item of items) {
    const okCat = category === 'all' || item.dataset.category === category;
    const hay = norm(item.dataset.keywords);
    const okText = !terms.length || hay.includes(q) || terms.every((t) => hay.includes(t));
    const visible = okCat && okText;
    item.hidden = !visible;
    if (visible) {
      shown += 1;
      if (item.dataset.status === 'live') live += 1;
    }
  }
  empty.hidden = shown !== 0;
  count.textContent = shown === items.length && !q
    ? `계산기 ${items.length}개 · 이용 가능 ${items.filter((i) => i.dataset.status === 'live').length}개 · 준비 중 ${items.filter((i) => i.dataset.status !== 'live').length}개`
    : `검색 결과 ${shown}개 · 이용 가능 ${live}개`;
}

for (const chip of chips) {
  chip.addEventListener('click', () => {
    category = chip.dataset.filter;
    for (const c of chips) c.setAttribute('aria-pressed', String(c === chip));
    apply();
  });
}
search.addEventListener('input', apply);
// 브라우저가 검색어를 되살린 경우(뒤로가기)에도 목록을 맞춘다
window.addEventListener('pageshow', apply);
apply();
