/**
 * 공통 머리글: ‘적용 기준’ 메뉴를 누르거나 주소에 해당 #이 있으면 그 페이지의 접이식 ‘적용 기준 및 공식 출처’를 펼치고 그곳으로 이동한다.
 */
function openTarget(hash, smooth) {
  if (!hash || hash.length < 2) return false;
  const el = document.getElementById(decodeURIComponent(hash.slice(1)));
  if (!el || el.tagName !== 'DETAILS') return false;
  el.open = true;
  el.scrollIntoView({ behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto', block: 'start' });
  el.querySelector(':scope > summary')?.focus({ preventScroll: true });
  return true;
}
for (const a of document.querySelectorAll('a[data-open-fold]')) {
  a.addEventListener('click', (e) => {
    if (openTarget(a.hash, true)) {
      e.preventDefault();
      history.replaceState(null, '', a.hash);
    }
  });
}
openTarget(location.hash, false);
// 주소의 #이 바뀌어도(직접 입력·다른 페이지 링크) 해당 접이식 영역을 연다
window.addEventListener('hashchange', () => openTarget(location.hash, true));

/* ---------- 상단 메뉴: 분야 드롭다운 · 모바일 햄버거 ---------- */
const header = document.querySelector('.site-header');
const navToggle = header?.querySelector('.nav-toggle');
const catButtons = [...(header?.querySelectorAll('.nav-cat') ?? [])];
const isMobileNav = () => window.matchMedia('(max-width: 899px)').matches;

function setCat(btn, open) {
  btn.setAttribute('aria-expanded', String(open));
  btn.closest('.has-menu')?.classList.toggle('is-open', open);
}
function closeAllCats(except) {
  catButtons.forEach((b) => { if (b !== except) setCat(b, false); });
}
catButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    closeAllCats(btn);
    setCat(btn, open);
  });
  const li = btn.closest('.has-menu');
  // PC: 마우스를 올리면 펼침 (모바일에서는 누를 때만)
  li?.addEventListener('mouseenter', () => { if (!isMobileNav()) { closeAllCats(btn); setCat(btn, true); } });
  li?.addEventListener('mouseleave', () => { if (!isMobileNav()) setCat(btn, false); });
});
navToggle?.addEventListener('click', () => {
  const open = navToggle.getAttribute('aria-expanded') !== 'true';
  navToggle.setAttribute('aria-expanded', String(open));
  header.classList.toggle('nav-open', open);
  if (!open) closeAllCats();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const openBtn = catButtons.find((b) => b.getAttribute('aria-expanded') === 'true');
  if (openBtn) { setCat(openBtn, false); openBtn.focus(); return; }
  if (navToggle?.getAttribute('aria-expanded') === 'true') { navToggle.click(); navToggle.focus(); }
});
document.addEventListener('click', (e) => {
  if (header && !header.contains(e.target)) {
    closeAllCats();
    if (navToggle?.getAttribute('aria-expanded') === 'true') { navToggle.setAttribute('aria-expanded', 'false'); header.classList.remove('nav-open'); }
  }
});
// 메뉴 안 링크(같은 페이지 #)를 누르면 모바일 메뉴 닫기
header?.querySelectorAll('.main-nav a').forEach((a) => a.addEventListener('click', () => {
  closeAllCats();
  if (navToggle?.getAttribute('aria-expanded') === 'true') { navToggle.setAttribute('aria-expanded', 'false'); header.classList.remove('nav-open'); }
}));
