import { describe, expect, it } from 'vitest';
import {
	ANCHOR_ERROR,
	parseFindings,
	parseStructuredFindings,
	validateFindingAnchor,
	type EvalFinding,
} from '@/lib/ai-evaluation';
import { findingFingerprint, findSourceFindingByFingerprint } from '@/lib/research-annotation';
import { resolveAiItemFields } from '@/lib/research-export.server';
import { buildAiContentFields } from '@/lib/evaluation-annotation.server';

const CRITERIA = [
	{ label: 'Tata bahasa', weight: 1 },
	{ label: 'Kosakata', weight: 1 },
];

/** Build a parsed EvalFinding from raw model output + student text. */
function parsedFinding(
	raw: Record<string, unknown>,
	text: string,
): EvalFinding {
	const list = parseStructuredFindings([raw], text, CRITERIA);
	if (list.length !== 1) throw new Error('fixture finding did not parse');
	return list[0]!;
}

// ── validateFindingAnchor ─────────────────────────────────────────────────

describe('validateFindingAnchor — offset validation against versioned text', () => {
	const text = 'Ich gehe nach Hause. Das Haus ist groß.';

	it('accepts exact offsets that slice to the quote', () => {
		const start = text.indexOf('Haus ist');
		const v = validateFindingAnchor('Haus ist', start, start + 'Haus ist'.length, text);
		expect(v.anchorValid).toBe(true);
		expect(v.anchorError).toBe('');
		expect(v.quoteStart).toBe(start);
		expect(v.quoteEnd).toBe(start + 'Haus ist'.length);
		expect(v.anchorAmbiguous).toBe(false);
	});

	it('preserves a real 0 offset (start of text) — never treats 0 as absent', () => {
		const v = validateFindingAnchor('Ich', 0, 3, text);
		expect(v.anchorValid).toBe(true);
		expect(v.quoteStart).toBe(0);
		expect(v.quoteEnd).toBe(3);
	});

	it('marks inverted offsets invalid with a clear error (never empties the quote)', () => {
		const v = validateFindingAnchor('Haus', 10, 5, text);
		expect(v.anchorValid).toBe(false);
		expect(v.anchorError).toBe(ANCHOR_ERROR.OFFSETS_INVERTED);
		expect(v.quoteStart).toBeNull();
		expect(v.quoteEnd).toBeNull();
	});

	it('marks a length mismatch invalid (offsets do not bracket the quote)', () => {
		const start = text.indexOf('Haus');
		const v = validateFindingAnchor('Haus', start, start + 10, text);
		expect(v.anchorValid).toBe(false);
		expect(v.anchorError).toBe(ANCHOR_ERROR.OFFSET_LENGTH_MISMATCH);
	});

	it('marks a text mismatch invalid (offsets point at different text)', () => {
		// Offsets that are the right length but slice to different text.
		const v = validateFindingAnchor('Haus', 0, 4, text);
		expect(v.anchorValid).toBe(false);
		expect(v.anchorError).toBe(ANCHOR_ERROR.OFFSET_TEXT_MISMATCH);
	});

	it('resolves from text when offsets are absent (single match)', () => {
		const start = text.indexOf('groß');
		const v = validateFindingAnchor('groß', null, undefined, text);
		expect(v.anchorValid).toBe(true);
		expect(v.anchorError).toBe('');
		expect(v.quoteStart).toBe(start);
		expect(v.quoteEnd).toBe(start + 'groß'.length);
	});

	it('marks a repeated quote ambiguous — never guesses an occurrence', () => {
		const repeated = 'Ich gehe nach Hause. Ich gehe nach Hause.';
		const v = validateFindingAnchor('Ich gehe nach Hause.', null, null, repeated);
		expect(v.anchorValid).toBe(true);
		expect(v.anchorAmbiguous).toBe(true);
		expect(v.quoteStart).toBeNull();
		expect(v.quoteEnd).toBeNull();
	});

	it('marks a quote absent from the text invalid (never silently empties it)', () => {
		const v = validateFindingAnchor('nicht vorhanden hier', null, null, text);
		expect(v.anchorValid).toBe(false);
		expect(v.anchorError).toBe(ANCHOR_ERROR.QUOTE_NOT_IN_TEXT);
		expect(v.quoteStart).toBeNull();
	});

	it('treats an empty quote as a valid general finding (no anchor)', () => {
		const v = validateFindingAnchor('', 0, 0, text);
		expect(v.anchorValid).toBe(true);
		expect(v.quoteStart).toBeNull();
		expect(v.quoteEnd).toBeNull();
		expect(v.anchorError).toBe('');
	});

	it('rejects a quote over 300 characters', () => {
		const long = 'a'.repeat(301);
		const v = validateFindingAnchor(long, null, null, long);
		expect(v.anchorValid).toBe(false);
		expect(v.anchorError).toBe(ANCHOR_ERROR.QUOTE_TOO_LONG);
	});

	it('handles Unicode/multibyte text with code-unit offsets', () => {
		// 'ä' is one code unit (U+00E4); 'ß' is one code unit (U+00DF).
		const text = 'Ich möchte Bäckerstraße besuchen.';
		const start = text.indexOf('Bäckerstraße');
		const v = validateFindingAnchor('Bäckerstraße', start, start + 'Bäckerstraße'.length, text);
		expect(v.anchorValid).toBe(true);
		expect(text.slice(v.quoteStart!, v.quoteEnd!)).toBe('Bäckerstraße');
	});

	it('handles a surrogate-pair emoji (two code units) at the offset boundary', () => {
		// '📚' is U+1F4DA → two UTF-16 code units.
		const text = 'Ich lese Bücher 📚 gerne.';
		const start = text.indexOf('📚');
		expect(start).toBeGreaterThanOrEqual(0);
		const v = validateFindingAnchor('📚', start, start + 2, text);
		expect(v.anchorValid).toBe(true);
		expect(text.slice(v.quoteStart!, v.quoteEnd!)).toBe('📚');
	});

	it('handles punctuation inside the quote', () => {
		const text = 'Er sagte: "Hallo!" und ging.';
		const start = text.indexOf('"Hallo!"');
		const v = validateFindingAnchor('"Hallo!"', start, start + '"Hallo!"'.length, text);
		expect(v.anchorValid).toBe(true);
	});
});

