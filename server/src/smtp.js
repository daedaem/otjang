// A small SMTP client: enough to hand one plain-text message to the operator's
// mail provider (implicit TLS on 465, STARTTLS on 587). No npm dependency.
// 'none' (no encryption) is allowed only for a relay on this computer.
import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';

function plainAddress(value) {
  if (typeof value !== 'string' || /[\r\n<>]/.test(value) || !/^[^\s@]+@[^\s@]+$/.test(value)) throw new Error('메일 주소 형식이 올바르지 않아요.');
  return value;
}
function encodedWord(text) {
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}
function wrap76(base64) {
  return base64.match(/.{1,76}/g)?.join('\r\n') || '';
}

export function buildMessage({ from, fromName = '어울', to, subject, text, now = new Date() }) {
  const domain = plainAddress(from).split('@')[1];
  return [
    `From: ${encodedWord(fromName)} <${from}>`,
    `To: <${plainAddress(to)}>`,
    `Subject: ${encodedWord(subject)}`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(Buffer.from(text, 'utf8').toString('base64')),
  ].join('\r\n');
}

export async function sendSmtp({ host, port, secure = 'starttls', user = null, pass = null, from, to, subject, text, timeoutMs = 15000 }) {
  const local = ['localhost', '127.0.0.1', '::1'].includes(host);
  if (!['tls', 'starttls', 'none'].includes(secure) || (secure === 'none' && !local))
    throw new Error('암호화하지 않은 SMTP는 이 컴퓨터의 중계 서버에만 쓸 수 있어요.');
  let socket = secure === 'tls' ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
  let buffer = '';
  let waiting = null;
  // Set when the peer closes; any reply still awaited then fails at once.
  let closed = null;
  const onData = (chunk) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\r\n');
    // A reply is complete when a line has the code followed by a space.
    const last = lines.slice(0, -1).find((line) => /^\d{3} /.test(line));
    if (last && waiting) {
      const end = buffer.indexOf(last) + last.length + 2;
      const reply = buffer.slice(0, end);
      buffer = buffer.slice(end);
      const resolve = waiting.resolve;
      waiting = null;
      resolve({ code: Number(last.slice(0, 3)), text: reply });
    }
  };
  const fail = (error) => {
    if (!waiting) return;
    const reject = waiting.reject;
    waiting = null;
    reject(error);
  };
  const attach = (s) => {
    s.on('data', onData);
    s.on('error', (error) => { closed ||= error; fail(error); });
    // A relay that hangs up normally (no error event) must not leave the request waiting.
    for (const event of ['end', 'close']) s.on(event, () => { closed ||= new Error('메일 서버가 연결을 끊었어요.'); fail(closed); });
  };
  attach(socket);
  const timer = setTimeout(() => socket.destroy(new Error('메일 서버가 응답하지 않아요.')), timeoutMs);
  const read = () => new Promise((resolve, reject) => {
    waiting = { resolve, reject };
    onData(Buffer.alloc(0));
    if (waiting && closed) fail(closed);
  });
  const expect = async (codes, command = null) => {
    if (command !== null) socket.write(`${command}\r\n`);
    const reply = await read();
    if (!codes.includes(reply.code)) throw new Error(`메일 서버가 거절했어요 (${reply.code}).`);
    return reply;
  };
  try {
    await expect([220]);
    await expect([250], 'EHLO eoul');
    if (secure === 'starttls') {
      await expect([220], 'STARTTLS');
      socket.removeListener('data', onData);
      socket = tls.connect({ socket, servername: host });
      attach(socket);
      await new Promise((resolve, reject) => {
        socket.once('secureConnect', resolve);
        socket.once('error', reject);
        socket.once('close', () => reject(new Error('메일 서버가 연결을 끊었어요.')));
      });
      await expect([250], 'EHLO eoul');
    }
    if (user) await expect([235], `AUTH PLAIN ${Buffer.from(`\u0000${user}\u0000${pass ?? ''}`, 'utf8').toString('base64')}`);
    await expect([250], `MAIL FROM:<${plainAddress(from)}>`);
    await expect([250, 251], `RCPT TO:<${plainAddress(to)}>`);
    await expect([354], 'DATA');
    // Dot-stuffing: a line that starts with "." gets one more.
    const body = buildMessage({ from, to, subject, text }).replace(/\r\n\./g, '\r\n..');
    await expect([250], `${body}\r\n.`);
    await expect([221], 'QUIT').catch(() => {});
  } finally {
    clearTimeout(timer);
    socket.end?.();
  }
}
