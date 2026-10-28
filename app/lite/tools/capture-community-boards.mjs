// Local synthetic UI evidence using the actual community handler and memory SQLite.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { serveCommunity, communityCall, communityRequest } from '../e2e/community-fixture.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const baseline = process.argv[2];
if (!baseline) throw Error('Pass the untouched baseline dist directory');
const output = path.join(root, 'docs/log/2026-10/evidence/community-boards');
fs.mkdirSync(output, { recursive: true });
const NOW = Date.parse('2026-10-29T03:00:00Z');
async function serve(folder) {
  const base = path.resolve(folder);
  const server = http.createServer((req, res) => {
    const file = path.resolve(base, '.' + new URL(req.url, 'http://local').pathname.replace(/^\/$/, '/index.html'));
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
const servers = [['before', await serve(baseline)], ['after', await serve(path.join(root, 'app/lite/dist'))]];
const manifest = {
  baselineSource: JSON.parse(fs.readFileSync(path.join(baseline, 'build-info.json'))).commit,
  afterSource: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  capturedAt: new Date().toISOString(), fixtureTime: new Date(NOW).toISOString(),
  synthetic: true, externalRequests: 'blocked', realPosts: 0,
  note: 'Only outfits is a before/after comparison. Other states are newly implemented views.',
  captures: [],
};
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  for (const [version, server] of servers) for (const device of [
    { name: 'mobile320', width: 320, height: 780, colorScheme: 'light' },
    { name: 'mobile390', width: 390, height: 844, colorScheme: 'light' },
    { name: 'mobile-dark', width: 390, height: 844, colorScheme: 'dark' },
    { name: 'desktop', width: 1440, height: 1000, colorScheme: 'light' },
  ]) {
    const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, colorScheme: device.colorScheme, locale: 'ko-KR', timezoneId: 'Asia/Seoul', serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.addInitScript(now => { Date.now = () => now; }, NOW);
    const page = await context.newPage();
    const { env, posted } = await serveCommunity(page, 'private', {}, undefined, { origin: server.url, start: '/?photos=0#/closet', now: () => NOW });
    const owner = { member: 'owner', operator: true }, other = { member: 'qa-other', operator: false };
    const call = async (section, body, who = owner, at = NOW) => {
      const response = await communityCall(env, section, body, who, { now: () => at });
      if (!response.ok) throw Error('Synthetic seed failed: ' + response.status + ' ' + await response.text());
      return response.json();
    };
    await call('join', { name: '합성회원', rules: 1, age14: true }, owner, NOW - 4000);
    await call('join', { name: '코디예시', rules: 1, age14: true }, other, NOW - 3000);
    for (const [who, text, pieces, at] of [
      [owner, '출근할 때 입는 흰 셔츠와 베이지 바지예요. (합성 예시)', [{ kind: 'shirt', color: 'white', label: '흰 셔츠' }, { kind: 'pants', color: 'beige', label: '베이지 바지' }], NOW - 2000],
      [other, '선선한 날에는 네이비 니트를 함께 입어요. (합성 예시)', [{ kind: 'knit', color: 'navy', label: '네이비 니트' }, { kind: 'jeans', color: 'indigo', label: '인디고 데님' }], NOW - 1000],
    ]) await call('posts', { post: { text, pieces, consent: false }, photos: [] }, who, at);
    await call('posts', { post: { board: 'sale', title: '셔츠 세일을 찾았어요 (합성)', text: '가격과 재고는 출처에서 확인해 주세요.', pieces: [], consent: false, sale: { merchant: '예시 판매처', price: 39000, discount: 30, endDate: '2026-11-02', sourceUrl: 'https://shop.example.com/deal' } }, photos: [] }, other);
    await call('posts', { post: { board: 'free', title: '오래 입는 셔츠, 어떻게 고르세요? (합성)', text: '원단과 기장을 먼저 보는 편이에요.\n여러분은 어떤 점을 확인하시나요?', pieces: [], consent: false }, photos: [] }, other);
    await call('posts', { post: { board: 'free', title: '이번 주 옷 정리 (합성)', text: '자주 입는 옷부터 다시 꺼내 봤어요.', pieces: [], consent: false }, photos: [] });
    const shot = async state => {
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Horizontal overflow: ' + device.name + '/' + state);
      const file = `${version}-${device.name}-${state}.png`, target = path.join(output, file);
      await page.screenshot({ path: target, animations: 'disabled' });
      const bytes = fs.readFileSync(target), postOrder = await page.locator('[data-community-post] .cm-meta b').allTextContents();
      if (version === 'after' && state === 'outfits') {
        const before = manifest.captures.find(c => c.file === `before-${device.name}-outfits.png`);
        if (JSON.stringify(before?.postOrder) !== JSON.stringify(postOrder)) throw Error('Outfit order changed');
      }
      manifest.captures.push({ file, state, viewport: { width: device.width, height: device.height }, colorScheme: device.colorScheme, postOrder, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
    };
    await page.locator('[data-react-closet]').waitFor();
    await page.locator('#tabs [data-tab="community"]').click();
    await page.getByRole('button', { name: '코디 올리기', exact: true }).waitFor();
    await page.locator('[data-community-post]').nth(1).waitFor();
    await shot('outfits');
    if (version === 'after') {
      const nav = page.getByRole('navigation', { name: '게시판', exact: true });
      await nav.getByRole('link', { name: '세일 정보', exact: true }).click();
      await page.locator('[data-community-post]').filter({ hasText: '셔츠 세일을 찾았어요' }).waitFor();
      await shot('sale');
      await nav.getByRole('link', { name: '자유게시판', exact: true }).click();
      await page.locator('[data-community-post]').nth(1).waitFor();
      await shot('free');
      await page.getByRole('button', { name: '글쓰기', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '자유게시판 글쓰기', exact: true });
      await dialog.getByLabel('제목', { exact: true }).fill('옷장 없이 바로 이야기하기 (합성)');
      await dialog.getByLabel('내용', { exact: true }).fill('사진은 선택이고, 글만 올려도 돼요.');
      await shot('editor');
      page.once('dialog', d => d.accept());
      await dialog.getByRole('button', { name: '닫기', exact: true }).click();
      const feed = await communityRequest(env, 'GET', 'feed?board=sale', undefined, owner, { now: () => NOW });
      const item = (await feed.json()).items[0];
      await call('reports', { post: item.id, reason: 'rights' });
      await page.getByRole('button', { name: '신고 목록 새로고침', exact: true }).click();
      await page.locator('[data-community-review]').waitFor();
      await page.locator('.cm-review').scrollIntoViewIfNeeded();
      await shot('review');
    }
    if (posted.length) throw Error('Evidence capture must not submit from UI');
    await context.close();
  }
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ captures: manifest.captures.length, output }));
} finally { await browser.close(); await Promise.all(servers.map(([, server]) => server.close())); }
