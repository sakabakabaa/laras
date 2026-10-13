import { describe, expect, it } from 'vitest';
import { isCollectedSubmission, isOfficiallyGraded, needsGrading, mergeSubmissionChannels } from '@/lib/submission-state';
import { buildCourseAnalytics, type CourseAnalyticsInput } from '@/lib/course-analytics';
import { componentScore, type GradeComponent } from '@/lib/gradebook';
import type { AssignmentSubmission } from '@/lib/assignments';

function fixture(studentId?: string): CourseAnalyticsInput {
 return {
  assignments: [{ id: 'task', title: 'Task', status: 'published', activityType: 'formal', session: '', subCpmk: 'outcome' }],
  submissions: [
   { id: 'one', assignment: 'task', owner: 'one', status: 'submitted', grade: 0 },
   { id: 'two', assignment: 'task', owner: 'two', status: 'revision', grade: 75 },
   { id: 'three', assignment: 'task', owner: 'three', status: 'graded', grade: 90 },
  ],
  subCpmks: [{ id: 'outcome', code: '1' }], sessions: [], roster: [], accounts: [], attempts: [], identities: {}, week: 0, now: 0, studentId,
 } as unknown as CourseAnalyticsInput;
}

describe('official grading state across surfaces', () => {
 it('counts linked public answers only once and keeps an unlinked guest', () => {
  expect(mergeSubmissionChannels([{id:'enrolled'}], [{id:'copy',linkedSubmission:'enrolled'},{id:'guest'}])).toEqual([{id:'enrolled'},{id:'guest'}]);
 });
 it('includes returned work in the pending queue and excludes drafts', () => {
  expect(needsGrading({ status: 'revision' })).toBe(true);
  expect(needsGrading({ status: 'draft' })).toBe(false);
  expect(isCollectedSubmission({ status: 'late' })).toBe(true);
  expect(isOfficiallyGraded({ status: 'submitted' })).toBe(false);
 });
 it('excludes numeric defaults and draft scores from completion and outcomes', () => {
  const model = buildCourseAnalytics(fixture());
  expect(model.graded).toBe(1);
  expect(model.gradedRate).toBe(33);
  expect(model.subCpmk[0].percent).toBe(90);
  expect(model.taskGraded).toBe(0);
 });
 it('counts an official zero grade but does not expose an unpublished score in the gradebook', () => {
  const component = { id: 'c', kind: 'assignment', assignment: 'task', maxScore: 100 } as GradeComponent;
  const subs = new Map([['task', new Map([['one', { status: 'submitted', grade: 85 } as AssignmentSubmission]])]]);
  expect(componentScore(component, 'one', new Map(), subs).score).toBeNull();
  subs.get('task')!.set('one', { status: 'graded', grade: 0 } as AssignmentSubmission);
  expect(componentScore(component, 'one', new Map(), subs).score).toBe(0);
 });
 it('uses one student as the denominator and excludes other students from personal analytics', () => {
  const model = buildCourseAnalytics(fixture('one'));
  expect(model.expected).toBe(1);
  expect(model.collectionRate).toBe(100);
  expect(model.graded).toBe(0);
  expect(model.subCpmk[0].percent).toBeNull();
  expect(model.alerts.map(a => a.id)).toEqual(['own-grading']);
  expect(model.alerts.every(a => !a.action?.includes('mahasiswa'))).toBe(true);
 });
 it('includes public work in the lecturer grading queue while keeping roster collection scoped', () => {
  const input=fixture(); input.publicSubmissions=[{id:'guest',assignment:'task',owner:'',status:'submitted',grade:0,created:'',updated:''}];
  const model=buildCourseAnalytics(input);
  expect(model.submittedCount).toBe(4); expect(model.graded).toBe(1); expect(model.collected).toBe(3);
  expect(model.alerts.find(a=>a.id==='ungraded')?.title).toContain('3 submission');
 });
 it('links missing personal work to the student workspace even before any submission exists', () => {
  const model = buildCourseAnalytics(fixture('new-student'));
  expect(model.collectionRate).toBe(0);
  expect(model.alerts[0].href).toBe('/app/kerja/task');
 });
});
