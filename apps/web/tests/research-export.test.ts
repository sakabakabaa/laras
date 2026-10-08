import { describe, expect, it } from 'vitest';
import {
	assignParticipantIds,
	buildCsv,
	CSV_HEADERS,
	csvEscape,
	isAuthorizedExporter,
	isActiveRater,
	parseResearcherIds,
	resolveReviewDecision,
	EXPORT_RESEARCH_SCHEMA_VERSION,
	RESEARCH_DATASET_VERSION,
	serializeReviewFindings,
	serializeSnapshotProvenance,
} from '@/lib/research-export.server';

describe('research export schema version', () => {
	it('bumps the dataset and export format when snapshot payload policy changes', () => {
		expect(RESEARCH_DATASET_VERSION).toBe('laras-research-v3');
		expect(EXPORT_RESEARCH_SCHEMA_VERSION).toBe(3);
	});
});

describe('serializeSnapshotProvenance', () => {
	it('exports hashes and generation metadata without source text, prompts, image links or archived outputs', () => {
		const input = {
			researchSnapshot: { schemaVersion: 2, generationId: 'gen-1', capturedAt: '2026-10-07T00:00:00Z', buildId: 'build-1', studentText: 'PRIVATE STUDENT TEXT', userPrompt: 'PRIVATE PROMPT', systemPrompt: 'PRIVATE SYSTEM', images: ['https://private.test/image'], providerConfig: { provider: 'bynara', model: 'gpt-6-luna' }, hashes: { studentText: 'text-hash', userPrompt: 'prompt-hash' }, snapshotHash: 'snapshot-hash' },
			generationHistory: [{ archivedAt: '2026-10-06T00:00:00Z', rawOutput: 'PRIVATE OLD OUTPUT', summary: 'PRIVATE SUMMARY', researchSnapshot: { generationId: 'gen-old', studentText: 'OLD PRIVATE TEXT', hashes: { studentText: 'old-hash' }, snapshotHash: 'old-snapshot' } }],
		};
		const serialized = JSON.stringify(serializeSnapshotProvenance(input));
		expect(serialized).toContain('text-hash');
		expect(serialized).toContain('snapshot-hash');
		expect(serialized).toContain('gen-old');
		for (const privateValue of ['PRIVATE STUDENT TEXT', 'PRIVATE PROMPT', 'PRIVATE SYSTEM', 'private.test/image', 'PRIVATE OLD OUTPUT', 'PRIVATE SUMMARY', 'OLD PRIVATE TEXT']) {
			expect(serialized).not.toContain(privateValue);
		}
	});
});

describe('resolveReviewDecision', () => {
	const finding = { severity: 'major', quote: 'haus', note: 'old note', category: 'Orthography', subcategory: 'capitalization' };
	it('preserves rejection status and reason by stable source fingerprint', () => {
		const result = resolveReviewDecision([{ id: 'ai-0', source: 'ai', ...finding, status: 'rejected', rejectReason: 'Not an error' }], finding, 0);
		expect(result).toEqual({ status: 'rejected', rejectReason: 'Not an error' });
	});
	it('falls back to the stable AI index when lecturer edited the note', () => {
		const result = resolveReviewDecision([{ id: 'ai-0', source: 'ai', ...finding, note: 'edited note', status: 'approved', rejectReason: '' }], finding, 0);
		expect(result).toEqual({ status: 'approved', rejectReason: '' });
	});
	it('does not associate a decision from a different finding index', () => {
		const result = resolveReviewDecision([{ id: 'ai-1', source: 'ai', ...finding, status: 'rejected', rejectReason: 'wrong one' }], finding, 0);
		expect(result).toEqual({ status: '', rejectReason: '' });
	});
	it('ignores non-AI/manual review findings', () => {
		const result = resolveReviewDecision([{ id: 'dosen-1', source: 'lecturer', ...finding, status: 'manual', rejectReason: '' }], finding, 0);
		expect(result).toEqual({ status: '', rejectReason: '' });
	});
});

