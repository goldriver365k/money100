/**
 * 정산노트 화면 자동 점검 (Playwright)
 *   npm run test:ui                       → 로컬 서버(site/)
 *   UI_BASE=https://주소 npm run test:ui    → 배포된 주소
 *
 * 한 번 실행으로 확인하는 항목
 *   1. 세 페이지 직접 접속·새로고침 (360·390·1440px)
 *   2. 360·390px 가로 스크롤·입력/결과 잘림 (입력 화면, 결과 화면)
 *   3. 홈 카드 → 각 계산기 이동 → 대표 사례 입력 → 결과 표시 (360·390·1440px)
 *   4. 두 계산기 접이식 영역(적용 기준 및 공식 출처·자주 묻는 질문) 기본 닫힘, 클릭·키보드(Enter·Space)로 열고 닫기
 *   5. 접이식 영역을 연 채 재계산해도 열림 유지
 *   6. 기존 계산 테스트 기대값 = 실제값 (월급 일할계산기 5건, 주휴수당 7건)
 * 실패 메시지는 "[페이지 @ 너비px] 항목 — 실제값" 형식이다. 결과는 docs/ui/ui-check-report.md 에 저장한다.
 * 입력값은 모두 테스트용 가상값이다.
 */
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const WIDTHS = [360, 390, 1440];
const MOBILE = [360, 390];
const PAGES = [
  { key: 'home', path: '/', title: '급여 계산기 모음 | 정산노트', h1: '급여 계산기 모음' },
  { key: 'salary', path: '/salary-proration', title: '월급 일할계산기 — 중도 입사·퇴사 급여 계산 | 정산노트', h1: '월급 일할계산기' },
  { key: 'whp', path: '/weekly-holiday-pay', title: '주휴수당 계산기 — 주 15시간·변동 근무 판독 | 정산노트', h1: '주휴수당 계산기' },
];
const LABEL = { home: '홈', salary: '월급 일할계산기', whp: '주휴수당 계산기' };

