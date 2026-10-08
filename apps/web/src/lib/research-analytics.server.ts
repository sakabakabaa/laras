/**
 * Phase 7 — research analytics server (lecturer/researcher-only).
 *
 * Loads validated `ai_feedback_items` research records (and the
 * `ai_evaluations` provenance they link to) and computes agreement-based
 * metrics via the pure, client-safe `research-analytics` module. It never
 * reads student answers, grades, or published feedback, and it never writes.
 *
 * Authorization mirrors the Phase 6 export: the assignment owner or an
 * allowlisted researcher (RESEARCHER_USER_IDS). Students are blocked by the
 * route guard and by an explicit server-side role check.
 */
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { extractCefrLevel } from '@/lib/cefr-level';
import { activityTypeOf, type Assignment } from '@/lib/assignments';
import { parseResearcherIds, isAuthorizedExporter, isActiveRaterForAssignment } from '@/lib/research-export.server';
import {
	assertResearchAccess,
	breakdown,
	computeSliceStats,
	normalizeRaterJudgments,
	type AnalyticsItem,
	type BreakdownRow,
	type ResearchAnalytics,
} from '@/lib/research-analytics';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

export type AnalyticsError = { status: number; message: string };

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

type EvaluationRecord = {
	id: string;
	submission: string;
	publicSubmission: string;
	model: string;
	modelVersion: string;
	promptVersion: string;
};

type CourseRecord = { id: string; code?: string };

/** Loads every ai_feedback_items row for one assignment (paginated). */
async function loadFeedbackItems(filter: string): Promise<AnalyticsItem[]> {
	const rows: AnalyticsItem[] = [];
	let page = 1;
	for (;;) {
		const result = await pocketbaseAdmin.listRecords<Record<string, unknown>>('ai_feedback_items', {
			page,
			perPage: 500,
			filter,
			sort: 'created',
		});
		for (const row of result.items) {
			rows.push({
				id: str(row.id),
				origin: str(row.origin) === 'human' ? 'human' : str(row.origin) === 'ai' ? 'ai' : '',
				adjudicationStatus: str(row.adjudicationStatus),
				evaluationId: str(row.evaluation),
				matchedReferenceId: str(row.matchedReferenceId),
				raterJudgments: normalizeRaterJudgments(row.raterJudgments),
				errorPresent: str(row.errorPresent),
				detectionJudgment: str(row.detectionJudgment),
				correctionJudgment: str(row.correctionJudgment),
				explanationJudgment: str(row.explanationJudgment),
				completenessJudgment: str(row.completenessJudgment),
				necessityJudgment: str(row.necessityJudgment),
				pedagogicalJudgment: str(row.pedagogicalJudgment),
				aiCategory: str(row.aiCategory),
				aiSubcategory: str(row.aiSubcategory),
				referenceCategory: str(row.referenceCategory),
				referenceSubcategory: str(row.referenceSubcategory),
				assignmentId: str(row.assignment),
				assignmentTitle: '',
				cefrLevel: '',
				model: '',
				promptVersion: '',
				submissionId: str(row.submission),
			});
		}
		if (result.items.length < 500) break;
		page += 1;
		if (page > 50) break;
	}
	return rows;
}

async function loadEvaluations(evalIds: string[]): Promise<Map<string, EvaluationRecord>> {
	const map = new Map<string, EvaluationRecord>();
	for (const id of evalIds) {
		if (!id || map.has(id)) continue;
		try {
			const row = await pocketbaseAdmin.getRecord<EvaluationRecord>('ai_evaluations', id);
			map.set(id, {
				id: row.id,
				submission: str(row.submission),
				publicSubmission: str(row.publicSubmission),
				model: str(row.model),
				modelVersion: str(row.modelVersion),
				promptVersion: str(row.promptVersion),
			});
		} catch {
			/* orphaned item — provenance stays empty */
		}
	}
	return map;
}

/** Attaches model + promptVersion provenance to each item from its evaluation.
 *
 *  Phase 10.2 — uses each item's EXPLICIT `evaluation` relation as the
 *  authoritative provenance source (not assignmentId+submissionId). A
 *  submission may have multiple AI evaluation runs; this preserves them
 *  as separate provenance sources. */
async function attachProvenance(items: AnalyticsItem[]): Promise<void> {
	const evalIds = Array.from(new Set(items.map((i) => i.evaluationId).filter(Boolean)));
	const evaluations = await loadEvaluations(evalIds);
	for (const item of items) {
		const evaluation = item.evaluationId ? evaluations.get(item.evaluationId) : undefined;
		if (evaluation) {
			item.model = evaluation.model || '';
			item.promptVersion = evaluation.promptVersion || '';
		}
	}
}

