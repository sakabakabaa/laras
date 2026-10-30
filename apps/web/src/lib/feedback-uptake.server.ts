/**
 * Phase 9 — server-only helpers for feedback uptake and revision analytics.
 *
 * Loads formative check-attempt chains (the Phase 8 interaction log),
 * lecturer-created feedback→revision associations, and human-only uptake
 * annotations. Computes hint-efficiency and uptake metrics. Never writes
 * grades, never exposes research judgments to students, and never assumes
 * causality — associations default to 'uncertain' attribution.
 */
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { extractCefrLevel } from '@/lib/cefr-level';
import { activityTypeOf, type Assignment } from '@/lib/assignments';
import { parseResearcherIds, isAuthorizedExporter } from '@/lib/research-export.server';
import {
	computeUptakeAnalytics,
	hintLevelsBeforeRevision,
	maxHintLevelBeforeRevision,
	requiredExplicitCorrection,
	validateAssociationPair,
	validateUptakeRelationship,
	type UptakeRecord,
	type UptakeAnalytics,
} from '@/lib/feedback-uptake';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number | null =>
	typeof value === 'number' && Number.isFinite(value) ? value : null;

export type UptakeError = { status: number; message: string };

type CheckAttemptRow = {
	id: string;
	assignment: string;
	submission: string;
	owner: string;
	channel: string;
	attempt: number;
	level?: number;
	participantName: string;
	identityKey: string;
	responseSnapshot: unknown;
	feedback: string;
	area: string;
	evidence: string;
	focus: string;
	requestedNextHint: boolean;
	revisionSubmitted: boolean;
	revisesAttempt: string;
	created: string;
};

type FeedbackRevisionRow = {
	id: string;
	owner: string;
	assignment: string;
	feedbackAttempt: string;
	revisionAttempt: string;
	originalSubmission: string;
	revisionSubmission: string;
	attributionStatus: string;
	hintLevelsUsed: unknown;
	numberOfHints: number;
	identityKey: string;
	participantName: string;
	created: string;
	updated: string;
};

type FeedbackUptakeRow = {
	id: string;
	owner: string;
	assignment: string;
	feedbackRevision: string;
	feedbackAttempt: string;
	originalSubmission: string;
	revisionSubmission: string;
	uptakeJudgment: string;
	beforeRevisionStatus: string;
	afterRevisionStatus: string;
	uptakeNote: string;
	uptakeReviewedAt: string;
	identityKey: string;
	created: string;
	updated: string;
};

/** Loads every check_attempts row for one assignment (paginated). */
async function loadCheckAttempts(assignmentId: string): Promise<CheckAttemptRow[]> {
	const rows: CheckAttemptRow[] = [];
	let page = 1;
	for (;;) {
		const result = await pocketbaseAdmin.listRecords<CheckAttemptRow>('check_attempts', {
			page,
			perPage: 500,
			filter: `assignment="${assignmentId}"`,
			sort: 'created',
		});
		rows.push(...result.items);
		if (result.items.length < 500) break;
		page += 1;
		if (page > 50) break;
	}
	return rows;
}

/** Loads every feedback_revisions row for one assignment (paginated). */
async function loadFeedbackRevisions(assignmentId: string): Promise<FeedbackRevisionRow[]> {
	const rows: FeedbackRevisionRow[] = [];
	let page = 1;
	for (;;) {
		const result = await pocketbaseAdmin.listRecords<FeedbackRevisionRow>('feedback_revisions', {
			page,
			perPage: 500,
			filter: `assignment="${assignmentId}"`,
			sort: 'created',
		});
		rows.push(...result.items);
		if (result.items.length < 500) break;
		page += 1;
		if (page > 50) break;
	}
	return rows;
}

/** Loads every feedback_uptake row for one assignment (paginated). */
async function loadFeedbackUptake(assignmentId: string): Promise<FeedbackUptakeRow[]> {
	const rows: FeedbackUptakeRow[] = [];
	let page = 1;
	for (;;) {
		const result = await pocketbaseAdmin.listRecords<FeedbackUptakeRow>('feedback_uptake', {
			page,
			perPage: 500,
			filter: `assignment="${assignmentId}"`,
			sort: 'created',
		});
		rows.push(...result.items);
		if (result.items.length < 500) break;
		page += 1;
		if (page > 50) break;
	}
	return rows;
}

