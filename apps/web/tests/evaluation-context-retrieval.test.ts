import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextSectionRecord, FileExtractionRecord, FileLibraryRecord } from '@/lib/learning';

const db = vi.hoisted(() => ({ files: [] as FileLibraryRecord[], sections: [] as ContextSectionRecord[], extractions: [] as FileExtractionRecord[], audits: [] as any[], filters: [] as string[] }));
vi.mock('@/lib/logger.server', () => ({ default: { error: vi.fn() } }));
vi.mock('@/lib/pocketbase-client.server', () => ({ pocketbaseAdmin: {
	listRecords: async (collection: string, options: { filter: string }) => {
		db.filters.push(options.filter);
		return { items: collection === 'file_library' ? db.files : collection === 'context_sections'
			? db.sections.filter((section) => section.status === 'suitable')
			: collection === 'file_extractions' ? db.extractions : [] };
	},
	createRecord: async (_collection: string, payload: unknown) => { db.audits.push(payload); return payload; },
} }));
import { retrieveContextBundle } from '@/lib/context-retrieval.server';

const quote = 'Das finite Verb steht im Hauptsatz an zweiter Stelle.';
const input = {
	feature: 'material' as const, requirePassages: true,
	scope: { course: 'course123', session: 'session123' },
	requester: { id: 'faculty123', role: 'faculty' as const, label: 'faculty:faculty123' },
	ownerLecturerId: 'faculty123',
};
beforeEach(() => {
	db.files = [{ id: 'file123', owner: 'faculty123', course: ['course123'], file: 'book.pdf', title: 'Grammar', version: 2, updated: '2026-10-25', access: 'faculty' } as FileLibraryRecord];
	db.sections = [{ id: 'section123', file: 'file123', owner: 'faculty123', label: 'Verb position', pageRef: '30', version: 2, status: 'suitable', session: 'session123', cpmk: '', subCpmk: '', excerpt: quote, created: '2026-10-25' } as ContextSectionRecord];
	db.extractions = [{ file: 'file123', status: 'ready', version: 2, extractedText: `${'Unrelated introduction. '.repeat(250)}\n${quote}` } as FileExtractionRecord];
	db.audits = []; db.filters = [];
});

describe('formal evaluation material retrieval', () => {
	it('supplies the exact approved passage, not the file prefix, and audits only supplied citations', async () => {
		const bundle = await retrieveContextBundle(input);
		expect(bundle.result).toBe('sufficient');
		expect(bundle.sources[0].text).toBe(quote);
		expect(bundle.sources[0].sections[0].passage?.start).toBeGreaterThan(1600);
		expect(bundle.citations.map((citation) => citation.sectionId)).toEqual(['section123']);
		expect(db.audits[0].sources).toEqual(bundle.citations);
		expect(db.filters[0]).toContain('course123');
		expect(db.filters[0]).toContain('faculty123');
	});

	it.each(['missing', 'invented', 'ambiguous', 'stale-section', 'stale-extraction', 'other-session', 'unsuitable', 'failed-extraction'])(
		'excludes %s evidence without falling back to the introduction', async (failure) => {
			if (failure === 'missing') db.sections[0].excerpt = '';
			if (failure === 'invented') db.sections[0].excerpt = 'Invented rule';
			if (failure === 'ambiguous') db.extractions[0].extractedText += `\n${quote}`;
			if (failure === 'stale-section') db.sections[0].version = 1;
			if (failure === 'stale-extraction') db.extractions[0].version = 1;
			if (failure === 'other-session') db.sections[0].session = 'other123';
			if (failure === 'unsuitable') db.sections[0].status = 'unsuitable';
			if (failure === 'failed-extraction') db.extractions[0].status = 'failed';
			const bundle = await retrieveContextBundle(input);
			expect(bundle.result).toBe('insufficient');
			expect(bundle.sources).toEqual([]);
			expect(bundle.citations).toEqual([]);
		},
	);

	it('does not attach a citation for an excluded section in an otherwise valid source', async () => {
		db.sections.push({ ...db.sections[0], id: 'missing123', excerpt: 'Not in the extraction' });
		const bundle = await retrieveContextBundle(input);
		expect(bundle.sectionCount).toBe(1);
		expect(bundle.citations).toHaveLength(1);
	});

	it('honors source, section and character budgets', async () => {
		db.sections = Array.from({ length: 8 }, (_, i) => ({ ...db.sections[0], id: `section${i}`, excerpt: `Rule ${i}: ${String.fromCharCode(65 + i).repeat(2500)}` }));
		db.extractions[0].extractedText = db.sections.map((section) => section.excerpt).join('\n');
		const bundle = await retrieveContextBundle(input);
		expect(bundle.charCount).toBeLessThanOrEqual(bundle.limits.maxCharsPerFile);
		expect(bundle.sectionCount).toBeLessThanOrEqual(bundle.limits.maxSectionsPerFile);
		for (const section of bundle.sources[0].sections) {
			const passage = section.passage!;
			expect(passage.text.length).toBeLessThanOrEqual(2000);
			expect(db.extractions[0].extractedText.slice(passage.start, passage.end)).toBe(passage.text);
		}
	});

	it('preserves legacy material behavior for non-assessment callers', async () => {
		db.sections[0].excerpt = '';
		const bundle = await retrieveContextBundle({ ...input, requirePassages: false });
		expect(bundle.result).toBe('sufficient');
		expect(bundle.sources[0].text).toContain('Unrelated introduction.');
	});

	it('selects explicitly chosen multi-course materials before retrieval caps',async()=>{
		await retrieveContextBundle({...input,fileIds:['file123']});
		expect(db.filters[0]).toContain('course ~ "course123"');
		expect(db.filters[0]).toContain('id = "file123"');
		db.files[0].course=['course123-other'];
		expect((await retrieveContextBundle({...input,fileIds:['file123']})).result).toBe('insufficient');
	});
});
