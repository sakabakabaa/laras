/**
 * Encryption for per-lecturer provider credentials.
 *
 * Keys live in the database as AES-256-GCM ciphertext; the encryption key comes
 * from `AI_SETTINGS_KEY` (base64, 32 bytes) and never leaves the server. The
 * payload embeds its version so the key can be rotated later without guessing
 * which ciphertext belongs to which key.
 *
 * Nothing in this module may be imported from a client module: it is
 * `.server.ts` on purpose.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12;

const encryptionKey = (): Buffer => {
	const raw = (process.env.AI_SETTINGS_KEY || '').trim();
	if (!raw) throw new Error('AI_SETTINGS_KEY is not set');
	const key = Buffer.from(raw, 'base64');
	if (key.length !== 32) throw new Error('AI_SETTINGS_KEY must be 32 bytes, base64-encoded');
	return key;
};

/** Encrypts a secret into `v1:<iv>:<tag>:<ciphertext>` (all base64). */
export const encryptSecret = (plaintext: string): string => {
	if (!plaintext) throw new Error('Cannot encrypt an empty secret');
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':');
};

/** Decrypts a payload produced by {@link encryptSecret}. Throws on tampering. */
export const decryptSecret = (payload: string): string => {
	const [version, iv, tag, ciphertext] = (payload || '').split(':');
	if (version !== VERSION || !iv || !tag || !ciphertext) {
		throw new Error('Unsupported secret payload');
	}
	const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv, 'base64'));
	decipher.setAuthTag(Buffer.from(tag, 'base64'));
	return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
};

/** Last four characters, for a write-only UI that never returns the secret. */
export const secretLast4 = (plaintext: string): string => plaintext.slice(-4);

/** Masked representation safe to return over HTTP. */
export const maskSecret = (last4: string): string => (last4 ? `••••${last4}` : '');