function emptyAnalytics(
	assignmentId: string | null,
	assignmentTitle: string | null,
	allAssignments: { id: string; title: string }[],
): ResearchAnalytics {
	const empty = computeSliceStats([]);
	return {
		scope: { assignmentId, assignmentTitle, allAssignments },
		counts: { submissionsAnalysed: 0, aiFeedbackItems: 0, humanReferenceItems: 0 },
		overall: empty,
		breakdowns: {
			byCategory: [],
			bySubcategory: [],
			byCefr: [],
			byAssignment: [],
			byModel: [],
			byPromptVersion: [],
		},
	};
}

export type AnalyticsInput = {
	assignmentId?: string;
};

/**
 * Authorizes the caller and computes the research analytics over their formal
 * assignments' `ai_feedback_items`. Read-only; never writes or changes grades.
 */
export async function computeResearchAnalytics(
	request: Request,
	input: AnalyticsInput,
): Promise<{ error: AnalyticsError } | ResearchAnalytics> {
	const auth = await authenticateUser(request);
	if ('error' in auth) return { error: auth.error };
	const { user } = auth;
	const denied = assertResearchAccess(user.role);
	if (denied) return { error: denied };

	// Load the lecturer's formal assignments (formative practice has no research items).
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
	const formalAssignments = assignments.filter((a) => activityTypeOf(a) !== 'formative');

	const assignmentId = (input.assignmentId || '').trim();
	let scoped = formalAssignments;
	if (assignmentId) {
		if (!SAFE_ID.test(assignmentId)) return { error: { status: 422, message: 'assignmentId tidak valid.' } };
		scoped = formalAssignments.filter((a) => a.id === assignmentId);
		if (scoped.length === 0) {
			// Authorization: a researcher may view an assignment they don't own.
			try {
				const a = await pocketbaseAdmin.getRecord<Assignment>('assignments', assignmentId);
				const researcherIds = parseResearcherIds(process.env.RESEARCHER_USER_IDS);
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
		return emptyAnalytics(null, null, formalAssignments.map((a) => ({ id: a.id, title: a.title || '(tanpa judul)' })));
	}
	for (const assignment of scoped) {
		if (await isActiveRaterForAssignment(user.id, assignment.id)) {
			return { error: { status: 403, message: 'Rater aktif tidak dapat mengakses analitik data riset selama putaran independen.' } };
		}
	}

	// Course codes → CEFR, keyed by assignment.course.
	const courseIds = Array.from(new Set(scoped.map((a) => a.course).filter(Boolean)));
	const courseCefr = new Map<string, string>();
	for (const courseId of courseIds) {
		try {
			const course = await pocketbaseAdmin.getRecord<CourseRecord>('courses', courseId);
			courseCefr.set(courseId, extractCefrLevel(course.code || '') || '');
		} catch {
			/* no course — CEFR stays '' */
		}
	}

	const assignmentMeta = new Map(scoped.map((a) => [a.id, a]));

	// Load items for each scoped assignment.
	const allItems: AnalyticsItem[] = [];
	for (const assignment of scoped) {
		const items = await loadFeedbackItems(`assignment="${assignment.id}"`);
		const cefr = courseCefr.get(assignment.course) || '';
		for (const item of items) {
			item.assignmentTitle = assignment.title || '(tanpa judul)';
			item.cefrLevel = cefr;
			allItems.push(item);
		}
	}

	// Attach evaluation provenance (model / promptVersion) to each item.
	await attachProvenance(allItems);

	const overall = computeSliceStats(allItems);

	const allList = formalAssignments.map((a) => ({ id: a.id, title: a.title || '(tanpa judul)' }));

	const byCategory: BreakdownRow[] = breakdown(allItems, (i) => i.aiCategory, (k) => k);
	const bySubcategory: BreakdownRow[] = breakdown(
		allItems.filter((i) => i.aiCategory),
		(i) => `${i.aiCategory} › ${i.aiSubcategory || '(tanpa subkategori)'}`,
		(k) => k,
	);
	const byCefr: BreakdownRow[] = breakdown(
		allItems,
		(i) => i.cefrLevel || 'Tanpa tingkat',
		(k) => k,
	);
	const byAssignment: BreakdownRow[] = breakdown(
		allItems,
		(i) => i.assignmentId,
		(k) => assignmentMeta.get(k)?.title || '(tugas tidak diketahui)',
	);
	const byModel: BreakdownRow[] = breakdown(
		allItems,
		(i) => i.model || 'Tidak diketahui',
		(k) => k,
	);
	const byPromptVersion: BreakdownRow[] = breakdown(
		allItems,
		(i) => i.promptVersion || 'Tidak diketahui',
		(k) => k,
	);

	return {
		scope: {
			assignmentId: assignmentId || null,
			assignmentTitle: assignmentId ? assignmentMeta.get(assignmentId)?.title || null : null,
			allAssignments: allList,
		},
		counts: {
			submissionsAnalysed: overall.submissions,
			aiFeedbackItems: overall.aiItems,
			humanReferenceItems: overall.humanItems,
		},
		overall,
		breakdowns: { byCategory, bySubcategory, byCefr, byAssignment, byModel, byPromptVersion },
	};
}
