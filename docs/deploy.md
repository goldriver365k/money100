# 정산노트 배포·운영 가이드

- 작성: 2026-11-21 (6차)
- 현재 상태: **배포 준비 완료** — 9차: 호스팅은 Netlify, 운영 도메인은 급여계산기.site로 확정. Netlify 연결·공개 전환 절차는 `docs/netlify.md`(이 문서보다 우선).
- 대상 페이지: `/` (홈), `/salary-proration` (월급 일할계산기), `/weekly-holiday-pay` (주휴수당 계산기)

## 1. 공개 전에 필요한 결정

| 항목 | 필요한 값 | 쓰이는 곳 |
|---|---|---|
| 운영 도메인 | `https://…` (경로 없이 도메인만). 후보 확인은 `docs/domain.md` | `site.config.json`의 `siteUrl`(또는 `SITE_URL` 환경변수) → canonical, og:url, sitemap.xml, robots.txt |
| 호스팅과 배포 권한 | 정적 호스팅(예: Cloudflare Pages, Netlify, Vercel, GitHub Pages) 계정·프로젝트 접근 권한 | `dist/` 업로드 |
| 공개 범위 | 검색 노출 허용 여부 | 허용하면 운영 빌드, 보류하면 미리보기 빌드(noindex 유지) |

## 2. 배포 절차

1. 배포할 커밋을 정한다. 작업 트리가 깨끗해야 `dist/build-info.txt`의 커밋 표기에 `-dirty`가 붙지 않는다.
2. 운영 빌드와 전체 검수를 한 번에 실행한다.

   ```bash
   npm run verify:production
   ```

   - `site.config.json`의 `siteUrl`을 쓴다. 비어 있으면 `SITE_URL=https://운영도메인`을 앞에 붙인다.
   - 결과: `docs/test-report-production.md`(실패 0건이어야 함), 화면 캡처는 `docs/screenshots-production/`
   - 실패가 하나라도 있으면 배포하지 않는다.
3. `dist/` 폴더 전체를 호스팅에 올린다. 빌드 명령을 호스팅에서 돌린다면 빌드 명령 `node scripts/build.js --production`, 출력 폴더 `dist`, 환경변수 `SITE_URL`을 설정한다.
4. 호스팅에서 **확장자 없는 주소**가 각 폴더의 `index.html`로 응답하도록 설정한다.
   - `/salary-proration` → `salary-proration/index.html`
   - `/weekly-holiday-pay` → `weekly-holiday-pay/index.html`
   - 끝에 `/`가 붙은 주소는 슬래시 없는 주소로 이동시킨다(canonical과 일치).
   - 없는 주소는 `404.html`을 상태 코드 404로 보여 준다.
   - 예: Vercel `cleanUrls: true`·`trailingSlash: false`, Netlify Pretty URLs, Cloudflare Pages 기본 동작. GitHub Pages는 슬래시를 붙이는 쪽으로 이동시키므로 canonical과 어긋난다(별도 확인 필요).
5. 배포 후 검증(3장)을 실행한다.

## 3. 배포 후 검증

```bash
node scripts/check-live.js https://운영도메인
```

세 페이지의 응답 200, 검색 제목, canonical, noindex 없음, sitemap.xml(세 주소), robots.txt(Allow·Sitemap), 배포 버전(`build-info.txt`)을 확인한다.

```bash
E2E_BASE_URL=https://운영도메인 E2E_PRODUCTION=1 E2E_DIR=dist SITE_URL=https://운영도메인 node tests/e2e/run.cjs
```

배포된 주소에서 브라우저 전체 검수(두 계산기 필수 사례, 모바일 360px, 직접 접속·새로고침, 홈 이동, 결과 숨김, 공식 출처·면책 문구, 외부 요청 0건, canonical·sitemap·robots)를 다시 실행한다. `E2E_DIR`은 코드 점검(전송 API 검색)에 쓰는 로컬 빌드 폴더다.

호스팅이 끝 슬래시 이동·404 처리를 다르게 하면 해당 두 항목만 실패할 수 있다. 이 경우 호스팅 설정(2장 4번)을 고친 뒤 다시 실행한다.

## 4. 장애 시 복구

