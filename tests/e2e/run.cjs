/**
 * 브라우저 검수 (Playwright, Chromium).
 *   npm run test:e2e
 * 미리보기 서버를 임의 포트로 띄워 홈·계산기를 실제로 조작해 검사하고,
 * docs/screenshots/ 에 모바일(360px)·데스크톱 화면 캡처를,
 * docs/test-report.md 에 결과표(검수 항목·재현 방법·기대값·실제값·상태)를 남긴다.
 */
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(ROOT, 'docs', 'screenshots');

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
  const { createServer } = await import(path.join(ROOT, 'scripts', 'serve.js'));
  const server = createServer({ dir: 'site' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
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
    section('필수 검증 사례 5건 (브라우저에 직접 입력)');
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
      ['/', '급여 계산기 모음 | 정산노트', '급여 계산기 모음'],
      ['/salary-proration', '월급 일할계산기 — 중도 입사·퇴사 급여 계산 | 정산노트', '월급 일할계산기'],
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
    T('끝 슬래시 주소 통일', '/salary-proration/ 접속', '/salary-proration 으로 이동해 계산기 표시', `${page.url().replace(baseURL, '')} (${resp.status()})`,
      page.url() === `${baseURL}/salary-proration` && resp.status() === 200);
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
    T('홈 → 계산기 이동', '홈에서 “월급 일할계산기” 카드 클릭', '카드 1개, /salary-proration 으로 이동',
      `카드 ${cards}개 → ${page.url().replace(baseURL, '')} “${await page.title()}”`, cards === 1 && (await page.locator('h1').innerText()) === '월급 일할계산기');
    await page.click('#home-link');
    await page.waitForURL(`${baseURL}/`);
    T('계산기 → 홈 이동', '계산기 상단 “← 계산기 목록(홈)” 클릭', '/ 로 이동', `${page.url().replace(baseURL, '') || '/'} “${await page.title()}”`,
      (await page.title()) === '급여 계산기 모음 | 정산노트');
    await page.goto('/salary-proration');
    await page.click('.site-header .brand');
    await page.waitForURL(`${baseURL}/`);
    T('계산기 → 홈 이동(브랜드)', '상단 “정산노트” 로고 클릭', '/ 로 이동', page.url().replace(baseURL, '') || '/', true);

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
    await page.keyboard.press('Tab');
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

    /* ================= 데이터 전송 ================= */
    section('급여·날짜 외부 전송 여부');
    const src = ['assets/js/proration.js', 'assets/js/salary-proration-page.js'].map((f) => fs.readFileSync(path.join(ROOT, 'site', f), 'utf8')).join('\n');
    const html = ['index.html', 'salary-proration/index.html'].map((f) => fs.readFileSync(path.join(ROOT, 'site', f), 'utf8')).join('\n');
    const apis = ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'import(', 'new Image', 'gtag', 'dataLayer'];
    const found = apis.filter((a) => src.includes(a));
    const externalScripts = (html.match(/<script[^>]+src="(?!\/)[^"]*"/g) || []);
    T('코드 점검: 전송·저장 API 미사용', '화면·계산 JS에서 전송·저장 API 검색, HTML에서 외부 스크립트 검색',
      '전송·저장 API 0건, 외부 스크립트 0건, CSP connect-src \'none\'',
      `API ${found.length}건 ${found.join(',')} · 외부 스크립트 ${externalScripts.length}건 · CSP connect-src 'none' ${html.includes("connect-src 'none'") ? '있음' : '없음'}`,
      found.length === 0 && externalScripts.length === 0 && html.includes("connect-src 'none'"));
    T('실행 중 요청: 다른 출처로 보낸 요청', '위 모든 검수를 실행하는 동안 브라우저 요청 기록(공식 출처 새 창 제외)',
      '다른 출처 요청 0건', `${externalRequests.length}건 ${externalRequests.slice(0, 3).join(', ')}`, externalRequests.length === 0);
    T('실행 중 콘솔 오류', '위 모든 검수 중 브라우저 콘솔 기록', '오류 0건', `${consoleErrors.length}건 ${consoleErrors.slice(0, 2).join(' | ')}`, consoleErrors.length === 0);

    section('검색 노출 차단 (개발 환경)');
    const metas = [];
    for (const u of ['/', '/salary-proration']) {
      const res = await page.goto(u);
      metas.push({ u, robots: await page.getAttribute('meta[name=robots]', 'content'), header: res.headers()['x-robots-tag'] });
    }
    const robotsTxt = await (await page.request.get('/robots.txt')).text();
    T('검색 노출 차단', '두 페이지의 meta robots, X-Robots-Tag 헤더, robots.txt 확인', 'noindex, nofollow · Disallow: /',
      metas.map((m) => `${m.u} ${m.robots} / ${m.header}`).join(' · ') + ` · robots.txt ${robotsTxt.includes('Disallow: /') ? 'Disallow: /' : '없음'}`,
      metas.every((m) => m.robots === 'noindex, nofollow' && m.header === 'noindex, nofollow') && robotsTxt.includes('Disallow: /'));
  } catch (err) {
    failures += 1;
    console.error(err);
    if (sections.length) sections[sections.length - 1].rows.push({ item: '검수 스크립트 오류', method: '-', expected: '-', actual: String(err).split('\n')[0], status: '실패' });
  } finally {
    await browser.close();
    server.close();
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
  const lines = ['# 정산노트 검수 결과표', ''];
  lines.push(`- 실행: ${new Date().toISOString()} · \`npm run test:e2e\` · Chromium(Playwright) · 시간대 Pacific/Kiritimati(UTC+14)`);
  lines.push(`- 집계: 통과 ${count('통과')} · 실패 ${count('실패')} · 미확인 ${count('미확인')}`, '');
  for (const s of sections) {
    lines.push(`## ${s.title}`, '', '| 검수 항목 | 입력 또는 재현 방법 | 기대값 | 실제값 | 상태 |', '|---|---|---|---|---|');
    for (const r of s.rows) lines.push(`| ${esc(r.item)} | ${esc(r.method)} | ${esc(r.expected)} | ${esc(r.actual)} | ${r.status} |`);
    lines.push('');
  }
  fs.writeFileSync(path.join(ROOT, 'docs', 'test-report.md'), lines.join('\n'));
}
