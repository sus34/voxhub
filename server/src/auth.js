import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// N=2^15, r=8: ~32 MB and a few tens of ms per hash — slow for brute force,
// fine for a handful of logins.
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LEN = 32;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(String(password), salt, KEY_LEN, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  const [kind, N, r, p, salt, key] = String(stored).split('$');
  if (kind !== 'scrypt') return false;
  const expected = Buffer.from(key, 'base64url');
  const actual = await scryptAsync(String(password), Buffer.from(salt, 'base64url'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return timingSafeEqual(actual, expected);
}

/** The value in the cookie. Only its hash is stored, so a leaked DB holds no live sessions. */
export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function newId() {
  return randomBytes(12).toString('base64url');
}

// No 0/O, 1/I/L — codes get read out loud and typed from a phone.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function code(length) {
  let s = '';
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** Short enough to type, long enough (31^10 ≈ 8e14) that guessing is pointless under rate limits. */
export function newInviteCode() {
  return code(10);
}

/** Printed to the log on a fresh server; whoever has it becomes the owner. */
export function newSetupCode() {
  return `${code(4)}-${code(4)}`;
}
