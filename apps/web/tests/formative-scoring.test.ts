import { describe, expect, it } from 'vitest';
import {
	calculateFormativeAdvisory,
	feedbackCitesMaterial,
} from '@/lib/formative-scoring';

/**
 * The formative advisory score (Latihan formatif / Cek jawaban) is the model
 * that still deducts per finding: proportional, capped penalties for major
 * and minor findings, a length tolerance, a CEFR tolerance and a completion
 * cap. It is advisory only — nothing here is published as a grade.
 */
const finding = (severity: 'minor' | 'major', status = 'approved') => ({ severity, status });

describe('calculateFormativeAdvisory — proportional penalty model', () => {
	it('a clean answer scores 100', () => {
		const advisory = calculateFormativeAdvisory({
			findings: [],
			wordCount: 120,
		});
		expect(advisory.score).toBe(100);
		expect(advisory.majorCount).toBe(0);
		expect(advisory.minorCount).toBe(0);
	});

	it('a major finding costs 12 points and a minor finding 3', () => {
		const oneMajor = calculateFormativeAdvisory({
			findings: [finding('major')],
			wordCount: 100,
		});
		const oneMinor = calculateFormativeAdvisory({
			findings: [finding('minor')],
			wordCount: 100,
		});
		// 100 − 12 + 4 (length tolerance) = 92
		expect(oneMajor.score).toBe(92);
		// 100 − 3 + 4 = 101 → clamped to 100
		expect(oneMinor.score).toBe(100);
	});

	it('rejected findings never count', () => {
		const advisory = calculateFormativeAdvisory({
			findings: [finding('major', 'rejected')],
			wordCount: 100,
		});
		expect(advisory.score).toBe(100);
		expect(advisory.majorCount).toBe(0);
	});

	it('caps the major penalty at 60 so a long answer never floors at 0', () => {
		const advisory = calculateFormativeAdvisory({
			findings: Array.from({ length: 5 }, () => finding('major')),
			wordCount: 200,
		});
		// min(60, 5 × 12) = 60, length tolerance +8 → 100 − 60 + 8 = 48
		expect(advisory.score).toBe(48);
		expect(advisory.score).toBeGreaterThan(0);
	});

	it('caps the minor penalty at 18', () => {
		const advisory = calculateFormativeAdvisory({
			findings: Array.from({ length: 8 }, () => finding('minor')),
			wordCount: 200,
		});
		// min(18, 8 × 3) = 18, +8 length tolerance → 90
		expect(advisory.score).toBe(90);
	});

	it('grants a length tolerance only from 60 words', () => {
		const short = calculateFormativeAdvisory({ findings: [], wordCount: 40 });
		const long = calculateFormativeAdvisory({ findings: [], wordCount: 120 });
		expect(short.score).toBe(100);
		expect(long.score).toBe(100);
		const withErrorShort = calculateFormativeAdvisory({
			findings: [finding('major')],
			wordCount: 40,
		});
		const withErrorLong = calculateFormativeAdvisory({
			findings: [finding('major')],
			wordCount: 120,
		});
		expect(withErrorShort.score).toBe(88); // 100 − 12, no tolerance
		expect(withErrorLong.score).toBe(96); // 100 − 12 + 8
	});

	it('caps a near-empty answer at 45 however few errors it has', () => {
		const advisory = calculateFormativeAdvisory({ findings: [], wordCount: 8 });
		expect(advisory.score).toBe(45);
	});

	it('applies a CEFR tolerance for the expected competence level', () => {
		const a1 = calculateFormativeAdvisory({
			findings: [finding('major')],
			wordCount: 100,
			cefrLevel: 'A1',
		});
		const b2 = calculateFormativeAdvisory({
			findings: [finding('major')],
			wordCount: 100,
			cefrLevel: 'B2',
		});
		// A1 grants +6, B2 grants +3.
		expect(a1.score).toBe(98); // 100 − 12 + 4 + 6
		expect(b2.score).toBe(95); // 100 − 12 + 4 + 3
	});

	it('exposes every arithmetic step as a factor', () => {
		const advisory = calculateFormativeAdvisory({
			findings: [finding('major')],
			wordCount: 100,
			cefrLevel: 'A1',
		});
		const keys = advisory.factors.map(f => f.key);
		expect(keys).toContain('major');
		expect(keys).toContain('length');
		expect(keys).toContain('cefr');
		expect(keys).toContain('material');
		const majorFactor = advisory.factors.find(f => f.key === 'major');
		expect(majorFactor?.impact).toBe(-12);
	});

	it('reports lower confidence when findings are not anchored to the text', () => {
		const anchored = calculateFormativeAdvisory({
			findings: [{ severity: 'major', status: 'approved', quote: 'Hallo' }],
			wordCount: 100,
		});
		const unanchored = calculateFormativeAdvisory({
			findings: [{ severity: 'major', status: 'approved' }],
			wordCount: 100,
		});
		expect(anchored.confidence).toBe('high');
		expect(unanchored.confidence).toBe('low');
	});
});

describe('feedbackCitesMaterial', () => {
	it('detects a course-material citation marker', () => {
		expect(feedbackCitesMaterial('Lihat [id=abc123] untuk detailnya.')).toBe(true);
		expect(feedbackCitesMaterial('Bagian "Kosakata" menjelaskan hal ini.')).toBe(true);
	});

	it('returns false for feedback with no citation', () => {
		expect(feedbackCitesMaterial('Coba gunakan kata yang lebih varied.')).toBe(false);
		expect(feedbackCitesMaterial('')).toBe(false);
	});
});
