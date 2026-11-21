/**
 * 계산기 페이지와 홈 카드 목록 생성기.
 *   node scripts/gen-calculators.js
 * - scripts/calculators.js 의 PAGES_SPEC → site/<slug>/index.html
 * - CATALOG → site/index.html 의 <!-- catalog:start --> ~ <!-- catalog:end --> 구간과 계산기 수 문구
 * 계산 예제는 실제 계산 모듈(site/assets/js/calc/*.js)을 실행해 채운다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CATALOG, CATEGORIES, PAGES_SPEC } from './calculators.js';
import { CHECKED_DATE } from '../site/assets/js/rules/rules-data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const checkedKo = (() => { const [y, m, d] = CHECKED_DATE.split('-').map(Number); return `${y}년 ${m}월 ${d}일`; })();
const TONE = { 1: 'c1', 6: 'c1', 9: 'c1', 2: 'c2', 5: 'c2', 10: 'c2', 3: 'c3', 8: 'c3', 4: 'c4', 7: 'c4' };
const bySlug = Object.fromEntries(CATALOG.filter((c) => c.slug).map((c) => [c.slug, c]));

function field(f) {
  const id = f.name;
  const req = f.required ? ' <span class="req">필수</span>' : (f.type === 'year' || f.type === 'month' || f.type === 'radio' || f.type === 'select') ? '' : ' <span class="opt">선택</span>';
  const unit = f.unit ? ` <span class="unit">(${esc(f.unit)})</span>` : (f.type === 'amount' ? ' <span class="unit">(원)</span>' : '');
  const hint = f.hint ? `\n        <p class="hint" id="${id}-hint">${esc(f.hint)}</p>` : '';
  const err = `\n        <p class="error" id="${id}-error" hidden></p>`;
  const desc = [`${id}-error`, f.type === 'amount' ? `${id}-preview` : null, f.hint ? `${id}-hint` : null].filter(Boolean).join(' ');
  if (f.type === 'radio') {
    const choices = f.choices.map(([v, l, on]) => `<label class="choice"><input type="radio" name="${id}" value="${v}"${on ? ' checked' : ''}> <span>${esc(l)}</span></label>`).join('\n          ');
    return `      <fieldset class="field">
        <legend>${esc(f.label)}</legend>
        <div class="choices">
          ${choices}
        </div>${err}${hint}
      </fieldset>`;
  }
  let control;
  if (f.type === 'year' || f.type === 'month' || f.type === 'select') {
    const opts = f.type === 'select' ? f.options.map(([v, l, on]) => `<option value="${v}"${on ? ' selected' : ''}>${esc(l)}</option>`).join('') : '';
    control = `<select id="${id}" name="${id}"${f.type === 'year' ? ' data-years' : ''}${f.type === 'month' ? ' data-months' : ''} aria-describedby="${desc}">${opts}</select>`;
  } else if (f.type === 'date' || f.type === 'time') {
    control = `<input id="${id}" name="${id}" type="${f.type}"${f.value ? ` value="${esc(f.value)}"` : ''} aria-describedby="${desc}">`;
  } else {
    const mode = f.type === 'decimal' ? 'decimal' : 'numeric';
    control = `<input id="${id}" name="${id}" type="text" inputmode="${mode}" autocomplete="off" spellcheck="false"${f.value ? ` value="${esc(f.value)}"` : ''}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}${f.type === 'amount' ? ' data-amount' : ''} aria-describedby="${desc}">`;
  }
  const modeAttrs = f.modeLabels ? ` data-mode-label ${Object.entries(f.modeLabels).map(([k, v]) => `data-label-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${esc(v)}"`).join(' ')}` : '';
  const preview = f.type === 'amount' ? `\n        <p class="preview" id="${id}-preview"></p>` : '';
  if (f.helper && !['ordinaryHourly', 'monthlyPay'].includes(f.helper)) {
    return `      <div class="field">
        <label for="${id}"${modeAttrs}><span class="label-text">${esc(f.label)}</span>${req}${unit}</label>
        <div class="input-with-action">
          ${control}
          <button type="button" class="btn btn-ghost helper-toggle" id="${id}-helper-toggle" aria-expanded="false" aria-controls="${id}-helper"${f.showWhen ? ` data-show-when="${f.showWhen}"` : ''}>자동 계산</button>
        </div>${err}${preview}${hint}
${genericHelper(f)}
      </div>`;
  }
  if (f.helper === 'ordinaryHourly') {
    return `      <div class="field">
        <label for="${id}"${modeAttrs}><span class="label-text">${esc(f.label)}</span>${req}${unit}</label>
        <div class="input-with-action">
          ${control}
          <button type="button" class="btn btn-ghost helper-toggle" id="${id}-helper-toggle" aria-expanded="false" aria-controls="${id}-helper">자동 계산</button>
        </div>${err}${preview}${hint}
${ordinaryHourlyHelper(id, f.hoursField)}
      </div>`;
  }
  if (f.helper === 'monthlyPay') {
    return `      <div class="field">
        <label for="${id}"${modeAttrs}><span class="label-text">${esc(f.label)}</span>${req}${unit}</label>
        <div class="input-with-action">
          ${control}
          <button type="button" class="btn btn-ghost helper-toggle" id="${id}-helper-toggle" aria-expanded="false" aria-controls="${id}-helper"${f.showWhen ? ` data-show-when="${f.showWhen}"` : ''}>자동 계산</button>
        </div>${err}${preview}${hint}
${monthlyPayHelper(id, f.nonTaxableField, f.fill)}
      </div>`;
  }
  return `      <div class="field">
        <label for="${id}"${modeAttrs}><span class="label-text">${esc(f.label)}</span>${req}${unit}</label>
        ${control}${err}${preview}${hint}
      </div>`;
}

/** 새 입력 도우미 패널 (helpers-ui.js 가 연결). 입력 이름은 '대상__항목' 으로 계산 입력과 구분된다. */
function genericHelper(f) {
  const t = f.name;
  const n = (k) => `${t}__${k}`;
  const box = (k, label, { unit = '원', hint = '', value = '', mode = 'numeric', amount = true } = {}) => `
          <div class="field helper-field">
            <label for="${n(k)}">${label} <span class="unit">(${unit})</span></label>
            <input id="${n(k)}" name="${n(k)}" type="text" inputmode="${mode}" autocomplete="off" spellcheck="false"${amount ? ' data-amount' : ''}${value ? ` value="${value}"` : ''} aria-describedby="${n(k)}-error${amount ? ` ${n(k)}-preview` : ''}${hint ? ` ${n(k)}-hint` : ''}">
            <p class="error" id="${n(k)}-error" hidden></p>${amount ? `\n            <p class="preview" id="${n(k)}-preview"></p>` : ''}${hint ? `\n            <p class="hint" id="${n(k)}-hint">${hint}</p>` : ''}
          </div>`;
  const radio = (k, legend, choices) => `
          <fieldset class="field helper-field">
            <legend>${legend}</legend>
            <div class="choices">
              ${choices.map(([v, l, on]) => `<label class="choice"><input type="radio" name="${n(k)}" value="${v}"${on ? ' checked' : ''}> <span>${l}</span></label>`).join('\n              ')}
            </div>
            <p class="error" id="${n(k)}-error" hidden></p>
          </fieldset>`;
  let title; let body; let data = ''; let applyLabel = `${esc(f.label.replace(/ \(.*\)$/, ''))}에 넣기`; let extra = '';
  if (f.helper === 'ordinary') {
    title = { daily: '1일 통상임금 자동 계산', monthly: '월 통상임금 자동 계산', hourly: '통상시급 자동 계산' }[f.output];
    data = ` data-output="${f.output}"${f.hoursField ? ` data-hours="${f.hoursField}"` : ''}`;
    body = `
          <p class="hint">월 통상임금 = 기본급 + 매달 고정으로 받는 수당 + 정기 상여금 ÷ 12${f.output !== 'monthly' ? '. 통상시급 = 월 통상임금 ÷ 월 기준시간(주 40시간이면 209시간)' : ''}${f.output === 'daily' ? ', 1일 통상임금 = 통상시급 × 1일 소정근로시간' : ''}.</p>${box('base', '기본급 (월)')}${box('fixed', '매달 고정으로 받는 수당 (월)', { hint: '직책·자격·식대 등 매달 정해진 금액. 연장·야간수당과 실적 성과급은 빼세요.' })}${box('bonus', '정기 상여금 (연간)', { hint: '정해진 시기에 정해진 금액으로 주는 상여금 (÷ 12 해서 포함).' })}${f.output !== 'monthly' && !f.hoursField ? box('weekly', '1주 소정근로시간', { unit: '시간', value: '40', mode: 'decimal', amount: false }) : ''}${f.output !== 'monthly' && f.hoursField ? `\n          <p class="error" id="${n('weeklyNote')}-error" hidden></p>` : ''}${f.output === 'daily' ? box('daily', '1일 소정근로시간', { unit: '시간', value: '8', mode: 'decimal', amount: false }) : ''}`;
  } else if (f.helper === 'wages3m') {
    title = '3개월 임금총액 자동 계산';
    body = `${radio('mode', '계산 방식', [['same', '월급 × 3 (매달 같음)', true], ['each', '3개월 각각 입력']])}
          <div data-mp-group="same">${box('monthly', '월 임금 (세전, 수당 포함)', { hint: '기본급과 매달 받은 수당·식대를 모두 더한 금액입니다.' })}
          </div>
          <div data-mp-group="each" hidden>${box('m1', '1개월 전 임금')}${box('m2', '2개월 전 임금')}${box('m3', '3개월 전 임금')}
          </div>`;
  } else if (f.helper === 'insurance') {
    title = '연간 4대보험료 자동 계산';
    data = ` data-source="${f.source}" data-year="year"${f.fillTotal ? ` data-fill-total="${f.fillTotal}"` : ` data-fill-pension="${f.fillPension}" data-fill-other="${f.fillOther}"`}`;
    applyLabel = f.fillTotal ? '보험료에 넣기' : '보험료 칸에 넣기';
    body = `
          <p class="hint">위에 입력한 총급여를 12달 같은 금액으로 받았다고 보고, 그해 요율로 근로자 부담 국민연금·건강·장기요양·고용보험을 계산합니다${f.fillTotal ? ' (합계를 넣습니다)' : ' (국민연금과 나머지 보험료를 각 칸에 넣습니다)'}.</p>
          <p class="error" id="${n('source')}-error" hidden></p>`;
  } else if (f.helper === 'loanAnnual') {
    title = '기존 대출 연간 원리금 자동 계산';
    applyLabel = '넣기 (바꾸기)';
    extra = `\n            <button type="button" class="btn btn-ghost" id="${t}-helper-add">기존 금액에 더하기</button>`;
    body = `
          <p class="hint">대출 하나씩 계산합니다. 대출이 여러 개면 하나를 넣은 뒤 다음 대출은 "기존 금액에 더하기"로 합산하세요.</p>${box('balance', '대출 잔액')}${box('rate', '연 이자율', { unit: '%', mode: 'decimal', amount: false })}${box('months', '남은 기간', { unit: '개월', amount: false })}${radio('method', '상환 방식', [['equalPayment', '원리금균등', true], ['equalPrincipal', '원금균등']])}`;
  }
  return `        <div class="pay-helper" id="${t}-helper" data-helper="${f.helper}" data-target="${t}"${data} hidden>
          <p class="pay-helper-title">${title}</p>${body}
          <div class="pay-helper-result" id="${t}-helper-result" aria-live="polite"></div>
          <div class="pay-helper-actions">
            <button type="button" class="btn btn-primary" id="${t}-helper-apply">${applyLabel}</button>${extra}
            <button type="button" class="btn btn-ghost" id="${t}-helper-close">닫기</button>
          </div>
        </div>`;
}

