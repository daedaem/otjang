import http from 'node:http';
import { readFile } from 'node:fs/promises';
const file = new URL('../WearNext.html', import.meta.url);
const port = Number(process.env.PORT || 4173);
const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  if (req.url?.split('?')[0] !== '/' && req.url?.split('?')[0] !== '/index.html') {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const html = await readFile(file);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : html);
  } catch {
    res.writeHead(503).end('Run npm run build first.');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`WearNext ready on port ${port}`));
