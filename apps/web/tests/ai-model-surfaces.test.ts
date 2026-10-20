import { describe, expect, it } from 'vitest';
import { AI_SURFACES, assertCapabilities } from '@/lib/ai/providers.server';

/**
 * A surface must fail loudly when the selected model cannot serve it, rather
 * than failing halfway through a request. These tests pin the requirement map
 * and the error message shape.
 */
describe('surface capability requirements', () => {
	it('covers exactly the five chat surfaces', () => {
		expect(AI_SURFACES.map((surface) => surface.id)).toEqual([
			'assistant',
			'evaluation',
			'lesson_plan',
			'practice',
			'rps_import',
		]);
	});

	it('has unique ids and a label for every surface', () => {
		expect(new Set(AI_SURFACES.map((surface) => surface.id)).size).toBe(AI_SURFACES.length);
		for (const surface of AI_SURFACES) expect(surface.label.length).toBeGreaterThan(0);
	});

	it('requires tools for the assistant and vision+json for evaluation', () => {
		const assistant = AI_SURFACES.find((surface) => surface.id === 'assistant');
		const evaluation = AI_SURFACES.find((surface) => surface.id === 'evaluation');
		expect(assistant?.requires).toContain('tools');
		expect(evaluation?.requires).toEqual(expect.arrayContaining(['vision', 'json']));
	});

	it('passes when the model supports the required capabilities', () => {
		const merged = assertCapabilities({ tools: true, vision: true, json: true, streaming: true }, 'evaluation', 'Router A');
		expect(merged.vision).toBe(true);
	});

	it('rejects a model that cannot serve the surface, naming what is missing', () => {
		expect(() => assertCapabilities({ tools: false }, 'assistant', 'Router A')).toThrow(/tools/);
		expect(() => assertCapabilities({ json: true, vision: false }, 'evaluation', 'Router A')).toThrow(/vision/);
	});

	it('treats unspecified capabilities as supported (backwards compatible)', () => {
		expect(() => assertCapabilities({}, 'evaluation', 'Router A')).not.toThrow();
	});
});
