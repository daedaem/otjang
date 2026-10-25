import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const types = { '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.html':'text/html', '.json':'application/json', '.webmanifest':'application/manifest+json', '.woff2':'font/woff2' };
http.createServer((req,res)=>{
  // Test-only transport fault: make upstream network requests fail while the
  // browser can still execute its installed service worker and cached responses.
  // End without an HTTP response rather than forcibly destroying the socket.
  // The probes must still fail; the SW must serve a fresh document from cache.
  if (req.headers['x-e2e-network-down'] === '1') { req.socket.end(); return; }
  const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream'}); fs.createReadStream(file).pipe(res);
}).listen(8792,'127.0.0.1');
