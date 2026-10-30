import { EMPTY_ANNOTATION, type HumanMissedError, type ResearchAnnotation } from '@/lib/research-annotation';

export type BlindResearchLoad = {
  ok: true;
  round: 0 | 1 | 2;
  assignedRound?: 0 | 1 | 2;
  items: Array<{
    id: string;
    origin: string;
    parentAiFindingId?: string;
    quote?: string;
    quoteStart?: number;
    quoteEnd?: number;
    anchorValid?: boolean;
    raterJudgments: Array<Record<string, unknown>>;
  }>;
};

/** Reject malformed or mismatched server assignment responses. */
export function assertBlindResearchRound(data: BlindResearchLoad, requestedRound: 0 | 1 | 2): void {
  if (data.ok !== true || data.round !== requestedRound) throw new Error('Blind research round mismatch.');
  if (data.assignedRound !== undefined && data.assignedRound !== requestedRound) throw new Error('Blind research assignment mismatch.');
}

/** Maps only the server-projected current-round judgment into UI drafts. */
export function projectBlindResearchItems(data: BlindResearchLoad): {
  annotations: Record<string, ResearchAnnotation>;
  missedErrors: HumanMissedError[];
} {
  const annotations: Record<string, ResearchAnnotation> = {};
  const missedErrors: HumanMissedError[] = [];
  for (const item of data.items) {
    const judgment = item.raterJudgments.find((entry) => entry.round === data.round);
    if (!judgment) continue;
    if (item.origin === 'human') {
      missedErrors.push({
        id: item.id, quote: item.quote ?? '', quoteStart: item.quoteStart ?? 0,
        quoteEnd: item.quoteEnd ?? 0, anchorValid: item.anchorValid ?? false,
        adjudicationStatus: data.round === 0 ? 'adjudicated' : 'reviewed',
        referenceCategory: (judgment.referenceCategory as string) ?? '',
        referenceSubcategory: (judgment.referenceSubcategory as string) ?? '',
        referenceSeverity: (judgment.referenceSeverity as HumanMissedError['referenceSeverity']) ?? '',
        referenceCorrection: (judgment.referenceCorrection as string) ?? '',
        referenceExplanation: (judgment.referenceExplanation as string) ?? '',
        reviewerNote: (judgment.note as string) ?? '',
        reviewedAt: (judgment.reviewedAt as string) ?? '',
        created: (judgment.reviewedAt as string) ?? '',
      });
      continue;
    }
    const fingerprint = item.parentAiFindingId ?? '';
    if (!fingerprint) continue;
    annotations[fingerprint] = {
      ...EMPTY_ANNOTATION,
      id: item.id,
      parentAiFindingId: fingerprint,
      errorPresent: (judgment.errorPresent as ResearchAnnotation['errorPresent']) ?? '',
      detectionJudgment: (judgment.detectionJudgment as ResearchAnnotation['detectionJudgment']) ?? '',
      correctionJudgment: (judgment.correctionJudgment as ResearchAnnotation['correctionJudgment']) ?? '',
      explanationJudgment: (judgment.explanationJudgment as ResearchAnnotation['explanationJudgment']) ?? '',
      completenessJudgment: (judgment.completenessJudgment as ResearchAnnotation['completenessJudgment']) ?? '',
      necessityJudgment: (judgment.necessityJudgment as ResearchAnnotation['necessityJudgment']) ?? '',
      pedagogicalJudgment: (judgment.pedagogicalJudgment as ResearchAnnotation['pedagogicalJudgment']) ?? '',
      referenceCategory: (judgment.referenceCategory as string) ?? '',
      referenceSubcategory: (judgment.referenceSubcategory as string) ?? '',
      referenceSeverity: (judgment.referenceSeverity as ResearchAnnotation['referenceSeverity']) ?? '',
      referenceCorrection: (judgment.referenceCorrection as string) ?? '',
      referenceExplanation: (judgment.referenceExplanation as string) ?? '',
      reviewerNote: (judgment.note as string) ?? '',
      adjudicationStatus: data.round === 0 ? 'adjudicated' : 'reviewed',
      reviewedAt: (judgment.reviewedAt as string) ?? '',
    };
  }
  return { annotations, missedErrors };
}
