import { describe, expect, it } from 'vitest';
import {
	buildMarkedSegments,
	isValidTaxonomy,
	parseFindings,
	parseStructuredFindings,
	resolveAnchor,
	sanitizeTaxonomy,
	type EvalFinding,
} from '@/lib/ai-evaluation';

const CRITERIA = [
	{ label: 'Tata bahasa', weight: 1 },
	{ label: 'Kosakata', weight: 1 },
];

/** Minimal helper to build a model finding object. */
function modelFinding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		severity: 'major',
		quote: '',
		category: 'Orthography',
		subcategory: 'capitalization',
		errorDescription: 'Kata benda harus dikapitalisasi.',
		correction: 'Haus',
		explanation: 'Kata benda di Jerman selalu dikapitalisasi.',
		note: 'Kata benda harus dikapitalisasi.',
		evidence: '',
		criterion: '',
		confidence: 0.9,
		...overrides,
	};
}

describe('German L2 structured feedback — taxonomy', () => {
	it('accepts every controlled pair', () => {
		expect(isValidTaxonomy('Morphology', 'article')).toBe(true);
		expect(isValidTaxonomy('Syntax', 'V2')).toBe(true);
		expect(isValidTaxonomy('Orthography', 'ß')).toBe(true);
		expect(isValidTaxonomy('Register/pragmatics', 'formality')).toBe(true);
		expect(isValidTaxonomy('Task', 'incomplete_response')).toBe(true);
	});

	it('rejects pairs outside the taxonomy', () => {
		expect(isValidTaxonomy('Morphology', 'spelling')).toBe(false);
		expect(isValidTaxonomy('Stylistics', 'tone')).toBe(false);
		expect(isValidTaxonomy('', '')).toBe(false);
	});

	it('sanitizes invalid pairs to empty (raw output preserved separately)', () => {
		expect(sanitizeTaxonomy('Stylistics', 'tone')).toEqual({ category: '', subcategory: '' });
		expect(sanitizeTaxonomy('Morphology', 'spelling')).toEqual({ category: '', subcategory: '' });
		expect(sanitizeTaxonomy('Syntax', 'word_order')).toEqual({
			category: 'Syntax',
			subcategory: 'word_order',
		});
	});
});

describe('resolveAnchor — anchor validation rules', () => {
	const text = 'Ich gehe nach Hause. Das Haus ist groß.';

	it('empty quote = general finding, no anchor', () => {
		const a = resolveAnchor('', text);
		expect(a.anchorValid).toBe(true);
		expect(a.quoteStart).toBeNull();
		expect(a.anchorAmbiguous).toBe(false);
	});

	it('single exact match stores precise offsets', () => {
		const start = text.indexOf('Haus ist');
		const a = resolveAnchor('Haus ist', text);
		expect(a.anchorValid).toBe(true);
		expect(a.anchorAmbiguous).toBe(false);
		expect(a.quoteStart).toBe(start);
		expect(a.quoteEnd).toBe(start + 'Haus ist'.length);
		expect(text.slice(a.quoteStart!, a.quoteEnd!)).toBe('Haus ist');
	});

	it('a quote not in the text is invalid-anchor, never silently emptied', () => {
		const a = resolveAnchor('nicht vorhanden hier', text);
		expect(a.anchorValid).toBe(false);
		expect(a.quoteStart).toBeNull();
		expect(a.quoteEnd).toBeNull();
		expect(a.anchorAmbiguous).toBe(false);
	});

	it('a repeated quote is ambiguous — no offsets, no guessing', () => {
		// "Haus" appears in "Hause" and "Haus" — but as a standalone word only
		// once. Use a substring that truly repeats.
		const repeated = 'Ich gehe nach Hause. Ich gehe nach Hause.';
		const a = resolveAnchor('Ich gehe nach Hause.', repeated);
		expect(a.anchorValid).toBe(true);
		expect(a.anchorAmbiguous).toBe(true);
		expect(a.quoteStart).toBeNull();
		expect(a.quoteEnd).toBeNull();
	});
});

