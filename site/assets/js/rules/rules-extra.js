/**
 * 2차 계산기 기준 데이터 (rules-data.js 의 YEARS·SOURCES 에 합쳐진다).
 * 원칙은 rules-data.js 와 같다: 확인한 값만, 출처와 함께. 확인 전이면 null + unavailable 사유.
 * '법정 기준'이 아닌 참고용 가정값은 키 이름에 reference 를 붙이고 화면에도 '참고 기준(가정값)'으로 표시한다.
 */
const law = (name, article) => `https://www.law.go.kr/법령/${encodeURIComponent(name)}/${encodeURIComponent(article)}`;

export const EXTRA_SOURCES = {
  ueAct: { title: '고용보험법 제40조(구직급여 수급 요건)·제45조(급여 기초 임금일액)·제46조(구직급여일액)', url: law('고용보험법', '제46조') },
  ueDays: { title: '고용보험법 제50조 및 별표 1 (구직급여 소정급여일수 120~270일)', url: law('고용보험법', '제50조') },
  ueCap2026: { title: '고용노동부 — 2026년 구직급여 1일 상한액 68,100원 (고용보험법 시행령 개정), 하한액 = 최저임금 × 80% × 소정근로시간', url: 'https://www.work24.go.kr/' },
  plAct: { title: '고용보험법 제70조 및 시행령 제95조 (육아휴직 급여)', url: law('고용보험법시행령', '제95조') },
  pl2026: { title: '고용노동부 — 육아휴직 급여 1~3개월 100%(상한 250만 원)·4~6개월 100%(200만 원)·7개월~ 80%(160만 원), 하한 70만 원, 사후지급금 폐지', url: 'https://www.moel.go.kr/' },
  pl66: { title: '고용보험법 시행령 제95조의3 (6+6 부모육아휴직제 — 첫 6개월 상한 250·250·300·350·400·450만 원)', url: law('고용보험법시행령', '제95조의3') },
  leaveAct: { title: '근로기준법 제60조 (연차 유급휴가)·제61조(사용 촉진)', url: law('근로기준법', '제60조') },
  leaveScope: { title: '근로기준법 시행령 제7조 및 별표 1 (상시 4명 이하 사업장 — 연차 규정 미적용)', url: law('근로기준법시행령', '제7조') },
  leaveShort: { title: '근로기준법 시행령 제9조 및 별표 2 (단시간근로자 연차 — 통상근로자 연차일수 × 소정근로시간 비율 × 8시간)', url: law('근로기준법시행령', '제9조') },
  ordinaryWage: { title: '근로기준법 시행령 제6조 (통상임금 — 시간급 = 월급 ÷ 월 통상임금 산정 기준시간), 대법원 2024. 12. 19. 선고 2020다247190 전원합의체 판결 (재직 조건 정기상여금도 통상임금)', url: law('근로기준법시행령', '제6조') },
  overtimeAct: { title: '근로기준법 제56조 (연장·야간·휴일근로 — 통상임금 50% 가산, 휴일 8시간 초과 100%)', url: law('근로기준법', '제56조') },
  partTimeOT: { title: '기간제 및 단시간근로자 보호 등에 관한 법률 제6조 (단시간근로자 소정근로시간 초과 근로 50% 가산)', url: law('기간제및단시간근로자보호등에관한법률', '제6조') },
  childCredit: { title: '소득세법 제59조의2 (자녀세액공제 — 1명 25만 원, 2명 55만 원, 3명 이상 55만 원 + 초과 1명당 40만 원)', url: law('소득세법', '제59조의2') },
  standardCreditBiz: { title: '소득세법 제59조의4 제9항 제2호 (근로소득이 없는 종합소득자 표준세액공제 7만 원)', url: law('소득세법', '제59조의4') },
  withholdingBiz: { title: '소득세법 제129조 제1항 제3호 (인적용역 사업소득 원천징수 3%) · 지방세법 제103조의29 (특별징수 10%)', url: law('소득세법', '제129조') },
  healthIncome: { title: '국민건강보험법 제71조 및 시행령 제41조 (보수 외 소득 연 2,000만 원 초과분 소득월액보험료, 연금·근로소득 50% 평가)', url: law('국민건강보험법시행령', '제41조') },
  pensionRegional: { title: '국민연금법 제88조 제3항 (지역·임의가입자는 연금보험료 전액 본인 부담)', url: law('국민연금법', '제88조') },
  giftRate: { title: '상속세 및 증여세법 제26조·제56조 (세율 10~50%)', url: law('상속세및증여세법', '제26조') },
  giftDeduction: { title: '상속세 및 증여세법 제53조 (증여재산공제 — 배우자 6억, 직계존속 5천만(미성년 2천만), 직계비속 5천만, 기타친족 1천만, 10년 합산)', url: law('상속세및증여세법', '제53조') },
  giftMarriage: { title: '상속세 및 증여세법 제53조의2 (혼인·출산 증여재산공제 1억 원)', url: law('상속세및증여세법', '제53조의2') },
  giftSkip: { title: '상속세 및 증여세법 제57조 (세대를 건너뛴 증여 30% 할증, 미성년자 20억 초과 40%)', url: law('상속세및증여세법', '제57조') },
  giftSum: { title: '상속세 및 증여세법 제47조 제2항 (10년 이내 동일인 증여 합산)·제58조(납부세액공제)', url: law('상속세및증여세법', '제47조') },
  filingCredit: { title: '상속세 및 증여세법 제69조 (신고세액공제 3%)', url: law('상속세및증여세법', '제69조') },
  minTax: { title: '상속세 및 증여세법 제25조 제2항·제55조 제2항 (과세표준 50만 원 미만 부과 안 함)', url: law('상속세및증여세법', '제55조') },
  inhBasic: { title: '상속세 및 증여세법 제18조(기초공제 2억)·제21조(일괄공제 5억)', url: law('상속세및증여세법', '제21조') },
  inhSpouse: { title: '상속세 및 증여세법 제19조 (배우자 상속공제 — 최소 5억, 법정상속분 한도, 최대 30억)', url: law('상속세및증여세법', '제19조') },
  inhFinance: { title: '상속세 및 증여세법 제22조 (금융재산 상속공제 — 20%, 최대 2억)', url: law('상속세및증여세법', '제22조') },
  inhFuneral: { title: '상속세 및 증여세법 시행령 제9조 (장례비용 500만~1,000만 원)', url: law('상속세및증여세법시행령', '제9조') },
  inhStatus: { title: '국회 의안정보 — 2026년 상속세 개정안(유산취득세 등)은 2026.11. 현재 국회 심사 중으로 미반영', url: 'https://likms.assembly.go.kr/bill/' },
  acqRate: { title: '지방세법 제11조 제1항 제8호 (주택 유상취득 1~3%)', url: law('지방세법', '제11조') },
  acqHeavy: { title: '지방세법 제13조의2 (다주택·법인 주택 취득 중과 8%·12%)', url: law('지방세법', '제13조의2') },
  acqEdu: { title: '지방세법 제151조 (지방교육세)', url: law('지방세법', '제151조') },
  acqFarm: { title: '농어촌특별세법 제5조 (취득세 관련 농어촌특별세, 전용 85㎡ 이하 주택 비과세)', url: law('농어촌특별세법', '제5조') },
  acqFirst: { title: '지방세특례제한법 제36조의3 (생애최초 주택 구입 취득세 감면 — 최대 200만 원, 취득가 12억 원 이하)', url: law('지방세특례제한법', '제36조의3') },
  regulated: { title: '국토교통부 — 조정대상지역 지정 현황 (2025.10.15. 서울 전역·경기 12곳 지정)', url: 'https://www.molit.go.kr/' },
  cgtAct: { title: '소득세법 제89조(1세대1주택 비과세, 고가주택 12억 원)·제95조(장기보유특별공제)·제103조(기본공제 250만 원)', url: law('소득세법', '제95조') },
  cgtRate: { title: '소득세법 제104조 (양도소득세율 — 주택 1년 미만 70%, 2년 미만 60%, 조정대상지역 다주택 +20%p·+30%p)', url: law('소득세법', '제104조') },
  cgtHeavyEnd: { title: '재정경제부 — 다주택자 양도세 중과 한시 배제 2026.5.9. 종료 (2026.5.10. 이후 양도분 중과)', url: 'https://www.mofe.go.kr/' },
  brokerFee: { title: '공인중개사법 시행규칙 제20조 및 별표 1 (주택 중개보수 상한요율, 2021.10.19. 시행), 시·도 조례', url: law('공인중개사법시행규칙', '제20조') },
  rentConv: { title: '주택임대차보호법 제7조의2 및 시행령 제9조 (전환율 상한 = min(연 10%, 기준금리 + 연 2%))', url: law('주택임대차보호법', '제7조의2') },
  bokRate: { title: '한국은행 — 기준금리 연 3.00% (2026.10.22. 금융통화위원회 동결)', url: 'https://www.bok.or.kr/' },
  dsrRule: { title: '금융위원회 — 차주단위 DSR(은행권 40%·제2금융권 50%), 스트레스 DSR 3단계 스트레스 금리 1.5%p (2025.7.~)', url: 'https://www.fsc.go.kr/' },
  propRate: { title: '지방세법 제111조(재산세 세율)·제111조의2(1세대1주택 특례세율, 공시가격 9억 원 이하)', url: law('지방세법', '제111조의2') },
  propRatio: { title: '지방세법 시행령 제109조 (공정시장가액비율 60%, 2026년 1세대1주택 43~45% 특례 유지)', url: law('지방세법시행령', '제109조') },
  propUrban: { title: '지방세법 제112조 (도시지역분 과세표준 × 0.14%)·제151조(지방교육세 20%)', url: law('지방세법', '제112조') },
  areaUnit: { title: '계량에 관한 법률 — 법정 단위는 제곱미터(㎡). 1평 = 400/121㎡ (≈3.3058㎡)', url: law('계량에관한법률', '제5조') },
  housingPoints: { title: '주택공급에 관한 규칙 제28조 및 별표 1 (청약 가점제 — 무주택기간 32점·부양가족 35점·입주자저축 17점, 배우자 통장 50% 최대 3점)', url: law('주택공급에관한규칙', '제28조') },
  smallTenant: { title: '주택임대차보호법 시행령 제10조·제11조 (소액임차인 최우선변제 — 서울 1억6,500만 원 이하 5,500만 원 등, 2023.2.21.~)', url: law('주택임대차보호법시행령', '제11조') },
  hugGuarantee: { title: '주택도시보증공사(HUG) — 전세보증금반환보증 주택가격 산정(공시가격 × 140%)·담보인정비율 90%', url: 'https://www.khug.or.kr/' },
};