// ── findSourceFindingByFingerprint ─────────────────────────────────────────

describe('findSourceFindingByFingerprint — stable finding linkage', () => {
	const text = 'Ich gehe nach haus. Das ist falsch.';
	const f1 = parsedFinding(
		{
			severity: 'major',
			quote: 'haus',
			note: 'Kata benda harus dikapitalisasi.',
			category: 'Orthography',
			subcategory: 'capitalization',
			correction: 'Haus',
			confidence: 0.9,
		},
		text,
	);
	const f2 = parsedFinding(
		{
			severity: 'minor',
			quote: '',
			note: 'Struktur kalimat bisa lebih jelas.',
			category: 'Discourse',
			subcategory: 'cohesion',
			confidence: 0.4,
		},
		text,
	);
	const findings = [f1, f2];

	it('matches a finding by its content fingerprint', () => {
		const fp = findingFingerprint(f1);
		expect(findSourceFindingByFingerprint(findings, fp)).toBe(f1);
	});

	it('returns null when no finding matches (draft regenerated)', () => {
		expect(findSourceFindingByFingerprint(findings, 'fp_nosuchthing')).toBeNull();
	});

	it('returns null for an empty fingerprint', () => {
		expect(findSourceFindingByFingerprint(findings, '')).toBeNull();
	});

	it('the fingerprint is stable across re-parse of the same raw output', () => {
		const reParsed = parseStructuredFindings(
			[
				{
					severity: 'major',
					quote: 'haus',
					note: 'Kata benda harus dikapitalisasi.',
					category: 'Orthography',
					subcategory: 'capitalization',
					correction: 'Haus',
					confidence: 0.9,
				},
			],
			text,
			CRITERIA,
		);
		expect(findingFingerprint(reParsed[0]!)).toBe(findingFingerprint(f1));
	});
});

// ── buildAiContentFields ──────────────────────────────────────────────────

