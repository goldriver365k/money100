/**
 * 연습용 휴대폰 화면 그림 (SVG).
 *
 * 수업 데이터의 card.screen 을 받아 그림을 그리고, 누를 수 있는 곳(대상)의 위치를 함께 돌려준다.
 *   renderScreen(screen, target) → { svg, viewBox, targets: { 이름: {x,y,w,h} }, label }
 *
 * - 좌표계는 가로 360 × 세로 640 (휴대폰 화면 비율).
 * - 대상 이름은 화면에 보이는 한국어 이름을 그대로 쓴다. 예: '설정', '디스플레이', '홈 버튼'.
 * - 실제 갤럭시 사진으로 바꿀 때는 card.photo 를 넣으면 이 그림 대신 사진이 쓰인다(app.js 참고).
 */

const W = 360;
const H = 640;

const C = {
  bg: '#F7F7F9',
  card: '#FFFFFF',
  ink: '#1C1B1F',
  sub: '#5F6368',
  line: '#DADCE0',
  blue: '#1A5FD0',
  green: '#1E8E3E',
  red: '#C62828',
  dim: 'rgba(20,20,24,0.55)',
};

const APP_COLORS = {
  전화: '#1E8E3E', 메시지: '#1A5FD0', 연락처: '#E8710A', 카메라: '#C2185B', 갤러리: '#D81B60',
  설정: '#5F6368', 인터넷: '#5E35B1', '삼성 인터넷': '#5E35B1', '플레이 스토어': '#0F9D58', '갤럭시 스토어': '#C2185B',
  카카오톡: '#F2C200', 시계: '#3949AB', 캘린더: '#1565C0', '내 파일': '#F9A825', '삼성 노트': '#EF6C00',
  노트: '#EF6C00', '음성 녹음': '#D32F2F', 계산기: '#2E7D32', 날씨: '#0288D1', 라디오: '#6D4C41',
  월렛: '#283593', '삼성 월렛': '#283593', 파인드: '#00897B', 멤버스: '#1565C0', 헬스: '#00897B',
  지도: '#34A853', 'Google': '#4285F4', 'YouTube': '#E53935', 'Smart Switch': '#1E88E5', 스마트싱스: '#00ACC1',
  편한자판: '#7B1FA2', '보안 폴더': '#37474F', 통역: '#00838F', 웨어러블: '#455A64', 펜업: '#AD1457',
  '삼성닷컴': '#1428A0', '삼성 키즈': '#F57C00', '게이밍 허브': '#6A1B9A', '크리에이티브 스튜디오': '#8E24AA',
  'Gemini': '#3F51B5', 'Chrome': '#F4B400', '통신사 앱': '#546E7A', 'Samsung Global Goals': '#00796B',
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 그림 조각을 모으고, 누를 수 있는 곳을 기록하는 작은 도구 */
function canvas() {
  const parts = [];
  const targets = {};
  return {
    add(s) { parts.push(s); },
    reg(name, x, y, w, h) { if (name && !targets[name]) targets[name] = { x, y, w, h }; },
    rect(x, y, w, h, fill, r = 0, extra = '') {
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`);
    },
    text(x, y, s, { size = 16, fill = C.ink, weight = 500, anchor = 'start' } = {}) {
      parts.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}">${esc(s)}</text>`);
    },
    out() { return { body: parts.join(''), targets }; },
  };
}

/* ---------- 공통 조각 ---------- */

function statusBar(c, { dark = false } = {}) {
  const f = dark ? '#FFFFFF' : C.ink;
  c.text(18, 24, '10:00', { size: 14, fill: f, weight: 600 });
  c.add(`<g fill="${f}"><rect x="290" y="13" width="4" height="10" rx="1"/><rect x="296" y="10" width="4" height="13" rx="1"/><rect x="302" y="7" width="4" height="16" rx="1"/><rect x="314" y="9" width="26" height="13" rx="3" fill="none" stroke="${f}" stroke-width="2"/><rect x="317" y="12" width="17" height="7" rx="1"/></g>`);
  c.reg('상태표시줄', 0, 0, W, 34);
}

function navBar(c, { dark = false } = {}) {
  const f = dark ? '#FFFFFF' : '#3C4043';
  c.add(`<g stroke="${f}" stroke-width="2.6" fill="none" stroke-linecap="round">
    <line x1="64" y1="612" x2="64" y2="628"/><line x1="72" y1="612" x2="72" y2="628"/><line x1="80" y1="612" x2="80" y2="628"/>
    <rect x="170" y="610" width="20" height="20" rx="6"/>
    <polyline points="294,610 284,620 294,630"/></g>`);
  c.reg('최근 앱 버튼', 40, 600, 64, 40);
  c.reg('홈 버튼', 148, 600, 64, 40);
  c.reg('뒤로가기 버튼', 256, 600, 64, 40);
}

function appIcon(c, x, y, name, size = 56) {
  const color = APP_COLORS[name] ?? '#607D8B';
  const glyph = name.replace(/^(삼성|갤럭시|구글)\s*/, '').slice(0, name === '플레이 스토어' ? 2 : 2);
  c.rect(x, y, size, size, color, size * 0.32);
  c.text(x + size / 2, y + size / 2 + 6, glyph, { size: size * 0.3, fill: name === '카카오톡' ? '#3A1D1D' : '#FFFFFF', weight: 700, anchor: 'middle' });
  c.text(x + size / 2, y + size + 18, name.length > 6 ? `${name.slice(0, 6)}…` : name, { size: 13, anchor: 'middle', weight: 600 });
  c.reg(name, x - 8, y - 4, size + 16, size + 28);
}

function header(c, title, { back = true, actions = [], y = 40 } = {}) {
  if (back) {
    c.add(`<polyline points="30,${y + 14} 20,${y + 24} 30,${y + 34}" fill="none" stroke="${C.ink}" stroke-width="2.6" stroke-linecap="round"/>`);
    c.reg('뒤로', 6, y, 40, 48);
  }
  c.text(back ? 52 : 22, y + 31, title, { size: 22, weight: 700 });
  let ax = 330;
  for (const a of [...actions].reverse()) {
    drawAction(c, ax, y + 24, a);
    c.reg(a, ax - 20, y, 40, 48);
    ax -= 42;
  }
}

