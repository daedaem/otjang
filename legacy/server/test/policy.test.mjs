import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { renderMarkdown, policyDocument, policyPage } from '../src/policy.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { createApp, AGREEMENT_VERSION } from '../src/app.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-policy-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('the policy Markdown keeps to a small, escaped subset', () => {
  const html = renderMarkdown([
    '# 제목 <script>',
    '',
    '첫 줄과',
    '이어진 줄 **굵게** `코드`',
    '',
    '- 하나',
    '  - 안쪽',
    '- 둘 [메일](mailto:a@example.com) [웹](https://example.com/a?b=1&c=2) [나쁜](javascript:alert(1))',
    '',
    '| 구분 | 내용 |',
    '|---|---|',
    '| 계정 | 이메일 <b> |',
    '',
    '> 인용',
    '',
    '[[채울 칸: 보관 기간]]',
  ].join('\n'));
  assert.match(html, /<h1>제목 &lt;script&gt;<\/h1>/);
  assert.match(html, /<p>첫 줄과 이어진 줄 <strong>굵게<\/strong> <code>코드<\/code><\/p>/);
  assert.match(html, /<ul><li>하나<ul><li>안쪽<\/li><\/ul><\/li><li>둘 /);
  assert.match(html, /<a href="mailto:a@example.com" rel="noopener noreferrer">메일<\/a>/);
  assert.match(html, /<a href="https:\/\/example.com\/a\?b=1&amp;c=2" rel="noopener noreferrer">웹<\/a>/);
  assert.match(html, /\[나쁜\]\(javascript:alert\(1\)\)/, 'other link schemes stay text');
  assert.match(html, /<thead><tr><th>구분<\/th><th>내용<\/th><\/tr><\/thead><tbody><tr><td>계정<\/td><td>이메일 &lt;b&gt;<\/td><\/tr><\/tbody>/);
  assert.match(html, /<blockquote><p>인용<\/p><\/blockquote>/);
  assert.match(html, /<mark>\[운영자가 채울 칸: 보관 기간\]<\/mark>/);
  assert.ok(!/<script|<b>/.test(html));
});

test('the template shows as a draft until the operator writes their own copy without blanks', () => {
  const values = { OPERATOR_NAME: '어울 스튜디오', OPERATOR_EMAIL: 'help@example.com', AGREEMENT_VERSION, REVIEW_DAYS: 7 };
  const template = policyDocument('privacy', { dir: path.join(temp, 'none'), values });
  assert.equal(template.fromOperator, false);
  assert.equal(template.draft, true);
  assert.match(template.text, /- 운영자: 어울 스튜디오/);
  assert.match(template.text, /- 시행일: \[\[채울 칸: 시행일\]\]/, 'an unset value becomes a blank to fill');
  assert.match(template.text, new RegExp(`가입 안내 버전: ${AGREEMENT_VERSION.replace(/\./g, '\\.')}`));

  const dir = path.join(temp, 'own');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'privacy.md'), '# 처리방침\n\n운영자: {{OPERATOR_NAME}}, 문의 {{OPERATOR_EMAIL}}\n');
  const own = policyDocument('privacy', { dir, values });
  assert.deepEqual([own.fromOperator, own.draft], [true, false]);
  fs.writeFileSync(path.join(dir, 'terms.md'), '# 약관\n\n시행일: {{EFFECTIVE_DATE}}\n');
  assert.equal(policyDocument('terms', { dir, values }).draft, true, 'a setting left empty keeps it a draft');
  // Values cannot add blanks, placeholders or markup.
  const tricky = policyPage('privacy', { dir, values: { ...values, OPERATOR_NAME: '<b>[[채울 칸: x]]</b>{{OPERATOR_EMAIL}}' } });
  assert.equal(tricky.draft, false);
  assert.match(tricky.html, /운영자: &lt;b&gt;채울 칸: x&lt;\/b&gt;OPERATOR_EMAIL, 문의 help@example.com/);
  assert.throws(() => policyDocument('../secret', { dir, values }));
});

test('the server shows /privacy and /terms to anyone and tells the app where they are', async (t) => {
  const db = openDatabase(':memory:');
  const config = {
    allowedOrigins: [], trustProxy: null, inviteCode: null, scryptLog2N: 10, sessionDays: 60, appFile: '/none',
    operator: { name: '어울 스튜디오', email: 'help@example.com', businessNumber: '123-45-67890' },
    policyDir: path.join(temp, 'none'), affiliateHosts: ['link.coupang.com'],
  };
  const server = http.createServer((req, res) => createApp({ db, config }).handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(() => { db.close(); resolve(); })));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [name, title] of [['privacy', '개인정보 처리방침'], ['terms', '이용약관']]) {
    const response = await fetch(`${base}/${name}`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(html, new RegExp(`<title>어울 ${title}</title>`));
    assert.match(html, /<strong>초안<\/strong>/);
    assert.match(html, /어울 스튜디오/);
    assert.ok(!html.includes('<script'));
  }
  const health = await (await fetch(`${base}/v1/health`)).json();
  assert.deepEqual(health.operator, { name: '어울 스튜디오', email: 'help@example.com', businessNumber: '123-45-67890' });
  assert.deepEqual(health.policy, { privacy: '/privacy', terms: '/terms', draft: true });
  assert.deepEqual(health.affiliateHosts, ['link.coupang.com']);
  assert.equal((await fetch(`${base}/privacy.md`)).status, 404);
});

test('operator settings are short plain text; affiliate hosts are host names', () => {
  const config = loadConfig({ EOUL_OPERATOR_NAME: ' 어울 스튜디오 ', EOUL_AFFILIATE_HOSTS: 'Link.Coupang.com, ' });
  assert.equal(config.operator.name, '어울 스튜디오');
  assert.equal(config.operator.email, null);
  assert.deepEqual(config.affiliateHosts, ['link.coupang.com']);
  assert.throws(() => loadConfig({ EOUL_OPERATOR_NAME: '<b>' }), /EOUL_OPERATOR_NAME/);
  assert.throws(() => loadConfig({ EOUL_AFFILIATE_HOSTS: 'https://link.coupang.com/a' }), /호스트 이름만/);
});
