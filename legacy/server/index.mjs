// Starts the 어울 server: `node index.mjs` (settings: see README.md).
import http from 'node:http';
import { loadConfig } from './src/config.js';
import { openDatabase } from './src/db.js';
import { createApp } from './src/app.js';
import { createMaskService } from './src/photo-mask.js';
import { createSupply } from './src/supply.js';
import { createMailer } from './src/mailer.js';

const config = loadConfig();
const db = openDatabase(config.database);
const log = (kind, detail) => {
  if (kind === 'error') console.error(new Date().toISOString(), detail);
  else if (kind === 'request') console.log(new Date().toISOString(), detail);
  else console.log(new Date().toISOString(), kind);
};
let maskService = null;
try {
  maskService = await createMaskService({ modelFile: config.maskModel, threads: config.maskThreads, log: (message) => log(message) });
} catch (error) {
  log('error', error);
  log('사진 배경 처리 꺼짐: 모델을 불러오지 못했어요.');
}
const supply = createSupply({ env: process.env, log: (kind, detail) => log(`${kind}: ${detail}`) });
for (const source of supply.sources()) log(`가격 출처 ${source.name}: ${source.status === 'not-connected' ? `미연동 (${source.needs.join(', ')})` : source.status}`);
const mailer = createMailer(process.env, { log: (message) => log(message) });
log(mailer.enabled ? `메일 발송: ${mailer.kind}${mailer.kind === 'console' ? ' (링크를 이 로그에 출력해요. 실제 사용자에게는 쓰지 마세요)' : ''}` : `메일 발송 꺼짐: ${mailer.reason} 이메일 확인·비밀번호 재설정을 쓸 수 없어요.`);
const app = createApp({ db, config, maskService, supply, mailer, log });
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
