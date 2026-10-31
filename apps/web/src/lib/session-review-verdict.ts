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
  return String(value ?? '').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/g, '').