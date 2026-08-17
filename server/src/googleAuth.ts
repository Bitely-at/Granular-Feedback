import { createPublicKey, createVerify, type JsonWebKey } from 'node:crypto';

/**
 * Prüft das ID-Token, das Google Identity Services im Browser ausstellt.
 *
 * Ohne Bibliothek, wie beim eigenen Token-Format und beim Passwort-Hashing:
 * Googles öffentliche Schlüssel holen, Signatur prüfen, Inhalt prüfen. Mehr
 * ist es nicht — und eine Abhängigkeit weniger, die gepflegt werden muss.
 *
 * WICHTIG: Der Browser schickt hier ein Token, das er selbst besorgt hat. Ohne
 * die Prüfung unten könnte jeder ein beliebiges JSON schicken und wäre damit
 * "angemeldet als beliebige E-Mail". Deshalb wird ALLES geprüft: Signatur
 * gegen Googles Schlüssel, Aussteller, Empfänger (unsere Client-ID) und
 * Ablauf.
 */

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
// Googles Schlüssel wechseln selten. Einmal pro Stunde reicht; ohne Cache
// hinge jede Anmeldung an einem zusätzlichen Netzaufruf.
const CERTS_TTL_MS = 60 * 60 * 1000;

const VALID_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

interface CachedCerts { keys: JsonWebKey[]; fetchedAt: number; }
let cache: CachedCerts | null = null;

export interface GoogleIdentity {
  sub: string; // Googles unveränderliche Konto-ID
  email: string;
  name: string;
}

export function googleClientId(): string | null {
  return process.env.GOOGLE_CLIENT_ID?.trim() || null;
}

async function publicKeys(): Promise<JsonWebKey[]> {
  if (cache && Date.now() - cache.fetchedAt < CERTS_TTL_MS) return cache.keys;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`Googles Schlüssel sind nicht erreichbar (HTTP ${res.status}).`);
  const body = await res.json() as { keys: JsonWebKey[] };
  cache = { keys: body.keys ?? [], fetchedAt: Date.now() };
  return cache.keys;
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

/**
 * Gibt die geprüfte Identität zurück — oder wirft mit einer Meldung, die dem
 * Aufrufer sagt, was schiefging. Der Gast bekommt davon nur "hat nicht
 * geklappt" zu sehen; im Log steht der Grund.
 */
export async function verifyGoogleIdToken(credential: string): Promise<GoogleIdentity> {
  const clientId = googleClientId();
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID ist auf dem Server nicht gesetzt.');

  const [headerB64, payloadB64, signatureB64] = credential.split('.');
  if (!headerB64 || !payloadB64 || !signatureB64) throw new Error('Kein gültiges ID-Token.');

  const header = decodeSegment(headerB64) as { kid?: string; alg?: string };
  if (header.alg !== 'RS256') throw new Error(`Unerwartetes Signaturverfahren: ${header.alg}`);

  const jwk = (await publicKeys()).find(k => (k as { kid?: string }).kid === header.kid);
  if (!jwk) throw new Error('Kein passender Google-Schlüssel zu diesem Token.');

  const verified = createVerify('RSA-SHA256')
    .update(`${headerB64}.${payloadB64}`)
    .verify(createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(signatureB64, 'base64url'));
  if (!verified) throw new Error('Die Signatur des ID-Tokens stimmt nicht.');

  const payload = decodeSegment(payloadB64) as {
    iss?: string; aud?: string; exp?: number; sub?: string;
    email?: string; email_verified?: boolean | string; name?: string;
  };

  if (!VALID_ISSUERS.includes(String(payload.iss))) throw new Error(`Fremder Aussteller: ${payload.iss}`);
  // Der Empfänger MUSS unsere Client-ID sein — sonst ließe sich ein Token
  // verwenden, das für eine ganz andere Anwendung ausgestellt wurde.
  if (payload.aud !== clientId) throw new Error('Das ID-Token wurde für eine andere Anwendung ausgestellt.');
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) throw new Error('Das ID-Token ist abgelaufen.');
  if (!payload.sub || !payload.email) throw new Error('Dem ID-Token fehlen Konto-ID oder E-Mail.');
  // Eine unbestätigte Adresse wäre eine Einladung, sich als jemand anderes
  // auszugeben — Konten werden über die E-Mail zusammengeführt.
  if (payload.email_verified !== true && payload.email_verified !== 'true') {
    throw new Error('Diese Google-Adresse ist nicht bestätigt.');
  }

  return {
    sub: String(payload.sub),
    email: String(payload.email).toLowerCase(),
    name: String(payload.name ?? payload.email).slice(0, 80),
  };
}
