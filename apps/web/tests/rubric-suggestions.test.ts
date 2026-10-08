import { describe, expect, it } from 'vitest';
import {
	EMPTY_SUGGESTED_CRITERIA,
	MAX_RUBRIC_SUGGESTIONS,
	acceptSuggestion,
	canSuggestCriteria,
	dismissSuggestion,
	mergeGenerated,
	parseSuggestedCriteria,
	type SuggestedCriteria,
	type SuggestedCriterion,
} from '@/lib/rubric-suggestions';
import { buildRubricSuggestions, deriveSuggestionInput } from '@/lib/rubric-suggestions.server';
import type { Assignment } from '@/lib/assignments';

function criterion(id: string, label: string, weight = 1): SuggestedCriterion {
	return { id, label, weight, rationale: `aspek ${label}` };
}

function state(pending: SuggestedCriterion[] = [], extra: Partial<SuggestedCriteria> = {}): SuggestedCriteria {
	return { ...EMPTY_SUGGESTED_CRITERIA, pending, ...extra };
}

function writingAssignment(prompt: string, criteria: { id: string; label: string; weight: number }[] = []): Assignment {
	return {
		id: 'asg1',
		owner: 'u1',
		course: 'c1',
		session: 's1',
		subCpmk: 'sub1',
		title: 'Tugas menulis',
		instructions: 'Tulis esai argumentatif.',
		requirements: '',
		stages: null,
		deadline: '',
		mode: 'individual',
		shape: 'writing',
		taskConfig: { prompt, formatGuidance: '', language: 'Jerman', minWords: 100, maxWords: 300, criteria, allowText: true, allowDocument: true, allowPhotos: false },
		groupInfo: '',
		status: 'draft',
		created: '',
		updated: '',
	} as Assignment;
}

describe('parseSuggestedCriteria', () => {
	it('tolerates null / bad json / missing fields', () => {
		expect(parseSuggestedCriteria(null)).toEqual(EMPTY_SUGGESTED_CRITERIA);
		expect(parseSuggestedCriteria('not json')).toEqual(EMPTY_SUGGESTED_CRITERIA);
		expect(parseSuggestedCriteria({})).toEqual(EMPTY_SUGGESTED_CRITERIA);
	});

	it('clips labels and clamps weights to 1–3', () => {
		const parsed = parseSuggestedCriteria({
			pending: [{ id: 's1', label: 'Kelancaran', weight: 9 }, { id: 's2', label: 'Tata bahasa', weight: 0 }],
		});
		expect(parsed.pending[0].weight).toBe(3);
		expect(parsed.pending[1].weight).toBe(1);
	});

	it('drops empty labels and caps the count', () => {
		const many = Array.from({ length: MAX_RUBRIC_SUGGESTIONS + 3 }, (_, i) => ({
			id: `s${i}`,
			label: `Kriteria ${i}`,
			weight: 1,
		}));
		const parsed = parseSuggestedCriteria({ pending: [...many, { id: 'x', label: '', weight: 1 }] });
		expect(parsed.pending).toHaveLength(MAX_RUBRIC_SUGGESTIONS);
	});
});

describe('acceptSuggestion — acceptance moves into criteria, never touches scoring', () => {
	it('removes the criterion from pending and records its label as accepted', () => {
		const before = state([criterion('s1', 'Kelancaran'), criterion('s2', 'Tata bahasa')]);
		const { state: after, criterion: accepted } = acceptSuggestion(before, 's1');
		expect(accepted?.label).toBe('Kelancaran');
		expect(after.pending).toHaveLength(1);
		expect(after.pending[0].id).toBe('s2');
		expect(after.accepted).toEqual(['Kelancaran']);
	});

	it('returns null and leaves state unchanged for an unknown id', () => {
		const before = state([criterion('s1', 'Kelancaran')]);
		const { state: after, criterion: accepted } = acceptSuggestion(before, 's9');
		expect(accepted).toBeNull();
		expect(after).toBe(before);
	});

	it('does not mutate the original state', () => {
		const before = state([criterion('s1', 'Kelancaran')]);
		acceptSuggestion(before, 's1');
		expect(before.pending).toHaveLength(1);
		expect(before.accepted).toEqual([]);
	});
});

describe('dismissSuggestion — dismissals are durable', () => {
	it('removes from pending and records the dismissed label', () => {
		const before = state([criterion('s1', 'Kelancaran'), criterion('s2', 'Tata bahasa')]);
		const after = dismissSuggestion(before, 's1');
		expect(after.pending).toHaveLength(1);
		expect(after.dismissed).toEqual(['Kelancaran']);
	});

	it('a dismissed label does not come back on regeneration (mergeGenerated filters it)', () => {
		const previous = state([], { dismissed: ['Kelancaran'] });
		const regenerated = {
			pending: [criterion('s1', 'Kelancaran'), criterion('s2', 'Tata bahasa')],
			generatedAt: '2026-01-01T00:00:00.000Z',
			reason: '',
		};
		const merged = mergeGenerated(previous, regenerated);
		expect(merged.pending.map((s) => s.label)).toEqual(['Tata bahasa']);
		expect(merged.dismissed).toEqual(['Kelancaran']);
	});

	it('an accepted label is also filtered out on regeneration', () => {
		const previous = state([], { accepted: ['Tata bahasa'] });
		const regenerated = {
			pending: [criterion('s1', 'Kelancaran'), criterion('s2', 'Tata bahasa')],
			generatedAt: '2026-01-01T00:00:00.000Z',
			reason: '',
		};
		const merged = mergeGenerated(previous, regenerated);
		expect(merged.pending.map((s) => s.label)).toEqual(['Kelancaran']);
	});

	it('dismissing all suggestions leaves an empty pending list and a reason', () => {
		const previous = state([criterion('s1', 'Kelancaran')]);
		const after = dismissSuggestion(previous, 's1');
		expect(after.pending).toEqual([]);
		expect(after.dismissed).toEqual(['Kelancaran']);
		// Regenerating with everything dismissed yields no pending + a reason.
		const merged = mergeGenerated(after, {
			pending: [criterion('s1', 'Kelancaran')],
			generatedAt: '2026-01-01T00:00:00.000Z',
			reason: '',
		});
		expect(merged.pending).toEqual([]);
		expect(merged.reason).not.toBe('');
	});
});

