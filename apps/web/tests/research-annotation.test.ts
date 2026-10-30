import { describe, expect, it } from 'vitest';
import {
	annotationIsStarted,
	EMPTY_ANNOTATION,
	findingFingerprint,
	REFERENCE_CATEGORIES,
	referenceSubcategories,
} from '@/lib/research-annotation';
import { FEEDBACK_TAXONOMY } from '@/lib/ai-evaluation';

describe('findingFingerprint', () => {
	it('is stable for the same AI finding content', () => {
		const f = { severity: 'major', quote: 'der Hund', note: 'wrong case', category: 'Morphology', subcategory: 'case' };
		expect(findingFingerprint(f)).toBe(findingFingerprint(f));
	});

	it('differs when the AI note changes (regenerated draft → no silent reattach)', () => {
		const a = { severity: 'major', quote: 'der Hund', note: 'wrong case', category: 'Morphology', subcategory: 'case' };
		const b = { ...a, note: 'different note' };
		expect(findingFingerprint(a)).not.toBe(findingFingerprint(b));
	});

	it('differs between distinct AI findings', () => {
		const a = { severity: 'minor', quote: 'haus', note: 'spelling', category: 'Orthography', subcategory: 'spelling' };
		const b = { severity: 'major', quote: 'gegangen', note: 'word order', category: 'Syntax', subcategory: 'word_order' };
		expect(findingFingerprint(a)).not.toBe(findingFingerprint(b));
	});

	it('matches the server-side fingerprint regex shape', () => {
		const fp = findingFingerprint({ severity: 'minor', quote: '', note: 'general', category: '', subcategory: '' });
		expect(fp).toMatch(/^fp_[a-z0-9]+$/);
	});
});

describe('annotationIsStarted', () => {
	it('is false for the empty annotation', () => {
		expect(annotationIsStarted(EMPTY_ANNOTATION)).toBe(false);
	});

	it('is true once any judgment is set', () => {
		expect(annotationIsStarted({ ...EMPTY_ANNOTATION, errorPresent: 'yes' })).toBe(true);
	});

	it('is true once a reference category is set', () => {
		expect(annotationIsStarted({ ...EMPTY_ANNOTATION, referenceCategory: 'Syntax' })).toBe(true);
	});

	it('is true once a reviewer note is typed', () => {
		expect(annotationIsStarted({ ...EMPTY_ANNOTATION, reviewerNote: '  note  ' })).toBe(true);
	});
});

describe('reference taxonomy (Phase 2 reuse)', () => {
	it('exposes the same controlled categories', () => {
		expect(REFERENCE_CATEGORIES).toEqual(Object.keys(FEEDBACK_TAXONOMY));
	});

	it('returns subcategories for a known category', () => {
		expect(referenceSubcategories('Morphology')).toEqual(FEEDBACK_TAXONOMY['Morphology']);
	});

	it('returns an empty list for an unknown category', () => {
		expect(referenceSubcategories('Nope')).toEqual([]);
	});
});
