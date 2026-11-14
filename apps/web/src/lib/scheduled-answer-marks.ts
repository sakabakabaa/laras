/**
 * Inline AI marks on a scheduled-class ("Kelas terjadwal") written answer.
 *
 * Client-safe and pure. The AI draft verifies its findings against ONE text:
 * the attempt's non-empty answers joined with "\n\n" (`answersTextOf`). The
 * server maps each verified offset back to the answer it falls in
 * ({@link anchorDraftFindings}); the review workspace then turns a stored
 * draft into per-answer marks ({@link scheduledAttemptMarks}) that the shared
 * marked-text renderer lays over the student's original text.
 */
import type {EvalCertainty, EvalFinding, EvalSeverity} from './ai-evaluation';
import type {ScheduledAttempt} from './scheduled-classes';

/** Must match `answersTextOf` in live-answer-review.server. */
export const ANSWER_SEPARATOR = '\n\n';

/** One stored AI finding. Drafts from before inline marks only have quote/note/correction. */
export type ScheduledAiFinding = {
	quote?: string;
	note?: string;
	correction?: string;
	severity?: EvalSeverity;
	errorDescription?: string;
	explanation?: string;
	/** Two-pass draft: taxonomy, recurring-error key and verified certainty (absent on older drafts). */
	category?: string;
	subcategory?: string;
	group?: string;
	certainty?: EvalCertainty;
	/** Offsets in the joined answers text (null = general or ambiguous). */
	quoteStart?: number | null;
	quoteEnd?: number | null;
	anchorValid?: boolean;
	anchorAmbiguous?: boolean;
	/** Card id of the answer the quote lies in (worksheet item id, or 'text'). */
	itemId?: string | null;
	/** Index into the reviewed written answers (`writtenItemsOf` order). */
	answerIndex?: number | null;
	/** Offsets relative to that answer's trimmed text. */
	answerStart?: number | null;
	answerEnd?: number | null;
};

/** How much of each answer the AI actually read (trimmed, possibly clipped). */
export type ScheduledAiCheckedAnswer = {itemId: string; answerIndex: number; length: number};

const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Review state of one AI finding (same words as Tugas). */
export type FindingStatus = 'pending' | 'approved' | 'rejected';
/** A mark's finding plus its review identity; plain EvalFinding when no review applies. */
export type MarkFinding = EvalFinding & {reviewId?: string; reviewStatus?: FindingStatus; reviewReason?: string};
/** Quotes longer than this are not stored as anchors (keeps the stored draft well under its size limit). */
export const MAX_STORED_QUOTE = 300;

/**
 * Maps verified findings (offsets in the joined text) back to individual
 * answers. `answers` are the reviewed answers in the exact order and form the
 * model saw them (trimmed/clipped); empty ones were skipped in the join.
 * A quote that does not lie inside exactly one answer keeps no answer anchor.
 */
export function anchorDraftFindings(
	findings: EvalFinding[],
	answers: {id: string; answer: string}[],
): {findings: ScheduledAiFinding[]; answers: ScheduledAiCheckedAnswer[]} {
	const spans: {id: string; index: number; start: number; end: number}[] = [];
	let base = 0;
	answers.forEach((item, index) => {
		if (!item.answer) return;
		spans.push({id: item.id, index, start: base, end: base + item.answer.length});
		base += item.answer.length + ANSWER_SEPARATOR.length;
	});
	const stored = findings.map((finding): ScheduledAiFinding => {
		const start = typeof finding.quoteStart === 'number' ? finding.quoteStart : -1;
		const end = typeof finding.quoteEnd === 'number' ? finding.quoteEnd : -1;
		const anchored = !!finding.quote && finding.quote.length <= MAX_STORED_QUOTE && finding.anchorValid !== false && !finding.anchorAmbiguous && start >= 0 && end > start;
		const span = anchored ? spans.find((s) => start >= s.start && end <= s.end) : undefined;
		return {
			severity: finding.severity,
			quote: finding.quote.length <= MAX_STORED_QUOTE ? finding.quote : '',
			note: clip(finding.note, 400),
			errorDescription: clip(finding.errorDescription, 160),
			correction: clip(finding.correction, 200),
			explanation: clip(finding.explanation, 250),
			...(finding.category ? {category: clip(finding.category, 40)} : {}),
			...(finding.subcategory ? {subcategory: clip(finding.subcategory, 40)} : {}),
			...(finding.group ? {group: clip(finding.group, 40)} : {}),
			...(finding.certainty ? {certainty: finding.certainty} : {}),
			quoteStart: anchored ? start : null,
			quoteEnd: anchored ? end : null,
			anchorValid: finding.anchorValid !== false,
			anchorAmbiguous: !!finding.anchorAmbiguous,
			itemId: span ? span.id : null,
			answerIndex: span ? span.index : null,
			answerStart: span ? start - span.start : null,
			answerEnd: span ? end - span.start : null,
		};
	});
	return {findings: stored, answers: spans.map((s) => ({itemId: s.id, answerIndex: s.index, length: s.end - s.start}))};
}

/** Marks for one answer card: findings with offsets into `card.answer`, plus the checked range. */
export type CardMarks = {findings: MarkFinding[]; checked: {start: number; end: number} | null};

