# 정산노트 — Netlify 배포와 급여계산기.site 연결

- 작성: 2026-11-21 (9차)
- 운영 도메인(사용자 확정): **급여계산기.site** · ASCII `xn--989a2xnd520fn5f.site`
  - 9차 지시문의 표기는 ‘급여계산서.site’였다. 이 주소는 2026-11-21 12:20 KST 기준 Radix 레지스트리 RDAP에서 “available for registration”이었다. 같은 시각 ‘급여계산기.site’가 가비아를 통해 등록된 것을 확인했고, 사용자가 급여계산기.site로 확정했다.
- 현재 상태(2026-11-21 12:39 KST 확인): **Netlify 연결·도메인 연결·HTTPS 완료, 공개 전환(PUBLIC_LAUNCH) 대기**
  - DNS: `@` A `75.2.60.5`(Netlify), `www` → `apex-loadbalancer.netlify.com`(Netlify), 네임서버 가비아
  - HTTPS: 인증서 유효, `http://` → `https://` 301, `www` → 루트 301, 끝 슬래시 → 슬래시 없는 주소 301, 없는 주소 404
  - 배포: 커밋 6b23002, 미리보기 모드(noindex 메타·`X-Robots-Tag`·robots `Disallow`), sitemap 없음
  - 운영 주소 브라우저 검수: 통과 86 · 실패 0 · 미확인 3 (`docs/live-preview-report.md`)
  - Netlify 사이트 이름은 `jeongsan-note`가 아님(`jeongsan-note.netlify.app` 404). netlify.app → 운영 도메인 이동 규칙은 Netlify가 빌드 때 넣어 주는 `SITE_NAME`으로 자동 생성되므로 이름과 관계없이 동작한다.

## 1. 확인한 사실

| 항목 | 결과 | 확인 일시 (KST) · 출처 |
|---|---|---|
| GitHub 저장소 | `goldriver365k/money100` (브랜치는 `claude/affectionate-pascal-5ah83g` 하나뿐) | 2026-11-21 · `git ls-remote` |
| Netlify 프로젝트 | **미확인** — API 응답 401(인증 필요). 기존 프로젝트 유무를 볼 수 없음. `jeongsan-note.netlify.app`은 404(사용 중인 사이트 없음) | 2026-11-21 12:20 · api.netlify.com |
| 급여계산기.site 등록 | 등록됨: 2026-11-21 03:20:02 UTC(12:20 KST), 등록기관 Gabia, Inc.(IANA 244), 네임서버 ns.gabia.co.kr·ns1.gabia.co.kr·ns.gabia.net, 만료 2027-11-21 | 2026-11-21 12:20 · `rdap.radix.host` |
| 소유자 | **미확인** — RDAP 등록자 정보 비공개. 가비아 계정에서 확인 필요 | — |
| 현재 DNS | 12:20 NXDOMAIN → 12:29 SERVFAIL. 위임은 시작됐으나 가비아 네임서버에 응답할 영역 없음. **기존 레코드(메일 포함) 없음** | `dns.google` |
| ASCII 주소 | 급여계산기.site → `xn--989a2xnd520fn5f.site` | Node `url.domainToASCII` |

## 2. 저장소에 준비한 것 (완료)

| 파일 | 내용 |
|---|---|
| `netlify.toml` | 빌드 명령 `node scripts/netlify-build.js`, 배포 폴더 `dist`, Node 22 |
| `scripts/netlify-build.js` | Netlify 빌드 진입점. **`PUBLIC_LAUNCH=true`이고 production일 때만** 운영 설정(canonical·sitemap·색인 허용, `*.netlify.app` → 운영 도메인 301)을 적용한다. 그 밖의 경우(최초 연결, deploy preview, branch deploy)는 noindex 미리보기다. 페이지는 `salary-proration.html`처럼 평탄화해 `/salary-proration`이 그대로 열린다 |
| `site.config.json` | `siteUrl: "https://급여계산기.site"` (빌드가 Punycode로 변환) |

로컬 검증(실제 Netlify 배포 아님): Netlify CLI 17.38.1 `netlify dev --offline`으로 Netlify의 `_redirects`·`_headers` 처리를 재현해 브라우저 전체 검수를 실행했다.

