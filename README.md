# 정산노트

급여 계산기 모음 정적 사이트. 홈(`/`), 월급 일할계산기(`/salary-proration`), 주휴수당 계산기(`/weekly-holiday-pay`).

- 빌드 도구·외부 의존성 없음 (Node.js 18 이상만 필요, 브라우저 검수에는 Playwright 사용)
- 계산 로직(`proration.js`, `weekly-holiday.js`)은 화면 코드(`*-page.js`)와 분리된 순수 함수
- 주휴수당 판정 규칙·근거: `docs/weekly-holiday-pay-spec.md`
- 급여·날짜는 브라우저 안에서만 계산하며 네트워크로 보내지 않음 (CSP `connect-src 'none'`, 분석 도구 없음)

## 실행

```bash
npm start
```

→ http://127.0.0.1:4173/ (홈), http://127.0.0.1:4173/salary-proration, http://127.0.0.1:4173/weekly-holiday-pay

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

## 화면 점검과 UI 검수

### 화면 자동 점검

```bash
npm run test:ui
```

360·390·1440px에서 다음을 한 번에 확인한다. 실패 메시지는 `[페이지 @ 너비px] 항목 — 실제값` 형식이고, 결과는 `docs/ui/ui-check-report.md`에 저장된다.

- 세 페이지 직접 접속·새로고침
- 360·390px 가로 스크롤과 입력·결과 잘림
- 홈 카드 → 계산기 → 대표 사례 결과
- 접이식 ‘적용 기준 및 공식 출처’ 기본 닫힘, 클릭·Enter·Space로 열고 닫기, 열린 채 재계산
- 두 계산기의 기존 계산 기대값

배포된 주소는 `UI_BASE=https://주소 npm run test:ui`로 점검한다.

### 화면 캡처

```bash
npm run ui:capture -- --out docs/ui/current
```

세 페이지를 360·390·1440px에서 테스트용 가상 입력값으로 채워 전체 화면을 저장한다. 배포 주소는 `--base https://주소`로 찍는다.

### UI 검수 에이전트 `ui-reviewer`

- 정의: `.claude/agents/ui-reviewer.md`
- 작업 순서: 화면 실행 → 모바일·데스크톱 캡처 → 문제 발견 → 수정 → 재검수
- 결과: `docs/ui/review-<날짜>.md`에 페이지·화면 너비·발견한 문제·수정 제안·우선순위·상태 표로 남긴다.

호출 방법(이 저장소에서 연 Claude Code 세션):

- 자연어로 요청한다: “ui-reviewer 에이전트로 세 페이지 화면 검수해 줘”
- 또는 `@ui-reviewer`로 지정하고 범위를 적는다: “@ui-reviewer 주휴수당 결과 화면만 360px에서 검수하고 수정까지 해 줘”
- `/agents` 명령에서 목록과 설정을 확인할 수 있다.

에이전트 파일은 세션을 시작할 때 읽힌다. 파일을 새로 추가하거나 고친 뒤에는 새 세션에서 호출한다.

## 빌드와 검색 노출

| 명령 | 결과 |
|---|---|
| `npm run build` | `dist/` 미리보기용. `noindex` 메타와 `robots.txt`의 `Disallow: /` 유지 |
| `SITE_URL=https://운영도메인 npm run build:production` | `noindex` 제거, 페이지별 `canonical`·`og:url`, `sitemap.xml`, 운영용 `robots.txt` 생성 |
| `npm run preview` | `dist/`를 로컬에서 제공 |

`SITE_URL`이 없거나 https가 아니면 운영 빌드는 실패한다.

운영 도메인은 `site.config.json`의 `siteUrl` 한 곳에서 지정한다(급여계산기.site). Netlify 배포·도메인 연결은 `netlify.toml`·`scripts/netlify-build.js`·`docs/netlify.md`. 운영 빌드 검수는 `npm run verify:production`, 배포 후 점검은 `node scripts/check-live.js https://운영도메인`. 배포·복구 절차는 `docs/deploy.md`. 페이지 목록은 `scripts/pages.js`에서 관리한다.

배포 시 호스팅에서 확장자 없는 주소(`/salary-proration`)가 `salary-proration/index.html`로 응답하도록
설정해야 한다 (예: Vercel `cleanUrls`/`trailingSlash: false`, Netlify Pretty URLs, Cloudflare Pages 기본 동작).

## 구조

```
site/                       배포되는 정적 파일
  index.html                홈
  salary-proration/index.html
  weekly-holiday-pay/index.html
  assets/js/weekly-holiday.js     주휴수당 판정 로직 (순수 함수)
  assets/js/weekly-holiday-page.js 주휴수당 화면 코드
  assets/js/proration.js    계산 로직 (순수 함수)
  assets/js/salary-proration-page.js  화면 코드
  assets/css/style.css
  robots.txt, 404.html, assets/favicon.svg
scripts/serve.js            미리보기 서버
scripts/build.js            미리보기/운영 빌드
scripts/pages.js            페이지 목록 (canonical·사이트맵)
tests/unit/                 node:test 단위 테스트
tests/e2e/run.cjs           Playwright 브라우저 검수
tests/ui/ui-check.cjs       화면 자동 점검 (npm run test:ui)
scripts/ui-capture.cjs      화면 캡처 (npm run ui:capture)
.claude/agents/ui-reviewer.md  UI 검수 에이전트
docs/                       검수 결과와 화면 캡처
```
