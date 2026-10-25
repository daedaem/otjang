// How this server sends email. The sending method is a setting, separate from
// the one-time links themselves (app.js):
//   EOUL_MAIL=off      (default) no mail; verification and reset say so
//   EOUL_MAIL=console  development: the link is printed in the server log
//                      instead of sent (never use with real users)
//   EOUL_MAIL=smtp     the operator's mail provider (EOUL_SMTP_*)
// Links point to EOUL_PUBLIC_URL, the https address users open.
import { sendSmtp } from './smtp.js';

export function createMailer(env = process.env, { log = () => {}, send = sendSmtp } = {}) {
  const kind = env.EOUL_MAIL || 'off';
  const publicUrl = (() => {
    try {
      const url = new URL(env.EOUL_PUBLIC_URL || '');
      const local = ['localhost', '127.0.0.1'].includes(url.hostname);
      return url.protocol === 'https:' || (local && url.protocol === 'http:') ? url.origin : null;
    } catch {
      return null;
    }
  })();
  const off = (reason) => ({ enabled: false, kind: 'off', reason, publicUrl, async send() { throw new Error('메일 발송이 꺼져 있어요.'); } });
  if (kind === 'off') return off('EOUL_MAIL이 설정되지 않았어요.');
  if (!publicUrl) return off('EOUL_PUBLIC_URL(사용자가 여는 https 주소)이 필요해요.');
  if (kind === 'console') {
    return {
      enabled: true, kind, publicUrl,
      async send({ subject, text }) {
        // The address is not logged; the operator copies the link by hand.
        log(`메일(콘솔 모드) ${subject}\n${text}`);
      },
    };
  }
  if (kind === 'smtp') {
    const host = env.EOUL_SMTP_HOST, from = env.EOUL_SMTP_FROM;
    const port = Number(env.EOUL_SMTP_PORT || 587);
    const secure = env.EOUL_SMTP_SECURE || (port === 465 ? 'tls' : 'starttls');
    if (!host || !from) return off('EOUL_SMTP_HOST와 EOUL_SMTP_FROM이 필요해요.');
    return {
      enabled: true, kind, publicUrl,
      send: ({ to, subject, text }) => send({ host, port, secure, user: env.EOUL_SMTP_USER || null, pass: env.EOUL_SMTP_PASS || null, from, to, subject, text }),
    };
  }
  return off(`알 수 없는 EOUL_MAIL 값이에요: ${kind}`);
}