| 빌드 | 결과 | 보고서 |
|---|---|---|
| 미리보기(PUBLIC_LAUNCH 없음) | 통과 86 · 실패 0 · 미확인 3. 세 경로 200, 끝 슬래시 200, 없는 주소 404, `X-Robots-Tag: noindex` | `docs/netlify-preview-report.md` |
| 공개(PUBLIC_LAUNCH=true) | 통과 91 · 실패 0 · 미확인 3. canonical·sitemap·robots 모두 `https://xn--989a2xnd520fn5f.site` | `docs/netlify-launch-report.md` |

이 검증에서 발견해 고친 문제: `/salary-proration/ → /salary-proration` 이동 규칙이 Netlify에서 자기 자신으로 이동하는 반복을 만들었다(Netlify는 규칙을 맞출 때 끝 슬래시를 무시한다). 규칙을 없애고 평탄화한 페이지와 canonical로 처리했다.

## 3. 사용자가 할 일 (순서대로)

### 3-1. 운영 브랜치 결정

Netlify는 한 브랜치를 운영(production)으로 배포한다. 현재 GitHub에는 작업 브랜치만 있다. 다음 중 하나를 고른다.

- (권장) 작업 브랜치를 `main`으로 병합하고 `main`을 운영 브랜치로 지정한다.
- 작업 브랜치 `claude/affectionate-pascal-5ah83g`를 그대로 운영 브랜치로 지정한다.

### 3-2. Netlify 프로젝트 만들기 (Netlify 화면)

1. app.netlify.com → **Add new site → Import an existing project → GitHub** → `goldriver365k/money100`을 선택한다(처음이면 Netlify GitHub 앱 설치 승인).
2. 설정값:

   | 항목 | 입력값 |
   |---|---|
   | Branch to deploy | 3-1에서 고른 브랜치 |
   | Base directory | (비움) |
   | Build command | `node scripts/netlify-build.js` (netlify.toml에서 자동 입력) |
   | Publish directory | `dist` (자동 입력) |
   | Site name | `jeongsan-note` (→ `jeongsan-note.netlify.app`) |
   | Environment variables | **추가하지 않음** (PUBLIC_LAUNCH는 3-5에서) |

3. 배포가 끝나면 `https://jeongsan-note.netlify.app/`, `/salary-proration`, `/weekly-holiday-pay`를 열고 새로고침한다. 이 단계는 noindex 미리보기다.
4. (선택) 미리보기 접근 제한: Netlify **Site configuration → Access & security → Password protection**에서 설정한다. 요금제에 따라 제공되지 않을 수 있다. 제공되지 않으면 noindex로 검색 노출만 막은 상태가 된다.

### 3-3. 도메인 추가 (Netlify 화면)

1. **Domain management → Add a domain** → `급여계산기.site`를 입력한다(Netlify가 Punycode `xn--989a2xnd520fn5f.site`로 표시할 수 있음). “이미 등록된 도메인” 안내에서 **Add domain**을 누른다.
2. `www` 하위 도메인도 함께 추가되며, 대표(primary) 도메인은 **`xn--989a2xnd520fn5f.site`(www 없음)** 로 지정한다.
3. Netlify가 **이 사이트용으로 표시하는 DNS 레코드 값**을 기록한다. 보통 다음 형태다.
   - 루트: A 레코드, Netlify 로드밸런서 IP
   - `www`: CNAME 레코드, `jeongsan-note.netlify.app`

   반드시 화면에 표시된 값을 사용한다.

### 3-4. DNS 변경 (가비아 화면)

가비아 **My가비아 → 서비스 관리 → 도메인 → 급여계산기.site → DNS 관리(DNS 설정)**.

| 호스트 | 타입 | 값 | TTL |
|---|---|---|---|
| `@` | A | Netlify 화면의 루트 값 | 600 (기본값 가능) |
| `www` | CNAME | `jeongsan-note.netlify.app.` (Netlify 화면 값) | 600 |

