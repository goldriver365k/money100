#!/usr/bin/env node
/**
 * 화면 캡처 (UI 검수용). 세 페이지를 360·390·1440px 에서 테스트용 가상 입력값으로 채워 전체 화면을 저장한다.
 *
 *   npm run ui:capture                       → docs/ui/current/
 *   node scripts/ui-capture.cjs --out docs/ui/before
 *   node scripts/ui-capture.cjs --base https://운영주소   (배포된 주소 캡처)
 *
 * 파일 이름: <페이지>-<너비>-<상태>.png  (예: salary-360-result.png)
 * 상태: home / form(입력 전) / result(가상값 계산 후) / fold-open(결과 + 접이식 영역 펼침)
 */
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const arg = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const OUT = path.resolve(ROOT, arg('--out', 'docs/ui/current'));
const WIDTHS = (arg('--widths', '360,390,1440')).split(',').map(Number);

// 테스트용 가상 입력값 (실제 개인 정보 아님)
const SAMPLE = {
  salary: { salary: '3100000', year: '2026', month: '1', type: 'join', start: '2026-01-16' },
  whp: { hire: '2026-07-06', wage: '10320', days: [0, 1, 2, 3].flatMap((w) => [0, 2, 4].map((k) => w * 7 + k)), absent: 9 },
};

const isoAt = (offset) => new Date(Date.UTC(2026, 6, 6) + offset * 86400000).toISOString().slice(0, 10);

async function fillSalary(p) {
  const s = SAMPLE.salary;
  await p.selectOption('#year', s.year);
  await p.selectOption('#month', s.month);
  await p.check(`input[name="type"][value="${s.type}"]`);
  await p.fill('#salary', s.salary);
  await p.fill('#start-date', s.start);
  await p.click('#submit');
  await p.waitForSelector('#result:not([hidden])');
}

async function fillWhp(p) {
  const s = SAMPLE.whp;
  await p.fill('#hire-date', s.hire);
  await p.fill('#wage', s.wage);
  for (const off of s.days) {
    const iso = isoAt(off);
    await p.click(`#tab-${Math.floor(off / 7) + 1}`);
    await p.fill(`#h-${iso}`, '6');
    await p.check(`input[name="att-${iso}"][value="${off === s.absent ? 'absent' : 'present'}"]`);
  }
  await p.click('#tab-1');
  await p.click('#submit');
  await p.waitForSelector('#result:not([hidden])');
}

(async () => {
  let base = arg('--base', null);
  let server = null;
  if (!base) {
    const { createServer } = await import(path.join(ROOT, 'scripts', 'serve.js'));
    server = createServer({ dir: arg('--dir', 'site') });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const shots = [];
  for (const w of WIDTHS) {
    const mobile = w < 600;
    const ctx = await browser.newContext({ baseURL: base, locale: 'ko-KR', viewport: { width: w, height: mobile ? 800 : 900 }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
    const p = await ctx.newPage();
    const snap = async (name) => {
      const file = path.join(OUT, `${name}.png`);
      await p.waitForTimeout(250);
      await p.screenshot({ path: file, fullPage: true });
      shots.push(path.relative(ROOT, file));
    };
    await p.goto('/');
    await snap(`home-${w}-home`);
    await p.goto('/salary-proration');
    await snap(`salary-${w}-form`);
    await fillSalary(p);
    await snap(`salary-${w}-result`);
    await p.goto('/weekly-holiday-pay');
    await snap(`whp-${w}-form`);
    await fillWhp(p);
    await snap(`whp-${w}-result`);
    await p.locator('details.basis-fold > summary').click();
    await snap(`whp-${w}-fold-open`);
    await ctx.close();
  }
  await browser.close();
  server?.close();
  console.log(`캡처 ${shots.length}장 → ${path.relative(ROOT, OUT)}/`);
  console.log(shots.join('\n'));
})();
