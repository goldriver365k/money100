#!/usr/bin/env node
/**
 * 배포 후 빠른 점검 (의존성 없음, Node 18+ fetch 사용)
 *   node scripts/check-live.js https://운영도메인
 *   node scripts/check-live.js http://127.0.0.1:4173 https://운영도메인   (로컬에서 운영 빌드 점검)
 * 세 페이지의 상태 코드·검색 제목·canonical·noindex 여부, sitemap.xml, robots.txt, build-info.txt 를 확인한다.
 * 브라우저 전체 검수는: E2E_BASE_URL=https://운영도메인 E2E_PRODUCTION=1 SITE_URL=https://운영도메인 node tests/e2e/run.cjs
 */
import fs from 'node:fs';
import { PAGES } from './pages.js';

// 기대 제목은 소스 HTML(site/)에서 읽는다 — 페이지가 늘어도 목록을 따로 고치지 않는다.
const TITLES = Object.fromEntries(PAGES.map((p) => [p.path, (fs.readFileSync(new URL(`../site/${p.file}`, import.meta.url), 'utf8').match(/<title>([^<]*)<\/title>/) || [])[1]]));

const origin = (u) => { try { return new URL(u).origin; } catch { return ''; } };
const base = origin(process.argv[2] || process.env.SITE_URL || '');
const site = origin(process.argv[3] || base); // 한글 도메인 → Punycode
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

for (const { path, public: isPublic } of PAGES) {
  const res = await fetch(base + path, { redirect: 'manual' });
  const html = res.status === 200 ? await res.text() : '';
  const title = pick(html, /<title>([^<]*)<\/title>/);
  const canonical = pick(html, /<link rel="canonical" href="([^"]+)"/);
  const noindex = /<meta name="robots" content="[^"]*noindex/.test(html) || /noindex/.test(res.headers.get('x-robots-tag') || '');
  report(res.status === 200, `${path} 응답`, `${res.status}${res.headers.get('location') ? ` → ${res.headers.get('location')}` : ''}`);
  report(title === TITLES[path], `${path} 검색 제목`, title);
  if (isPublic) {
    report(canonical === site + path, `${path} canonical`, canonical);
    report(!noindex, `${path} 검색 노출 허용`, noindex ? 'noindex 있음' : 'noindex 없음');
  } else {
    // 정책 페이지 등 public:false — 접근은 가능하되 색인 제외가 정상
    report(noindex && !canonical, `${path} 색인 제외(정책 페이지)`, noindex ? 'noindex 유지' : 'noindex 없음');
  }
}
const sm = await fetch(`${base}/sitemap.xml`);
const smText = sm.ok ? await sm.text() : '';
const locs = [...smText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const publicLocs = PAGES.filter((p) => p.public).map((p) => site + p.path);
report(sm.ok && locs.length === publicLocs.length && publicLocs.every((u) => locs.includes(u)), `sitemap.xml (${publicLocs.length}개)`, `${sm.status} · ${locs.join(', ')}`);
const rb = await fetch(`${base}/robots.txt`);
const rbText = rb.ok ? await rb.text() : '';
report(rb.ok && !/Disallow: \/\s*$/m.test(rbText) && rbText.includes(`Sitemap: ${site}/sitemap.xml`), 'robots.txt', rbText.trim().replace(/\n+/g, ' / '));
const bi = await fetch(`${base}/build-info.txt`);
console.log(`INFO  배포 버전  — ${bi.ok ? (await bi.text()).trim().replace(/\n/g, ' · ') : '확인 불가'}`);
console.log(failed ? `\n실패 ${failed}건` : '\n모든 점검 통과');
process.exit(failed ? 1 : 0);
