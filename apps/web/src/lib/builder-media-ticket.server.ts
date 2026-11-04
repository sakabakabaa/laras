import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const algorithm = 'aes-256-gcm';
const maxTicketAgeMs = 20 * 60_000;

export type BuilderMediaTicket = {
	token: string;
	exp: number;
	runId: string;
	ref: { fileId: string; filename: string; version: number };
	asset: { fileId: string; filename: string; version: number };
};

/** A stable deployment secret shared by all web replicas; never derive it from a user credential. */
export function builderMediaTicketKey(value = process.env.BUILDER_MEDIA_TICKET_KEY): Buffer {
	if (!value || !/^[a-f\d]{64}$/i.test(value)) {
		throw new Error('BUILDER_MEDIA_TICKET_KEY must be 32 bytes encoded as 64 hexadecimal characters');
	}
	return Buffer.from(value, 'hex');
}

export function sealBuilderMediaTicket(ticket: BuilderMediaTicket, key: Buffer): string {
	if (key.length !== 32) throw new Error('Invalid builder media ticket key');
	const iv = randomBytes(12);
	const cipher = createCipheriv(algorithm, key, iv);
	const ciphertext = Buffer.concat([
		cipher.update(JSON.stringify(ticket), 'utf8'),
		cipher.final(),
	]);
	return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

export function openBuilderMediaTicket(value: string, key: Buffer, now = Date.now()): BuilderMediaTicket {
	if (key.length !== 32 || value.length > 4000 || !/^[\w-]+$/.test(value)) {
		throw new Error('Invalid builder media ticket');
	}
	const packed = Buffer.from(value, 'base64url');
	if (packed.length < 29 || packed.toString('base64url') !== value) throw new Error('Invalid builder media ticket');
	const iv = packed.subarray(0, 12);
	const tag = packed.subarray(12, 28);
	const decipher = createDecipheriv(algorithm, key, iv);
	decipher.setAuthTag(tag);
	const plaintext = Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8');
	const ticket = JSON.parse(plaintext) as BuilderMediaTicket;
	if (
		!ticket || typeof ticket.token !== 'string' || !ticket.token ||
		!Number.isSafeInteger(ticket.exp) || ticket.exp <= now ||
		ticket.exp > now + maxTicketAgeMs ||
		typeof ticket.runId !== 'string' || !ticket.runId ||
		!ticket.ref || !ticket.asset ||
		typeof ticket.ref.fileId !== 'string' || typeof ticket.ref.filename !== 'string' || !Number.isSafeInteger(ticket.ref.version) ||
		typeof ticket.asset.fileId !== 'string' || typeof ticket.asset.filename !== 'string' || !Number.isSafeInteger(ticket.asset.version)
	) throw new Error('Invalid or expired builder media ticket');
	return ticket;
}