/** Parses a JSON hint-levels array into a normalized number list. */
function parseHintLevels(value: unknown): number[] {
	let raw: unknown = value;
	if (typeof raw === 'string') {
		try {
			raw = JSON.parse(raw);
		} catch {
			return [];
		}
	}
	if (!Array.isArray(raw)) return [];
	return raw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
}

/** One participant's check-attempt chain for the lecturer uptake view. */
export type ParticipantChain = {
	identityKey: string;
	participantName: string;
	channel: string;
	attempts: CheckAttemptRow[];
};

/** Groups check attempts by identityKey, preserving chronological order. */
export function groupByParticipant(attempts: CheckAttemptRow[]): ParticipantChain[] {
	const map = new Map<string, ParticipantChain>();
	for (const attempt of attempts) {
		const key = attempt.identityKey;
		if (!key) continue;
		let chain = map.get(key);
		if (!chain) {
			chain = {
				identityKey: key,
				participantName: attempt.participantName || 'Peserta',
				channel: attempt.channel || 'enrolled',
				attempts: [],
			};
			map.set(key, chain);
		}
		chain.attempts.push(attempt);
	}
	return Array.from(map.values());
}

/** Extracts the student's text response from a check attempt snapshot. */
export function responseTextOf(snapshot: unknown): string {
	if (!snapshot || typeof snapshot !== 'object') return '';
	const s = snapshot as Record<string, unknown>;
	const content = typeof s.content === 'string' ? s.content : '';
	if (content) return content;
	// Question-based tasks: join answers into a readable string.
	const answers = s.answers;
	if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
		return Object.entries(answers)
			.map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
			.join('\n');
	}
	return '';
}

export type UptakeViewData = {
	assignment: Assignment;
	participants: ParticipantChain[];
	associations: FeedbackRevisionRow[];
	annotations: FeedbackUptakeRow[];
	cefrLevel: string | null;
};

/**
 * Authorizes the caller and loads the full uptake review dataset for one
 * assignment: check-attempt chains grouped by participant, existing
 * feedback→revision associations, and uptake annotations. Read-only.
 */
export async function loadUptakeView(
	request: Request,
	assignmentId: string,
): Promise<{ error: UptakeError } | UptakeViewData> {
	if (!SAFE_ID.test(assignmentId)) {
		return { error: { status: 422, message: 'assignmentId tidak valid.' } };
	}
	const auth = await authenticateUser(request);
	if ('error' in auth) return { error: auth.error };
	const { user } = auth;

	let assignment: Assignment;
	try {
		assignment = await pocketbaseAdmin.getRecord<Assignment>('assignments', assignmentId);
	} catch {
		return { error: { status: 404, message: 'Tugas tidak ditemukan.' } };
	}

	const researcherIds = parseResearcherIds(process.env.RESEARCHER_USER_IDS);
	if (!isAuthorizedExporter(user.id, assignment.owner, researcherIds)) {
		return {
			error: {
				status: 403,
				message: 'Hanya pemilik tugas atau peneliti yang diotorisasi yang dapat mengakses data uptake.',
			},
		};
	}

	const [attempts, associations, annotations] = await Promise.all([
		loadCheckAttempts(assignmentId),
		loadFeedbackRevisions(assignmentId),
		loadFeedbackUptake(assignmentId),
	]);

	let cefrLevel: string | null = null;
	try {
		const course = await pocketbaseAdmin.getRecord<{ code?: string }>('courses', assignment.course);
		cefrLevel = extractCefrLevel(course.code || '');
	} catch {
		/* no course — CEFR stays null */
	}

	return {
		assignment,
		participants: groupByParticipant(attempts),
		associations,
		annotations,
		cefrLevel,
	};
}

export type SaveAssociationInput = {
	assignmentId: string;
	feedbackAttemptId: string;
	revisionAttemptId: string;
	attributionStatus: string;
	originalSubmissionId?: string;
	revisionSubmissionId?: string;
};

/**
 * Creates or updates a feedback→revision association. The attributionStatus
 * defaults to 'uncertain' — the system never assumes a revision was caused by
 * AI feedback. Faculty-only; ownership-verified.
 */
