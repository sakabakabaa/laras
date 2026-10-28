import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { prepareGradeChanges, approveGradeChanges, rejectGradeChanges, applyGradeChanges, getGradeChangeStatus, reconcileGradeChanges } from '@/lib/gradebook/commands.server';

/** Browser-only approval bridge. Never register approval as an assistant tool. */
export const action = withApi(async ({ request }) => {
 if (request.method !== 'POST') return apiError(405, 'Method not allowed');
 // Bearer authentication plus a non-simple custom header and exact Origin check
 // prevents cross-site forms and cookie-based CSRF. Missing Origin fails closed.
 if (request.headers.get('Origin') !== new URL(request.url).origin ||
     request.headers.get('Sec-Fetch-Site') === 'cross-site' ||
     request.headers.get('X-Laras-Grade-Action') !== 'review' ||
     !request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
  return apiError(403, 'A same-origin grade review request is required.');
 }
 const auth = await authenticateUser(request);
 if ('error' in auth) return apiError(auth.error.status, auth.error.message);
 if (auth.user.role !== 'faculty') return apiError(403, 'Faculty access required.');
 const body = await readJsonBody<Record<string, unknown>>(request);
 if (!body || typeof body !== 'object' || Array.isArray(body)) return apiError(422, 'Invalid command.');
 const command = body.action;
 if (!['prepare', 'approve', 'reject', 'apply', 'status', 'reconcile'].includes(String(command))) return apiError(422, 'Unknown grade command.');
 try {
  let courseId: string;
  if (command === 'prepare') {
   if (typeof body.courseId !== 'string' || typeof body.operationKey !== 'string' || !body.operationKey || !Array.isArray(body.items) || !body.items.length || body.items.length > 200) return apiError(422, 'A course, operation key and 1–200 changes are required.');
   courseId = body.courseId;
  } else {
   if (typeof body.proposalId !== 'string' || !body.proposalId) return apiError(422, 'A proposal is required.');
   const proposal = await pocketbaseAdmin.getRecord<{ owner: string; course: string }>('grade_change_sets', body.proposalId);
   if (proposal.owner !== auth.user.id) return apiError(403, 'This proposal belongs to another lecturer.');
   courseId = proposal.course;
  }
  const course = await pocketbaseAdmin.getRecord<{ owner: string }>('courses', courseId);
  if (course.owner !== auth.user.id) return apiError(403, 'Only the course owner can change grades.');
  if (command === 'prepare') {
   // Source and owner are derived here, never trusted from browser input.
   const proposal = await prepareGradeChanges(auth.pb, { courseId, operationKey: body.operationKey as string, source: 'ui', items: body.items as Parameters<typeof prepareGradeChanges>[1]['items'] });
   return json({ proposal });
  }
  const proposalId = body.proposalId as string;
  if (command === 'status') return json({ proposal: await getGradeChangeStatus(auth.pb, { proposalId }) });
  if (command === 'reconcile') return json({ proposal: await reconcileGradeChanges(auth.pb, { proposalId }) });
  if (!Number.isInteger(body.revision) || Number(body.revision) < 1 || typeof body.payloadHash !== 'string' || !body.payloadHash) return apiError(422, 'The exact reviewed revision and hash are required.');
  const ref = { proposalId, revision: body.revision as number, payloadHash: body.payloadHash };
  if (command === 'reject') {
   if (body.explicitAction !== 'reject') return apiError(422, 'Explicit lecturer rejection is required.');
   return json({ proposal: await rejectGradeChanges(auth.pb, ref) });
  }
  if (command === 'approve') {
   if (body.explicitAction !== 'approve') return apiError(422, 'Explicit lecturer approval is required.');
   return json({ proposal: await approveGradeChanges({ ownerId: auth.user.id, ...ref }) });
  }
  return json({ proposal: await applyGradeChanges(auth.pb, ref) });
 } catch (error) {
  const status = Number((error as { status?: number })?.status);
  // Do not expose raw database exceptions or student data in diagnostics.
  return json({ error: status === 409 ? 'The reviewed grades changed. Prepare and review a new proposal.' : status === 404 ? 'The grade proposal or course was not found.' : 'The grade command could not complete. Check its persisted status before retrying.', code: status === 409 ? 'stale_proposal' : 'grade_command_failed' }, { status: [400, 401, 403, 404, 409, 422].includes(status) ? status : 503 });
 }
});
