import type {ScheduledActivity,ScheduledAttempt,ScheduledClassState} from './scheduled-classes';

/** Client-side verdict for one response item. Never a grade: the server's
 *  attempt.score stays authoritative; this only marks what a human should look at. */
export type ResponseVerdict = 'correct' | 'wrong' | 'manual' | 'ungraded';

export type ResponseVerdictCard = {
  id: string; number: number; prompt: string; translation?: string; answer: string;
  options?: string[]; verdict: ResponseVerdict; accepted?: string[];
  modelAnswer?: string; rubric?: string; points?: number; earned?: number;
};

export type VerdictTally = {correct: number; wrong: number; manual: number; ungraded: number; earned: number; total: number; score: number | null};

/** Mirrors scheduled-classes-domain.js normalizeAnswer exactly, so a client verdict
 *  can never disagree with the score the server stored for the same attempt. */
export function normalizeAnswer(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/g, '').toLowerCase();
}

/** An activity needs a human when any answerable item has no exact key. Quizzes and
 *  materials never do; writing tasks always do. */
export function requiresManual(activity: ScheduledActivity): boolean {
  if (activity.kind === 'quiz' || activity.kind === 'material') return false;
  const items = activity.worksheet?.items || [];
  if (!items.length) return true;
  const key = activity.worksheet?.answerKey?.items || {};
  return items.some(item => key[item.id]?.mode !== 'exact');
}

export function gradingModeLabel(activity: ScheduledActivity): string {
  if (activity.kind === 'quiz') return 'Kuis otomatis';
  if (activity.kind === 'material') return 'Materi';
  const items = activity.worksheet?.items || [];
  const key = activity.worksheet?.answerKey?.items || {};
  const exact = items.filter(item => key[item.id]?.mode === 'exact').length;
  const reference = items.filter(item => key[item.id]?.mode === 'reference').length;
  if (items.length && exact === items.length) return 'Otomatis · kunci';
  if (reference) return 'Manual · contoh jawaban';
  if (activity.kind === 'exit_ticket') return 'Manual · refleksi';
  return 'Manual · rubrik/poin';
}

export function responseVerdicts(activity: ScheduledActivity, attempt: ScheduledAttempt | undefined): ResponseVerdictCard[] {
  if (activity.kind === 'quiz') {
    return (activity.questions || []).map((question, index) => {
      const selected = attempt?.answers?.[question.id];
      const picked = typeof selected === 'number' && Number.isInteger(selected) ? selected : -1;
      const verdict: ResponseVerdict = picked < 0 ? 'ungraded' : picked === question.correctIndex ? 'correct' : 'wrong';
      return {
        id: question.id, number: index + 1, prompt: question.text, answer: picked >= 0 ? question.options[picked] || '' : '',
        options: question.options, verdict, accepted: question.correctIndex >= 0 ? [question.options[question.correctIndex]] : undefined,
        points: question.points, earned: verdict === 'correct' ? question.points : 0,
      };
    });
  }
  const responses = (attempt?.answers?.responses || {}) as Record<string, unknown>;
  const key = activity.worksheet?.answerKey?.items || {};
  const items = activity.worksheet?.items || [];
  const cards: ResponseVerdictCard[] = items.map((item, index) => {
    const raw = responses[item.id];
    const answer = typeof raw === 'string' ? raw : raw === undefined || raw === null ? '' : String(raw);
    const entry = key[item.id];
    const base = {id: item.id, number: index + 1, prompt: item.prompt, translation: item.translation, answer, options: item.options};
    if (!entry) return {...base, verdict: answer.trim() ? 'manual' as ResponseVerdict : 'ungraded' as ResponseVerdict};
    if (entry.mode === 'reference') return {...base, verdict: 'manual' as ResponseVerdict, modelAnswer: entry.modelAnswer, rubric: entry.rubric};
    const matched = entry.accepted.some(value => normalizeAnswer(value) === normalizeAnswer(answer));
    return {...base, verdict: (matched ? 'correct' : 'wrong') as ResponseVerdict, accepted: entry.accepted, points: entry.points, earned: matched ? entry.points : 0};
  });
  if (!cards.length) {
    const text = typeof attempt?.answers?.text === 'string' ? attempt.answers.text : '';
    cards.push({id: 'text', number: 1, prompt: activity.content || activity.title, answer: text, verdict: text.trim() ? 'manual' : 'ungraded'});
  }
  return cards;
}

export function verdictTally(cards: ResponseVerdictCard[], attempt?: ScheduledAttempt): VerdictTally {
  const correct = cards.filter(card => card.verdict === 'correct').length;
  const wrong = cards.filter(card => card.verdict === 'wrong').length;
  const manual = cards.filter(card => card.verdict === 'manual').length;
  const ungraded = cards.filter(card => card.verdict === 'ungraded').length;
  const earned = cards.reduce((sum, card) => sum + (card.earned || 0), 0);
  const total = cards.reduce((sum, card) => sum + (card.points || 0), 0);
  const score = typeof attempt?.score === 'number' ? attempt.score : total ? Math.round((earned / total) * 10000) / 100 : null;
  return {correct, wrong, manual, ungraded, earned, total, score};
}

export type ReviewTally = {manual: number; reviewed: number; pending: number; auto: number; autoScored: number};

/** Honest queue size: submissions that actually need a human, plus what was already
 *  scored automatically so the toolbar can show both instead of one inflated number. */
export function reviewTally(state: ScheduledClassState): ReviewTally {
  const open = state.attempts.filter(attempt => attempt.status !== 'draft');
  const manual = open.filter(attempt => {
    const activity = state.activities.find(item => item.id === attempt.activity);
    return activity ? requiresManual(activity) : false;
  });
  const reviewed = manual.filter(attempt => state.assessments?.some(row => row.attempt === attempt.id && row.status === 'reviewed')).length;
  const auto = open.filter(attempt => {
    const activity = state.activities.find(item => item.id === attempt.activity);
    return activity ? activity.kind === 'quiz' || (activity.worksheet?.items?.length || 0) > 0 && !requiresManual(activity) : false;
  });
  return {manual: manual.length, reviewed, pending: manual.length - reviewed, auto: auto.length, autoScored: auto.filter(attempt => typeof attempt.score === 'number').length};
}

/** Next manual attempt without a reviewed assessment, walking the roster order so the
 *  queue follows the student list a lecturer actually sees. */
export function nextManualTarget(state: ScheduledClassState, activities: ScheduledActivity[], after?: {student?: string; activity?: string}) {
  const manual = activities.filter(requiresManual);
  if (!manual.length) return undefined;
  const open = state.attempts.filter(attempt => attempt.status !== 'draft' && manual.some(item => item.id === attempt.activity));
  const pending = (attempt: ScheduledAttempt) => !state.assessments?.some(row => row.attempt === attempt.id && row.status === 'reviewed');
  const ordered = state.report.flatMap(row => manual.flatMap(activity => open.filter(attempt => attempt.student === row.student && attempt.activity === activity.id)));
  const rest = open.filter(attempt => !ordered.some(match => match.id === attempt.id));
  const all = [...ordered, ...rest];
  if (!after?.student) return all.find(pending);
  const index = all.findIndex(attempt => attempt.student === after.student && attempt.activity === after.activity);
  return all.slice(index + 1).find(pending) || all.find(pending);
}
