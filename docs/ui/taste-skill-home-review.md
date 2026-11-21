# Taste skill 홈 화면 검토 (2026-11-21, 검토만 — 파일 변경 없음)

도구: design-taste-frontend(taste-skill 2.5.1)의 `copy-lint.mjs`, `consistency.mjs --quick --widths 1440,390 --page software` (출력은 임시 폴더, 프로젝트에 기록 없음, 마감 게이트 미사용)
결과 원문: copy-lint 0 FAIL·2 WARN / consistency 1440px 39 FAIL·14 WARN, 390px 13 FAIL·6 WARN

이 스킬은 회사·제품 마케팅 랜딩 페이지 기준이라, 결과를 **실제로 적용할 항목**과 **이 사이트 성격에 맞지 않는 항목**으로 나눴다.

## 적용할 항목 (실제 문제)
| 우선 | 항목 (검사 id) | 내용 | 제안 |
|---|---|---|---|
| 높음 | 건너뛰기 링크가 가려짐 (focus-hidden) | PC에서 Tab을 처음 누르면 나오는 "본문 바로가기"가 고정 헤더 뒤에 깔려 보이지 않음 (z-index 10 < 헤더 20). 직접 재현 확인. 31개 페이지 공통 | `.skip-link` z-index를 헤더보다 높게 |
| 중간 | 검색창에 보이는 이름표 없음 (field-label) | 이름표가 화면 낭독기 전용(sr-only)이고 화면에는 placeholder만 보임. UI UX Pro Max도 "placeholder만 있는 이름표"를 피할 패턴으로 꼽음 | 검색창 위에 작은 "계산기 검색" 이름표 표시 |
| 중간 | 폰트 미적용 (font-load) | CSS가 Pretendard를 지정하지만 어디서도 불러오지 않아 기기 기본 글꼴로 보임 (Canva 시안 글꼴과 다름) | Pretendard(OFL)를 사이트에 직접 넣기(woff2, 필요한 굵기만) — 보안 정책상 외부 CDN 대신 자체 호스팅 |
| 중간 | 공유 미리보기 이미지 없음 (share-meta) | og:image·twitter:card 없음 → 카카오톡·SNS로 공유하면 그림 없이 제목만 나옴 | 1200×630 공유 이미지와 태그 추가 (31개 페이지 공통) |
| 낮음 | 제목 크기 순서 (heading-scale) | 카드 제목(h3, 24.8px)이 일부 h2(17.6px)보다 큼 | 카드 제목을 h2보다 작게 하거나 해당 h2를 키움 |
| 낮음 | 줄표(—) 5개 (copy-em-dash) | 홈 본문 줄표가 스킬 기준(2개)보다 많음 | 쉼표·괄호로 일부 교체 |
| 낮음 | 주소 #로 접기 열기 (links) | 메뉴 클릭으로는 열리지만, 주소에 #basis-fold를 직접 붙여 이동(hashchange)하면 접힌 채 남음 | nav.js에 hashchange 처리 추가 |
| 낮음 | 영역 끝 여백 (flush) | 검색창·마지막 카드가 배경이 바뀌는 경계에 0px로 붙음 | 섹션 아래 여백 추가 |
| 낮음 | 320px 하단 링크 (tap-size WARN) | 아주 좁은 화면에서 "개인정보처리방침" 링크가 다른 링크와 가까움 | 링크 간격·높이 확대 |
| 선택 | 첫 화면 제목 (copy-headline) | "필요한 계산을 한곳에서"에 분야·숫자가 없음. 스킬은 h1에 무엇인지(범주)와 사실 하나를 권함 — 예: "급여·세금·부동산 계산기 30종" | Canva 승인 문구라 변경은 선택 사항 (검색 노출에는 유리) |

## 이 사이트에 맞지 않아 적용하지 않을 항목
- 한 화면에 한 섹션·첫 화면은 히어로만 (one-section, section-height, hero-screen, hero-fill): 30개 카드 목록은 스크롤해서 고르는 화면이라 해당 없음
- 카드마다 사진·아이콘·UI 조각 (card-visual, no-visual, text-only): 승인된 Canva 디자인(색 카드 + 큰 제목)과 충돌
- 연출 효과·모먼트·히어로 등장 애니메이션 (moment-none 등), 히어로·FAQ의 행동 버튼 (cta): 마케팅 페이지용 규칙
- 좌우 여백 64~120px (container-edges): 좌우 여백은 이미 같음(156px) — 폭 기준만 스킬 취향과 다름
- 제목 포커스 테두리 제거 (focus-ring .panel-title / .week-title): 키보드로 도달하는 요소가 아니라 결과 표시 때 프로그램이 옮기는 제목이라 의도된 처리
- "첫 Tab이 건너뛰기 링크가 아님" (skip-link WARN): 오탐 — 첫 Tab은 건너뛰기 링크("본문 바로가기")가 맞음. 실제 문제는 위의 "가려짐"
- "숫자 나열" (copy-stat-strip): 카드 번호 1~10을 통계로 잘못 읽은 오탐
