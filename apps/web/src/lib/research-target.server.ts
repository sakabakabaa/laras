import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { activityTypeOf, type Assignment } from '@/lib/assignments';
import { taskKindForShape } from '@/lib/task-types';
import type { RaterRound } from '@/lib/research-rater';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;
export type ResearchTargetBody = { submissionId?: unknown; round?: unknown };
export type ResearchError = { status: number; message: string };
export type ResearchTarget = { user: { id: string }; assignment: Assignment; recordId: string; content: string; round: RaterRound };

/** Deliberately separate from grade/review/publish authorization. No implicit owner override. */
export async function loadResearchTarget(request: Request, body: ResearchTargetBody): Promise<{ error: ResearchError } | { target: ResearchTarget }> {
 const auth = await authenticateUser(request);
 if ('error' in auth) return { error: auth.error };
 const round = body.round === undefined ? 1 : body.round;
 if (round !== 0 && round !== 1 && round !== 2) return { error: { status: 422, message: 'Round must be 0, 1 or 2.' } };
 const recordId = body.submissionId;
 if (typeof recordId !== 'string' || !SAFE_ID.test(recordId)) return { error: { status: 422, message: 'Invalid submission ID.' } };
 let row: { assignment: string; content?: string; transcript?: string; transcriptStatus?: string };
 let assignment: Assignment;
 try {
  row = await pocketbaseAdmin.getRecord('assignment_submissions', recordId);
  assignment = await pocketbaseAdmin.getRecord<Assignment>('assignments', row.assignment);
 } catch { return { error: { status: 404, message: 'Research target not found.' } }; }
 if (!SAFE_ID.test(assignment.id) || !SAFE_ID.test(auth.user.id)) return { error: { status: 403, message: 'Invalid research identity.' } };
 let memberships: { reviewer: string; round: string; active: boolean }[];
 try {
  memberships = (await pocketbaseAdmin.listRecords<{ reviewer: string; round: string; active: boolean }>('research_rater_assignments', {
   filter: `assignment="${assignment.id}" && reviewer="${auth.user.id}" && active=true`, perPage: 3,
  })).items;
 } catch { return { error: { status: 503, message: 'Research authorization unavailable.' } }; }
 if (memberships.length !== 1 || memberships[0].reviewer !== auth.user.id || memberships[0].round !== String(round) || !memberships[0].active) {
  return { error: { status: 403, message: 'Not assigned to this research round.' } };
 }
 if (activityTypeOf(assignment) === 'formative') return { error: { status: 422, message: 'Research annotations require a formal task.' } };
 const content = taskKindForShape(assignment.shape) === 'speaking'
  ? row.transcriptStatus === 'ready' ? row.transcript || '' : '' : row.content || '';
 return { target: { user: { id: auth.user.id }, assignment, recordId, content, round: round as RaterRound } };
}
