/**
 * 브라우저 검수 (Playwright, Chromium).
 *   npm run test:e2e
 * 미리보기 서버를 임의 포트로 띄워 홈·계산기를 실제로 조작해 검사하고,
 * docs/screenshots/ 에 모바일(360px)·데스크톱 화면 캡처를,
 * docs/test-report.md 에 결과표(검수 항목·재현 방법·기대값·실제값·상태)를 남긴다.
 *
 * 운영용 빌드 검수: SITE_URL=https://도메인 npm run verify:production
 *   (dist/ 를 운영 빌드로 만들고, 검색 차단 대신 canonical·sitemap·robots 를 검사,
 *    결과는 docs/test-report-production.md)
 */
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = process.env.E2E_DIR || 'site';
const PRODUCTION = process.env.E2E_PRODUCTION === '1';
const CONFIG_SITE = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8')).siteUrl;
const SITE_URL = (process.env.SITE_URL || (PRODUCTION && CONFIG_SITE)) ? new URL(process.env.SITE_URL || CONFIG_SITE).origin : ''; // 한글 도메인 → Punycode
if (PRODUCTION && !SITE_URL) {
  console.error('운영 검수에는 SITE_URL 이 필요합니다.');
  process.exit(1);
}
const SHOTS = path.join(ROOT, 'docs', process.env.E2E_PRODUCTION === '1' ? 'screenshots-production' : 'screenshots');

const sections = []; // { title, rows: [{ item, method, expected, actual, status }] }
let failures = 0;

function section(title) {
  sections.push({ title, rows: [] });
}

