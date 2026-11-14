import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbase-client', () => ({ default: { authStore: { token: '', record: null, onChange: () => () => {} } } }));

import { GradingPanel, mergeAiFeedback, type GradingPanelProps } from '@/components/app/grading/grading-panel';
import { runInWaves } from '@/lib/evaluation-bulk';
import { nextToGrade } from '@/components/app/evaluation-workspace';

const noop = () => {};

function props(extra: Partial<GradingPanelProps> = {}): GradingPanelProps {
	return {
		title: 'Penilaian',
		statusLabel: 'Draf',
		criteria: [
			{ id: 'c1', label: 'Inhalt', weight: 2, weightPercent: 67, evidence: '1 merah sebagai bukti.' },
			{ id: 'c2', label: 'Grammatik', weight: 1, weightPercent: 33 },
		],
		scores: { c1: 85 },
		onScoreChange: noop,
		rubricTotal: null,
		feedback: '',
		onFeedbackChange: noop,
		aiDraft: { status: 'ready', score: 90, criterionScores: { c1: 85, c2: 70 }, summary: 'Gut gemacht.' },
		onApplyAi: noop,
		finalScore: { value: '', onChange: noop, placeholder: 'Belum dinilai' },
		primaryAction: { label: 'Terbitkan nilai & lanjut', onClick: noop, disabled: true },
		secondaryAction: { label: 'Simpan draf', onClick: noop },
		disabledReasons: ['Nilai semua kriteria berbobot (1/2 terisi).'],
		...extra,
	};
}

const render = (p: GradingPanelProps) => renderToStaticMarkup(createElement(GradingPanel, p));

describe('GradingPanel', () => {
	it('opens every rubric row and the feedback on desktop by default', () => {
		const html = render(props());
		expect(html.match(/aria-expanded="true"/g)).toHaveLength(2);
		expect(html).toContain('aria-label="Pencapaian Inhalt"');
		expect(html).toContain('aria-label="Pencapaian Grammatik"');
		expect(html).toMatch(/<details class="evx-block evx-feedback" open="">/);
		expect(html).toContain('1/2 kriteria terisi');
		expect(html).toContain('Saran AI: 70.');
	});

	it('can start collapsed (mobile)', () => {
		const html = render(props({ defaultExpanded: false }));
		expect(html).not.toContain('aria-expanded="true"');
		expect(html).not.toMatch(/evx-feedback" open/);
	});

	it('shows why publishing is disabled', () => {
		const html = render(props());
		expect(html).toContain('evx-disabled-reasons');
		expect(html).toContain('Nilai semua kriteria berbobot (1/2 terisi).');
		expect(render(props({ primaryAction: { label: 'Terbitkan', onClick: noop } }))).not.toContain('evx-disabled-reasons');
	});

	it('shows a clear retry when the AI draft stalled', () => {
		const html = render(props({ aiDraft: { status: 'stalled', score: null }, onRequestAi: noop }));
		expect(html).toContain('Draf AI belum siap. Coba lagi.');
		expect(html).toContain('Coba lagi</button>');
	});

	it('renders the empty-rubric slot when the task has no criteria', () => {
		const html = render(props({ criteria: [], scores: {}, rubricEmpty: createElement('p', null, 'Sarankan rubrik') }));
		expect(html).toContain('Sarankan rubrik');
		expect(html).not.toContain('evx-rubric"');
	});

	it('replaces the action row with the confirmation when given', () => {
		const html = render(props({ confirm: createElement('div', null, 'Ya, terbitkan & lanjut') }));
		expect(html).toContain('Ya, terbitkan &amp; lanjut');
		expect(html).not.toContain('evx-next-btn');
	});
});

describe('mergeAiFeedback', () => {
	it('fills an empty field and appends to existing lecturer feedback instead of replacing it', () => {
		expect(mergeAiFeedback('', 'AI text')).toBe('AI text');
		expect(mergeAiFeedback('Meine Notiz', 'AI text')).toBe('Meine Notiz\n\nAI text');
		expect(mergeAiFeedback('Meine Notiz\n\nAI text', 'AI text')).toBe('Meine Notiz\n\nAI text');
		expect(mergeAiFeedback('x'.repeat(1990), 'AI text with more words').length).toBe(2000);
	});
});

describe('runInWaves', () => {
	it('starts a few at a time, waits for each wave and reports progress', async () => {
		const events: string[] = [];
		const progress: number[] = [];
		const result = await runInWaves(['a', 'b', 'c', 'd', 'e'], {
			size: 2,
			request: async (id) => {
				events.push(`req:${id}`);
				return id !== 'c';
			},
			settle: async (ids) => {
				events.push(`settle:${ids.join(',')}`);
			},
			onProgress: (p) => progress.push(p.done),
		});
		expect(events).toEqual(['req:a', 'req:b', 'settle:a,b', 'req:c', 'req:d', 'settle:d', 'req:e', 'settle:e']);
		expect(progress).toEqual([0, 2, 4, 5]);
		expect(result).toMatchObject({ done: 5, failed: 1, stopped: false });
	});

	it('stops between waves when asked', async () => {
		let stop = false;
		const result = await runInWaves(['a', 'b', 'c'], {
			size: 1,
			request: async () => true,
			settle: async () => {
				stop = true;
			},
			shouldStop: () => stop,
		});
		expect(result).toMatchObject({ done: 1, stopped: true });
	});
});

describe('nextToGrade', () => {
	const list = [
		{ key: 'a', status: 'graded' },
		{ key: 'b', status: 'submitted' },
		{ key: 'c', status: 'graded' },
		{ key: 'd', status: 'draft' },
		{ key: 'e', status: 'late' },
	];
	it('advances to the next ungraded final submission, wrapping around', () => {
		expect(nextToGrade(list, 'b')?.key).toBe('e');
		expect(nextToGrade(list, 'e')?.key).toBe('b');
	});
	it('falls back to the next participant in the list', () => {
		const allGraded = [
			{ key: 'a', status: 'graded' },
			{ key: 'b', status: 'graded' },
		];
		expect(nextToGrade(allGraded, 'a')?.key).toBe('b');
		expect(nextToGrade(allGraded, 'b')).toBeNull();
	});
});
