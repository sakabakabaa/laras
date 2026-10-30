/**
 * Phase 10 — server-only data loading for the generic-vs-personalized
 * comparison and category-level trajectory analytics.
 *
 * Loads formative check interactions (check_attempts), personalization
 * provenance (personalization_logs), feedback→revision associations and
 * human uptake annotations (Phase 9), and validated formal-evaluation
 * findings (ai_feedback_items). Builds the normalized record sets consumed by
 * the pure `personalization-analytics` module.
 *
 * Authorization mirrors the Phase 6/7 research endpoints: the assignment
 * owner or an allowlisted researcher (RESEARCHER_USER_IDS). Students are
 * blocked by the route guard and by an explicit server-side role check.
 * Read-only — never writes, never changes grades or historical feedback.
 */
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { extractCefrLevel } from '@/lib/cefr-level';
import { activityTypeOf, type Assignment } from '@/lib/assignments';
import { parseResearcherIds, isAuthorizedExporter, isActiveRaterForAssignment } from '@/lib/research-export.server';
import { assertResearchAccess, type AnalyticsError } from '@/lib/personalization-analytics';
import type {
	InteractionRecord,
	ValidatedObservation,
} from '@/lib/personalization-analytics';

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

type CheckAttemptRow = {
	id: string;
	assignment: string;
	level?: number;
	area: string;
	identityKey: string;
	created: string;
};

type PersonalizationLogRow = {
	id: string;
	assignment: string;
	learnerKey: string;
	feedbackItemId: string;
	personalizationEnabled: boolean;
	feedbackStrategy: string;
	hintLevel: number;
	model: string;
	relevantCategories: unknown;
	generatedAt: string;
};

type FeedbackRevisionRow = {
	id: string;
	feedbackAttempt: string;
	attributionStatus: string;
};

type FeedbackUptakeRow = {
	id: string;
	feedbackAttempt: string;
	originalSubmission: string;
	revisionSubmission: string;
	uptakeJudgment: string;
	afterRevisionStatus: string;
};

type FeedbackItemRow = {
	id: string;
	origin: string;
	assignment: string;
	submission: string;
	aiCategory: string;
	aiSubcategory: string;
	detectionJudgment: string;
	adjudicationStatus: string;
	created: string;
};

type SubmissionRow = { id: string; owner: string };

async function listAll<T>(
	collection: string,
	filter: string,
	sort = 'created',
): Promise<T[]> {
	const rows: T[] = [];
	let page = 1;
	for (;;) {
		const result = await pocketbaseAdmin.listRecords<T>(collection, {
			page,
			perPage: 500,
			filter,
			sort,
		});
		rows.push(...result.items);
		if (result.items.length < 500) break;
		page += 1;
		if (page > 50) break;
	}
	return rows;
}

function parseCategories(value: unknown): string[] {
	let raw: unknown = value;
	if (typeof raw === 'string') {
		try {
			raw = JSON.parse(raw);
		} catch {
			return [];
		}
	}
	if (!Array.isArray(raw)) return [];
	return raw.map((v) => (typeof v === 'string' ? v : '').trim()).filter(Boolean);
}

export type PersonalizationAnalyticsData = {
	comparisonRecords: InteractionRecord[];
	trajectoryObservations: ValidatedObservation[];
	assignments: { id: string; title: string }[];
};

/**
 * Authorizes the caller and loads the full dataset for both Phase 10
 * analytics. The caller's own assignments are always loaded; a specific
 * assignmentId scopes the load (the owner or an allowlisted researcher may
 * view it). Read-only.
 */
