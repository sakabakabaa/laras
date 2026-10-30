import { describe, expect, it } from 'vitest';
import { parseProvenance, type ResearchProvenance } from '@/lib/ai-evaluation';

describe('Phase 5 — research provenance parsing', () => {
	it('parses a fully-populated provenance row', () => {
		const row = {
			model: 'gpt-4o-mini',
			modelVersion: '2024-07-18',
			promptVersion: 'german-gfl-feedback-v1',
			systemPromptVersion: 'german-gfl-feedback-v1',
			inputTextHash: 'a'.repeat(64),
			outputHash: 'b'.repeat(64),
			generationDurationMs: 4321,
			researchSchemaVersion: 1,
			usedStudentText: true,
			usedImages: false,
			usedCourseMaterial: true,
			usedRubric: true,
			usedCefr: true,
		};
		const p = parseProvenance(row);
		expect(p.model).toBe('gpt-4o-mini');
		expect(p.modelVersion).toBe('2024-07-18');
		expect(p.promptVersion).toBe('german-gfl-feedback-v1');
		expect(p.systemPromptVersion).toBe('german-gfl-feedback-v1');
		expect(p.inputTextHash).toBe('a'.repeat(64));
		expect(p.outputHash).toBe('b'.repeat(64));
		expect(p.generationDurationMs).toBe(4321);
		expect(p.researchSchemaVersion).toBe(1);
		expect(p.usedStudentText).toBe(true);
		expect(p.usedImages).toBe(false);
		expect(p.usedCourseMaterial).toBe(true);
		expect(p.usedRubric).toBe(true);
		expect(p.usedCefr).toBe(true);
	});

	it('treats an old pre-Phase-5 record as unknown/empty without breaking', () => {
		// Old rows have none of the provenance fields.
		const p = parseProvenance({ status: 'ready', findings: [] });
		expect(p.model).toBe('unknown');
		expect(p.modelVersion).toBe('unknown');
		expect(p.promptVersion).toBe('');
		expect(p.systemPromptVersion).toBe('');
		expect(p.inputTextHash).toBe('');
		expect(p.outputHash).toBe('');
		expect(p.generationDurationMs).toBeNull();
		expect(p.researchSchemaVersion).toBeNull();
		expect(p.usedStudentText).toBe(false);
		expect(p.usedImages).toBe(false);
		expect(p.usedCourseMaterial).toBe(false);
		expect(p.usedRubric).toBe(false);
		expect(p.usedCefr).toBe(false);
	});

	it('coerces an empty-string model to "unknown" rather than inventing one', () => {
		const p = parseProvenance({ model: '', modelVersion: '' });
		expect(p.model).toBe('unknown');
		expect(p.modelVersion).toBe('unknown');
	});

	it('coerces non-boolean input-source values to false', () => {
		const p = parseProvenance({ usedStudentText: 'true', usedImages: 1, usedRubric: undefined });
		expect(p.usedStudentText).toBe(false);
		expect(p.usedImages).toBe(false);
		expect(p.usedRubric).toBe(false);
	});

	it('coerces non-numeric duration and schema version to null', () => {
		const p = parseProvenance({ generationDurationMs: 'fast', researchSchemaVersion: 'v1' });
		expect(p.generationDurationMs).toBeNull();
		expect(p.researchSchemaVersion).toBeNull();
	});

	it('truncates over-long hash and model strings to their field caps', () => {
		const long = 'x'.repeat(300);
		const p = parseProvenance({ inputTextHash: long, model: long });
		expect(p.inputTextHash.length).toBe(128);
		expect(p.model.length).toBe(64);
	});

	it('satisfies the ResearchProvenance type contract', () => {
		const p: ResearchProvenance = parseProvenance({});
		expect(p).toBeDefined();
		expect(p.model).toBe('unknown');
	});
});
