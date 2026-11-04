import { describe, expect, it } from 'vitest';
import { openBuilderMediaTicket, sealBuilderMediaTicket, type BuilderMediaTicket } from '../src/lib/builder-media-ticket.server';

const key = Buffer.from('0123456789abcdef'.repeat(4), 'hex');
const ticket: BuilderMediaTicket = {
	token: 'private-pocketbase-bearer-token',
	exp: 1_700_000_000_000,
	runId: 'run-id',
	ref: { fileId: 'file-id', filename: 'photo.png', version: 2 },
	asset: { fileId: 'file-id', filename: 'photo.png', version: 2 },
};

describe('builder media tickets', () => {
	it('survive a separate server process and do not reveal the bearer token', () => {
		const encrypted = sealBuilderMediaTicket(ticket, key);
		expect(encrypted).not.toContain(ticket.token);
		// A fresh invocation with only the shared deployment key models a restart/other replica.
		expect(openBuilderMediaTicket(encrypted, Buffer.from(key), ticket.exp - 1000)).toEqual(ticket);
	});

	it('rejects tampering, a different replica key, and expiration', () => {
		const encrypted = sealBuilderMediaTicket(ticket, key);
		const tampered = encrypted.slice(0, -1) + (encrypted.endsWith('A') ? 'B' : 'A');
		expect(() => openBuilderMediaTicket(tampered, key, ticket.exp - 1000)).toThrow();
		expect(() => openBuilderMediaTicket(encrypted, Buffer.alloc(32, 9), ticket.exp - 1000)).toThrow();
		expect(() => openBuilderMediaTicket(encrypted, key, ticket.exp)).toThrow();
	});
});
