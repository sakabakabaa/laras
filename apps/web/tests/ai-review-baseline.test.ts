import {describe, expect, it} from 'vitest';
import {aiDraftBaseline, canResetToFreshDraft, regenerationLanded, reviewCopyDirty} from '@/lib/ai-review-baseline';

const criteria = [{id: 'g', label: 'Grammatik', weight: 100}];
const rowOf = (generatedAt: string, quote: string, extra: Record<string, unknown> = {}) => ({
	status: 'ready',
	generatedAt,
	findings: [{severity: 'minor', quote, note: 'Perbaiki', correction: 'x', confidence: 0.9}],
	rubricBreakdown: [{criterionId: 'g', criterion: 'Grammatik', score: 70, note: '"a"'}],
	...extra,
});

describe('Tugas AI review baseline after "Buat ulang AI"', () => {
	it('is clean right after a regeneration replaces the working copy', () => {
		const old = aiDraftBaseline(rowOf('t1', 'alt'), criteria);
		const fresh = rowOf('t2', 'neu');
		// Old behaviour: the old working copy no longer matches the new draft -> "Draf belum disimpan".
		expect(reviewCopyDirty(old, aiDraftBaseline(fresh, criteria))).toBe(true);
		expect(regenerationLanded(fresh, 't1')).toBe(true);
		expect(canResetToFreshDraft(fresh, 0)).toBe(true);
		const baseline = aiDraftBaseline(fresh, criteria);
		const working = {findings: baseline.findings, scores: baseline.scores};
		expect(reviewCopyDirty(working, baseline)).toBe(false);
		// ...and becomes dirty only once the lecturer edits.
		const edited = {...working, findings: working.findings.map((f) => ({...f, status: 'approved' as const}))};
		expect(reviewCopyDirty(edited, baseline)).toBe(true);
	});

	it('does not treat a pending or unchanged draft as a landed regeneration', () => {
		expect(regenerationLanded({...rowOf('t1', 'alt'), status: 'pending'}, 't1')).toBe(false);
		expect(regenerationLanded(rowOf('t1', 'alt'), 't1')).toBe(false);
		expect(regenerationLanded(null, 't1')).toBe(false);
	});

	it('never resets over something the lecturer saved', () => {
		expect(canResetToFreshDraft(rowOf('t2', 'neu', {reviewedAt: '2026-11-01'}), 0)).toBe(false);
		expect(canResetToFreshDraft(rowOf('t2', 'neu'), 2)).toBe(false);
	});
});
