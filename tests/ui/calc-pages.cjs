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
// 운영 주소 점검 시 일시적인 네트워크 지연(30초 초과)으로 전체 점검이 끊기지 않도록 페이지 이동만 한 번 다시 시도한다 (판정 기준은 그대로)
const gotoRetry = async (p, url) => { try { return await p.goto(url); } catch (e) { if (!/Timeout/.test(String(e))) throw e; return p.goto(url); } };
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
        const res = await gotoRetry(p, `/${spec.slug}`);
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
        const firstText = spec.fields.find((f) => f.required) ?? spec.fields.find((f) => f.type === 'amount');
        await p.fill(`[name="${firstText.name}"]`, '');
        await p.click('#submit');
        const empty = await p.evaluate((n) => {
          const errs = [...document.querySelectorAll('form .error:not([hidden])')].length;
          const sum = document.getElementById('error-summary');
          return { err: document.getElementById(`${n}-error`).textContent, hidden: document.getElementById(`${n}-error`).hidden, errs,
            focus: document.activeElement?.id === 'error-summary' ? 'error-summary' : document.activeElement?.name,
            summaryLinks: sum ? [...sum.querySelectorAll('a')].map((a) => a.getAttribute('href')) : null, result: document.getElementById('result').hidden };
        }, firstText.name);
        // 오류 1개: 그 칸으로 포커스 / 2개 이상: 오류 요약 상자로 포커스, 요약에 해당 칸 링크 (칸별 오류 문구 유지)
        const focusOk = empty.errs >= 2 ? empty.focus === 'error-summary' && empty.summaryLinks?.includes(`#${firstText.name}`) : empty.focus === firstText.name && empty.summaryLinks === null;
        check(spec.slug, w, '빈 입력 → 칸별 오류 문구·포커스(1개: 칸, 2개 이상: 오류 요약)·결과 숨김', !empty.hidden && empty.err.length > 0 && focusOk && empty.result, JSON.stringify(empty));
        if (empty.errs >= 2) {
          await p.click(`#error-summary a[href="#${firstText.name}"]`);
          const linked = await p.evaluate(() => document.activeElement?.name);
          check(spec.slug, w, '오류 요약 링크 → 해당 입력칸으로 이동', linked === firstText.name, String(linked));
        }

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
        check(spec.slug, w, '초기화 → 입력 기본값 복원·결과 숨김', after.v === (firstText.value ?? '') && after.result, JSON.stringify(after));
        check(spec.slug, w, '스크립트 오류 없음', errors.length === 0, errors.join(' | '));
        await p.close();
      }
      // '세전 월급' 자동 계산 도우미 (월급 실수령액·4대보험)
      for (const S of ['monthly-salary-net', 'social-insurance']) {
        const p = await ctx.newPage(); const errs = [];
        p.on('pageerror', (e) => errs.push(String(e)));
        await gotoRetry(p, `/${S}`);
        await p.waitForSelector('form[data-ready="true"]');
        const specH = PAGES_SPEC.find((x) => x.slug === S);
        const modH = await import(pathToFileURL(path.join(ROOT, 'site/assets/js/calc', `${specH.module}.js`)).href);
        const tog = p.locator('#pay-helper-toggle');
        const before = await p.evaluate(() => ({ hidden: document.getElementById('pay-helper').hidden, exp: document.getElementById('pay-helper-toggle').getAttribute('aria-expanded'), h: Math.round(document.getElementById('pay-helper-toggle').getBoundingClientRect().height), direct: document.getElementById('pay').readOnly === false }));
        if (mobile) await tog.tap(); else await tog.click();
        const opened = await p.evaluate(() => ({ hidden: document.getElementById('pay-helper').hidden, exp: document.getElementById('pay-helper-toggle').getAttribute('aria-expanded') }));
        check(S, w, '자동 계산 버튼: 기본 닫힘·직접 입력 유지·누르면 펼침(aria-expanded)·높이 44px 이상', before.hidden && before.exp === 'false' && before.direct && before.h >= 44 && !opened.hidden && opened.exp === 'true', JSON.stringify({ before, opened }));
        // 빈 값으로 넣기 → 오류, 패널 유지
        await p.click('#pay-helper-apply');
        const err = await p.evaluate(() => ({ e: document.getElementById('mpAnnual-error').textContent, open: !document.getElementById('pay-helper').hidden, pay: document.getElementById('pay').value }));
        check(S, w, '자동 계산: 빈 연봉으로 넣기 → 오류 표시·패널 유지·입력란 변경 없음', err.e.length > 0 && err.open && err.pay === '', JSON.stringify(err));
        // 연봉 ÷ 12
        await p.fill('#mpAnnual', '50000000'); await p.fill('#mpNonTaxableA', '200000');
        const prev = await p.textContent('#pay-helper-result');
        await p.click('#pay-helper-apply');
        const a = await p.evaluate(() => ({ pay: document.getElementById('pay').value, nt: document.getElementById('nonTaxable').value, closed: document.getElementById('pay-helper').hidden, focus: document.activeElement?.id, preview: document.getElementById('pay-preview').textContent }));
        check(S, w, '연봉 ÷ 12: 미리보기 → 세전 월급 4,166,666원·비과세 200,000원 자동 입력, 패널 닫힘·입력란 포커스', /4,166,666원/.test(prev) && a.pay === '4166666' && a.nt === '200000' && a.closed && a.focus === 'pay' && /4,166,666원/.test(a.preview), JSON.stringify({ prev: prev.slice(0, 80), ...a }));
        await p.click('#submit'); await p.waitForSelector('#result:not([hidden]) #result-body:not([hidden])');
        const shown = await p.$$eval('#result-stats .stat', (els) => els.map((e) => e.querySelector('.stat-value').textContent));
        const formRaw = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('form [name]')].filter((e) => !e.name.startsWith('mp') && (e.type !== 'radio' || e.checked)).map((e) => [e.name, e.value])));
        const wantH = modH.calculate(formRaw).stats.map((x) => x.value);
        const extra = S === 'monthly-salary-net' ? shown[0] === '3,553,771원' : shown[0] === modH.calculate({ ...formRaw, pay: '4166666', nonTaxable: '200000' }).stats[0].value;
        check(S, w, '자동 입력 후 계산 결과 = 계산 모듈 (비과세 중복 차감 없음)', JSON.stringify(shown) === JSON.stringify(wantH) && extra, `${shown.join(' / ')} | 모듈 ${wantH.join(' / ')}`);
        // 기본급 + 수당
        await tog.click();
        await p.check('input[name="mpMode"][value="parts"]');
        await p.fill('#mpBase', '2500000'); await p.fill('#mpAllowance', '300000'); await p.fill('#mpNonTaxableP', '200000');
        await p.click('#pay-helper-apply');
        const b = await p.evaluate(() => ({ pay: document.getElementById('pay').value, nt: document.getElementById('nonTaxable').value }));
        check(S, w, '기본급 + 수당: 250만 + 30만 + 비과세 20만 → 세전 월급 3,000,000원·비과세 200,000원', b.pay === '3000000' && b.nt === '200000', JSON.stringify(b));
        if (mobile) {
          await tog.click();
          const ov = await p.evaluate(() => { const vw = document.documentElement.clientWidth; const bad = [...document.querySelectorAll('#pay-helper input, #pay-helper button, #pay-helper .choice')].filter((e) => e.checkVisibility() && e.getBoundingClientRect().right > vw + 0.5).length; const small = [...document.querySelectorAll('#pay-helper button, #pay-helper .choice')].filter((e) => e.checkVisibility() && e.getBoundingClientRect().height < 44).length; return { overflow: document.documentElement.scrollWidth - vw, bad, small }; });
          check(S, w, '자동 계산 패널 모바일: 가로 넘침·잘림 없음, 버튼·선택지 44px 이상', ov.overflow <= 0 && ov.bad === 0 && ov.small === 0, JSON.stringify(ov));
        }
        check(S, w, '자동 계산: 스크립트 오류 없음', errs.length === 0, errs.join(' | '));
        await p.close();
      }
      // '통상시급' 자동 계산 도우미 (연차수당)
      {
        const S = 'annual-leave-pay';
        const p = await ctx.newPage(); const errs = [];
        p.on('pageerror', (e) => errs.push(String(e)));
        await gotoRetry(p, `/${S}`);
        await p.waitForSelector('form[data-ready="true"]');
        const tog = p.locator('#hourly-helper-toggle');
        const h = await p.evaluate(() => Math.round(document.getElementById('hourly-helper-toggle').getBoundingClientRect().height));
        if (mobile) await tog.tap(); else await tog.click();
        const opened = await p.evaluate(() => !document.getElementById('hourly-helper').hidden && document.getElementById('hourly-helper-toggle').getAttribute('aria-expanded') === 'true');
        await p.click('#hourly-helper-apply');
        const err = await p.evaluate(() => ({ e: document.getElementById('ohBase-error').textContent, open: !document.getElementById('hourly-helper').hidden, v: document.getElementById('hourly').value }));
        check(S, w, '통상시급 자동 계산: 펼침(44px 버튼)·빈 기본급 → 오류·패널 유지·입력란 변경 없음', h >= 44 && opened && err.e.length > 0 && err.open && err.v === '', JSON.stringify({ h, opened, ...err }));
        await p.fill('#ohBase', '2500000'); await p.fill('#ohFixed', '200000'); await p.fill('#ohBonus', '2400000');
        const prev = await p.textContent('#hourly-helper-result');
        await p.click('#hourly-helper-apply');
        const a = await p.evaluate(() => ({ v: document.getElementById('hourly').value, closed: document.getElementById('hourly-helper').hidden, focus: document.activeElement?.id }));
        check(S, w, '통상시급: 290만 ÷ 209시간 → 13,875원 자동 입력·패널 닫힘·입력란 포커스', /209시간/.test(prev) && a.v === '13875' && a.closed && a.focus === 'hourly', JSON.stringify({ prev: prev.slice(0, 60), ...a }));
        await p.fill('#weeklyHours', '20'); await tog.click(); await p.fill('#ohBase', '1200000'); await p.fill('#ohFixed', ''); await p.fill('#ohBonus', '');
        await p.click('#hourly-helper-apply');
        const b = await p.inputValue('#hourly');
        check(S, w, '통상시급: 1주 소정근로시간(20시간) 반영 → 104시간 기준 11,538원', b === '11538', b);
        if (mobile) {
          await tog.click();
          const ov = await p.evaluate(() => { const vw = document.documentElement.clientWidth; const bad = [...document.querySelectorAll('#hourly-helper input, #hourly-helper button')].filter((e) => e.checkVisibility() && e.getBoundingClientRect().right > vw + 0.5).length; const small = [...document.querySelectorAll('#hourly-helper button')].filter((e) => e.checkVisibility() && e.getBoundingClientRect().height < 44).length; return { overflow: document.documentElement.scrollWidth - vw, bad, small }; });
          check(S, w, '통상시급 패널 모바일: 가로 넘침·잘림 없음, 버튼 44px 이상', ov.overflow <= 0 && ov.bad === 0 && ov.small === 0, JSON.stringify(ov));
        }
        check(S, w, '통상시급 자동 계산: 스크립트 오류 없음', errs.length === 0, errs.join(' | '));
        await p.close();
      }
      // 공통 아코디언 (이용 가능한 모든 계산기)
      for (const slug of liveSlugs) {
        const p = await ctx.newPage();
        await gotoRetry(p, slug);
        const fold = p.locator('details.info-fold');
        const sum = fold.locator('> summary');
        const state = () => p.evaluate(() => {
          const d = document.querySelector('details.info-fold');
          const icon = d.querySelector('.fold-icon');
          const m = new DOMMatrix(getComputedStyle(icon).transform);
          const angle = Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI);
          const bodyVisible = d.querySelector('.fold-body').checkVisibility();
          return { open: d.open, angle, bodyVisible, title: d.querySelector('summary h2').textContent.trim(), iconHidden: icon.getAttribute('aria-hidden') };
        });
        await p.waitForTimeout(250);
        const s0 = await state();
        const outside = await p.evaluate(() => { const d = document.querySelector('details.info-fold'); const f = document.querySelector('form'); const r = document.getElementById('result'); return !d.contains(f) && !d.contains(r) && f.checkVisibility(); });
        const count = await fold.count();
        check(slug, w, '아코디언: 1개·기본 접힘·제목 ‘계산 방법 · 실제 예제 · 공식출처’·아래 화살표·입력/결과는 밖에 항상 표시',
          count === 1 && !s0.open && !s0.bodyVisible && s0.title === '계산 방법 · 실제 예제 · 공식출처' && s0.angle === 45 && s0.iconHidden === 'true' && outside, JSON.stringify({ count, ...s0, outside }));
        if (mobile) await sum.tap(); else await sum.click();
        await p.waitForTimeout(250);
        const s1 = await state();
        const content = await p.evaluate(() => { const d = document.querySelector('details.info-fold'); return { links: d.querySelectorAll('.sources a').length, checked: !!d.querySelector('.checked-date'), text: d.querySelector('.fold-body').innerText.length }; });
        if (mobile) await sum.tap(); else await sum.click();
        await p.waitForTimeout(250);
        const s2 = await state();
        check(slug, w, `아코디언 ${mobile ? '터치' : '클릭'}: 펼침(위 화살표·내용 표시·출처 링크 유지) → 다시 누르면 접힘`,
          s1.open && s1.bodyVisible && s1.angle === -135 && content.links >= 1 && content.checked && content.text > 200 && !s2.open && s2.angle === 45, JSON.stringify({ s1, content, s2 }));
        await sum.focus();
        await p.keyboard.press('Enter'); const k1 = (await state()).open;
        await p.keyboard.press('Space'); const k2 = (await state()).open;
        const role = await p.evaluate(() => { const s = document.querySelector('details.info-fold > summary'); return { tag: s.tagName, focusable: s.tabIndex >= 0 }; });
        check(slug, w, '아코디언 키보드: Enter 펼침·Space 접힘, summary 포커스 가능', k1 && !k2 && role.tag === 'SUMMARY' && role.focusable, JSON.stringify({ k1, k2, role }));
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