export async function saveAssociation(
	request: Request,
	input: SaveAssociationInput,
): Promise<{ error: UptakeError } | { id: string }> {
	const assignmentId = (input.assignmentId || '').trim();
	if (!SAFE_ID.test(assignmentId)) {
		return { error: { status: 422, message: 'assignmentId tidak valid.' } };
	}
	if (!SAFE_ID.test(input.feedbackAttemptId)) {
		return { error: { status: 422, message: 'feedbackAttemptId tidak valid.' } };
	}
	if (!input.revisionAttemptId || !SAFE_ID.test(input.revisionAttemptId)) {
		return { error: { status: 422, message: 'revisionAttemptId tidak valid.' } };
	}
	const attribution = ['confirmed', 'uncertain', 'rejected'].includes(input.attributionStatus)
		? input.attributionStatus
		: 'uncertain';

	const auth = await authenticateUser(request);
	if ('error' in auth) return { error: auth.error };
	const { user } = auth;

	let assignment: Assignment;
	try {
		assignment = await pocketbaseAdmin.getRecord<Assignment>('assignments', assignmentId);
	} catch {
		return { error: { status: 404, message: 'Tugas tidak ditemukan.' } };
	}
	const researcherIds = parseResearcherIds(process.env.RESEARCHER_USER_IDS);
	if (!isAuthorizedExporter(user.id, assignment.owner, researcherIds)) {
		return { error: { status: 403, message: 'Tidak berhak mengelola asosiasi tugas ini.' } };
	}

	// Load the check attempt chain to compute hint levels used before the revision.
	const attempts = await loadCheckAttempts(assignmentId);
	const feedbackAttempt = attempts.find((a) => a.id === input.feedbackAttemptId) ?? null;
	const revisionAttempt = attempts.find((a) => a.id === input.revisionAttemptId) ?? null;

	// Phase 10.1 — participant isolation: reject cross-student, cross-assignment,
	// and chronologically invalid associations BEFORE persisting a research
	// record. The pure validator is the single source of truth; the server
	// never trusts frontend validation.
	const validation = validateAssociationPair({
		assignmentId,
		feedbackAttempt,
		revisionAttempt,
	});
	if (validation) {
		return { error: { status: validation.status, message: validation.message } };
	}
	const fbAttempt = feedbackAttempt as CheckAttemptRow;

	// Hint levels are computed from the SAME participant's chain only — the
	// pure helper filters by identityKey defensively so no other student's
	// hints can ever be absorbed into this revision.
	const hintLevels = hintLevelsBeforeRevision(attempts, input.revisionAttemptId);

	// Find an existing association for this feedback attempt + revision attempt.
	const existing = await pocketbaseAdmin.listRecords<FeedbackRevisionRow>('feedback_revisions', {
		perPage: 1,
		filter: `feedbackAttempt="${input.feedbackAttemptId}" && revisionAttempt="${input.revisionAttemptId}"`,
	});

	const payload = {
		owner: user.id,
		assignment: assignmentId,
		feedbackAttempt: input.feedbackAttemptId,
		revisionAttempt: input.revisionAttemptId,
		originalSubmission: input.originalSubmissionId || '',
		revisionSubmission: input.revisionSubmissionId || '',
		attributionStatus: attribution,
		hintLevelsUsed: hintLevels,
		numberOfHints: hintLevels.length,
		identityKey: fbAttempt.identityKey,
		participantName: fbAttempt.participantName || '',
	};

	if (existing.items[0]) {
		const updated = await pocketbaseAdmin.updateRecord<FeedbackRevisionRow>(
			'feedback_revisions',
			existing.items[0].id,
			payload,
		);
		return { id: updated.id };
	}
	const created = await pocketbaseAdmin.createRecord<FeedbackRevisionRow>('feedback_revisions', payload);
	return { id: created.id };
}

export type SaveUptakeInput = {
	assignmentId: string;
	feedbackRevisionId: string;
	feedbackAttemptId?: string;
	originalSubmissionId?: string;
	revisionSubmissionId?: string;
	uptakeJudgment: string;
	beforeRevisionStatus?: string;
	afterRevisionStatus?: string;
	uptakeNote?: string;
};

const UPTAKE_JUDGMENTS = [
	'successful_uptake',
	'partial_uptake',
	'unsuccessful_uptake',
	'no_uptake',
	'not_applicable',
];
const BEFORE_STATUSES = ['error', 'acceptable', 'unclear'];
const AFTER_STATUSES = [
	'corrected',
	'partially_corrected',
	'unchanged',
	'worsened',
	'introduced_new_error',
	'unclear',
];

