// Passwords: scrypt with a per-password salt; the cost is stored with the hash
// so it can be raised later without breaking existing accounts.
// Sessions: 32 random bytes handed to the client once; only SHA-256 is stored,
// so a copied database does not contain usable tokens.
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const KEY_BYTES = 32;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().normalize('NFC').toLowerCase();
  // Deliberately simple: one @, a dot in the domain, no spaces. Delivery is not
  // checked until mail sending exists (see docs).
  if (email.length > 254 || !/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

export function passwordProblem(value) {
  if (typeof value !== 'string') return '비밀번호를 입력해 주세요.';
  if ([...value].length < PASSWORD_MIN) return `비밀번호는 ${PASSWORD_MIN}자 이상이어야 해요.`;
  if ([...value].length > PASSWORD_MAX) return `비밀번호는 ${PASSWORD_MAX}자 이하로 정해 주세요.`;
  return null;
}

function scryptOptions(log2N) {
  const N = 2 ** log2N;
  // Node refuses scrypt above 32MB by default; 128 * N * r bytes plus headroom.
  return { N, r: 8, p: 1, maxmem: 128 * N * 8 * 2 };
}

export async function hashPassword(password, log2N) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFC'), salt, KEY_BYTES, scryptOptions(log2N));
  return `scrypt$${log2N}$8$1$${salt.toString('base64url')}$${Buffer.from(key).toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[2] !== '8' || parts[3] !== '1') return false;
  const log2N = Number(parts[1]);
  if (!Number.isInteger(log2N) || log2N < 10 || log2N > 20) return false;
  const salt = Buffer.from(parts[4], 'base64url'), expected = Buffer.from(parts[5], 'base64url');
  if (expected.length !== KEY_BYTES) return false;
  const key = Buffer.from(await scrypt(String(password).normalize('NFC'), salt, KEY_BYTES, scryptOptions(log2N)));
  return crypto.timingSafeEqual(key, expected);
}

// Used when the email is unknown so the response takes about as long as a
// wrong password and does not reveal which emails have accounts.
let dummyHash = null;
export async function burnPasswordTime(password, log2N) {
  if (!dummyHash || !dummyHash.startsWith(`scrypt$${log2N}$`)) dummyHash = await hashPassword('dummy-password', log2N);
  await verifyPassword(typeof password === 'string' ? password : '', dummyHash);
}

export function newSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function newUserId() {
  return `u_${crypto.randomUUID()}`;
}
