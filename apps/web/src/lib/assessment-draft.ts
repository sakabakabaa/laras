export type AssessmentDraft = { version: 1; finalScore: number | null; note: string };

/** Review drafts are separate from the published grade and original AI output. */
export function parseAssessmentDraft(raw: unknown): AssessmentDraft | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const value = raw as Record<string, unknown>;
	if (value.version !== 1 || typeof value.note !== 'string' || value.note.length > 2000) return null;
	if (value.finalScore !== null && (typeof value.finalScore !== 'number' || !Number.isFinite(value.finalScore) || value.finalScore < 0 || value.finalScore > 100)) return null;
	return { version: 1, finalScore: value.finalScore as number | null, note: value.note };
}
