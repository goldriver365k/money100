/** 로고·홈 화면 아이콘: 모든 페이지가 같은 아이콘·매니페스트를 연결하고, 파일이 실제로 있는지 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SITE = path.resolve('site');
const pages = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.html') && !/^google[0-9a-f]+\.html$/.test(f.name)) pages.push(p); /* 구글 소유확인 파일은 웹 페이지가 아님 */ } })(SITE);

test('모든 페이지에 파비콘·애플 터치 아이콘·매니페스트 연결 (옛 favicon.svg 없음)', () => {
  assert.ok(pages.length >= 33);
  for (const p of pages) {
    const h = fs.readFileSync(p, 'utf8');
    for (const s of ['href="/assets/icons/favicon.ico"', 'href="/assets/icons/apple-touch-icon.png"', 'rel="manifest" href="/site.webmanifest"']) assert.ok(h.includes(s), `${path.relative(SITE, p)}: ${s}`);
    assert.ok(!h.includes('favicon.svg'), path.relative(SITE, p));
  }
});

test('매니페스트: 이름·시작 주소·192/512·마스크 아이콘, 파일 존재와 크기 일치', () => {
  const m = JSON.parse(fs.readFileSync(path.join(SITE, 'site.webmanifest'), 'utf8'));
  assert.equal(m.name, '생활계산서'); assert.equal(m.start_url, '/');
  assert.ok(m.icons.some((i) => i.sizes === '192x192') && m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
  for (const i of m.icons) {
    const buf = fs.readFileSync(path.join(SITE, i.src));
    const [w, h] = [buf.readUInt32BE(16), buf.readUInt32BE(20)]; // PNG IHDR
    assert.equal(`${w}x${h}`, i.sizes, i.src);
  }
  for (const f of ['favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'logo-mark.png']) assert.ok(fs.statSync(path.join(SITE, 'assets/icons', f)).size > 500, f);
});

test('구글 Search Console 소유확인 파일: 사이트 루트, 발급받은 한 줄 그대로', () => {
  const f = path.join(SITE, 'google02cbf226a5d76f54.html');
  assert.equal(fs.readFileSync(f, 'utf8'), 'google-site-verification: google02cbf226a5d76f54.html');
});
