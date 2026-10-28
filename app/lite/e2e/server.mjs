import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const types = { '.svg':'image/svg+xml', '.png':'image/png', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.html':'text/html', '.json':'application/json', '.webmanifest':'application/manifest+json', '.woff2':'font/woff2' };
const app=http.createServer((req,res)=>{
  const url = new URL(req.url,'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  // Local QA fixtures only; this server is never deployed.
  if(pathname === '/_member/__qa') { res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'}).end('<html><head></head><body><h1>QA_AUTH_PAGE_ONLY</h1></body></html>'); return; }
  if(pathname === '/sw.js' && url.searchParams.get('__qa_revision') === 'next') { const code=fs.readFileSync(path.join(root,'sw.js'),'utf8').replace(/const CACHE = '[^']+';/,"const CACHE = 'lite-qa-next';"); res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(code); return; }
  const file=path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'}); fs.createReadStream(file).pipe(res);
});
const start=()=>new Promise((resolve,reject)=>{
  if(app.listening)return resolve();
  app.once('error',reject);app.listen(8792,'127.0.0.1',()=>{app.off('error',reject);resolve();});
});
const stop=()=>new Promise((resolve,reject)=>{
  if(!app.listening)return resolve();
  app.close(error=>error?reject(error):resolve());app.closeAllConnections();
});
await start();
// Separate loopback-only control keeps restoration possible while the origin is
// genuinely not listening. It never serves product files or calls real APIs.
let control=Promise.resolve();
http.createServer((req,res)=>{
  const action=req.method==='POST'&&req.url==='/stop'?stop:req.method==='POST'&&req.url==='/start'?start:null;
  if(!action){res.writeHead(404).end();return;}
  control=control.then(action).then(()=>{res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({online:app.listening}));},()=>{res.writeHead(500).end('test origin control failed');});
}).listen(8793,'127.0.0.1');
