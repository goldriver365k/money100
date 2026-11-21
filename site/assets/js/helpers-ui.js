/**
 * 입력 도우미('자동 계산') 공통 화면 코드. 생성 계산기(calc-page.js)와 기존 월급 일할계산기가 함께 쓴다.
 * 패널: <div class="pay-helper" data-helper="종류" data-target="채울 입력 name"> (scripts/gen-calculators.js 가 만든다)
 * 계산은 calc/*.js 의 도우미 함수가 하고, 이 파일은 입력 수집·미리보기·오류·채우기만 한다.
 * 채운 뒤 대상 입력에 input 이벤트를 보내 각 페이지의 미리보기·오류 해제가 직접 입력한 것처럼 동작하게 한다.
 */
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, text) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};

function fill(input, value) {
  if (!input) return;
  input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const err = $(`${input.id}-error`);
  if (err) { err.hidden = true; err.textContent = ''; }
  input.removeAttribute('aria-invalid');
}

/** 종류별: raw(패널 입력 수집) → compute → 채우기. errMap 은 계산 오류 키 → 오류 문구를 띄울 요소 id 접두 */
async function definition(panel, form) {
  const t = panel.dataset.target;
  const v = (name) => form.elements[name]?.value ?? '';
  const r = (name) => form.querySelector(`input[name="${name}"]:checked`)?.value;
  const p = (s) => `${t}__${s}`;
  switch (panel.dataset.helper) {
    case 'monthlyPay': {
      const { computeMonthlyPay } = await import('./calc/monthly-pay-helper.js');
      const mode = () => r('mpMode') ?? 'annual';
      return {
        groups: () => mode(),
        raw: () => (mode() === 'parts'
          ? { mode: 'parts', base: v('mpBase'), allowance: v('mpAllowance'), nonTaxable: v('mpNonTaxableP') }
          : { mode: 'annual', annual: v('mpAnnual'), includedBonus: v('mpIncludedBonus'), includedBonusPaid: r('mpIncludedBonusPaid'), extraBonus: v('mpExtraBonus'), extraBonusInAverage: r('mpExtraBonusInAverage'), nonTaxable: v('mpNonTaxableA'), nonTaxableIn: r('mpNonTaxableIn') }),
        compute: computeMonthlyPay,
        errId: (k) => ({ annual: 'mpAnnual', includedBonus: 'mpIncludedBonus', extraBonus: 'mpExtraBonus', base: 'mpBase', allowance: 'mpAllowance', nonTaxable: mode() === 'parts' ? 'mpNonTaxableP' : 'mpNonTaxableA' })[k],
        apply: (res) => {
          const nt = panel.dataset.nontaxable ? form.elements[panel.dataset.nontaxable] : null;
          if (nt) { fill(form.elements[t], res.pay); fill(nt, res.nonTaxable); return `세전 월급 ${res.pay.toLocaleString('ko-KR')}원, 비과세 ${res.nonTaxable.toLocaleString('ko-KR')}원을 입력했습니다.`; }
          const val = panel.dataset.fill === 'taxable' ? res.taxable : res.pay;
          fill(form.elements[t], val);
          return `${val.toLocaleString('ko-KR')}원을 입력했습니다.`;
        },
      };
    }
    case 'ordinaryHourly':
    case 'ordinary': {
      const { computeOrdinary } = await import('./calc/wage-helpers.js');
      const legacy = panel.dataset.helper === 'ordinaryHourly';
      const output = legacy ? 'hourly' : panel.dataset.output;
      const name = (s) => (legacy ? `oh${s[0].toUpperCase()}${s.slice(1)}` : p(s));
      const hoursField = panel.dataset.hours;
      return {
        raw: () => ({ output, base: v(name('base')), fixed: v(name('fixed')), bonus: v(name('bonus')), weeklyHours: hoursField ? v(hoursField) : v(p('weekly')), dailyHours: v(p('daily')) }),
        compute: computeOrdinary,
        errId: (k) => ({ base: name('base'), fixed: name('fixed'), bonus: name('bonus'), weeklyHours: legacy ? 'ohWeekly' : (hoursField ? p('weeklyNote') : p('weekly')), dailyHours: p('daily') })[k],
        errText: (k, msg) => (k === 'weeklyHours' && hoursField ? `위의 ${msg}` : msg),
        watch: hoursField ? [form.elements[hoursField]] : [],
        apply: (res) => { fill(form.elements[t], res.value); return `${res.value.toLocaleString('ko-KR')}원을 입력했습니다.`; },
      };
    }
    case 'wages3m': {
      const { computeWages3m } = await import('./calc/wage-helpers.js');
      const mode = () => r(p('mode')) ?? 'same';
      return {
        groups: () => mode(),
        raw: () => ({ mode: mode(), monthly: v(p('monthly')), m1: v(p('m1')), m2: v(p('m2')), m3: v(p('m3')) }),
        compute: computeWages3m,
        errId: (k) => p(k),
        apply: (res) => { fill(form.elements[t], res.value); return `3개월 임금총액 ${res.value.toLocaleString('ko-KR')}원을 입력했습니다.`; },
      };
    }
    case 'insurance': {
      const { computeAnnualInsurance } = await import('./calc/wage-helpers.js');
      const src = form.elements[panel.dataset.source];
      return {
        raw: () => ({ year: v(panel.dataset.year || 'year'), totalPay: src?.value ?? '' }),
        compute: computeAnnualInsurance,
        errId: () => p('source'),
        errText: (k, msg) => (k === 'totalPay' && !(src?.value) ? `먼저 위의 ${src?.closest('.field')?.querySelector('.label-text')?.textContent ?? '총급여'}를 입력해 주세요.` : msg),
        watch: [src],
        apply: (res) => {
          if (panel.dataset.fillTotal) { fill(form.elements[panel.dataset.fillTotal], res.total); return `연간 보험료 ${res.total.toLocaleString('ko-KR')}원을 입력했습니다.`; }
          fill(form.elements[panel.dataset.fillPension], res.pension);
          fill(form.elements[panel.dataset.fillOther], res.other);
          return `국민연금 ${res.pension.toLocaleString('ko-KR')}원, 건강·장기요양·고용보험 ${res.other.toLocaleString('ko-KR')}원을 입력했습니다.`;
        },
      };
    }
    case 'loanAnnual': {
      const { computeLoanAnnual } = await import('./calc/wage-helpers.js');
      return {
        raw: () => ({ balance: v(p('balance')), rate: v(p('rate')), months: v(p('months')), method: r(p('method')) }),
        compute: computeLoanAnnual,
        errId: (k) => p(k),
        apply: (res, add) => {
          const cur = Number(String(form.elements[t].value).replace(/[^\d]/g, '')) || 0;
          const val = add ? cur + res.value : res.value;
          fill(form.elements[t], val);
          return `기존 대출 연간 원리금 ${val.toLocaleString('ko-KR')}원을 입력했습니다.`;
        },
      };
    }
    default: return null;
  }
}

