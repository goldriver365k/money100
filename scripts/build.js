#!/usr/bin/env node
/**
 * site/ → dist/ 빌드.
 *
 *   npm run build
 *     미리보기용. 검색 차단(noindex, robots Disallow)을 그대로 유지한다.
 *
 *   npm run build:production            (site.config.json 의 siteUrl 사용)
 *   SITE_URL=https://운영도메인 npm run build:production   (환경변수가 우선)
 *     운영용. 공개(public) 페이지의 noindex 를 제거하고 canonical·og:url 을 넣고,
 *     sitemap.xml 과 운영용 robots.txt 를 생성한다. 도메인이 지정되지 않으면 실패한다.
 *     한글 도메인은 ASCII(Punycode) 주소로 바꿔 넣는다.
 *   BUILD_OUT=폴더 로 출력 위치를 바꿀 수 있다(테스트용).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { PAGES } from './pages.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'site');
const OUT = process.env.BUILD_OUT ? path.resolve(process.env.BUILD_OUT) : path.join(ROOT, 'dist');
const CONFIG = JSON.parse(fs.readFileSync(process.env.BUILD_CONFIG ? path.resolve(process.env.BUILD_CONFIG) : path.join(ROOT, 'site.config.json'), 'utf8'));
const SEO_BLOCK = /<!-- seo:start -->[\s\S]*?<!-- seo:end -->/;

function fail(message) {
  console.error(`빌드 실패: ${message}`);
  process.exit(1);
}

function normalizeSiteUrl(raw) {
  if (!raw) fail('운영 도메인이 지정되지 않았습니다. site.config.json 의 siteUrl 을 채우거나 SITE_URL=https://도메인 npm run build:production 으로 실행하세요.');
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(`SITE_URL 형식이 올바르지 않습니다: ${raw}`);
  }
  if (url.protocol !== 'https:') fail('SITE_URL 은 https:// 로 시작해야 합니다.');
  if (url.pathname !== '/' || url.search || url.hash) fail('SITE_URL 에는 경로·쿼리 없이 도메인만 지정하세요.');
  return url.origin;
}

function escapeAttr(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

const production = process.argv.includes('--production');
const siteUrl = production ? normalizeSiteUrl(process.env.SITE_URL || CONFIG.siteUrl) : null;

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });

for (const page of PAGES) {
  const file = path.join(OUT, page.file);
  const html = fs.readFileSync(file, 'utf8');
  if (!SEO_BLOCK.test(html)) fail(`${page.file} 에 <!-- seo:start --> 블록이 없습니다.`);
  let block;
  if (production && page.public) {
    const href = escapeAttr(siteUrl + page.path);
    block = [
      '<!-- seo:start -->',
      `<link rel="canonical" href="${href}">`,
      `  <meta property="og:url" content="${href}">`,
      '  <!-- seo:end -->',
    ].join('\n');
  } else {
    block = '<!-- seo:start -->\n  <meta name="robots" content="noindex, nofollow">\n  <!-- seo:end -->';
  }
  fs.writeFileSync(file, html.replace(SEO_BLOCK, block));
}

if (production) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = PAGES.filter((p) => p.public).map(
    (p) => `  <url>\n    <loc>${siteUrl}${p.path}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${p.priority}</priority>\n  </url>`,
  ).join('\n');
  fs.writeFileSync(
    path.join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  );
  fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
}

let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  if (execSync('git status --porcelain -- site scripts', { cwd: ROOT }).toString().trim()) commit += '-dirty';
} catch {
  /* git 없음 */
}
fs.writeFileSync(
  path.join(OUT, 'build-info.txt'),
  `commit=${commit}\nbuilt=${new Date().toISOString()}\nmode=${production ? 'production' : 'preview'}\nsite=${siteUrl ?? '-'}\n`,
);

console.log(`빌드 완료 → dist/ (commit ${commit}, ${production ? `운영: ${siteUrl}` : '미리보기: 검색 차단 유지'})`);
