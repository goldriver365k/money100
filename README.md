# 정산노트

급여 계산기 모음 정적 사이트. 1차 범위: 홈(`/`)과 월급 일할계산기(`/salary-proration`).

- 빌드 도구·외부 의존성 없음 (Node.js 18 이상만 필요, 브라우저 검수에는 Playwright 사용)
- 계산 로직(`site/assets/js/proration.js`)은 화면 코드(`salary-proration-page.js`)와 분리된 순수 함수
- 급여·날짜는 브라우저 안에서만 계산하며 네트워크로 보내지 않음 (CSP `connect-src 'none'`, 분석 도구 없음)

## 실행

```bash
npm start
```

→ http://127.0.0.1:4173/ (홈), http://127.0.0.1:4173/salary-proration (계산기)

미리보기 서버는 `/salary-proration` 직접 접속·새로고침에 `salary-proration/index.html`로 응답하고,
`/salary-proration/`은 `/salary-proration`으로 301 이동시킨다. 모든 응답에 `X-Robots-Tag: noindex`를 붙인다.

## 테스트

```bash
npm test
```

계산 로직 단위 테스트 (필수 5건 + 예외·사사오입·윤년 등).

```bash
npm run test:e2e
```

브라우저 검수 (Playwright/Chromium). 결과는 `docs/test-report.md`, 360px 화면 캡처는 `docs/screenshots/`에 저장된다.

## 빌드와 검색 노출

| 명령 | 결과 |
|---|---|
| `npm run build` | `dist/` 미리보기용. `noindex` 메타와 `robots.txt`의 `Disallow: /` 유지 |
| `SITE_URL=https://운영도메인 npm run build:production` | `noindex` 제거, 페이지별 `canonical`·`og:url`, `sitemap.xml`, 운영용 `robots.txt` 생성 |
| `npm run preview` | `dist/`를 로컬에서 제공 |

`SITE_URL`이 없거나 https가 아니면 운영 빌드는 실패한다. 페이지 목록은 `scripts/pages.js`에서 관리한다.

배포 시 호스팅에서 확장자 없는 주소(`/salary-proration`)가 `salary-proration/index.html`로 응답하도록
설정해야 한다 (예: Vercel `cleanUrls`/`trailingSlash: false`, Netlify Pretty URLs, Cloudflare Pages 기본 동작).

## 구조

```
site/                       배포되는 정적 파일
  index.html                홈
  salary-proration/index.html
  assets/js/proration.js    계산 로직 (순수 함수)
  assets/js/salary-proration-page.js  화면 코드
  assets/css/style.css
  robots.txt, 404.html, assets/favicon.svg
scripts/serve.js            미리보기 서버
scripts/build.js            미리보기/운영 빌드
scripts/pages.js            페이지 목록 (canonical·사이트맵)
tests/unit/                 node:test 단위 테스트
tests/e2e/run.cjs           Playwright 브라우저 검수
docs/                       검수 결과와 화면 캡처
```
