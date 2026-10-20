// 이 PC에서 설치형 앱 확인: dist/를 보내고 POST /api/rank는 Pages 함수와 같은 코드(functions/api/rank.js)로 처리한다.
// 사용: npm run build && node dev.mjs [--port 8790] [--fake]
//   키: 환경 변수 ANTHROPIC_API_KEY가 있으면 실제 Claude를 부른다(비용 발생). --fake는 가짜 응답(비용 0).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from './functions/api/rank.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, 'dist');
const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 8790;
const FAKE = process.argv.includes('--fake');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

// 가짜 응답: 후보를 받은 순서의 반대로 세우고, 자료에 있는 가격만 써서 이유를 단다.
export const fakeClient = {
  messages: {
    async create({ messages }) {
      const items = JSON.parse(messages[0].content.match(/후보\(엔진 순서\): (\[.*\])\n/)[1]);
      const ranking = [...items].reverse().map((x) => ({ id: x.id, reason: `${x.price.toLocaleString('ko-KR')}원, 후기 ${x.reviews}개예요.`, fit: '괜찮아요' }));
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ summary: '가짜 응답이에요.', ranking }) }] };
    },
  },
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/api/rank') {
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: Buffer.concat(chunks) });
    const out = await handle(request, process.env, FAKE ? { client: fakeClient } : {});
    res.writeHead(out.status, Object.fromEntries(out.headers)).end(await out.text());
    return;
  }
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}${FAKE ? ' (가짜 AI 응답)' : ''}`));
