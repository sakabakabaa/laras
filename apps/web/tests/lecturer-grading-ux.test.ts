import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbase-client', () => ({
	default: {
		authStore: { token: '', record: null, onChange: () => () => {} },
		collection: () => ({ getFirstListItem: () => new Promise(() => {}) }),
	},
}));

vi.mock('@/hooks/use-unsaved-work', () => ({ useUnsavedWork: () => {} }));

import { coursePublishBlocker, type GradeComponent } from '@/lib/gradebook';
import { AiEvaluationPanel, AiEvaluationReviewProvider } from '@/components/app/ai-evaluation-review';
import type { Assignment } from '@/lib/assignments';

const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('course grade publishing', () => {
	const components = [
		{ id: 'a', status: 'active', weight: 60 },
		{ id: 'b', status: 'active', weight: 40 },
	] as GradeComponent[];
	const complete = { countingCount: 2, gradedCount: 2 };

	it('names the blocking reason the button shows', () => {
		expect(coursePublishBlocker(components, [])).toMatchObject({ reason: 'noStudents' });
		expect(coursePublishBlocker(components.slice(0, 1), [complete])).toMatchObject({ reason: 'weights' });
		expect(coursePublishBlocker(components, [complete, { countingCount: 2, gradedCount: 1 }, { countingCount: 0, gradedCount: 0 }])).toEqual({
			reason: 'incomplete',
			incompleteCount: 2,
		});
		expect(coursePublishBlocker(components, [complete])).toEqual({ reason: null, incompleteCount: 0 });
	});

	it('uses no browser alerts or untranslated review title in the gradebook', () => {
		const gradebook = source('components/app/lecturer-gradebook.tsx');
		expect(gradebook).not.toContain('window.alert');
		expect(gradebook).not.toContain('"Review grade changes"');
		expect(gradebook).toContain("t('gb.review.title')");
	});
});

describe('Tugas grading panel', () => {
	const assignment = {
		id: 'assign1',
		owner: 'lecturer1',
		shape: 'writing',
		activityType: 'formal',
		taskConfig: { prompt: 'Schreiben Sie eine E-Mail an Ihre Freundin.', criteria: [] },
	} as unknown as Assignment;

	const render = () =>
		renderToStaticMarkup(
			createElement(
				AiEvaluationReviewProvider as unknown as (props: Record<string, unknown>) => null,
				{ assignment, participant: { enrolledId: 'sub12345', status: 'submitted' }, content: 'Hallo Anna' },
				createElement(AiEvaluationPanel),
			),
		);

	it('renders through the shared GradingPanel with the publish action and its reasons', () => {
		const html = render();
		expect(html).toContain('Penilaian &amp; umpan balik');
		expect(html).toContain('Terbitkan nilai &amp; lanjut');
		expect(html).toContain('Simpan draf');
		expect(html).toContain('Tugas tanpa rubrik berbobot: isi nilai keseluruhan.');
	});

	it('offers a rubric suggestion when the task has no criteria', () => {
		const html = render();
		expect(html).toContain('Tugas ini belum menyimpan kriteria rubrik.');
		expect(html).toContain('Sarankan rubrik');
	});

	it('keeps the publish confirmation wording explicit and drops the dead code', () => {
		const review = source('components/app/ai-evaluation-review.tsx');
		expect(source('lib/i18n.ts')).toContain("'aevr.yesSaveNext': 'Ya, terbitkan & lanjut'");
		expect(review).toContain('Setujui semua temuan');
		expect(review).toContain('Alasan penolakan (opsional)');
		expect(review).not.toContain('minimal 4 karakter');
		expect(review).not.toMatch(/^\/\*\n\t+<header className="aev-head">/m);
	});
});
