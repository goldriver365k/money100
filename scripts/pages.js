/**
 * 사이트 페이지 목록. 새 계산기를 추가하면 여기에 등록한다 (canonical·사이트맵 생성에 사용).
 * public: 공개 검수(운영 빌드 검수, docs/test-report-production.md)를 통과한 페이지만 true.
 *         false 인 페이지는 사이트맵에서 빠지고 noindex 를 유지한다.
 */
export const PAGES = [
  { path: '/', file: 'index.html', priority: '1.0', public: true },
  { path: '/salary-proration', file: 'salary-proration/index.html', priority: '0.9', public: true },
  { path: '/weekly-holiday-pay', file: 'weekly-holiday-pay/index.html', priority: '0.9', public: true },
  { path: '/annual-salary-net', file: 'annual-salary-net/index.html', priority: '0.9', public: true },
  { path: '/severance-pay', file: 'severance-pay/index.html', priority: '0.9', public: true },
  { path: '/hourly-wage', file: 'hourly-wage/index.html', priority: '0.9', public: true },
  { path: '/social-insurance', file: 'social-insurance/index.html', priority: '0.9', public: true },
  { path: '/vat', file: 'vat/index.html', priority: '0.8', public: true },
  { path: '/loan-interest', file: 'loan-interest/index.html', priority: '0.8', public: true },
  { path: '/monthly-salary-net', file: 'monthly-salary-net/index.html', priority: '0.8', public: true },
  { path: '/unemployment-benefit', file: 'unemployment-benefit/index.html', priority: '0.8', public: true },
  { path: '/annual-leave-pay', file: 'annual-leave-pay/index.html', priority: '0.8', public: true },
  { path: '/overtime-pay', file: 'overtime-pay/index.html', priority: '0.8', public: true },
  { path: '/parental-leave-pay', file: 'parental-leave-pay/index.html', priority: '0.8', public: true },
];
