import { describe, expect, it } from 'vitest';
import {
	EMPTY_MISSED_ERROR_DRAFT,
	missedErrorIsStarted,
	parseHumanMissedError,
} from '@/lib/research-annotation';

describe('EMPTY_MISSED_ERROR_DRAFT', () => {
	it('starts with an empty quote (no anchor)', () => {
		expect(EMPTY_MISSED_ERROR_DRAFT.quote).toBe('');
	});

	it('starts with no reference fields set', () => {
		expect(EMPTY_MISSED_ERROR_DRAFT.referenceCategory).toBe('');
		expect(EMPTY_MISSED_ERROR_DRAFT.referenceSeverity).toBe('');
		expect(EMPTY_MISSED_ERROR_DRAFT.referenceCorrection).toBe('');
	});
});

describe('missedErrorIsStarted', () => {
	it('is false for the empty draft', () => {
		expect(missedErrorIsStarted(EMPTY_MISSED_ERROR_DRAFT)).toBe(false);
	});

	it('is true once a reference category is set', () => {
		expect(
			missedErrorIsStarted({ ...EMPTY_MISSED_ERROR_DRAFT, referenceCategory: 'Syntax' }),
		).toBe(true);
	});

	it('is true once a severity is set', () => {
		expect(
			missedErrorIsStarted({ ...EMPTY_MISSED_ERROR_DRAFT, referenceSeverity: 'major' }),
		).toBe(true);
	});

	it('is true once a correction is typed', () => {
		expect(
			missedErrorIsStarted({ ...EMPTY_MISSED_ERROR_DRAFT, referenceCorrection: 'der Hund' }),
		).toBe(true);
	});
});

describe('parseHumanMissedError', () => {
	it('parses a fully-populated anchored missed error', () => {
		const row = parseHumanMissedError({
			id: 'abc123',
			quote: 'der hund',
			quoteStart: 12,
			quoteEnd: 20,
			anchorValid: true,
			referenceCategory: 'Morphology',
			referenceSubcategory: 'case',
			referenceSeverity: 'major',
			referenceCorrection: 'den Hund',
			referenceExplanation: 'Akkusativ object',
			reviewerNote: 'AI missed the case',
			adjudicationStatus: 'adjudicated',
			reviewedAt: '2026-10-04T00:00:00Z',
			created: '2026-10-04T00:00:00Z',
		});
		expect(row.id).toBe('abc123');
		expect(row.quote).toBe('der hund');
		expect(row.quoteStart).toBe(12);
		expect(row.quoteEnd).toBe(20);
		expect(row.anchorValid).toBe(true);
		expect(row.referenceCategory).toBe('Morphology');
		expect(row.referenceSubcategory).toBe('case');
		expect(row.referenceSeverity).toBe('major');
		expect(row.referenceCorrection).toBe('den Hund');
		expect(row.adjudicationStatus).toBe('adjudicated');
	});

	it('parses a global missed error (empty quote, invalid anchor)', () => {
		const row = parseHumanMissedError({
			id: 'glob1',
			quote: '',
			quoteStart: 0,
			quoteEnd: 0,
			anchorValid: false,
			referenceCategory: 'Discourse',
			referenceSubcategory: 'coherence',
			referenceSeverity: 'minor',
			adjudicationStatus: 'adjudicated',
		});
		expect(row.quote).toBe('');
		expect(row.anchorValid).toBe(false);
		expect(row.referenceSeverity).toBe('minor');
	});

	it('defends against missing/invalid fields', () => {
		const row = parseHumanMissedError({ id: 'x' });
		expect(row.quote).toBe('');
		expect(row.quoteStart).toBe(0);
		expect(row.anchorValid).toBe(false);
		expect(row.referenceSeverity).toBe('');
		expect(row.adjudicationStatus).toBe('unreviewed');
	});

	it('coerces an invalid severity to empty', () => {
		const row = parseHumanMissedError({ referenceSeverity: 'critical' });
		expect(row.referenceSeverity).toBe('');
	});

	it('coerces an invalid adjudication status to unreviewed', () => {
		const row = parseHumanMissedError({ adjudicationStatus: 'weird' });
		expect(row.adjudicationStatus).toBe('unreviewed');
	});
});