function applyShowWhen(form) {
  form.querySelectorAll('[data-show-when]').forEach((node) => {
    const [name, value] = node.dataset.showWhen.split('=');
    const cur = form.querySelector(`input[name="${name}"]:checked`)?.value;
    const show = cur === value;
    node.hidden = !show;
    if (!show && node.classList.contains('helper-toggle')) {
      const panel = $(node.getAttribute('aria-controls'));
      if (panel && !panel.hidden) { panel.hidden = true; node.setAttribute('aria-expanded', 'false'); }
    }
  });
}

export async function setupHelpers(form, status) {
  const panels = [...form.querySelectorAll('[data-helper]')];
  for (const panel of panels) {
    const def = await definition(panel, form);
    if (!def) continue;
    const t = panel.dataset.target;
    const toggle = $(`${t}-helper-toggle`);
    const out = $(`${t}-helper-result`);
    const render = (showErrors) => {
      panel.querySelectorAll('.error').forEach((e) => { e.hidden = true; e.textContent = ''; });
      if (def.groups) panel.querySelectorAll('[data-mp-group]').forEach((g) => { g.hidden = g.dataset.mpGroup !== def.groups(); });
      const res = def.compute(def.raw());
      out.replaceChildren();
      if (!res.ok) {
        if (showErrors) {
          for (const [k, msg] of Object.entries(res.errors)) {
            const node = $(`${def.errId(k)}-error`);
            if (node) { node.textContent = def.errText ? def.errText(k, msg) : msg; node.hidden = false; const fold = node.closest('details'); if (fold) fold.open = true; }
          }
        }
        return null;
      }
      const dl = el('dl', { class: 'kv-list' });
      res.rows.forEach((x) => { const row = el('div', { class: 'kv' }); row.append(el('dt', {}, x.label), el('dd', {}, x.value)); dl.append(row); });
      out.append(dl);
      return res;
    };
    const open = (on) => {
      panel.hidden = !on; toggle.setAttribute('aria-expanded', String(on));
      // 도우미가 열려 있는 동안 아래 고정 '계산하기'를 숨긴다 (도우미의 '넣기'를 먼저 누르도록)
      form.classList.toggle('helper-open', !!form.querySelector('[data-helper]:not([hidden])'));
      if (on) { render(false); panel.querySelector('input[type="text"]:not([disabled])')?.closest('[data-mp-group]:not([hidden]), .pay-helper')?.querySelector('input[type="text"]')?.focus(); }
    };
    const doApply = (add) => {
      const res = render(true);
      if (!res) {
        const bad = panel.querySelector('.error:not([hidden])');
        (bad?.closest('.field')?.querySelector('input') ?? toggle).focus();
        return;
      }
      const msg = def.apply(res, add);
      open(false);
      form.elements[t]?.focus();
      if (status) status.textContent = msg;
    };
    toggle.addEventListener('click', () => open(panel.hidden));
    $(`${t}-helper-close`).addEventListener('click', () => { open(false); toggle.focus(); });
    $(`${t}-helper-apply`).addEventListener('click', () => doApply(false));
    $(`${t}-helper-add`)?.addEventListener('click', () => doApply(true));
    panel.addEventListener('input', () => render(false));
    panel.addEventListener('change', () => render(false));
    (def.watch ?? []).forEach((w) => w?.addEventListener('input', () => { if (!panel.hidden) render(false); }));
    panel.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); doApply(false); } });
    form.addEventListener('reset', () => setTimeout(() => { open(false); out.replaceChildren(); applyShowWhen(form); }, 0));
    render(false);
    panel.dataset.ready = 'true'; // 연결 완료 표시 (점검 스크립트가 기다림)
  }
  if (form.querySelector('[data-show-when]')) {
    form.addEventListener('change', () => applyShowWhen(form));
    applyShowWhen(form);
  }
}
