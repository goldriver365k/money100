/**
 * 생활계산서 화면 자동 점검 (Playwright)
 *   npm run test:ui                       → 로컬 서버(site/)
 *   UI_BASE=https://주소 npm run test:ui    → 배포된 주소
 *
 * 한 번 실행으로 확인하는 항목
 *   0. 홈 계산기 10종 목록: 카드 열 수(PC 3·태블릿 2·모바일 1), 대표 계산기, 준비 중 표시, 검색·분야별 보기
 *   1. 세 페이지 직접 접속·새로고침 (360·390·768·1440px)
 *   2. 360·390px 가로 스크롤·입력/결과 잘림 (입력 화면, 결과 화면)
 *   3. 홈 카드 → 각 계산기 이동 → 대표 사례 입력 → 결과 표시 (360·390·1440px)
 *   4. 두 계산기 접이식 영역(적용 기준 및 공식 출처·자주 묻는 질문) 기본 닫힘, 클릭·키보드(Enter·Space)로 열고 닫기
 *   5. 접이식 영역을 연 채 재계산해도 열림 유지
 *   6. 기존 계산 테스트 기대값 = 실제값 (월급 일할계산기 5건, 주휴수당 7건)
 *   7. 전체 초기화: 취소 시 유지, 확인 시 기본값 복원·결과 숨김·접이식 상태 유지, 빈 폼은 확인 창 없음
 * 실패 메시지는 "[페이지 @ 너비px] 항목 — 실제값" 형식이다. 결과는 docs/ui/ui-check-report.md 에 저장한다.
 * 입력값은 모두 테스트용 가상값이다.
 */
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const WIDTHS = [360, 390, 768, 1440];
const MOBILE = [360, 390];
const PAGES = [
  { key: 'home', path: '/', title: '급여·세금·부동산 계산기 30종 | 생활계산서', h1: '생활에 필요한 계산을 한곳에서' },
  { key: 'salary', path: '/salary-proration', title: '월급 일할계산기 — 중도 입사·퇴사 급여 계산 | 생활계산서', h1: '월급 일할계산기' },
  { key: 'whp', path: '/weekly-holiday-pay', title: '주휴수당 계산기 — 주 15시간·변동 근무 판독 | 생활계산서', h1: '주휴수당 계산기' },
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
  const { CATALOG } = await import(require('node:url').pathToFileURL(path.join(ROOT, 'scripts', 'calculators.js')).href);
  const LIVE = CATALOG.filter((c) => c.slug).map((c) => c.name);
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
      // 운영 주소 점검 시 일시적 네트워크 지연(30초 초과)으로 전체 점검이 끊기지 않도록 페이지 이동만 1회 재시도 (판정 기준 동일)
      const rawGoto = p.goto.bind(p);
      p.goto = async (u, o) => { for (let i = 0; ; i += 1) { try { return await rawGoto(u, { timeout: 60000, ...o }); } catch (e) { if (!/Timeout/.test(String(e)) || i >= 2) throw e; } } };
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
      const allCards = await p.locator('.calc-item').count();
      const soonLinks = await p.locator('.calc-item[data-status="soon"] a').count();
      const soonLabels = await p.locator('.calc-item[data-status="soon"] .status-soon').count();
      check('home', w, `계산기 30종: 이용 가능 ${LIVE.length}개만 링크, 준비 중 ${30 - LIVE.length}개는 링크 없음·‘준비 중’ 표시`, allCards === 30 && cardCount === LIVE.length && soonLinks === 0 && soonLabels === 30 - LIVE.length,
        `카드 ${allCards} · 링크 ${cardCount} · 준비 중 링크 ${soonLinks} · 준비 중 표시 ${soonLabels}`);
      const cols = await p.evaluate(() => getComputedStyle(document.getElementById('calc-grid')).gridTemplateColumns.split(' ').length);
      const expectCols = w >= 720 ? 2 : 1; // 확정 시안: PC 2열·모바일 1열
      const first = await p.evaluate(() => document.querySelector('.calc-item .card-title').textContent);
      check('home', w, `카드 ${expectCols}열·노동·급여 1번(연봉 실수령액) 맨 앞`, cols === expectCols && first === '연봉 실수령액 계산기', `${cols}열 · 첫 카드 ${first}`);
      // 카드 디자인(Impeccable 검토 반영): 흰 바탕 + 분야 색 아이콘·분야 이름·버튼, 번호·'이용 가능' 표시 없음, 미구현 '이용 가능' 금지
      const design = await p.evaluate((liveWant) => {
        const items = [...document.querySelectorAll('.calc-item')];
        const catWant = { labor: ['노동·급여', 'rgb(21, 84, 214)', 'rgb(227, 238, 255)'], tax: ['세금·보험', 'rgb(103, 40, 205)', 'rgb(240, 232, 255)'], realty: ['주거·부동산', 'rgb(0, 122, 75)', 'rgb(225, 249, 239)'] };
        const catOrder = [...Array(10).fill('labor'), ...Array(10).fill('tax'), ...Array(10).fill('realty')];
        const whiteCard = items.every((it) => getComputedStyle(it.querySelector('.calc-card')).backgroundColor === 'rgb(255, 255, 255)');
        const catOk = items.every((it, i) => { const k = catOrder[i]; const b = it.querySelector('.card-cat'); const ico = getComputedStyle(it.querySelector('.card-ico'));
          return it.dataset.category === k && b.textContent === catWant[k][0] && getComputedStyle(b).color === catWant[k][1] && ico.color === catWant[k][1] && ico.backgroundColor === catWant[k][2]; });
        const btnOk = items.every((it) => it.dataset.status !== 'live' || (it.querySelector('a.calc-card') && !it.querySelector('.card-btn') && it.querySelector('.card-go'))); // 카드 전체가 링크, 버튼 대신 꺾쇠
        const soonLive = items.filter((it) => it.dataset.status === 'soon' && it.textContent.includes('이용 가능')).length;
        const noise = document.querySelectorAll('.card-no, .status-live').length;
        const names = ['연봉 실수령액', '월급 실수령액', '퇴직금', '주휴수당', '시급', '실업급여', '연차수당', '야간·연장·휴일수당', '월급 일할', '육아휴직급여', '4대보험', '종합소득세', '부가세', '연말정산 환급금', '3.3% 프리랜서 세금', '소득세', '건강보험료', '국민연금', '증여세', '상속세', '대출이자', '취득세', '양도소득세', '중개수수료', '전월세 전환', 'DSR 대출한도', '재산세', '평수', '청약가점', '전세보증금 안전'].map((n) => (n === '월급 일할' ? '월급 일할계산기' : `${n} 계산기`));
        const liveOk = items.filter((it) => it.dataset.status === 'live').map((it) => it.querySelector('.card-title').textContent).join() === liveWant.join();
        const namesOk = items.every((it, i) => it.querySelector('.card-title').textContent === names[i]);
        const chipOk = ['labor', 'tax', 'realty'].every((k) => getComputedStyle(document.querySelector(`.chip[data-filter="${k}"]`)).color === catWant[k][1]);
        return { whiteCard, catOk, btnOk, liveOk, namesOk, chipOk, soonLive, noise, preview: !!document.querySelector('.hero-preview, .preview-card'), dupes: !!document.querySelector('.eyebrow, .hero-stat, .section-desc') };
      }, LIVE);
      check('home', w, '카드: 흰 바탕·분야 색 아이콘·분야 이름·카드 전체 링크(꺾쇠), 번호·이용 가능 표시 없음, 미구현 이용 가능 0',
        design.whiteCard && design.catOk && design.btnOk && design.liveOk && design.namesOk && design.chipOk && design.soonLive === 0 && design.noise === 0 && !design.preview && !design.dupes,
        JSON.stringify(design));
      // 검색·분야별 보기
      await p.fill('#calc-search', '주휴');
      const s1 = await p.$$eval('.calc-item:not([hidden]) .card-title', (e) => e.map((x) => x.textContent));
      await p.fill('#calc-search', '퇴사 월급');
      const m1 = await p.$$eval('.calc-item:not([hidden]) .card-title', (e) => e.map((x) => x.textContent));
      await p.fill('#calc-search', '알바 주휴');
      const m2 = await p.$$eval('.calc-item:not([hidden]) .card-title', (e) => e.map((x) => x.textContent));
      check('home', w, '여러 낱말 검색(‘퇴사 월급’·‘알바 주휴’ → 각 1개)', m1.length === 1 && m1[0].includes('월급') && m2.length === 1 && m2[0].includes('주휴'), `퇴사 월급 ${m1.length}개 · 알바 주휴 ${m2.length}개`);
      await p.fill('#calc-search', '없는계산기명');
      const s2 = { n: await p.locator('.calc-item:not([hidden])').count(), empty: await p.locator('#no-results').isVisible() };
      await p.fill('#calc-search', '');
      await p.click('.chip[data-filter="realty"]');
      const s3 = await p.$$eval('.calc-item:not([hidden]) .card-title', (e) => e.map((x) => x.textContent));
      const sel = await p.evaluate(() => { const c = document.querySelector('.chip[data-filter="realty"]'); const cs = getComputedStyle(c); return { pressed: c.getAttribute('aria-pressed'), bg: cs.backgroundColor, border: cs.borderTopColor, bw: cs.borderTopWidth }; });
      const url0 = p.url();
      await p.click('.chip[data-filter="labor"]');
      const nLabor = await p.locator('.calc-item:not([hidden])').count();
      await p.click('.chip[data-filter="tax"]');
      const nTax = await p.locator('.calc-item:not([hidden])').count();
      check('home', w, '분야 버튼: 선택 시 분야 색으로 채움, 분야별 10종씩, 새로고침 없음',
        sel.pressed === 'true' && sel.bg === 'rgb(0, 122, 75)' && sel.border === 'rgb(0, 122, 75)' && nLabor === 10 && nTax === 10 && p.url() === url0,
        `선택 ${JSON.stringify(sel)} · 노동 ${nLabor} · 세금 ${nTax}`);
      await p.click('.chip[data-filter="all"]');
      const s4 = await p.locator('.calc-item:not([hidden])').count();
      const more = await p.locator('.more-btn').count(); // 모바일(600px 미만) '전체': 분야별 4개 + 더 보기
      const wantAll = w < 600 ? 12 : 30;
      check('home', w, '검색(주휴→1개, 없는 말→안내)·분야별 보기(부동산→10개)·전체 복귀',
        s1.length === 1 && s1[0].includes('주휴수당') && s2.n === 0 && s2.empty && s3.length === 10 && s4 === wantAll && more === (w < 600 ? 3 : 0),
        `주휴 ${s1.length}개 · 없는 말 ${s2.n}개(안내 ${s2.empty}) · 부동산 ${s3.length}개 · 전체 ${s4}개 · 더 보기 ${more}개`);
      if (w < 600) {
        await p.click('.more-item.cat-labor .more-btn');
        const n2 = await p.locator('.calc-item[data-category="labor"]:not([hidden])').count();
        check('home', w, '모바일 더 보기: 노동·급여 6개 더 보기 → 10개 모두 표시, 다른 분야는 접힌 채 유지', n2 === 10 && (await p.locator('.more-btn').count()) === 2, `노동 ${n2}개`);
      }
      // 홈 접이식 ‘적용 기준 및 공식 출처’
      const homeFold = await p.evaluate(() => { const d = document.querySelector('details.basis-fold'); return d && !d.open && d.querySelector('summary').textContent.trim(); });
      check('home', w, '홈 ‘이용 가이드 · 적용 기준’ 기본 접힘', homeFold === '이용 가이드 · 적용 기준', String(homeFold));
      // 맨 위 검색 바로가기·동의어·다른 분야 안내
      await p.fill('#calc-search', '퇴사');
      const sug = await p.$$eval('#search-suggest .suggest-name', (e) => e.map((x) => x.textContent));
      const tag = { shown: await p.isVisible('#active-query'), text: await p.textContent('#query-text') };
      await p.mouse.click(5, 500); // 바깥 누르기
      const closedOut = await p.isHidden('#search-suggest');
      await p.click('#query-clear');
      const cleared = { q: await p.inputValue('#calc-search'), tag: await p.isHidden('#active-query') };
      check('home', w, '검색 바로가기 목록: 바깥을 누르면 닫힘, 검색어 표시 [퇴사 ×]로 지우기', tag.shown && tag.text === '퇴사' && closedOut && cleared.q === '' && cleared.tag, JSON.stringify({ tag, closedOut, cleared }));
      await p.fill('#calc-search', '전세');
      const sug2 = await p.$$eval('#search-suggest .suggest-name', (e) => e.map((x) => x.textContent));
      await p.click('.chip[data-filter="tax"]');
      await p.fill('#calc-search', '퇴직금');
      const other = { text: await p.textContent('#no-results-text'), btn: await p.isVisible('#no-results-all') };
      await p.click('#no-results-all');
      const after = await p.locator('.calc-item:not([hidden])').count();
      await p.fill('#calc-search', '');
      check('home', w, '맨 위 검색: 퇴사→퇴직금·실업급여, 전세→전월세 전환·전세보증금, 분야에 없으면 다른 분야 안내',
        sug.includes('퇴직금 계산기') && sug.includes('실업급여 계산기') && sug2.includes('전월세 전환 계산기') && sug2.includes('전세보증금 안전 계산기') && other.text.includes('다른 분야에서 1개') && other.btn && after === 1,
        `퇴사 ${sug.join('/')} · 전세 ${sug2.join('/')} · ${other.text} · 넓힌 뒤 ${after}개`);
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

      // 7. 전체 초기화 (두 계산기): 취소 시 유지, 확인 시 기본값 복원·결과 숨김·접이식 상태 유지·첫 입력 포커스, 빈 폼은 확인 창 없음
      {
        const dialogs = [];
        let answer = true;
        const onDialog = async (d) => { dialogs.push(d.message()); if (answer) await d.accept(); else await d.dismiss(); };
        p.on('dialog', onDialog);
        // 월급 일할계산기
        await salaryCase(p, { salary: '3100000', year: 2026, month: 1, type: 'both', start: '2026-01-05', end: '2026-01-20', add: [17] });
        await salaryCalc(p);
        await p.locator('details.basis-fold > summary').click();
        answer = false;
        await p.click('#reset-all');
        const kept = { salary: await p.inputValue('#salary'), result: await p.locator('#result').isVisible() };
        answer = true;
        await p.click('#reset-all');
        const now = new Date();
        const st = await p.evaluate(() => ({
          salary: document.getElementById('salary').value, year: document.getElementById('year').value, month: document.getElementById('month').value,
          type: document.querySelector('input[name=type]:checked').value, start: document.getElementById('start-date').value, end: document.getElementById('end-date').value,
          endHidden: document.getElementById('end-field').hidden, checked: document.querySelectorAll('#calendar-grid input:checked').length,
          result: !document.getElementById('result').hidden, errors: [...document.querySelectorAll('.error')].filter((e) => !e.hidden).length,
          fold: document.querySelector('details.basis-fold').open, focus: document.activeElement.id,
        }));
        const weekdaysNow = (() => { let n = 0; const y = now.getFullYear(); const m = now.getMonth(); const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); for (let d = 1; d <= last; d += 1) { const w = new Date(Date.UTC(y, m, d)).getUTCDay(); if (w >= 1 && w <= 5) n += 1; } return n; })();
        await salaryCase(p, { salary: '3100000', year: 2026, month: 1, type: 'join', start: '2026-01-16' });
        const after = await salaryCalc(p);
        const n1 = dialogs.length;
        await p.goto('/salary-proration');
        await p.click('#reset-all'); // 빈 폼
        const noDialog = dialogs.length === n1;
        check('salary', w, '전체 초기화: 취소 시 유지 · 확인 시 기본값 복원·결과 숨김·접이식 유지·첫 입력 포커스 · 재계산 정상 · 빈 폼은 확인 창 없음',
          kept.salary === '3100000' && kept.result && st.salary === '' && st.year === String(now.getFullYear()) && st.month === String(now.getMonth() + 1) &&
          st.type === 'join' && st.start === '' && st.end === '' && st.endHidden && st.checked === weekdaysNow && !st.result && st.errors === 0 && st.fold && st.focus === 'salary' &&
          after.cal[2] === '1,600,000원' && noDialog,
          `취소 후 ${JSON.stringify(kept)} · 확인 후 ${JSON.stringify(st)}(월~금 ${weekdaysNow}일) · 재계산 ${after.cal[2]} · 빈 폼 확인 창 ${noDialog ? '없음' : '있음'}`);

        // 주휴수당 계산기
        await whpCase(p, { end: '2026-07-31', days: [0, 1, 2, 3].flatMap((x) => MWF(x, '5')), noWork: [] });
        await p.fill('#check-start', '2026-07-06');
        await p.selectOption('#employment-type', 'monthly');
        await whpCalc(p);
        await p.locator('details.basis-fold > summary').click();
        answer = false;
        await p.click('#reset-all');
        const kept2 = { hire: await p.inputValue('#hire-date'), result: await p.locator('#result').isVisible() };
        answer = true;
        await p.click('#reset-all');
        const st2 = await p.evaluate(() => ({
          type: document.getElementById('employment-type').value, hire: document.getElementById('hire-date').value, end: document.getElementById('end-date').value,
          wage: document.getElementById('wage').value, checkStart: document.getElementById('check-start').value, weeks: document.getElementById('week-count').value,
          status: document.querySelector('input[name=status]:checked').value, endHidden: document.getElementById('end-field').hidden,
          normal: [...document.querySelectorAll('input[name=normalWeekday]:checked')].map((x) => x.value).join(','),
          weeksArea: !document.getElementById('weeks-area').hidden, result: !document.getElementById('result').hidden,
          scope: !document.getElementById('scope-note').hidden, fold: document.querySelector('details.basis-fold').open, focus: document.activeElement.id,
        }));
        // 같은 재직 시작일을 다시 넣었을 때 지난 근무표가 남아 있지 않아야 한다
        await p.fill('#hire-date', '2026-07-06');
        const leftover = await p.evaluate(() => [...document.querySelectorAll('#week-panels input[type=text]')].filter((i) => i.value !== '').length);
        await whpCase(p, { days: [0, 1, 2, 3].flatMap((x) => MWF(x, '5')) });
        const after2 = await whpCalc(p);
        const n2 = dialogs.length;
        await p.goto('/weekly-holiday-pay');
        await p.click('#reset-all');
        const noDialog2 = dialogs.length === n2;
        p.off('dialog', onDialog);
        check('whp', w, '전체 초기화: 취소 시 유지 · 확인 시 기본값 복원(시급제·재직 중·4주·월~금)·근무표 비움·결과 숨김·접이식 유지 · 재계산 정상 · 빈 폼은 확인 창 없음',
          kept2.hire === '2026-07-06' && kept2.result && st2.type === 'hourly' && st2.hire === '' && st2.end === '' && st2.wage === '' && st2.checkStart === '' && st2.weeks === '4' &&
          st2.status === 'employed' && st2.endHidden && st2.normal === '1,2,3,4,5' && !st2.weeksArea && !st2.result && !st2.scope && st2.fold && st2.focus === 'employment-type' &&
          leftover === 0 && after2.length === 4 && after2.every((x) => x.status === '지급 대상') && noDialog2,
          `취소 후 ${JSON.stringify(kept2)} · 확인 후 ${JSON.stringify(st2)} · 남은 근무표 ${leftover} · 재계산 ${after2.map((x) => x.status).join('/')} · 빈 폼 확인 창 ${noDialog2 ? '없음' : '있음'}`);
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
