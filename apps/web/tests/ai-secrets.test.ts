import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, maskSecret, secretLast4 } from '@/lib/ai/secrets.server';

const KEY = randomBytes(32).toString('base64');

describe('provider credential encryption', () => {
	beforeEach(() => {
		process.env.AI_SETTINGS_KEY = KEY;
	});
	afterEach(() => {
		delete process.env.AI_SETTINGS_KEY;
	});

	it('round-trips a secret', () => {
		const payload = encryptSecret('sk-live-abc123');
		expect(payload.startsWith('v1:')).toBe(true);
		expect(payload).not.toContain('sk-live-abc123');
		expect(decryptSecret(payload)).toBe('sk-live-abc123');
	});

	it('produces a different ciphertext each time (random IV)', () => {
		expect(encryptSecret('same-secret')).not.toBe(encryptSecret('same-secret'));
	});

	it('rejects a tampered payload instead of returning garbage', () => {
		const payload = encryptSecret('sk-live-abc123');
		const parts = payload.split(':');
		const flipped = parts[3].startsWith('A') ? 'B' + parts[3].slice(1) : 'A' + parts[3].slice(1);
		expect(() => decryptSecret([parts[0], parts[1], parts[2], flipped].join(':'))).toThrow();
	});

	it('fails loudly when the key is missing or the wrong size', () => {
		delete process.env.AI_SETTINGS_KEY;
		expect(() => encryptSecret('x')).toThrow(/AI_SETTINGS_KEY/);
		process.env.AI_SETTINGS_KEY = Buffer.from('too-short').toString('base64');
		expect(() => encryptSecret('x')).toThrow(/32 bytes/);
	});

	it('masks the key for display and never leaks more than four characters', () => {
		expect(secretLast4('sk-live-abc123')).toBe('c123');
		expect(maskSecret('c123')).toBe('••••c123');
		expect(maskSecret('')).toBe('');
	});
});
