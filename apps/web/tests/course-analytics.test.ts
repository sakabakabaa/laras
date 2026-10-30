import { describe, expect, it } from 'vitest';
import { buildCourseAnalytics, type CourseAnalyticsInput } from '@/lib/course-analytics';

describe('course grading completion', () => {
 it('counts published grading status rather than default or draft numeric scores', () => {
  const input = {
   assignments: [{ id: 'task', activityType: 'formal', status: 'published', title: 'Task', session: '' }],
   submissions: [
    { id: 'a', assignment: 'task', owner: 'a', status: 'submitted', grade: 0 },
    { id: 'b', assignment: 'task', owner: 'b', status: 'late', grade: 80 },
    { id: 'c', assignment: 'task', owner: 'c', status: 'graded', grade: 0 },
   ],
   sessions: [], roster: [], accounts: [], identities: {}, subCpmks: [], attempts: [], week: 0, now: 0,
  } as unknown as CourseAnalyticsInput;
  const model = buildCourseAnalytics(input);
  expect(model.submittedCount).toBe(3);
  expect(model.graded).toBe(1);
  expect(model.gradedRate).toBe(33);
  expect(model.alerts.find(alert => alert.id === 'ungraded')?.title).toContain('2 submission');
 });
});