/** '통상시급' 자동 계산 패널 (calc/ordinary-hourly-helper.js). 1주 소정근로시간은 페이지의 기존 입력란(hoursField)을 쓴다. */
function ordinaryHourlyHelper(target, hoursField) {
  const amt = (name, label, hint = '') => `
          <div class="field helper-field">
            <label for="${name}">${label} <span class="unit">(원)</span></label>
            <input id="${name}" name="${name}" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" data-amount aria-describedby="${name}-error ${name}-preview${hint ? ` ${name}-hint` : ''}">
            <p class="error" id="${name}-error" hidden></p>
            <p class="preview" id="${name}-preview"></p>${hint ? `\n            <p class="hint" id="${name}-hint">${hint}</p>` : ''}
          </div>`;
  return `        <div class="pay-helper" id="${target}-helper" data-helper="ordinaryHourly" data-target="${target}" data-hours="${hoursField}" hidden>
          <p class="pay-helper-title">통상시급 자동 계산</p>
          <p class="hint">월 통상임금을 월 기준시간(위에 입력한 1주 소정근로시간으로 계산)으로 나눕니다.</p>${amt('ohBase', '기본급 (월)')}${amt('ohFixed', '매달 고정으로 받는 수당 (월)', '직책·자격·식대 등 매달 정해진 금액. 연장·야간수당과 실적 성과급은 빼세요.')}${amt('ohBonus', '정기 상여금 (연간)', '정해진 시기에 정해진 금액으로 주는 상여금. ÷ 12 해서 월 통상임금에 넣습니다.')}
          <p class="error" id="ohWeekly-error" hidden></p>
          <div class="pay-helper-result" id="${target}-helper-result" aria-live="polite"></div>
          <div class="pay-helper-actions">
            <button type="button" class="btn btn-primary" id="${target}-helper-apply">통상시급에 넣기</button>
            <button type="button" class="btn btn-ghost" id="${target}-helper-close">닫기</button>
          </div>
        </div>`;
}