function drawAction(c, x, y, a) {
  const s = `stroke="${C.ink}" stroke-width="2.4" fill="none" stroke-linecap="round"`;
  if (a === '옵션 더보기') c.add(`<g fill="${C.ink}"><circle cx="${x}" cy="${y - 8}" r="2.6"/><circle cx="${x}" cy="${y}" r="2.6"/><circle cx="${x}" cy="${y + 8}" r="2.6"/></g>`);
  else if (a === '검색') c.add(`<circle cx="${x - 3}" cy="${y - 3}" r="8" ${s}/><line x1="${x + 3}" y1="${y + 3}" x2="${x + 10}" y2="${y + 10}" ${s}/>`);
  else if (a === '추가') c.add(`<line x1="${x - 10}" y1="${y}" x2="${x + 10}" y2="${y}" ${s}/><line x1="${x}" y1="${y - 10}" x2="${x}" y2="${y + 10}" ${s}/>`);
  else if (a === '편집') c.add(`<path d="M${x - 9} ${y + 9} l3 -9 l12 -12 l6 6 l-12 12 z" ${s}/>`);
  else if (a === '공유') c.add(`<circle cx="${x + 7}" cy="${y - 8}" r="3.5" ${s}/><circle cx="${x - 7}" cy="${y}" r="3.5" ${s}/><circle cx="${x + 7}" cy="${y + 8}" r="3.5" ${s}/><line x1="${x - 4}" y1="${y - 2}" x2="${x + 4}" y2="${y - 6}" ${s}/><line x1="${x - 4}" y1="${y + 2}" x2="${x + 4}" y2="${y + 6}" ${s}/>`);
  else if (a === '메뉴') c.add(`<g ${s}><line x1="${x - 10}" y1="${y - 7}" x2="${x + 10}" y2="${y - 7}"/><line x1="${x - 10}" y1="${y}" x2="${x + 10}" y2="${y}"/><line x1="${x - 10}" y1="${y + 7}" x2="${x + 10}" y2="${y + 7}"/></g>`);
  else c.text(x, y + 6, a.slice(0, 2), { size: 14, anchor: 'middle', weight: 700 });
}

function toggle(c, x, y, on) {
  c.rect(x, y, 44, 24, on ? C.blue : '#BDC1C6', 12);
  c.add(`<circle cx="${on ? x + 32 : x + 12}" cy="${y + 12}" r="9" fill="#fff"/>`);
}

function wrapText(s, max) {
  const out = [];
  let line = '';
  for (const word of String(s).split(' ')) {
    if ((line + ' ' + word).trim().length > max && line) { out.push(line); line = word; } else line = (line + ' ' + word).trim();
  }
  if (line) out.push(line);
  return out;
}

/* ---------- 화면 종류별 그리기 ---------- */

