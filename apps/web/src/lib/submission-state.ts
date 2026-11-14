/** Official grading is a workflow state, never inferred from a numeric/AI draft score. */
export function isCollectedSubmission(row: { status: string }) {
 return ['submitted', 'late', 'revision', 'graded'].includes(row.status);
}
export function isOfficiallyGraded(row: { status: string }) { return row.status === 'graded'; }
export function needsGrading(row: { status: string }) {
 return isCollectedSubmission(row) && !isOfficiallyGraded(row);
}
