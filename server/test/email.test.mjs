import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { openDatabase } from '../src/db.js';
import { createApp, AGREEMENT_VERSION } from '../src/app.js';
import { createMailer } from '../src/mailer.js';
import { sendSmtp } from '../src/smtp.js';

async function start({ mailer } = {}) {
  const clock = { t: Date.parse('2026-10-15T00:00:00Z') };
  const db = openDatabase(':memory:');
  const outbox = [];
  const mail = mailer === undefined
    ? { enabled: true, kind: 'memory', publicUrl: 'https://eoul.example', send: async (m) => { outbox.push(m); } }
    : mailer;
  const logs = [];
  const app = createApp({ db, mailer: mail, now: () => clock.t, log: (...e) => logs.push(e),
    config: { allowedOrigins: [], trustProxy: null, inviteCode: null, scryptLog2N: 10, sessionDays: 60, appFile: '/none' } });
  const server = http.createServer((req, res) => app.handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { token, json } = {}) => {
    const r = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}) }, body: json ? JSON.stringify(json) : undefined });
    return { status: r.status, data: r.status === 204 ? null : await r.json() };
  };
  const signup = (email = 'me@example.com') => call('POST', '/v1/auth/signup', { json: { email, password: 'correct horse', agreements: { version: AGREEMENT_VERSION, terms: true, privacy: true, age14: true } } });
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const linkToken = (message, purpose) => new RegExp(`https://eoul\\.example/#${purpose}=([A-Za-z0-9_-]+)`).exec(message.text)?.[1];
  return { db, clock, outbox, logs, call, signup, tick, linkToken, close: () => new Promise((resolve) => server.close(() => { db.close(); resolve(); })) };
}

test('the sending method is a setting: off by default, links need the public address, SMTP needs a host', () => {
  assert.deepEqual([createMailer({}).enabled, createMailer({}).reason], [false, 'EOUL_MAIL이 설정되지 않았어요.']);
  assert.equal(createMailer({ EOUL_MAIL: 'console' }).enabled, false, 'no public address, no links');
  assert.equal(createMailer({ EOUL_MAIL: 'console', EOUL_PUBLIC_URL: 'http://eoul.example' }).enabled, false, 'plain http only for this computer');
  assert.equal(createMailer({ EOUL_MAIL: 'console', EOUL_PUBLIC_URL: 'https://eoul.example/app' }).publicUrl, 'https://eoul.example');
  assert.equal(createMailer({ EOUL_MAIL: 'smtp', EOUL_PUBLIC_URL: 'https://eoul.example' }).enabled, false);
  assert.equal(createMailer({ EOUL_MAIL: 'smtp', EOUL_PUBLIC_URL: 'https://eoul.example', EOUL_SMTP_HOST: 'smtp.example', EOUL_SMTP_FROM: 'no-reply@example.com' }).kind, 'smtp');
});

test('sign-up sends a one-time verification link; only its hash is stored; it works once and expires', async (t) => {
  const s = await start();
  t.after(s.close);
  const { token: session } = (await s.signup()).data;
  await s.tick();
  assert.equal(s.outbox.length, 1);
  assert.equal(s.outbox[0].to, 'me@example.com');
  const token = s.linkToken(s.outbox[0], 'verify');
  assert.ok(token);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM email_tokens WHERE token_hash = ?').get(token).n, 0, 'the raw token is not stored');
  assert.equal((await s.call('GET', '/v1/me', { token: session })).data.emailVerified, false);
  assert.equal((await s.call('POST', '/v1/auth/verify/confirm', { json: { token } })).status, 200);
  assert.equal((await s.call('GET', '/v1/me', { token: session })).data.emailVerified, true);
  assert.equal((await s.call('POST', '/v1/auth/verify/confirm', { json: { token } })).data.error.code, 'bad-token', 'a link works once');
  assert.deepEqual((await s.call('POST', '/v1/auth/verify/request', { token: session })).data, { sent: false, emailVerified: true });

  const other = (await s.signup('late@example.com')).data.token;
  await s.tick();
  const late = s.linkToken(s.outbox.at(-1), 'verify');
  s.clock.t += 25 * 3600 * 1000;
  assert.equal((await s.call('POST', '/v1/auth/verify/confirm', { json: { token: late } })).data.error.code, 'bad-token', 'expired after a day');
  const again = await s.call('POST', '/v1/auth/verify/request', { token: other });
  assert.equal(again.status, 202);
  assert.equal((await s.call('POST', '/v1/auth/verify/confirm', { json: { token: s.linkToken(s.outbox.at(-1), 'verify') } })).status, 200);
});

