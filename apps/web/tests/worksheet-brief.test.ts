import { describe, expect, it } from 'vitest';
import { buildWorksheetBrief } from '@/lib/worksheet-brief';
import type { StructuredAssignmentContent } from '@/lib/structured-assignment';

const structured: StructuredAssignmentContent = {
	summary: 'Tulis dialog interview berpasangan.',
	taskType: 'dialogue',
	responseFormat: 'writing',
	language: 'Deutsch',
	level: 'A2',
	sections: [
		{
			id: 's1',
			title: 'Interview',
			description: 'Wawancarai pasanganmu.',
			requirements: [{ id: 'r1', text: '3 pertanyaan', required: true, quantity: 3 }],
			examples: [],
		},
	],
	requirements: [
		{ id: 'r-top1', text: 'Dialog & hasil interview', required: true },
		{ id: 'r-top2', text: 'Teks 3. Person', required: true },
	],
};

describe('buildWorksheetBrief — structured path', () => {
	it('uses structured summary and checklist deterministically', () => {
		const brief = buildWorksheetBrief({ structured });
		expect(brief).not.toBeNull();
		expect(brief?.summary).toBe(structured.summary);
		expect(brief?.chips.map((c) => c.label)).toEqual([
			'Dialog & hasil interview',
			'Teks 3. Person',
			'3 pertanyaan',
		]);
	});

	it('includes structured sections', () => {
		const brief = buildWorksheetBrief({ structured });
		expect(brief?.sections).toHaveLength(1);
		expect(brief?.sections[0].title).toBe('Interview');
	});

	it('falls back to taskConfig when structured not passed directly', () => {
		const brief = buildWorksheetBrief({ taskConfig: { structured } });
		expect(brief?.summary).toBe(structured.summary);
	});

	it('legacy path: builds brief from free-form text', () => {
		const brief = buildWorksheetBrief({
			instructions: 'Tulis esai. Minimal 200 kata. Sebutkan 3 alasan.',
			requirements: 'Gunakan bahasa formal.',
		});
		expect(brief).not.toBeNull();
		expect(brief?.fullText).toContain('Tulis esai');
	});

	it('returns null when nothing is available', () => {
		expect(buildWorksheetBrief({})).toBeNull();
	});
});
