/**
 * 홈: 맨 위 검색(바로가기 목록) + 전체 계산기 목록 걸러 보기(분야·검색어).
 * 카드 내용은 HTML에 그대로 있으며(검색엔진·JavaScript 없이도 보임), 이 스크립트는 걸러 보이기만 한다.
 */
const grid = document.getElementById('calc-grid');
const search = document.getElementById('calc-search');
const suggest = document.getElementById('search-suggest');
const count = document.getElementById('calc-count');
const empty = document.getElementById('no-results');
const emptyText = document.getElementById('no-results-text');
const emptyAll = document.getElementById('no-results-all');
const chips = [...document.querySelectorAll('.chip[data-filter]')];
const items = [...grid.querySelectorAll('.calc-item')];
const LABEL = { all: '전체', labor: '노동·급여', tax: '세금·보험', realty: '주거·부동산' };
const MAX_SUGGEST = 6;

let category = 'all';

/** 공백·대소문자를 무시하고 비교 */
const norm = (s) => s.toLowerCase().replace(/\s+/g, '');
const terms = () => search.value.toLowerCase().split(/\s+/).filter(Boolean);
// 낱말별 AND 검색: '퇴사 월급', '알바 주휴'처럼 순서·띄어쓰기가 달라도 찾는다
function matches(item, ts) {
  if (!ts.length) return true;
  const hay = norm(item.dataset.keywords);
  return hay.includes(ts.join('')) || ts.every((t) => hay.includes(t));
}

function renderSuggest(ts, found) {
  suggest.replaceChildren();
  if (!ts.length) { suggest.hidden = true; return; }
  if (!found.length) {
    const li = document.createElement('li');
    li.className = 'suggest-none';
    li.textContent = `‘${search.value.trim()}’에 맞는 계산기가 없습니다. 다른 낱말로 찾아 보세요.`;
    suggest.append(li);
  }
  for (const item of found.slice(0, MAX_SUGGEST)) {
    const a = item.querySelector('a.calc-card');
    if (!a) continue;
    const li = document.createElement('li');
    li.className = `suggest-item cat-${item.dataset.category}`;
    const link = document.createElement('a');
    link.href = a.getAttribute('href');
    const ico = a.querySelector('.card-ico')?.cloneNode(true);
    const name = document.createElement('span');
    name.className = 'suggest-name';
    name.textContent = a.querySelector('.card-title').textContent;
    const cat = document.createElement('span');
    cat.className = 'suggest-cat';
    cat.textContent = LABEL[item.dataset.category];
    if (ico) link.append(ico);
    link.append(name, cat);
    li.append(link);
    suggest.append(li);
  }
  if (found.length > MAX_SUGGEST) {
    const li = document.createElement('li');
    li.className = 'suggest-more';
    const link = document.createElement('a');
    link.href = '#calculators';
    link.textContent = `검색 결과 ${found.length}개 모두 보기`;
    li.append(link);
    suggest.append(li);
  }
  suggest.hidden = false;
}

function apply() {
  const ts = terms();
  const found = items.filter((it) => matches(it, ts));
  let shown = 0;
  for (const item of items) {
    const visible = (category === 'all' || item.dataset.category === category) && found.includes(item);
    item.hidden = !visible;
    if (visible) shown += 1;
  }
  renderSuggest(ts, found);
  const soon = items.filter((i) => i.dataset.status !== 'live').length;
  if (!ts.length && category === 'all') {
    count.textContent = `계산기 ${items.length}개${soon ? ` · 준비 중 ${soon}개` : ''}`;
  } else {
    const where = category === 'all' ? '' : `${LABEL[category]} · `;
    count.textContent = ts.length ? `${where}‘${search.value.trim()}’ 검색 결과 ${shown}개` : `${where}계산기 ${shown}개`;
  }
  // 결과가 없을 때: 다른 분야에 맞는 계산기가 있으면 알려 주고 전체 분야로 넓혀 보기
  empty.hidden = shown !== 0;
  if (shown === 0) {
    const elsewhere = category !== 'all' ? found.length : 0;
    emptyText.textContent = elsewhere
      ? `${LABEL[category]} 분야에는 결과가 없습니다. 다른 분야에서 ${elsewhere}개를 찾았습니다.`
      : '검색 결과가 없습니다. 다른 낱말로 찾아 주세요.';
    emptyAll.hidden = !elsewhere;
  }
}

function setCategory(key) {
  category = key;
  for (const c of chips) c.setAttribute('aria-pressed', String(c.dataset.filter === key));
  apply();
}

for (const chip of chips) chip.addEventListener('click', () => setCategory(chip.dataset.filter));
emptyAll.addEventListener('click', () => { setCategory('all'); chips.find((c) => c.dataset.filter === 'all')?.focus(); });
search.addEventListener('input', apply);
search.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && search.value) { search.value = ''; apply(); }
  // Enter: 결과가 하나면 바로 열고, 여러 개면 목록으로 이동
  if (e.key === 'Enter') {
    const links = [...suggest.querySelectorAll('.suggest-item a')];
    if (links.length === 1) { location.href = links[0].href; return; }
    if (links.length) document.getElementById('calculators').scrollIntoView({ block: 'start' });
  }
  if (e.key === 'ArrowDown' && !suggest.hidden) { e.preventDefault(); suggest.querySelector('a')?.focus(); }
});
suggest.addEventListener('keydown', (e) => {
  const links = [...suggest.querySelectorAll('a')];
  const i = links.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); links[Math.min(i + 1, links.length - 1)]?.focus(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); (i <= 0 ? search : links[i - 1]).focus(); }
  if (e.key === 'Escape') search.focus();
});
// 브라우저가 검색어를 되살린 경우(뒤로가기)에도 목록을 맞춘다
window.addEventListener('pageshow', apply);

/** 머리글 메뉴(#labor·#tax·#realty·#calculators)로 들어오면 해당 분야를 골라 목록으로 이동 */
function applyHash() {
  const key = location.hash.slice(1);
  const chip = chips.find((c) => c.dataset.filter === key) || (key === 'calculators' ? chips.find((c) => c.dataset.filter === 'all') : null);
  if (!chip) return;
  setCategory(chip.dataset.filter);
  document.getElementById('calculators').scrollIntoView({ block: 'start' });
}
window.addEventListener('hashchange', applyHash);
apply();
applyHash();