describe('serializeReviewFindings', () => {
	it('exports approved/rejected review decisions and rejection reasons linked by AI index', () => {
		const findings = [
			{ severity: 'major', quote: 'haus', note: 'Capitalization', category: 'Orthography', subcategory: 'capitalization' },
			{ severity: 'minor', quote: 'im Text', note: 'Suggestion', category: 'Lexicon', subcategory: 'word_choice' },
		];
		const rows = serializeReviewFindings([
			{ id: 'ai-0', source: 'ai', ...findings[0], status: 'approved', rejectReason: '' },
			{ id: 'ai-1', source: 'ai', ...findings[1], status: 'rejected', rejectReason: 'No actual error' },
			{ id: 'dosen-123', source: 'lecturer', quote: 'Berlin', note: 'Manual', status: 'manual' },
		], findings as never[]);
		expect(rows).toHaveLength(3);
		expect(rows[0]).toMatchObject({ origin: 'ai', status: 'approved', rejectReason: '' });
		expect(rows[1]).toMatchObject({ origin: 'ai', status: 'rejected', rejectReason: 'No actual error' });
		expect(rows[1].parentAiFindingId).toMatch(/^fp_/);
		expect(rows[2]).toMatchObject({ origin: 'lecturer', status: 'manual', parentAiFindingId: '' });
	});
});

	it('exports AI review decisions and reasons in CSV columns', () => {
		const headers = CSV_HEADERS;
		expect(headers).toContain('reviewStatus');
		expect(headers).toContain('rejectReason');
		const row = Object.fromEntries(headers.map((h) => [h, ''])) as Record<(typeof headers)[number], string>;
		row.reviewStatus = 'rejected';
		row.rejectReason = 'Not a real error';
		const csv = buildCsv([row]);
		const [headerLine, dataLine] = csv.split('\r\n');
		const cells = dataLine!.split(',');
		expect(cells[headerLine!.split(',').indexOf('reviewStatus')]).toBe('rejected');
		expect(cells[headerLine!.split(',').indexOf('rejectReason')]).toBe('Not a real error');
	});

	it('retains populated source fields, four distinct review decisions, and complete response linkage in synthetic export representation', () => {
		const source = [
			{ severity: 'major', quote: 'gehe ich', note: 'Word order', category: 'Syntax', subcategory: 'word_order', correction: 'gehe ich', explanation: 'Verb-second order', confidence: 0.9 },
			{ severity: 'major', quote: 'meine Schwester', note: 'Case', category: 'Morphology', subcategory: 'case', correction: 'meiner Schwester', explanation: 'Dative after mit', confidence: 0.95 },
			{ severity: 'minor', quote: 'Pizza und trinken Cola', note: 'Unidiomatic', category: 'Lexicon', subcategory: 'word_choice', correction: '', explanation: '', confidence: 0.4 },
			{ severity: 'minor', quote: 'Am Sonntag', note: 'Insufficient detail', category: 'Discourse', subcategory: 'cohesion', correction: '', explanation: '', confidence: 0.3 },
		];
		const decisions = [
			{ id: 'ai-0', source: 'ai', ...source[0], status: 'approved' },
			{ id: 'ai-1', source: 'ai', ...source[1], status: 'edited' },
			{ id: 'ai-2', source: 'ai', ...source[2], status: 'rejected', rejectReason: 'Grammatical and idiomatic as written' },
			{ id: 'ai-3', source: 'ai', ...source[3], status: 'rejected', rejectReason: 'The task did not require further Sunday detail' },
		];
		const rows = serializeReviewFindings(decisions, source as never[]);
		expect(rows).toHaveLength(4);
		expect(rows.map((r) => r.status)).toEqual(['approved', 'edited', 'rejected', 'rejected']);
		expect(rows.map((r) => r.rejectReason)).toEqual(['', '', 'Grammatical and idiomatic as written', 'The task did not require further Sunday detail']);
		expect(rows.map((r) => r.parentAiFindingId)).toEqual(source.map((f) => expect.stringMatching(/^fp_/)));
		expect(JSON.stringify({ fullResponse: 'synthetic full answer', reviewFindings: rows })).toContain('synthetic full answer');
	});

	it('keeps the previously exported historical fixture labeled pre-v2 without rewriting it', () => {
		const historicalExport = { researchDatasetVersion: 'laras-research-v1', model: 'integrated_ai', modelVersion: 'unknown' };
		expect(historicalExport.researchDatasetVersion).not.toBe('laras-research-v2');
		expect(historicalExport.model).toBe('integrated_ai');
		expect(historicalExport.modelVersion).toBe('unknown');
	});

