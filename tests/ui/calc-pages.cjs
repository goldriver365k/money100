/**
 * 1차 계산기 6종 화면 점검 (Playwright)
 *   npm run test:calc-ui                 → 로컬 서버(site/)
 *   UI_BASE=https://주소 npm run test:calc-ui
 *
 * 너비 360·390·768·1440px 마다 각 계산기에 대해
 *   - 직접 접속 200, 제목·H1·메타 설명·적용 기준 표시·관련 계산기 3개(이용 가능 페이지로만 연결)
 *   - 빈 입력 제출 → 오류 문구·포커스, 결과 숨김
 *   - 대표 예제 입력 → 화면 결과 = 계산 모듈 결과 (같은 입력을 Node 에서 계산해 비교)
 *   - 결과 화면 가로 스크롤·잘림 없음 (모바일)
 *   - 초기화 → 확인 창 수락 시 입력·결과 비움
 *   - 접이식(적용 기준 및 공식 출처·FAQ) 기본 닫힘, 스크립트 오류 없음
 *   - 연도 변경(2027): 확정 전 기준이면 '계산할 수 없습니다'와 사유
 * 결과는 docs/ui/calc-pages-report.md 에 저장한다.
 */
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const WIDTHS = [360, 390, 768, 1440];
const results = [];
const check = (slug, w, item, ok, actual = '') => {
  const where = `[${slug} @ ${w}px]`;
  results.push({ where, item, ok: Boolean(ok), actual: String(actual) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${where} ${item}${ok ? '' : ` — ${actual}`}`);
};

(async () => {
  const { PAGES_SPEC, CATALOG } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'calculators.js')).href);
  const liveSlugs = new Set(CATALOG.filter((c) => c.slug).map((c) => `/${c.slug}`));
  let base = process.env.UI_BASE; let server = null;
  if (!base) {
    const { createServer } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'serve.js')).href);
    server = createServer({ dir: process.env.UI_DIR || 'site' });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const browser = await chromium.launch();
  try {
    for (const w of WIDTHS) {
      const mobile = w < 600;
      const ctx = await browser.newContext({ baseURL: base, locale: 'ko-KR', viewport: { width: w, height: 860 }, isMobile: mobile, hasTouch: mobile });
      for (const spec of PAGES_SPEC) {
        const p = await ctx.newPage();
        const errors = [];
        p.on('pageerror', (e) => errors.push(String(e)));
        const mod = await import(pathToFileURL(path.join(ROOT, 'site/assets/js/calc', `${spec.module}.js`)).href);
        const res = await p.goto(`/${spec.slug}`);
        await p.waitForSelector('form[data-ready="true"]');
        const info = await p.evaluate(() => ({
          title: document.title, h1: document.querySelector('h1').textContent,
          desc: document.querySelector('meta[name="description"]').content,
          basis: document.querySelector('.basis-badge')?.textContent ?? '',
          related: [...document.querySelectorAll('.related-list a')].map((a) => a.getAttribute('href')),
          folds: [...document.querySelectorAll('details.basis-fold, details.faq-fold')].map((d) => d.open),
          ld: (() => { try { return JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@type']; } catch { return null; } })(),
        }));
        check(spec.slug, w, '직접 접속·제목·H1·메타 설명·적용 기준·FAQ 구조화 데이터', res.status() === 200 && info.title === spec.title && info.h1 === spec.h1 && info.desc === spec.description && info.basis.includes('적용 기준') && info.ld === 'FAQPage', JSON.stringify({ s: res.status(), ...info, related: undefined }));
        check(spec.slug, w, '관련 계산기 3개 (이용 가능 페이지만)', info.related.length === 3 && info.related.every((h) => liveSlugs.has(h)), info.related.join(','));
        check(spec.slug, w, '접이식 영역 기본 닫힘', info.folds.length === 2 && info.folds.every((o) => !o), JSON.stringify(info.folds));

        // 빈 입력
        const firstText = spec.fields.find((f) => f.required);
        await p.fill(`[name="${firstText.name}"]`, '');
        await p.click('#submit');
        const empty = await p.evaluate((n) => ({ err: document.getElementById(`${n}-error`).textContent, hidden: document.getElementById(`${n}-error`).hidden, focus: document.activeElement?.name, result: document.getElementById('result').hidden }), firstText.name);
        check(spec.slug, w, '빈 입력 → 오류 문구·포커스·결과 숨김', !empty.hidden && empty.err.length > 0 && empty.focus === firstText.name && empty.result, JSON.stringify(empty));

        // 음수
        if (firstText.type === 'amount') {
          await p.fill(`[name="${firstText.name}"]`, '-1000');
          await p.click('#submit');
          const neg = await p.textContent(`#${firstText.name}-error`);
          check(spec.slug, w, '음수 입력 → 오류', /0보다 작을/.test(neg), neg);
        }

        // 대표 예제
        const raw = spec.example.raw;
        for (const f of spec.fields) {
          const v = raw[f.name];
          if (v == null) continue;
          if (f.type === 'radio') await p.check(`input[name="${f.name}"][value="${v}"]`);
          else if (['year', 'month', 'select'].includes(f.type)) await p.selectOption(`[name="${f.name}"]`, v);
          else await p.fill(`[name="${f.name}"]`, v);
        }
        await p.click('#submit');
        await p.waitForSelector('#result:not([hidden]) #result-body:not([hidden])', { timeout: 4000 });
        const shown = await p.$$eval('#result-stats .stat', (els) => els.map((e) => [e.querySelector('.stat-label').textContent, e.querySelector('.stat-value').textContent]));
        const want = mod.calculate(raw).stats.map((s) => [s.label, s.value]);
        check(spec.slug, w, '예제 결과 = 계산 모듈 결과', JSON.stringify(shown) === JSON.stringify(want), `화면 ${JSON.stringify(shown)} / 모듈 ${JSON.stringify(want)}`);
        const blocks = await p.evaluate(() => ({ formulas: document.querySelectorAll('#result-formulas li').length, warnings: document.querySelectorAll('#result-warnings li').length, disclaimer: /모의 계산/.test(document.querySelector('.result-disclaimer').textContent) }));
        check(spec.slug, w, '결과에 계산 공식·주의사항·모의계산 안내', blocks.formulas > 0 && blocks.warnings > 0 && blocks.disclaimer, JSON.stringify(blocks));
        if (mobile) {
          const ov = await p.evaluate(() => {
            const vw = document.documentElement.clientWidth; const clipped = [];
            for (const el of document.querySelectorAll('input, select, button, .stat, table, .kv, .related-link')) {
              if (!el.checkVisibility() || el.closest('.table-scroll')) continue;
              const r = el.getBoundingClientRect(); if (r.width && (r.left < -0.5 || r.right > vw + 0.5)) clipped.push(el.tagName + (el.id ? `#${el.id}` : ''));
            }
            return { overflow: document.documentElement.scrollWidth - vw, clipped };
          });
          check(spec.slug, w, '결과 화면 가로 스크롤·잘림 없음', ov.overflow <= 0 && ov.clipped.length === 0, JSON.stringify(ov));
        }

        // 연도 변경
        if (spec.fields.some((f) => f.type === 'year')) {
          await p.selectOption('[name="year"]', '2027');
          await p.click('#submit');
          await p.waitForSelector('#result:not([hidden])');
          const r27 = mod.calculate({ ...raw, year: '2027' });
          const st = await p.evaluate(() => ({ un: !document.getElementById('result-unavailable').hidden, reason: document.getElementById('unavailable-reason').textContent, body: !document.getElementById('result-body').hidden }));
          const ok = r27.ok ? (st.body && !st.un) : (st.un && st.reason === r27.unavailable && !st.body);
          check(spec.slug, w, `연도 변경(2027) → ${r27.ok ? '계산됨' : '계산 불가 사유 표시'}`, ok, JSON.stringify(st));
          await p.selectOption('[name="year"]', '2026');
        }

        // 초기화
        p.once('dialog', (d) => d.accept());
        await p.click('#reset-all');
        const after = await p.evaluate((n) => ({ v: document.querySelector(`[name="${n}"]`).value, result: document.getElementById('result').hidden }), firstText.name);
        check(spec.slug, w, '초기화 → 입력 비움·결과 숨김', after.v === '' && after.result, JSON.stringify(after));
        check(spec.slug, w, '스크립트 오류 없음', errors.length === 0, errors.join(' | '));
        await p.close();
      }
      await ctx.close();
    }
  } catch (err) {
    results.push({ where: '[점검 스크립트]', item: '실행 오류', ok: false, actual: String(err).split('\n')[0] });
    console.error(err);
  } finally {
    await browser.close();
    server?.close();
  }
  const fail = results.filter((r) => !r.ok);
  const lines = ['# 계산기 6종 화면 점검 결과', '', `- 실행: ${new Date().toISOString()} · 대상: ${process.env.UI_BASE || '로컬(site/)'} · 너비 ${WIDTHS.join('·')}px`, `- 집계: 통과 ${results.length - fail.length} · 실패 ${fail.length}`, '', '| 위치 | 항목 | 결과 | 실제값(실패 시) |', '|---|---|---|---|'];
  for (const r of results) lines.push(`| ${r.where} | ${r.item} | ${r.ok ? '통과' : '실패'} | ${r.ok ? '' : r.actual.replace(/\|/g, '\\|')} |`);
  fs.mkdirSync(path.join(ROOT, 'docs', 'ui'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'ui', 'calc-pages-report.md'), `${lines.join('\n')}\n`);
  console.log(`\n통과 ${results.length - fail.length} · 실패 ${fail.length}`);
  process.exitCode = fail.length ? 1 : 0;
})();
