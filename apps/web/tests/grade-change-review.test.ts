import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GradeChangeReview, gradeCommandRequest } from '../src/components/app/grade-change-review';

describe('grade proposal review', () => {
 it('shows exact persisted before/after, NIM, revision and payload hash', () => {
  const html = renderToStaticMarkup(createElement(GradeChangeReview, { proposal: { id: 'op1', course: 'c1', revision: 3, payloadHash: 'exact-hash', status: 'awaiting_approval', items: [{ componentId: 'component1', studentId: 'student1', baseline: { student: { nim: '20260001' } }, operations: [{ op: 'set_score', score: 0 }], before: { value: 70, note: 'Old note' }, after: { value: 0, note: 'New note' } }], result: null }, students: [{ id: 'student1', nim: 'changed-nim', name: 'Student A' }], components: [{ id: 'component1', name: 'Exam', maxScore: 100 }], courseLabel: 'Course / section A', onApprove: async () => {}, onClose: () => {} }));
  for (const text of ['20260001', 'Student A', 'exact-hash', '70', 'New note', 'Course / section A', 'Exam', 'Source', 'Awaiting review']) expect(html).toContain(text);
 });
 it('shows conflict as non-success and does not offer approval', () => {
  const html = renderToStaticMarkup(createElement(GradeChangeReview, { proposal: { id: 'op1', course: 'c1', revision: 3, payloadHash: 'hash', status: 'conflicted', items: [], result: null }, students: [], components: [], courseLabel: 'Course', onApprove: async () => {}, onClose: () => {} }));
  expect(html).toContain('cannot be applied'); expect(html).not.toContain('Approve and save');
 });
 it('does not report raw stale exceptions as successful saves', async () => {
  const fetcher = vi.fn(async () => Response.json({ error: 'secret database payload' }, { status: 409 }));
  await expect(gradeCommandRequest('token', { action: 'apply' }, fetcher)).rejects.toThrow('review a new proposal');
 });
 it('sends only an explicit reviewed reference when approving', async () => {
  const fetcher = vi.fn(async () => Response.json({ proposal: { id: 'op1' } }));
  await gradeCommandRequest('token', { action: 'approve', proposalId: 'op1', revision: 3, payloadHash: 'hash', explicitAction: 'approve' }, fetcher);
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('/api/gradebook-commands');
  expect(init.headers).toMatchObject({ Authorization: 'Bearer token', 'X-Laras-Grade-Action': 'review' });
  expect(JSON.parse(init.body as string)).toEqual({ action: 'approve', proposalId: 'op1', revision: 3, payloadHash: 'hash', explicitAction: 'approve' });
 });
});
