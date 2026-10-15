// Settings come from environment variables only. Nothing secret lives in the
// repository: the server needs no signing key (session tokens are random and
// only their SHA-256 is stored), and the optional invite code is an env value.
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function integer(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`설정 값이 올바르지 않아요: ${value}`);
  return n;
}

function addresses(value) {
  const list = (value || '').split(',').map((s) => s.trim().replace(/^::ffff:/, '')).filter(Boolean);
  for (const address of list) if (!net.isIP(address)) throw new Error(`IP 주소가 아니에요: ${address}`);
  return list;
}

export function loadConfig(env = process.env) {
  const dataDir = path.resolve(env.EOUL_DATA_DIR || path.join(serverRoot, 'data'));
  return {
    host: env.EOUL_HOST || '127.0.0.1',
    port: integer(env.EOUL_PORT, 8787, { min: 0, max: 65535 }),
    dataDir,
    database: env.EOUL_DATABASE || path.join(dataDir, 'eoul.db'),
    // Browser origins allowed to call the API from another site (for example
    // a GitHub Pages copy of the app). The app served by this server itself
    // is same-origin and needs no entry.
    allowedOrigins: (env.EOUL_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    // Behind Cloudflare Tunnel every request arrives from 127.0.0.1; only then
    // is CF-Connecting-IP the real client address for rate limiting.
    trustProxy: env.EOUL_TRUST_PROXY === 'cloudflare' ? 'cloudflare' : null,
    // When cloudflared runs in its own container (deploy/docker-compose.yml)
    // requests come from that container's fixed address instead; list it here.
    trustedProxies: addresses(env.EOUL_TRUSTED_PROXIES),
    // While testing with a few people, an invite code keeps strangers who find
    // the URL from creating accounts on this PC.
    inviteCode: env.EOUL_INVITE_CODE || null,
    // scrypt cost as log2(N). 17 follows the OWASP Password Storage Cheat Sheet
    // minimum (N=2^17, r=8, p=1; about 128MB and 0.37s per hash on a 2.1GHz vCPU).
    // Tests lower it to stay fast; existing hashes keep their own cost.
    scryptLog2N: integer(env.EOUL_SCRYPT_LOG2N, 17, { min: 10, max: 20 }),
    sessionDays: integer(env.EOUL_SESSION_DAYS, 60, { min: 1, max: 365 }),
    appFile: env.EOUL_APP_FILE || path.resolve(serverRoot, '../app/dist/index.html'),
    // Optional server-side garment mask (see src/photo-mask.js). Off when the file is missing.
    maskModel: env.EOUL_MASK_MODEL || path.join(serverRoot, 'models', 'u2net.onnx'),
    maskThreads: integer(env.EOUL_MASK_THREADS, Math.min(4, os.availableParallelism?.() || 1), { min: 1, max: 64 }),
    // Members' outfit sharing. Off until the operator has published the rules
    // and the contact for reports (see README "커뮤니티").
    community: env.EOUL_COMMUNITY === 'on',
    // Room for all members' shared photos together (MB). Each member also has their own limit.
    communityMaxBytes: integer(env.EOUL_COMMUNITY_MAX_MB, 2048, { min: 1, max: 1024 * 1024 }) * 1024 * 1024,
  };
}
