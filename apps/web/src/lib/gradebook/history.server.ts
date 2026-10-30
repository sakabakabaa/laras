import type PocketBase from 'pocketbase';
import { requireGradebookFaculty } from './authorization.server';
export { prepareGradeRevert } from './commands.server';

export type GradeChangeEvent = { id: string; owner: string; course: string; changeSet: string; action: string; source: 'ui' | 'assistant_input' | 'import'; actor: string; operationKey: string; snapshot: unknown; created: string };
/** Bounded owner-only history. Guarded reverts are prepared by the DB endpoint. */
export async function getGradeChangeHistory(pb: PocketBase, input: { courseId: string; proposalId?: string; page?: number; perPage?: number }) {
 const owner = requireGradebookFaculty(pb);
 const page = input.page ?? 1, perPage = input.perPage ?? 25;
 if (!Number.isInteger(page) || page < 1 || !Number.isInteger(perPage) || perPage < 1 || perPage > 100) throw new Error('History pagination must be 1–100 rows.');
 const filter = pb.filter('owner={:owner} && course={:course}' + (input.proposalId ? ' && changeSet={:proposal}' : ''), { owner, course: input.courseId, proposal: input.proposalId || '' });
 return pb.collection('grade_change_events').getList<GradeChangeEvent>(page, perPage, { filter, sort: '-created,-id', requestKey: null });
}
