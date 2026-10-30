import { describe, it, expect } from 'vitest';
import { validatedRubric, rubricTotal } from '@/lib/evaluation-rubric';
const criteria = [{ id: 'task', label: 'Task fulfilment', weight: 3 }, { id: 'language', label: 'Language', weight: 1 }];
describe('AI rubric validation', () => {
 it('uses criterion IDs and stored weights for the total', () => {
  const rows = validatedRubric([{ criterionId: 'task', criterion: 'wrong label', score: 80 }, { criterionId: 'language', score: 100 }], criteria);
  expect(rows[0].criterion).toBe('Task fulfilment');
  expect(rubricTotal(rows, criteria)).toBe(85);
 });
 it('does not turn incomplete rubrics into numeric grades', () => {
  expect(rubricTotal(validatedRubric([{ criterion: 'Task fulfilment', score: 80 }], criteria), criteria)).toBe(null);
 });
 it('rejects fuzzy labels, unknown IDs, duplicates, and out-of-range scores', () => {
  const rows = validatedRubric([{ criterion: 'Task', score: 100 }, { criterionId: 'unknown', criterion: 'Language', score: 80 }, { criterionId: 'task', score: 0 }, { criterionId: 'task', score: 100 }, { criterionId: 'language', score: 101 }], criteria);
  expect(rows.length).toBe(1);
  expect(rows[0].score).toBe(0);
 });
});
