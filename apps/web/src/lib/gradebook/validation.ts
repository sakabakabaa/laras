/**
 * Gradebook domain rules — the single source of truth for what a grade change
 * is allowed to be.
 *
 * Every write path (gradebook UI, assistant tools, imports) validates through
 * this module before anything reaches PocketBase. It is deliberately pure: no
 * database access, no framework types, so the rules can be unit-tested without
 * a server and cannot drift between callers.
 *
 * Design notes that are easy to get wrong:
 *
 *  - `null` and `0` are different things. `null` means "no score recorded";
 *    `0` is a real, earned zero. Conflating them silently changes grades.
 *  - "No change" is not an operation. Only an explicit `clear` removes a score.
 *  - A component maximum is not a scale. A 0–100 import into a component out of
 *    30 must be converted explicitly, never silently rescaled.
 */

export type ComponentKind = 'manual' | 'assignment';
export type ChapterStatus = 'done' | 'partial' | 'missing';

/** Target kinds a manual score/note command may address. */
export type TargetKind =
	/** Ordinary manual component: score and note. */
	| 'manual'
	/** Chapter-tracked manual component: chapter status only, score derived. */
	| 'chapter'
	/** Computed attendance/task component: read-only here. */
	| 'computed'
	/** Bonus component: bounded adjustment only. */
	| 'bonus'
	/** Assignment-linked: scored through the submission/evaluation workflow. */
	| 'assignment'
	/** Explicit final-grade override: separate approval. */
	| 'override';

/** A single validated score operation. */
export type ScoreOperation =
	/** Set a numeric score. `0` is a real score. */
	| { op: 'set_score'; score: number }
	/** Remove a recorded score. Distinct from setting 0. */
	| { op: 'clear_score' }
	/** Replace the note only; leaves the score untouched. */
	| { op: 'set_note'; note: string }
	/** Chapter-tracked component status. */
	| { op: 'set_chapter'; status: ChapterStatus }
	/** Bounded bonus adjustment on a bonus component. */
	| { op: 'adjust_bonus'; delta: number };

export type ValidationIssue = {
	/** Stable machine code so callers and tests never match on prose. */
	code:
		| 'not_finite'
		| 'negative'
		| 'over_max'
		| 'precision'
		| 'wrong_target_kind'
		| 'note_too_long'
		| 'bonus_out_of_range'
		| 'unknown_operation';
	message: string;
};

export type ValidationResult =
	| { ok: true; operation: ScoreOperation; normalized: { score: number | null } }
	| { ok: false; issues: ValidationIssue[] };

/** Scores are stored to two decimals; anything finer is a data-entry error. */
export const SCORE_PRECISION = 2;
/** A bonus may not move a component by more than this many points. */
export const MAX_BONUS_DELTA = 100;
export const MAX_NOTE_LENGTH = 500;

const DECIMAL_PLACES = (value: number): number => {
	const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
	const fractional = mantissa.split('.')[1]?.length ?? 0;
	return Math.max(0, fractional - Number(exponent));
};

/** Which operations a target kind permits. */
export function allowedOperations(kind: TargetKind): ScoreOperation['op'][] {
	switch (kind) {
		case 'manual':
			return ['set_score', 'clear_score', 'set_note'];
		case 'chapter':
			return ['set_chapter', 'set_note'];
		case 'bonus':
			return ['adjust_bonus', 'set_note'];
		// Read-only through manual entry: corrected at their own source.
		case 'computed':
		case 'assignment':
			return [];
		// Overrides use their own command with a mandatory reason.
		case 'override':
			return [];
	}
}

/**
 * Validate one score operation against a component.
 *
 * Returns the normalized score so callers persist exactly what was validated —
 * never re-derive it at the write site.
 */
