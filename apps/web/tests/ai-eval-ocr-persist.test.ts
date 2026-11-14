import { beforeEach, describe, expect, it, vi } from 'vitest';

const pb = vi.hoisted(() => ({
	record: { content: '' },
	updates: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/pocketbase-client.server', () => ({
	pocketbaseAdmin: {
		getRecord: vi.fn(async () => ({ ...pb.record })),
		updateRecord: vi.fn(async (_c: string, _id: string, data: Record<string, unknown>) => {
			pb.updates.push(data);
			return data;
		}),
	},
}));
vi.mock('@/lib/logger.server', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/feedback.server', () => ({ extractStoredFiles: vi.fn() }));
vi.mock('@/lib/context-retrieval.server', () => ({ retrieveContextBundle: vi.fn(), cpmkOfSubCpmk: vi.fn() }));
vi.mock('@/lib/task-assist.server', () => ({
	collectModelWithProvenance: vi.fn(),
	imageFilenames: vi.fn(() => []),
	storedFileUrl: vi.fn(),
}));

import {
	AI_EVALUATION_PROMPT_VERSION,
	AI_EVALUATION_SYSTEM_PROMPT_VERSION,
	persistOcrContent,
} from '@/lib/ai-evaluation.server';
import { sha256Hex, studentTextOf, draftCurrency } from '@/lib/ai-evaluation-stale.server';

const OCR = 'Am ⟦Abends⟧ isst er ein Brot und trinkt Tee mit seiner Familie im Garten hinter dem Haus.';

beforeEach(() => {
	pb.record = { content: '' };
	pb.updates = [];
});

describe('persistOcrContent', () => {
	it('versions are bumped', () => {
		expect(AI_EVALUATION_PROMPT_VERSION).toBe('german-gfl-feedback-v5-two-pass');
		expect(AI_EVALUATION_SYSTEM_PROMPT_VERSION).toBe('german-gfl-feedback-v5-two-pass');
	});

	it('replaces empty content and keeps markers', async () => {
		const saved = await persistOcrContent({ collection: 'assignment_submissions', recordId: 'r', previous: '', ocrText: OCR });
		expect(saved).toBe(OCR);
		expect(pb.updates).toEqual([{ content: OCR }]);
	});

	it('replaces an import pointer note', async () => {
		const note = 'Tugas X — file terverifikasi di Drive: /a/b.pdf';
		pb.record = { content: note };
		expect(await persistOcrContent({ collection: 'assignment_submissions', recordId: 'r', previous: note, ocrText: OCR })).toBe(OCR);
	});

	it('appends below a short typed note and never touches a real answer', async () => {
		pb.record = { content: 'Siehe Foto.' };
		const saved = await persistOcrContent({ collection: 'assignment_submissions', recordId: 'r', previous: 'Siehe Foto.', ocrText: OCR });
		expect(saved).toBe(`Siehe Foto.\n\n${OCR}`);
		pb.updates = [];
		const real = 'x'.repeat(250);
		pb.record = { content: real };
		expect(await persistOcrContent({ collection: 'assignment_submissions', recordId: 'r', previous: real, ocrText: OCR })).toBeNull();
		expect(pb.updates).toEqual([]);
	});

	it('does not overwrite a concurrent edit or save a non-answer', async () => {
		pb.record = { content: 'changed meanwhile' };
		expect(await persistOcrContent({ collection: 'assignment_submissions', recordId: 'r', previous: '', ocrText: OCR })).toBeNull();
		pb.record = { content: '' };
		expect(await persistOcrContent({ collection: 'assignment_submissions', recordId: 'r', previous: '', ocrText: '[tidak terbaca]' })).toBeNull();
		expect(pb.updates).toEqual([]);
	});

	it('the saved text hashes to what staleness compares (draft stays current)', async () => {
		const saved = (await persistOcrContent({ collection: 'assignment_submissions', recordId: 'r', previous: '', ocrText: OCR })) as string;
		const inputTextHash = sha256Hex(saved.slice(0, 12000));
		const submission = { content: saved, files: ['a.pdf'], updated: '2026-01-02' };
		expect(studentTextOf(submission, false)).toBe(saved);
		expect(draftCurrency({ row: { status: 'ready', inputTextHash }, submission, isSpeaking: false })).toBe('current');
	});
});
