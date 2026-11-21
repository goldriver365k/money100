import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES } from '../../scripts/pages.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANDIDATES = ['급여계산기.kr', 'xn--989a2xnd520fn5f.kr', '정산노트.kr', 'xn--o80bp20airfjzl.kr'];

function build(args, env = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'jn-build-'));
  const run = () => execFileSync(process.execPath, ['scripts/build.js', ...args], {
    cwd: ROOT,
    env: { ...process.env, SITE_URL: '', ...env, BUILD_OUT: out },
    stdio: 'pipe',
  }).toString();
  return { out, run, read: (f) => fs.readFileSync(path.join(out, f), 'utf8') };
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

describe('운영 도메인 설정', () => {
  test('운영 도메인은 site.config.json 한 곳에서 관리하며, 연결 전에는 비어 있다', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
    assert.equal(config.siteUrl, null);
  });

  test('후보 도메인(급여계산기.kr·정산노트.kr)이 사이트 소스와 설정에 들어 있지 않다', () => {
    const files = [...walk(path.join(ROOT, 'site')), path.join(ROOT, 'site.config.json'), path.join(ROOT, 'scripts', 'pages.js')];
    for (const f of files) {
      if (/\.(png|svg|ico)$/.test(f)) continue;
      const text = fs.readFileSync(f, 'utf8');
      for (const c of CANDIDATES) assert.ok(!text.includes(c), `${path.relative(ROOT, f)} 에 ${c}`);
    }
  });

  test('도메인 미지정 운영 빌드는 실패한다 (후보 주소가 canonical 에 들어갈 수 없음)', () => {
    const b = build(['--production']);
    assert.throws(b.run, /운영 도메인이 지정되지 않았습니다/);
  });

  test('미리보기 빌드에는 canonical 이 없고 noindex·Disallow 가 유지된다', () => {
    const b = build([]);
    b.run();
    for (const p of PAGES) {
      const html = b.read(p.file);
      assert.ok(!html.includes('rel="canonical"'));
      assert.ok(html.includes('noindex, nofollow'));
    }
    assert.match(b.read('robots.txt'), /Disallow: \//);
    assert.ok(!fs.existsSync(path.join(b.out, 'sitemap.xml')));
  });

  test('한글 도메인 지정 시 canonical·og:url·sitemap·robots 에 같은 HTTPS ASCII 주소가 들어간다', () => {
    const b = build(['--production'], { SITE_URL: 'https://급여계산기.kr' });
    b.run();
    const site = 'https://xn--989a2xnd520fn5f.kr';
    for (const p of PAGES.filter((x) => x.public)) {
      const html = b.read(p.file);
      assert.ok(html.includes(`<link rel="canonical" href="${site}${p.path}">`), p.path);
      assert.ok(html.includes(`<meta property="og:url" content="${site}${p.path}">`), p.path);
      assert.ok(!html.includes('noindex'), p.path);
    }
    const locs = [...b.read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.deepEqual(locs, PAGES.filter((x) => x.public).map((p) => site + p.path));
    assert.match(b.read('robots.txt'), new RegExp(`Sitemap: ${site.replace(/\./g, '\\.')}/sitemap\\.xml`));
  });

  test('공개 검수를 통과하지 않은(public: false) 페이지는 사이트맵에서 빠지고 noindex 를 유지한다', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'pages.js'), 'utf8');
    const tmpPages = src.replace("path: '/weekly-holiday-pay', file: 'weekly-holiday-pay/index.html', priority: '0.9', public: true", "path: '/weekly-holiday-pay', file: 'weekly-holiday-pay/index.html', priority: '0.9', public: false");
    assert.notEqual(tmpPages, src);
    const backup = src;
    try {
      fs.writeFileSync(path.join(ROOT, 'scripts', 'pages.js'), tmpPages);
      const b = build(['--production'], { SITE_URL: 'https://example.com' });
      b.run();
      assert.ok(!b.read('sitemap.xml').includes('/weekly-holiday-pay'));
      const html = b.read('weekly-holiday-pay/index.html');
      assert.ok(html.includes('noindex') && !html.includes('rel="canonical"'));
    } finally {
      fs.writeFileSync(path.join(ROOT, 'scripts', 'pages.js'), backup);
    }
  });

  test('운영 도메인에 경로·http 를 넣으면 실패한다', () => {
    assert.throws(build(['--production'], { SITE_URL: 'http://example.com' }).run, /https/);
    assert.throws(build(['--production'], { SITE_URL: 'https://example.com/app' }).run, /도메인만/);
  });
});
