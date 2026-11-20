/**
 * 브라우저 검수 (Playwright, Chromium).
 *   npm run test:e2e
 * 미리보기 서버를 임의 포트로 띄워 홈·계산기를 검사하고,
 * docs/screenshots/ 에 360px 화면 캡처를, docs/test-report.md 에 결과표를 남긴다.
 */
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');

const results = []; // 추가 검증
const caseRows = []; // 필수 5건
let failures = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function readResult(page) {
  const cell = (row, col) => page.locator(`#row-${row} [data-col="${col}"]`).innerText();
  const out = {};
  for (const row of ['calendar', 'workday']) {
    out[row] = {
      applied: await cell(row, 'applied'),
      total: await cell(row, 'total'),
      formula: await cell(row, 'formula'),
      amount: await cell(row, 'amount'),
    };
  }
  out.diff = await page.locator('#diff-value').innerText();
  return out;
}

async function fillCase(page, c) {
  await page.goto('/salary-proration');
  await page.selectOption('#year', String(c.year));
  await page.selectOption('#month', String(c.month));
  await page.check(`input[name="type"][value="${c.type}"]`);
  await page.fill('#salary', c.salary);
  if (c.start) await page.fill('#start-date', c.start);
  if (c.end) await page.fill('#end-date', c.end);
  if (c.clearAll) await page.click('#clear-workdays');
  for (const d of c.add ?? []) await page.check(`#workday-${d}`);
  for (const d of c.remove ?? []) await page.uncheck(`#workday-${d}`);
}

const CASES = [
  {
    id: 1,
    label: '2026-01-16 중도 입사, 3,100,000원',
    salary: '3100000', year: 2026, month: 1, type: 'join', start: '2026-01-16',
    expect: { cal: ['16일', '31일', '1,600,000원'], work: ['11일', '22일', '1,550,000원'], diff: '50,000원 · 달력일 기준이 더 큽니다' },
  },
  {
    id: 2,
    label: '2028-02-10 마지막 재직일(중도 퇴사), 2,900,000원',
    salary: '2900000', year: 2028, month: 2, type: 'leave', end: '2028-02-10',
    expect: { cal: ['10일', '29일', '1,000,000원'], work: ['8일', '21일', '1,104,762원'], diff: '104,762원 · 소정근로일 기준이 더 큽니다' },
  },
  {
    id: 3,
    label: '2026-01-17 하루 재직(같은 달 입·퇴사), 3,100,000원, 토요일 17일 일정 추가',
    salary: '3100000', year: 2026, month: 1, type: 'both', start: '2026-01-17', end: '2026-01-17', add: [17],
    expect: { cal: ['1일', '31일', '100,000원'], work: ['1일', '23일', '134,783원'], diff: '34,783원 · 소정근로일 기준이 더 큽니다' },
  },
  {
    id: 4,
    label: '2026-01-01~01-31 전체 재직(같은 달 입·퇴사), 3,210,000원',
    salary: '3210000', year: 2026, month: 1, type: 'both', start: '2026-01-01', end: '2026-01-31',
    expect: { cal: ['31일', '31일', '3,210,000원'], work: ['22일', '22일', '3,210,000원'], diff: '0원 · 두 방식의 예상액이 같습니다' },
  },
  {
    id: 5,
    label: '2026-01-17 하루 재직, 3,100,000원, 월 전체 일정 해제',
    salary: '3100000', year: 2026, month: 1, type: 'both', start: '2026-01-17', end: '2026-01-17', clearAll: true,
    expect: { cal: ['1일', '31일', '100,000원'], work: ['0일', '0일', '월 전체 소정근로일을 1일 이상 선택해 주세요'], diff: '비교 불가' },
  },
];

