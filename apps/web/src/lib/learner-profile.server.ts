/**
 * Phase 10 — server-side learner profile builder.
 *
 * Loads ONLY human-validated or sufficiently reliable error evidence for one
 * learner and aggregates it into a `LearnerProfile`. A profile is never built
 * from a single unverified AI finding:
 *   - human-origin `ai_feedback_items` (lecturer reference errors / missed
 *     errors) — these are confirmed errors the learner made;
 *   - AI-origin items the lecturer explicitly confirmed
 *     (`detectionJudgment = 'correct'`).
 *
 * The taxonomy labels come from the controlled `FEEDBACK_TAXONOMY`. No raw
 * student answer text, grade, or internal model confidence is stored on the
 * profile — only category/subcategory/severity counts and timestamps.
 *
 * Reads are scoped by the superuser client; authorization (who may view a
 * profile) is enforced by the calling route, not here.
 */
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import {
	buildLearnerProfile,
	type LearnerObservation,
	type LearnerProfile,
} from '@/lib/learner-profile';
import { isValidTaxonomy, isValidatedForPersonalization } from '@/lib/ai-evaluation';

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

type FeedbackItemRow = {
	id: string;
	origin: string;
	assignment: string;
	submission: string;
	aiCategory: string;
	aiSubcategory: string;
	aiSeverity: string;
	referenceCategory: string;
	referenceSubcategory: string;
	referenceSeverity: string;
	detectionJudgment: string;
	adjudicationStatus: string;
	created: string;
};

type SubmissionRow = { id: string; owner: string };

/** Loads the enrolled submission owner for each submission id. */
async function loadSubmissionOwners(submissionIds: string[]): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	for (const id of submissionIds) {
		if (!id || map.has(id)) continue;
		try {
			const row = await pocketbaseAdmin.getRecord<SubmissionRow>('assignment_submissions', id);
			map.set(id, str(row.owner));
		} catch {
			/* deleted submission — owner stays '' */
		}
	}
	return map;
}

/**
 * Loads validated error observations for one enrolled learner across the
 * lecturer's formal assignments. Phase 10.2 — only reviewed/adjudicated
 * evidence is included:
 *  A. human-origin items with adjudicationStatus in ('reviewed','adjudicated');
 *  B. AI-origin items with detectionJudgment='correct' AND adjudicationStatus
 *     in ('reviewed','adjudicated').
 * Unreviewed items (human or AI) NEVER enter personalization.
 */
async function loadValidatedObservations(
	learnerUserId: string,
	assignmentIds: string[],
): Promise<{ observations: LearnerObservation[]; improvingKeys: Set<string> }> {
	if (!learnerUserId || assignmentIds.length === 0) {
		return { observations: [], improvingKeys: new Set() };
	}

	// Resolve which submissions belong to this learner.
	const submissionIds = new Set<string>();
	for (const assignmentId of assignmentIds) {
		let page = 1;
		for (;;) {
			const result = await pocketbaseAdmin.listRecords<SubmissionRow>('assignment_submissions', {
				page,
				perPage: 200,
				filter: `assignment="${assignmentId}" && owner="${learnerUserId}"`,
			});
			for (const row of result.items) submissionIds.add(row.id);
			if (result.items.length < 200) break;
			page += 1;
			if (page > 20) break;
		}
	}
	if (submissionIds.size === 0) return { observations: [], improvingKeys: new Set() };

	const observations: LearnerObservation[] = [];
	const improvingKeys = new Set<string>();

	for (const submissionId of submissionIds) {
		let page = 1;
		for (;;) {
			const result = await pocketbaseAdmin.listRecords<FeedbackItemRow>('ai_feedback_items', {
				page,
				perPage: 500,
				filter: `submission="${submissionId}"`,
				sort: 'created',
			});
			for (const row of result.items) {
				// Phase 10.2 — only reviewed/adjudicated items are validated evidence.
				// Unreviewed items (human or AI) NEVER enter personalization.
				if (!isValidatedForPersonalization({
					origin: str(row.origin),
					detectionJudgment: str(row.detectionJudgment),
					adjudicationStatus: str(row.adjudicationStatus),
				})) continue;
				const isHuman = str(row.origin) === 'human';
				// Use the reference taxonomy for human items, the AI taxonomy for
				// confirmed AI items. Both are validated at this point.
				const category = isHuman ? str(row.referenceCategory) : str(row.aiCategory);
				const subcategory = isHuman ? str(row.referenceSubcategory) : str(row.aiSubcategory);
				const severity = isHuman ? str(row.referenceSeverity) : str(row.aiSeverity);
				if (!category || !isValidTaxonomy(category, subcategory)) continue;
				observations.push({
					category,
					subcategory,
					severity,
					assignmentId: str(row.assignment),
					createdAt: str(row.created),
				});
			}
			if (result.items.length < 500) break;
			page += 1;
			if (page > 20) break;
		}
	}

	// Uptake evidence (improving patterns): feedback_uptake records a
	// successful_uptake judgment at the submission/revision level, but carries
	// no controlled-taxonomy category. Mapping it to a specific (category,
	// subcategory) would require joining feedback_revisions → check_attempts
	// and parsing the free-text `area` field, which is not reliable enough to
	// treat as validated. Per the research design ("the exact statistical
	// model can be implemented later"), improvingKeys stays empty for now —
	// patterns are never falsely marked "improving". The pure aggregator
	// supports improvingKeys when a future phase adds a reliable mapping.
	return { observations, improvingKeys };
}

/**
 * Build a learner profile from validated evidence across the given formal
 * assignments. Returns null when there is no validated evidence at all —
 * the caller then falls back to generic feedback.
 */
export async function buildLearnerProfileForUser(input: {
	learnerUserId: string;
	assignmentIds: string[];
	threshold: number;
}): Promise<LearnerProfile | null> {
	const { observations, improvingKeys } = await loadValidatedObservations(
		input.learnerUserId,
		input.assignmentIds,
	);
	if (observations.length === 0) return null;
	return buildLearnerProfile(observations, input.threshold, improvingKeys);
}

/**
 * Resolve the learner user id for an enrolled check. The check_attempts
 * identityKey for enrolled students is `u:<userId>`; this extracts the id.
 * Returns '' for public participants (personalization is enrolled-only).
 */
export function enrolledUserIdFromKey(identityKey: string): string {
	const key = (identityKey || '').trim();
	if (key.startsWith('u:')) return key.slice(2);
	return '';
}