/** 2026년 추가 기준 */
export const EXTRA_2026 = {
  unemployment: {
    dailyMax: 68100,
    floorRatio: 0.8, // 최저임금 × 80% × 1일 소정근로시간(최대 8시간)
    replaceRate: 0.6,
    // 소정급여일수 [가입기간 1년 미만, 1~3년, 3~5년, 5~10년, 10년 이상]
    days: { under50: [120, 150, 180, 210, 240], over50: [120, 180, 210, 240, 270] },
    sources: ['ueAct', 'ueDays', 'ueCap2026', 'minWage2026'],
  },
  parentalLeave: {
    general: [
      { from: 1, to: 3, rate: 1.0, cap: 2500000 },
      { from: 4, to: 6, rate: 1.0, cap: 2000000 },
      { from: 7, to: 18, rate: 0.8, cap: 1600000 },
    ],
    floor: 700000,
    sixPlusSixCaps: [2500000, 2500000, 3000000, 3500000, 4000000, 4500000],
    singleParent: null, // 한부모 특례 상한은 공식 원문 확인 전 → 계산 제한
    sources: ['plAct', 'pl2026', 'pl66'],
  },
  childCredit: { one: 250000, two: 550000, extra: 400000, sources: ['childCredit'] },
  freelancer: { incomeRate: 0.03, localRate: 0.1, sources: ['withholdingBiz', 'roundingAct'] },
  healthExtra: { threshold: 20000000, evalRates: { full: 1.0, half: 0.5 }, sources: ['healthIncome'] },
  standardCreditBiz: 70000,
  gift: {
    brackets: [
      { upTo: 100000000, base: 0, from: 0, rate: 0.1 },
      { upTo: 500000000, base: 10000000, from: 100000000, rate: 0.2 },
      { upTo: 1000000000, base: 90000000, from: 500000000, rate: 0.3 },
      { upTo: 3000000000, base: 240000000, from: 1000000000, rate: 0.4 },
      { upTo: Infinity, base: 1040000000, from: 3000000000, rate: 0.5 },
    ],
    deductions: { spouse: 600000000, ascendantAdult: 50000000, ascendantMinor: 20000000, descendant: 50000000, relative: 10000000, other: 0 },
    marriageBirth: 100000000,
    skipRate: 0.3, skipRateMinorOver2b: 0.4,
    filingCredit: 0.03,
    minTaxBase: 500000,
    sources: ['giftRate', 'giftDeduction', 'giftMarriage', 'giftSkip', 'giftSum', 'filingCredit', 'minTax'],
  },
  inheritance: {
    lumpSum: 500000000, basic: 200000000, childEach: 50000000,
    spouseMin: 500000000, spouseMax: 3000000000,
    funeralMin: 5000000, funeralMax: 10000000,
    sources: ['giftRate', 'inhBasic', 'inhSpouse', 'inhFinance', 'inhFuneral', 'filingCredit', 'inhStatus'],
  },
  acquisition: {
    houseLow: { upTo: 600000000, rate: 0.01 },
    houseHigh: { from: 900000000, rate: 0.03 },
    heavy8: 0.08, heavy12: 0.12, nonHouse: 0.04,
    firstHome: { maxPrice: 1200000000, maxRelief: 2000000 },
    sources: ['acqRate', 'acqHeavy', 'acqEdu', 'acqFarm', 'regulated'],
  },
  capitalGains: {
    basicDeduction: 2500000, highPriceLine: 1200000000,
    shortTerm: { under1: 0.7, under2: 0.6 },
    heavy: { two: 0.2, three: 0.3 },
    sources: ['cgtAct', 'cgtRate', 'cgtHeavyEnd', 'incomeTaxRate', 'localTax'],
  },
  rentConversion: { baseRate: 3.0, baseRateDate: '2026-10-22', add: 2.0, cap: 10.0, sources: ['rentConv', 'bokRate'] },
  dsr: { bankLimit: 40, nonBankLimit: 50, stressReference: 1.5, sources: ['dsrRule'] },
  propertyTax: {
    ratio: { general: 0.6, one: [{ upTo: 300000000, ratio: 0.43 }, { upTo: 600000000, ratio: 0.44 }, { upTo: Infinity, ratio: 0.45 }] },
    standard: [
      { upTo: 60000000, base: 0, from: 0, rate: 0.001 },
      { upTo: 150000000, base: 60000, from: 60000000, rate: 0.0015 },
      { upTo: 300000000, base: 195000, from: 150000000, rate: 0.0025 },
      { upTo: Infinity, base: 570000, from: 300000000, rate: 0.004 },
    ],
    special: [
      { upTo: 60000000, base: 0, from: 0, rate: 0.0005 },
      { upTo: 150000000, base: 30000, from: 60000000, rate: 0.001 },
      { upTo: 300000000, base: 90000, from: 150000000, rate: 0.002 },
      { upTo: Infinity, base: 240000, from: 300000000, rate: 0.0035 },
    ],
    specialMaxPrice: 900000000,
    eduRate: 0.2, urbanRate: 0.0014,
    sources: ['propRate', 'propRatio', 'propUrban'],
  },
};

