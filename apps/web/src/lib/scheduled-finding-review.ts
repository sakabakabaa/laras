/**
 * Lecturer review (approve / reject) of the AI findings on a scheduled-class
 * ("Kelas terjadwal") written answer. Client-safe and pure.
 *
 * The stored AI draft is never edited. A finding is identified by its index in
 * the draft (`ai-<n>`, like Tugas) and the lecturer's decisions live next to
 * the assessment (`scheduled_assessments.reviewFindings`). A decision only
 * applies while the finding's quote is unchanged, so a regenerated draft never
 * inherits a decision made about different text.
 *
 * Students only ever see feedback text: it is composed from APPROVED findings
 * (plus the AI summary) so pending or rejected findings can never leak.
 */
import {groupFindings, type FindingGroup} from './ai-evaluation';
import type {FindingStatus, MarkReview, ScheduledAiFinding} from './scheduled-answer-marks';

export type FindingDecision = {id: string; quote: string; status: 'approved' | 'rejected'; rejectReason?: string};
export type ReviewedFinding = ScheduledAiFinding & {id: string; status: FindingStatus; rejectReason: string};

export const MAX_REJECT_REASON = 600;
export const findingId = (index: number) => `ai-${index}`;

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Decisions that still match their finding (same id and quote). */
export function reviewedFindings(findings: ScheduledAiFinding[] | undefined, decisions: FindingDecision[] | undefined): ReviewedFinding[] {
	const byId = new Map((decisions || []).map((d) => [d.id, d]));
	return (findings || []).map((finding, index) => {
		const id = findingId(index);
		const decision = byId.get(id);
		const applies = decision && (decision.quote || '') === (finding.quote || '');
		return {...finding, id, status: applies ? decision.status : 'pending', rejectReason: applies ? decision.rejectReason || '' : ''};
	});
}

/** Marks look their review state up with this (see `scheduledAttemptMarks`). */
export function reviewLookup(decisions: FindingDecision[] | undefined): (index: number, finding: ScheduledAiFinding) => MarkReview {
	const byId = new Map((decisions || []).map((d) => [d.id, d]));
	return (index, finding) => {
		const id = findingId(index);
		const decision = byId.get(id);
		const applies = decision && (decision.quote || '') === (finding.quote || '');
		return {id, status: applies ? decision.status : 'pending', reason: applies ? decision.rejectReason || '' : ''};
	};
}

/** Sets one finding's status; 'pending' removes the decision. Pure: returns a new list. */
export function decide(
	decisions: FindingDecision[] | undefined,
	finding: Pick<ReviewedFinding, 'id' | 'quote'>,
	status: FindingStatus,
	reason = '',
): FindingDecision[] {
	const rest = (decisions || []).filter((d) => d.id !== finding.id);
	if (status === 'pending') return rest;
	return [...rest, {id: finding.id, quote: finding.quote || '', status, ...(status === 'rejected' && reason.trim() ? {rejectReason: reason.trim().slice(0, MAX_REJECT_REASON)} : {})}];
}

/** "Setujui semua temuan": approves every finding still pending. */
export function approveAllPending(reviewed: ReviewedFinding[], decisions: FindingDecision[] | undefined): FindingDecision[] {
	return reviewed.filter((f) => f.status === 'pending').reduce((acc, f) => decide(acc, f, 'approved'), decisions || []);
}

/** "Setujui grup": approves the pending findings among `ids`. */
export function approveGroup(reviewed: ReviewedFinding[], decisions: FindingDecision[] | undefined, ids: string[]): FindingDecision[] {
	const set = new Set(ids);
	return reviewed.filter((f) => set.has(f.id) && f.status === 'pending').reduce((acc, f) => decide(acc, f, 'approved'), decisions || []);
}

/** "Tolak grup": rejects every not-yet-rejected finding among `ids` (no reason). */
export function rejectGroup(reviewed: ReviewedFinding[], decisions: FindingDecision[] | undefined, ids: string[]): FindingDecision[] {
	const set = new Set(ids);
	return reviewed.filter((f) => set.has(f.id) && f.status !== 'rejected').reduce((acc, f) => decide(acc, f, 'rejected'), decisions || []);
}