/**
 * Creates or updates a uptake annotation for one feedback→revision
 * association. Uptake judgments are HUMAN-ENTERED ONLY — this endpoint never
 * calls any AI model. Faculty-only; ownership-verified. One uptake row per
 * association (unique index).
 */
export async function saveUptakeAnnotation(
	request: Request,
	input: SaveUptakeInput,
): Promise<{ error: UptakeError } | { id: string }> {
	const assignmentId = (input.assignmentId || '').trim();
	if (!SAFE_ID.test(assignmentId)) {
		return { error: { status: 422, message: 'assignmentId tidak valid.' } };
	}
	if (!SAFE_ID.test(input.feedbackRevisionId)) {
		return { error: { status: 422, message: 'feedbackRevisionId tidak valid.' } };
	}
	if (!UPTAKE_JUDGMENTS.includes(input.uptakeJudgment)) {
		return { error: { status: 422, message: 'uptakeJudgment tidak valid.' } };
	}
	const before = BEFORE_STATUSES.includes(input.beforeRevisionStatus || '')
		? input.beforeRevisionStatus
		: '';
	const after = AFTER_STATUSES.includes(input.afterRevisionStatus || '')
		? input.afterRevisionStatus
		: '';

	const auth = await authenticateUser(request);
	if ('error' in auth) return { error: auth.error };
	const { user } = auth;

	let assignment: Assignment;
	try {
		assignment = await pocketbaseAdmin.getRecord<Assignment>('assignments', assignmentId);
	} catch {
		return { error: { status: 404, message: 'Tugas tidak ditemukan.' } };
	}
	const researcherIds = parseResearcherIds(process.env.RESEARCHER_USER_IDS);
	if (!isAuthorizedExporter(user.id, assignment.owner, researcherIds)) {
		return { error: { status: 403, message: 'Tidak berhak mengelola anotasi tugas ini.' } };
	}

	// Phase 10.1 — verify the uptake annotation belongs to the EXACT revision
	// relationship being evaluated. Load the feedback_revision and its two
	// referenced check_attempts, then confirm the revision belongs to this
	// assignment and both attempts share one participant identityKey. Reject
	// inconsistent requests (cross-assignment, mismatched identity) rather
	// than persisting an invalid research record.
	let feedbackRevision: FeedbackRevisionRow;
	try {
		feedbackRevision = await pocketbaseAdmin.getRecord<FeedbackRevisionRow>(
			'feedback_revisions',
			input.feedbackRevisionId,
		);
	} catch {
		return { error: { status: 404, message: 'Asosiasi umpan balik–revisi tidak ditemukan.' } };
	}

	const attemptIds = [feedbackRevision.feedbackAttempt, feedbackRevision.revisionAttempt].filter(
		(id) => id && SAFE_ID.test(id),
	);
	const attemptById = new Map<string, CheckAttemptRow>();
	for (const id of attemptIds) {
		if (attemptById.has(id)) continue;
		try {
			attemptById.set(id, await pocketbaseAdmin.getRecord<CheckAttemptRow>('check_attempts', id));
		} catch {
			/* missing attempt — leaves null below */
		}
	}
	const fbAttempt = attemptById.get(feedbackRevision.feedbackAttempt) ?? null;
	const revAttempt = attemptById.get(feedbackRevision.revisionAttempt) ?? null;

	const uptakeValidation = validateUptakeRelationship({
		assignmentId,
		feedbackRevision: {
			assignment: feedbackRevision.assignment,
			feedbackAttempt: feedbackRevision.feedbackAttempt,
			revisionAttempt: feedbackRevision.revisionAttempt,
		},
		feedbackAttempt: fbAttempt,
		revisionAttempt: revAttempt,
	});
	if (uptakeValidation) {
		return {
			error: { status: uptakeValidation.status, message: uptakeValidation.message },
		};
	}

	// Find an existing uptake annotation for this feedback_revision.
	const existing = await pocketbaseAdmin.listRecords<FeedbackUptakeRow>('feedback_uptake', {
		perPage: 1,
		filter: `feedbackRevision="${input.feedbackRevisionId}"`,
	});

	const payload = {
		owner: user.id,
		assignment: assignmentId,
		feedbackRevision: input.feedbackRevisionId,
		feedbackAttempt: input.feedbackAttemptId || feedbackRevision.feedbackAttempt,
		originalSubmission: input.originalSubmissionId || '',
		revisionSubmission: input.revisionSubmissionId || '',
		uptakeJudgment: input.uptakeJudgment,
		beforeRevisionStatus: before || '',
		afterRevisionStatus: after || '',
		uptakeNote: (input.uptakeNote || '').slice(0, 4000),
		uptakeReviewedAt: new Date().toISOString(),
		identityKey: feedbackRevision.identityKey || '',
	};

	if (existing.items[0]) {
		const updated = await pocketbaseAdmin.updateRecord<FeedbackUptakeRow>(
			'feedback_uptake',
			existing.items[0].id,
			payload,
		);
		return { id: updated.id };
	}
	const created = await pocketbaseAdmin.createRecord<FeedbackUptakeRow>('feedback_uptake', payload);
	return { id: created.id };
}