export type AttemptMarks =
	| {status: 'none'}
	/** The answer changed after the draft was made: no marks are shown. */
	| {status: 'stale'}
	/** `legacy`: an older draft without anchors — quotes located best-effort, never green. */
	| {status: 'ready'; legacy: boolean; cards: Record<string, CardMarks>; meta: DraftMeta};

/** What the AI draft was based on, when the draft recorded it (undefined on older drafts). */
export type DraftMeta = {cefrLevel?: string; usedRubric?: boolean; usedLessonContext?: boolean; usedSubCpmk?: boolean};

const severityOf = (value: unknown): EvalSeverity => (value === 'major' ? 'major' : 'minor');

const occurrences = (text: string, quote: string) => {
	let count = 0;
	for (let at = text.indexOf(quote); at !== -1; at = text.indexOf(quote, at + 1)) count += 1;
	return count;
};

export type MarkReview = {id: string; status: FindingStatus; reason: string};

const toEval = (finding: ScheduledAiFinding, quote: string, start: number, review?: MarkReview): MarkFinding => ({
	severity: severityOf(finding.severity),
	quote,
	note: finding.note || finding.errorDescription || '',
	evidence: '',
	errorDescription: finding.errorDescription || '',
	correction: finding.correction || '',
	explanation: finding.explanation || '',
	anchorValid: true,
	anchorAmbiguous: false,
	quoteStart: start,
	quoteEnd: start + quote.length,
	...(finding.category ? {category: finding.category} : {}),
	...(finding.subcategory ? {subcategory: finding.subcategory} : {}),
	...(finding.group ? {group: finding.group} : {}),
	...(finding.certainty ? {certainty: finding.certainty} : {}),
	...(review ? {reviewId: review.id, reviewStatus: review.status, reviewReason: review.reason} : {}),
});

/**
 * Turns the stored AI draft of an attempt into per-card marks. Only a ready
 * draft of the attempt's current revision produces marks; `cards` are the
 * attempt's written answer cards (id + the student's original answer).
 */
export function scheduledAttemptMarks(
	record: {attempt: string; status: string; attemptRevision: number; draft?: {findings?: ScheduledAiFinding[]; answers?: ScheduledAiCheckedAnswer[]; cefrLevel?: string; usedRubric?: boolean; usedLessonContext?: boolean; usedSubCpmk?: boolean}} | undefined,
	attempt: Pick<ScheduledAttempt, 'id' | 'revision'> | undefined,
	cards: {id: string; answer: string}[],
	/** Review state of each finding by its index-based id (`ai-<n>`); absent = every finding pending. */
	reviewOf?: (index: number, finding: ScheduledAiFinding) => MarkReview,
): AttemptMarks {
	if (!record || !attempt || record.attempt !== attempt.id || record.status !== 'ready') return {status: 'none'};
	if (record.attemptRevision !== attempt.revision) return {status: 'stale'};
	const findings = Array.isArray(record.draft?.findings) ? record.draft.findings : [];
	const checkedAnswers = record.draft?.answers;
	const meta: DraftMeta = {
		cefrLevel: record.draft?.cefrLevel,
		usedRubric: record.draft?.usedRubric,
		usedLessonContext: record.draft?.usedLessonContext,
		usedSubCpmk: record.draft?.usedSubCpmk,
	};
	const out: Record<string, CardMarks> = {};
	if (Array.isArray(checkedAnswers)) {
		for (const card of cards) {
			const text = card.answer || '';
			if (!text.trim()) continue;
			const lead = text.length - text.trimStart().length;
			let consistent = true;
			const marks: MarkFinding[] = [];
			findings.forEach((finding, findingIndex) => {
				if (finding.itemId !== card.id) return;
				const quote = (finding.quote || '').trim();
				const {answerStart, answerEnd} = finding;
				if (!quote || finding.anchorValid === false || finding.anchorAmbiguous) return;
				if (typeof answerStart !== 'number' || typeof answerEnd !== 'number') return;
				const start = lead + answerStart;
				// Defence in depth: the stored offsets must still slice to the exact quote.
				if (answerEnd - answerStart !== quote.length || text.slice(start, start + quote.length) !== quote) {
					consistent = false;
					return;
				}
				marks.push(toEval(finding, quote, start, reviewOf?.(findingIndex, finding)));
			});
			const read = checkedAnswers.find((entry) => entry && entry.itemId === card.id);
			const length = read && typeof read.length === 'number' ? Math.max(0, read.length) : 0;
			out[card.id] = {findings: marks, checked: consistent && length > 0 ? {start: lead, end: Math.min(text.length, lead + length)} : null};
		}
		return {status: 'ready', legacy: false, cards: out, meta};
	}
	// Older draft: no anchors were stored. A quote is placed only where it occurs
	// exactly once across all of the attempt's answers; nothing is ever green.
	for (const card of cards) if ((card.answer || '').trim()) out[card.id] = {findings: [], checked: null};
	findings.forEach((finding, findingIndex) => {
		const quote = (finding?.quote || '').trim();
		if (!quote || quote.length > 300) return;
		const hits = cards.filter((card) => occurrences(card.answer || '', quote) > 0);
		if (hits.length !== 1 || occurrences(hits[0].answer, quote) !== 1) return;
		out[hits[0].id]?.findings.push(toEval(finding, quote, hits[0].answer.indexOf(quote), reviewOf?.(findingIndex, finding)));
	});
	return {status: 'ready', legacy: true, cards: out, meta};
}