const KINDS = {
  /** 휴대폰 앞면과 옆면 버튼 */
  side(c, s) {
    c.rect(0, 0, W, H, '#EEF1F5');
    c.rect(95, 60, 170, 520, '#2B2D31', 28);
    c.rect(103, 68, 154, 504, '#3B4F6B', 22);
    c.add('<circle cx="180" cy="88" r="5" fill="#111"/>');
    // 오른쪽 옆면 버튼(위에서부터 음량(상), 음량(하), 측면 버튼)
    const btn = (name, y, h) => { c.rect(265, y, 12, h, '#55585E', 4); c.reg(name, 262, y - 6, 60, h + 12); };
    btn('음량(상) 버튼', 170, 46);
    btn('음량(하) 버튼', 220, 46);
    btn('측면 버튼', 290, 58);
    c.reg('측면 버튼과 음량(하) 버튼', 258, 214, 66, 140);
    c.text(288, 196, '음량(상)', { size: 13, fill: C.sub, weight: 600 });
    c.text(288, 248, '음량(하)', { size: 13, fill: C.sub, weight: 600 });
    c.text(288, 324, '측면', { size: 13, fill: C.sub, weight: 600 });
    // 아래쪽 충전 연결잭
    c.rect(160, 576, 40, 8, '#111', 4);
    c.reg('충전 연결잭', 140, 568, 80, 40);
    if (s.cable) {
      c.rect(166, 588, 28, 30, '#E0E0E0', 4);
      c.rect(174, 618, 12, 22, '#BDBDBD', 3);
    }
    if (s.screenOff) c.rect(103, 68, 154, 504, '#0B0B0D', 22);
    if (s.caption) c.text(180, 40, s.caption, { size: 16, anchor: 'middle', weight: 700, fill: C.ink });
  },

  /** 홈 화면 또는 앱스 화면 */
  home(c, s) {
    c.rect(0, 0, W, H, s.apps ? '#1F2A44' : '#24406B');
    statusBar(c, { dark: true });
    c.reg('화면 위쪽', 0, 0, W, 60);
    if (!s.apps) {
      c.text(180, 110, '10:00', { size: 54, fill: '#fff', weight: 300, anchor: 'middle' });
      c.text(180, 140, '11월 25일 수요일', { size: 15, fill: '#E8EAED', anchor: 'middle' });
    } else {
      c.rect(24, 50, 312, 40, 'rgba(255,255,255,0.18)', 20);
      c.text(48, 76, '검색', { size: 15, fill: '#E8EAED' });
      c.reg('검색', 24, 50, 312, 40);
    }
    const grid = s.grid ?? (s.apps ? ['갤러리', '설정', '플레이 스토어', '캘린더', '시계', '연락처', '내 파일', '삼성 노트', '계산기', '날씨', '음성 녹음', '카카오톡'] : ['갤러리', '플레이 스토어', '설정', '카카오톡']);
    const list = [...grid];
    if (s.find && !list.includes(s.find) && !(s.dock ?? []).includes(s.find)) list[list.length - 1] = s.find;
    const startY = s.apps ? 120 : 330;
    list.forEach((name, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      appIcon(c, 26 + col * 82, startY + row * 100, name);
      // 앱 이름 글자색(어두운 배경)
    });
    c.add(''); // 자리 표시
    if (!s.apps) {
      const dock = s.dock ?? ['전화', '메시지', '인터넷', '카메라'];
      dock.forEach((name, i) => appIcon(c, 26 + i * 82, 500, name));
      c.reg('빈 공간', 20, 170, 320, 140);
    }
    navBar(c, { dark: true });
    c.reg('화면', 0, 40, W, 560);
  },

  /** 잠금화면 */
  lock(c) {
    c.rect(0, 0, W, H, '#2C3E66');
    statusBar(c, { dark: true });
    c.text(180, 170, '10:00', { size: 72, fill: '#fff', weight: 300, anchor: 'middle' });
    c.text(180, 205, '11월 25일 수요일', { size: 16, fill: '#E8EAED', anchor: 'middle' });
    c.add('<g fill="none" stroke="#fff" stroke-width="2.4"><circle cx="180" cy="520" r="22"/><path d="M170 520 q10 -14 20 0 M174 526 q6 -8 12 0"/></g>');
    c.reg('지문 인식 센서', 150, 490, 60, 60);
    c.add('<g fill="#fff" opacity="0.9"><circle cx="52" cy="588" r="18" fill="rgba(255,255,255,0.2)"/><circle cx="308" cy="588" r="18" fill="rgba(255,255,255,0.2)"/></g>');
    c.text(52, 594, '☎', { size: 16, fill: '#fff', anchor: 'middle' });
    c.text(308, 594, '◉', { size: 16, fill: '#fff', anchor: 'middle' });
    c.reg('화면', 0, 240, W, 230);
  },

  /** 꺼진 화면 */
  off(c, s) {
    c.rect(0, 0, W, H, '#0B0B0D');
    c.text(180, 320, s.message ?? '화면이 꺼져 있어요', { size: 18, fill: '#9AA0A6', anchor: 'middle' });
    c.reg('화면', 0, 0, W, H);
  },

  /** 목록 화면(설정 등). items: '이름' 또는 {t, s, sw, r, btn, v} */
  list(c, s) {
    c.rect(0, 0, W, H, C.bg);
    statusBar(c);
    header(c, s.title ?? '설정', { back: s.back !== false, actions: s.actions ?? [] });
    let y = 100;
    if (s.searchBar) {
      c.rect(16, y, 328, 44, '#ECEEF1', 22);
      c.text(44, y + 28, s.searchBar, { size: 15, fill: C.sub });
      c.reg('검색창', 16, y, 328, 44);
      y += 56;
    }
    if (s.top) {
      for (const line of wrapText(s.top, 24)) { c.text(22, y + 18, line, { size: 15, fill: C.sub }); y += 22; }
      y += 8;
    }
    const items = s.items ?? [];
    const rowH = s.rowH ?? 56;
    const bottomLimit = s.tabs ? 540 : 596;
    c.rect(12, y, 336, Math.min(items.length * rowH, bottomLimit - y) + 8, C.card, 18);
    y += 4;
    for (const raw of items) {
      if (y + rowH > bottomLimit) break;
      const it = typeof raw === 'string' ? { t: raw } : raw;
      const hasSub = Boolean(it.s);
      c.text(30, y + (hasSub ? 24 : 34), it.t, { size: 17, weight: 600, fill: it.off ? '#9AA0A6' : C.ink });
      if (hasSub) c.text(30, y + 45, it.s, { size: 13.5, fill: it.sBlue ? C.blue : C.sub });
      if (it.sw !== undefined) { toggle(c, 290, y + rowH / 2 - 12, it.sw); c.reg(`${it.t} 스위치`, 280, y + 4, 66, rowH - 8); }
      if (it.r !== undefined) {
        c.add(`<circle cx="318" cy="${y + rowH / 2}" r="10" fill="none" stroke="${it.r ? C.blue : '#9AA0A6'}" stroke-width="2.4"/>${it.r ? `<circle cx="318" cy="${y + rowH / 2}" r="5" fill="${C.blue}"/>` : ''}`);
      }
      if (it.v) c.text(334, y + 34, it.v, { size: 14, fill: C.blue, anchor: 'end', weight: 600 });
      if (it.btn) {
        const bw = Math.max(64, it.btn.length * 15 + 24);
        c.rect(334 - bw, y + rowH / 2 - 17, bw, 34, C.blue, 17);
        c.text(334 - bw / 2, y + rowH / 2 + 6, it.btn, { size: 14, fill: '#fff', weight: 700, anchor: 'middle' });
        c.reg(it.btn === it.t ? it.btn : `${it.t} ${it.btn}`, 334 - bw - 4, y + 2, bw + 8, rowH - 4);
      }
      if (it.slider !== undefined) {
        c.rect(30, y + rowH - 16, 290, 6, '#D0D4DA', 3);
        c.rect(30, y + rowH - 16, 290 * it.slider, 6, C.blue, 3);
        c.add(`<circle cx="${30 + 290 * it.slider}" cy="${y + rowH - 13}" r="10" fill="${C.blue}"/>`);
        c.reg(`${it.t} 막대`, 20, y + rowH - 34, 316, 40);
      }
      c.reg(it.t, 12, y, 336, rowH);
      if (it !== items[items.length - 1]) c.add(`<line x1="28" y1="${y + rowH}" x2="332" y2="${y + rowH}" stroke="${C.line}" stroke-width="1"/>`);
      y += rowH;
    }
    if (s.button) {
      c.rect(30, 520, 300, 52, C.blue, 26);
      c.text(180, 552, s.button, { size: 18, fill: '#fff', weight: 700, anchor: 'middle' });
      c.reg(s.button, 30, 516, 300, 60);
    }
    if (s.fab) {
      c.add(`<circle cx="306" cy="${s.tabs ? 500 : 548}" r="28" fill="${C.blue}"/>`);
      c.text(306, (s.tabs ? 500 : 548) + 10, '+', { size: 30, fill: '#fff', anchor: 'middle', weight: 400 });
      c.reg(s.fab, 274, (s.tabs ? 500 : 548) - 32, 64, 64);
    }
    if (s.tabs) tabs(c, s.tabs, s.tab);
    navBar(c);
  },

  /** 전원 메뉴·확인 창·아래에서 올라오는 메뉴 */
  dialog(c, s) {
    c.rect(0, 0, W, H, s.under === 'home' ? '#24406B' : C.bg);
    if (s.under === 'home') statusBar(c, { dark: true }); else statusBar(c);
    c.rect(0, 0, W, H, C.dim);
    const style = s.style ?? 'popup';
    if (style === 'power') {
      const btns = s.buttons ?? ['전원 끄기', '다시 시작', '긴급전화', '의료정보'];
      btns.forEach((b, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const cx = 110 + col * 140;
        const cy = 230 + row * 150;
        const big = s.confirm && b === s.confirm;
        const faded = s.confirm && !big;
        c.add(`<circle cx="${cx}" cy="${cy}" r="${big ? 50 : 40}" fill="${i === 0 ? '#E53935' : '#FFFFFF'}" opacity="${faded ? 0.25 : 1}"/>`);
        c.add(`<g stroke="${i === 0 ? '#fff' : C.ink}" stroke-width="3" fill="none" stroke-linecap="round" opacity="${faded ? 0.25 : 1}">${i === 0 ? `<path d="M${cx - 10} ${cy - 10} a14 14 0 1 0 20 0"/><line x1="${cx}" y1="${cy - 18}" x2="${cx}" y2="${cy - 2}"/>` : i === 1 ? `<path d="M${cx + 12} ${cy - 6} a14 14 0 1 0 2 10"/><polyline points="${cx + 6},${cy - 10} ${cx + 13},${cy - 7} ${cx + 15},${cy - 15}"/>` : i === 2 ? `<path d="M${cx - 12} ${cy - 10} h24 M${cx} ${cy - 16} v24"/>` : `<path d="M${cx - 10} ${cy} h20 M${cx} ${cy - 10} v20"/><circle cx="${cx}" cy="${cy}" r="16"/>`}</g>`);
        c.text(cx, cy + (big ? 78 : 66), b, { size: 17, fill: '#fff', weight: 700, anchor: 'middle' });
        if (!faded) c.reg(b, cx - 60, cy - 56, 120, 140);
      });
      if (s.confirm) c.text(180, 120, '한 번 더 누르면 꺼져요', { size: 18, fill: '#fff', weight: 700, anchor: 'middle' });
    } else if (style === 'sheet') {
      const opts = s.buttons ?? [];
      const top = 640 - 70 - opts.length * 58 - (s.title ? 50 : 0);
      c.rect(8, top, 344, 640 - top - 52, C.card, 24);
      let y = top + 16;
      if (s.title) { c.text(30, y + 26, s.title, { size: 19, weight: 700 }); y += 50; }
      for (const b of opts) {
        c.text(30, y + 36, b, { size: 17, weight: 600 });
        c.reg(b, 8, y, 344, 58);
        y += 58;
      }
      navBar(c);
    } else if (style === 'grid') {
      // 공유 창처럼 아이콘이 늘어선 메뉴
      const opts = s.buttons ?? [];
      const top = 300;
      c.rect(8, top, 344, 290, C.card, 24);
      if (s.title) c.text(30, top + 40, s.title, { size: 19, weight: 700 });
      opts.forEach((b, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        appIcon(c, 30 + col * 80, top + 70 + row * 100, b, 48);
      });
      navBar(c);
    } else {
      // 가운데 확인 창
      const lines = wrapText(s.message ?? '', 20);
      const h = 120 + lines.length * 24 + (s.title ? 30 : 0);
      const top = 320 - h / 2;
      c.rect(24, top, 312, h, C.card, 26);
      let y = top + 40;
      if (s.title) { c.text(48, y, s.title, { size: 20, weight: 700 }); y += 34; }
      for (const l of lines) { c.text(48, y, l, { size: 16, fill: C.sub }); y += 24; }
      const btns = s.buttons ?? ['취소', '확인'];
      const bw = 288 / btns.length;
      btns.forEach((b, i) => {
        c.text(36 + bw * i + bw / 2, top + h - 30, b, { size: 17, fill: C.blue, weight: 700, anchor: 'middle' });
        c.reg(b, 36 + bw * i, top + h - 64, bw, 56);
      });
    }
  },

  /** 전화 키패드 */
  keypad(c, s) {
    c.rect(0, 0, W, H, C.bg);
    statusBar(c);
    header(c, '', { back: false, actions: ['옵션 더보기'] });
    c.text(180, 150, s.number ?? '', { size: 32, anchor: 'middle', weight: 500 });
    if (s.number) c.reg('입력한 번호', 40, 110, 280, 56);
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
    keys.forEach((k, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 60 + col * 120;
      const y = 200 + row * 70;
      c.text(x, y + 10, k, { size: 30, anchor: 'middle', weight: 500 });
      c.reg(k, x - 50, y - 26, 100, 60);
    });
    c.add(`<circle cx="180" cy="490" r="30" fill="${C.green}"/><path d="M168 480 q2 -6 8 -4 l4 8 q-2 4 -5 5 q4 8 12 12 q1 -3 5 -5 l8 4 q2 6 -4 8 q-22 -4 -28 -28z" fill="#fff"/>`);
    c.reg('통화 버튼', 140, 456, 80, 70);
    if (s.number) { c.text(290, 498, '⌫', { size: 26, anchor: 'middle', fill: C.sub }); c.reg('지우기', 260, 466, 60, 56); }
    tabs(c, ['키패드', '최근기록', '연락처'], '키패드');
    navBar(c);
  },

  /** 전화가 올 때 */
  call(c, s) {
    c.rect(0, 0, W, H, '#20304F');
    statusBar(c, { dark: true });
    c.text(180, 170, s.name ?? '김영희', { size: 32, fill: '#fff', weight: 700, anchor: 'middle' });
    c.text(180, 205, s.number ?? '휴대전화 010-0000-0000', { size: 16, fill: '#C9D1E0', anchor: 'middle' });
    c.add(`<circle cx="80" cy="480" r="34" fill="${C.green}"/><circle cx="280" cy="480" r="34" fill="${C.red}"/>`);
    c.text(80, 490, '☎', { size: 28, fill: '#fff', anchor: 'middle' });
    c.text(280, 490, '☎', { size: 28, fill: '#fff', anchor: 'middle' });
    c.text(80, 540, '받기', { size: 16, fill: '#fff', weight: 700, anchor: 'middle' });
    c.text(280, 540, '거절', { size: 16, fill: '#fff', weight: 700, anchor: 'middle' });
    c.reg('수신 아이콘', 36, 436, 88, 120);
    c.reg('거절 아이콘', 236, 436, 88, 120);
    c.text(180, 590, '⌃ 메시지 보내기', { size: 15, fill: '#C9D1E0', anchor: 'middle' });
    c.reg('메시지 보내기', 110, 566, 140, 36);
  },

  /** 통화 중 화면 */
  incall(c, s) {
    c.rect(0, 0, W, H, '#F1F3F7');
    statusBar(c);
    c.text(180, 130, s.name ?? '김영희', { size: 30, weight: 700, anchor: 'middle' });
    c.text(180, 162, '00:12', { size: 16, fill: C.sub, anchor: 'middle' });
    const btns = s.buttons ?? ['녹음', '영상통화', '블루투스', '스피커', '음소거', '키패드'];
    btns.forEach((b, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = 70 + col * 110;
      const cy = 280 + row * 110;
      c.add(`<circle cx="${cx}" cy="${cy}" r="30" fill="#FFFFFF" stroke="${C.line}"/>`);
      c.text(cx, cy + 6, b.slice(0, 2), { size: 15, anchor: 'middle', weight: 700, fill: C.sub });
      c.text(cx, cy + 54, b, { size: 15, anchor: 'middle', weight: 600 });
      c.reg(b, cx - 50, cy - 36, 100, 104);
    });
    c.add(`<circle cx="180" cy="520" r="32" fill="${C.red}"/>`);
    c.text(180, 528, '☎', { size: 24, fill: '#fff', anchor: 'middle' });
    c.reg('통화 종료', 140, 484, 80, 74);
    navBar(c);
  },

  /** 알림창(mode: 'noti') 또는 빠른 설정창(mode: 'quick') */
  shade(c, s) {
    c.rect(0, 0, W, H, '#1E2533');
    statusBar(c, { dark: true });
    if (s.mode === 'quick') {
      c.add(`<g fill="none" stroke="#fff" stroke-width="2.2"><path d="M246 52 a10 10 0 1 0 12 0"/><line x1="252" y1="44" x2="252" y2="54"/></g>`);
      c.reg('전원 끄기 아이콘', 230, 36, 44, 40);
      c.add('<circle cx="296" cy="56" r="10" fill="none" stroke="#fff" stroke-width="2.2"/><circle cx="296" cy="56" r="3.5" fill="#fff"/>');
      c.reg('설정 아이콘', 274, 36, 44, 40);
      c.text(332, 62, '✎', { size: 18, fill: '#fff', anchor: 'middle' });
      c.reg('편집 아이콘', 314, 36, 40, 40);
      const tiles = s.tiles ?? ['Wi-Fi', '소리', '블루투스', '화면 회전', '비행기 탑승 모드', '손전등', '방해 금지', '모바일 데이터', '위치', '스마트 뷰', '절전 모드', '화면 녹화'];
      tiles.forEach((t, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = 18 + col * 82;
        const y = 92 + row * 104;
        const on = (s.on ?? ['Wi-Fi', '소리', '모바일 데이터']).includes(t);
        c.add(`<circle cx="${x + 32}" cy="${y + 30}" r="28" fill="${on ? '#4C8DF6' : '#3A4253'}"/>`);
        c.text(x + 32, y + 36, t.slice(0, 2), { size: 15, fill: '#fff', weight: 700, anchor: 'middle' });
        const label = t.length > 6 ? `${t.slice(0, 6)}…` : t;
        c.text(x + 32, y + 80, label, { size: 13, fill: '#E8EAED', anchor: 'middle', weight: 600 });
        c.reg(t, x - 4, y - 4, 76, 100);
      });
      const by = 92 + Math.ceil(tiles.length / 4) * 104 + 6;
      c.rect(24, by, 312, 40, '#3A4253', 20);
      c.rect(24, by, 190, 40, '#8AB4F8', 20);
      c.text(44, by + 26, '밝기', { size: 15, fill: '#0B1F44', weight: 700 });
      c.reg('밝기 막대', 20, by - 6, 320, 52);
    } else {
      c.text(24, 70, '알림', { size: 20, fill: '#fff', weight: 700 });
      const notes = s.notes ?? [
        { app: '메시지', t: '김영희', s: '저녁 같이 먹어요' },
        { app: '전화', t: '부재중 전화', s: '010-0000-0000' },
        { app: '카카오톡', t: '가족방', s: '사진을 보냈습니다.' },
      ];
      let y = 92;
      for (const n of notes) {
        c.rect(14, y, 332, 76, '#2E3646', 18);
        c.text(30, y + 28, `${n.app} · ${n.t}`, { size: 15, fill: '#C9D1E0', weight: 600 });
        c.text(30, y + 54, n.s, { size: 16, fill: '#fff', weight: 600 });
        c.reg(n.t, 14, y, 332, 76);
        c.reg(n.app, 14, y, 332, 76);
        y += 86;
      }
      c.text(60, y + 30, '알림 설정', { size: 15, fill: '#C9D1E0', weight: 700, anchor: 'middle' });
      c.reg('알림 설정', 14, y + 6, 100, 40);
      c.rect(252, y + 8, 92, 36, '#3A4253', 18);
      c.text(298, y + 31, '모두 삭제', { size: 15, fill: '#fff', weight: 700, anchor: 'middle' });
      c.reg('모두 삭제', 248, y + 2, 100, 48);
    }
    navBar(c, { dark: true });
  },

  /** 카메라 촬영 화면 */
  camera(c, s) {
    c.rect(0, 0, W, H, '#000');
    c.rect(0, 56, W, 420, s.front ? '#5B6E7F' : '#6F8A62');
    // 피사체
    c.add(s.front
      ? '<circle cx="180" cy="230" r="58" fill="#E9C4A8"/><rect x="110" y="300" width="140" height="140" rx="60" fill="#3F51B5"/>'
      : '<rect x="120" y="190" width="120" height="150" rx="12" fill="#F2E3B3"/><circle cx="180" cy="160" r="30" fill="#E57373"/>');
    c.reg('찍을 대상', 60, 100, 240, 300);
    if (s.focus) c.add('<circle cx="180" cy="250" r="44" fill="none" stroke="#FFD54F" stroke-width="3"/>');
    // 위쪽 옵션
    const opts = s.top ?? ['플래시', '타이머', '퀵 컨트롤'];
    opts.forEach((o, i) => {
      const x = 60 + i * 120;
      c.add(`<circle cx="${x}" cy="30" r="17" fill="rgba(255,255,255,0.15)"/>`);
      c.text(x, 36, o === '퀵 컨트롤' ? '⌄' : o.slice(0, 2), { size: 13, fill: '#fff', anchor: 'middle', weight: 700 });
      c.reg(o, x - 30, 8, 60, 46);
    });
    if (s.timer) c.text(180, 300, s.timer, { size: 64, fill: '#fff', weight: 700, anchor: 'middle' });
    // 줌
    if (!s.front) {
      ['0.6', '1x', '3'].forEach((z, i) => {
        const x = 130 + i * 50;
        c.add(`<circle cx="${x}" cy="446" r="18" fill="rgba(0,0,0,0.55)"/>`);
        c.text(x, 451, z, { size: 13, fill: z === (s.zoom ?? '1x') ? '#FFD54F' : '#fff', weight: 700, anchor: 'middle' });
        c.reg(`줌 ${z}`, x - 22, 424, 44, 44);
      });
    }
    // 촬영 모드
    const modes = s.modes ?? ['더보기', '인물 사진', '사진', '동영상', '프로'];
    const cur = s.mode ?? '사진';
    modes.forEach((m, i) => {
      const x = 36 + i * 72;
      c.text(x, 508, m, { size: 14, fill: m === cur ? '#FFD54F' : '#fff', weight: m === cur ? 800 : 600, anchor: 'middle' });
      c.reg(m, x - 36, 486, 72, 36);
    });
    // 셔터·전환·미리보기
    const rec = cur === '동영상';
    c.add(`<circle cx="180" cy="570" r="34" fill="#fff"/><circle cx="180" cy="570" r="27" fill="${rec ? '#E53935' : '#fff'}" stroke="#000" stroke-width="2"/>`);
    if (s.recording) c.rect(168, 558, 24, 24, '#E53935', 4);
    c.reg(rec ? (s.recording ? '녹화 중지' : '녹화 시작') : '촬영 버튼', 140, 530, 80, 80);
    c.rect(52, 548, 44, 44, '#555', 12);
    c.reg('미리보기 사진', 44, 540, 60, 60);
    c.add('<circle cx="292" cy="570" r="24" fill="rgba(255,255,255,0.2)"/><path d="M280 566 a12 12 0 0 1 22 -4 M304 574 a12 12 0 0 1 -22 4" fill="none" stroke="#fff" stroke-width="2.4"/>');
    c.reg('카메라 전환', 262, 540, 60, 60);
  },

  /** 갤러리 (view: 'grid' 또는 'photo') */
  gallery(c, s) {
    c.rect(0, 0, W, H, s.view === 'photo' ? '#000' : C.bg);
    statusBar(c, { dark: s.view === 'photo' });
    if (s.view === 'photo') {
      c.rect(0, 140, W, 300, '#7E9C73');
      c.add('<circle cx="180" cy="270" r="50" fill="#F1D9A6"/>');
      c.reg('사진', 0, 140, W, 300);
      header(c, '', { back: true, actions: ['옵션 더보기'] });
      const bar = s.bar ?? ['즐겨찾기', '편집', '공유', '삭제'];
      bar.forEach((b, i) => {
        const x = 54 + i * 84;
        c.text(x, 568, b, { size: 14, fill: '#fff', anchor: 'middle', weight: 600 });
        c.add(`<circle cx="${x}" cy="538" r="16" fill="rgba(255,255,255,0.18)"/>`);
        c.reg(b, x - 40, 512, 80, 70);
      });
      if (s.assist) { c.add('<circle cx="320" cy="480" r="22" fill="#4C8DF6"/>'); c.text(320, 486, 'AI', { size: 14, fill: '#fff', anchor: 'middle', weight: 800 }); c.reg('어시스트 아이콘', 294, 454, 52, 52); }
      navBar(c, { dark: true });
      return;
    }
    header(c, s.title ?? '사진', { back: Boolean(s.title), actions: ['검색', '옵션 더보기'] });
    const colors = ['#90A4AE', '#A1887F', '#81C784', '#64B5F6', '#FFB74D', '#BA68C8', '#4DB6AC', '#F06292', '#AED581'];
    for (let i = 0; i < 9; i += 1) {
      const x = 10 + (i % 3) * 114;
      const y = 100 + Math.floor(i / 3) * 114;
      c.rect(x, y, 110, 110, colors[i], 6);
      if (s.selected?.includes(i)) c.add(`<circle cx="${x + 20}" cy="${y + 20}" r="11" fill="${C.blue}" stroke="#fff" stroke-width="2"/>`);
      c.reg(i === 0 ? '첫 번째 사진' : `사진 ${i + 1}`, x, y, 110, 110);
    }
    if (s.sheet) {
      const opts = s.sheet;
      opts.forEach((o, i) => {
        const x = 40 + i * (280 / Math.max(1, opts.length - 1 || 1));
        c.text(x, 560, o, { size: 14, anchor: 'middle', weight: 700 });
        c.reg(o, x - 40, 530, 80, 50);
      });
    }
    tabs(c, s.tabs ?? ['사진', '앨범', '스토리', '메뉴'], s.tab ?? '사진');
    navBar(c);
  },

  /** 대화 화면(메시지·카카오톡) */
  chat(c, s) {
    const kakao = s.app === '카카오톡';
    c.rect(0, 0, W, H, kakao ? '#BACEE0' : C.bg);
    statusBar(c);
    header(c, s.title ?? '김영희', { back: true, actions: s.actions ?? (kakao ? ['검색', '메뉴'] : ['옵션 더보기']) });
    let y = 110;
    for (const b of s.bubbles ?? [{ from: 'you', text: '잘 지내시죠?' }]) {
      const me = b.from === 'me';
      const lines = wrapText(b.text, 14);
      const w = Math.max(...lines.map((l) => l.length)) * 16 + 28;
      const h = lines.length * 22 + 18;
      const x = me ? 340 - w : 20;
      c.rect(x, y, w, h, me ? (kakao ? '#FEE500' : C.blue) : '#FFFFFF', 16);
      lines.forEach((l, i) => c.text(x + 14, y + 26 + i * 22, l, { size: 16, fill: me && !kakao ? '#fff' : C.ink, weight: 500 }));
      c.reg(b.text, x, y, w, h);
      y += h + 14;
    }
    // 입력줄
    c.rect(0, 540, W, 60, '#FFFFFF');
    c.add(`<circle cx="30" cy="570" r="16" fill="none" stroke="${C.sub}" stroke-width="2.4"/><path d="M22 570 h16 M30 562 v16" stroke="${C.sub}" stroke-width="2.4"/>`);
    c.reg(s.plusName ?? '추가 아이콘', 6, 544, 48, 52);
    c.rect(56, 550, 230, 40, '#F1F3F4', 20);
    c.text(72, 576, s.typed ?? '메시지 입력', { size: 15, fill: s.typed ? C.ink : '#80868B' });
    c.reg('입력창', 56, 546, 230, 48);
    c.add(`<circle cx="320" cy="570" r="20" fill="${s.typed ? (kakao ? '#FEE500' : C.blue) : '#E0E0E0'}"/>`);
    c.text(320, 576, s.typed ? '↑' : '🎤', { size: 16, fill: s.typed && !kakao ? '#fff' : C.ink, anchor: 'middle', weight: 800 });
    c.reg(s.typed ? '전송 아이콘' : '음성 메시지 아이콘', 296, 546, 52, 52);
    if (s.attach) {
      c.rect(0, 380, W, 160, '#FFFFFF');
      s.attach.forEach((a, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = 48 + col * 88;
        const yy = 410 + row * 70;
        c.add(`<circle cx="${x}" cy="${yy}" r="22" fill="#ECEFF4"/>`);
        c.text(x, yy + 5, a.slice(0, 2), { size: 13, anchor: 'middle', weight: 700, fill: C.sub });
        c.text(x, yy + 42, a, { size: 13, anchor: 'middle', weight: 600 });
        c.reg(a, x - 40, yy - 26, 80, 76);
      });
    }
    navBar(c);
  },

  /** 글자판(삼성 키보드) */
  keyboard(c, s) {
    c.rect(0, 0, W, H, C.bg);
    statusBar(c);
    header(c, s.title ?? '새 메시지', { back: true });
    c.rect(16, 110, 328, s.field ? 120 : 60, '#FFFFFF', 14);
    const text = s.text ?? '';
    wrapText(text, 18).forEach((l, i) => c.text(30, 146 + i * 26, l, { size: 18, weight: 500 }));
    if (s.selected) c.rect(28, 128, Math.min(300, s.selected.length * 18), 26, 'rgba(26,95,208,0.25)', 4);
    c.reg('입력창', 16, 110, 328, 60);
    if (s.popup) {
      const opts = s.popup;
      const bw = 300 / opts.length;
      c.rect(30, 70, 300, 40, '#303134', 10);
      opts.forEach((o, i) => { c.text(30 + bw * i + bw / 2, 96, o, { size: 15, fill: '#fff', anchor: 'middle', weight: 700 }); c.reg(o, 30 + bw * i, 66, bw, 48); });
    }
    // 글자판
    const top = 370;
    c.rect(0, top, W, 230, '#E8EAED');
    const tools = ['어시스트', '이모티콘', '음성 입력', '설정'];
    tools.forEach((t, i) => {
      const x = 40 + i * 90;
      c.text(x, top + 26, t === '음성 입력' ? '🎤' : t === '설정' ? '⚙' : t === '이모티콘' ? '☺' : 'AI', { size: 18, anchor: 'middle', fill: C.sub, weight: 700 });
      c.reg(t === '음성 입력' ? '음성 입력 아이콘' : t === '어시스트' ? '어시스트 아이콘' : t, x - 30, top + 2, 60, 38);
    });
    const rows = s.symbols ? [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['+', '×', '÷', '=', '/', '_', '<', '>', '[', ']'], ['!', '@', '#', '₩', '%', '^', '&', '*', '(', ')']]
      : s.english ? [['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'], ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], ['z', 'x', 'c', 'v', 'b', 'n', 'm']]
        : [['ㅂ', 'ㅈ', 'ㄷ', 'ㄱ', 'ㅅ', 'ㅛ', 'ㅕ', 'ㅑ', 'ㅐ', 'ㅔ'], ['ㅁ', 'ㄴ', 'ㅇ', 'ㄹ', 'ㅎ', 'ㅗ', 'ㅓ', 'ㅏ', 'ㅣ'], ['ㅋ', 'ㅌ', 'ㅊ', 'ㅍ', 'ㅠ', 'ㅜ', 'ㅡ']];
    rows.forEach((row, r) => {
      const kw = 34;
      const offset = (W - row.length * (kw + 2)) / 2;
      row.forEach((k, i) => {
        const x = offset + i * (kw + 2);
        const y = top + 46 + r * 44;
        c.rect(x, y, kw, 38, '#FFFFFF', 6);
        c.text(x + kw / 2, y + 26, k, { size: 17, anchor: 'middle', weight: 600 });
        c.reg(`${k} 자판`, x, y, kw, 38);
      });
    });
    const y4 = top + 46 + 3 * 44;
    c.rect(4, top + 46 + 2 * 44, 44, 38, '#C9CDD2', 6); c.text(26, top + 46 + 2 * 44 + 26, '⇧', { size: 17, anchor: 'middle' });
    c.rect(312, top + 46 + 2 * 44, 44, 38, '#C9CDD2', 6); c.text(334, top + 46 + 2 * 44 + 26, '⌫', { size: 17, anchor: 'middle' });
    c.reg('지우기 자판', 308, top + 42 + 2 * 44, 52, 46);
    const bottom = [['!#1', 60, '기호 자판'], ['한/영', 60, '한/영 자판'], ['', 140, '스페이스 바'], ['.', 36, '마침표 자판'], ['↵', 56, '줄 바꿈 자판']];
    let bx = 4;
    for (const [label, w, name] of bottom) {
      c.rect(bx, y4, w, 38, name === '스페이스 바' ? '#FFFFFF' : '#C9CDD2', 6);
      c.text(bx + w / 2, y4 + 25, label, { size: 15, anchor: 'middle', weight: 700 });
      c.reg(name, bx, y4, w, 38);
      bx += w + 4;
    }
    if (s.listening) {
      c.rect(0, top, W, 230, '#FFFFFF');
      c.add(`<circle cx="180" cy="${top + 100}" r="40" fill="${C.blue}"/>`);
      c.text(180, top + 112, '🎤', { size: 30, anchor: 'middle' });
      c.text(180, top + 180, '말씀하세요', { size: 18, anchor: 'middle', weight: 700 });
      c.reg('마이크', 130, top + 50, 100, 100);
    }
    navBar(c);
  },

  /** 인터넷(브라우저) 화면 */
  browser(c, s) {
    c.rect(0, 0, W, H, '#FFFFFF');
    statusBar(c);
    c.rect(12, 42, 336, 44, '#F1F3F4', 22);
    c.text(30, 70, s.url ?? '검색어 또는 URL 입력', { size: 15, fill: s.url ? C.ink : '#80868B' });
    c.reg('주소창', 12, 42, 290, 44);
    c.text(326, 71, '☆', { size: 20, anchor: 'middle', fill: C.sub });
    c.reg('북마크 추가 아이콘', 304, 42, 44, 44);
    if (s.results) {
      let y = 120;
      for (const r of s.results) {
        c.text(20, y, r, { size: 17, fill: C.blue, weight: 700 });
        c.rect(20, y + 12, 300, 10, '#ECEFF1', 4);
        c.rect(20, y + 28, 240, 10, '#ECEFF1', 4);
        c.reg(r, 12, y - 24, 336, 70);
        y += 80;
      }
    } else {
      c.text(180, 250, s.page ?? '오늘의 소식', { size: 24, anchor: 'middle', weight: 700 });
      for (let i = 0; i < 5; i += 1) c.rect(30, 290 + i * 28, 300 - (i % 2) * 60, 12, '#ECEFF1', 4);
    }
    const bar = ['뒤로', '앞으로', '홈', '북마크', '탭', '메뉴'];
    bar.forEach((b, i) => {
      const x = 30 + i * 60;
      c.text(x, 584, b === '메뉴' ? '≡' : b === '탭' ? '▢' : b === '북마크' ? '☆' : b === '홈' ? '⌂' : b === '뒤로' ? '‹' : '›', { size: 22, anchor: 'middle', fill: C.sub });
      c.reg(b === '북마크' ? '북마크 목록' : b, x - 28, 560, 56, 40);
    });
    navBar(c);
  },

  /** 지도 */
  map(c, s) {
    c.rect(0, 0, W, H, '#E8F0E3');
    c.add('<g stroke="#FFFFFF" stroke-width="14"><line x1="0" y1="260" x2="360" y2="220"/><line x1="120" y1="0" x2="160" y2="640"/><line x1="0" y1="430" x2="360" y2="470"/></g>');
    statusBar(c);
    c.rect(14, 44, 332, 48, '#FFFFFF', 24);
    c.text(40, 74, s.query ?? '여기서 검색', { size: 16, fill: s.query ? C.ink : '#80868B' });
    c.reg('검색창', 14, 44, 332, 48);
    if (s.pin) {
      c.add('<path d="M200 300 q-24 -40 0 -56 q24 16 0 56z" fill="#E53935"/><circle cx="200" cy="268" r="7" fill="#fff"/>');
      c.reg('장소 표시', 170, 230, 60, 80);
      c.rect(14, 470, 332, 120, '#FFFFFF', 20);
      c.text(32, 506, s.pin, { size: 19, weight: 700 });
      c.rect(32, 530, 90, 40, C.blue, 20); c.text(77, 556, '경로', { size: 16, fill: '#fff', weight: 700, anchor: 'middle' });
      c.reg('경로', 28, 526, 98, 48);
      c.rect(132, 530, 90, 40, '#E8F0FE', 20); c.text(177, 556, '공유', { size: 16, fill: C.blue, weight: 700, anchor: 'middle' });
      c.reg('공유', 128, 526, 98, 48);
    }
    navBar(c);
  },

  /** 최근 앱 화면 */
  recent(c, s) {
    c.rect(0, 0, W, H, '#2A2F3A');
    statusBar(c, { dark: true });
    const apps = s.apps ?? ['인터넷', '메시지'];
    apps.slice(0, 2).forEach((a, i) => {
      const x = 40 + i * 170;
      c.rect(x, 140, 150, 330, '#F5F5F5', 18);
      appIcon(c, x + 47, 90, a, 40);
      c.reg(`${a} 아이콘`, x + 37, 80, 60, 56);
      c.reg(`${a} 화면`, x, 140, 150, 330);
    });
    c.rect(120, 520, 120, 40, 'rgba(255,255,255,0.2)', 20);
    c.text(180, 546, '모두 닫기', { size: 15, fill: '#fff', weight: 700, anchor: 'middle' });
    c.reg('모두 닫기', 116, 514, 128, 52);
    navBar(c, { dark: true });
  },

  /** 앱 안 화면(일반): 제목, 큰 버튼 여러 개 */
  app(c, s) {
    c.rect(0, 0, W, H, s.bg ?? C.bg);
    statusBar(c);
    header(c, s.title ?? '', { back: s.back !== false, actions: s.actions ?? [] });
    let y = 110;
    if (s.hero) {
      c.rect(20, y, 320, 150, s.heroColor ?? '#3F5BA9', 20);
      wrapText(s.hero, 16).forEach((l, i) => c.text(40, y + 50 + i * 28, l, { size: 20, fill: '#fff', weight: 700 }));
      c.reg(s.heroName ?? s.hero, 20, y, 320, 150);
      y += 170;
    }
    for (const line of s.lines ?? []) {
      wrapText(line, 22).forEach((l) => { c.text(24, y + 20, l, { size: 16, fill: C.sub }); y += 26; });
      y += 6;
    }
    for (const b of s.buttons ?? []) {
      c.rect(24, y + 8, 312, 52, b === s.primary ? C.blue : '#FFFFFF', 26, `stroke="${C.line}"`);
      c.text(180, y + 41, b, { size: 17, fill: b === s.primary ? '#fff' : C.ink, weight: 700, anchor: 'middle' });
      c.reg(b, 24, y + 4, 312, 60);
      y += 68;
    }
    if (s.fab) {
      c.add(`<circle cx="306" cy="${s.tabs ? 500 : 548}" r="28" fill="${C.blue}"/>`);
      c.text(306, (s.tabs ? 500 : 548) + 10, '+', { size: 30, fill: '#fff', anchor: 'middle' });
      c.reg(s.fab, 274, (s.tabs ? 500 : 548) - 32, 64, 64);
    }
    if (s.tabs) tabs(c, s.tabs, s.tab);
    navBar(c);
  },

  /** 손동작 설명(밀기·확대 등) */
  gesture(c, s) {
    const base = s.on ?? 'page';
    if (base === 'home') KINDS.home(c, {});
    else if (base === 'lock') KINDS.lock(c, {});
    else {
      c.rect(0, 0, W, H, '#FFFFFF');
      statusBar(c);
      c.text(24, 80, s.title ?? '사진 보기', { size: 22, weight: 700 });
      c.rect(20, 110, 320, 220, '#9CCC65', 16);
      c.add('<circle cx="180" cy="220" r="46" fill="#FFF59D"/>');
      for (let i = 0; i < 6; i += 1) c.rect(24, 350 + i * 30, 300 - (i % 3) * 50, 12, '#ECEFF1', 4);
      navBar(c);
    }
    c.reg('화면', 0, 40, W, 560);
  },

  /** 설명 그림(실제 휴대폰에서 할 일) */
  info(c, s) {
    c.rect(0, 0, W, H, '#FFF8E7');
    c.add(`<circle cx="180" cy="200" r="86" fill="${s.color ?? '#1A5FD0'}" opacity="0.12"/>`);
    c.text(180, 228, s.icon ?? '!', { size: 76, anchor: 'middle', weight: 800, fill: s.color ?? '#1A5FD0' });
    let y = 340;
    for (const line of s.lines ?? []) {
      wrapText(line, 17).forEach((l) => { c.text(180, y, l, { size: 19, anchor: 'middle', weight: 600 }); y += 30; });
      y += 10;
    }
    c.reg('그림', 0, 0, W, H);
  },
};