/** 결과 한 줄 기록. ok=true → 통과, false → 실패 */
function T(item, method, expected, actual, ok) {
  const status = ok ? '통과' : '실패';
  if (!ok) failures += 1;
  sections[sections.length - 1].rows.push({ item, method, expected, actual: String(actual), status });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${item}  — ${actual}`);
}

/** 이 실행 환경에서 확인할 수 없는 항목 */
function U(item, method, expected, reason) {
  sections[sections.length - 1].rows.push({ item, method, expected, actual: reason, status: '미확인' });
  console.log(`N/A   ${item}  — ${reason}`);
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

const fmtResult = (r) =>
  `달력일 ${r.calendar.applied}/${r.calendar.total} → ${r.calendar.amount} · 소정근로일 ${r.workday.applied}/${r.workday.total} → ${r.workday.amount} · 차액 ${r.diff}`;

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

async function calc(page) {
  await page.click('#submit');
  await page.waitForSelector('#result:not([hidden])', { timeout: 3000 });
  return readResult(page);
}

async function visibleErrors(page) {
  return page.$$eval('.error:not([hidden])', (es) => es.map((e) => `${e.id}: ${e.textContent}`));
}

const CASES = [
  {
    id: 1, title: '중도 입사',
    method: '2026년 1월 · 중도 입사 · 입사일 2026-01-16 · 3,100,000원 · 월~금 기본 일정',
    salary: '3100000', year: 2026, month: 1, type: 'join', start: '2026-01-16',
    expect: '달력일 16일/31일 → 1,600,000원 · 소정근로일 11일/22일 → 1,550,000원 · 차액 50,000원 · 달력일 기준이 더 큽니다',
  },
  {
    id: 2, title: '윤년 2월 중도 퇴사',
    method: '2028년 2월 · 중도 퇴사 · 마지막 재직일 2028-02-10 · 2,900,000원 · 월~금 기본 일정',
    salary: '2900000', year: 2028, month: 2, type: 'leave', end: '2028-02-10',
    expect: '달력일 10일/29일 → 1,000,000원 · 소정근로일 8일/21일 → 1,104,762원 · 차액 104,762원 · 소정근로일 기준이 더 큽니다',
  },
  {
    id: 3, title: '토요일 하루 재직, 그날을 근로일로 선택',
    method: '2026년 1월 · 같은 달 입·퇴사 · 2026-01-17~2026-01-17 · 3,100,000원 · 기본 일정 + 17일(토) 선택',
    salary: '3100000', year: 2026, month: 1, type: 'both', start: '2026-01-17', end: '2026-01-17', add: [17],
    expect: '달력일 1일/31일 → 100,000원 · 소정근로일 1일/23일 → 134,783원 · 차액 34,783원 · 소정근로일 기준이 더 큽니다',
  },
  {
    id: 4, title: '월 전체 재직',
    method: '2026년 1월 · 같은 달 입·퇴사 · 2026-01-01~2026-01-31 · 3,210,000원 · 월~금 기본 일정',
    salary: '3210000', year: 2026, month: 1, type: 'both', start: '2026-01-01', end: '2026-01-31',
    expect: '달력일 31일/31일 → 3,210,000원 · 소정근로일 22일/22일 → 3,210,000원 · 차액 0원 · 두 방식의 예상액이 같습니다',
  },
  {
    id: 5, title: '월 전체 소정근로일 선택 해제',
    method: '사례 3 조건에서 17일을 추가하지 않고 [전체 해제] 클릭',
    salary: '3100000', year: 2026, month: 1, type: 'both', start: '2026-01-17', end: '2026-01-17', clearAll: true,
    expect: '달력일 1일/31일 → 100,000원 · 소정근로일 0일/0일 → 월 전체 소정근로일을 1일 이상 선택해 주세요 · 차액 비교 불가',
  },
];

(async () => {
  const { CATALOG } = await import(require('node:url').pathToFileURL(path.join(__dirname, '..', '..', 'scripts', 'calculators.js')).href);
  const { PAGES } = await import(require('node:url').pathToFileURL(path.join(__dirname, '..', '..', 'scripts', 'pages.js')).href);
  const LIVE_COUNT = CATALOG.filter((c) => c.slug).length;
  const { createServer } = await import(path.join(ROOT, 'scripts', 'serve.js'));
  // E2E_BASE_URL 을 주면 로컬 서버 대신 배포된 주소를 검수한다 (배포 후 검증).
  let server = null;
  let baseURL = (process.env.E2E_BASE_URL || '').replace(/\/$/, '');
  if (!baseURL) {
    server = createServer({ dir: DIR, robotsHeader: !PRODUCTION });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    baseURL = `http://127.0.0.1:${server.address().port}`;
  }
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch();
  // 날짜가 시간대 변환으로 밀리지 않는지 함께 보려고 UTC+14 시간대에서 실행한다.
  const context = await browser.newContext({ baseURL, locale: 'ko-KR', timezoneId: 'Pacific/Kiritimati' });
  const page = await context.newPage();

  const sameOrigin = (url) => url.startsWith(baseURL) || url.startsWith('data:') || url.startsWith('about:');
  const externalRequests = [];
  const consoleErrors = [];
  const watch = (pg) => {
    pg.on('request', (req) => { if (!sameOrigin(req.url())) externalRequests.push(req.url()); });
    pg.on('console', (msg) => msg.type() === 'error' && consoleErrors.push(msg.text()));
    pg.on('pageerror', (err) => consoleErrors.push(String(err)));
  };
  watch(page);

  try {
    /* ================= 필수 사례 5건 ================= */
    section('월급 일할계산기 — 필수 검증 사례 5건 (회귀, 브라우저 직접 입력)');
    for (const c of CASES) {
      await fillCase(page, c);
      const r = await calc(page);
      const actual = fmtResult(r);
      T(`사례 ${c.id}: ${c.title}`, c.method, c.expect, actual, actual === c.expect);
    }

    /* ================= 경계 조건 ================= */
    section('계산 경계 조건과 입력 오류');

    await fillCase(page, { ...CASES[2], add: [] });
    let r = await calc(page);
    T('토요일 하루 재직, 그날을 근로일로 미선택', '사례 3 조건에서 17일(토)을 선택하지 않음',
      '소정근로일 0일/22일 → 0원', `소정근로일 ${r.workday.applied}/${r.workday.total} → ${r.workday.amount} (차액 ${r.diff})`,
      r.workday.applied === '0일' && r.workday.total === '22일' && r.workday.amount === '0원');

    const errorCases = [
      ['빈 금액', { ...CASES[0], salary: '' }, 'salary-error', '세전 월급을 입력해 주세요.'],
      ['0원', { ...CASES[0], salary: '0' }, 'salary-error', '0보다 큰 금액을 입력해 주세요.'],
      ['소수 금액', { ...CASES[0], salary: '3100000.5' }, 'salary-error', '소수 금액은 입력할 수 없습니다'],
      ['음수 금액', { ...CASES[0], salary: '-5000' }, 'salary-error', '0보다 큰 금액을 입력해 주세요.'],
      ['입사일 누락', { ...CASES[0], start: '' }, 'start-date-error', '입사일을 입력해 주세요.'],
      ['입사일보다 빠른 마지막 재직일', { salary: '3000000', year: 2026, month: 1, type: 'both', start: '2026-01-20', end: '2026-01-19' }, 'end-date-error', '마지막 재직일은 입사일과 같거나 그 이후여야 합니다.'],
    ];
    for (const [name, c, errId, msg] of errorCases) {
      await fillCase(page, c);
      await page.click('#submit');
      const errs = await visibleErrors(page);
      const inputId = errId.replace('-error', '');
      const invalid = await page.getAttribute(`#${inputId}`, 'aria-invalid');
      const described = (await page.getAttribute(`#${inputId}`, 'aria-describedby')).includes(errId);
      const focused = await page.evaluate(() => document.activeElement.id);
      const ok = errs.some((e) => e.startsWith(errId) && e.includes(msg)) && invalid === 'true' && described && focused === inputId && (await page.locator('#result').isHidden());
      T(`입력 오류: ${name}`, `${c.year}년 ${c.month}월, 금액 "${c.salary}", 날짜 ${c.start || '-'} / ${c.end || '-'} 입력 후 [계산하기]`,
        `해당 입력 아래 "${msg}" 표시, 해당 입력으로 포커스, 결과 미표시`, `${errs.join(' / ')} · 포커스=${focused}`, ok);
    }

    // 정산월 밖 날짜: 달력 선택기는 min/max로 막히므로 값 자체를 넣어 검증
    await fillCase(page, { salary: '3000000', year: 2026, month: 1, type: 'join' });
    await page.evaluate(() => { const el = document.getElementById('start-date'); el.removeAttribute('min'); el.removeAttribute('max'); el.value = '2026-02-03'; });
    await page.click('#submit');
    let errs = await visibleErrors(page);
    T('입력 오류: 정산월 밖의 날짜', '2026년 1월 · 중도 입사 · 입사일 칸에 2026-02-03 입력(선택기 범위 제한 우회) 후 [계산하기]',
      '입사일 아래 "정산 대상 월(2026년 1월) 안의 날짜를 입력해 주세요." 표시', errs.join(' / '),
      errs.some((e) => e.startsWith('start-date-error') && e.includes('2026년 1월')));
    const bounds = await page.evaluate(() => { const el = document.getElementById('start-date'); return `${el.min}~${el.max}`; });
    await page.reload();
    await page.selectOption('#year', '2026');
    await page.selectOption('#month', '1');
    const bounds2 = await page.evaluate(() => { const el = document.getElementById('start-date'); return `${el.min}~${el.max}`; });
    T('날짜 선택기 범위가 정산월로 제한됨', '정산월 2026년 1월 선택', '입사일·마지막 재직일 선택 범위 2026-01-01~2026-01-31', bounds2, bounds2 === '2026-01-01~2026-01-31' && bounds !== null);

    // 정산월 변경
    await fillCase(page, { ...CASES[2] });
    await page.selectOption('#year', '2028');
    await page.selectOption('#month', '2');
    const afterChange = await page.evaluate(() => ({
      start: document.getElementById('start-date').value,
      end: document.getElementById('end-date').value,
      checked: [...document.querySelectorAll('#calendar-grid input:checked')].map((e) => Number(e.value)),
      total: document.querySelectorAll('#calendar-grid input').length,
    }));
    const feb2028 = [1, 2, 3, 4, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 28, 29];
    T('정산월 변경 시 날짜 비움·일정 초기화', '사례 3 입력(1월, 17일 토요일 추가) 상태에서 정산월을 2028년 2월로 변경',
      '입사일·마지막 재직일 빈칸, 달력 29일, 월~금 21일 선택',
      `입사일 "${afterChange.start}", 마지막 재직일 "${afterChange.end}", 달력 ${afterChange.total}일, 선택 ${afterChange.checked.length}일`,
      afterChange.start === '' && afterChange.end === '' && afterChange.total === 29 && JSON.stringify(afterChange.checked) === JSON.stringify(feb2028));

    // 수정 시 결과 숨김 → 재계산 시 새 값
    const editors = [
      ['금액 수정', 'salary 3,100,000 → 6,200,000', async () => page.fill('#salary', '6200000'), '3,200,000원', '3,100,000원'],
      ['날짜 수정', '입사일 1/16 → 1/19', async () => page.fill('#start-date', '2026-01-19'), '1,300,000원', '1,409,091원'],
      ['근무일 해제', '1월 20일(화) 선택 해제', async () => page.click('label[data-day="20"]'), '1,600,000원', '1,476,190원'],
      ['근무일 추가', '1월 17일(토) 선택', async () => page.click('label[data-day="17"]'), '1,600,000원', '1,617,391원'],
      ['정산 유형 변경', '중도 입사 → 중도 퇴사, 마지막 재직일 1/16', async () => { await page.check('input[name="type"][value="leave"]'); await page.fill('#end-date', '2026-01-16'); }, '1,600,000원', '1,690,909원'],
      ['[월~금으로 초기화] 클릭', '17일(토) 추가 후 결과를 본 뒤 초기화 버튼', async () => page.click('#reset-weekdays'), '1,600,000원', '1,550,000원', [17]],
    ];
    for (const [name, how, edit, newCal, newWork, add] of editors) {
      await fillCase(page, { ...CASES[0], add });
      await calc(page);
      await edit();
      const hidden = await page.locator('#result').isHidden();
      const statusCleared = (await page.locator('#result-status').textContent()) === '';
      const r2 = await calc(page);
      const ok = hidden && statusCleared && r2.calendar.amount === newCal && r2.workday.amount === newWork;
      T(`계산 후 ${name} → 결과 숨김, 재계산 시 새 값`, `사례 1 계산 → ${how} → [계산하기]`,
        `수정 즉시 결과 숨김 · 재계산 달력일 ${newCal} / 소정근로일 ${newWork}`,
        `숨김=${hidden ? '예' : '아니오'} · 재계산 달력일 ${r2.calendar.amount} / 소정근로일 ${r2.workday.amount}`, ok);
    }

    // 계산 직후 50ms 안에 수정해도 숨긴 결과의 알림이 뒤늦게 표시되지 않아야 한다
    await fillCase(page, CASES[0]);
    await page.evaluate(() => {
      document.getElementById('submit').click();
      const s = document.getElementById('salary');
      s.value = '3100001';
      s.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(200);
    const stale = await page.locator('#result-status').textContent();
    T('계산 직후 즉시 수정 시 지난 결과 알림 취소', '[계산하기] 직후(알림 예약 50ms 이내) 금액 수정 → 200ms 대기',
      '결과 숨김, 스크린리더 알림 영역 비어 있음', `결과 숨김=${await page.locator('#result').isHidden()} · 알림 "${stale}"`,
      (await page.locator('#result').isHidden()) && stale === '');

    // 차액 표시
    T('차액 옆 큰 쪽 표시 / 같으면 같다고 표시', '사례 1·2·4 결과의 차액 문구',
      '“달력일 기준이 더 큽니다” / “소정근로일 기준이 더 큽니다” / “두 방식의 예상액이 같습니다”',
      '사례 1·2·4 행 참조', sections[0].rows[0].status === '통과' && sections[0].rows[1].status === '통과' && sections[0].rows[3].status === '통과');

    /* ================= 뒤로가기 (2차 검수에서 발견한 오류) ================= */
    section('뒤로가기·새로고침 후 상태 (2차 검수에서 발견한 오류의 재검증)');
    await page.goto('/salary-proration');
    await page.selectOption('#year', '2026');
    await page.selectOption('#month', '3');
    await page.fill('#salary', '3100000');
    await page.fill('#start-date', '2026-03-16');
    const before = await calc(page);
    await page.click('#home-link');
    await page.waitForURL(`${baseURL}/`);
    await page.goBack();
    await page.waitForLoadState('load');
    await page.waitForTimeout(200);
    const backState = await page.evaluate(() => {
      const y = Number(document.getElementById('year').value);
      const m = Number(document.getElementById('month').value);
      const days = document.querySelectorAll('#calendar-grid input').length;
      return { y, m, days, period: document.getElementById('calendar-grid').dataset.period, min: document.getElementById('start-date').min };
    });
    const expectedDays = new Date(Date.UTC(backState.y, backState.m, 0)).getUTCDate();
    const consistent = backState.period === `${backState.y}-${backState.m}` && backState.days === expectedDays &&
      backState.min === `${backState.y}-${String(backState.m).padStart(2, '0')}-01`;
    T('뒤로가기 후 정산월·달력·날짜 범위 일치', '2026년 3월·입사일 3/16 계산 → 홈 링크 → 브라우저 뒤로가기',
      '선택된 정산월과 달력 일수·날짜 선택 범위가 같은 달을 가리킴',
      `정산월 ${backState.y}년 ${backState.m}월 · 달력 ${backState.days}일 · 날짜 범위 시작 ${backState.min}`, consistent);
    await page.selectOption('#year', '2026');
    await page.selectOption('#month', '3');
    await page.fill('#salary', '3100000');
    await page.fill('#start-date', '2026-03-16');
    const afterBack = await calc(page);
    T('뒤로가기 후 다시 계산한 결과가 처음과 같음', '위 상태에서 2026년 3월·3/16·3,100,000원 재입력 후 [계산하기]',
      '소정근로일 12일/22일 → 1,690,909원 (뒤로가기 전과 동일)',
      `처음 ${before.workday.applied}/${before.workday.total} → ${before.workday.amount} · 뒤로가기 후 ${afterBack.workday.applied}/${afterBack.workday.total} → ${afterBack.workday.amount}`,
      before.workday.amount === '1,690,909원' && afterBack.workday.amount === '1,690,909원' && afterBack.workday.total === '22일');

    // 방어 로직: 정산월만 바뀌고 달력이 그대로인 상태를 만들어 pageshow 재동기화 확인
    await page.goto('/salary-proration');
    await page.evaluate(() => {
      document.getElementById('year').value = '2026';
      document.getElementById('month').value = '3'; // change 이벤트 없이 값만 변경 (브라우저 폼 복원과 같은 상황)
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    const resync = await page.evaluate(() => ({ days: document.querySelectorAll('#calendar-grid input').length, period: document.getElementById('calendar-grid').dataset.period }));
    T('정산월과 달력이 어긋나면 화면 표시 시 자동 재동기화', '이벤트 없이 정산월 값만 2026년 3월로 바꾼 뒤 pageshow 발생',
      '달력이 2026년 3월(31일)로 다시 그려짐', `달력 ${resync.days}일 (${resync.period})`, resync.days === 31 && resync.period === '2026-3');

    await fillCase(page, CASES[0]);
    await calc(page);
    await page.reload();
    const reloadState = await page.evaluate(() => ({
      salary: document.getElementById('salary').value,
      start: document.getElementById('start-date').value,
      result: !document.getElementById('result').hidden,
      period: document.getElementById('calendar-grid').dataset.period,
      sel: `${document.getElementById('year').value}-${document.getElementById('month').value}`,
    }));
    T('계산 후 새로고침', '사례 1 계산 → 새로고침', '입력·결과가 초기화되고 정산월과 달력이 일치',
      `금액 "${reloadState.salary}", 입사일 "${reloadState.start}", 결과 표시=${reloadState.result}, 정산월 ${reloadState.sel} / 달력 ${reloadState.period}`,
      reloadState.salary === '' && reloadState.start === '' && !reloadState.result && reloadState.period === reloadState.sel);

    /* ================= 접속과 링크 ================= */
    section('주소 직접 접속·새로고침과 링크');
    for (const [url, title, h1] of [
      ['/', '급여·세금·부동산 계산기 30종 | 생활계산서', '생활에 필요한 계산을 한곳에서'],
      ['/salary-proration', '월급 일할계산기 — 중도 입사·퇴사 급여 계산 | 생활계산서', '월급 일할계산기'],
    ]) {
      const fresh = await context.newPage();
      watch(fresh);
      const res1 = await fresh.goto(url);
      const t1 = await fresh.title();
      const h1a = await fresh.locator('h1').innerText();
      const res2 = await fresh.reload();
      const t2 = await fresh.title();
      const h1b = await fresh.locator('h1').innerText();
      T(`${url} 직접 접속 후 새로고침`, `새 탭에서 ${url} 주소 입력 → 새로고침`, `HTTP 200, 제목 “${title}”, 화면 제목 “${h1}”`,
        `${res1.status()}/${res2.status()} · “${t2}” · “${h1b}”`,
        res1.status() === 200 && res2.status() === 200 && t1 === title && t2 === title && h1a === h1 && h1b === h1);
      await fresh.close();
    }
    let resp = await page.goto('/salary-proration/');
    const slashCanon = await page.evaluate(() => document.querySelector('link[rel=canonical]')?.href ?? null);
    const slashOk = resp.status() === 200 && (await page.locator('h1').innerText()) === '월급 일할계산기' &&
      (page.url() === `${baseURL}/salary-proration` || (slashCanon === null ? !PRODUCTION : slashCanon.endsWith('/salary-proration')));
    T('끝 슬래시 주소', '/salary-proration/ 접속', '계산기가 열리고, 슬래시 없는 주소로 이동하거나 canonical 이 슬래시 없는 주소를 가리킴',
      `${page.url().replace(baseURL, '')} (${resp.status()}) · canonical ${slashCanon ?? '없음(미리보기)'}`, slashOk);
    // 일부러 404를 내는 검사라 콘솔 기록 대상이 아닌 별도 탭에서 실행
    const p404 = await context.newPage();
    resp = await p404.goto('/salary-proration-x');
    T('없는 주소', '/salary-proration-x 접속', '404 안내 페이지와 홈 링크', `${resp.status()} · ${await p404.locator('h1').innerText()}`,
      resp.status() === 404 && (await p404.locator('a[href="/"]').count()) > 0);
    await p404.close();

    await page.goto('/');
    const cards = await page.locator('a.card').count();
    await page.click('a.card[href="/salary-proration"]');
    await page.waitForURL(`${baseURL}/salary-proration`);
    T('홈 → 계산기 이동', '홈에서 “월급 일할계산기” 카드 클릭', `이용 가능 카드 ${LIVE_COUNT}개(30종 중), /salary-proration 으로 이동`,
      `카드 ${cards}개 → ${page.url().replace(baseURL, '')} “${await page.title()}”`, cards === LIVE_COUNT && (await page.locator('h1').innerText()) === '월급 일할계산기');
    await page.click('#home-link');
    await page.waitForURL(`${baseURL}/`);
    T('계산기 → 홈 이동', '계산기 상단 “← 홈” 버튼 클릭', '/ 로 이동', `${page.url().replace(baseURL, '') || '/'} “${await page.title()}”`,
      (await page.title()) === '급여·세금·부동산 계산기 30종 | 생활계산서');
    await page.goto('/salary-proration');
    await page.click('.site-header .brand');
    await page.waitForURL(`${baseURL}/`);
    T('계산기 → 홈 이동(브랜드)', '상단 “생활계산서” 로고 클릭', '/ 로 이동', page.url().replace(baseURL, '') || '/', true);

    /* ================= 안내·출처 ================= */
    section('안내 문구·FAQ·공식 출처');
    await fillCase(page, CASES[0]);
    await calc(page);
    const order = await page.evaluate(() => {
      const res = document.getElementById('result').getBoundingClientRect().bottom;
      const notice = [...document.querySelectorAll('.notice p')].map((p) => ({ top: p.getBoundingClientRect().top, text: p.textContent }));
      return { below: notice.every((n) => n.top > res), texts: notice.map((n) => n.text) };
    });
    const NOTICE1 = '이 계산기는 입력한 월정급을 두 가지 방식으로 배분합니다. 실제 정산 방식과 대상 항목은 근로계약서, 취업규칙 및 급여명세서에서 확인하세요. 세금·보험료 공제, 별도 수당, 유급휴일·주휴수당의 개별 반영은 이 비교에 포함되지 않습니다.';
    const NOTICE2 = '본 계산 결과는 단순 모의 계산이며, 법적 효력을 갖는 증빙자료가 아닙니다.';
    T('결과 아래 안내·면책 문구', '사례 1 계산 후 결과표 아래 확인', '지정 문구 2개가 결과표 아래에 원문 그대로 표시',
      `결과표 아래=${order.below ? '예' : '아니오'} · 문구 일치=${order.texts[0] === NOTICE1 && order.texts[1] === NOTICE2 ? '예' : '아니오'}`,
      order.below && order.texts[0] === NOTICE1 && order.texts[1] === NOTICE2);
    const faq = await page.$$eval('.faq h3', (hs) => hs.map((h) => h.textContent));
    T('FAQ 3건', '계산기 하단 “자주 묻는 질문”', '퇴사일 / 토요일·공휴일 / 실제 지급액 질문 3건', faq.join(' / '), faq.length === 3);
    await page.locator('#basis-fold > summary').click(); // 접이식 ‘적용 기준 및 공식 출처’ 펼침
    const body = await page.locator('main').innerText();
    T('공식 자료 확인일 · “법정 의무 산식” 미사용', '“적용 기준과 공식 출처” 확인', '“공식 자료 확인일: 2026년 11월 21일” 표시, “법정” 표현 없음',
      `확인일 ${body.includes('공식 자료 확인일: 2026년 11월 21일') ? '표시' : '없음'} · 법정 표현 ${/법정/.test(body) ? '있음' : '없음'}`,
      body.includes('공식 자료 확인일: 2026년 11월 21일') && !/법정/.test(body));

    for (const [i, label, seq] of [[0, '근로기준법 제43조 (임금 지급)', '1027161983'], [1, '근로기준법 제48조 (임금대장 및 임금명세서)', '1029728419']]) {
      const expectedUrl = `https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=${seq}`;
      const link = page.locator('.sources a').nth(i);
      const attrs = await link.evaluate((a) => `${a.target} ${a.rel}`);
      const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
      let title = '';
      try {
        await popup.waitForLoadState('domcontentloaded', { timeout: 20000 });
        title = await popup.title();
      } catch {
        title = '';
      }
      const opened = popup.url() === expectedUrl;
      if (opened && title) {
        T(`공식 출처 링크: ${label}`, '링크 클릭', `새 창에서 ${expectedUrl} 열림`, `새 창(${attrs}) “${title}”`, opened && attrs.startsWith('_blank'));
      } else if (opened) {
        U(`공식 출처 링크: ${label}`, '링크 클릭', `새 창에서 ${expectedUrl} 열림`, `새 창 주소는 일치하나 외부 사이트 응답을 받지 못함(네트워크 제한)`);
      } else {
        T(`공식 출처 링크: ${label}`, '링크 클릭', expectedUrl, popup.url(), false);
      }
      await popup.close();
    }
    U('조문 내용과 안내 문구의 대응', '조문 본문 열람', '제43조·제48조 본문이 안내 문구의 근거로 적절함', '법령 해석 판단이 필요해 자동 검수 대상이 아님 — 담당자 확인 필요');

    /* ================= 키보드·접근성 ================= */
    section('키보드 조작과 접근성');
    await page.goto('/salary-proration');
    const tabOrder = [];
    for (let i = 0; i < 70; i += 1) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(() => document.activeElement.id || (document.activeElement.name ? `[${document.activeElement.name}]` : document.activeElement.className));
      if (tabOrder[tabOrder.length - 1] !== id) tabOrder.push(id);
      if (id === 'submit') break;
    }
    const need = ['home-link', 'salary', 'year', 'month', '[type]', 'start-date', 'reset-weekdays', 'clear-workdays', 'workday-1', 'workday-30', 'submit'];
    T('Tab 키로 모든 컨트롤 도달', '페이지 처음부터 Tab 반복', need.join(' → '),
      tabOrder.filter((x) => !/^workday-/.test(x) || x === 'workday-1' || x === 'workday-30').join(' → '), need.every((id) => tabOrder.includes(id)));

    const focusTargets = [['salary', '금액 입력'], ['year', '연도 선택'], ['[type]', '정산 유형'], ['start-date', '입사일'], ['reset-weekdays', '초기화 버튼'], ['workday-5', '근무일(5일)'], ['submit', '계산하기']];
    const outlines = [];
    for (const [id, label] of focusTargets) {
      const sel = id.startsWith('[') ? 'input[name="type"]:checked' : `#${id}`;
      await page.focus(sel);
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      const o = await page.evaluate((s) => {
        const el = document.querySelector(s);
        const shown = el.type === 'checkbox' ? el.nextElementSibling : el;
        const st = getComputedStyle(shown);
        return { active: document.activeElement === el, style: st.outlineStyle, width: parseFloat(st.outlineWidth) };
      }, sel);
      outlines.push({ label, ...o });
    }
    T('현재 선택된 요소 표시(포커스 테두리)', '각 컨트롤에 Tab으로 이동', '포커스된 요소에 3px 테두리 표시',
      outlines.map((o) => `${o.label} ${o.style} ${o.width}px`).join(', '), outlines.every((o) => o.active && o.style === 'solid' && o.width >= 2));
    await page.focus('#workday-5');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await page.locator('#calendar').screenshot({ path: path.join(SHOTS, 'focus-day.png') });

    // 날짜 입력칸의 세그먼트 순서는 브라우저 언어에 따라 다르다(한국어: 연.월.일 / 헤드리스 기본: 월/일/연).
    const probe = await context.newPage();
    await probe.setContent('<input id=d type=date>');
    await probe.focus('#d');
    await probe.keyboard.type('01172026');
    const usOrder = (await probe.$eval('#d', (e) => e.value)) === '2026-01-17';
    await probe.close();
    const typeDate = async (y, mo, d) => {
      if (usOrder) {
        await page.keyboard.type(mo + d + y);
      } else {
        await page.keyboard.type(y);
        await page.keyboard.press('Tab');
        await page.keyboard.type(mo + d);
      }
    };
    const tabTo = async (id) => {
      for (let i = 0; i < 70; i += 1) {
        if ((await page.evaluate(() => document.activeElement.id)) === id) return true;
        await page.keyboard.press('Tab');
      }
      return false;
    };
    await page.goto('/salary-proration');
    await page.focus('#home-link');
    await tabTo('salary');
    await page.keyboard.type('3100000');
    await tabTo('year'); // 세전 월급 다음 Tab 은 '자동 계산' 버튼, 그다음이 연도
    await page.keyboard.type('2026');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Tab');
    await typeDate('2026', '01', '17');
    await tabTo('end-date');
    await typeDate('2026', '01', '17');
    await tabTo('workday-17');
    await page.keyboard.press('Space');
    await tabTo('submit');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#result:not([hidden])', { timeout: 3000 }).catch(() => {});
    const kb = (await page.locator('#result').isVisible()) ? await readResult(page) : null;
    T('키보드만으로 입력·근무일 선택·계산', 'Tab 이동 → 금액 입력 → 연도 2026·월 1월(Home) → 유형 화살표 → 날짜 입력 → 17일에서 Space → [계산하기]에서 Enter',
      '사례 3과 같은 결과 (100,000원 / 134,783원)', kb ? fmtResult(kb) : '결과 없음',
      kb && kb.calendar.amount === '100,000원' && kb.workday.amount === '134,783원');

    await page.waitForFunction(() => document.getElementById('result-status').textContent.length > 0);
    const live = await page.locator('#result-status').evaluate((el) => ({ role: el.getAttribute('role'), live: el.getAttribute('aria-live'), text: el.textContent }));
    T('결과 갱신 시 스크린리더 알림', '계산 후 알림 영역 확인', 'role=status, aria-live=polite 영역에 결과 요약',
      `${live.role}/${live.live}: ${live.text}`, live.role === 'status' && live.live === 'polite' && live.text.includes('134,783원'));

    const unlabeled = await page.evaluate(() =>
      [...document.querySelectorAll('#proration-form input, #proration-form select')]
        .filter((el) => !(el.labels && el.labels.length) && !el.getAttribute('aria-label')).map((el) => el.id || el.name));
    T('모든 입력에 레이블 연결', '폼의 input·select 전수 확인', '레이블 없는 입력 0개', `${unlabeled.length}개 ${unlabeled.join(', ')}`, unlabeled.length === 0);
    U('실제 스크린리더 낭독', 'VoiceOver·TalkBack·NVDA로 결과 낭독 확인', '결과 요약이 한 번 낭독됨', '이 환경에 스크린리더가 없어 ARIA 속성까지만 확인');

    /* ================= 화면: 360px·데스크톱 ================= */
    section('화면 배치 (모바일 360px·데스크톱 1280px)');
    const layoutCheck = async (pg) => pg.evaluate(() => {
      const overflow = document.documentElement.scrollWidth - window.innerWidth;
      const clipped = [];
      const sel = '#salary, #year, #month, #start-date, #end-date, .choice, .schedule-tools button, #calendar-grid label.day, #submit, #result table, #diff-value, .card';
      for (const el of document.querySelectorAll(sel)) {
        if (el.closest('[hidden]')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.left < -0.5 || r.right > window.innerWidth + 0.5 || el.scrollWidth > el.clientWidth + 1) clipped.push(el.id || el.className);
      }
      // 같은 줄 요소 겹침: 날짜 칸끼리, 유형 선택지끼리
      const overlaps = [];
      for (const group of ['#calendar-grid label.day', '.choice', '.schedule-tools button']) {
        const rs = [...document.querySelectorAll(group)].map((e) => e.getBoundingClientRect());
        for (let i = 0; i < rs.length; i += 1) for (let j = i + 1; j < rs.length; j += 1) {
          const a = rs[i]; const b = rs[j];
          if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps.push(group);
        }
      }
      return { overflow, clipped, overlaps: [...new Set(overlaps)] };
    });
    for (const [label, opts] of [
      ['모바일 360px', { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
      ['데스크톱 1280px', { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }],
    ]) {
      const ctx = await browser.newContext({ baseURL, locale: 'ko-KR', ...opts });
      const p = await ctx.newPage();
      watch(p);
      const tag = label.startsWith('모바일') ? '360' : 'desktop';
      await p.goto('/');
      let lc = await layoutCheck(p);
      await p.screenshot({ path: path.join(SHOTS, `home-${tag}.png`), fullPage: true });
      T(`${label} 홈`, `${label} 화면으로 / 열기`, '가로 스크롤·잘림·겹침 없음', `가로 넘침 ${lc.overflow}px · 잘림 ${lc.clipped.length} · 겹침 ${lc.overlaps.length}`,
        lc.overflow <= 0 && lc.clipped.length === 0 && lc.overlaps.length === 0);

      await p.goto('/salary-proration');
      await p.check('input[name="type"][value="both"]');
      lc = await layoutCheck(p);
      const picker = await p.evaluate(() => ['start-date', 'end-date'].map((id) => {
        const r = document.getElementById(id).getBoundingClientRect();
        return r.width >= 140 && r.right <= window.innerWidth;
      }).every(Boolean));
      const tap = await p.$$eval('#calendar-grid label.day', (ls) => Math.min(...ls.map((l) => l.getBoundingClientRect().height)));
      await p.screenshot({ path: path.join(SHOTS, `calculator-${tag}-form.png`), fullPage: true });
      T(`${label} 계산기 입력 화면`, `${label} 화면, 같은 달 입·퇴사 선택(날짜칸 2개 표시)`,
        '가로 스크롤·잘림·겹침 없음, 날짜 입력칸(선택 버튼 포함)이 화면 안, 날짜 칸 높이 ≥ 44px',
        `가로 넘침 ${lc.overflow}px · 잘림 ${lc.clipped.length} · 겹침 ${lc.overlaps.length} · 날짜칸 화면 안=${picker} · 날짜 칸 최소 높이 ${tap}px`,
        lc.overflow <= 0 && lc.clipped.length === 0 && lc.overlaps.length === 0 && picker && tap >= 44);

      await fillCase(p, CASES[1]);
      await calc(p);
      lc = await layoutCheck(p);
      await p.screenshot({ path: path.join(SHOTS, `calculator-${tag}-result.png`), fullPage: true });
      await p.locator('#result').screenshot({ path: path.join(SHOTS, `result-${tag}.png`) });
      T(`${label} 결과표`, `${label} 화면에서 사례 2 계산`, '비교표·차액이 잘리거나 겹치지 않음',
        `가로 넘침 ${lc.overflow}px · 잘림 ${lc.clipped.length} ${lc.clipped.join(',')} · 겹침 ${lc.overlaps.length}`, lc.overflow <= 0 && lc.clipped.length === 0);

      if (tag === '360') {
        await fillCase(p, CASES[4]);
        await calc(p);
        lc = await layoutCheck(p);
        await p.locator('#result').screenshot({ path: path.join(SHOTS, 'result-360-case5.png') });
        T('모바일 360px 결과표(안내 문구 줄바꿈)', '360px에서 사례 5 계산', '긴 안내 문구가 칸 안에서 줄바꿈되고 넘치지 않음',
          `가로 넘침 ${lc.overflow}px · 잘림 ${lc.clipped.length}`, lc.overflow <= 0 && lc.clipped.length === 0);
        await fillCase(p, { salary: '3000000', year: 2026, month: 1, type: 'both', start: '2026-01-20', end: '2026-01-19' });
        await p.click('#submit');
        await p.locator('#end-field').screenshot({ path: path.join(SHOTS, 'error-360.png') });
      }
      await ctx.close();
    }
    U('iOS Safari·Android 실기기', '실제 휴대폰에서 날짜 선택기·숫자 키패드 확인', '네이티브 날짜 선택기와 숫자 키패드 정상 표시',
      '이 환경에는 Chromium만 있어 Safari(WebKit)·Firefox·실기기 확인 불가 — 360px 화면은 Chromium 모바일 에뮬레이션으로 확인');

    /* ================= 주휴수당 계산기 ================= */
    const WHP_HIRE = Date.UTC(2026, 6, 6) / 86400000;
    const isoAt = (i) => new Date(i * 86400000).toISOString().slice(0, 10);
    const MWF = (w, h, m = '0') => [0, 2, 4].map((k) => [isoAt(WHP_HIRE + 7 * w + k), h, m]);
    const TT = (w, h, m = '0') => [1, 3].map((k) => [isoAt(WHP_HIRE + 7 * w + k), h, m]);
    const MW = (w, h, m = '0') => [0, 2].map((k) => [isoAt(WHP_HIRE + 7 * w + k), h, m]);
    async function fillWhp(pg, c) {
      await pg.goto('/weekly-holiday-pay');
      if (c.type) await pg.selectOption('#employment-type', c.type);
      await pg.fill('#hire-date', c.hire ?? '2026-07-06');
      if (c.end) {
        await pg.check('input[name="status"][value="left"]');
        await pg.fill('#end-date', c.end);
      }
      if (c.weekCount) await pg.selectOption('#week-count', String(c.weekCount));
      await pg.fill('#wage', c.wage ?? '10320');
      for (const [iso, h, m, att = 'present'] of c.days) {
        const n = Math.floor((Date.parse(iso) / 86400000 - WHP_HIRE) / 7) + 1;
        await pg.click(`#tab-${n}`);
        await pg.fill(`#h-${iso}`, h);
        await pg.fill(`#m-${iso}`, m);
        const a = c.att && iso in c.att ? c.att[iso] : att;
        if (a) await pg.check(`input[name="att-${iso}"][value="${a}"]`);
      }
      for (const n of c.noWork ?? []) {
        await pg.click(`#tab-${n}`);
        await pg.click(`#nowork-${n}`);
      }
    }
    async function judgeWhp(pg) {
      await pg.click('#submit');
      await pg.waitForSelector('#result:not([hidden])', { timeout: 3000 });
      return pg.$$eval('#whp-rows tr', (trs) => trs.map((tr) => {
        const t = (c) => tr.querySelector(`[data-col="${c}"]`).innerText.replace(/\s+/g, ' ').trim();
        return { week: tr.querySelector('th').innerText, range: t('range'), window: t('window'), applied: t('applied'), status: t('status'), reason: t('reason'), amount: t('amount') };
      }));
    }
    const rowText = (r) => `${r.week} ${r.status} · ${r.window} · ${r.applied} · ${r.reason.split(' 근거:')[0]} · ${r.amount}`;
    function checkRows(rows, exp) {
      return rows.length === exp.length && rows.every((r, i) => {
        const e = exp[i];
        return r.status === e.status && (!e.window || r.window.startsWith(e.window)) && (!e.applied || r.applied.startsWith(e.applied)) &&
          (!e.reason || e.reason.test(r.reason)) && (!e.amount || r.amount.startsWith(e.amount)) && r.reason.includes('근거:');
      });
    }

    section('주휴수당 계산기 — 검증 사례 (명세 7장, 브라우저 직접 입력)');
    const W4 = '7/6(월)~8/2(일) · 1~4주차';
    const whpCases = [
      {
        name: '사례 1: 주 평균 14시간 59분',
        method: '재직 시작 2026-07-06(월), 재직 중, 시급 10,320원 · 1주 월·수 8:00 / 2주 화·목 7:00 / 3주 월·수·금 5:00 / 4주 화·목 7:28 · 모두 출근',
        days: [...MW(0, '8'), ...TT(1, '7'), ...MWF(2, '5'), ...TT(3, '7', '28')],
        expect: [0, 1, 2, 3].map(() => ({ status: '지급 대상 아님', window: W4, applied: '평균 14시간 59분', reason: /14시간 59분으로 15시간 미만/ })),
        expectText: '1~4주차 모두 지급 대상 아님 · 평균 기간 7/6~8/2(1~4주차) · 적용 시간 평균 14시간 59분 · 이유 “15시간 미만”',
      },
      {
        name: '사례 2: 주 평균 정확히 15시간',
        method: '매주 월·수·금 5:00 (4주) · 모두 출근 · 시급 10,320원',
        days: [0, 1, 2, 3].flatMap((w) => MWF(w, '5')),
        expect: [0, 1, 2, 3].map(() => ({ status: '지급 대상', window: W4, applied: '평균 15시간 0분', reason: /15시간 이상/, amount: '30,960원' })),
        expectText: '1~4주차 지급 대상 · 평균 15시간 0분 · 주당 30,960원(1일 3시간 0분 × 10,320원)',
      },
      {
        name: '사례 3: 주별 시간은 다르지만 평균 15시간',
        method: '1주 화·목 6:00 / 2주 월·수·금 6:00 / 3주 화·목 5:15 / 4주 월·수·금 6:30 · 모두 출근',
        days: [...TT(0, '6'), ...MWF(1, '6'), ...TT(2, '5', '15'), ...MWF(3, '6', '30')],
        expect: [['12시간 0분'], ['18시간 0분'], ['10시간 30분'], ['19시간 30분']].map(([t]) => ({ status: '지급 대상', window: W4, applied: `평균 15시간 0분 (이 주 ${t})`, amount: '30,960원' })),
        expectText: '1~4주차 지급 대상 · 평균 15시간 0분(이 주 12:00·18:00·10:30·19:30) · 주당 30,960원',
      },
      {
        name: '사례 4: 시간 충족·소정근로일 결근',
        method: '매주 월·수·금 6:00 · 2주차 7/15(수) ‘결근’, 나머지 출근',
        days: [0, 1, 2, 3].flatMap((w) => MWF(w, '6')),
        att: { '2026-07-15': 'absent' },
        expect: [
          { status: '지급 대상', window: W4, applied: '평균 18시간 0분', amount: '37,152원' },
          { status: '지급 대상 아님', window: W4, applied: '평균 18시간 0분', reason: /7월 15일\(수\)에 결근해 개근 요건을 충족하지 않습니다/ },
          { status: '지급 대상', amount: '37,152원' },
          { status: '지급 대상', amount: '37,152원' },
        ],
        expectText: '2주차만 지급 대상 아님(7/15 결근) · 1·3·4주차 지급 대상 37,152원 · 평균 18시간 0분',
      },
      {
        name: '사례 5A: 실제 근로기간 4주 미만 (7/22 퇴사)',
        method: '퇴사함, 마지막 재직일 2026-07-22(수) · 1·2주 월·수·금 6:00, 3주 7/20(월)·7/22(수) 6:00 · 모두 출근',
        end: '2026-07-22',
        days: [...MWF(0, '6'), ...MWF(1, '6'), ...MW(2, '6')],
        expect: [
          { status: '지급 대상', window: '7/6(월)~7/22(수) · 재직 17일 전체', applied: '평균 19시간 45분', amount: '재직 기간이 4주 미만일 때' },
          { status: '지급 대상', window: '7/6(월)~7/22(수) · 재직 17일 전체', applied: '평균 19시간 45분', amount: '재직 기간이 4주 미만일 때' },
          { status: '지급 대상 아님', reason: /7월 22일\(수\)까지 재직해 이 주의 7일째\(7월 26일\(일\)\)/ },
        ],
        expectText: '1·2주차 지급 대상(평균 기간 재직 17일 전체, 평균 19시간 45분, 예상액은 별도 확인 필요로 보류) · 3주차 지급 대상 아님(7일째 전 퇴사)',
      },
      {
        name: '사례 5B: 입력 자료 일부 누락 (3주차 근무표 비어 있음)',
        method: '재직 중 · 1·2·4주 월·수·금 6:00 입력, 3주차는 아무것도 입력하지 않음',
        days: [...MWF(0, '6'), ...MWF(1, '6'), ...MWF(3, '6')],
        expect: [0, 1, 2, 3].map(() => ({ status: '정보 부족', reason: /3주차 7\/20\(월\)~7\/26\(일\) 근무표가 비어 있습니다/ })),
        expectText: '1~4주차 모두 정보 부족 · 이유 “3주차 7/20~7/26 근무표가 비어 있습니다” · 추가 입력 목록에 3주차 표시',
        extra: async (pg) => (await pg.locator('#needs-list').innerText()).includes('3주차 7/20(월)~7/26(일) 근무표'),
      },
      {
        name: '사례 5B-1: 3주차를 ‘이 주는 근무 없음’으로 확정',
        method: '사례 5B 입력 + 3주차 [이 주는 근무 없음]',
        days: [...MWF(0, '6'), ...MWF(1, '6'), ...MWF(3, '6')],
        noWork: [3],
        expect: [0, 1, 2, 3].map(() => ({ status: '지급 대상 아님', window: W4, applied: '평균 13시간 30분', reason: /13시간 30분으로 15시간 미만/ })),
        expectText: '1~4주차 지급 대상 아님 · 평균 13시간 30분 (빈칸과 0시간을 구별)',
      },
    ];
    for (const c of whpCases) {
      await fillWhp(page, c);
      const rows = await judgeWhp(page);
      const ok = checkRows(rows, c.expect) && (!c.extra || (await c.extra(page)));
      T(c.name, c.method, c.expectText, rows.map(rowText).join(' / '), ok);
    }

    section('주휴수당 계산기 — 입력·화면 동작');
    // 결과 숨김과 재판정
    await fillWhp(page, whpCases[3]);
    await judgeWhp(page);
    await page.click('#tab-2');
    await page.check('input[name="att-2026-07-15"][value="excused"]');
    const hiddenAfter = await page.locator('#result').isHidden();
    const rows4 = await judgeWhp(page);
    T('입력 변경 시 결과 숨김 → 재판정', '사례 4 판정 → 7/15 출근 여부를 ‘휴가·휴업’으로 변경 → [판정하기]', '변경 즉시 결과 숨김, 재판정 시 2주차 지급 대상(휴가는 결근 아님)',
      `숨김=${hiddenAfter} · 2주차 ${rows4[1].status} · ${rows4[1].reason.split(' 근거:')[0]}`, hiddenAfter && rows4[1].status === '지급 대상' && /휴가·휴업 1일은 결근으로 보지 않습니다/.test(rows4[1].reason));

    // 시간 입력 오류
    await fillWhp(page, { days: [['2026-07-06', '25', '0']] });
    await page.click('#submit');
    const tErr = (await page.locator('#err-2026-07-06').isVisible()) ? await page.locator('#err-2026-07-06').innerText() : '';
    T('잘못된 시간 입력 → 해당 칸 옆 오류', '7/6 근무시간 25시간 입력 후 [판정하기]', '7/6 아래 “시간은 0~24 사이로 입력하세요.”, 포커스 이동, 결과 미표시',
      `${tErr} · aria-invalid=${await page.getAttribute('#h-2026-07-06', 'aria-invalid')} · 포커스=${await page.evaluate(() => document.activeElement.id)}`,
      tErr.includes('0~24') && (await page.evaluate(() => document.activeElement.id)) === 'h-2026-07-06' && (await page.locator('#result').isHidden()));
    await fillWhp(page, { days: [['2026-07-06', '3', '75']] });
    await page.click('#submit');
    T('잘못된 분 입력', '7/6 3시간 75분 입력', '“분은 0~59 사이로 입력하세요.”', await page.locator('#err-2026-07-06').innerText(), (await page.locator('#err-2026-07-06').innerText()).includes('0~59'));

    await page.goto('/weekly-holiday-pay');
    await page.click('#submit');
    T('재직 시작일 누락', '아무것도 입력하지 않고 [판정하기]', '재직 시작일 아래 “재직 시작일을 입력하세요.”', await page.locator('#hire-date-error').innerText(), (await page.locator('#hire-date-error').innerText()).includes('재직 시작일을 입력'));
    await page.fill('#hire-date', '2026-07-10');
    await page.check('input[name="status"][value="left"]');
    await page.fill('#end-date', '2026-07-09');
    await page.fill('#wage', '10.5');
    await page.click('#submit');
    const e1 = await page.locator('#end-date-error').innerText();
    const e2 = await page.locator('#wage-error').innerText();
    T('마지막 재직일이 재직 시작일보다 빠름 · 소수 시급', '재직 시작 7/10, 마지막 재직일 7/9, 시급 10.5 → [판정하기]', '각 입력 아래 오류 표시', `${e1} / ${e2}`, e1.includes('같거나 그 이후') && e2.includes('정수'));

    // 0시간과 빈칸
    await fillWhp(page, { days: [...MWF(0, '6'), ...MWF(1, '6'), ['2026-07-20', '0', '0'], ...MWF(3, '6')] });
    const z = await judgeWhp(page);
    const tab3 = await page.locator('#tab-3').innerText();
    T('명시한 0시간과 빈칸 구별', '사례 5B에서 3주차 7/20에 0시간 0분만 입력', '3주차는 ‘입력됨’(근무 없음)으로 보고 평균 13시간 30분으로 판정(정보 부족 아님)',
      `${z[0].status} · ${z[0].applied} · 3주차 탭 “${tab3.replace(/\s+/g, ' ')}”`, z[0].status === '지급 대상 아님' && z[0].applied.startsWith('평균 13시간 30분'));

    // 주 시작 요일·날짜 범위 표시
    await page.goto('/weekly-holiday-pay');
    await page.fill('#hire-date', '2026-07-08');
    const rule = await page.locator('#week-rule').innerText();
    const t1 = await page.locator('#panel-title-1').innerText();
    T('주의 시작 요일과 주별 날짜 범위 표시', '재직 시작일 2026-07-08(수) 입력', '“1주 = 수요일~화요일”, 1주차 7/8(수)~7/14(화)', `${rule.split('.')[0]} · ${t1}`, rule.includes('1주 = 수요일~화요일') && t1.includes('7/8(수)~7/14(화)'));
    const guide = await page.locator('#time-guide').innerText();
    T('소정근로시간 입력 안내', '주별 근무표 위 안내문', '실제 근로시간이 아닌 미리 정한 근무시간(소정근로시간)을 입력하라는 안내', guide.split('\n')[0], guide.includes('소정근로시간') && guide.includes('실제로 더 일하거나'));

    // 범위 밖 근무 형태
    await fillWhp(page, { ...whpCases[1], type: 'monthly' });
    const mrows = await judgeWhp(page);
    T('월급제: 판정은 하되 예상액은 별도 확인 필요', '사례 2 입력 + 근무 형태 ‘월급제’', '지급 대상, 예상액 대신 “별도 확인 필요” 안내',
      `${mrows[0].status} · ${mrows[0].amount} · 상단 안내 ${await page.locator('#scope-note').isVisible()}`, mrows[0].status === '지급 대상' && mrows[0].amount.includes('월급제'));
    await fillWhp(page, { days: MWF(0, '6'), type: 'daily' });
    await page.click('#submit');
    await page.waitForSelector('#result:not([hidden])');
    const bn = await page.locator('#blocked-note').innerText();
    T('일용직·감시단속적 근로: 별도 확인 필요', '근무 형태 ‘일 단위 계약(일용직)’으로 판정', '판정표 대신 “별도 확인 필요” 안내', bn, bn.includes('별도 확인 필요') && (await page.locator('#whp-table').isHidden()));

    // 결과 아래 문구·근거
    await fillWhp(page, whpCases[1]);
    await judgeWhp(page);
    const disc = await page.locator('.result-disclaimer').innerText();
    await page.click('#basis summary');
    const basis = await page.locator('#basis-body').innerText();
    T('결과표 하단 면책 문구', '사례 2 판정 후 결과표 아래 확인', '“본 계산 결과는 단순 모의 계산이며, 법적 효력을 갖는 증빙자료가 아닙니다.”', disc, disc === '본 계산 결과는 단순 모의 계산이며, 법적 효력을 갖는 증빙자료가 아닙니다.');
    T('적용한 공식 근거와 확인일', '결과 아래 “적용한 판정 규칙과 공식 근거 보기” 펼침', '적용 규칙(S9·예상액)과 근로기준법 제18조제3항·시행령 별표 2 링크, 확인일 2026년 11월 21일',
      basis.replace(/\s+/g, ' ').slice(0, 160) + '…', basis.includes('근로기준법 제18조제3항') && basis.includes('별표 2') && basis.includes('2026년 11월 21일') && (await page.locator('#basis-body a').count()) >= 3);

    // 키보드만으로 사례 2 입력
    await page.goto('/weekly-holiday-pay');
    await page.focus('#home-link');
    await tabTo('hire-date');
    await typeDate('2026', '07', '06');
    await tabTo('wage');
    await page.keyboard.type('10320');
    for (let w = 0; w < 4; w += 1) {
      for (const [iso] of MWF(w, '5')) {
        await tabTo(`h-${iso}`);
        await page.keyboard.type('5');
        await page.keyboard.press('Tab'); // 분
        await page.keyboard.press('Tab'); // 출근 여부(첫 선택지 ‘출근’)
        await page.keyboard.press('Space');
      }
      if (w < 3) {
        await tabTo('next-week');
        await page.keyboard.press('Enter');
      }
    }
    const radioFocus = await page.evaluate(() => getComputedStyle(document.querySelector('#week-tabs .week-tab')).outlineStyle);
    await tabTo('submit');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#result:not([hidden])', { timeout: 3000 }).catch(() => {});
    const kbRows = (await page.locator('#result').isVisible()) ? await page.$$eval('#whp-rows tr [data-col="status"]', (x) => x.map((e) => e.innerText)) : [];
    T('키보드만으로 입력·출근 선택·판정', 'Tab 이동 → 재직 시작일·시급 입력 → 주마다 근무시간 입력, 출근 여부 Space, [다음 주] Enter → [판정하기] Enter', '사례 2와 같은 결과(4주 지급 대상)',
      kbRows.join(', ') || '결과 없음', kbRows.length === 4 && kbRows.every((s) => s === '지급 대상'));
    await page.focus('#tab-1');
    const tabOutline = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return `${s.outlineStyle} ${s.outlineWidth}`; });
    await page.focus('input[name="att-2026-07-06"][value="present"]');
    await page.keyboard.press('ArrowRight');
    const radioOutline = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return `${document.activeElement.value} ${s.outlineStyle} ${s.outlineWidth}`; });
    T('포커스 표시(주차 탭·출근 여부)', '주차 탭과 출근 여부 선택지로 키보드 이동', '포커스된 요소에 테두리 표시', `탭 ${tabOutline} · 출근 여부 ${radioOutline}`, tabOutline.startsWith('solid') && radioOutline.includes('solid'));
    void radioFocus;

    section('주휴수당 계산기 — 미확정 조건과 자료 누락 표시');
    {
      // 자료 누락: 확정 판정·예상액이 나오면 안 된다
      await fillWhp(page, whpCases[5]);
      const rows = await judgeWhp(page);
      const summaryText = await page.locator('#result-summary').innerText();
      const leaked = rows.filter((r) => r.status !== '정보 부족' || /\d+원/.test(r.amount));
      T('자료 누락 시 확정 판정·예상액 미표시', '사례 5B(3주차 근무표 누락) 판정', '모든 주 ‘정보 부족’, 예상액 칸에 금액 없음, 합계 미표시',
        `상태 ${rows.map((r) => r.status).join(', ')} · 금액 표시 ${leaked.length}건 · 요약 “${summaryText}”`, leaked.length === 0 && !summaryText.includes('합계'));

      // 출근 여부 누락
      await fillWhp(page, { ...whpCases[1], att: { '2026-07-17': null } });
      const rowsA = await judgeWhp(page);
      T('출근 여부 누락 주는 정보 부족·예상액 미표시', '사례 2에서 7/17(금) 출근 여부 미선택', '2주차 ‘정보 부족’(7/17 출근 여부 요청), 예상액 없음, 나머지 지급 대상',
        rowsA.map((r) => `${r.week} ${r.status} ${/\d+원/.test(r.amount) ? r.amount.split(' ')[0] : '금액 없음'}`).join(' / '),
        rowsA[1].status === '정보 부족' && /7월 17일\(금\)의 출근 여부/.test(rowsA[1].reason) && !/\d+원/.test(rowsA[1].amount) && rowsA[0].status === '지급 대상');

      // 쟁점 B: 5주차 이후 두 후보 기간의 결론이 다름
      const s16 = (w) => MW(w, '8');
      const s12 = (w) => MW(w, '6');
      await fillWhp(page, { weekCount: 8, days: [0, 1, 2, 3].flatMap(s16).concat([4, 5, 6, 7].flatMap(s12)) });
      const rowsB = await judgeWhp(page);
      const w5 = rowsB[4];
      T('미확정 조건(어느 4주 평균) → 별도 확인 필요', '1~4주 주 16시간, 5~8주 주 12시간(월·수), 8주 판정', '5주차만 ‘정보 부족’ + “별도 확인 필요”(2~5주차 평균 15시간 / 5~8주차 평균 12시간), 금액 없음 · 6·7주차는 두 기간 모두 15시간 미만이라 지급 대상 아님 · 4주차 지급 대상 · 8주차 지급 대상 아님',
        `5주차 ${w5.status}(${w5.reason.includes('별도 확인 필요') ? '별도 확인 필요 표시' : '표시 없음'}) · 6주차 ${rowsB[5].status} · 7주차 ${rowsB[6].status} · 4주차 ${rowsB[3].status} · 8주차 ${rowsB[7].status}`,
        w5.status === '정보 부족' && w5.reason.includes('별도 확인 필요') && !/\d+원/.test(w5.amount) && rowsB[5].status === '지급 대상 아님' && rowsB[6].status === '지급 대상 아님' &&
        rowsB[3].status === '지급 대상' && rowsB[7].status === '지급 대상 아님');

      // 쟁점 D: 4주 미만 재직 예상액
      await fillWhp(page, whpCases[4]);
      const rowsD = await judgeWhp(page);
      T('미확정 조건(4주 미만 예상액) → 별도 확인 필요', '사례 5A(재직 17일) 판정', '1·2주차 지급 대상이지만 예상액 대신 “별도 확인 필요”',
        rowsD.slice(0, 2).map((r) => `${r.status} · ${r.amount.slice(0, 50)}`).join(' / '),
        rowsD.slice(0, 2).every((r) => r.status === '지급 대상' && r.amount.includes('별도 확인 필요') && !/\d{2},\d{3}원/.test(r.amount)));

      // 모든 행에 적용 기간·시간·이유·근거
      await fillWhp(page, whpCases[3]);
      const rowsE = await judgeWhp(page);
      T('결과 행마다 적용 기간·적용 시간·판정 이유·공식 근거', '사례 4 판정 후 각 행 확인', '모든 행에 평균 기간, 적용 시간, 이유, “근거: … 근로기준법 …”',
        rowsE.map((r) => `${r.week}: ${r.window.split(' · ')[0]} | ${r.applied.split(' (')[0]} | 근거 ${r.reason.includes('근거:') ? '있음' : '없음'}`).join(' / '),
        rowsE.every((r) => r.window !== '—' && r.applied.startsWith('평균') && /근거: .*(근로기준법|고용노동부)/.test(r.reason)));
    }

    section('주휴수당 계산기 — 주소·링크·화면');
    {
      const fresh = await context.newPage();
      watch(fresh);
      const r1 = await fresh.goto('/weekly-holiday-pay');
      const t1x = await fresh.title();
      const r2 = await fresh.reload();
      const h1 = await fresh.locator('h1').innerText();
      T('/weekly-holiday-pay 직접 접속 후 새로고침', '새 탭에서 주소 입력 → 새로고침', 'HTTP 200, 제목 “주휴수당 계산기 — 주 15시간·변동 근무 판독 | 생활계산서”, 화면 제목 “주휴수당 계산기”',
        `${r1.status()}/${r2.status()} · “${await fresh.title()}” · “${h1}”`, r1.status() === 200 && r2.status() === 200 && t1x === '주휴수당 계산기 — 주 15시간·변동 근무 판독 | 생활계산서' && h1 === '주휴수당 계산기');
      const r3 = await fresh.goto('/weekly-holiday-pay/');
      const c3 = await fresh.evaluate(() => document.querySelector('link[rel=canonical]')?.href ?? null);
      T('/weekly-holiday-pay/ 끝 슬래시 주소', '끝 슬래시 주소 접속', '계산기가 열리고, 슬래시 없는 주소로 이동하거나 canonical 이 슬래시 없는 주소를 가리킴', `${fresh.url().replace(baseURL, '')} (${r3.status()}) · canonical ${c3 ?? '없음(미리보기)'}`,
        r3.status() === 200 && (await fresh.locator('h1').innerText()) === '주휴수당 계산기' && (fresh.url() === `${baseURL}/weekly-holiday-pay` || (c3 === null ? !PRODUCTION : c3.endsWith('/weekly-holiday-pay'))));
      await fresh.goto('/');
      await fresh.click('a.card[href="/weekly-holiday-pay"]');
      await fresh.waitForURL(`${baseURL}/weekly-holiday-pay`);
      const okNav = (await fresh.locator('h1').innerText()) === '주휴수당 계산기';
      await fresh.click('#home-link');
      await fresh.waitForURL(`${baseURL}/`);
      T('홈 ↔ 주휴수당 계산기 이동', '홈 “주휴수당 계산기” 카드 클릭 → “← 홈” 버튼 클릭', '계산기로 이동 후 홈으로 복귀', `${okNav ? '계산기 열림' : '실패'} → ${await fresh.title()}`, okNav && (await fresh.title()) === '급여·세금·부동산 계산기 30종 | 생활계산서');
      await fresh.close();
    }
    for (const [label, opts, tag] of [
      ['모바일 360px', { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, '360'],
      ['데스크톱 1280px', { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }, 'desktop'],
    ]) {
      const ctx = await browser.newContext({ baseURL, locale: 'ko-KR', ...opts });
      const p = await ctx.newPage();
      watch(p);
      await fillWhp(p, whpCases[3]);
      await p.click('#tab-2');
      const formCheck = await p.evaluate(() => {
        const over = document.documentElement.scrollWidth - innerWidth;
        const bad = [...document.querySelectorAll('#whp-form input:not([type=radio]):not([type=checkbox]), #whp-form select, #whp-form button, .att-opt, .week-tab')]
          .filter((el) => !el.closest('[hidden]') && el.getBoundingClientRect().width > 0)
          .filter((el) => { const r = el.getBoundingClientRect(); return !el.closest('.week-tabs') && (r.left < -0.5 || r.right > innerWidth + 0.5); });
        const strip = document.querySelector('.week-tabs');
        const tabsFit = [...strip.children].slice(0, 4).every((t) => t.getBoundingClientRect().right <= strip.getBoundingClientRect().right + 0.5);
        return { over, bad: bad.map((b) => b.id || b.className), tabsFit };
      });
      await p.screenshot({ path: path.join(SHOTS, `whp-${tag}-form.png`), fullPage: true });
      await p.click('#submit');
      await p.waitForSelector('#result:not([hidden])');
      const resCheck = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth }));
      await p.locator('#result').screenshot({ path: path.join(SHOTS, `whp-${tag}-result.png`) });
      T(`${label} 주휴수당 계산기`, `${label}에서 사례 4 입력·판정`, '가로 스크롤 없음, 입력칸·버튼·판정표가 화면 안, 4주 탭이 스크롤 없이 보임',
        `입력 화면 넘침 ${formCheck.over}px, 화면 밖 요소 ${formCheck.bad.length}개 ${formCheck.bad.join(',')}, 4주 탭 한 화면=${formCheck.tabsFit} · 결과 화면 넘침 ${resCheck.over}px`, formCheck.over <= 0 && formCheck.bad.length === 0 && formCheck.tabsFit && resCheck.over <= 0);
      if (tag === '360') {
        await fillWhp(p, whpCases[5]);
        await judgeWhp(p);
        await p.locator('#result').screenshot({ path: path.join(SHOTS, 'whp-360-insufficient.png') });
        await p.goto('/');
        await p.screenshot({ path: path.join(SHOTS, 'home-360.png'), fullPage: true });
      } else {
        await p.goto('/');
        await p.screenshot({ path: path.join(SHOTS, 'home-desktop.png'), fullPage: true });
      }
      await ctx.close();
    }

    /* ================= 적용 기준 및 공식 출처 접기 ================= */
    section('적용 기준 및 공식 출처 — 접이식 영역 (두 계산기)');
    {
      const FOLDS = [
        {
          name: '월급 일할계산기', url: '/salary-proration', fold: '#basis-fold',
          calc: async (pg, salary = '3100000') => { await fillCase(pg, { ...CASES[0], salary, reload: false }); },
          submit: '#submit', resultCheck: async (pg) => (await pg.locator('#row-calendar [data-col="formula"]').innerText()).includes('×'),
          edit: async (pg) => pg.fill('#salary', '6200000'),
          linkHost: 'www.law.go.kr',
        },
        {
          name: '주휴수당 계산기', url: '/weekly-holiday-pay', fold: '#basis',
          calc: null, submit: '#submit', resultCheck: async (pg) => (await pg.locator('#whp-rows tr').first().innerText()).includes('근거:'),
          edit: async (pg) => { await pg.click('#tab-1'); await pg.fill('#h-2026-07-06', '7'); },
          linkHost: null,
        },
      ];
      const foldState = (pg, sel) => pg.evaluate((s) => {
        const d = document.querySelector(s);
        const sum = d.querySelector(':scope > summary');
        const icon = sum.querySelector('.fold-icon'); const m = icon ? new DOMMatrix(getComputedStyle(icon).transform) : null; const arrow = m ? Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI) : null;
        const date = d.querySelector('.checked-date');
        const vis = (el) => el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
        return { open: d.open, title: sum.innerText.trim(), arrow, dateVisible: !!date && vis(date), links: [...d.querySelectorAll('.sources a')].filter(vis).length };
      }, sel);

      for (const f of FOLDS) {
        // 첫 접속·새로고침 기본 접힘
        await page.goto(f.url);
        const s0 = await foldState(page, f.fold);
        await page.locator(`${f.fold} > summary`).click();
        const s1 = await foldState(page, f.fold);
        await page.reload();
        const s2 = await foldState(page, f.fold);
        T(`${f.name}: 제목·기본 접힘·새로고침 후 접힘`, `${f.url} 첫 접속 → 펼침 → 새로고침`, '제목 “계산 방법 · 실제 예제 · 공식출처”, 첫 접속 접힘, 새로고침 후 다시 접힘, 접힌 상태에서 확인일·링크 숨김',
          `제목 “${s0.title}” · 첫 접속 ${s0.open ? '열림' : '접힘'}(링크 ${s0.links}개 보임) · 펼친 뒤 ${s1.open ? '열림' : '접힘'} · 새로고침 후 ${s2.open ? '열림' : '접힘'}`,
          s0.title === '계산 방법 · 실제 예제 · 공식출처' && !s0.open && s0.links === 0 && !s0.dateVisible && s1.open && !s2.open);

        // 제목줄 클릭으로 열고 닫기 + 화살표 방향
        const sumBox = await page.locator(`${f.fold} > summary`).boundingBox();
        await page.mouse.click(sumBox.x + sumBox.width - 10, sumBox.y + sumBox.height / 2); // 제목 글자 밖(제목줄 오른쪽 끝)
        await page.waitForTimeout(300); // 화살표 회전 애니메이션(0.15초) 완료 대기
        const c1 = await foldState(page, f.fold);
        await page.mouse.click(sumBox.x + sumBox.width - 10, sumBox.y + sumBox.height / 2);
        await page.waitForTimeout(300);
        const c2 = await foldState(page, f.fold);
        const pointsUp = (a) => a === -135; const pointsDown = (a) => a === 45;
        T(`${f.name}: 제목줄 전체 클릭·화살표 방향`, '제목줄 오른쪽 끝(글자 밖)을 클릭 → 다시 클릭', '열림 ↔ 접힘, 제목 오른쪽 화살표: 접힘 아래(45°) → 펼침 위(−135°)',
          `1회 ${c1.open ? '열림' : '접힘'}(화살표 ${c1.arrow}) · 2회 ${c2.open ? '열림' : '접힘'}(화살표 ${c2.arrow})`,
          c1.open && !c2.open && pointsUp(c1.arrow) && pointsDown(c2.arrow) && c1.dateVisible && c1.links >= 2);

        // 키보드 Enter·Space
        await page.focus(`${f.fold} > summary`);
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab'); // 키보드로 포커스 (focus-visible)
        const focused = await page.evaluate((s) => document.activeElement === document.querySelector(`${s} > summary`), f.fold);
        const focusRing = await page.evaluate((s) => getComputedStyle(document.querySelector(`${s} > summary`)).outlineStyle, f.fold);
        await page.keyboard.press('Enter');
        const k1 = (await foldState(page, f.fold)).open;
        await page.keyboard.press('Enter');
        const k2 = (await foldState(page, f.fold)).open;
        await page.keyboard.press('Space');
        const k3 = (await foldState(page, f.fold)).open;
        await page.keyboard.press('Space');
        const k4 = (await foldState(page, f.fold)).open;
        T(`${f.name}: 키보드 Enter·Space`, 'Tab으로 제목줄 포커스 → Enter → Enter → Space → Space', '열림 → 접힘 → 열림 → 접힘, 포커스 테두리 표시',
          `${[k1, k2, k3, k4].map((x) => (x ? '열림' : '접힘')).join(' → ')} · 포커스 테두리 ${focusRing}`, focused && k1 && !k2 && k3 && !k4 && focusRing === 'solid');

        // 펼친 상태에서 공식 링크 열기
        await page.locator(`${f.fold} > summary`).click();
        const link = page.locator(`${f.fold} .sources a`).first();
        const href = await link.getAttribute('href');
        const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
        await popup.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
        const popUrl = popup.url();
        const popTitle = await popup.title().catch(() => '');
        await popup.close();
        T(`${f.name}: 펼친 상태에서 공식 링크 열기`, '펼친 뒤 첫 번째 공식 출처 링크 클릭', `새 창에서 ${href} 열림`, `${popUrl} “${popTitle}”`, decodeURI(popUrl) === decodeURI(href) || popUrl === href);

        // 다시 계산해도 열린 상태 유지, 결과의 산식·판정 이유·면책 문구는 영역 밖
        await page.goto(f.url);
        if (f.name === '월급 일할계산기') {
          await page.selectOption('#year', '2026');
          await page.selectOption('#month', '1');
          await page.fill('#salary', '3100000');
          await page.fill('#start-date', '2026-01-16');
        } else {
          await page.fill('#hire-date', '2026-07-06');
          await page.fill('#wage', '10320');
          for (const [iso] of [0, 1, 2, 3].flatMap((w) => MWF(w, '5'))) {
            const n = Math.floor((Date.parse(iso) / 86400000 - WHP_HIRE) / 7) + 1;
            await page.click(`#tab-${n}`);
            await page.fill(`#h-${iso}`, '5');
            await page.check(`input[name="att-${iso}"][value="present"]`);
          }
        }
        await page.locator(`${f.fold} > summary`).click();
        await page.click(f.submit);
        await page.waitForSelector('#result:not([hidden])');
        const p1 = (await foldState(page, f.fold)).open;
        await f.edit(page);
        const hiddenNow = await page.locator('#result').isHidden();
        await page.click(f.submit);
        await page.waitForSelector('#result:not([hidden])');
        const p2 = (await foldState(page, f.fold)).open;
        const outside = await page.evaluate((s) => {
          const fold = document.querySelector(s);
          const res = document.getElementById('result');
          const disc = [...document.querySelectorAll('.disclaimer')].find((d) => d.textContent.includes('법적 효력'));
          return !fold.contains(res) && !fold.contains(disc) && disc.getBoundingClientRect().height > 0;
        }, f.fold);
        const resOk = await f.resultCheck(page);
        T(`${f.name}: 다시 계산해도 열림 유지·결과는 영역 밖`, '영역 펼침 → 계산 → 입력 수정(결과 숨김) → 다시 계산', '두 번의 계산 뒤에도 열림 유지, 산식/판정 이유·면책 문구는 접이식 영역 밖에 보임',
          `1차 계산 후 ${p1 ? '열림' : '접힘'} · 수정 시 결과 숨김=${hiddenNow} · 재계산 후 ${p2 ? '열림' : '접힘'} · 결과·면책 문구 영역 밖=${outside} · 결과 산식/근거 표시=${resOk}`,
          p1 && hiddenNow && p2 && outside && resOk);
        // 결과가 있는 상태에서 접어도 결과는 그대로 보임
        await page.locator(`${f.fold} > summary`).click();
        const stillVisible = await page.locator('#result').isVisible() && (await f.resultCheck(page));
        T(`${f.name}: 영역을 접어도 결과는 그대로`, '결과 표시 상태에서 영역 접기', '결과표(산식·판정 이유)와 면책 문구가 계속 보임', `결과 보임=${stillVisible}`, stillVisible);
      }

      // 주휴수당: 이번 판정의 적용 규칙이 영역 안에 표시되고, 입력 수정 시 숨김
      await page.locator('#basis > summary').click();
      const rb = await page.locator('#basis-body').isVisible();
      const rbText = (await page.locator('#basis-body').innerText()).split('\n')[0];
      await page.click('#tab-1');
      await page.fill('#h-2026-07-06', '6');
      const rbHidden = await page.locator('#basis-body').isHidden();
      const stillOpen = (await foldState(page, '#basis')).open;
      T('주휴수당 계산기: 이번 판정의 적용 규칙', '판정 후 영역 펼침 → 입력 수정', '영역 안에 “이번 판정에 적용한 규칙” 표시, 수정하면 그 목록만 숨기고 영역은 열린 채 유지',
        `표시=${rb}(“${rbText}”) · 수정 후 숨김=${rbHidden} · 영역 ${stillOpen ? '열림' : '접힘'}`, rb && rbText.includes('이번 판정에 적용한 규칙') && rbHidden && stillOpen);

      // 모바일 터치
      const mctx = await browser.newContext({ baseURL, locale: 'ko-KR', viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const mp = await mctx.newPage();
      watch(mp);
      for (const f of FOLDS) {
        await mp.goto(f.url);
        await mp.locator(`${f.fold} > summary`).scrollIntoViewIfNeeded();
        await mp.locator(`${f.fold} > summary`).tap();
        const t1 = await foldState(mp, f.fold);
        const tag = f.name === '월급 일할계산기' ? 'salary' : 'whp';
        await mp.waitForTimeout(300);
        await mp.locator(f.fold).screenshot({ path: path.join(SHOTS, `fold-${tag}-360-open.png`) });
        await mp.locator(`${f.fold} > summary`).tap();
        const t2 = await foldState(mp, f.fold);
        await mp.waitForTimeout(300);
        await mp.locator(f.fold).screenshot({ path: path.join(SHOTS, `fold-${tag}-360-closed.png`) });
        const sumH = (await mp.locator(`${f.fold} > summary`).boundingBox()).height;
        const over = await mp.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        T(`${f.name}: 모바일 360px 터치`, '360px 터치 화면에서 제목줄 탭 → 다시 탭', '열림 → 접힘, 제목줄 높이 ≥ 44px, 가로 스크롤 없음',
          `${t1.open ? '열림' : '접힘'}(링크 ${t1.links}개) → ${t2.open ? '열림' : '접힘'} · 제목줄 ${Math.round(sumH)}px · 넘침 ${over}px`, t1.open && t1.links >= 2 && !t2.open && sumH >= 44 && over <= 0);
      }
      await mctx.close();
    }

    /* ================= 데이터 전송 ================= */
    section('급여·날짜 외부 전송 여부');
    const src = ['assets/js/proration.js', 'assets/js/salary-proration-page.js', 'assets/js/weekly-holiday.js', 'assets/js/weekly-holiday-page.js'].map((f) => fs.readFileSync(path.join(ROOT, DIR, f), 'utf8')).join('\n');
    const html = ['index.html', 'salary-proration/index.html', 'weekly-holiday-pay/index.html'].map((f) => { const full = path.join(ROOT, DIR, f); return fs.readFileSync(fs.existsSync(full) ? full : full.replace(/\/index\.html$/, '.html'), 'utf8'); }).join('\n');
    const apis = ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'import(', 'new Image', 'gtag', 'dataLayer'];
    const found = apis.filter((a) => src.includes(a));
    const externalScripts = (html.match(/<script[^>]+src="(?!\/)[^"]*"/g) || []);
    // 방문 통계(Google 태그 관리자) 도입 후: 외부 통신은 Google 분석 주소만 허용, 계산 화면 코드는 여전히 전송·저장 API 0건
    const connect = (html.match(/connect-src ([^;"]+)/) || [])[1] ?? '';
    const connectOk = connect.split(/\s+/).every((h) => /^https:\/\/(www\.googletagmanager\.com|\*\.google-analytics\.com|\*\.analytics\.google\.com)$/.test(h));
    const loader = fs.readFileSync(path.join(ROOT, DIR, 'assets/js/analytics.js'), 'utf8');
    const loaderOk = /PRODUCTION_HOSTS = \['xn--989a2xnd520fn5f\.site'\]/.test(loader) && /GTM-WLPB6PGS/.test(loader) && !/value|querySelector|form/i.test(loader.replace(/\/\*[\s\S]*?\*\//, ''));
    T('코드 점검: 전송·저장 API 미사용', '화면·계산 JS에서 전송·저장 API 검색, HTML에서 외부 스크립트 검색, CSP connect-src·통계 코드 확인',
      '전송·저장 API 0건, 외부 스크립트 태그 0건, CSP connect-src 는 Google 분석 주소만, 통계 코드는 운영 도메인에서만·입력값 미접근',
      `API ${found.length}건 ${found.join(',')} · 외부 스크립트 ${externalScripts.length}건 · connect-src ${connect} · 통계 코드 ${loaderOk ? '정상' : '확인 필요'}`,
      found.length === 0 && externalScripts.length === 0 && connectOk && loaderOk);
    T('실행 중 요청: 다른 출처로 보낸 요청', '위 모든 검수를 실행하는 동안 브라우저 요청 기록(공식 출처 새 창 제외)',
      '다른 출처 요청 0건', `${externalRequests.length}건 ${externalRequests.slice(0, 3).join(', ')}`, externalRequests.length === 0);
    T('실행 중 콘솔 오류', '위 모든 검수 중 브라우저 콘솔 기록', '오류 0건', `${consoleErrors.length}건 ${consoleErrors.slice(0, 2).join(' | ')}`, consoleErrors.length === 0);

    const PAGE_LIST = PAGES.filter((p) => p.public).map((p) => p.path);
    const metas = [];
    for (const u of PAGE_LIST) {
      const res = await page.goto(u);
      metas.push({
        u,
        ...(await page.evaluate(() => ({
          robots: document.querySelector('meta[name=robots]')?.content ?? null,
          canonical: document.querySelector('link[rel=canonical]')?.href ?? null,
          ogUrl: document.querySelector('meta[property="og:url"]')?.content ?? null,
        }))),
        header: res.headers()['x-robots-tag'] ?? null,
      });
    }
    const robotsTxt = await (await page.request.get('/robots.txt')).text();
    if (!PRODUCTION) {
      section('검색 노출 차단 (개발 환경)');
      T('검색 노출 차단', '세 페이지의 meta robots, X-Robots-Tag 헤더, robots.txt 확인', 'noindex, nofollow · Disallow: /',
        metas.map((m) => `${m.u} ${m.robots} / ${m.header}`).join(' · ') + ` · robots.txt ${robotsTxt.includes('Disallow: /') ? 'Disallow: /' : '없음'}`,
        metas.every((m) => m.robots === 'noindex, nofollow' && m.header === 'noindex, nofollow') && robotsTxt.includes('Disallow: /'));
    } else {
      section(`운영용 빌드 검색 설정 (SITE_URL=${SITE_URL})`);
      for (const m of metas) {
        const expected = SITE_URL + m.u;
        T(`canonical: ${m.u}`, `운영 빌드 ${m.u}의 link rel=canonical·og:url·meta robots 확인`, `canonical·og:url = ${expected}, noindex 없음`,
          `canonical ${m.canonical} · og:url ${m.ogUrl} · robots ${m.robots ?? '없음'}`, m.canonical === expected && m.ogUrl === expected && m.robots === null);
      }
      const sitemapRes = await page.request.get('/sitemap.xml');
      const sitemap = await sitemapRes.text();
      const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]);
      T('sitemap.xml', '/sitemap.xml 요청', `200, <loc> ${PAGE_LIST.length}개: ${PAGE_LIST.map((u) => SITE_URL + u).join(', ')}`,
        `${sitemapRes.status()} · ${locs.join(', ')}`, sitemapRes.status() === 200 && JSON.stringify(locs) === JSON.stringify(PAGE_LIST.map((u) => SITE_URL + u)));
      T('robots.txt', '/robots.txt 요청', `Allow: / · Sitemap: ${SITE_URL}/sitemap.xml`, robotsTxt.trim().replace(/\n+/g, ' / '),
        robotsTxt.includes('Allow: /') && !robotsTxt.includes('Disallow: /') && robotsTxt.includes(`Sitemap: ${SITE_URL}/sitemap.xml`));
      const notFound = await page.request.get('/no-such-page');
      const nfHtml = await notFound.text();
      T('없는 주소의 404 페이지는 검색 제외', '/no-such-page 요청', '404, noindex', `${notFound.status()} · ${nfHtml.includes('noindex') ? 'noindex 있음' : '없음'}`, notFound.status() === 404 && nfHtml.includes('noindex'));
    }
  } catch (err) {
    failures += 1;
    console.error(err);
    if (sections.length) sections[sections.length - 1].rows.push({ item: '검수 스크립트 오류', method: '-', expected: '-', actual: String(err).split('\n')[0], status: '실패' });
  } finally {
    await browser.close();
    server?.close();
  }

  writeReport();
  const all = sections.flatMap((s) => s.rows);
  const count = (s) => all.filter((r) => r.status === s).length;
  console.log(`\n통과 ${count('통과')} · 실패 ${count('실패')} · 미확인 ${count('미확인')}`);
  process.exit(failures === 0 ? 0 : 1);
})();

function writeReport() {
  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const all = sections.flatMap((s) => s.rows);
  const count = (s) => all.filter((r) => r.status === s).length;
  const lines = ['# 생활계산서 검수 결과표', ''];
  lines.push(`- 실행: ${new Date().toISOString()} · ${PRODUCTION ? `운영용 빌드(dist/, SITE_URL=${SITE_URL}) · \`npm run verify:production\`` : `미리보기(${DIR}/) · \`npm run test:e2e\``} · Chromium(Playwright) · 시간대 Pacific/Kiritimati(UTC+14)`);
  lines.push(`- 집계: 통과 ${count('통과')} · 실패 ${count('실패')} · 미확인 ${count('미확인')}`, '');
  for (const s of sections) {
    lines.push(`## ${s.title}`, '', '| 검수 항목 | 입력 또는 재현 방법 | 기대값 | 실제값 | 상태 |', '|---|---|---|---|---|');
    for (const r of s.rows) lines.push(`| ${esc(r.item)} | ${esc(r.method)} | ${esc(r.expected)} | ${esc(r.actual)} | ${r.status} |`);
    lines.push('');
  }
  fs.writeFileSync(path.join(ROOT, 'docs', PRODUCTION ? 'test-report-production.md' : 'test-report.md'), lines.join('\n'));
}