describe('buildAiContentFields — copies source fields + re-validates anchor', () => {
	const text = 'Ich gehe nach haus. Das ist falsch.';
	const finding = parsedFinding(
		{
			severity: 'major',
			quote: 'haus',
			note: 'Kata benda harus dikapitalisasi.',
			category: 'Orthography',
			subcategory: 'capitalization',
			correction: 'Haus',
			explanation: 'Kata benda di Jerman selalu dikapitalisasi.',
			criterion: 'Tata bahasa',
			confidence: 0.9,
		},
		text,
	);

	it('copies every structured field and validates the anchor', () => {
		const fields = buildAiContentFields(finding, text);
		expect(fields.quote).toBe('haus');
		expect(fields.aiSeverity).toBe('major');
		expect(fields.aiCategory).toBe('Orthography');
		expect(fields.aiSubcategory).toBe('capitalization');
		expect(fields.aiNote).toBe('Kata benda harus dikapitalisasi.');
		expect(fields.aiCorrection).toBe('Haus');
		expect(fields.aiExplanation).toBe('Kata benda di Jerman selalu dikapitalisasi.');
		expect(fields.aiCriterion).toBe('Tata bahasa');
		expect(fields.aiConfidence).toBe(0.9);
		expect(fields.anchorValid).toBe(true);
		expect(fields.anchorError).toBe('');
		expect(fields.quoteStart).toBe(text.indexOf('haus'));
		expect(fields.quoteEnd).toBe(text.indexOf('haus') + 'haus'.length);
	});

	it('marks the anchor invalid when the text no longer contains the quote', () => {
		// Simulate a revised submission where the quote is gone — the quote is
		// preserved, the anchor is explicitly invalid, confidence is NOT zeroed.
		// The stored offsets still exist (from generation time) but no longer
		// slice to the quote, so the error is an offset/text mismatch.
		const fields = buildAiContentFields(finding, 'Completely different text now.');
		expect(fields.quote).toBe('haus');
		expect(fields.anchorValid).toBe(false);
		expect(fields.anchorError).toBe(ANCHOR_ERROR.OFFSET_TEXT_MISMATCH);
		expect(fields.aiConfidence).toBe(0.9);
		expect(fields.quoteStart).toBeNull();
		expect(fields.quoteEnd).toBeNull();
	});

	it('preserves a real 0 confidence (distinguishes absent from zero)', () => {
		const zeroConf = parsedFinding(
			{ ...finding, confidence: 0 },
			text,
		);
		const fields = buildAiContentFields(zeroConf, text);
		expect(fields.aiConfidence).toBe(0);
	});

	it('preserves a real 0 offset (start of text)', () => {
		const startFinding = parsedFinding(
			{
				severity: 'minor',
				quote: 'Ich',
				note: 'Subjektwiederholung.',
				category: 'Discourse',
				subcategory: 'cohesion',
				confidence: 0.3,
			},
			text,
		);
		const fields = buildAiContentFields(startFinding, text);
		expect(fields.quoteStart).toBe(0);
		expect(fields.anchorValid).toBe(true);
	});
});

// ── resolveAiItemFields — export enrichment ───────────────────────────────

