/** Stable rubric matching. Legacy drafts may use exact labels, never partial matches. */
export type Criterion = { id?: string; label: string; weight: number };
export type CriterionResult = { criterionId?: string; criterion: string; score: number; note: string };
export function matchCriterion(row: { criterionId?: string; criterion?: string }, criteria: Criterion[]) {
 if (row.criterionId) return criteria.find(c => c.id === row.criterionId);
 const label = row.criterion?.trim().toLowerCase();
 const matches = criteria.filter(c => c.label.trim().toLowerCase() === label);
 return matches.length === 1 ? matches[0] : undefined;
}
export function validatedRubric(raw: unknown, criteria: Criterion[]): CriterionResult[] {
 if (!Array.isArray(raw)) return [];
 const results: CriterionResult[] = [], used = new Set<Criterion>();
 for (const item of raw) {
  if (!item || typeof item !== 'object') continue;
  const row = item as Record<string, unknown>;
  const match = matchCriterion({ criterionId: typeof row.criterionId === 'string' ? row.criterionId : undefined, criterion: typeof row.criterion === 'string' ? row.criterion : '' }, criteria);
  if (!match || used.has(match) || typeof row.score !== 'number' || !Number.isFinite(row.score) || row.score < 0 || row.score > 100) continue;
  used.add(match);
  results.push({ criterionId: match.id, criterion: match.label, score: Math.round(row.score), note: typeof row.note === 'string' ? row.note.trim().slice(0, 400) : '' });
 }
 return results;
}
export function rubricTotal(rows: CriterionResult[], criteria: Criterion[]): number | null {
 const weighted = criteria.filter(c => c.weight > 0);
 if (!weighted.length) return null;
 const matched = weighted.map(c => rows.filter(r => matchCriterion(r, criteria) === c));
 if (matched.some(rows => rows.length !== 1)) return null;
 const totalWeight = weighted.reduce((sum,c) => sum+c.weight,0);
 return Math.round(weighted.reduce((sum,c,i) => sum+matched[i][0].score*c.weight,0)/totalWeight);
}
