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
import type {EvalFinding, EvalSeverity} from './ai-evaluation';
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
		const anchored = !!finding.quote && finding.anchorValid !== false && !finding.anchorAmbiguous && start >= 0 && end > start;
		const span = anchored ? spans.find((s) => start >= s.start && end <= s.end) : undefined;
		return {
			severity: finding.severity,
			quote: finding.quote,
			note: clip(finding.note, 600),
			errorDescription: clip(finding.errorDescription, 300),
			correction: clip(finding.correction, 300),
			explanation: clip(finding.explanation, 400),
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
export type CardMarks = {findings: EvalFinding[]; checked: {start: number; end: number} | null};

export type AttemptMarks =
	| {status: 'none'}
	/** The answer changed after the draft was made: no marks are shown. */
	| {status: 'stale'}
	/** `legacy`: an older draft without anchors — quotes located best-effort, never green. */
	| {status: 'ready'; legacy: boolean; cards: Record<string, CardMarks>};

const severityOf = (value: unknown): EvalSeverity => (value === 'major' ? 'major' : 'minor');

const occurrences = (text: string, quote: string) => {
	let count = 0;
	for (let at = text.indexOf(quote); at !== -1; at = text.indexOf(quote, at + 1)) count += 1;
	return count;
};

const toEval = (finding: ScheduledAiFinding, quote: string, start: number): EvalFinding => ({
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
});

/**
 * Turns the stored AI draft of an attempt into per-card marks. Only a ready
 * draft of the attempt's current revision produces marks; `cards` are the
 * attempt's written answer cards (id + the student's original answer).
 */
export function scheduledAttemptMarks(
	record: {attempt: string; status: string; attemptRevision: number; draft?: {findings?: ScheduledAiFinding[]; answers?: ScheduledAiCheckedAnswer[]}} | undefined,
	attempt: Pick<ScheduledAttempt, 'id' | 'revision'> | undefined,
	cards: {id: string; answer: string}[],
): AttemptMarks {
	if (!record || !attempt || record.attempt !== attempt.id || record.status !== 'ready') return {status: 'none'};
	if (record.attemptRevision !== attempt.revision) return {status: 'stale'};
	const findings = Array.isArray(record.draft?.findings) ? record.draft.findings : [];
	const checkedAnswers = record.draft?.answers;
	const out: Record<string, CardMarks> = {};
	if (Array.isArray(checkedAnswers)) {
		for (const card of cards) {
			const text = card.answer || '';
			if (!text.trim()) continue;
			const lead = text.length - text.trimStart().length;
			let consistent = true;
			const marks: EvalFinding[] = [];
			for (const finding of findings) {
				if (finding.itemId !== card.id) continue;
				const quote = (finding.quote || '').trim();
				const {answerStart, answerEnd} = finding;
				if (!quote || finding.anchorValid === false || finding.anchorAmbiguous) continue;
				if (typeof answerStart !== 'number' || typeof answerEnd !== 'number') continue;
				const start = lead + answerStart;
				// Defence in depth: the stored offsets must still slice to the exact quote.
				if (answerEnd - answerStart !== quote.length || text.slice(start, start + quote.length) !== quote) {
					consistent = false;
					continue;
				}
				marks.push(toEval(finding, quote, start));
			}
			const read = checkedAnswers.find((entry) => entry && entry.itemId === card.id);
			const length = read && typeof read.length === 'number' ? Math.max(0, read.length) : 0;
			out[card.id] = {findings: marks, checked: consistent && length > 0 ? {start: lead, end: Math.min(text.length, lead + length)} : null};
		}
		return {status: 'ready', legacy: false, cards: out};
	}
	// Older draft: no anchors were stored. A quote is placed only where it occurs
	// exactly once across all of the attempt's answers; nothing is ever green.
	for (const card of cards) if ((card.answer || '').trim()) out[card.id] = {findings: [], checked: null};
	for (const finding of findings) {
		const quote = (finding?.quote || '').trim();
		if (!quote || quote.length > 300) continue;
		const hits = cards.filter((card) => occurrences(card.answer || '', quote) > 0);
		if (hits.length !== 1 || occurrences(hits[0].answer, quote) !== 1) continue;
		out[hits[0].id]?.findings.push(toEval(finding, quote, hits[0].answer.indexOf(quote)));
	}
	return {status: 'ready', legacy: true, cards: out};
}
