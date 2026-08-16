import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import type { UserDoc } from './types.js';

// ═══════════════════════════════════════════════════════════
// Passwort-Hashing (Node-eigenes crypto.scrypt, keine neue Abhängigkeit)
// ═══════════════════════════════════════════════════════════

const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// ═══════════════════════════════════════════════════════════
// Signierte Sitzungs-Tokens
//
// Bewusst kein JWT-Paket: das Format ist schlank (base64url(payload) + "." +
// HMAC-SHA256-Signatur) und hat keinen Anspruch auf RFC-7519-Kompatibilität —
// nur dieser Server liest es, ähnlich dem Ansatz beim Passwort-Hashing.
// ═══════════════════════════════════════════════════════════

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error(
    'JWT_SECRET fehlt. Trage in server/.env einen zufälligen, langen Wert ein ' +
    '(z. B. `node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"`).'
  );
}

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 Stunden

export interface TokenPayload {
  sub: string; // Benutzer-ID
  orgSlug: string; // bindet das Token an GENAU eine Organisation
  role: UserDoc['role'];
  branchId: string | null;
  exp: number; // Ablauf, ms seit Epoch
}

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(data: string): string {
  return base64url(createHmac('sha256', SECRET!).update(data).digest());
}

export function signToken(payload: Omit<TokenPayload, 'exp'>): string {
  const full: TokenPayload = { ...payload, exp: Date.now() + TOKEN_TTL_MS };
  const body = base64url(Buffer.from(JSON.stringify(full)));
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expectedSig = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  // Unterschiedliche Länge zuerst prüfen: timingSafeEqual wirft sonst, statt false zu liefern.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
