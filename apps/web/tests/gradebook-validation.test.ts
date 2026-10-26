import { describe, expect, it } from 'vitest';
import {
	MAX_BONUS_DELTA,
	MAX_NOTE_LENGTH,
	allowedOperations,
	convertScale,
	needsScaleConversion,
	parseScoreInput,
	validateScoreOperation,
	type TargetKind,
} from '@/lib/gradebook/validation';

describe('gradebook target kinds', () => {
	it('lets ordinary manual components take a score, a clear and a note', () => {
		expect(allowedOperations('manual')).toEqual(['set_score', 'clear_score', 'set_note']);
	});

	it('keeps computed and assignment components read-only through manual entry', () => {
		// Correcting these means fixing attendance or the submission, not the score.
		expect(allowedOperations('computed')).toEqual([]);
		expect(allowedOperations('assignment')).toEqual([]);
	});

	it('allows chapter status but never an arbitrary numeric overwrite', () => {
		expect(allowedOperations('chapter')).toContain('set_chapter');
		expect(allowedOperations('chapter')).not.toContain('set_score');
	});

	it('allows only a bounded bonus adjustment on bonus components', () => {
		expect(allowedOperations('bonus')).toContain('adjust_bonus');
		expect(allowedOperations('bonus')).not.toContain('set_score');
	});

	it('routes overrides through their own command', () => {
		expect(allowedOperations('override')).toEqual([]);
	});
});

describe('score operation validation', () => {
	it('accepts a zero as a real score', () => {
		const result = validateScoreOperation({
			kind: 'manual',
			maxScore: 30,
			operation: { op: 'set_score', score: 0 },
		});
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.normalized.score).toBe(0);
	});

	it('distinguishes clearing a score from setting zero', () => {
		const cleared = validateScoreOperation({ kind: 'manual', maxScore: 30, operation: { op: 'clear_score' } });
		const zeroed = validateScoreOperation({ kind: 'manual', maxScore: 30, operation: { op: 'set_score', score: 0 } });
		expect(cleared.ok && cleared.normalized.score).toBeNull();
		expect(zeroed.ok && zeroed.normalized.score).toBe(0);
	});

	it('rejects a score above the component maximum', () => {
		const result = validateScoreOperation({
			kind: 'manual',
			maxScore: 30,
			operation: { op: 'set_score', score: 31 },
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.issues[0].code).toBe('over_max');
	});

	it('rejects negative and non-finite scores', () => {
		for (const score of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
			const result = validateScoreOperation({ kind: 'manual', maxScore: 30, operation: { op: 'set_score', score } });
			expect(result.ok).toBe(false);
		}
	});

	it('rejects more than two decimal places', () => {
		const result = validateScoreOperation({
			kind: 'manual',
			maxScore: 30,
			operation: { op: 'set_score', score: 12.345 },
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.issues[0].code).toBe('precision');
	});

	it('refuses an operation the target kind does not permit', () => {
		const result = validateScoreOperation({
			kind: 'assignment',
			maxScore: 100,
			operation: { op: 'set_score', score: 80 },
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.issues[0].code).toBe('wrong_target_kind');
	});

	it('bounds a bonus adjustment', () => {
		const tooBig = validateScoreOperation({
			kind: 'bonus',
			operation: { op: 'adjust_bonus', delta: MAX_BONUS_DELTA + 1 },
		});
		const fine = validateScoreOperation({ kind: 'bonus', operation: { op: 'adjust_bonus', delta: 5 } });
		expect(tooBig.ok).toBe(false);
		expect(fine.ok).toBe(true);
	});

	it('bounds a note but leaves the score alone', () => {
		const long = validateScoreOperation({
			kind: 'manual',
			operation: { op: 'set_note', note: 'x'.repeat(MAX_NOTE_LENGTH + 1) },
		});
		const ok = validateScoreOperation({ kind: 'manual', operation: { op: 'set_note', note: 'Bagus.' } });
		expect(long.ok).toBe(false);
		expect(ok.ok).toBe(true);
		// A note must never imply a score change.
		if (ok.ok) expect(ok.normalized.score).toBeNull();
	});
});

describe('score input parsing', () => {
	it('treats a blank cell as no change, not zero', () => {
		expect(parseScoreInput('')).toEqual({ state: 'blank' });
		expect(parseScoreInput('   ')).toEqual({ state: 'blank' });
	});

	it('requires an explicit token to clear a score', () => {
		expect(parseScoreInput('-')).toEqual({ state: 'clear' });
		expect(parseScoreInput('clear')).toEqual({ state: 'clear' });
	});

	it('reads a decimal dot when that is the declared separator', () => {
		expect(parseScoreInput('87.5', '.')).toEqual({ state: 'value', value: 87.5 });
	});

	it('reads a decimal comma when that is the declared separator', () => {
		expect(parseScoreInput('87,5', ',')).toEqual({ state: 'value', value: 87.5 });
	});

	it('handles a thousands-grouped value in either convention', () => {
		expect(parseScoreInput('1.234,5', ',')).toEqual({ state: 'value', value: 1234.5 });
		expect(parseScoreInput('1,234.5', '.')).toEqual({ state: 'value', value: 1234.5 });
	});

	it('flags a value whose separators contradict the declared format', () => {
		const result = parseScoreInput('1,5.0', ',');
		expect(result.state).toBe('ambiguous');
	});

	it('rejects text that is not a number', () => {
		expect(parseScoreInput('sembilan', '.').state).toBe('invalid');
		expect(parseScoreInput('8o', '.').state).toBe('invalid');
	});
});

describe('scale conversion', () => {
	it('converts 0-100 into a component out of 30 with a visible factor', () => {
		const { value, factor } = convertScale(90, 100, 30);
		expect(factor).toBeCloseTo(0.3);
		expect(value).toBeCloseTo(27);
	});

	it('reports when a conversion is actually needed', () => {
		expect(needsScaleConversion(100, 30)).toBe(true);
		expect(needsScaleConversion(30, 30)).toBe(false);
	});

	it('refuses a nonsense source scale instead of dividing by zero', () => {
		expect(() => convertScale(50, 0, 30)).toThrow();
	});
});
