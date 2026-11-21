#!/usr/bin/env node
/**
 * 배포 후 빠른 점검 (의존성 없음, Node 18+ fetch 사용)
 *   node scripts/check-live.js https://운영도메인
 *   node scripts/check-live.js http://127.0.0.1:4173 https://운영도메인   (로컬에서 운영 빌드 점검)
 * 세 페이지의 상태 코드·검색 제목·canonical·noindex 여부, sitemap.xml, robots.txt, build-info.txt 를 확인한다.
 * 브라우저 전체 검수는: E2E_BASE_URL=https://운영도메인 E2E_PRODUCTION=1 SITE_URL=https://운영도메인 node tests/e2e/run.cjs
 */
import { PAGES } from './pages.js';

const TITLES = {
  '/': '급여 계산기 모음 | 정산노트',
  '/salary-proration': '월급 일할계산기 — 중도 입사·퇴사 급여 계산 | 정산노트',
  '/weekly-holiday-pay': '주휴수당 계산기 — 주 15시간·변동 근무 판독 | 정산노트',
};

const base = (process.argv[2] || process.env.SITE_URL || '').replace(/\/$/, '');
const site = (process.argv[3] || base).replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('사용법: node scripts/check-live.js https://운영도메인');
  process.exit(1);
}

let failed = 0;
const report = (ok, name, detail) => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  — ${detail}`);
};
const pick = (html, re) => (html.match(re) || [])[1] ?? null;

for (const { path } of PAGES) {
  const res = await fetch(base + path, { redirect: 'manual' });
  const html = res.status === 200 ? await res.text() : '';
  const title = pick(html, /<title>([^<]*)<\/title>/);
  const canonical = pick(html, /<link rel="canonical" href="([^"]+)"/);
  const noindex = /<meta name="robots" content="[^"]*noindex/.test(html) || /noindex/.test(res.headers.get('x-robots-tag') || '');
  report(res.status === 200, `${path} 응답`, `${res.status}${res.headers.get('location') ? ` → ${res.headers.get('location')}` : ''}`);
  report(title === TITLES[path], `${path} 검색 제목`, title);
  report(canonical === site + path, `${path} canonical`, canonical);
  report(!noindex, `${path} 검색 노출 허용`, noindex ? 'noindex 있음' : 'noindex 없음');
}
const sm = await fetch(`${base}/sitemap.xml`);
const smText = sm.ok ? await sm.text() : '';
const locs = [...smText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
report(sm.ok && PAGES.every((p) => locs.includes(site + p.path)), 'sitemap.xml', `${sm.status} · ${locs.join(', ')}`);
const rb = await fetch(`${base}/robots.txt`);
const rbText = rb.ok ? await rb.text() : '';
report(rb.ok && !/Disallow: \/\s*$/m.test(rbText) && rbText.includes(`Sitemap: ${site}/sitemap.xml`), 'robots.txt', rbText.trim().replace(/\n+/g, ' / '));
const bi = await fetch(`${base}/build-info.txt`);
console.log(`INFO  배포 버전  — ${bi.ok ? (await bi.text()).trim().replace(/\n/g, ' · ') : '확인 불가'}`);
console.log(failed ? `\n실패 ${failed}건` : '\n모든 점검 통과');
process.exit(failed ? 1 : 0);
