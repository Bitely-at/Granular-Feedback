import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';

// ═══════════════════════════════════════════════════════════
// Verschlüsselung privater API-Schlüssel
//
// Gäste und Personal können in ihrem Konto einen eigenen
// Anthropic-Key hinterlegen (siehe CLAUDE.md, „KI-Funktionen").
// Der muss reversibel gespeichert werden — anders als ein
// Passwort braucht der Server den Klartext zurück, um ihn an
// den Anthropic-Client zu übergeben. Die scrypt-Hashung in
// auth.ts ist bewusst einweg und dafür ungeeignet.
//
// AES-256-GCM: authentifiziert, ein verändertes oder falsch
// entschlüsseltes Chiffrat fällt auf statt still Unsinn zu
// liefern. Gespeichert wird ein einziges Feld:
// base64(iv ‖ authTag ‖ ciphertext).
// ═══════════════════════════════════════════════════════════

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

let derivedKey: Buffer | null = null;

/** `null` heißt: API_KEY_ENC_SECRET ist nicht gesetzt. */
function encryptionKey(): Buffer | null {
  const secret = process.env.API_KEY_ENC_SECRET;
  if (!secret) return null;
  if (!derivedKey) derivedKey = scryptSync(secret, 'bitely-api-key-enc', 32);
  return derivedKey;
}

/** Ob eigene API-Schlüssel auf diesem Server hinterlegt werden können. */
export function canEncryptApiKeys(): boolean {
  return encryptionKey() !== null;
}

export function encryptApiKey(plain: string): string {
  const key = encryptionKey();
  if (!key) throw new Error('API_KEY_ENC_SECRET ist nicht gesetzt.');
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

/**
 * `null` heißt „kein Schlüssel gesetzt" ODER „kann nicht (mehr) entschlüsselt
 * werden" — zum Beispiel weil API_KEY_ENC_SECRET seither geändert wurde. Das
 * ist bewusst kein Fehler: der Aufrufer fällt dann auf den gemeinsamen
 * Schlüssel bzw. den jeweiligen Notausgang zurück, statt die Anfrage mit 500
 * scheitern zu lassen.
 */
export function decryptApiKey(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const key = encryptionKey();
  if (!key) return null;
  try {
    const buf = Buffer.from(stored, 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch (err) {
    console.error('Gespeicherter API-Schlüssel konnte nicht entschlüsselt werden:', err);
    return null;
  }
}