/**
 * Loads all uptake records across the caller's formal+formative assignments
 * and computes aggregate analytics. Used by the research analytics dashboard.
 * Read-only; never writes.
 */
export async function computeUptakeAnalyticsForUser(
	request: Request,
	assignmentId?: string,
): Promise<{ error: UptakeError } | UptakeAnalytics> {
	const auth = await authenticateUser(request);
	if ('error' in auth) return { error: auth.error };
	const { user } = auth;

	let assignments: Assignment[];
	try {
		assignments = await pocketbaseAdmin
			.listRecords<Assignment>('assignments', {
				page: 1,
				perPage: 500,
				filter: `owner="${user.id}"`,
				sort: '-updated',
			})
			.then((r) => r.items);
	} catch {
		assignments = [];
	}

	let scoped = assignments;
	if (assignmentId) {
		if (!SAFE_ID.test(assignmentId)) {
			return { error: { status: 422, message: 'assignmentId tidak valid.' } };
		}
		scoped = assignments.filter((a) => a.id === assignmentId);
		if (scoped.length === 0) {
			try {
				const a = await pocketbaseAdmin.getRecord<Assignment>('assignments', assignmentId);
				const researcherIds = parseResearcherIds(process.env.RESEARCHER_USER_IDS);
				if (!isAuthorizedExporter(user.id, a.owner, researcherIds)) {
					return { error: { status: 403, message: 'Tidak berhak mengakses data riset tugas ini.' } };
				}
				scoped = [a];
			} catch {
				return { error: { status: 404, message: 'Tugas tidak ditemukan.' } };
			}
		}
	}

	if (scoped.length === 0) {
		return computeUptakeAnalytics([]);
	}

	// CEFR per course.
	const courseCefr = new Map<string, string>();
	for (const courseId of Array.from(new Set(scoped.map((a) => a.course).filter(Boolean)))) {
		try {
			const course = await pocketbaseAdmin.getRecord<{ code?: string }>('courses', courseId);
			courseCefr.set(courseId, extractCefrLevel(course.code || '') || '');
		} catch {
			/* no course */
		}
	}

	const records: UptakeRecord[] = [];
	for (const assignment of scoped) {
		const [revisions, uptakes] = await Promise.all([
			loadFeedbackRevisions(assignment.id),
			loadFeedbackUptake(assignment.id),
		]);
		const uptakeByRevision = new Map(
			uptakes.map((u) => [u.feedbackRevision, u]),
		);
		const cefr = courseCefr.get(assignment.course) || '';

		for (const rev of revisions) {
			const hintLevels = parseHintLevels(rev.hintLevelsUsed);
			const maxLevel = maxHintLevelBeforeRevision(hintLevels);
			const explicit = requiredExplicitCorrection(hintLevels);
			const uptake = uptakeByRevision.get(rev.id);
			records.push({
				uptakeJudgment: (uptake?.uptakeJudgment || '') as UptakeRecord['uptakeJudgment'],
				beforeRevisionStatus: (uptake?.beforeRevisionStatus || '') as UptakeRecord['beforeRevisionStatus'],
				afterRevisionStatus: (uptake?.afterRevisionStatus || '') as UptakeRecord['afterRevisionStatus'],
				numberOfHints: rev.numberOfHints || hintLevels.length,
				maxHintLevel: maxLevel,
				requiredExplicit: explicit,
				cefrLevel: cefr,
				assignmentId: assignment.id,
				aiCategory: '',
				aiSubcategory: '',
				model: '',
			});
		}
	}

	return computeUptakeAnalytics(records);
}

