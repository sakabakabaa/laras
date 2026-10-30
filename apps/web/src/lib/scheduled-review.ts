export function formatScheduledResponse(activity: any, attempt?: any): string {
  if (attempt === undefined && activity && Object.prototype.hasOwnProperty.call(activity, 'answers')) {
    attempt = activity;
  }
  const answers = attempt?.answers || {};
  const lines: string[] = [];
  const sheet = activity?.worksheet;
  const keyItems: Record<string, any> = sheet?.answerKey?.items || {};
  for (const item of sheet?.items || []) {
    lines.push(String(item.prompt || ''));
    const response = answers.responses?.[item.id];
    const shown = response === undefined || response === null || response === '' ? 'Belum dijawab' : String(response);
    lines.push(shown);
    const key = keyItems[item.id];
    if (key && shown !== 'Belum dijawab') {
      if (key.mode === 'exact' && Array.isArray(key.accepted)) {
        const want = key.accepted.map(String).join(' / ');
        const ok = key.accepted.map(String).some((a: string) => a.trim().toLowerCase() === shown.trim().toLowerCase());
        lines.push((ok ? '✓ Benar' : '✗ Salah') + ' · Kunci: ' + want);
      } else if (key.mode === 'reference') {
        if (key.modelAnswer) lines.push('Acuan: ' + String(key.modelAnswer));
        if (key.rubric) lines.push('Rubrik: ' + String(key.rubric));
      }
    } else if (key && shown === 'Belum dijawab' && key.mode === 'exact' && Array.isArray(key.accepted)) {
      lines.push('Belum dijawab · Kunci: ' + key.accepted.map(String).join(' / '));
    }
  }
  const extra = typeof answers.text === 'string' ? answers.text : '';
  if (extra) lines.push('', extra);
  const add = (value: unknown) => { if (typeof value === 'string' && value.trim()) lines.push(value.trim()); };
  for (const block of sheet?.blocks || []) {
    add(block.type === 'instructions' ? (typeof block.body === 'string' ? block.body : block.body?.id || block.body?.de) : '');
  }
  add(activity?.content);
  for (const source of activity?.sources || []) add(source.title);
  if (attempt && !attempt.complete && !(arguments.length === 1 && activity?.answers)) lines.push('Belum lengkap');
  return lines.filter((line, index) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n').replace(/\n{3,}/g, '\n\n');
}

export type AssessmentPayloadInput = {attemptId: string; assessmentRevision: number; attemptRevision: number; settingsRevision: number; status: 'draft' | 'reviewed'; points: number | null; criterionScores: Record<string, number>; feedback: string};
export function buildAssessmentPayload(input: AssessmentPayloadInput) {
  return {attemptId: input.attemptId, baseRevision: input.assessmentRevision, attemptRevision: input.attemptRevision, settingsRevision: input.settingsRevision, status: input.status, points: input.points, criterionScores: input.criterionScores, feedback: input.feedback};
}
export function buildPublishPayload(input: {attemptId: string; assessmentRevision: number; attemptRevision: number; settingsRevision: number}) {
  return {attemptId: input.attemptId, baseRevision: input.assessmentRevision, attemptRevision: input.attemptRevision, settingsRevision: input.settingsRevision};
}
export type GradingSettingsPayloadInput = {activityId: string; settingsRevision: number; mode: 'ungraded' | 'points' | 'rubric'; maxPoints: number; criteria: {id: string; label: string; maxPoints: number}[]};
export function buildGradingSettingsPayload(input: GradingSettingsPayloadInput) {
  return {activityId: input.activityId, baseRevision: input.settingsRevision, mode: input.mode, maxPoints: input.maxPoints, criteria: input.criteria};
}
export function validateManualGrade(settings: any, grade: {points: number | null; criterionScores: Record<string, number>}): string | null {
  const mode = settings?.mode;
  const scores = grade?.criterionScores || {};
  if (mode === 'ungraded') return grade.points === null && Object.keys(scores).length === 0 ? null : 'Nilai tidak diizinkan untuk mode tanpa nilai.';
  const max = Number(settings?.maxPoints ?? 0);
  const inRange = (value: number, bound = max) => Number.isFinite(value) && value >= 0 && value <= bound;
  if (mode === 'points') return grade.points !== null && inRange(grade.points) ? null : `Nilai harus antara 0 dan ${max}.`;
  if (mode === 'rubric') {
    const criteria = settings.criteria || [];
    if (criteria.some((c: any) => !Object.prototype.hasOwnProperty.call(scores, c.id) || !inRange(scores[c.id], Number(c.maxPoints)))) return 'Nilai kriteria tidak lengkap atau di luar batas.';
    const total = criteria.reduce((sum: number, c: any) => sum + Number(scores[c.id]), 0);
    return grade.points === total && inRange(total) ? null : 'Jumlah nilai harus sama dengan total kriteria.';
  }
  return 'Mode penilaian tidak valid.';
}
