import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import {
	createReleasePreview,
	publishRelease,
	GradeReleaseError,
	type PublishedRelease,
	type ReleasePreview,
} from '@/lib/gradebook/publication.server';

/**
 * Grade RELEASE endpoint: preview a course final-grade release and publish an
 * approved one.
 *
 * Same posture as `api.gradebook-commands.ts`, and for the same reasons:
 *
 *  - POST only. `/api/*` GETs are cached by URL at the platform edge, so an
 *    authenticated read must never be a GET.
 *  - Exact `Origin` match (missing Origin fails closed) plus a non-simple
 *    custom header (`X-Laras-Grade-Action`) plus a JSON content type. Together
 *    those defeat cross-site form and cookie-based CSRF: a cross-origin page
 *    cannot set the custom header and cannot forge Origin.
 *  - Bearer authentication, faculty role, and course ownership checked here as
 *    well as inside the service.
 *  - Publication requires an explicit `explicitAction: 'publish'` plus the exact
 *    revision and hash the lecturer reviewed; a bare `approved: true` or a
 *    client-recomputed payload is never accepted.
 *
 * The `X-Laras-Grade-Action` value is `release`; `review` is also accepted so
 * the shared review panel (which sends `review`) can drive publication without
 * a second client.
 */

const RELEASE_ACTION_HEADERS = ['release', 'review'];
const COURSE_ID = /^[a-zA-Z0-9]{5,40}$/;
const APPROVAL_HASH = /^(sha256:)?[0-9a-f]{64}$/;

const failure = (error: unknown): Response => {
	if (error instanceof GradeReleaseError) {
		const body: Record<string, unknown> = { error: error.message, code: error.code };
		if (error.issues.length) body.issues = error.issues.map((issue) => ({ code: issue.code, message: issue.message }));
		return json(body, { status: error.status });
	}
	const status = Number((error as { status?: number })?.status);
	// Never surface raw database exceptions, grades or student data.
	return json(
		{
			error:
				status === 409
					? 'The reviewed release changed. Prepare and review a new preview.'
					: 'The grade release could not complete. Reload the course before retrying.',
			code: status === 409 ? 'stale_release' : 'grade_release_failed',
		},
		{ status: [400, 401, 403, 404, 409, 422].includes(status) ? status : 503 },
	);
};

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');
	if (
		request.headers.get('Origin') !== new URL(request.url).origin ||
		request.headers.get('Sec-Fetch-Site') === 'cross-site' ||
		!RELEASE_ACTION_HEADERS.includes(String(request.headers.get('X-Laras-Grade-Action') ?? '')) ||
		!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')
	) {
		return apiError(403, 'A same-origin grade release request is required.');
	}

	const auth = await authenticateUser(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	if (auth.user.role !== 'faculty') return apiError(403, 'Faculty access required.');

	const body = await readJsonBody<Record<string, unknown>>(request);
	if (!body || typeof body !== 'object' || Array.isArray(body)) return apiError(422, 'Invalid command.');
	const command = String(body.action ?? '');
	if (command !== 'preview' && command !== 'publish') return apiError(422, 'Unknown grade release action.');
	if (typeof body.courseId !== 'string' || !COURSE_ID.test(body.courseId)) {
		return apiError(422, 'A course is required.');
	}
	const courseId = body.courseId;

	// Ownership is checked here AND inside the service (defence in depth: the
	// service is also reachable from tools that never pass through this route).
	const course = await pocketbaseAdmin.getRecord<{ owner: string }>('courses', courseId).catch((error: unknown) => {
		if (Number((error as { status?: number })?.status) === 404) return null;
		throw error;
	});
	if (!course) return apiError(404, 'The course was not found.');
	if (course.owner !== auth.user.id) return apiError(403, 'Only the course owner can publish grades.');

	try {
		if (command === 'preview') {
			const preview: ReleasePreview = await createReleasePreview(pocketbaseAdmin, {
				courseId,
				ownerId: auth.user.id,
			});
			return json({ preview });
		}

		// Publication is a separate, explicitly approved action bound to the
		// exact revision and SHA-256 the lecturer reviewed.
		if (body.explicitAction !== 'publish') {
			return apiError(422, 'Explicit publication approval is required.');
		}
		if (!Number.isInteger(body.revision) || Number(body.revision) < 1) {
			return apiError(422, 'The exact reviewed revision is required.');
		}
		if (typeof body.expectedHash !== 'string' || !APPROVAL_HASH.test(body.expectedHash.toLowerCase())) {
			return apiError(422, 'The exact reviewed release hash is required.');
		}

		const release: PublishedRelease = await publishRelease(pocketbaseAdmin, {
			courseId,
			ownerId: auth.user.id,
			revision: Number(body.revision),
			expectedHash: body.expectedHash,
			reason: typeof body.reason === 'string' ? body.reason : '',
		});
		return json({ release });
	} catch (error) {
		return failure(error);
	}
});
