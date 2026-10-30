import { describe, expect, it } from 'vitest';
import {
	CHECK_LEVEL_LABEL,
	checkLevelOf,
	EXPLICIT_CORRECTION_LEVEL,
	interactionMetaOf,
	MAX_PROGRESSIVE_LEVEL,
	responseSignatureOf,
	type CheckResponsePayload,
} from '@/lib/check-types';

function response(partial: Partial<CheckResponsePayload> = {}): CheckResponsePayload {
	return { kind: 'writing', content: '', ...partial };
}

describe('Phase 8 — formative feedback levels', () => {
	describe('level progression', () => {
		it('caps normal checks at the maximum progressive level (3)', () => {
			expect(checkLevelOf(1)).toBe(1);
			expect(checkLevelOf(2)).toBe(2);
			expect(checkLevelOf(3)).toBe(3);
			expect(checkLevelOf(4)).toBe(MAX_PROGRESSIVE_LEVEL);
			expect(checkLevelOf(99)).toBe(MAX_PROGRESSIVE_LEVEL);
		});

		it('never auto-escalates to explicit correction (Level 4)', () => {
			expect(checkLevelOf(100)).toBe(3);
			expect(checkLevelOf(100)).not.toBe(EXPLICIT_CORRECTION_LEVEL);
		});

		it('clamps invalid attempt numbers to level 1', () => {
			expect(checkLevelOf(0)).toBe(1);
			expect(checkLevelOf(-5)).toBe(1);
			expect(checkLevelOf(NaN)).toBe(1);
		});

		it('exposes all four progressive labels including explicit correction', () => {
			expect(CHECK_LEVEL_LABEL[1]).toContain('refleksi');
			expect(CHECK_LEVEL_LABEL[2]).toContain('konsep');
			expect(CHECK_LEVEL_LABEL[3]).toContain('terarah');
			expect(CHECK_LEVEL_LABEL[4]).toContain('Koreksi eksplisit');
		});
	});

	describe('student-safe response shaping', () => {
		it('interaction metadata carries no research judgments or confidence', () => {
			const meta = interactionMetaOf(
				{ id: 'prev1', responseSnapshot: response({ content: 'a' }) },
				response({ content: 'b' }),
			);
			expect(meta).toEqual({
				requestedNextHint: true,
				revisionSubmitted: true,
				revisesAttempt: 'prev1',
			});
			// No research/lecturer-only fields leak into the metadata shape.
			expect(meta).not.toHaveProperty('confidence');
			expect(meta).not.toHaveProperty('adjudication');
			expect(meta).not.toHaveProperty('reviewer');
			expect(meta).not.toHaveProperty('category');
			expect(meta).not.toHaveProperty('score');
		});

		it('response signature ignores transient AI-analysis aids', () => {
			const base = response({ content: 'Hallo Welt' });
			const withNumbered = { ...base, numberedContent: '1. Hallo\n2. Welt' };
			expect(responseSignatureOf(withNumbered)).toBe(responseSignatureOf(base));
		});
	});

	describe('interaction logging', () => {
		it('first check records no prior hint and no revision', () => {
			const meta = interactionMetaOf(null, response({ content: 'a' }));
			expect(meta.requestedNextHint).toBe(false);
			expect(meta.revisionSubmitted).toBe(false);
			expect(meta.revisesAttempt).toBe('');
		});

		it('subsequent check records that another hint was requested', () => {
			const meta = interactionMetaOf(
				{ id: 'att1', responseSnapshot: response({ content: 'a' }) },
				response({ content: 'a' }),
			);
			expect(meta.requestedNextHint).toBe(true);
		});

		it('detects a revision when the answer changed', () => {
			const meta = interactionMetaOf(
				{ id: 'att1', responseSnapshot: response({ content: 'alte Antwort' }) },
				response({ content: 'neue Antwort' }),
			);
			expect(meta.revisionSubmitted).toBe(true);
		});

		it('does not flag a revision when only whitespace differs', () => {
			const meta = interactionMetaOf(
				{ id: 'att1', responseSnapshot: response({ content: '  Hallo  ' }) },
				response({ content: 'Hallo' }),
			);
			expect(meta.revisionSubmitted).toBe(false);
		});
	});

	describe('revision linkage', () => {
		it('links the new check to the previous attempt id', () => {
			const meta = interactionMetaOf(
				{ id: 'att-42', responseSnapshot: response({ content: 'a' }) },
				response({ content: 'b' }),
			);
			expect(meta.revisesAttempt).toBe('att-42');
		});

		it('forms a chain across multiple revisions', () => {
			const first = interactionMetaOf(null, response({ content: 'v1' }));
			const second = interactionMetaOf(
				{ id: 'att-1', responseSnapshot: response({ content: 'v1' }) },
				response({ content: 'v2' }),
			);
			const third = interactionMetaOf(
				{ id: 'att-2', responseSnapshot: response({ content: 'v2' }) },
				response({ content: 'v3' }),
			);
			expect(first.revisesAttempt).toBe('');
			expect(second.revisesAttempt).toBe('att-1');
			expect(third.revisesAttempt).toBe('att-2');
			expect(second.revisionSubmitted).toBe(true);
			expect(third.revisionSubmitted).toBe(true);
		});
	});

	describe('legacy compatibility', () => {
		it('handles a previous attempt with no response snapshot', () => {
			const meta = interactionMetaOf(
				{ id: 'legacy', responseSnapshot: undefined },
				response({ content: 'a' }),
			);
			// No prior answer to compare → cannot claim a revision, but the
			// student did return for further assistance.
			expect(meta.requestedNextHint).toBe(true);
			expect(meta.revisionSubmitted).toBe(false);
			expect(meta.revisesAttempt).toBe('legacy');
		});

		it('handles undefined previous attempt', () => {
			const meta = interactionMetaOf(undefined, response({ content: 'a' }));
			expect(meta).toEqual({
				requestedNextHint: false,
				revisionSubmitted: false,
				revisesAttempt: '',
			});
		});

		it('does not automatically judge whether a revision is correct', () => {
			// The metadata records only that a revision happened and which attempt
			// it revises — never a correctness verdict (that stays with the
			// lecturer / research annotation system).
			const meta = interactionMetaOf(
				{ id: 'att1', responseSnapshot: response({ content: 'wrong' }) },
				response({ content: 'corrected' }),
			);
			expect(meta).not.toHaveProperty('isCorrect');
			expect(meta).not.toHaveProperty('correct');
			expect(meta).not.toHaveProperty('score');
		});
	});
});
