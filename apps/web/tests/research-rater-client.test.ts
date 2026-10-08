import { describe, expect, it } from 'vitest';
import { assertBlindResearchRound, projectBlindResearchItems } from '@/lib/research-rater-client';

describe('projectBlindResearchItems', () => {
  it('rejects mismatched round or assignment responses', () => {
    expect(() => assertBlindResearchRound({ ok: true, round: 2, assignedRound: 1, items: [] }, 2)).toThrow(/assignment mismatch/);
    expect(() => assertBlindResearchRound({ ok: true, round: 1, items: [] }, 2)).toThrow(/round mismatch/);
  });
  it('uses only the server-projected own-round judgment and never shared legacy fields', () => {
    const result = projectBlindResearchItems({ ok: true, round: 2, items: [{ id: 'item12345', origin: 'ai', parentAiFindingId: 'fp_abc', errorPresent: 'yes', reviewerNote: 'other rater private note', raterJudgments: [{ round: 2, detectionJudgment: 'correct', note: 'my note', reviewedAt: '2026-01-01' }] } as never] });
    expect(result.annotations.fp_abc).toMatchObject({ detectionJudgment: 'correct', reviewerNote: 'my note', reviewedAt: '2026-01-01' });
    expect(result.annotations.fp_abc.errorPresent).toBe('');
  });
  it('does not create drafts for findings without this round entry', () => {
    expect(projectBlindResearchItems({ ok: true, round: 1, items: [{ id: 'item12345', origin: 'ai', parentAiFindingId: 'fp_abc', raterJudgments: [{ round: 2, detectionJudgment: 'correct' }] }] }).annotations).toEqual({});
  });
  it('includes only human missed-error rows returned for the requested round', () => {
    const result = projectBlindResearchItems({ ok: true, round: 1, items: [{ id: 'human12345', origin: 'human', quote: 'gehe', quoteStart: 4, quoteEnd: 8, raterJudgments: [{ round: 1, detectionJudgment: 'missed', note: 'my note', reviewedAt: '2026-01-01' }] }] });
    expect(result.missedErrors).toHaveLength(1);
    expect(result.missedErrors[0]).toMatchObject({ id: 'human12345', reviewerNote: 'my note', adjudicationStatus: 'reviewed' });
  });
  it('maps human candidates from the caller round and retains judgment fields', () => {
    const result = projectBlindResearchItems({ ok: true, round: 1, items: [{ id: 'human12345', origin: 'human', quote: 'gehe', raterJudgments: [{ round: 1, note: 'own', referenceCategory: 'grammar', detectionJudgment: 'missed' }] }] });
    expect(result.missedErrors[0]).toMatchObject({ reviewerNote: 'own', referenceCategory: 'grammar', adjudicationStatus: 'reviewed' });
  });
});
