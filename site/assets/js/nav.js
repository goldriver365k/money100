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