const results = [];
function check(pageKey, width, item, ok, actual = '') {
  const where = `[${LABEL[pageKey] ?? pageKey} @ ${width}px]`;
  results.push({ where, item, ok: Boolean(ok), actual: String(actual) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${where} ${item}${ok ? '' : ` — ${actual}`}`);
}

/* ---------- 입력 도우미 ---------- */
async function salaryCase(p, c) {
  await p.goto('/salary-proration');
  await p.selectOption('#year', String(c.year));
  await p.selectOption('#month', String(c.month));
  await p.check(`input[name="type"][value="${c.type}"]`);
  await p.fill('#salary', c.salary);
  if (c.start) await p.fill('#start-date', c.start);
  if (c.end) await p.fill('#end-date', c.end);
  if (c.clearAll) await p.click('#clear-workdays');
  for (const d of c.add ?? []) await p.check(`#workday-${d}`);
}
async function salaryCalc(p) {
  await p.click('#submit');
  await p.waitForSelector('#result:not([hidden])', { timeout: 4000 });
  const cell = (r, c) => p.locator(`#row-${r} [data-col="${c}"]`).innerText();
  return {
    cal: [await cell('calendar', 'applied'), await cell('calendar', 'total'), await cell('calendar', 'amount')],
    work: [await cell('workday', 'applied'), await cell('workday', 'total'), await cell('workday', 'amount')],
    diff: await p.locator('#diff-value').innerText(),
  };
}
const HIRE = Date.UTC(2026, 6, 6) / 86400000;
const iso = (off) => new Date((HIRE + off) * 86400000).toISOString().slice(0, 10);
const MWF = (w, h, m = '0') => [0, 2, 4].map((k) => [w * 7 + k, h, m]);
const TT = (w, h, m = '0') => [1, 3].map((k) => [w * 7 + k, h, m]);
const MW = (w, h, m = '0') => [0, 2].map((k) => [w * 7 + k, h, m]);
async function whpCase(p, c) {
  await p.goto('/weekly-holiday-pay');
  await p.fill('#hire-date', '2026-07-06');
  if (c.end) {
    await p.check('input[name="status"][value="left"]');
    await p.fill('#end-date', c.end);
  }
  await p.fill('#wage', '10320');
  for (const [off, h, m] of c.days) {
    const d = iso(off);
    await p.click(`#tab-${Math.floor(off / 7) + 1}`);
    await p.fill(`#h-${d}`, h);
    await p.fill(`#m-${d}`, m);
    await p.check(`input[name="att-${d}"][value="${(c.att ?? {})[d] ?? 'present'}"]`);
  }
  for (const n of c.noWork ?? []) {
    await p.click(`#tab-${n}`);
    await p.click(`#nowork-${n}`);
  }
}
async function whpCalc(p) {
  await p.click('#submit');
  await p.waitForSelector('#result:not([hidden])', { timeout: 4000 });
  return p.$$eval('#whp-rows tr', (trs) => trs.map((tr) => {
    const t = (c) => tr.querySelector(`[data-col="${c}"]`).innerText.replace(/\s+/g, ' ').trim();
    return { status: t('status'), window: t('window'), applied: t('applied'), reason: t('reason'), amount: t('amount') };
  }));
}

/* ---------- 레이아웃 측정 ---------- */
async function layout(p, scope) {
  return p.evaluate((scopeSel) => {
    const vw = document.documentElement.clientWidth;
    const overflow = document.documentElement.scrollWidth - vw;
    const root = scopeSel ? document.querySelector(scopeSel) : document;
    const sel = 'input:not([type=radio]):not([type=checkbox]), select, button, .choice, .att-opt, .card, table, td, th, .diff, .result-summary, .day, .badge';
    const clipped = [];
    for (const el of root.querySelectorAll(sel)) {
      if (!el.checkVisibility()) continue;
      if (el.closest('.week-tabs')) continue; // 주차 탭은 가로 스크롤 영역(의도)
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.left < -0.5 || r.right > vw + 0.5) clipped.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${[...el.classList].join('.')} (${Math.round(r.left)}~${Math.round(r.right)})`);
    }
    return { overflow, clipped };
  }, scope ?? null);
}

/* ---------- 접이식 영역 ---------- */
const foldOpen = (p) => p.evaluate(() => document.querySelector('details.basis-fold').open);

(async () => {
  let base = process.env.UI_BASE;
  let server = null;
  if (!base) {
    const { createServer } = await import(path.join(ROOT, 'scripts', 'serve.js'));
    server = createServer({ dir: process.env.UI_DIR || 'site' });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const browser = await chromium.launch();
  try {
    for (const w of WIDTHS) {
      const mobile = w < 600;
      const ctx = await browser.newContext({ baseURL: base, locale: 'ko-KR', viewport: { width: w, height: mobile ? 800 : 900 }, isMobile: mobile, hasTouch: mobile });
      const p = await ctx.newPage();
      const errors = [];
      p.on('pageerror', (e) => errors.push(String(e)));

      // 1. 직접 접속·새로고침
      for (const pg of PAGES) {
        const r1 = await p.goto(pg.path);
        const r2 = await p.reload();
        const title = await p.title();
        const h1 = await p.locator('h1').innerText();
        check(pg.key, w, '직접 접속·새로고침', r1.status() === 200 && r2.status() === 200 && title === pg.title && h1 === pg.h1, `${r1.status()}/${r2.status()} “${title}” “${h1}”`);
        if (MOBILE.includes(w)) {
          const l = await layout(p);
          check(pg.key, w, '첫 화면 가로 스크롤·잘림 없음', l.overflow <= 0 && l.clipped.length === 0, `넘침 ${l.overflow}px, 잘림 ${l.clipped.slice(0, 3).join(', ')}`);
        }
      }

      // 3. 홈 카드 → 계산기 → 대표 사례
      await p.goto('/');
      const cardCount = await p.locator('a.card').count();
      check('home', w, '계산기 카드 2개', cardCount === 2, `${cardCount}개`);
      await p.locator('a.card[href="/salary-proration"]').click();
      await p.waitForURL(`${base}/salary-proration`);
      await salaryCase(p, { salary: '3100000', year: 2026, month: 1, type: 'join', start: '2026-01-16' });
      const r = await salaryCalc(p);
      check('salary', w, '홈 카드 → 대표 사례 결과', r.cal[2] === '1,600,000원' && r.work[2] === '1,550,000원' && r.diff.startsWith('50,000원'), JSON.stringify(r));
      if (MOBILE.includes(w)) {
        const l = await layout(p, 'main');
        check('salary', w, '결과 화면 가로 스크롤·잘림 없음', l.overflow <= 0 && l.clipped.length === 0, `넘침 ${l.overflow}px, 잘림 ${l.clipped.slice(0, 3).join(', ')}`);
      }
      await p.goto('/');
      await p.locator('a.card[href="/weekly-holiday-pay"]').click();
      await p.waitForURL(`${base}/weekly-holiday-pay`);
      await whpCase(p, { days: [0, 1, 2, 3].flatMap((x) => MWF(x, '5')) });
      const wr = await whpCalc(p);
      check('whp', w, '홈 카드 → 대표 사례 결과', wr.length === 4 && wr.every((x) => x.status === '지급 대상' && x.amount.startsWith('30,960원')), wr.map((x) => `${x.status} ${x.amount.split(' ')[0]}`).join(' / '));
      if (MOBILE.includes(w)) {
        const l = await layout(p, 'main');
        check('whp', w, '결과 화면 가로 스크롤·잘림 없음', l.overflow <= 0 && l.clipped.length === 0, `넘침 ${l.overflow}px, 잘림 ${l.clipped.slice(0, 3).join(', ')}`);
      }

      // 4·5. 접이식 영역
      for (const key of ['salary', 'whp']) {
        const pg = PAGES.find((x) => x.key === key);
        await p.goto(pg.path);
        const closed = !(await foldOpen(p));
        const sum = p.locator('details.basis-fold > summary');
        await sum.scrollIntoViewIfNeeded();
        const box = await sum.boundingBox();
        await p.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
        const openByClick = await foldOpen(p);
        await p.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
        const closedByClick = !(await foldOpen(p));
        await sum.focus();
        await p.keyboard.press('Enter');
        const openByEnter = await foldOpen(p);
        await p.keyboard.press('Space');
        const closedBySpace = !(await foldOpen(p));
        check(key, w, '접이식 영역 기본 닫힘·클릭·Enter·Space', closed && openByClick && closedByClick && openByEnter && closedBySpace,
          `기본 ${closed ? '닫힘' : '열림'} · 클릭 ${openByClick}/${closedByClick} · Enter ${openByEnter} · Space ${closedBySpace}`);

        // 자주 묻는 질문 접이식: 기본 닫힘·새로고침 후 닫힘·제목줄 클릭·Enter·Space·열면 질문 보임
        {
          await p.goto(pg.path);
          const faqState = () => p.evaluate(() => {
            const d = document.querySelector('details.faq-fold');
            return { open: d.open, title: d.querySelector(':scope > summary').innerText.trim(), visibleQ: [...d.querySelectorAll('h3')].filter((h) => h.checkVisibility()).length };
          });
          const f0 = await faqState();
          const fs = p.locator('details.faq-fold > summary');
          await fs.scrollIntoViewIfNeeded();
          const fb = await fs.boundingBox();
          await p.mouse.click(fb.x + fb.width - 8, fb.y + fb.height / 2);
          const f1 = await faqState();
          await p.reload();
          const f2 = await faqState();
          await p.locator('details.faq-fold > summary').focus();
          await p.keyboard.press('Enter');
          const f3 = (await faqState()).open;
          await p.keyboard.press('Space');
          const f4 = (await faqState()).open;
          check(key, w, '자주 묻는 질문 접이식: 기본 닫힘·클릭·새로고침·Enter·Space',
            f0.title === '자주 묻는 질문' && !f0.open && f0.visibleQ === 0 && f1.open && f1.visibleQ >= 3 && !f2.open && f3 && !f4,
            `제목 “${f0.title}” · 기본 ${f0.open ? '열림' : '닫힘'}(질문 ${f0.visibleQ}개 보임) · 클릭 후 ${f1.open ? '열림' : '닫힘'}(질문 ${f1.visibleQ}개) · 새로고침 후 ${f2.open ? '열림' : '닫힘'} · Enter ${f3} · Space ${f4}`);
        }

        // 열린 채 계산 → 수정 → 재계산
        if (key === 'salary') {
          await salaryCase(p, { salary: '3100000', year: 2026, month: 1, type: 'join', start: '2026-01-16' });
          await sum.click();
          await salaryCalc(p);
          await p.fill('#salary', '6200000');
          const r2 = await salaryCalc(p);
          check(key, w, '열린 채 재계산 → 열림 유지·새 값 반영', (await foldOpen(p)) && r2.cal[2] === '3,200,000원', `열림=${await foldOpen(p)} · ${r2.cal[2]}`);
        } else {
          await whpCase(p, { days: [0, 1, 2, 3].flatMap((x) => MWF(x, '5')) });
          await sum.click();
          await whpCalc(p);
          await p.click('#tab-1');
          await p.fill(`#h-${iso(0)}`, '6');
          const w2 = await whpCalc(p);
          check(key, w, '열린 채 재계산 → 열림 유지·새 값 반영', (await foldOpen(p)) && w2[0].applied.startsWith('평균 15시간 15분'), `열림=${await foldOpen(p)} · ${w2[0].applied}`);
        }
      }

      // 6. 기존 계산 기대값 (390px에서 1회)
      if (w === 390) {
        const SAL = [
          [{ salary: '3100000', year: 2026, month: 1, type: 'join', start: '2026-01-16' }, ['16일', '31일', '1,600,000원'], ['11일', '22일', '1,550,000원'], '50,000원 · 달력일 기준이 더 큽니다'],
          [{ salary: '2900000', year: 2028, month: 2, type: 'leave', end: '2028-02-10' }, ['10일', '29일', '1,000,000원'], ['8일', '21일', '1,104,762원'], '104,762원 · 소정근로일 기준이 더 큽니다'],
          [{ salary: '3100000', year: 2026, month: 1, type: 'both', start: '2026-01-17', end: '2026-01-17', add: [17] }, ['1일', '31일', '100,000원'], ['1일', '23일', '134,783원'], '34,783원 · 소정근로일 기준이 더 큽니다'],
          [{ salary: '3210000', year: 2026, month: 1, type: 'both', start: '2026-01-01', end: '2026-01-31' }, ['31일', '31일', '3,210,000원'], ['22일', '22일', '3,210,000원'], '0원 · 두 방식의 예상액이 같습니다'],
          [{ salary: '3100000', year: 2026, month: 1, type: 'both', start: '2026-01-17', end: '2026-01-17', clearAll: true }, ['1일', '31일', '100,000원'], ['0일', '0일', '월 전체 소정근로일을 1일 이상 선택해 주세요'], '비교 불가'],
        ];
        for (const [i, [c, cal, work, diff]] of SAL.entries()) {
          await salaryCase(p, c);
          const a = await salaryCalc(p);
          check('salary', w, `계산 사례 ${i + 1}`, JSON.stringify([a.cal, a.work, a.diff]) === JSON.stringify([cal, work, diff]), JSON.stringify(a));
        }
        const W4 = '7/6(월)~8/2(일) · 1~4주차';
        const WHP = [
          ['14시간 59분', { days: [...MW(0, '8'), ...TT(1, '7'), ...MWF(2, '5'), ...TT(3, '7', '28')] }, (rs) => rs.every((x) => x.status === '지급 대상 아님' && x.applied.startsWith('평균 14시간 59분') && x.window.startsWith(W4))],
          ['정확히 15시간', { days: [0, 1, 2, 3].flatMap((x) => MWF(x, '5')) }, (rs) => rs.every((x) => x.status === '지급 대상' && x.amount.startsWith('30,960원'))],
          ['변동 근무 평균 15시간', { days: [...TT(0, '6'), ...MWF(1, '6'), ...TT(2, '5', '15'), ...MWF(3, '6', '30')] }, (rs) => rs.every((x) => x.status === '지급 대상' && x.applied.startsWith('평균 15시간 0분'))],
          ['결근', { days: [0, 1, 2, 3].flatMap((x) => MWF(x, '6')), att: { '2026-07-15': 'absent' } }, (rs) => rs[1].status === '지급 대상 아님' && /7월 15일\(수\)에 결근/.test(rs[1].reason) && [0, 2, 3].every((i) => rs[i].amount.startsWith('37,152원'))],
          ['4주 미만 근로', { end: '2026-07-22', days: [...MWF(0, '6'), ...MWF(1, '6'), ...MW(2, '6')] }, (rs) => rs[0].status === '지급 대상' && rs[0].window.startsWith('7/6(월)~7/22(수)') && rs[0].amount.includes('별도 확인 필요') && rs[2].status === '지급 대상 아님'],
          ['자료 누락', { days: [...MWF(0, '6'), ...MWF(1, '6'), ...MWF(3, '6')] }, (rs) => rs.every((x) => x.status === '정보 부족' && !/\d+원/.test(x.amount))],
          ['근무 없음 확정', { days: [...MWF(0, '6'), ...MWF(1, '6'), ...MWF(3, '6')], noWork: [3] }, (rs) => rs.every((x) => x.status === '지급 대상 아님' && x.applied.startsWith('평균 13시간 30분'))],
        ];
        for (const [name, c, ok] of WHP) {
          await whpCase(p, c);
          const rs = await whpCalc(p);
          check('whp', w, `계산 사례: ${name}`, ok(rs), rs.map((x) => `${x.status}/${x.applied.split(' (')[0]}/${x.amount.split(' ')[0]}`).join(' | '));
        }
      }
      check('home', w, '스크립트 오류 없음(전 페이지)', errors.length === 0, errors.join(' | '));
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
  const lines = ['# 화면 자동 점검 결과', '', `- 실행: ${new Date().toISOString()} · 대상: ${process.env.UI_BASE || `로컬(${process.env.UI_DIR || 'site'}/)`} · 너비 ${WIDTHS.join('·')}px`, `- 집계: 통과 ${results.length - fail.length} · 실패 ${fail.length}`, '', '| 위치 | 항목 | 결과 | 실제값(실패 시) |', '|---|---|---|---|'];
  for (const r of results) lines.push(`| ${r.where} | ${r.item} | ${r.ok ? '통과' : '실패'} | ${r.ok ? '' : r.actual.replace(/\|/g, '\\|')} |`);
  fs.mkdirSync(path.join(ROOT, 'docs', 'ui'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'ui', 'ui-check-report.md'), `${lines.join('\n')}\n`);
  console.log(`\n통과 ${results.length - fail.length} · 실패 ${fail.length}`);
  if (fail.length) {
    console.log('\n실패 항목');
    for (const f of fail) console.log(`  ${f.where} ${f.item} — ${f.actual}`);
  }
  process.exit(fail.length ? 1 : 0);
})();
