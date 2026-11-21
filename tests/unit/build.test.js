import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES } from '../../scripts/pages.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// 확정 운영 도메인(급여계산기.site) 외의 후보·오기 주소가 소스에 들어가면 안 된다
const CANDIDATES = ['급여계산기.kr', 'xn--989a2xnd520fn5f.kr', '정산노트.kr', 'xn--o80bp20airfjzl.kr', '급여계산서.site', 'xn--989a2xl32bmmat2r.site'];
const SITE = 'https://xn--989a2xnd520fn5f.site';

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
  test('운영 도메인은 site.config.json 한 곳에서 관리한다 (9차 확정: 급여계산기.site)', () => {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
    assert.equal(config.siteUrl, 'https://급여계산기.site');
    assert.equal(new URL(config.siteUrl).origin, SITE);
  });

  test('이전 후보(급여계산기.kr·정산노트.kr)와 오기(급여계산서.site)가 사이트 소스와 설정에 들어 있지 않다', () => {
    const files = [...walk(path.join(ROOT, 'site')), path.join(ROOT, 'site.config.json'), path.join(ROOT, 'scripts', 'pages.js'), path.join(ROOT, 'scripts', 'netlify-build.js'), path.join(ROOT, 'netlify.toml')];
    for (const f of files) {
      if (/\.(png|svg|ico)$/.test(f)) continue;
      const text = fs.readFileSync(f, 'utf8');
      for (const c of CANDIDATES) assert.ok(!text.includes(c), `${path.relative(ROOT, f)} 에 ${c}`);
    }
  });

  test('도메인이 비어 있는 설정으로 운영 빌드하면 실패한다', () => {
    const cfg = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jn-cfg-')), 'site.config.json');
    fs.writeFileSync(cfg, JSON.stringify({ siteUrl: null }));
    const b = build(['--production'], { BUILD_CONFIG: cfg });
    assert.throws(b.run, /운영 도메인이 지정되지 않았습니다/);
  });

  test('SITE_URL 없이 운영 빌드하면 site.config.json 의 급여계산기.site(Punycode)가 적용된다', () => {
    const b = build(['--production']);
    b.run();
    assert.ok(b.read('index.html').includes(`<link rel="canonical" href="${SITE}/">`));
    assert.match(b.read('robots.txt'), /Sitemap: https:\/\/xn--989a2xnd520fn5f\.site\/sitemap\.xml/);
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

function netlifyBuild(env) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'jn-netlify-'));
  execFileSync(process.execPath, ['scripts/netlify-build.js'], {
    cwd: ROOT,
    env: { ...process.env, SITE_URL: '', CONTEXT: '', PUBLIC_LAUNCH: '', SITE_NAME: '', ...env, BUILD_OUT: out },
    stdio: 'pipe',
  });
  const read = (f) => fs.readFileSync(path.join(out, f), 'utf8');
  return { out, read, exists: (f) => fs.existsSync(path.join(out, f)) };
}

describe('Netlify 빌드 (공개 전환 스위치 PUBLIC_LAUNCH)', () => {
  for (const [label, env] of [
    ['deploy preview', { CONTEXT: 'deploy-preview', PUBLIC_LAUNCH: 'true' }],
    ['branch deploy', { CONTEXT: 'branch-deploy' }],
    ['production, PUBLIC_LAUNCH 없음 (도메인·HTTPS 확인 전)', { CONTEXT: 'production', SITE_NAME: 'jeongsan-note' }],
  ]) {
    test(`${label} → 미리보기(noindex, canonical·sitemap 없음)`, () => {
      const b = netlifyBuild(env);
      for (const f of ['index.html', 'salary-proration.html', 'weekly-holiday-pay.html']) {
        const html = b.read(f);
        assert.ok(html.includes('noindex, nofollow'), f);
        assert.ok(!html.includes('rel="canonical"'), f);
      }
      assert.ok(!b.exists('sitemap.xml'));
      assert.match(b.read('robots.txt'), /Disallow: \//);
      assert.match(b.read('_headers'), /X-Robots-Tag: noindex, nofollow/);
      assert.ok(!b.read('_redirects').includes('netlify.app'));
    });
  }

  test('production + PUBLIC_LAUNCH=true → 운영 도메인 공개 설정, netlify.app 은 경로 유지 301', () => {
    const b = netlifyBuild({ CONTEXT: 'production', PUBLIC_LAUNCH: 'true', SITE_NAME: 'jeongsan-note' });
    for (const p of PAGES) {
      const f = p.path === '/' ? 'index.html' : `${p.path.slice(1)}.html`;
      const html = b.read(f);
      assert.ok(html.includes(`<link rel="canonical" href="${SITE}${p.path}">`), f);
      assert.ok(!html.includes('noindex'), f);
    }
    const locs = [...b.read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.deepEqual(locs, PAGES.filter((p) => p.public).map((p) => SITE + p.path));
    assert.ok(!b.read('_headers').includes('X-Robots-Tag'));
    assert.match(b.read('_redirects'), /^https:\/\/jeongsan-note\.netlify\.app\/\*  https:\/\/xn--989a2xnd520fn5f\.site\/:splat  301!$/m);
  });

  test('페이지 평탄화: /salary-proration → salary-proration.html, 끝 슬래시 자기 이동 규칙 없음', () => {
    const b = netlifyBuild({ CONTEXT: 'deploy-preview' });
    assert.ok(b.exists('salary-proration.html') && b.exists('weekly-holiday-pay.html'));
    assert.ok(!b.exists('salary-proration/index.html'));
    assert.ok(!/\/salary-proration\/\s/.test(b.read('_redirects')));
  });

  test('netlify.toml: 빌드 명령과 배포 폴더', () => {
    const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
    assert.match(toml, /command = "node scripts\/netlify-build\.js"/);
    assert.match(toml, /publish = "dist"/);
  });
});