/** '세전 월급' 자동 계산 패널 (calc-page.js 가 calc/monthly-pay-helper.js 와 연결). 입력값 이름은 mp… 로 계산 입력과 구분된다. */
function monthlyPayHelper(target, nonTaxableField = '', fillMode = 'gross') {
  const amt = (name, label, hint = '', value = '') => `
          <div class="field helper-field">
            <label for="${name}">${label} <span class="unit">(원)</span></label>
            <input id="${name}" name="${name}" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" data-amount${value ? ` value="${value}"` : ''} aria-describedby="${name}-error ${name}-preview${hint ? ` ${name}-hint` : ''}">
            <p class="error" id="${name}-error" hidden></p>
            <p class="preview" id="${name}-preview"></p>${hint ? `\n            <p class="hint" id="${name}-hint">${hint}</p>` : ''}
          </div>`;
  const radio = (name, legend, choices) => `
          <fieldset class="field helper-field">
            <legend>${legend}</legend>
            <div class="choices">
              ${choices.map(([v, l, on]) => `<label class="choice"><input type="radio" name="${name}" value="${v}"${on ? ' checked' : ''}> <span>${l}</span></label>`).join('\n              ')}
            </div>
          </fieldset>`;
  const fillNote = nonTaxableField ? '' : fillMode === 'taxable'
    ? '\n          <p class="hint">이 칸은 비과세를 뺀 금액이라, 계산된 세전 월급에서 비과세 수당을 뺀 과세분만 넣습니다.</p>'
    : '\n          <p class="hint">계산된 세전 월급(비과세 수당 포함)을 넣습니다.</p>';
  return `        <div class="pay-helper" id="${target}-helper" data-helper="monthlyPay" data-target="${target}" data-nontaxable="${nonTaxableField}" data-fill="${fillMode}" hidden>
          <p class="pay-helper-title">세전 월급 자동 계산</p>${fillNote}${radio('mpMode', '계산 방식', [['annual', '연봉 ÷ 12', true], ['parts', '기본급 + 수당']])}
          <div data-mp-group="annual">${amt('mpAnnual', '연봉 (세전, 연간 총액)')}${amt('mpIncludedBonus', '연봉에 포함된 상여금 (연간)', '계약 연봉 안에 들어 있는 상여금입니다. 없으면 비워 두세요.')}${radio('mpIncludedBonusPaid', '연봉에 포함된 상여금은 어떻게 받나요?', [['monthly', '매달 나눠 받음 (월급에 포함)', true], ['separate', '상여 달에 따로 받음 (월급에서 제외)']])}${amt('mpExtraBonus', '연봉과 별도로 받는 상여금 (연간)', '성과급 등 연봉 외로 받는 금액입니다.')}${radio('mpExtraBonusInAverage', '별도 상여금을 월 평균에 넣을까요?', [['no', '아니요 (월급에서 제외)', true], ['yes', '예 (÷ 12 해서 포함)']])}${amt('mpNonTaxableA', '비과세 수당 (월)', '식대 등. 아래 비과세 금액 칸에도 자동으로 들어가 한 번만 차감됩니다.')}${radio('mpNonTaxableIn', '비과세 수당이 연봉에 포함되어 있나요?', [['included', '예 (연봉 안에 포함)', true], ['separate', '아니요 (연봉과 별도로 받음)']])}
          </div>
          <div data-mp-group="parts" hidden>${amt('mpBase', '기본급 (월)')}${amt('mpAllowance', '과세 수당 합계 (월)', '직책·자격·연장근로 수당 등 세금이 붙는 수당입니다.')}${amt('mpNonTaxableP', '비과세 수당 (월)', '식대 등. 아래 비과세 금액 칸에도 자동으로 들어가 한 번만 차감됩니다.')}
          </div>
          <div class="pay-helper-result" id="${target}-helper-result" aria-live="polite"></div>
          <div class="pay-helper-actions">
            <button type="button" class="btn btn-primary" id="${target}-helper-apply">세전 월급에 넣기</button>
            <button type="button" class="btn btn-ghost" id="${target}-helper-close">닫기</button>
          </div>
        </div>`;
}