- **변경 전 기록**: 12:29 KST 기준 이 도메인에는 레코드가 없다(SERVFAIL). 메일(MX)·인증(TXT) 등 보존할 레코드도 없다. 변경 직전 가비아 DNS 화면을 캡처해 둔다. 가비아가 기본 레코드(주차 페이지 등)를 만들어 둔 경우에는 그 값도 기록한다.
- **복구**: 추가한 `@`·`www` 레코드를 지우거나 기록한 이전 값으로 되돌린다.
- 나중에 메일을 쓰게 되면 MX·SPF(TXT) 레코드를 추가해도 위 두 레코드와 충돌하지 않는다.
- 대안: 가비아에서 네임서버를 Netlify DNS로 바꾸는 방식도 있다. 이 경우 모든 레코드를 Netlify에서 관리하게 된다.

### 3-5. HTTPS 확인 → 공개 전환

1. Netlify **Domain management → HTTPS**에서 도메인 확인(Verified)과 인증서(Let's Encrypt) 발급 완료를 확인한다. DNS 반영 후 보통 수 분에서 수 시간이 걸린다.
2. 미리보기 상태에서 `https://급여계산기.site/`와 두 경로가 HTTPS로 열리는지 확인한다.
3. **Site configuration → Environment variables → Add**: `PUBLIC_LAUNCH` = `true` (Scopes: Builds, Deploy contexts: **Production**)
4. **Deploys → Trigger deploy → Deploy site**. 이 배포부터 canonical·sitemap·색인 허용이 적용되고, `jeongsan-note.netlify.app` 주소는 운영 도메인으로 경로를 유지한 채 301 이동한다.

### 3-6. 운영 주소 검수 (이 저장소에서 실행)

```bash
node scripts/check-live.js https://급여계산기.site
```

```bash
E2E_BASE_URL=https://급여계산기.site E2E_PRODUCTION=1 E2E_DIR=dist node tests/e2e/run.cjs
```

두 번째 명령은 월급 일할계산기 필수 5건(사례 1: 3,100,000원·2026-01-16 입사 → 1,600,000원 / 1,550,000원 / 차액 50,000원 포함), 주휴수당 14시간 59분·정확히 15시간·자료 누락 사례, 직접 접속·새로고침·홈 이동, 모바일 360px, 외부 요청 0건, canonical·sitemap·robots를 운영 주소에서 다시 확인한다. 실행 전에 `npm run verify:production`으로 `dist/`를 만들어 둔다(코드 점검용).

### 3-7. 검색 도구

- 사이트맵 주소: `https://급여계산기.site/sitemap.xml` (ASCII `https://xn--989a2xnd520fn5f.site/sitemap.xml`)
- **Google Search Console**: 도메인 속성 `xn--989a2xnd520fn5f.site`를 추가하고, 안내된 TXT 레코드를 가비아 DNS에 추가해 소유권을 확인한다. 이어서 Sitemaps에 `sitemap.xml`을 제출한다.
- **네이버 서치어드바이저**: 사이트 등록에 `https://급여계산기.site`를 입력하고, HTML 태그 또는 파일로 소유권을 확인한다. 이어서 요청 → 사이트맵 제출에 `https://급여계산기.site/sitemap.xml`을 입력한다.
  - HTML 태그·파일 방식이 필요하면 그 값을 받아 저장소에 반영해야 한다.
- 제출 상태(접수됨·성공)와 실제 색인 상태(페이지 색인 생성 보고서, 네이버 웹 페이지 수집 현황)는 다르다. 제출 후 수일~수주가 지나야 색인 여부를 보고할 수 있다.

## 4. 복구

| 상황 | 방법 |
|---|---|
| 새 배포에 문제 | Netlify **Deploys**에서 직전 정상 배포를 열고 **Publish deploy**(즉시 되돌림) |
| 공개 설정을 되돌려야 함(검색 노출 차단) | `PUBLIC_LAUNCH` 값을 삭제하거나 `false`로 바꾸고 다시 배포 → noindex 미리보기로 돌아감 |
| 도메인 연결 문제 | 가비아 DNS에서 3-4의 레코드를 지우거나 이전 값으로 되돌린다. 사이트는 `jeongsan-note.netlify.app`에서 계속 동작한다. 이때 `PUBLIC_LAUNCH`도 끄면 netlify.app → 도메인 이동이 사라진다 |
| 코드 되돌리기 | 정상 커밋으로 `git revert` 후 푸시 → Netlify 자동 재배포. 배포된 커밋은 `https://급여계산기.site/build-info.txt`에서 확인 |
