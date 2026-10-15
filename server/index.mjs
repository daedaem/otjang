// Starts the 어울 server: `node index.mjs` (settings: see README.md).
import http from 'node:http';
import { loadConfig } from './src/config.js';
import { openDatabase } from './src/db.js';
import { createApp } from './src/app.js';

const config = loadConfig();
const db = openDatabase(config.database);
const app = createApp({
  db,
  config,
  log: (kind, detail) => {
    if (kind === 'error') console.error(new Date().toISOString(), detail);
    else if (kind === 'request') console.log(new Date().toISOString(), detail);
    else console.log(new Date().toISOString(), kind);
  },
});
const server = http.createServer((req, res) => app.handle(req, res));
server.requestTimeout = 120000;
server.listen(config.port, config.host, () => {
  const { port } = server.address();
  console.log(`어울 서버: http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${port}`);
  console.log(`데이터 파일: ${config.database}`);
  if (!config.inviteCode) console.log('주의: EOUL_INVITE_CODE가 없어 주소를 아는 누구나 가입할 수 있어요.');
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  });