function exampleBlock(r, spec) {
  if (!r.ok) throw new Error(`${spec.slug} 예제 계산 실패: ${JSON.stringify(r)}`);
  const stats = r.stats.map((s) => `<div class="kv"><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join('\n          ');
  const steps = (r.table && !r.table.collapsible ? r.table.rows.map((row) => `${row[0]}: ${row.slice(1).filter(Boolean).join(' · ')}`) : r.rows.map((x) => `${x.label}: ${x.value}`)).slice(0, 8);
  return `<p class="example-case"><strong>예시</strong> ${esc(spec.example.title)}</p>
        <dl class="kv-list example-result">
          ${stats}
        </dl>
        <ol class="example-steps">
          ${steps.map((s) => `<li>${esc(s)}</li>`).join('\n          ')}
        </ol>`;
}

const header = (foldIds) => `  <a class="skip-link" href="#main">본문 바로가기</a>
  <header class="site-header">
    <div class="container container-wide header-inner">
      <a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span>정산노트</a>
      <nav class="main-nav" aria-label="주요 메뉴"><ul><li><a href="/#calculators">계산기 모음</a></li><li><a href="#${foldIds.basis}" data-open-fold>이용 가이드</a></li><li><a href="#${foldIds.faq}" data-open-fold>자주 묻는 질문</a></li></ul></nav>
    </div>
  </header>`;

const footer = `  <footer class="site-footer">
    <div class="container container-wide">
      <p class="footer-brand">정산노트<span aria-hidden="true">.</span></p>
      <p>정산노트의 계산 결과는 단순 모의 계산이며, 법적 효력을 갖는 증빙자료가 아닙니다.</p>
      <p>입력한 값은 브라우저 안에서만 계산되며 서버나 분석 도구로 전송되지 않습니다.</p>
      <p><a href="/">정산노트 홈</a> · <a href="/privacy">개인정보처리방침</a></p>
    </div>
  </footer>`;

async function page(spec) {
  const mod = await import(pathToFileURL(path.join(ROOT, 'site/assets/js/calc', `${spec.module}.js`)).href);
  const ex = mod.calculate(spec.example.raw);
  const cat = CATEGORIES[spec.cat];
  const faqLd = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: spec.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }, null, 2).replace(/\n/g, '\n  ');
  const sources = ex.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}<span class="sr-only"> (새 창에서 열림)</span></a></li>`).join('\n        ');
  const missing = spec.related.filter((slug) => !bySlug[slug]);
  if (missing.length) console.warn(`경고: ${spec.slug} 관련 계산기 미구현 링크 제외 — ${missing.join(', ')}`);
  const related = spec.related.filter((slug) => bySlug[slug]).map((slug) => {
    const c = bySlug[slug];
    return `<li><a class="related-link cat-${c.cat}" href="/${slug}"><span class="related-cat">${esc(CATEGORIES[c.cat])}</span><strong>${esc(c.name)}</strong><span>${esc(c.desc)}</span></a></li>`;
  }).join('\n        ');

  return `<!doctype html>
<html lang="ko" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>${esc(spec.title)}</title>
  <meta name="description" content="${esc(spec.description)}">
  <!-- seo:start -->
  <meta name="robots" content="noindex, nofollow">
  <!-- seo:end -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="정산노트">
  <meta property="og:title" content="${esc(spec.title)}">
  <meta property="og:description" content="${esc(spec.lead)}">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:image" content="/assets/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="정산노트 — 급여·세금·부동산 계산기 30종">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#2563e2">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/css/style.css">
  <script type="module" src="/assets/js/nav.js"></script>
  <script type="module" src="/assets/js/calc-page.js"></script>
  <script type="application/ld+json">
  ${faqLd}
  </script>
</head>
<body class="calc-page">
<!-- 이 파일은 scripts/gen-calculators.js 로 생성됩니다. 직접 고치지 말고 scripts/calculators.js 를 수정하세요. -->
${header({ basis: 'basis-fold', faq: 'faq-fold' })}

  <main id="main" class="container">
    <nav class="home-nav" aria-label="홈으로 이동"><a href="/" id="home-link" class="home-btn"><span aria-hidden="true">←</span> 홈</a></nav>

    <section class="hero calc-hero" aria-labelledby="page-title">
      <p class="calc-badges"><span class="cat-badge cat-${spec.cat}">${esc(cat)}</span><span class="basis-badge">적용 기준: ${esc(spec.basisYear)}</span></p>
      <h1 id="page-title">${esc(spec.h1)}</h1>
      <p class="lead">${esc(spec.lead)}</p>
    </section>

    <noscript>
      <p class="notice notice-warn">이 계산기는 브라우저의 JavaScript로 동작합니다. JavaScript를 켠 뒤 다시 열어 주세요.</p>
    </noscript>

    <form id="calc-form" class="panel" data-calc="${spec.module}" novalidate autocomplete="off" aria-labelledby="form-title">
      <h2 id="form-title" class="panel-title"><span class="step">1</span> 입력</h2>
${spec.fields.map(field).join('\n\n')}

      <div class="actions actions-sticky">
        <button type="submit" class="btn btn-primary" id="submit">계산하기</button>
        <button type="button" class="btn btn-reset" id="reset-all">초기화</button>
      </div>
    </form>

    <div id="result-status" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>

    <section id="result" class="panel result" hidden aria-labelledby="result-title">
      <h2 id="result-title" class="panel-title" tabindex="-1"><span class="step">2</span> 계산 결과</h2>
      <div id="result-unavailable" class="notice notice-warn" hidden>
        <p><strong>계산할 수 없습니다.</strong> <span id="unavailable-reason"></span></p>
        <p>공식 기준이 확인되지 않은 값은 임의로 쓰지 않습니다. 다른 기준 연도를 선택해 주세요.</p>
      </div>
      <div id="result-body">
        <p class="result-meta" id="result-meta"></p>
        <div class="headline result-stats" id="result-stats"></div>
        <h3 class="table-title">항목별 상세 내역</h3>
        <div id="result-table"></div>
        <dl class="kv-list" id="result-rows"></dl>
        <div data-block>
          <h3 class="table-title">계산 공식</h3>
          <ul class="formula-list" id="result-formulas"></ul>
        </div>
        <div data-block class="caution">
          <h3 class="table-title">주의사항</h3>
          <ul id="result-warnings"></ul>
        </div>
        <p class="disclaimer result-disclaimer">본 계산 결과는 단순 모의 계산이며, 법적 확정 금액이나 효력을 갖는 증빙자료가 아닙니다.</p>
      </div>
    </section>

    <!-- 공통 아코디언: 계산 방법 · 실제 예제 · 공식출처 (기본 접힘) -->
    <details class="content basis-fold info-fold" id="basis-fold">
      <summary class="fold-summary"><h2 id="info-title">계산 방법 · 실제 예제 · 공식출처</h2><span class="fold-icon" aria-hidden="true"></span></summary>
      <div class="fold-body">
      <section class="howto" aria-labelledby="howto-title">
      <h3 id="howto-title">${esc(spec.h1.replace(/ 계산기$/, ''))} 계산 방법</h3>
      <ol>
        ${spec.howto.map((h) => `<li>${esc(h)}</li>`).join('\n        ')}
      </ol>
      <h4>실제 계산 예제</h4>
      <div class="example">
        ${exampleBlock(ex, spec)}
      </div>
      </section>
      <section class="basis" aria-labelledby="basis-title">
      <h3 id="basis-title">적용 기준 및 공식 출처</h3>
      <p>적용 기준: ${esc(spec.basisYear)}. 연도별 요율·세율은 기준 데이터로 따로 관리하며, 공식 확정 전인 연도는 계산하지 않습니다.</p>
      <ul class="sources">
        ${sources}
      </ul>
      <p class="checked-date">공식 자료 확인일: <time datetime="${CHECKED_DATE}">${checkedKo}</time></p>
      </section>
    </div>
    </details>

    <details class="content faq faq-fold" id="faq-fold">
      <summary class="fold-summary"><h2 id="faq-title">자주 묻는 질문</h2></summary>
      <div class="fold-body">
      ${spec.faq.map((f) => `<h3>${esc(f.q)}</h3>\n      <p>${esc(f.a)}</p>`).join('\n      ')}
    </div>
    </details>

    <section class="content related" aria-labelledby="related-title">
      <h2 id="related-title">관련 계산기</h2>
      <ul class="related-list">
        ${related}
      </ul>
    </section>
  </main>

${footer}
</body>
</html>
`;
}

