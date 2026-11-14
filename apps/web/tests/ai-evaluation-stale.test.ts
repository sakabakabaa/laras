import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

vi.mock('@/lib/submission-content.server', () => ({
	isPointerOnlyContent: (c: string) => !c.trim() || /file terverifikasi di Drive/i.test(c),
}));

import { draftCurrency, isDraftStale, sha256Hex, staleFlagFor } from '@/lib/ai-evaluation-stale.server';

const LONG = 'Ich heiße Anna und ich wohne in Jakarta. '.repeat(10);
const finding = (quote: string) => ({ severity: 'minor', quote, note: 'n' });

describe('draftCurrency', () => {
	it('is current when the stored hash matches the current text', () => {
		const row = { status: 'ready', inputTextHash: sha256Hex(LONG), generatedAt: '2026-01-01T00:00:00Z' };
		expect(draftCurrency({ row, submission: { content: LONG, updated: '2026-02-01T00:00:00Z' }, isSpeaking: false })).toBe('current');
	});

	it('is stale when the text was replaced by a re-read (hash differs, text long)', () => {
		const row = { status: 'ready', inputTextHash: sha256Hex('kurz'), generatedAt: '2026-01-01T00:00:00Z' };
		expect(isDraftStale({ row, submission: { content: LONG, files: ['a.pdf'] }, isSpeaking: false })).toBe(true);
	});

	it('does not compare incomparable hashes (short text + files means OCR was appended)', () => {
		const row = { status: 'ready', inputTextHash: sha256Hex('kurz\n\n[ISI LAMPIRAN]\nviel Text'), generatedAt: '2026-01-02T00:00:00Z', findings: [finding('kurz')] };
		const submission = { content: 'kurz', files: ['a.pdf'], updated: '2026-01-01T00:00:00Z' };
		expect(draftCurrency({ row, submission, isSpeaking: false })).toBe('unknown');
	});

	it('falls back to: updated after generation AND no quote anchors', () => {
		const base = { status: 'ready', generatedAt: '2026-01-01T00:00:00Z', findings: [finding('Ich bin müde')] };
		const changed = { content: LONG, updated: '2026-02-01T00:00:00Z' };
		expect(isDraftStale({ row: base, submission: changed, isSpeaking: false })).toBe(true);
		// A quote still anchors: not stale.
		expect(isDraftStale({ row: { ...base, findings: [finding('Ich heiße Anna')] }, submission: changed, isSpeaking: false })).toBe(false);
		// Updated before generation: not stale.
		expect(isDraftStale({ row: base, submission: { ...changed, updated: '2025-12-01T00:00:00Z' }, isSpeaking: false })).toBe(false);
		// No findings: unknowable, conservative.
		expect(isDraftStale({ row: { ...base, findings: [] }, submission: changed, isSpeaking: false })).toBe(false);
	});

	it('only ready drafts can be stale, speaking uses the transcript', () => {
		expect(isDraftStale({ row: { status: 'pending', inputTextHash: 'x' }, submission: { content: LONG }, isSpeaking: false })).toBe(false);
		const row = { status: 'ready', inputTextHash: sha256Hex('transkript') };
		expect(isDraftStale({ row, submission: { transcript: 'transkript', content: 'anderes' }, isSpeaking: true })).toBe(false);
		expect(isDraftStale({ row, submission: { transcript: 'neu' }, isSpeaking: true })).toBe(true);
	});

	it('staleFlagFor is false without a draft', () => {
		expect(staleFlagFor({ assignment: { shape: 'writing' }, submission: { content: LONG }, row: null })).toBe(false);
	});
});