describe('parseStructuredFindings — six research scenarios', () => {
	// 1. VALID GERMAN ERROR — a real learner error with a correct, unambiguous
	//    quote. The finding is preserved with a valid anchor and full taxonomy.
	it('1. valid German error: preserves valid anchor + structured fields', () => {
		const text = 'Gestern ich gehe nach haus.';
		const start = text.indexOf('haus');
		const findings = parseStructuredFindings(
			[
				modelFinding({
					quote: 'haus',
					category: 'Orthography',
					subcategory: 'capitalization',
					correction: 'Haus',
					note: 'Kata benda "Haus" harus dikapitalisasi.',
					confidence: 0.92,
				}),
			],
			text,
			CRITERIA,
		);
		expect(findings).toHaveLength(1);
		const f = findings[0]!;
		expect(f.anchorValid).toBe(true);
		expect(f.anchorAmbiguous).toBe(false);
		expect(f.quoteStart).toBe(start);
		expect(f.quoteEnd).toBe(start + 'haus'.length);
		expect(f.category).toBe('Orthography');
		expect(f.subcategory).toBe('capitalization');
		expect(f.correction).toBe('Haus');
		expect(f.confidence).toBe(0.92);
	});

	// 2. VALID BUT STYLISTICALLY DIFFERENT GERMAN — the model flagged an
	//    acceptable formulation. The parser does NOT judge stylistic validity
	//    (that is the system prompt's job); it preserves the finding verbatim
	//    so the lecturer/researcher can review the classification.
	it('2. stylistically different German: preserved, not filtered by the parser', () => {
		const text = 'Am Wochenende lese ich gerne Bücher.';
		const findings = parseStructuredFindings(
			[
				modelFinding({
					severity: 'minor',
					quote: 'lese ich gerne',
					category: 'Lexicon',
					subcategory: 'word_choice',
					correction: 'lese ich',
					note: 'Mungkin lebih ringkas tanpa "gerne".',
					confidence: 0.3,
				}),
			],
			text,
			CRITERIA,
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]!.anchorValid).toBe(true);
		expect(findings[0]!.confidence).toBe(0.3);
		expect(findings[0]!.category).toBe('Lexicon');
	});

	// 3. FALSE-POSITIVE CANDIDATE — a low-confidence finding the lecturer will
	//    likely reject. Confidence and taxonomy are preserved for research.
	it('3. false-positive candidate: low confidence preserved', () => {
		const text = 'Wir haben uns gefreut.';
		const findings = parseStructuredFindings(
			[
				modelFinding({
					severity: 'minor',
					quote: 'gefreut',
					category: 'Morphology',
					subcategory: 'verb_conjugation',
					correction: 'gefreut',
					note: 'Mungkin bentuk tidak standar (ragu).',
					confidence: 0.15,
				}),
			],
			text,
			CRITERIA,
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]!.confidence).toBe(0.15);
		expect(findings[0]!.anchorValid).toBe(true);
	});

	// 4. INVALID QUOTE — the model's quote is not in the student text. The
	//    finding is PRESERVED as an invalid-anchor finding (anchorValid=false),
	//    never silently turned into an empty quote or dropped.
	it('4. invalid quote: preserved with anchorValid=false, not dropped', () => {
		const text = 'Ich lerne Deutsch seit zwei Jahren.';
		const findings = parseStructuredFindings(
			[
				modelFinding({
					quote: 'seit drei Jahren',
					note: 'Angka tahun tidak cocok.',
					category: 'Lexicon',
					subcategory: 'semantic_choice',
					confidence: 0.5,
				}),
			],
			text,
			CRITERIA,
		);
		expect(findings).toHaveLength(1);
		const f = findings[0]!;
		expect(f.anchorValid).toBe(false);
		expect(f.quoteStart).toBeNull();
		expect(f.quote).toBe('seit drei Jahren'); // original quote preserved
		expect(f.category).toBe('Lexicon');
	});

	// 5. REPEATED QUOTE — the quote occurs more than once. The model's intended
	//    location cannot be determined, so the anchor is marked ambiguous
	//    rather than guessing.
	it('5. repeated quote: marked ambiguous, no offsets', () => {
		const text = 'Ich liebe Berlin. Ich liebe Berlin sehr.';
		const findings = parseStructuredFindings(
			[
				modelFinding({
					quote: 'Ich liebe Berlin',
					note: 'Struktur kalimat berulang.',
					category: 'Discourse',
					subcategory: 'cohesion',
					confidence: 0.4,
				}),
			],
			text,
			CRITERIA,
		);
		expect(findings).toHaveLength(1);
		const f = findings[0]!;
		expect(f.anchorValid).toBe(true);
		expect(f.anchorAmbiguous).toBe(true);
		expect(f.quoteStart).toBeNull();
	});

	// 6. NO-ERROR SUBMISSION — the model correctly returns no findings.
	it('6. no-error submission: empty findings array', () => {
		const text = 'Ich wohne in Berlin. Ich studiere Informatik.';
		const findings = parseStructuredFindings([], text, CRITERIA);
		expect(findings).toEqual([]);
	});

	it('6b. no-error submission: model returns empty findings array', () => {
		const text = 'Ich wohne in Berlin. Ich studiere Informatik.';
		const findings = parseStructuredFindings([], text, CRITERIA);
		expect(findings).toEqual([]);
	});
});