export function validateScoreOperation(input: {
	kind: TargetKind;
	/** Component maximum. `0` or absent means unbounded, used only for bonus. */
	maxScore?: number | null;
	operation: ScoreOperation;
}): ValidationResult {
	const { kind, operation } = input;
	const issues: ValidationIssue[] = [];

	if (!allowedOperations(kind).includes(operation.op)) {
		issues.push({
			code: 'wrong_target_kind',
			message: `Operasi "${operation.op}" tidak berlaku untuk komponen ${kind}.`,
		});
		return { ok: false, issues };
	}

	const max = typeof input.maxScore === 'number' && input.maxScore > 0 ? input.maxScore : null;

	switch (operation.op) {
		case 'set_score': {
			const score = operation.score;
			if (!Number.isFinite(score)) {
				issues.push({ code: 'not_finite', message: 'Nilai harus berupa angka.' });
				break;
			}
			if (score < 0) {
				issues.push({ code: 'negative', message: 'Nilai tidak boleh negatif.' });
				break;
			}
			if (max !== null && score > max) {
				issues.push({ code: 'over_max', message: `Nilai melebihi maksimum ${max}.` });
				break;
			}
			if (DECIMAL_PLACES(score) > SCORE_PRECISION) {
				issues.push({
					code: 'precision',
					message: `Nilai maksimal ${SCORE_PRECISION} angka desimal.`,
				});
				break;
			}
			return { ok: true, operation, normalized: { score } };
		}
		case 'clear_score':
			return { ok: true, operation, normalized: { score: null } };
		case 'set_note': {
			if (operation.note.length > MAX_NOTE_LENGTH) {
				issues.push({
					code: 'note_too_long',
					message: `Catatan maksimal ${MAX_NOTE_LENGTH} karakter.`,
				});
			}
			return issues.length
				? { ok: false, issues }
				: { ok: true, operation, normalized: { score: null } };
		}
		case 'set_chapter':
			return { ok: true, operation, normalized: { score: null } };
		case 'adjust_bonus': {
			const delta = operation.delta;
			if (!Number.isFinite(delta)) {
				issues.push({ code: 'not_finite', message: 'Penyesuaian bonus harus berupa angka.' });
				break;
			}
			if (Math.abs(delta) > MAX_BONUS_DELTA) {
				issues.push({
					code: 'bonus_out_of_range',
					message: `Penyesuaian bonus maksimal ${MAX_BONUS_DELTA} poin.`,
				});
				break;
			}
			return { ok: true, operation, normalized: { score: delta } };
		}
		default:
			issues.push({ code: 'unknown_operation', message: 'Operasi tidak dikenal.' });
	}

	return { ok: false, issues };
}

/**
 * Parse a lecturer-entered score string.
 *
 * Accepts an explicit decimal separator instead of guessing: "1.234,5" and
 * "1,234.5" are different numbers, and a guess silently corrupts a grade.
 * A blank string is "no change", never zero.
 */
export type ParsedInput =
	| { state: 'blank' }
	| { state: 'clear' }
	| { state: 'value'; value: number }
	| { state: 'ambiguous'; reason: string }
	| { state: 'invalid'; reason: string };

export function parseScoreInput(
	raw: string,
	decimalSeparator: '.' | ',' = '.',
): ParsedInput {
	const text = (raw ?? '').trim();
	if (text === '') return { state: 'blank' };
	// An explicit clear token, so clearing is never a typo away from a zero.
	if (text === '-' || text.toLowerCase() === 'clear') return { state: 'clear' };

	const other = decimalSeparator === '.' ? ',' : '.';
	// Never erase an undeclared decimal separator and multiply a grade by ten.
	// Grouped numbers are accepted only with the declared decimal separator
	// and exact three-digit grouping (e.g. 1,234.50), not by guessing.
	if (text.includes(other) && !text.includes(decimalSeparator)) {
		return { state: 'ambiguous', reason: 'Pemisah angka berbeda dari format impor.' };
	}
	if (text.includes(decimalSeparator) && text.includes(other)) {
		const lastDecimal = text.lastIndexOf(decimalSeparator);
		const lastOther = text.lastIndexOf(other);
		if (lastOther > lastDecimal) {
			return {
				state: 'ambiguous',
				reason: `Pemisah desimal "${decimalSeparator}" bukan yang terakhir; periksa format impor.`,
			};
		}
	}

	if (text.includes(other)) {
		const integer = text.split(decimalSeparator)[0].replace(/^-/, '');
		const groups = integer.split(other);
		if (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some((group) => !/^\d{3}$/.test(group))) {
			return { state: 'ambiguous', reason: 'Pengelompokan ribuan tidak valid.' };
		}
	}
	if (text.split(decimalSeparator).length > 2) {
		return { state: 'invalid', reason: 'Pemisah desimal berulang.' };
	}
	const normalized = text.split(other).join('').split(decimalSeparator).join('.');
	if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
		return { state: 'invalid', reason: 'Nilai harus berupa angka.' };
	}
	const value = Number(normalized);
	if (!Number.isFinite(value)) return { state: 'invalid', reason: 'Nilai bukan angka yang sah.' };
	return { state: 'value', value };
}

/**
 * Convert a score from an explicit input scale to the component scale.
 *
 * The plan forbids silently normalizing a 0–100 import into a component out of
 * 30. This helper makes the conversion explicit and returns the factor used so
 * the UI can show it.
 */
export function convertScale(
	value: number,
	fromScale: number,
	toScale: number,
): { value: number; factor: number } {
	if (!Number.isFinite(fromScale) || fromScale <= 0) {
		throw new Error('Skala asal harus lebih besar dari nol.');
	}
	if (!Number.isFinite(toScale) || toScale <= 0) {
		throw new Error('Skala tujuan harus lebih besar dari nol.');
	}
	if (!Number.isFinite(value) || value < 0 || value > fromScale) {
		throw new Error('Nilai berada di luar skala asal.');
	}
	const factor = toScale / fromScale;
	const converted = Math.round(value * factor * 10 ** SCORE_PRECISION) / 10 ** SCORE_PRECISION;
	return { value: converted, factor };
}

/** True when a scale conversion is needed for this value/component pair. */
export function needsScaleConversion(fromScale: number, maxScore: number): boolean {
	return Math.abs(fromScale - maxScore) > 1e-9;
}