test('password reset: the same answer for any email, a 30-minute single link, every device signs in again', async (t) => {
  const s = await start();
  t.after(s.close);
  const { token: session } = (await s.signup()).data;
  await s.tick();
  const sent = s.outbox.length;
  const unknown = await s.call('POST', '/v1/auth/password/forgot', { json: { email: 'nobody@example.com' } });
  const known = await s.call('POST', '/v1/auth/password/forgot', { json: { email: 'ME@example.com' } });
  assert.equal(unknown.status, 202);
  assert.deepEqual(unknown.data, known.data, 'no hint whether the email has an account');
  assert.equal(s.outbox.length, sent + 1);
  const first = s.linkToken(s.outbox.at(-1), 'reset');
  await s.call('POST', '/v1/auth/password/forgot', { json: { email: 'me@example.com' } });
  const second = s.linkToken(s.outbox.at(-1), 'reset');
  assert.equal((await s.call('POST', '/v1/auth/password/reset', { json: { token: first, password: 'new horse battery' } })).data.error.code, 'bad-token', 'a newer link replaces the older one');
  assert.equal((await s.call('POST', '/v1/auth/password/reset', { json: { token: second, password: 'short' } })).data.error.code, 'weak-password');
  assert.equal((await s.call('POST', '/v1/auth/password/reset', { json: { token: second, password: 'new horse battery' } })).status, 200);
  assert.equal((await s.call('GET', '/v1/me', { token: session })).status, 401, 'existing sessions end');
  assert.equal((await s.call('POST', '/v1/auth/login', { json: { email: 'me@example.com', password: 'correct horse' } })).status, 401);
  const login = await s.call('POST', '/v1/auth/login', { json: { email: 'me@example.com', password: 'new horse battery' } });
  assert.equal(login.status, 200);
  assert.equal(login.data.emailVerified, true, 'proving the mailbox also verifies it');
  assert.equal((await s.call('POST', '/v1/auth/password/reset', { json: { token: second, password: 'another horse' } })).data.error.code, 'bad-token');

  await s.call('POST', '/v1/auth/password/forgot', { json: { email: 'me@example.com' } });
  const late = s.linkToken(s.outbox.at(-1), 'reset');
  s.clock.t += 31 * 60 * 1000;
  assert.equal((await s.call('POST', '/v1/auth/password/reset', { json: { token: late, password: 'late horse battery' } })).data.error.code, 'bad-token');
  assert.ok(s.logs.every((entry) => !/me@example\.com/.test(JSON.stringify(entry))), 'no email in the log');
});

test('a failed delivery keeps the earlier reset link usable; the answer never waits for the mail', async (t) => {
  const outbox = [];
  let mode = 'ok';
  let release;
  const mailer = { enabled: true, kind: 'memory', publicUrl: 'https://eoul.example', send: async (m) => {
    if (mode === 'fail') throw new Error('smtp down');
    if (mode === 'hang') await new Promise((resolve) => { release = resolve; });
    outbox.push(m);
  } };
  const s = await start({ mailer });
  t.after(s.close);
  await s.signup();
  await s.tick();
  await s.call('POST', '/v1/auth/password/forgot', { json: { email: 'me@example.com' } });
  await s.tick();
  const first = s.linkToken(outbox.at(-1), 'reset');
  mode = 'fail';
  assert.equal((await s.call('POST', '/v1/auth/password/forgot', { json: { email: 'me@example.com' } })).status, 202);
  await s.tick();
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM email_tokens WHERE purpose = 'reset'").get().n, 1, 'the undelivered token is removed');
  assert.equal((await s.call('POST', '/v1/auth/password/reset', { json: { token: first, password: 'still my horse' } })).status, 200,
    'the link the user already has still works');

  // A slow mail provider: the registered address answers as fast as an unknown one.
  mode = 'hang';
  const known = await Promise.race([
    s.call('POST', '/v1/auth/password/forgot', { json: { email: 'me@example.com' } }),
    new Promise((resolve) => setTimeout(() => resolve('waited for the mail'), 1000)),
  ]);
  assert.equal(known.status, 202);
  release?.();
});