function catalogHtml() {
  const counters = { labor: 0, tax: 0, realty: 0 };
  return CATALOG.map((c) => {
    counters[c.cat] += 1;
    const n = counters[c.cat];
    const label = CATEGORIES[c.cat];
    const live = Boolean(c.slug);
    const kw = esc(`${c.kw} ${c.name} ${label}`);
    const badges = `<span class="card-badges"><span class="card-no" aria-label="${label} ${n}번">${n}</span><span class="card-cat cat-${c.cat}">${label}</span><span class="status status-${live ? 'live' : 'soon'}">${live ? '이용 가능' : '준비 중'}</span></span>`;
    const body = `\n              ${badges}\n              <h3 class="card-title">${esc(c.name)}</h3>\n              <span class="card-desc">${esc(c.desc)}</span>`;
    return live
      ? `          <li class="calc-item" data-category="${c.cat}" data-status="live" data-keywords="${kw}">
            <a class="card calc-card tone-${TONE[n]}" href="/${c.slug}">${body}
              <span class="card-btn">계산기 열기</span>
            </a>
          </li>`
      : `          <li class="calc-item" data-category="${c.cat}" data-status="soon" data-keywords="${kw}">
            <div class="card calc-card card-soon tone-${TONE[n]}">${body}
              <span class="card-btn card-btn-soon">공개 준비 중 · 아직 계산할 수 없습니다</span>
            </div>
          </li>`;
  }).join('\n');
}