/** 연도와 무관한 법정 기준 (시행일 기준으로 현재 유효) */
export const STATIC_RULES = {
  brokerage: {
    house: {
      sale: [
        { under: 50000000, rate: 0.006, cap: 250000 },
        { under: 200000000, rate: 0.005, cap: 800000 },
        { under: 900000000, rate: 0.004 },
        { under: 1200000000, rate: 0.005 },
        { under: 1500000000, rate: 0.006 },
        { under: Infinity, rate: 0.007 },
      ],
      lease: [
        { under: 50000000, rate: 0.005, cap: 200000 },
        { under: 100000000, rate: 0.004, cap: 300000 },
        { under: 600000000, rate: 0.003 },
        { under: 1200000000, rate: 0.004 },
        { under: 1500000000, rate: 0.005 },
        { under: Infinity, rate: 0.006 },
      ],
    },
    officetel: { sale: 0.005, lease: 0.004 },
    other: 0.009,
    sources: ['brokerFee'],
  },
  pyeongM2: 400 / 121,
  housingPoints: { homelessMax: 32, dependentsMax: 35, accountMax: 17, spouseAccountMax: 3, sources: ['housingPoints'] },
  smallTenant: {
    regions: {
      seoul: { label: '서울특별시', limit: 165000000, amount: 55000000 },
      metroDense: { label: '수도권 과밀억제권역(서울 제외)·세종·용인·화성·김포', limit: 145000000, amount: 48000000 },
      metroCity: { label: '광역시(과밀억제권역·군 제외)·안산·광주·파주·이천·평택', limit: 85000000, amount: 28000000 },
      other: { label: '그 밖의 지역', limit: 75000000, amount: 25000000 },
    },
    sources: ['smallTenant'],
  },
  hug: { priceMultiplier: 1.4, ltv: 0.9, sources: ['hugGuarantee'] },
  // 생활계산서 참고 기준(법정 기준 아님): 전세가율·부채비율 위험 신호 구간
  jeonseReference: { ratioCaution: 0.7, ratioDanger: 0.8, debtCaution: 0.7, debtDanger: 0.9 },
};

export const EXTRA_UNAVAILABLE_2027 = {
  unemployment: '2027년 구직급여 상·하한액은 2027년 최저임금(10,700원) 반영 개정이 고시되기 전이라 계산하지 않습니다.',
  parentalLeave: '2027년 육아휴직 급여 기준은 공식 확정 자료를 확인하기 전이라 계산하지 않습니다.',
  childCredit: '2027년 귀속 자녀세액공제는 세법개정 확정 전이라 계산하지 않습니다.',
  gift: '2027년 증여세는 2026년 세법개정안 국회 처리 결과 확정 전이라 계산하지 않습니다.',
  inheritance: '2027년 상속세는 2026년 세법개정안 국회 처리 결과 확정 전이라 계산하지 않습니다.',
  acquisition: '2027년 취득세는 2026년 지방세제 개편안 확정 전이라 계산하지 않습니다.',
  capitalGains: '2027년 양도분은 세법개정 확정 전이라 계산하지 않습니다.',
  propertyTax: '2027년 재산세 공정시장가액비율(1세대1주택 특례)은 아직 정해지지 않았습니다.',
  healthExtra: null,
};
