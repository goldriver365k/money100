/**
 * 연도별 계산 기준 데이터.
 *
 * 원칙
 * - 공식 자료로 확인한 값만 넣는다. 확인하지 못한 값은 null 로 두고 unavailable 에 사유를 적는다.
 *   (null 인 값을 쓰는 계산은 결과 대신 '계산할 수 없음' 사유를 보여 준다.)
 * - 모든 값에는 출처(sources 의 키)를 단다. 출처 문구는 화면의 '적용 기준 및 공식 출처'에 그대로 나온다.
 * - 새 연도는 아래 YEARS 에 객체를 하나 더 추가하면 된다. 계산 코드는 수정하지 않는다.
 *
 * 비율은 소수(0.095 = 9.5%)로 적는다.
 */

import { EXTRA_SOURCES, EXTRA_2026, EXTRA_UNAVAILABLE_2027, STATIC_RULES } from './rules-extra.js';

export const CHECKED_DATE = '2026-11-21';
export { STATIC_RULES };

const law = (name, article) => `https://www.law.go.kr/법령/${encodeURIComponent(name)}/${encodeURIComponent(article)}`;

/** 출처 목록. url 은 사용자가 원문을 확인할 수 있는 공식 페이지. */
export const SOURCES = {
  minWage2026: { title: '최저임금위원회 — 2026년 적용 최저임금 시간급 10,320원 (고용노동부 고시)', url: 'https://www.minimumwage.go.kr/' },
  minWage2027: { title: '최저임금위원회 — 2027년 적용 최저임금 시간급 10,700원 (고용노동부 고시, 2026.8.5.)', url: 'https://www.minimumwage.go.kr/' },
  minWageAct: { title: '최저임금법 제5조의2 (최저임금의 적용을 위한 임금의 환산)', url: law('최저임금법', '제5조의2') },
  pensionAct: { title: '국민연금법 제88조 (연금보험료의 부과·징수) — 2026년 9.5%, 2027년 10%부터 매년 0.5%p 인상 (2025년 개정)', url: law('국민연금법', '제88조') },
  pensionLimit2025: { title: '국민연금공단 — 기준소득월액 상한 637만 원·하한 40만 원 (2025.7.~2026.6.)', url: 'https://www.nps.or.kr/' },
  pensionLimit2026: { title: '국민연금공단 — 기준소득월액 상한 659만 원·하한 41만 원 (2026.7.~2027.6., 보건복지부 국민연금심의위원회)', url: 'https://www.nps.or.kr/' },
  health2026: { title: '국민건강보험공단 — 2026년 직장가입자 건강보험료율 7.09%→7.19% (건강보험정책심의위원회 2025.8.28. 의결)', url: 'https://www.nhis.or.kr/' },
  health2027: { title: '국민건강보험공단 — 2027년 건강보험료율 7.19% 동결 (건강보험정책심의위원회 의결)', url: 'https://www.nhis.or.kr/' },
  ltc2026: { title: '국민건강보험공단 — 2026년 장기요양보험료율 소득 대비 0.9448% (건강보험료 대비 13.14%)', url: 'https://www.nhis.or.kr/' },
  ltc2027: { title: '국민건강보험공단 — 2027년 장기요양보험료율 소득 대비 0.9994% (장기요양위원회 의결)', url: 'https://www.nhis.or.kr/' },
  healthAct: { title: '국민건강보험법 제69조·제76조 (보험료, 보험료의 부담)', url: law('국민건강보험법', '제69조') },
  employmentRate: { title: '고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률 시행령 제12조 (고용보험료율: 실업급여 1.8% 노사 각 0.9%, 고용안정·직업능력개발 0.25~0.85% 사업주)', url: law('고용보험및산업재해보상보험의보험료징수등에관한법률시행령', '제12조') },
  comwel: { title: '근로복지공단 — 고용·산재보험료 및 업종별 산재보험료율 안내', url: 'https://www.comwel.or.kr/' },
  roundingAct: { title: '국고금 관리법 제47조 (국고금의 끝수 계산) — 10원 미만 끝수 버림', url: law('국고금관리법', '제47조') },
  incomeTaxRate: { title: '소득세법 제55조 (세율) — 과세표준 1,400만 원 이하 6% ~ 10억 원 초과 45%', url: law('소득세법', '제55조') },
  earnedDeduction: { title: '소득세법 제47조 (근로소득공제)', url: law('소득세법', '제47조') },
  personalDeduction: { title: '소득세법 제50조 (기본공제) — 1명당 연 150만 원', url: law('소득세법', '제50조') },
  pensionDeduction: { title: '소득세법 제51조의3 (연금보험료공제)', url: law('소득세법', '제51조의3') },
  insuranceDeduction: { title: '소득세법 제52조 (특별소득공제) — 건강·장기요양·고용보험료', url: law('소득세법', '제52조') },
  earnedCredit: { title: '소득세법 제59조 (근로소득세액공제)', url: law('소득세법', '제59조') },
  standardCredit: { title: '소득세법 제59조의4 제9항 (표준세액공제 13만 원)', url: law('소득세법', '제59조의4') },
  localTax: { title: '지방세법 제103조의3 (개인지방소득세 표준세율 — 소득세액의 10%)', url: law('지방세법', '제103조의3') },
  ntsWithholding: { title: '국세청 — 근로소득 간이세액표 (매달 원천징수 기준)', url: 'https://www.nts.go.kr/' },
  severanceAct: { title: '근로자퇴직급여 보장법 제8조 (퇴직금제도의 설정) — 계속근로기간 1년에 30일분 이상의 평균임금', url: law('근로자퇴직급여보장법', '제8조') },
  severanceScope: { title: '근로자퇴직급여 보장법 제4조 (적용 범위 — 4주 평균 1주 소정근로시간 15시간 미만 제외)', url: law('근로자퇴직급여보장법', '제4조') },
  avgWage: { title: '근로기준법 제2조 제1항 제6호·제2항 (평균임금, 통상임금보다 적으면 통상임금)', url: law('근로기준법', '제2조') },
  avgWageDecree: { title: '근로기준법 시행령 제2조 (평균임금 산정에서 제외되는 기간과 임금)', url: law('근로기준법시행령', '제2조') },
  moelSeverance: { title: '고용노동부 — 퇴직금 계산 안내 (평균임금 × 30일 × 재직일수 ÷ 365)', url: 'https://www.moel.go.kr/' },
  vatAct: { title: '부가가치세법 제30조 (세율 10%)', url: law('부가가치세법', '제30조') },
  vatSupply: { title: '부가가치세법 제29조 (과세표준 — 공급가액)', url: law('부가가치세법', '제29조') },
  ntsVat: { title: '국세청 — 부가가치세 안내', url: 'https://www.nts.go.kr/' },
  holidayPay: { title: '근로기준법 제55조·시행령 제30조 (주휴일 — 1주 소정근로일 개근 시 유급휴일)', url: law('근로기준법', '제55조') },
  shortHours: { title: '근로기준법 제18조 제3항 (4주 평균 1주 15시간 미만 근로자 — 주휴 미적용)', url: law('근로기준법', '제18조') },
  fss: { title: '금융감독원 — 금융상품 한눈에 (대출 상환방식 안내)', url: 'https://finlife.fss.or.kr/' },
};