describe('canSuggestCriteria — eligibility gate', () => {
	it('is true only for writing/speaking with an empty rubric and a long-enough prompt', () => {
		expect(canSuggestCriteria({ kind: 'writing', prompt: 'Tulis esai argumentatif 300 kata', criteriaCount: 0 })).toBe(true);
		expect(canSuggestCriteria({ kind: 'speaking', prompt: 'Rekam presentasi diri 2 menit', criteriaCount: 0 })).toBe(true);
	});

	it('is false when criteria already exist (existing editor behaviour unchanged)', () => {
		expect(canSuggestCriteria({ kind: 'writing', prompt: 'Tulis esai argumentatif 300 kata', criteriaCount: 1 })).toBe(false);
	});

	it('is false when the prompt is too short or empty', () => {
		expect(canSuggestCriteria({ kind: 'writing', prompt: 'singkat', criteriaCount: 0 })).toBe(false);
		expect(canSuggestCriteria({ kind: 'writing', prompt: '', criteriaCount: 0 })).toBe(false);
	});

	it('is false for non-writing/speaking kinds', () => {
		expect(canSuggestCriteria({ kind: 'quiz', prompt: 'Tulis esai argumentatif 300 kata', criteriaCount: 0 })).toBe(false);
		expect(canSuggestCriteria({ kind: null, prompt: 'Tulis esai argumentatif 300 kata', criteriaCount: 0 })).toBe(false);
	});
});

describe('buildRubricSuggestions — generation separation & save independence', () => {
	it('returns an empty pending list with a reason when the prompt is too short (no model call)', async () => {
		const result = await buildRubricSuggestions(writingAssignment('singkat'));
		expect(result.pending).toEqual([]);
		expect(result.reason).not.toBe('');
	});

	it('returns an empty pending list with a reason for a non-writing/speaking shape', async () => {
		const assignment = { ...writingAssignment('Tulis esai argumentatif 300 kata'), shape: 'quiz' } as Assignment;
		const result = await buildRubricSuggestions(assignment);
		expect(result.pending).toEqual([]);
		expect(result.reason).not.toBe('');
	});

	it('deriveSuggestionInput reads only the task own stored data', () => {
		const input = deriveSuggestionInput(writingAssignment('Tulis esai argumentatif 300 kata'));
		expect(input?.kind).toBe('writing');
		expect(input?.prompt).toBe('Tulis esai argumentatif 300 kata');
		expect(input?.language).toBe('Jerman');
		expect(input?.minWords).toBe(100);
		expect(input?.maxWords).toBe(300);
	});

	it('deriveSuggestionInput returns null for a non-writing/speaking shape', () => {
		const assignment = { ...writingAssignment('Tulis esai argumentatif 300 kata'), shape: 'quiz' } as Assignment;
		expect(deriveSuggestionInput(assignment)).toBeNull();
	});
});

describe('save independence — suggestions never become criteria until accepted', () => {
	it('an untouched suggestion state keeps criteria empty: splitTaskConfigForSave writes no criteria', async () => {
		// Simulate the form's save path for a writing task whose suggestions
		// were generated but never accepted: the real criteria array stays
		// empty, so the no-rubric scoring path is unchanged.
		const { splitTaskConfigForSave, emptyEditableConfig } = await import('@/lib/task-types');
		const editable = emptyEditableConfig('writing');
		editable.writing.prompt = 'Tulis esai argumentatif 300 kata';
		// Suggestions exist in the separate field but were NOT accepted:
		editable.writing.criteria = [];
		const { taskConfig } = splitTaskConfigForSave(editable);
		expect((taskConfig as { criteria: unknown[] }).criteria).toEqual([]);
	});

	it('an accepted suggestion becomes a normal criterion inside taskConfig', async () => {
		const { splitTaskConfigForSave, emptyEditableConfig } = await import('@/lib/task-types');
		const editable = emptyEditableConfig('writing');
		editable.writing.prompt = 'Tulis esai argumentatif 300 kata';
		// The lecturer accepted one suggestion — it is now a real criterion:
		editable.writing.criteria = [{ id: 'c1', label: 'Kelancaran', weight: 2 }];
		const { taskConfig } = splitTaskConfigForSave(editable);
		expect((taskConfig as { criteria: { label: string }[] }).criteria[0].label).toBe('Kelancaran');
	});
});