describe('resolveAiItemFields — populated, linked fields in the export', () => {
	const text = 'Ich gehe nach haus. Das ist falsch.';
	const sourceFinding = parsedFinding(
		{
			severity: 'major',
			quote: 'haus',
			note: 'Kata benda harus dikapitalisasi.',
			category: 'Orthography',
			subcategory: 'capitalization',
			correction: 'Haus',
			explanation: 'Kata benda di Jerman selalu dikapitalisasi.',
			criterion: 'Tata bahasa',
			confidence: 0.9,
		},
		text,
	);
	const fp = findingFingerprint(sourceFinding);

	it('uses the item stored fields when populated (Phase 11 save path)', () => {
		const item = {
			quote: 'haus',
			quoteStart: text.indexOf('haus'),
			quoteEnd: text.indexOf('haus') + 'haus'.length,
			anchorValid: true,
			anchorError: '',
			aiSeverity: 'major',
			aiCategory: 'Orthography',
			aiSubcategory: 'capitalization',
			aiNote: 'Kata benda harus dikapitalisasi.',
			aiCorrection: 'Haus',
			aiExplanation: 'Kata benda di Jerman selalu dikapitalisasi.',
			aiCriterion: 'Tata bahasa',
			aiConfidence: 0.9,
			parentAiFindingId: fp,
		};
		const ai = resolveAiItemFields(item, sourceFinding);
		expect(ai.quote).toBe('haus');
		expect(ai.aiSeverity).toBe('major');
		expect(ai.aiConfidence).toBe(0.9);
		expect(ai.parentAiFindingId).toBe(fp);
		expect(ai.anchorValid).toBe(true);
	});

	it('enriches a historical row (empty AI fields) from the source finding', () => {
		// A row saved before Phase 11 — AI content fields are empty, but the
		// parentAiFindingId links it to the original finding.
		const item = {
			quote: '',
			quoteStart: null,
			quoteEnd: null,
			anchorValid: null,
			aiSeverity: '',
			aiCategory: '',
			aiSubcategory: '',
			aiNote: '',
			aiCorrection: '',
			aiExplanation: '',
			aiCriterion: '',
			aiConfidence: null,
			parentAiFindingId: fp,
		};
		const ai = resolveAiItemFields(item, sourceFinding);
		expect(ai.quote).toBe('haus');
		expect(ai.aiSeverity).toBe('major');
		expect(ai.aiCategory).toBe('Orthography');
		expect(ai.aiSubcategory).toBe('capitalization');
		expect(ai.aiNote).toBe('Kata benda harus dikapitalisasi.');
		expect(ai.aiCorrection).toBe('Haus');
		expect(ai.aiExplanation).toBe('Kata benda di Jerman selalu dikapitalisasi.');
		expect(ai.aiCriterion).toBe('Tata bahasa');
		expect(ai.aiConfidence).toBe(0.9);
		expect(ai.parentAiFindingId).toBe(fp);
	});

	it('leaves fields empty when neither the item nor a source finding has them (nothing invented)', () => {
		const item = {
			quote: '',
			aiSeverity: '',
			aiConfidence: null,
			parentAiFindingId: 'fp_missing',
		};
		const ai = resolveAiItemFields(item, null);
		expect(ai.quote).toBe('');
		expect(ai.aiSeverity).toBe('');
		expect(ai.aiConfidence).toBeNull();
		expect(ai.parentAiFindingId).toBe('fp_missing');
	});

	it('never zeroes confidence — a real 0 is preserved', () => {
		const item = { aiConfidence: 0, parentAiFindingId: fp };
		const ai = resolveAiItemFields(item, sourceFinding);
		expect(ai.aiConfidence).toBe(0);
	});

	it('never empties the quote — the source finding quote is preserved', () => {
		const item = { quote: '', parentAiFindingId: fp };
		const ai = resolveAiItemFields(item, sourceFinding);
		expect(ai.quote).toBe('haus');
	});

	it('prefers the item stored anchorValid (re-validated at save time)', () => {
		const item = {
			quote: 'haus',
			anchorValid: false,
			anchorError: ANCHOR_ERROR.OFFSET_TEXT_MISMATCH,
			parentAiFindingId: fp,
		};
		const ai = resolveAiItemFields(item, sourceFinding);
		expect(ai.anchorValid).toBe(false);
		expect(ai.anchorError).toBe(ANCHOR_ERROR.OFFSET_TEXT_MISMATCH);
	});
});

// ── Synthetic fixture: two approved + two rejected findings ───────────────
//
// Mirrors the audit's reproducible case: four raw AI findings; the lecturer
// approved two and rejected two. The export must retain the populated, linked
// finding fields for ALL of them — approval/rejection is a review judgment
// that never strips the source AI content from the research record.

