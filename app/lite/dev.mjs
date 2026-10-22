// 이 PC에서 설치형 앱 확인: dist/를 보내고 POST /api/rank는 Pages 함수와 같은 코드(functions/api/rank.js)로 처리한다.
// 사용: npm run build && node dev.mjs [--port 8790] [--fake]
//   --fake만 권한·예산 검사를 시험용으로 통과시키고 가짜 AI를 쓴다(비용 0).
//   실제 AI는 운영 함수와 같은 Access 인증·공유 예산 연결이 모두 있어야 호출한다(비용 발생).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, MAX_BODY } from './functions/api/rank.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, 'dist');
const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 8790;
const FAKE = process.argv.includes('--fake');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

// 서버가 채운 JSON 상품 사실만 사용한다. 순위는 역순, 상담은 가짜임을 밝히는 답이다.
export const fakeClient = {
  messages: {
    async create({ messages, system }) {
      const { items } = JSON.parse(messages[0].content);
      let answer;
      if (system.includes('"on_topic"')) {
        const first = items[0];
        const price = Number.isFinite(first?.price) ? `첫 후보의 수집가는 ${first.price.toLocaleString('ko-KR')}원이에요.` : '이 질문에서 확인된 상품 가격이 없어요.';
        answer = { on_topic: true, answer: `가짜 상담 응답이에요. ${price}`, product_ids: first ? [first.id] : [] };
      } else {
        const ranking = [...items].reverse().map((x) => ({ id: x.id, reason: Number.isFinite(x.price) ? `수집가 ${x.price.toLocaleString('ko-KR')}원인 후보예요.` : '가격이 확인되지 않은 후보예요.', fit: '괜찮아요' }));
        answer = { summary: '가짜 응답이에요.', ranking };
      }
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(answer) }] };
    },
  },
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/api/rank') {
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    const rejectBody = (status) => {
      req.resume();
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(JSON.stringify({ code: 'bad_request', message: '요청 본문이 올바르지 않아요.' }));
    };
    const declared = req.headers['content-length'];
    if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY)) { rejectBody(413); return; }
    const chunks = [];
    let size = 0;
    try {
      // 상한을 넘긴 chunked 본문도 더 모으지 않는다. 연결을 닫지 않고 413을 보낸 뒤 나머지는 버린다.
      for await (const c of req.iterator({ destroyOnReturn: false })) {
        size += c.length;
        if (size > MAX_BODY) { rejectBody(413); return; }
        chunks.push(c);
      }
    } catch { rejectBody(400); return; }
    const headers = Object.fromEntries(Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value]));
    const request = new Request(url, { method: 'POST', headers, body: Buffer.concat(chunks) });
    const options = FAKE ? { client: fakeClient, authorize: async () => ({ ok: true }), reserve: async () => ({ ok: true }) } : {};
    const out = await handle(request, process.env, options);
    res.writeHead(out.status, Object.fromEntries(out.headers)).end(await out.text());
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  let file;
  try { file = path.join(DIST, decodeURIComponent(url.pathname)); } catch { res.writeHead(400).end(); return; }
  if (file !== DIST && !file.startsWith(`${DIST}${path.sep}`)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}${FAKE ? ' (가짜 AI 응답 · 비용 0)' : ' (실제 호출은 인증·예산 연결 필수)'}`));
