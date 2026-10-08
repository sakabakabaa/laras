import { describe, expect, it } from 'vitest';
import {
	EMPTY_STRUCTURED,
	parseStructuredContent,
	parseStructuredContentFromConfig,
	sanitizeStructuredContent,
	structuredChecklist,
	validateStructuredContent,
	type StructuredAssignmentContent,
} from '@/lib/structured-assignment';

const writingContent: StructuredAssignmentContent = {
	summary: 'Tulis sebuah esai pendek tentang rutinitas harianmu.',
	taskType: 'essay',
	responseFormat: 'writing',
	language: 'Indonesia',
	level: 'A2',
	sections: [
		{
			id: 's1',
			title: 'Pendahuluan',
			description: 'Perkenalkan diri dan rutinitas pagi.',
			requirements: [
				{ id: 'r1', text: 'Sebutkan 3 waktu', required: true, quantity: 3, category: 'waktu' },
				{ id: 'r2', text: 'Sebutkan 2 kegiatan', required: true, quantity: 2, category: 'kegiatan' },
			],
			examples: ['Saya bangun pukul enam.'],
			tips: ['Gunakan kata penghubung waktu.'],
		},
	],
	requirements: [
		{ id: 'r-top', text: 'Teks dalam 3. Person', required: true, quantity: null },
	],
	examples: ['Contoh kalimat.'],
	tips: ['Periksa ejaan.'],
};

const speakingContent: StructuredAssignmentContent = {
	summary: 'Buat percakapan berpasangan tentang keluarga.',
	taskType: 'paired_conversation',
	responseFormat: 'speaking',
	language: 'Deutsch',
	level: 'A2',
	duration: 5,
	sections: [],
	requirements: [
		{ id: 'r1', text: '3 waktu', required: true, quantity: 3, category: 'waktu' },
		{ id: 'r2', text: '2 anggota keluarga', required: true, quantity: 2, category: 'keluarga' },
		{ id: 'r3', text: '1 janji', required: true, quantity: 1, category: 'janji' },
	],
};

describe('parseStructuredContent', () => {
	it('parses a valid writing payload', () => {
		const parsed = parseStructuredContent(JSON.stringify(writingContent));
		expect(parsed).not.toBeNull();
		expect(parsed?.summary).toBe(writingContent.summary);
		expect(parsed?.responseFormat).toBe('writing');
		expect(parsed?.sections).toHaveLength(1);
		expect(parsed?.sections[0].requirements).toHaveLength(2);
	});

	it('returns null for empty payload', () => {
		expect(parseStructuredContent(null)).toBeNull();
		expect(parseStructuredContent('')).toBeNull();
		expect(parseStructuredContent('{}')).toBeNull();
	});

	it('coerces responseFormat to writing for unknown values', () => {
		const parsed = parseStructuredContent({ summary: 'x', responseFormat: 'unknown' });
		expect(parsed?.responseFormat).toBe('writing');
	});

	it('drops empty sections', () => {
		const parsed = parseStructuredContent({
			summary: 'ok',
			sections: [{ id: 's1', title: '', description: '', requirements: [] }],
		});
		expect(parsed?.sections).toHaveLength(0);
	});

	it('reads structured content from a taskConfig value', () => {
		const config = { prompt: 'hi', structured: writingContent };
		expect(parseStructuredContentFromConfig(config)?.summary).toBe(writingContent.summary);
		expect(parseStructuredContentFromConfig({ prompt: 'hi' })).toBeNull();
		expect(parseStructuredContentFromConfig(null)).toBeNull();
	});

	it('parses structured from a JSON-string taskConfig', () => {
		const config = JSON.stringify({ prompt: 'hi', structured: speakingContent });
		expect(parseStructuredContentFromConfig(config)?.responseFormat).toBe('speaking');
	});
});

