// Maintenance commands that run beside (or without) the server.
//   node cli.mjs backup <file>   consistent copy of the database, safe while the server runs
//   node cli.mjs stats           number of accounts, wardrobes and photos (no personal data)
//   node cli.mjs metrics [--exclude a@b.c,...] [--show-small] [--json]
//                                pilot metrics by sign-up week (counts only; see src/metrics.js)
//   node cli.mjs fetch-model [file]  download (or take a local copy of) the pinned U-2-Net model
//   node cli.mjs community review            reported or hidden posts (no emails)
//   node cli.mjs community hide|restore|delete <post id>
import { loadConfig } from './src/config.js';
import { openDatabase, backupDatabase } from './src/db.js';
import { installMaskModel, MASK_MODEL } from './src/photo-mask.js';
import { communityAdmin } from './src/community.js';
import { pilotMetrics, formatMetrics } from './src/metrics.js';

const [command, target, postId] = process.argv.slice(2);
const config = loadConfig();
if (command === 'fetch-model') {
  console.log(`U-2-Net 모델(약 ${Math.round(MASK_MODEL.bytes / 1e6)}MB)을 ${target ? target + '에서 복사' : '내려받기'}하고 해시를 확인해요…`);
  const bytes = await installMaskModel(config.maskModel, { from: target || null });
  console.log(`저장했어요: ${config.maskModel} (${bytes} bytes). 서버를 다시 켜면 사진 배경 처리가 켜져요.`);
  process.exit(0);
}
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
      communityMembers: one('SELECT COUNT(*) FROM community_members'),
      posts: one('SELECT COUNT(*) FROM posts'),
      hiddenPosts: one('SELECT COUNT(*) FROM posts WHERE hidden_at IS NOT NULL'),
    });
  } else if (command === 'metrics') {
    const args = process.argv.slice(3);
    const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] || '' : ''; };
    const metrics = pilotMetrics(db, { exclude: value('--exclude').split(',').filter(Boolean), showSmall: args.includes('--show-small') });
    console.log(args.includes('--json') ? JSON.stringify(metrics, null, 2) : formatMetrics(metrics));
  } else if (command === 'community' && target === 'review') {
    const rows = communityAdmin(db).review();
    if (!rows.length) console.log('신고되거나 숨겨진 글이 없어요.');
    for (const row of rows) console.log(row);
  } else if (command === 'community' && ['hide', 'restore', 'delete'].includes(target) && postId) {
    const admin = communityAdmin(db);
    const done = target === 'hide' ? admin.hide(postId) : target === 'restore' ? admin.restore(postId) : admin.remove(postId);
    console.log(done ? { hide: '숨겼어요.', restore: '다시 보이게 했어요. 그 신고 기록은 정리했어요.', delete: '글과 사진을 지웠어요.' }[target] : '그 번호의 글이 없어요.');
    if (!done) process.exitCode = 1;
  } else {
    console.log('사용: node cli.mjs backup <파일> | stats | metrics [--exclude 이메일,…] [--show-small] [--json] | fetch-model [받아 둔 파일] | community review | community hide|restore|delete <글 번호>');
    process.exitCode = 1;
  }
} finally {
  db.close();
}