describe('synthetic fixture — two approved + two rejected findings', () => {
	const text = 'Ich gehe nach haus. Das ist ein Test. Ich liebe Berlin.';
	const rawFindings = [
		{
			severity: 'major',
			quote: 'haus',
			note: 'Kata benda harus dikapitalisasi.',
			category: 'Orthography',
			subcategory: 'capitalization',
			correction: 'Haus',
			explanation: 'Kata benda dikapitalisasi.',
			criterion: 'Tata bahasa',
			confidence: 0.92,
		},
		{
			severity: 'minor',
			quote: 'ein Test',
			note: 'Artikel mungkin tidak perlu.',
			category: 'Lexicon',
			subcategory: 'word_choice',
			correction: 'Test',
			explanation: 'Konteks informal.',
			criterion: 'Kosakata',
			confidence: 0.4,
		},
		{
			severity: 'major',
			quote: 'nicht im text vorhanden',
			note: 'Kutipan tidak cocok (akan ditolak).',
			category: 'Syntax',
			subcategory: 'word_order',
			correction: '',
			explanation: '',
			criterion: '',
			confidence: 0.5,
		},
		{
			severity: 'minor',
			quote: '',
			note: 'Struktur kalimat berulang (akan ditolak).',
			category: 'Discourse',
			subcategory: 'cohesion',
			correction: '',
			explanation: '',
			criterion: '',
			confidence: 0.2,
		},
	];
	const findings = parseStructuredFindings(rawFindings, text, CRITERIA);

	// Lecturer review decisions (do not affect the exported AI content).
	const reviewStatus = ['approved', 'approved', 'rejected', 'rejected'] as const;

	it('parses exactly four findings', () => {
		expect(findings).toHaveLength(4);
	});

	it('every finding has a stable, non-empty fingerprint', () => {
		for (const f of findings) {
			expect(findingFingerprint(f)).toMatch(/^fp_[a-z0-9]+$/);
		}
	});

	it('the two approved and two rejected findings all export populated, linked fields', () => {
		for (let i = 0; i < findings.length; i++) {
			const finding = findings[i]!;
			const fp = findingFingerprint(finding);
			// Simulate the Phase 11 save path: the item carries the source fields.
			const fields = buildAiContentFields(finding, text);
			const item = {
				...fields,
				parentAiFindingId: fp,
				origin: 'ai',
				adjudicationStatus: reviewStatus[i] === 'approved' ? 'reviewed' : 'unreviewed',
			};
			const ai = resolveAiItemFields(item, finding);

			// The quote is always the source finding's quote (never silently
			// emptied), even for the rejected findings.
			expect(ai.quote).toBe(finding.quote);
			expect(ai.aiSeverity).toBe(finding.severity);
			expect(ai.aiCategory).toBe(finding.category);
			expect(ai.aiSubcategory).toBe(finding.subcategory);
			expect(ai.aiNote).toBe(finding.note);
			expect(ai.aiCorrection).toBe(finding.correction || '');
			expect(ai.aiExplanation).toBe(finding.explanation || '');
			expect(ai.aiCriterion).toBe(finding.criterion || '');
			expect(ai.aiConfidence).toBe(finding.confidence);
			expect(ai.parentAiFindingId).toBe(fp);
		}
	});

	it('the malformed-quote finding (rejected) is explicit about its invalid anchor', () => {
		const malformed = findings[2]!;
		expect(malformed.quote).toBe('nicht im text vorhanden');
		expect(malformed.anchorValid).toBe(false);
		const fields = buildAiContentFields(malformed, text);
		expect(fields.anchorValid).toBe(false);
		expect(fields.anchorError).toBe(ANCHOR_ERROR.QUOTE_NOT_IN_TEXT);
		// The quote is preserved, not silently emptied.
		expect(fields.quote).toBe('nicht im text vorhanden');
		// Confidence is preserved, not zeroed.
		expect(fields.aiConfidence).toBe(0.5);
	});

	it('the empty-quote finding (rejected) is a valid general finding with no offsets', () => {
		const general = findings[3]!;
		expect(general.quote).toBe('');
		const fields = buildAiContentFields(general, text);
		expect(fields.anchorValid).toBe(true);
		expect(fields.anchorError).toBe('');
		expect(fields.quoteStart).toBeNull();
		expect(fields.quoteEnd).toBeNull();
		expect(fields.quote).toBe('');
	});

	it('historical rows (empty AI fields) for the same findings are enriched at export', () => {
		for (let i = 0; i < findings.length; i++) {
			const finding = findings[i]!;
			const fp = findingFingerprint(finding);
			// Historical row: AI content fields empty, only the link is present.
			const historicalItem = {
				quote: '',
				quoteStart: null,
				quoteEnd: null,
				anchorValid: null,
				aiSeverity: '',
				aiCategory: '',
				aiSubcategory: '',
				aiNote: '',
				aiCorrection: '',
				aiExplanation: '',
				aiCriterion: '',
				aiConfidence: null,
				parentAiFindingId: fp,
			};
			const resolved = findSourceFindingByFingerprint(findings, fp);
			expect(resolved).toBe(finding);
			const ai = resolveAiItemFields(historicalItem, resolved);
			expect(ai.quote).toBe(finding.quote);
			expect(ai.aiSeverity).toBe(finding.severity);
			expect(ai.aiConfidence).toBe(finding.confidence);
			expect(ai.parentAiFindingId).toBe(fp);
		}
	});
});

// ── Raw output immutability ───────────────────────────────────────────────

describe('raw output immutability — parseFindings never mutates the source', () => {
	it('parseFindings returns a new array and does not mutate the input', () => {
		const raw = [
			{
				severity: 'major',
				quote: 'haus',
				note: 'n',
				category: 'Orthography',
				subcategory: 'capitalization',
				confidence: 0.9,
			},
		];
		const snapshot = JSON.parse(JSON.stringify(raw));
		parseFindings(raw);
		expect(raw).toEqual(snapshot);
	});
});