(async () => {
  const { createServer } = await import(path.join(ROOT, 'scripts', 'serve.js'));
  const server = createServer({ dir: 'site' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL, locale: 'ko-KR', timezoneId: 'Pacific/Kiritimati' });
  const page = await context.newPage();

  const externalRequests = [];
  const consoleErrors = [];
  page.on('request', (req) => {
    if (!req.url().startsWith(baseURL) && !req.url().startsWith('data:')) externalRequests.push(req.url());
  });
  page.on('console', (msg) => msg.type() === 'error' && consoleErrors.push(msg.text()));
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  try {
    /* ---------- 필수 5건 ---------- */
    for (const c of CASES) {
      await fillCase(page, c);
      await page.click('#submit');
      await page.waitForSelector('#result:not([hidden])');
      const r = await readResult(page);
      const actual = {
        cal: [r.calendar.applied, r.calendar.total, r.calendar.amount],
        work: [r.workday.applied, r.workday.total, r.workday.amount],
        diff: r.diff,
      };
      const ok = JSON.stringify(actual) === JSON.stringify(c.expect);
      caseRows.push({ ...c, actual, formulas: [r.calendar.formula, r.workday.formula], ok });
      if (!ok) failures += 1;
      console.log(`${ok ? 'PASS' : 'FAIL'}  사례 ${c.id}: ${JSON.stringify(actual)}`);
    }

    /* ---------- 추가: 사례 3에서 토요일 미추가 → 0원 ---------- */
    await fillCase(page, { ...CASES[2], add: [] });
    await page.click('#submit');
    let r = await readResult(page);
    check('사례 3에서 17일(토)을 일정에 추가하지 않으면 소정근로일 예상액 0원',
      r.workday.applied === '0일' && r.workday.total === '22일' && r.workday.amount === '0원',
      `${r.workday.applied}/${r.workday.total} → ${r.workday.amount}, 차액 ${r.diff}`);

    /* ---------- 추가: 라이브 영역 알림 ---------- */
    await page.waitForFunction(() => document.getElementById('result-status').textContent.length > 0);
    const status = await page.locator('#result-status').textContent();
    const statusAttrs = await page.locator('#result-status').evaluate((el) => `${el.getAttribute('role')}/${el.getAttribute('aria-live')}`);
    check('계산 결과 갱신 시 스크린리더 알림(role=status, aria-live=polite)', status.includes('달력일 기준 100,000원') && statusAttrs === 'status/polite', status);

    /* ---------- 추가: 입력 수정 시 이전 결과 숨김 (금액·날짜·일정·유형·정산월) ---------- */
    const editors = [
      ['금액 수정', async () => page.fill('#salary', '3100001')],
      ['날짜 수정', async () => page.fill('#start-date', '2026-01-16')],
      ['일정 체크 변경', async () => page.click('label[data-day="20"]')],
      ['정산 유형 변경', async () => page.check('input[name="type"][value="leave"]')],
      ['정산월 변경', async () => page.selectOption('#month', '2')],
      ['전체 해제 버튼', async () => page.click('#clear-workdays')],
    ];
    for (const [name, edit] of editors) {
      await fillCase(page, CASES[0]);
      await page.click('#submit');
      await page.waitForSelector('#result:not([hidden])');
      await edit();
      const hidden = await page.locator('#result').isHidden();
      const statusCleared = (await page.locator('#result-status').textContent()) === '';
      check(`입력 수정 시 이전 결과 숨김 — ${name}`, hidden && statusCleared);
    }

    /* ---------- 추가: 마지막 재직일 < 입사일 ---------- */
    await fillCase(page, { salary: '3000000', year: 2026, month: 1, type: 'both', start: '2026-01-20', end: '2026-01-19' });
    await page.click('#submit');
    const endErr = page.locator('#end-date-error');
    const endErrText = (await endErr.isVisible()) ? await endErr.innerText() : '';
    const invalid = await page.getAttribute('#end-date', 'aria-invalid');
    const describedBy = await page.getAttribute('#end-date', 'aria-describedby');
    const focused = await page.evaluate(() => document.activeElement.id);
    check('입사일보다 빠른 마지막 재직일 → 해당 입력 옆 오류, 결과 미표시',
      endErrText.includes('같거나 그 이후') && invalid === 'true' && describedBy.includes('end-date-error') &&
      (await page.locator('#result').isHidden()) && focused === 'end-date', endErrText);

    /* ---------- 추가: 금액 입력 오류 ---------- */
    for (const [raw, expectText] of [['', '입력해 주세요'], ['0', '0보다 큰'], ['3100000.5', '소수'], ['-5000', '0보다 큰'], ['abc', '숫자만']]) {
      await fillCase(page, { ...CASES[0], salary: raw });
      await page.click('#submit');
      const t = (await page.locator('#salary-error').isVisible()) ? await page.locator('#salary-error').innerText() : '';
      check(`금액 오류 처리: "${raw}"`, t.includes(expectText) && (await page.locator('#result').isHidden()), t);
    }

    /* ---------- 추가: 날짜 누락 / 정산월 밖 날짜 ---------- */
    await fillCase(page, { salary: '3000000', year: 2026, month: 1, type: 'join' });
    await page.click('#submit');
    check('입사일 누락 오류', (await page.locator('#start-date-error').innerText()).includes('입사일을 입력'));
    await fillCase(page, { salary: '3000000', year: 2026, month: 1, type: 'join' });
    await page.evaluate(() => { const el = document.getElementById('start-date'); el.removeAttribute('min'); el.removeAttribute('max'); el.value = '2026-02-03'; });
    await page.click('#submit');
    check('정산월 밖 날짜 오류', (await page.locator('#start-date-error').innerText()).includes('2026년 1월'));

    /* ---------- 추가: 정산월 변경 시 날짜 비우고 일정 월~금 초기화 ---------- */
    await fillCase(page, { ...CASES[2] }); // 1월, 17일 추가된 상태
    await page.selectOption('#year', '2028');
    await page.selectOption('#month', '2');
    const afterChange = await page.evaluate(() => ({
      start: document.getElementById('start-date').value,
      end: document.getElementById('end-date').value,
      checked: [...document.querySelectorAll('#calendar-grid input:checked')].map((e) => Number(e.value)),
      total: document.querySelectorAll('#calendar-grid input').length,
      min: document.getElementById('start-date').min,
      max: document.getElementById('start-date').max,
    }));
    const feb2028Weekdays = [1, 2, 3, 4, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 28, 29];
    check('정산월 변경 시 날짜 비움 + 새 달 월~금 초기화 + 윤년 29일',
      afterChange.start === '' && afterChange.end === '' && afterChange.total === 29 &&
      JSON.stringify(afterChange.checked) === JSON.stringify(feb2028Weekdays) &&
      afterChange.min === '2028-02-01' && afterChange.max === '2028-02-29',
      `선택 ${afterChange.checked.length}일, 범위 ${afterChange.min}~${afterChange.max}`);

    /* ---------- 추가: 유형별 날짜 입력 표시 ---------- */
    await page.goto('/salary-proration');
    const vis = async () => [await page.locator('#start-field').isVisible(), await page.locator('#end-field').isVisible()];
    const join = await vis();
    await page.check('input[name="type"][value="leave"]');
    const leave = await vis();
    await page.check('input[name="type"][value="both"]');
    const both = await vis();
    check('정산 유형별 날짜 입력 표시 (입사: 입사일 / 퇴사: 마지막 재직일 / 같은 달: 둘 다)',
      JSON.stringify([join, leave, both]) === JSON.stringify([[true, false], [false, true], [true, true]]));

    /* ---------- 추가: 레이블 연결 ---------- */
    const unlabeled = await page.evaluate(() =>
      [...document.querySelectorAll('#proration-form input, #proration-form select')]
        .filter((el) => !(el.labels && el.labels.length) && !el.getAttribute('aria-label'))
        .map((el) => el.id || el.name));
    check('모든 입력에 레이블 연결', unlabeled.length === 0, unlabeled.join(', '));

    /* ---------- 추가: 키보드만으로 조작 ---------- */
    await page.goto('/salary-proration');
    const order = [];
    for (let i = 0; i < 60; i += 1) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(() => document.activeElement.id || document.activeElement.className || document.activeElement.tagName);
      order.push(id);
      if (id === 'submit') break;
    }
    const need = ['home-link', 'salary', 'year', 'month', 'start-date', 'reset-weekdays', 'clear-workdays', 'workday-1', 'submit'];
    check('Tab 순서로 모든 컨트롤 도달', need.every((id) => order.includes(id)), order.filter((x) => !x.startsWith('workday-') || x === 'workday-1').join(' → '));

    await page.goto('/salary-proration');
    await page.focus('#home-link');
    const tabTo = async (id) => {
      for (let i = 0; i < 60; i += 1) {
        if ((await page.evaluate(() => document.activeElement.id)) === id) return true;
        await page.keyboard.press('Tab');
      }
      return false;
    };
    await tabTo('salary');
    await page.keyboard.type('3100000');
    await page.keyboard.press('Tab'); // 연도
    await page.keyboard.type('2026');
    await page.keyboard.press('Tab'); // 월
    await page.keyboard.press('Home'); // 1월
    await page.keyboard.press('Tab'); // 정산 유형(중도 입사)
    await page.keyboard.press('ArrowRight'); // 중도 퇴사
    await page.keyboard.press('ArrowRight'); // 같은 달 입·퇴사
    await page.keyboard.press('Tab'); // 입사일 (연·월·일 세그먼트)
    // 날짜 입력칸의 세그먼트 순서는 브라우저 언어에 따라 다르다(한국어: 연.월.일 / 헤드리스 기본: 월/일/연).
    const probe = await context.newPage();
    await probe.setContent('<input id=d type=date>');
    await probe.focus('#d');
    await probe.keyboard.type('01');
    await probe.keyboard.type('17');
    await probe.keyboard.type('2026');
    const usOrder = (await probe.$eval('#d', (e) => e.value)) === '2026-01-17';
    await probe.close();
    const typeDate = async (y, mo, d) => {
      if (usOrder) {
        await page.keyboard.type(mo + d + y);
      } else {
        await page.keyboard.type(y);
        await page.keyboard.press('Tab'); // 연 → 월 세그먼트
        await page.keyboard.type(mo + d);
      }
    };
    await typeDate('2026', '01', '17');
    await tabTo('end-date');
    await typeDate('2026', '01', '17');
    await tabTo('workday-17');
    await page.keyboard.press('Space'); // 토요일 17일 추가
    await tabTo('submit');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#result:not([hidden])', { timeout: 3000 }).catch(() => {});
    const kbVals = await page.evaluate(() => ({
      start: document.getElementById('start-date').value,
      end: document.getElementById('end-date').value,
      type: document.querySelector('input[name=type]:checked').value,
      year: document.getElementById('year').value,
      month: document.getElementById('month').value,
    }));
    const kb = (await page.locator('#result').isVisible()) ? await readResult(page) : null;
    check(`키보드만으로 입력→일정 토글(Space)→계산(Enter) = 사례 3 결과 (날짜 세그먼트 ${usOrder ? '월/일/연' : '연.월.일'})`,
      kb && kb.workday.amount === '134,783원' && kb.calendar.amount === '100,000원',
      kb ? `${JSON.stringify(kbVals)} → ${kb.calendar.amount} / ${kb.workday.amount}` : JSON.stringify(kbVals));

    /* ---------- 추가: 홈 ↔ 계산기 링크, 직접 접속·새로고침 ---------- */
    let resp = await page.goto('/');
    check('홈 / 직접 접속', resp.status() === 200 && (await page.title()) === '급여 계산기 모음 | 정산노트');
    resp = await page.reload();
    check('홈 / 새로고침', resp.status() === 200 && (await page.locator('h1').innerText()) === '급여 계산기 모음');
    const cards = await page.locator('.card').count();
    await page.click('a.card[href="/salary-proration"]');
    await page.waitForURL(`${baseURL}/salary-proration`);
    check('홈 카드 1개 → 계산기 이동', cards === 1 && (await page.locator('h1').innerText()) === '월급 일할계산기');
    resp = await page.goto('/salary-proration');
    check('계산기 /salary-proration 직접 접속', resp.status() === 200 && (await page.title()) === '월급 일할계산기 — 중도 입사·퇴사 급여 계산 | 정산노트');
    resp = await page.reload();
    check('계산기 새로고침', resp.status() === 200 && (await page.locator('h1').innerText()) === '월급 일할계산기' && (await page.locator('#calendar-grid input').count()) > 27);
    resp = await page.goto('/salary-proration/');
    check('/salary-proration/ → /salary-proration 으로 통일', page.url() === `${baseURL}/salary-proration` && resp.status() === 200);
    await page.click('#home-link');
    await page.waitForURL(`${baseURL}/`);
    check('계산기 → 홈 링크', (await page.title()) === '급여 계산기 모음 | 정산노트');

    /* ---------- 추가: 메타·검색 차단 ---------- */
    const metas = {};
    for (const p of ['/', '/salary-proration']) {
      const res = await page.goto(p);
      metas[p] = await page.evaluate(() => ({
        title: document.title,
        desc: document.querySelector('meta[name=description]')?.content,
        robots: document.querySelector('meta[name=robots]')?.content,
        h1: document.querySelector('h1').innerText,
      }));
      metas[p].header = res.headers()['x-robots-tag'];
    }
    check('페이지별 고유 제목·설명·화면 제목', metas['/'].title !== metas['/salary-proration'].title && metas['/'].desc !== metas['/salary-proration'].desc && metas['/'].h1 !== metas['/salary-proration'].h1);
    check('개발 환경 검색 차단 (meta robots + X-Robots-Tag + robots.txt)',
      Object.values(metas).every((m) => m.robots === 'noindex, nofollow' && m.header === 'noindex, nofollow') &&
      (await (await page.request.get('/robots.txt')).text()).includes('Disallow: /'));
    const calcDesc = metas['/salary-proration'].desc;
    check('보조 검색어(급여 일할계산·중도 입사 급여 계산·중도 퇴사 급여 계산) 사용',
      ['급여 일할계산', '중도 입사 급여 계산', '중도 퇴사 급여 계산'].every((k) => calcDesc.includes(k)));

    /* ---------- 추가: 안내 문구·출처 ---------- */
    await page.goto('/salary-proration');
    const bodyText = await page.locator('main').innerText();
    check('결과 아래 안내·면책 문구', bodyText.includes('이 계산기는 입력한 월정급을 두 가지 방식으로 배분합니다.') && bodyText.includes('본 계산 결과는 단순 모의 계산이며, 법적 효력을 갖는 증빙자료가 아닙니다.'));
    const hrefs = await page.$$eval('.sources a', (as) => as.map((a) => a.href));
    check('공식 출처 2건 + 확인일 2026년 11월 21일',
      hrefs.includes('https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1027161983') &&
      hrefs.includes('https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029728419') &&
      bodyText.includes('공식 자료 확인일: 2026년 11월 21일'));
    check('“법정 의무 산식” 표현 미사용', !/법정\s*(의무)?\s*산식/.test(bodyText));
    check('FAQ 3건', (await page.locator('.faq h3').count()) === 3);

    /* ---------- 추가: 모바일 360px ---------- */
    const mobile = await browser.newContext({ baseURL, locale: 'ko-KR', viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const m = await mobile.newPage();
    m.on('request', (req) => { if (!req.url().startsWith(baseURL)) externalRequests.push(req.url()); });
    const overflow = async () => m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await m.goto('/');
    check('360px 홈 가로 스크롤 없음', (await overflow()) <= 0);
    await m.screenshot({ path: path.join(SHOTS, 'home-360.png'), fullPage: true });
    await m.goto('/salary-proration');
    check('360px 계산기 입력 화면 가로 스크롤 없음', (await overflow()) <= 0);
    await m.screenshot({ path: path.join(SHOTS, 'calculator-360-form.png'), fullPage: true });
    await fillCase(m, CASES[0]);
    await m.click('#submit');
    await m.waitForSelector('#result:not([hidden])');
    check('360px 결과표 가로 스크롤 없음', (await overflow()) <= 0);
    const tapTargets = await m.$$eval('#calendar-grid label.day', (ls) => ls.every((l) => l.getBoundingClientRect().height >= 44 && l.getBoundingClientRect().width >= 38));
    check('360px 달력 날짜 터치 영역 ≥ 38×44px', tapTargets);
    await m.locator('#result').screenshot({ path: path.join(SHOTS, 'calculator-360-result.png') });
    await m.screenshot({ path: path.join(SHOTS, 'calculator-360-full.png'), fullPage: true });
    await fillCase(m, CASES[4]);
    await m.click('#submit');
    await m.waitForSelector('#result:not([hidden])');
    await m.locator('#result').screenshot({ path: path.join(SHOTS, 'calculator-360-case5.png') });
    await fillCase(m, { salary: '3000000', year: 2026, month: 1, type: 'both', start: '2026-01-20', end: '2026-01-19' });
    await m.click('#submit');
    await m.locator('#end-field').screenshot({ path: path.join(SHOTS, 'calculator-360-error.png') });
    await mobile.close();

    const desk = await browser.newContext({ baseURL, locale: 'ko-KR', viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    const dp = await desk.newPage();
    await fillCase(dp, CASES[0]);
    await dp.click('#submit');
    await dp.waitForSelector('#result:not([hidden])');
    await dp.screenshot({ path: path.join(SHOTS, 'calculator-desktop.png'), fullPage: true });
    await desk.close();

    /* ---------- 추가: 외부 전송 없음 ---------- */
    check('외부(타 출처) 요청 0건 — 급여·날짜 미전송, 분석 도구 없음', externalRequests.length === 0, externalRequests.join(', '));
    check('브라우저 콘솔 오류 0건', consoleErrors.length === 0, consoleErrors.join(' | '));
  } catch (err) {
    failures += 1;
    console.error(err);
  } finally {
    await browser.close();
    server.close();
  }

  writeReport();
  console.log(`\n${failures === 0 ? '모든 검증 통과' : `실패 ${failures}건`}`);
  process.exit(failures === 0 ? 0 : 1);
})();

function writeReport() {
  const lines = [];
  lines.push('# 정산노트 1차 검수 결과', '');
  lines.push(`실행: ${new Date().toISOString()} · Chromium(Playwright) · 시간대 Pacific/Kiritimati(UTC+14)로 날짜 밀림 여부도 함께 확인`, '');
  lines.push('## 필수 검증 사례 5건', '');
  lines.push('| # | 입력값 | 기대값 | 실제값 | 결과 |', '|---|---|---|---|---|');
  const fmt = (v) => `달력일 ${v.cal[0]}/${v.cal[1]} → ${v.cal[2]}<br>소정근로일 ${v.work[0]}/${v.work[1]} → ${v.work[2]}<br>차액 ${v.diff}`;
  for (const c of caseRows) {
    lines.push(`| ${c.id} | ${c.label} | ${fmt(c.expect)} | ${fmt(c.actual)} | ${c.ok ? '✅ 통과' : '❌ 실패'} |`);
  }
  lines.push('', '## 추가 검증', '', '| 항목 | 결과 | 비고 |', '|---|---|---|');
  for (const r of results) lines.push(`| ${r.name} | ${r.ok ? '✅ 통과' : '❌ 실패'} | ${String(r.detail).replace(/\|/g, '\\|')} |`);
  lines.push('');
  fs.writeFileSync(path.join(ROOT, 'docs', 'test-report.md'), lines.join('\n'));
}
