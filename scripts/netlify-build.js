#!/usr/bin/env node
/**
 * Netlify 빌드 진입점 (netlify.toml 의 build.command).
 *
 * 공개 전환 스위치: Netlify 환경변수 PUBLIC_LAUNCH
 *   - CONTEXT=production 이고 PUBLIC_LAUNCH=true  → 운영 빌드
 *       canonical·og:url·sitemap.xml·robots.txt 를 site.config.json 의 운영 도메인(HTTPS, Punycode)으로 생성,
 *       Netlify 기본 주소(SITE_NAME.netlify.app)는 운영 도메인으로 경로를 유지한 채 301 이동.
 *   - 그 밖의 모든 경우(최초 연결, 도메인·HTTPS 확인 전, deploy preview, branch deploy) → 미리보기 빌드
 *       noindex 메타 + X-Robots-Tag 헤더 + robots.txt Disallow, canonical·sitemap 없음.
 *   → 도메인의 HTTPS 접속을 확인한 뒤 PUBLIC_LAUNCH=true 로 바꾸고 다시 배포하는 것이 '대표 주소 전환'이다.
 *
 * 공통: 확장자 없는 주소(/salary-proration)를 그대로 쓰도록 페이지를 salary-proration.html 로 평탄화하고,
 *       끝 슬래시 주소(/salary-proration/)도 같은 페이지로 응답하며 canonical 은 슬래시 없는 주소다.
 *
 * 로컬 확인: CONTEXT=production PUBLIC_LAUNCH=true SITE_NAME=jeongsan-note node scripts/netlify-build.js
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES } from './pages.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.BUILD_OUT ? path.resolve(process.env.BUILD_OUT) : path.join(ROOT, 'dist');
const context = process.env.CONTEXT || 'local';
const launch = context === 'production' && String(process.env.PUBLIC_LAUNCH).toLowerCase() === 'true';

execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.js'), ...(launch ? ['--production'] : [])], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, BUILD_OUT: OUT },
});

// 페이지 평탄화: foo/index.html → foo.html (Netlify 가 /foo 를 그대로 제공)
for (const p of PAGES) {
  if (p.path === '/') continue;
  const dir = path.join(OUT, p.path.slice(1));
  const src = path.join(dir, 'index.html');
  if (!fs.existsSync(src)) throw new Error(`${p.file} 이 빌드 결과에 없습니다.`);
  fs.renameSync(src, `${dir}.html`);
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}

// 끝 슬래시 이동 규칙은 넣지 않는다: Netlify 는 규칙을 맞출 때 /foo/ 와 /foo 를 같은 경로로 보므로
// '/foo/ → /foo' 규칙은 자기 자신으로 이동하는 반복이 된다(netlify dev 로 확인). 두 주소 모두 foo.html 로 응답하고
// canonical 이 슬래시 없는 주소를 가리킨다.
const redirects = [];
let siteOrigin = null;
if (launch) {
  const robots = fs.readFileSync(path.join(OUT, 'robots.txt'), 'utf8');
  siteOrigin = (robots.match(/Sitemap: (https:\/\/[^/\s]+)\/sitemap\.xml/) || [])[1];
  if (!siteOrigin) throw new Error('운영 빌드의 robots.txt 에서 운영 도메인을 찾지 못했습니다.');
  const siteName = process.env.SITE_NAME;
  if (siteName) {
    redirects.unshift(`https://${siteName}.netlify.app/*  ${siteOrigin}/:splat  301!`);
    redirects.unshift(`http://${siteName}.netlify.app/*  ${siteOrigin}/:splat  301!`);
  }
}
fs.writeFileSync(path.join(OUT, '_redirects'), `${redirects.join('\n')}\n`);

const common = [
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  X-Frame-Options: DENY',
];
const headers = ['/*', ...common, ...(launch ? [] : ['  X-Robots-Tag: noindex, nofollow'])];
fs.writeFileSync(path.join(OUT, '_headers'), `${headers.join('\n')}\n`);

console.log(`Netlify 빌드 완료 → ${path.relative(ROOT, OUT) || OUT} · context=${context} · ${launch ? `공개(운영) ${siteOrigin}` : '미리보기(noindex)'}`);