/** One pseudonymous uptake export row (no direct identifiers). */
export type UptakeExportRow = {
	participantId: string;
	feedbackItemId: string;
	originalSubmissionId: string;
	revisionSubmissionId: string;
	hintLevelsUsed: string;
	numberOfHints: string;
	revisionCreated: string;
	attributionStatus: string;
	uptakeJudgment: string;
	beforeRevisionStatus: string;
	afterRevisionStatus: string;
	reviewer: string;
	reviewDate: string;
	reviewerNote: string;
};

export const UPTAKE_CSV_HEADERS = [
	'participantId',
	'feedbackItemId',
	'originalSubmissionId',
	'revisionSubmissionId',
	'hintLevelsUsed',
	'numberOfHints',
	'revisionCreated',
	'attributionStatus',
	'uptakeJudgment',
	'beforeRevisionStatus',
	'afterRevisionStatus',
	'reviewer',
	'reviewDate',
	'reviewerNote',
] as const;

/**
 * Builds the uptake export rows for one assignment: one row per
 * feedback→revision association, pseudonymized by identityKey. No direct
 * student identifiers — the participantId is a stable P00x id assigned in
 * order of first appearance. Read-only; never writes.
 */
export async function buildUptakeExportRows(
	assignmentId: string,
): Promise<UptakeExportRow[]> {
	const [revisions, uptakes, attempts] = await Promise.all([
		loadFeedbackRevisions(assignmentId),
		loadFeedbackUptake(assignmentId),
		loadCheckAttempts(assignmentId),
	]);

	const uptakeByRevision = new Map(uptakes.map((u) => [u.feedbackRevision, u]));
	const attemptById = new Map(attempts.map((a) => [a.id, a]));

	// Pseudonymous participant ids by identityKey.
	const participantMap = new Map<string, string>();
	let n = 1;
	for (const rev of revisions) {
		const key = rev.identityKey || `anon:${rev.id}`;
		if (!participantMap.has(key)) {
			participantMap.set(key, `P${String(n).padStart(3, '0')}`);
			n += 1;
		}
	}

	return revisions.map((rev) => {
		const uptake = uptakeByRevision.get(rev.id);
		const feedbackAttempt = attemptById.get(rev.feedbackAttempt);
		const revisionAttempt = attemptById.get(rev.revisionAttempt);
		const hintLevels = parseHintLevels(rev.hintLevelsUsed);
		return {
			participantId: participantMap.get(rev.identityKey || `anon:${rev.id}`) || '',
			feedbackItemId: rev.feedbackAttempt,
			originalSubmissionId: rev.originalSubmission || feedbackAttempt?.submission || '',
			revisionSubmissionId: rev.revisionSubmission || revisionAttempt?.submission || '',
			hintLevelsUsed: JSON.stringify(hintLevels),
			numberOfHints: String(rev.numberOfHints || hintLevels.length),
			revisionCreated: revisionAttempt ? 'true' : 'false',
			attributionStatus: rev.attributionStatus || 'uncertain',
			uptakeJudgment: uptake?.uptakeJudgment || '',
			beforeRevisionStatus: uptake?.beforeRevisionStatus || '',
			afterRevisionStatus: uptake?.afterRevisionStatus || '',
			reviewer: uptake?.owner || '',
			reviewDate: uptake?.uptakeReviewedAt || '',
			reviewerNote: uptake?.uptakeNote || '',
		};
	});
}

/** CSV-escapes one field per RFC 4180. */
export function csvEscapeUptake(value: unknown): string {
	let text: string;
	if (value === null || value === undefined) text = '';
	else if (typeof value === 'boolean') text = value ? 'true' : 'false';
	else if (typeof value === 'number') text = Number.isFinite(value) ? String(value) : '';
	else text = String(value);
	if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
	return text;
}

/** Builds the uptake CSV document from ordered rows. */
export function buildUptakeCsv(rows: UptakeExportRow[]): string {
	const lines = [UPTAKE_CSV_HEADERS.join(',')];
	for (const row of rows) {
		lines.push(UPTAKE_CSV_HEADERS.map((h) => csvEscapeUptake(row[h])).join(','));
	}
	return lines.join('\r\n');
}