test('with mail off, verification and reset say so plainly and nothing is created', async (t) => {
  const s = await start({ mailer: createMailer({}) });
  t.after(s.close);
  const { token } = (await s.signup()).data;
  assert.equal((await s.call('POST', '/v1/auth/verify/request', { token })).status, 503);
  const forgot = await s.call('POST', '/v1/auth/password/forgot', { json: { email: 'me@example.com' } });
  assert.equal(forgot.status, 503);
  assert.match(forgot.data.error.message, /운영자에게 문의/);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM email_tokens').get().n, 0);
  assert.equal((await s.call('GET', '/v1/health')).data.features.email, false);
});

test('the SMTP client speaks the protocol: EHLO, AUTH PLAIN, MAIL, RCPT, DATA with an encoded subject', async (t) => {
  const seen = [];
  const server = net.createServer((socket) => {
    socket.write('220 fake ESMTP\r\n');
    let data = false, body = '';
    socket.on('data', (chunk) => {
      for (const line of chunk.toString('utf8').split('\r\n')) {
        if (data) {
          if (line === '.') { data = false; seen.push(['BODY', body]); socket.write('250 queued\r\n'); }
          else body += `${line}\n`;
          continue;
        }
        if (!line) continue;
        seen.push(line);
        if (line.startsWith('EHLO')) socket.write('250-fake\r\n250 AUTH PLAIN\r\n');
        else if (line.startsWith('AUTH PLAIN')) socket.write('235 ok\r\n');
        else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO')) socket.write('250 ok\r\n');
        else if (line === 'DATA') { data = true; socket.write('354 go\r\n'); }
        else if (line === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); }
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  await sendSmtp({ host: '127.0.0.1', port: server.address().port, secure: 'none', user: 'me', pass: 'pw', from: 'no-reply@example.com', to: 'you@example.com', subject: '어울 이메일 확인', text: '링크\n.한 줄' });
  assert.equal(seen[0], 'EHLO eoul');
  assert.equal(seen[1], `AUTH PLAIN ${Buffer.from('\u0000me\u0000pw').toString('base64')}`);
  assert.deepEqual(seen.slice(2, 5), ['MAIL FROM:<no-reply@example.com>', 'RCPT TO:<you@example.com>', 'DATA']);
  const body = seen.find((entry) => Array.isArray(entry))[1];
  assert.match(body, new RegExp(`Subject: =\\?UTF-8\\?B\\?${Buffer.from('어울 이메일 확인').toString('base64').replace(/[+/=]/g, (c) => `\\${c}`)}\\?=`));
  const payload = body.split('\n\n')[1].replace(/\n/g, '');
  assert.equal(Buffer.from(payload, 'base64').toString('utf8'), '링크\n.한 줄');
  await assert.rejects(sendSmtp({ host: 'smtp.example', port: 25, secure: 'none', from: 'a@b.co', to: 'c@d.co', subject: 's', text: 't' }), /이 컴퓨터의 중계 서버에만/);
  // A relay that hangs up without an error: the send fails at once instead of waiting forever.
  for (const hangUp of [(socket) => socket.end(), (socket) => { socket.write('220 hi\r\n'); socket.once('data', () => socket.end()); }]) {
    const quitter = net.createServer(hangUp);
    await new Promise((resolve) => quitter.listen(0, '127.0.0.1', resolve));
    const started = Date.now();
    await assert.rejects(sendSmtp({ host: '127.0.0.1', port: quitter.address().port, secure: 'none', from: 'a@b.co', to: 'c@d.co', subject: 's', text: 't', timeoutMs: 10000 }), /연결을 끊었어요/);
    assert.ok(Date.now() - started < 5000, 'not left to the timeout');
    quitter.close();
  }
  await assert.rejects(sendSmtp({ host: '127.0.0.1', port: server.address().port, secure: 'none', from: 'a@b.co', to: 'x@y.co\r\nRCPT TO:<z@z.co>', subject: 's', text: 't' }), /메일 주소/);
});
