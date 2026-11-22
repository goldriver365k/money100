# 네이버·구글 검색 등록 (2026-11-22 점검)

## 운영 주소 (실제 확인)
- 운영 중인 주소: **https://급여계산기.site** (ASCII: `https://xn--989a2xnd520fn5f.site`)
- `급여계산서.site`(xn--989a2xl32bmmat2r.site)는 **DNS에 존재하지 않는 도메인**(NXDOMAIN)이다. 검색 등록에 이 주소를 쓰면 확인이 실패한다.
- DNS: 가비아 네임서버(ns.gabia.co.kr 등), 루트 A 75.2.60.5(Netlify), www → Netlify(apex-loadbalancer.netlify.com)
- 이동 규칙: http → https 301, www → 루트 301, `/계산기/` → `/계산기` 301, 없는 주소 404
- 검색 로봇: Googlebot·Yeti(네이버) 사용자 에이전트로 홈·robots.txt·sitemap.xml·계산기 페이지 모두 200

## 빌드가 만드는 파일 (운영 빌드, 배포 폴더 루트)
- `sitemap.xml`: 공개 페이지 31개(scripts/pages.js 의 public:true). 개인정보처리방침·404 제외
- `robots.txt`: `Allow: /` + `Sitemap: https://xn--989a2xnd520fn5f.site/sitemap.xml`
- 모든 공개 페이지: canonical(자기 주소)·noindex 없음

## 소유확인 태그
- 값은 `site.config.json` 의 `siteVerification` 에만 넣는다(임의 생성 금지). 운영 빌드에서 홈 `<head>` 의 `<!-- verify:start -->` 자리에 들어간다.
  - naver: 서치어드바이저 발급값 입력됨
  - google: **비어 있음** — Search Console에서 발급받은 HTML 태그의 content 값을 넣고 배포
- 값에 영문·숫자·-·_ 외 글자가 있으면 빌드가 멈춘다.

## 등록 절차
1. 네이버 서치어드바이저: 사이트 `https://급여계산기.site` → 소유확인(HTML 태그) → 요청 → 사이트맵 제출 `https://xn--989a2xnd520fn5f.site/sitemap.xml`
2. 구글 Search Console: 속성 추가 → **도메인**(가비아 DNS TXT, 권장) 또는 **URL 접두어** `https://xn--989a2xnd520fn5f.site/`(HTML 태그) → Sitemaps에 `sitemap.xml` 제출