for (const spec of PAGES_SPEC) {
  const dir = path.join(ROOT, 'site', spec.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), await page(spec));
  console.log(`생성: site/${spec.slug}/index.html`);
}

// 기존 월급 일할계산기(직접 작성한 페이지)에도 같은 '세전 월급' 자동 계산 패널을 넣는다 (계산 로직은 그대로)
{
  const sp = path.join(ROOT, 'site/salary-proration/index.html');
  let html = fs.readFileSync(sp, 'utf8');
  html = html.replace(/<!-- helper:salary:start -->[\s\S]*<!-- helper:salary:end -->/, `<!-- helper:salary:start -->\n${monthlyPayHelper('salary', '', 'gross')}\n        <!-- helper:salary:end -->`);
  fs.writeFileSync(sp, html);
}

const homePath = path.join(ROOT, 'site/index.html');
let home = fs.readFileSync(homePath, 'utf8');
const live = CATALOG.filter((c) => c.slug).length;
home = home.replace(/<!-- catalog:start -->[\s\S]*<!-- catalog:end -->/, `<!-- catalog:start -->\n${catalogHtml()}\n          <!-- catalog:end -->`);
home = home.replace(/(<p class="calc-count" id="calc-count"[^>]*>)[^<]*(<\/p>)/, `$1계산기 ${CATALOG.length}개 · 이용 가능 ${live}개 · 준비 중 ${CATALOG.length - live}개$2`);
fs.writeFileSync(homePath, home);
console.log(`홈 카드 ${CATALOG.length}개 (이용 가능 ${live}개)`);