function tabs(c, names, current) {
  c.rect(0, 548, W, 52, '#FFFFFF');
  const w = W / names.length;
  names.forEach((n, i) => {
    const on = n === current;
    c.text(w * i + w / 2, 580, n, { size: 15, anchor: 'middle', weight: on ? 800 : 600, fill: on ? C.ink : C.sub });
    if (on) c.rect(w * i + w / 2 - 18, 590, 36, 3, C.ink, 2);
    c.reg(n, w * i, 548, w, 52);
  });
}

/** 손동작 화살표 */
function gestureMark(action, t) {
  const cx = t ? t.x + t.w / 2 : 180;
  const cy = t ? t.y + t.h / 2 : 320;
  const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#D7263D" stroke-width="7" stroke-linecap="round" marker-end="url(#arrowhead)"/>`;
  switch (action) {
    case 'swipe-up': return arrow(cx, cy + 90, cx, cy - 90);
    case 'swipe-down': return arrow(cx, cy - 90, cx, cy + 90);
    case 'swipe-left': return arrow(cx + 100, cy, cx - 100, cy);
    case 'swipe-right': return arrow(cx - 100, cy, cx + 100, cy);
    case 'pinch-out': return arrow(cx - 20, cy + 20, cx - 90, cy + 90) + arrow(cx + 20, cy - 20, cx + 90, cy - 90);
    case 'pinch-in': return arrow(cx - 90, cy + 90, cx - 24, cy + 24) + arrow(cx + 90, cy - 90, cx + 24, cy - 24);
    default: return '';
  }
}