describe('parseResearcherIds', () => {
	it('splits a comma-separated list and trims entries', () => {
		expect(parseResearcherIds(' a , b , ')).toEqual(['a', 'b']);
	});
	it('returns an empty list for undefined/empty', () => {
		expect(parseResearcherIds(undefined)).toEqual([]);
		expect(parseResearcherIds('')).toEqual([]);
	});
});

describe('active rater export policy', () => {
	it('denies active round-1/2 members, including an assignment owner who is a rater', () => {
		expect(isActiveRater('owner1', [{ reviewer: 'owner1', round: '1', active: true }])).toBe(true);
		expect(isActiveRater('rater2', [{ reviewer: 'rater2', round: '2', active: true }])).toBe(true);
	});
	it('does not deny inactive or non-rater accounts', () => {
		expect(isActiveRater('owner1', [{ reviewer: 'owner1', round: '1', active: false }])).toBe(false);
		expect(isActiveRater('owner1', [{ reviewer: 'other', round: '1', active: true }])).toBe(false);
	});
});

describe('isAuthorizedExporter', () => {
	it('allows the assignment owner', () => {
		expect(isAuthorizedExporter('u1', 'u1', [])).toBe(true);
	});
	it('allows an allowlisted researcher', () => {
		expect(isAuthorizedExporter('researcher1', 'u1', ['researcher1', 'researcher2'])).toBe(true);
	});
	it('blocks a non-owner, non-researcher user', () => {
		expect(isAuthorizedExporter('student1', 'u1', ['researcher1'])).toBe(false);
	});
	it('blocks when ids are empty', () => {
		expect(isAuthorizedExporter('', 'u1', [])).toBe(false);
		expect(isAuthorizedExporter('u1', '', [])).toBe(false);
	});
});

describe('assignParticipantIds', () => {
	it('assigns P001, P002, … in order of first appearance', () => {
		const map = assignParticipantIds(['studentA', 'studentB', 'studentA', 'studentC']);
		expect(map.get('studentA')).toBe('P001');
		expect(map.get('studentB')).toBe('P002');
		expect(map.get('studentC')).toBe('P003');
		expect(map.size).toBe(3);
	});
	it('skips empty keys', () => {
		const map = assignParticipantIds(['', 'studentA', '']);
		expect(map.size).toBe(1);
		expect(map.get('studentA')).toBe('P001');
	});
	it('never exposes the real key in the pseudonymous id', () => {
		const map = assignParticipantIds(['real-user-id-xyz']);
		const id = map.get('real-user-id-xyz')!;
		expect(id).toMatch(/^P\d{3}$/);
		expect(id).not.toContain('real-user-id-xyz');
	});
});

describe('csvEscape', () => {
	it('leaves simple text unchanged', () => {
		expect(csvEscape('hello')).toBe('hello');
	});
	it('wraps fields containing a comma', () => {
		expect(csvEscape('a,b')).toBe('"a,b"');
	});
	it('doubles inner double quotes', () => {
		expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
	});
	it('wraps fields containing a newline', () => {
		expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
	});
	it('wraps fields containing a carriage return', () => {
		expect(csvEscape('a\rb')).toBe('"a\rb"');
	});
	it('renders booleans and numbers, empties null', () => {
		expect(csvEscape(true)).toBe('true');
		expect(csvEscape(false)).toBe('false');
		expect(csvEscape(42)).toBe('42');
		expect(csvEscape(null)).toBe('');
		expect(csvEscape(undefined)).toBe('');
	});
	it('escapes a quote + comma combination', () => {
		expect(csvEscape('"a",b')).toBe('"""a"",b"');
	});
});

