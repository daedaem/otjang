// Maintenance commands that run beside (or without) the server.
//   node cli.mjs backup <file>   consistent copy of the database, safe while the server runs
//   node cli.mjs stats           number of accounts, wardrobes and photos (no personal data)
import { loadConfig } from './src/config.js';
import { openDatabase, backupDatabase } from './src/db.js';

const [command, target] = process.argv.slice(2);
const config = loadConfig();
const db = openDatabase(config.database);
try {
  if (command === 'backup' && target) {
    backupDatabase(db, target);
    console.log(`백업을 만들었어요: ${target}`);
    console.log('이 파일에는 계정 이메일, 비밀번호 해시, 옷장 기록과 사진이 들어 있어요. 안전한 곳에 보관하고 저장소에 올리지 마세요.');
  } else if (command === 'stats') {
    const one = (sql) => Object.values(db.prepare(sql).get())[0];
    console.log({
      users: one('SELECT COUNT(*) FROM users'),
      wardrobes: one('SELECT COUNT(*) FROM wardrobes'),
      photos: one('SELECT COUNT(*) FROM photos'),
      photoBytes: one('SELECT COALESCE(SUM(size), 0) FROM photos'),
      sessions: one('SELECT COUNT(*) FROM sessions'),
    });
  } else {
    console.log('사용: node cli.mjs backup <파일> | node cli.mjs stats');
    process.exitCode = 1;
  }
} finally {
  db.close();
}