/**
 * 연도별 기준값. null = 공식 확인 전(계산 불가).
 */
export const YEARS = {
  2026: {
    label: '2026년',
    minimumWage: { hourly: 10320, sources: ['minWage2026', 'minWageAct'] },
    pension: {
      rate: 0.095,
      // 기준소득월액 상·하한은 매년 7월에 바뀐다. 월(1~12) 범위별로 적는다.
      limits: [
        { fromMonth: 1, toMonth: 6, min: 400000, max: 6370000, source: 'pensionLimit2025' },
        { fromMonth: 7, toMonth: 12, min: 410000, max: 6590000, source: 'pensionLimit2026' },
      ],
      sources: ['pensionAct'],
    },
    health: { rate: 0.0719, sources: ['health2026', 'healthAct'] },
    longTermCare: { rateOfIncome: 0.009448, sources: ['ltc2026'] },
    employment: {
      employeeRate: 0.009,
      employerUnemploymentRate: 0.009,
      // 사업주만 부담하는 고용안정·직업능력개발사업 보험료율 (사업장 규모별)
      employerStabilityRates: {
        under150: 0.0025,
        priority150: 0.0045,
        under1000: 0.0065,
        over1000: 0.0085,
      },
      sources: ['employmentRate', 'comwel'],
    },
    incomeTax: {
      // 근로소득공제 구간: 총급여 upTo 이하 → base + (총급여 - from) × rate
      earnedDeduction: {
        brackets: [
          { upTo: 5000000, base: 0, from: 0, rate: 0.7 },
          { upTo: 15000000, base: 3500000, from: 5000000, rate: 0.4 },
          { upTo: 45000000, base: 7500000, from: 15000000, rate: 0.15 },
          { upTo: 100000000, base: 12000000, from: 45000000, rate: 0.05 },
          { upTo: Infinity, base: 14750000, from: 100000000, rate: 0.02 },
        ],
        cap: 20000000,
      },
      personalDeductionPerPerson: 1500000,
      // 기본세율: 과세표준 upTo 이하 → base + (과세표준 - from) × rate
      rates: [
        { upTo: 14000000, base: 0, from: 0, rate: 0.06 },
        { upTo: 50000000, base: 840000, from: 14000000, rate: 0.15 },
        { upTo: 88000000, base: 6240000, from: 50000000, rate: 0.24 },
        { upTo: 150000000, base: 15360000, from: 88000000, rate: 0.35 },
        { upTo: 300000000, base: 37060000, from: 150000000, rate: 0.38 },
        { upTo: 500000000, base: 94060000, from: 300000000, rate: 0.40 },
        { upTo: 1000000000, base: 174060000, from: 500000000, rate: 0.42 },
        { upTo: Infinity, base: 384060000, from: 1000000000, rate: 0.45 },
      ],
      earnedCredit: {
        threshold: 1300000, lowRate: 0.55, highBase: 715000, highRate: 0.30,
        // 총급여별 한도
        limits: [
          { upTo: 33000000, kind: 'flat', value: 740000 },
          { upTo: 70000000, kind: 'slope', start: 740000, from: 33000000, rate: 0.008, floor: 660000 },
          { upTo: 120000000, kind: 'slope', start: 660000, from: 70000000, rate: 0.5, floor: 500000 },
          { upTo: Infinity, kind: 'slope', start: 500000, from: 120000000, rate: 0.5, floor: 200000 },
        ],
      },
      standardCredit: 130000,
      localTaxRate: 0.1,
      sources: ['earnedDeduction', 'personalDeduction', 'pensionDeduction', 'insuranceDeduction', 'incomeTaxRate', 'earnedCredit', 'standardCredit', 'localTax', 'ntsWithholding'],
    },
    vat: { rate: 0.1, sources: ['vatAct', 'vatSupply', 'ntsVat'] },
    unavailable: {},
  },
  2027: {
    label: '2027년',
    minimumWage: { hourly: 10700, sources: ['minWage2027', 'minWageAct'] },
    pension: {
      rate: 0.10,
      limits: [
        { fromMonth: 1, toMonth: 6, min: 410000, max: 6590000, source: 'pensionLimit2026' },
        // 2027.7.~ 상·하한은 2027년 국민연금심의위원회에서 정한다 (확인 전)
        { fromMonth: 7, toMonth: 12, min: null, max: null, source: null },
      ],
      sources: ['pensionAct'],
    },
    health: { rate: 0.0719, sources: ['health2027', 'healthAct'] },
    longTermCare: { rateOfIncome: 0.009994, sources: ['ltc2027'] },
    employment: null,
    incomeTax: null,
    vat: { rate: 0.1, sources: ['vatAct', 'vatSupply', 'ntsVat'] },
    unavailable: {
      employment: '2027년 고용보험료율은 인상안(실업급여 요율 합계 2.0%)이 발표되었지만 시행령 개정이 확정되기 전이라 계산에 쓰지 않습니다.',
      incomeTax: '2027년 귀속 소득세는 2026년 세법개정안의 국회 처리 결과가 확정되기 전이라 계산에 쓰지 않습니다.',
      pensionLimitH2: '2027년 7월 이후 국민연금 기준소득월액 상·하한은 아직 고시되지 않았습니다.',
    },
  },
};

// 2차 계산기 기준 합치기
Object.assign(SOURCES, EXTRA_SOURCES);
Object.assign(YEARS[2026], EXTRA_2026);
Object.assign(YEARS[2027], Object.fromEntries(Object.keys(EXTRA_2026).map((k) => [k, null])), {
  freelancer: EXTRA_2026.freelancer,
  healthExtra: EXTRA_2026.healthExtra,
  standardCreditBiz: EXTRA_2026.standardCreditBiz,
  rentConversion: EXTRA_2026.rentConversion,
  dsr: EXTRA_2026.dsr,
});
for (const [k, v] of Object.entries(EXTRA_UNAVAILABLE_2027)) if (v) YEARS[2027].unavailable[k] = v;

export const AVAILABLE_YEARS = Object.keys(YEARS).map(Number).sort((a, b) => a - b);
export const DEFAULT_YEAR = 2026;
