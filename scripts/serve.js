#!/usr/bin/env node
/**
 * 정적 미리보기 서버 (의존성 없음).
 *   node scripts/serve.js              → site/ 를 http://localhost:4173 에서 제공
 *   node scripts/serve.js --dir dist   → 빌드 결과 제공
 *   PORT=8080 node scripts/serve.js
 *
 * - /salary-proration 처럼 확장자 없는 주소는 salary-proration/index.html 로 응답 (직접 접속·새로고침 대응)
 * - /salary-proration/ 은 /salary-proration 으로 301 이동 (주소 하나로 통일)
 * - 모든 응답에 X-Robots-Tag: noindex 를 붙여 미리보기 환경의 검색 노출을 막는다.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.ico': 'image/x-icon',
};

function resolveFile(root, urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const target = path.normalize(path.join(root, decoded));
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  const candidates = path.extname(target) ? [target] : [path.join(target, 'index.html'), `${target}.html`];
  for (const file of candidates) {
    try {
      if (fs.statSync(file).isFile()) return file;
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}

export function createServer({ dir = 'site', robotsHeader = true } = {}) {
  const root = path.resolve(ROOT_DIR, dir);
  return http.createServer((req, res) => {
    let urlPath;
    try {
      urlPath = new URL(req.url, 'http://localhost').pathname;
      decodeURIComponent(urlPath);
    } catch {
      res.writeHead(400).end('Bad Request');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }

    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (robotsHeader) headers['X-Robots-Tag'] = 'noindex, nofollow';

    if (urlPath.length > 1 && urlPath.endsWith('/')) {
      const search = new URL(req.url, 'http://localhost').search;
      res.writeHead(301, { ...headers, Location: urlPath.replace(/\/+$/, '') + search }).end();
      return;
    }

    const file = resolveFile(root, urlPath === '/' ? '/index.html' : urlPath);
    if (!file) {
      const notFound = path.join(root, '404.html');
      res.writeHead(404, { ...headers, 'Content-Type': TYPES['.html'] });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(notFound).on('error', () => res.end('Not Found')).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const dirIndex = args.indexOf('--dir');
  const dir = dirIndex >= 0 ? args[dirIndex + 1] : 'site';
  const port = Number(process.env.PORT ?? 4173);
  const host = process.env.HOST ?? '127.0.0.1';
  // --production-headers: 운영 호스팅처럼 X-Robots-Tag 를 붙이지 않음 (운영 빌드 로컬 점검용)
  createServer({ dir, robotsHeader: !args.includes('--production-headers') }).listen(port, host, () => {
    console.log(`정산노트 미리보기: http://${host}:${port}/  (폴더: ${dir})`);
    console.log(`  홈:          http://${host}:${port}/`);
    console.log(`  월급 일할계산기: http://${host}:${port}/salary-proration`);
  });
}
