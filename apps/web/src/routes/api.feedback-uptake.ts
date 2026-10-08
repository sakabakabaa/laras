/**
 * POST /api/feedback-uptake — Phase 9 lecturer/researcher-only feedback
 * uptake and revision analytics.
 *
 * Actions:
 * - `list`          — load check-attempt chains, existing associations, and
 *                     uptake annotations for one assignment (lecturer view).
 * - `save-association` — create/update a feedback→revision association
 *                     (attribution defaults to 'uncertain'; never assumes
 *                     causality).
 * - `save-uptake`   — create/update a HUMAN-ONLY uptake annotation. AI never
 *                     assigns uptake judgments.
 * - `analytics`     — aggregate uptake metrics for the research dashboard.
 *
 * Faculty-only; ownership-verified server-side. Never writes grades, never
 * exposes research judgments to students. All POST (never cached).
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import {
	loadUptakeView,
	saveAssociation,
	saveUptakeAnnotation,
	computeUptakeAnalyticsForUser,
	responseTextOf,
	type UptakeError,
} from '@/lib/feedback-uptake.server';
import { errorMessage } from '@/lib/learning';

type Body = {
	action?: string;
	assignmentId?: string;
	feedbackAttemptId?: string;
	revisionAttemptId?: string;
	attributionStatus?: string;
	originalSubmissionId?: string;
	revisionSubmissionId?: string;
	feedbackRevisionId?: string;
	uptakeJudgment?: string;
	beforeRevisionStatus?: string;
	afterRevisionStatus?: string;
	uptakeNote?: string;
};

const toError = (e: UptakeError) => apiError(e.status, e.message);

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const act = (body.action || '').trim();

	if (act === 'list') {
		const assignmentId = (body.assignmentId || '').trim();
		if (!assignmentId) return apiError(422, 'assignmentId wajib diisi.');
		const result = await loadUptakeView(request, assignmentId);
		if ('error' in result) return toError(result.error);
		// Serialize check attempts with extracted response text for the UI.
		return json({
			assignment: {
				id: result.assignment.id,
				title: result.assignment.title,
				shape: result.assignment.shape,
				mode: result.assignment.mode,
				activityType: result.assignment.activityType,
			},
			cefrLevel: result.cefrLevel,
			participants: result.participants.map((p) => ({
				identityKey: p.identityKey,
				participantName: p.participantName,
				channel: p.channel,
				attempts: p.attempts.map((a) => ({
					id: a.id,
					attempt: a.attempt,
					level: a.level ?? null,
					area: a.area,
					feedback: a.feedback,
					evidence: a.evidence,
					focus: a.focus,
					requestedNextHint: a.requestedNextHint,
					revisionSubmitted: a.revisionSubmitted,
					revisesAttempt: a.revisesAttempt,
					created: a.created,
					responseText: responseTextOf(a.responseSnapshot),
					submission: a.submission,
				})),
			})),
			associations: result.associations,
			annotations: result.annotations,
		});
	}

	if (act === 'save-association') {
		const result = await saveAssociation(request, {
			assignmentId: body.assignmentId || '',
			feedbackAttemptId: body.feedbackAttemptId || '',
			revisionAttemptId: body.revisionAttemptId || '',
			attributionStatus: body.attributionStatus || 'uncertain',
			originalSubmissionId: body.originalSubmissionId,
			revisionSubmissionId: body.revisionSubmissionId,
		});
		if ('error' in result) return toError(result.error);
		return json({ ok: true, id: result.id });
	}

	if (act === 'save-uptake') {
		try {
			const result = await saveUptakeAnnotation(request, {
				assignmentId: body.assignmentId || '',
				feedbackRevisionId: body.feedbackRevisionId || '',
				feedbackAttemptId: body.feedbackAttemptId,
				originalSubmissionId: body.originalSubmissionId,
				revisionSubmissionId: body.revisionSubmissionId,
				uptakeJudgment: body.uptakeJudgment || '',
				beforeRevisionStatus: body.beforeRevisionStatus,
				afterRevisionStatus: body.afterRevisionStatus,
				uptakeNote: body.uptakeNote,
			});
			if ('error' in result) return toError(result.error);
			return json({ ok: true, id: result.id });
		} catch (err) {
			return apiError(422, errorMessage(err));
		}
	}

	if (act === 'analytics') {
		const result = await computeUptakeAnalyticsForUser(request, body.assignmentId || undefined);
		if ('error' in result) return toError(result.error);
		return json(result);
	}

	return apiError(422, 'Aksi tidak dikenal (list, save-association, save-uptake, analytics).');
});