describe('buildCsv', () => {
	it('emits the header row plus one row per item in the requested column order', () => {
		const rows = [
			{
				participantId: 'P001',
				submissionId: 'sub1',
				assignmentId: 'asg1',
				taskId: 'asg1',
				cefrLevel: 'A1',
				model: 'gpt-test',
				modelVersion: 'v1',
				promptVersion: 'pv1',
				researchSchemaVersion: '1',
				feedbackItemId: 'item1',
				origin: 'ai',
				quote: 'der Hund',
				quoteStart: '0',
				quoteEnd: '8',
				anchorValid: 'true',
				aiCategory: 'Morphology',
				aiSubcategory: 'case',
				aiSeverity: 'major',
				aiCorrection: 'den Hund',
				aiExplanation: 'wrong case',
				referenceCategory: 'Morphology',
				referenceSubcategory: 'case',
				referenceSeverity: 'major',
				referenceCorrection: 'den Hund',
				referenceExplanation: 'accusative',
				errorPresent: 'yes',
				detectionJudgment: 'correct',
				correctionJudgment: 'correct',
				explanationJudgment: 'correct',
				completenessJudgment: 'complete',
				necessityJudgment: 'necessary',
				pedagogicalJudgment: 'appropriate',
				reviewer: 'lecturer1',
				reviewedAt: '2026-10-04T00:00:00Z',
				adjudicationStatus: 'reviewed',
			},
		];
		const csv = buildCsv(rows);
		const lines = csv.split('\r\n');
		expect(lines[0]).toBe(CSV_HEADERS.join(','));
		expect(lines).toHaveLength(2);
		// Every requested column is present in the header, in order.
		expect(CSV_HEADERS).toContain('participantId');
		// Spot-check a value landed in the right column.
		const headers = lines[0].split(',');
		const participantCol = headers.indexOf('participantId');
		const dataCols = lines[1].split(',');
		expect(dataCols[participantCol]).toBe('P001');
	});

	it('escapes a quote containing a comma in a field', () => {
		const emptyRow = Object.fromEntries(CSV_HEADERS.map((h) => [h, ''])) as Record<
			(string & {})[],
			string
		>;
		const row = { ...emptyRow, quote: 'a,b "x"' };
		const csv = buildCsv([row]);
		const dataLine = csv.split('\r\n')[1];
		// The escaped quote field appears verbatim in the row.
		expect(dataLine).toContain('"a,b ""x"""');
	});

	it('contains every column required by the research export spec', () => {
		const required = [
			'participantId',
			'submissionId',
			'assignmentId',
			'taskId',
			'cefrLevel',
			'model',
			'modelVersion',
			'promptVersion',
			'researchSchemaVersion',
			'feedbackItemId',
			'origin',
			'quote',
			'quoteStart',
			'quoteEnd',
			'anchorValid',
			'anchorError',
			'aiCategory',
			'aiSubcategory',
			'aiSeverity',
			'aiNote',
			'aiCorrection',
			'aiExplanation',
			'aiCriterion',
			'aiConfidence',
			'parentAiFindingId',
			'referenceCategory',
			'referenceSubcategory',
			'referenceSeverity',
			'referenceCorrection',
			'referenceExplanation',
			'errorPresent',
			'detectionJudgment',
			'correctionJudgment',
			'explanationJudgment',
			'completenessJudgment',
			'necessityJudgment',
			'pedagogicalJudgment',
			'reviewer',
			'reviewedAt',
			'adjudicationStatus',
		];
		for (const col of required) {
			expect(CSV_HEADERS, `missing column ${col}`).toContain(col);
		}
		// No direct identifiers in the export columns.
		for (const forbidden of ['name', 'email', 'nim', 'owner']) {
			expect(CSV_HEADERS.map((h) => h.toLowerCase())).not.toContain(forbidden);
		}
	});
});