export const pendingCount = (reviewed: ReviewedFinding[]) => reviewed.filter((f) => f.status === 'pending').length;

/** Non-blocking hint for the grading panel; '' when nothing is waiting. */
export function pendingNotice(reviewed: ReviewedFinding[]): string {
	const count = pendingCount(reviewed);
	return count ? `${count} temuan AI belum ditinjau` : '';
}

/** Groups of recurring findings (2+ with the same group / taxonomy), via the shared Tugas grouping. */
export function reviewGroups(reviewed: ReviewedFinding[]): FindingGroup<ReviewedFinding>[] {
	return groupFindings(reviewed);
}

/** One bullet per finding; the summary first. Callers decide WHICH findings may appear. */
export function composeFeedbackText(
	summary: string,
	findings: {quote?: string; correction?: string; note?: string; errorDescription?: string}[],
	max = 9000,
): string {
	const lines: string[] = [];
	const intro = (summary || '').trim();
	if (intro) lines.push(intro);
	const points = findings.map((f) => `• ${f.quote ? `“${f.quote}”` : 'Umum'}${f.correction ? ` → ${f.correction}` : ''}: ${f.note || f.errorDescription || ''}`.trimEnd());
	if (points.length) lines.push(points.join('\n'));
	return lines.join('\n\n').slice(0, max);
}

/**
 * Student-facing feedback proposal: the AI summary, then ONLY approved findings.
 * (The stored draft's own `feedback` is never used: older drafts listed every finding.)
 */
export function composeApprovedFeedback(summary: string, reviewed: ReviewedFinding[], max = 9000): string {
	return composeFeedbackText(summary, reviewed.filter((f) => f.status === 'approved'), max);
}

/** What is stored with the assessment: the full review snapshot (ReviewFinding-shaped). */
export function reviewFindingsPayload(reviewed: ReviewedFinding[]) {
	return reviewed.slice(0, 40).map((f) => ({
		id: f.id,
		source: 'ai' as const,
		status: f.status,
		severity: f.severity === 'major' ? 'major' : 'minor',
		quote: text(f.quote, 300),
		note: text(f.note, 400),
		correction: text(f.correction, 200),
		explanation: text(f.explanation, 250),
		errorDescription: text(f.errorDescription, 160),
		category: text(f.category, 40),
		subcategory: text(f.subcategory, 40),
		group: text(f.group, 40),
		certainty: f.certainty === 'pasti' || f.certainty === 'mungkin' ? f.certainty : '',
		itemId: f.itemId || '',
		rejectReason: f.status === 'rejected' ? text(f.rejectReason, MAX_REJECT_REASON) : '',
	}));
}

/** Decisions out of a stored `reviewFindings` value (tolerant: anything else is ignored). */
export function decisionsFromStored(value: unknown): FindingDecision[] {
	let rows: unknown = value;
	if (typeof rows === 'string') {
		try {
			rows = JSON.parse(rows);
		} catch {
			return [];
		}
	}
	if (!Array.isArray(rows)) return [];
	const out: FindingDecision[] = [];
	for (const raw of rows.slice(0, 40)) {
		if (!raw || typeof raw !== 'object') continue;
		const row = raw as Record<string, unknown>;
		if (typeof row.id !== 'string' || !/^ai-\d{1,3}$/.test(row.id)) continue;
		if (row.status !== 'approved' && row.status !== 'rejected') continue;
		out.push({id: row.id, quote: text(row.quote, 300), status: row.status, ...(row.status === 'rejected' && text(row.rejectReason, MAX_REJECT_REASON) ? {rejectReason: text(row.rejectReason, MAX_REJECT_REASON)} : {})});
	}
	return out;
}

/** Draft state helper: stores decisions without adding a key when there are none. */
export function withDecisions<T extends {reviewFindings?: FindingDecision[]}>(draft: T, decisions: FindingDecision[]): T {
	const {reviewFindings: _old, ...rest} = draft;
	void _old;
	return (decisions.length ? {...rest, reviewFindings: decisions} : rest) as T;
}