describe('sanitizeStructuredContent', () => {
	it('preserves valid writing content and forces responseFormat', () => {
		const raw = { ...writingContent, responseFormat: 'speaking' };
		const sanitized = sanitizeStructuredContent(raw, 'writing');
		expect(sanitized?.responseFormat).toBe('writing');
		expect(sanitized?.summary).toBe(writingContent.summary);
		expect(sanitized?.sections).toHaveLength(1);
	});

	it('forces speaking responseFormat for speaking kind', () => {
		const sanitized = sanitizeStructuredContent(
			{ ...writingContent, responseFormat: 'writing' },
			'speaking',
		);
		expect(sanitized?.responseFormat).toBe('speaking');
	});

	it('clamps duration and quantity', () => {
		const sanitized = sanitizeStructuredContent(
			{
				summary: 'x',
				responseFormat: 'writing',
				duration: 99999,
				requirements: [{ id: 'r1', text: 'banyak', required: true, quantity: 99999 }],
			},
			'writing',
		);
		expect(sanitized?.duration).toBe(600);
		expect(sanitized?.requirements[0].quantity).toBe(999);
	});

	it('de-duplicates duplicate requirement ids', () => {
		const sanitized = sanitizeStructuredContent(
			{
				summary: 'x',
				responseFormat: 'writing',
				requirements: [
					{ id: 'r1', text: 'a', required: true },
					{ id: 'r1', text: 'b', required: true },
				],
			},
			'writing',
		);
		const ids = sanitized?.requirements.map((r) => r.id);
		expect(ids).toEqual(['r1', 'r1-1']);
	});

	it('drops empty requirements and sections', () => {
		const sanitized = sanitizeStructuredContent(
			{
				summary: 'x',
				responseFormat: 'writing',
				requirements: [{ id: 'r1', text: '', required: true }],
				sections: [{ id: 's1', title: '', description: '', requirements: [] }],
			},
			'writing',
		);
		expect(sanitized?.requirements).toHaveLength(0);
		expect(sanitized?.sections).toHaveLength(0);
	});

	it('returns null for effectively-empty payload', () => {
		expect(sanitizeStructuredContent({ summary: '', responseFormat: 'writing' }, 'writing')).toBeNull();
		expect(sanitizeStructuredContent(null, 'writing')).toBeNull();
	});
});

describe('validateStructuredContent', () => {
	it('passes for valid writing content', () => {
		expect(validateStructuredContent(writingContent, 'writing').ok).toBe(true);
	});

	it('passes for valid speaking content', () => {
		expect(validateStructuredContent(speakingContent, 'speaking').ok).toBe(true);
	});

	it('fails when summary is missing', () => {
		const result = validateStructuredContent(
			{ ...writingContent, summary: '' },
			'writing',
		);
		expect(result.ok).toBe(false);
		expect(result.errors.some((e) => e.includes('Ringkasan'))).toBe(true);
	});

	it('fails when responseFormat mismatches kind', () => {
		expect(validateStructuredContent(writingContent, 'speaking').ok).toBe(false);
		expect(validateStructuredContent(speakingContent, 'writing').ok).toBe(false);
	});

	it('fails on duplicate requirement ids', () => {
		const result = validateStructuredContent(
			{
				...writingContent,
				requirements: [
					{ id: 'dup', text: 'a', required: true },
					{ id: 'dup', text: 'b', required: true },
				],
			},
			'writing',
		);
		expect(result.ok).toBe(false);
		expect(result.errors.some((e) => e.includes('duplikat'))).toBe(true);
	});

	it('fails on empty section', () => {
		const result = validateStructuredContent(
			{
				...writingContent,
				sections: [{ id: 's1', title: '', description: '', requirements: [] }],
			},
			'writing',
		);
		expect(result.ok).toBe(false);
	});

	it('fails for null content', () => {
		expect(validateStructuredContent(null, 'writing').ok).toBe(false);
	});
});

describe('structuredChecklist', () => {
	it('builds a deterministic checklist from top-level + section requirements', () => {
		const checklist = structuredChecklist(writingContent);
		expect(checklist.length).toBe(3);
		expect(checklist[0].label).toBe('Teks dalam 3. Person');
		expect(checklist[1].label).toBe('Sebutkan 3 waktu');
		expect(checklist[1].quantity).toBe(3);
	});

	it('de-duplicates by label (case-insensitive)', () => {
		const content: StructuredAssignmentContent = {
			...EMPTY_STRUCTURED,
			summary: 'x',
			requirements: [
				{ id: 'r1', text: '3 waktu', required: true, quantity: 3 },
				{ id: 'r2', text: '3 Waktu', required: true, quantity: 3 },
			],
		};
		expect(structuredChecklist(content)).toHaveLength(1);
	});

	it('returns empty for null content', () => {
		expect(structuredChecklist(null)).toEqual([]);
	});

	it('caps at 12 items', () => {
		const content: StructuredAssignmentContent = {
			...EMPTY_STRUCTURED,
			summary: 'x',
			requirements: Array.from({ length: 20 }, (_, i) => ({
				id: `r${i}`,
				text: `item ${i}`,
				required: true,
			})),
		};
		expect(structuredChecklist(content).length).toBe(12);
	});

	it('builds speaking checklist with quantities', () => {
		const checklist = structuredChecklist(speakingContent);
		expect(checklist.map((c) => c.label)).toEqual([
			'3 waktu',
			'2 anggota keluarga',
			'1 janji',
		]);
		expect(checklist.map((c) => c.quantity)).toEqual([3, 2, 1]);
	});
});