describe('parseStructuredFindings — validation & backward compatibility', () => {
	it('drops findings without a note', () => {
		const findings = parseStructuredFindings(
			[{ severity: 'major', quote: 'x', note: '' }],
			'x',
			CRITERIA,
		);
		expect(findings).toHaveLength(0);
	});

	it('drops findings with an invalid severity', () => {
		const findings = parseStructuredFindings(
			[{ severity: 'critical', quote: 'x', note: 'n' }],
			'x',
			CRITERIA,
		);
		expect(findings).toHaveLength(0);
	});

	it('sanitizes an out-of-taxonomy category to empty', () => {
		const text = 'Ich gehe.';
		const findings = parseStructuredFindings(
			[
				modelFinding({
					quote: 'gehe',
					category: 'Stylistics',
					subcategory: 'tone',
				}),
			],
			text,
			CRITERIA,
		);
		expect(findings[0]!.category).toBe('');
		expect(findings[0]!.subcategory).toBe('');
	});

	it('clamps confidence to [0, 1]', () => {
		const text = 'Ich gehe.';
		const findings = parseStructuredFindings(
			[modelFinding({ quote: 'gehe', confidence: 1.5 })],
			text,
			CRITERIA,
		);
		expect(findings[0]!.confidence).toBe(1);
	});

	it('maps a model criterion to a stored rubric label', () => {
		const text = 'Ich gehe.';
		const findings = parseStructuredFindings(
			[modelFinding({ quote: 'gehe', criterion: 'tata bahasa' })],
			text,
			CRITERIA,
		);
		expect(findings[0]!.criterion).toBe('Tata bahasa');
	});

	it('caps at 12 findings', () => {
		const text = 'a b c d e f g h i j k l m n';
		const raw = Array.from({ length: 20 }, (_, i) =>
			modelFinding({ quote: '', note: `note ${i}`, severity: 'minor' }),
		);
		const findings = parseStructuredFindings(raw, text, CRITERIA);
		expect(findings).toHaveLength(12);
	});

	it('parses OLD findings without structured fields (backward compat)', () => {
		// An evaluation stored before Phase 2 — only severity/quote/note/evidence.
		// parseFindings must read it without losing data and without inventing
		// structured fields; anchor fields stay undefined/null so the marker falls
		// back to indexOf (the original behaviour).
		const text = 'Ich gehe nach Hause.';
		const oldFindings = [
			{ severity: 'major', quote: 'Hause', note: 'Salah ejaan.', evidence: 'rubrik' },
		];
		const findings = parseFindings(oldFindings);
		expect(findings).toHaveLength(1);
		const f = findings[0]!;
		expect(f.note).toBe('Salah ejaan.');
		expect(f.evidence).toBe('rubrik');
		expect(f.category).toBe('');
		expect(f.subcategory).toBe('');
		expect(f.correction).toBe('');
		expect(f.confidence).toBeUndefined();
		expect(f.anchorValid).toBeUndefined();
		expect(f.quoteStart).toBeNull();
	});
});

describe('buildMarkedSegments — anchor-aware marking', () => {
	const text = 'Ich gehe nach haus. Das ist falsch.';

	it('marks a valid single-match finding', () => {
		const text = 'Ich gehe nach haus. Das ist falsch.';
		const start = text.indexOf('haus');
		const findings: EvalFinding[] = [
			{
				severity: 'major',
				quote: 'haus',
				note: 'n',
				evidence: '',
				anchorValid: true,
				quoteStart: start,
				quoteEnd: start + 'haus'.length,
				anchorAmbiguous: false,
			},
		];
		const segments = buildMarkedSegments(text, findings);
		const marked = segments.filter((s) => s.severity);
		expect(marked).toHaveLength(1);
		expect(marked[0]!.text).toBe('haus');
	});

	it('never marks an invalid-anchor finding', () => {
		const findings: EvalFinding[] = [
			{
				severity: 'major',
				quote: 'nicht vorhanden',
				note: 'n',
				evidence: '',
				anchorValid: false,
				quoteStart: null,
				quoteEnd: null,
				anchorAmbiguous: false,
			},
		];
		const segments = buildMarkedSegments(text, findings);
		expect(segments.filter((s) => s.severity)).toHaveLength(0);
	});

	it('never marks an ambiguous finding (no guessing)', () => {
		const repeated = 'Ich liebe Berlin. Ich liebe Berlin.';
		const findings: EvalFinding[] = [
			{
				severity: 'major',
				quote: 'Ich liebe Berlin',
				note: 'n',
				evidence: '',
				anchorValid: true,
				quoteStart: null,
				quoteEnd: null,
				anchorAmbiguous: true,
			},
		];
		const segments = buildMarkedSegments(repeated, findings);
		expect(segments.filter((s) => s.severity)).toHaveLength(0);
	});

	it('falls back to indexOf for old findings without anchor fields', () => {
		const findings: EvalFinding[] = [
			{ severity: 'major', quote: 'haus', note: 'n', evidence: '' },
		];
		const segments = buildMarkedSegments(text, findings);
		const marked = segments.filter((s) => s.severity);
		expect(marked).toHaveLength(1);
		expect(marked[0]!.text).toBe('haus');
	});
});