1. **증상 확인**: `node scripts/check-live.js https://운영도메인`으로 실패 항목과 현재 배포 버전(`build-info.txt`의 commit)을 기록한다.
2. **즉시 복구(권장)**: 호스팅의 배포 이력에서 직전 정상 배포를 다시 활성화한다(Cloudflare Pages·Netlify·Vercel 모두 "이전 배포로 되돌리기/Promote" 기능 제공).
3. **이력 복구가 불가능할 때**: 마지막으로 검수를 통과한 커밋에서 다시 빌드해 올린다.

   ```bash
   git checkout <정상 커밋>
   ```

   ```bash
   SITE_URL=https://운영도메인 npm run verify:production
   ```

   통과하면 `dist/`를 다시 업로드한다.
4. **복구 확인**: 3장의 두 명령을 다시 실행해 실패 0건과 배포 버전이 정상 커밋인지 확인한다.
5. **검색 노출을 급히 막아야 할 때**: `npm run build`(미리보기 빌드, noindex·`Disallow: /`)를 올리면 검색 차단 상태로 바뀐다.

정상 배포 커밋 기록(배포할 때마다 추가):

| 날짜 | 커밋 | SITE_URL | 검수 결과 | 비고 |
|---|---|---|---|---|
| — | — | — | — | 아직 공개 배포 없음 |

## 5. 4차 판정 규칙표 ↔ 테스트 대조

주휴수당 판정 단계(명세 3.3절, 구현 반영은 10장)와 이를 확인하는 테스트다. 단위 테스트는 `tests/unit/weekly-holiday.test.js`, 브라우저 테스트는 `docs/test-report*.md`의 행 이름이다.

| 규칙 | 내용 | 공식 근거 | 확인하는 테스트 |
|---|---|---|---|
| S1 | 판정 주 7일째 날까지 재직 | L1, M3, M7 | 사례 5A 3주차 · 단위 "퇴직: 7일째까지 재직하면 지급, 6일째 퇴직이면 S1" |
| S2 | 소정근로일 결근 → 지급 대상 아님 | L5, M7 | 사례 4 · 사례 4-1·4-2(휴가·지각은 결근 아님) · "입력 변경 시 결과 숨김 → 재판정" |
| S3 | 평균 기간 근무표 누락 → 정보 부족 | L2 | 사례 5B · "자료 누락 시 확정 판정·예상액 미표시" · 단위 "확인 시작일이 중간 주이면…" |
| S4 | 미확정 기준(어느 4주·4주 미만 평균)으로 결론이 갈림 → 정보 부족 + 별도 확인 필요 | L2 | "미확정 조건(어느 4주 평균) → 별도 확인 필요" · 단위 "쟁점 B…" 2건 |
| S5 | 평균 1주 소정근로시간 15시간 미만 | L2, L1, M1, M5 | 사례 1 · 사례 5B-1 · "명시한 0시간과 빈칸 구별" · 단위 "합계 3,599분은 미달, 3,600분은 충족" |
| S6 | 출근 여부 미입력 → 정보 부족 | L5 | "출근 여부 누락 주는 정보 부족·예상액 미표시" · 단위 사례 5B-2 |
| S7 | 소정근로일 없음 | L5 | 사례 5B-1(3주차) |
| S8 | 실제 출근일 없음 → 지급 대상 아님 + 별도 확인 필요 | M6 | 단위 "전부 휴가로 쉰 주는 지급 대상 아님(S8)" |
| S9 | 지급 요건 충족 | L2, L3, L5, L6 | 사례 2·3·4·5A |
| 예상액 | 1일 소정근로시간 × 시급 (4주 미만·월급제·금액 갈림은 미표시) | L7, M1, M8 | 사례 2·3·4 금액 · "미확정 조건(4주 미만 예상액)" · "월급제: … 별도 확인 필요" · 단위 "두 후보 결론은 같지만 금액이 다르면 예상액만 보류" |

결과표의 각 행에는 평균 기간, 적용 시간, 판정 이유, "근거: (규칙 이름) — (조문)"이 표시되고, 결과 아래 "적용한 판정 규칙과 공식 근거 보기"에서 링크와 확인일(2026년 11월 21일)을 볼 수 있다("결과 행마다 적용 기간·적용 시간·판정 이유·공식 근거", "적용한 공식 근거와 확인일" 테스트).