/**
 * 화면 그리기
 * @param {object} screen card.screen
 * @param {string} [target] 누를 곳 이름
 * @param {string} [action] 'tap' | 'hold' | 'swipe-up' | ...
 */
export function renderScreen(screen = { kind: 'info' }, target, action) {
  const kind = KINDS[screen.kind] ? screen.kind : 'info';
  const c = canvas();
  KINDS[kind](c, screen);
  const { body, targets } = c.out();
  const t = target ? targets[target] : null;
  let mark = '';
  if (t) {
    mark += `<rect class="target-ring" x="${t.x + 2}" y="${t.y + 2}" width="${t.w - 4}" height="${t.h - 4}" rx="12" fill="none" stroke="#D7263D" stroke-width="5"/>`;
    // ‘여기’ 표시: 대상 위나 아래에 말풍선
    const above = t.y > 90;
    const by = above ? t.y - 44 : t.y + t.h + 8;
    const bx = Math.min(Math.max(t.x + t.w / 2 - 34, 6), W - 74);
    mark += `<g class="target-tag"><rect x="${bx}" y="${by}" width="68" height="34" rx="17" fill="#D7263D"/><text x="${bx + 34}" y="${by + 23}" font-size="17" font-weight="800" fill="#fff" text-anchor="middle">${action === 'hold' ? '길게' : '여기'}</text>`
      + `<path d="M${bx + 26} ${above ? by + 34 : by} l8 ${above ? 9 : -9} l8 ${above ? -9 : 9}z" fill="#D7263D"/></g>`;
  }
  if (action && action.startsWith('swipe') || action?.startsWith('pinch')) mark += gestureMark(action, t);
  const defs = '<defs><marker id="arrowhead" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#D7263D"/></marker></defs>';
  const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true" font-family="Pretendard Variable, Pretendard, Noto Sans KR, sans-serif">${defs}${body}${mark}</svg>`;
  return { svg, width: W, height: H, targets, target: t };
}

export const SCREEN_KINDS = Object.keys(KINDS);