export async function loadPersonalizationAnalytics(
	request: Request,
	assignmentId?: string,
): Promise<{ error: AnalyticsError } | PersonalizationAnalyticsData> {
	const auth = await authenticateUser(request);
	if ('error' in auth) return { error: auth.error };
	const { user } = auth;
	const denied = assertResearchAccess(user.role);
	if (denied) return { error: denied };

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
		const researcherIds = parseResearcherIds(process.env.RESEARCHER_USER_IDS);
		scoped = assignments.filter((a) => a.id === assignmentId);
		if (scoped.length === 0) {
			try {
				const a = await pocketbaseAdmin.getRecord<Assignment>('assignments', assignmentId);
				if (!isAuthorizedExporter(user.id, a.owner, researcherIds)) {
					return { error: { status: 403, message: 'Anda tidak berhak mengakses data riset tugas ini.' } };
				}
				scoped = [a];
			} catch {
				return { error: { status: 404, message: 'Tugas tidak ditemukan.' } };
			}
		}
	}

	if (scoped.length === 0) {
		return { comparisonRecords: [], trajectoryObservations: [], assignments: [] };
	}
	for (const assignment of scoped) {
		if (await isActiveRaterForAssignment(user.id, assignment.id)) {
			return { error: { status: 403, message: 'Rater aktif tidak dapat mengakses analitik selama putaran independen.' } };
		}
	}

	// CEFR per course.
	const courseCefr = new Map<string, string>();
	for (const courseId of Array.from(new Set(scoped.map((a) => a.course).filter(Boolean)))) {
		try {
			const course = await pocketbaseAdmin.getRecord<{ code?: string }>('courses', courseId);
			courseCefr.set(courseId, extractCefrLevel(course.code || '') || '');
		} catch {
			/* no course — CEFR stays '' */
		}
	}

	const assignmentMeta = new Map(scoped.map((a) => [a.id, a]));

	// ── Comparison records (formative feedback interactions) ──
	const comparisonRecords: InteractionRecord[] = [];
	for (const assignment of scoped) {
		const [attempts, logs, revisions, uptakes] = await Promise.all([
			listAll<CheckAttemptRow>('check_attempts', `assignment="${assignment.id}"`),
			listAll<PersonalizationLogRow>('personalization_logs', `assignment="${assignment.id}"`),
			listAll<FeedbackRevisionRow>('feedback_revisions', `assignment="${assignment.id}"`),
			listAll<FeedbackUptakeRow>('feedback_uptake', `assignment="${assignment.id}"`),
		]);

		// check_attempt id → personalization log (mode + provenance).
		const logByAttempt = new Map<string, PersonalizationLogRow>();
		for (const log of logs) {
			if (log.feedbackItemId) logByAttempt.set(log.feedbackItemId, log);
		}
		// check_attempt id → uptake outcome (via feedback_revisions.feedbackAttempt).
		const revisionByAttempt = new Map<string, FeedbackRevisionRow>();
		for (const rev of revisions) {
			if (rev.feedbackAttempt) revisionByAttempt.set(rev.feedbackAttempt, rev);
		}
		const uptakeByRevision = new Map<string, FeedbackUptakeRow>();
		for (const u of uptakes) {
			if (u.feedbackAttempt) uptakeByRevision.set(u.feedbackAttempt, u);
		}

		const cefr = courseCefr.get(assignment.course) || '';
		const shape = str(assignment.shape);

		for (const attempt of attempts) {
			const log = logByAttempt.get(attempt.id);
			const mode = log && log.personalizationEnabled ? 'personalized' : 'generic';
			const revision = revisionByAttempt.get(attempt.id);
			const uptake = revision ? uptakeByRevision.get(revision.feedbackAttempt) : undefined;
			const categories = log ? parseCategories(log.relevantCategories) : [];
			const fallbackCategory = str(attempt.area).trim();
			const cats = categories.length > 0 ? categories : fallbackCategory ? [fallbackCategory] : [];
			comparisonRecords.push({
				mode,
				assignmentId: assignment.id,
				assignmentTitle: assignment.title || '(tanpa judul)',
				shape,
				cefrLevel: cefr,
				model: log ? str(log.model) : '',
				hintLevel: num(attempt.level),
				categories: cats,
				uptakeJudgment: uptake ? str(uptake.uptakeJudgment) : '',
				afterRevisionStatus: uptake ? str(uptake.afterRevisionStatus) : '',
				hasRevision: Boolean(revision),
				createdAt: str(attempt.created),
			});
		}
	}

	// ── Trajectory observations (validated formal-evaluation findings) ──
	const trajectoryObservations: ValidatedObservation[] = [];
	for (const assignment of scoped) {
		// Only formal assignments carry validated ai_feedback_items.
		if (activityTypeOf(assignment) === 'formative') continue;
		const [items, uptakes] = await Promise.all([
			listAll<FeedbackItemRow>('ai_feedback_items', `assignment="${assignment.id}"`),
			listAll<FeedbackUptakeRow>('feedback_uptake', `assignment="${assignment.id}"`),
		]);

		// submission id → afterRevisionStatus (best-effort uptake link).
		const uptakeBySubmission = new Map<string, string>();
		for (const u of uptakes) {
			const status = str(u.afterRevisionStatus);
			if (!status) continue;
			if (u.originalSubmission) uptakeBySubmission.set(u.originalSubmission, status);
			if (u.revisionSubmission) uptakeBySubmission.set(u.revisionSubmission, status);
		}

		// submission owner → pseudonymous learner key.
		const submissionIds = Array.from(new Set(items.map((i) => str(i.submission)).filter(Boolean)));
		const ownerBySubmission = new Map<string, string>();
		for (const subId of submissionIds) {
			try {
				const sub = await pocketbaseAdmin.getRecord<SubmissionRow>('assignment_submissions', subId);
				ownerBySubmission.set(subId, str(sub.owner));
			} catch {
				/* orphaned — learner key stays '' */
			}
		}

		const cefr = courseCefr.get(assignment.course) || '';
		for (const item of items) {
			const category = str(item.aiCategory).trim();
			if (!category) continue;
			// Phase 10.2 — only reviewed/adjudicated items are validated evidence.
			// Unreviewed items (human or AI) never enter trajectory analytics.
			const adjudicated = str(item.adjudicationStatus) === 'reviewed' || str(item.adjudicationStatus) === 'adjudicated';
			if (!adjudicated) continue;
			// Validated = AI detection confirmed by expert, OR human reference error.
			const isAiValidated = str(item.origin) === 'ai' && str(item.detectionJudgment) === 'correct';
			const isHuman = str(item.origin) === 'human';
			if (!isAiValidated && !isHuman) continue;
			const subId = str(item.submission);
			trajectoryObservations.push({
				category,
				subcategory: str(item.aiSubcategory).trim(),
				learnerKey: ownerBySubmission.get(subId) || `anon:${item.id}`,
				createdAt: str(item.created),
				assignmentId: assignment.id,
				cefrLevel: cefr,
				afterRevisionStatus: uptakeBySubmission.get(subId) || '',
			});
		}
	}

	return {
		comparisonRecords,
		trajectoryObservations,
		assignments: scoped.map((a) => ({ id: a.id, title: a.title || '(tanpa judul)' })),
	};
}
