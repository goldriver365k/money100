/**
 * Google 태그 관리자(GTM-WLPB6PGS) 불러오기.
 * - 보안 정책(CSP)상 인라인 스크립트를 쓸 수 없어 이 파일로 옮겼다 (Google 기본 설치 코드와 같은 동작).
 * - 운영 도메인에서만 동작한다: 로컬·미리보기·테스트 환경에서는 방문 통계를 보내지 않는다.
 * - 계산기 입력값은 이 코드가 읽거나 보내지 않는다.
 */
(function () {
  var PRODUCTION_HOSTS = ['xn--989a2xnd520fn5f.site'];
  if (PRODUCTION_HOSTS.indexOf(location.hostname) === -1) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-WLPB6PGS';
  document.head.appendChild(s);
})();
