/** Official grading is a workflow state, never inferred from a numeric/AI draft score. */
export function isCollectedSubmission(row: { status: string }) {
 return ['submitted', 'late', 'revision', 'graded'].includes(row.status);
}
export function isOfficiallyGraded(row: { status: string }) { return row.status === 'graded'; }
export function needsGrading(row: { status: string }) {
 return isCollectedSubmission(row) && !isOfficiallyGraded(row);
}

/** A public answer linked into an enrolled record is the same submission, not a second participant. */
export function mergeSubmissionChannels<T extends { id: string }>(enrolled: T[], publicRows: (T & { linkedSubmission?: string })[]): T[] {
 const enrolledIds = new Set(enrolled.map(row => row.id));
 return [...enrolled, ...publicRows.filter(row => !row.linkedSubmission || !enrolledIds.has(row.linkedSubmission))];
}
