import pb from '@/lib/pocketbase-client';
import type { QuizQuestionEditable } from '@/lib/task-types';

export type ActivityKind = 'material' | 'quiz' | 'assignment' | 'exit_ticket';
export const ACTIVITY_LABELS: Record<ActivityKind, string> = {material: 'Materi', quiz: 'Kuis', assignment: 'Tugas', exit_ticket: 'Refleksi akhir'};
export type ScheduledActivity = {
  id: string; kind: ActivityKind; title: string; minutes: number; required: boolean;
  startsAt: string; endsAt: string; content?: string; url?: string; questions?: QuizQuestionEditable[];
  materialIds?: string[]; cpmkIds?: string[]; subCpmkIds?: string[];
  sources?: {title:string;version:number;available:boolean;url?:string}[];
  academic?: {cpmks:{id:string;code:string;description:string}[];subCpmks:{id:string;code:string;description:string}[]};
};
export type ScheduledAttempt = {
  id: string; activity: string; student: string; answers: Record<string, unknown>; revision: number;
  status: 'draft' | 'submitted' | 'expired'; savedAt: string; finalizedAt: string; complete: boolean; score?: number;
};
export type ScheduledClass = {
  id: string; title: string; instructions: string; section: string; startsAt: string; endsAt: string; joinUntil: string;
  lateAfterMin: number; revision: number; releaseResults: boolean;
  status: 'draft' | 'scheduled' | 'closed' | 'reviewed' | 'cancelled';
  phase: 'draft' | 'scheduled' | 'open' | 'closed' | 'reviewed' | 'cancelled';
};
export type ClassReportRow = {
  roster: string; student: string; name: string; nim: string; checkedInAt: string; lastSeenAt: string;
  suggestion: string; completed: number; total: number; reason: string; attendance: string; attempts: ScheduledAttempt[];
};
export type ScheduledClassState = {
  serverNow: string; owner: boolean; session: {id: string; title: string; course: string; section?: string};
  class: ScheduledClass | null; activities: ScheduledActivity[]; attempts: ScheduledAttempt[];
  participant?: {checkedInAt: string; lastSeenAt: string} | null; report: ClassReportRow[];
  events: {id: string; action: string; created: string; detail: Record<string, unknown>}[];
};
export async function scheduledRequest(sessionId: string, action: string, body: Record<string, unknown> = {}) {
  try {
    return await pb.send<ScheduledClassState>('/api/laras/scheduled-classes', {
      method: 'POST', body: {sessionId, action, ...body}, requestKey: null,
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    const e = error as {response?: {message?: string}; message?: string};
    throw new Error(e.response?.message || e.message || 'Kelas belum dapat dihubungi. Coba kembali.');
  }
}
export function wibLabel(value: string) {
  return value ? new Date(value).toLocaleString('id-ID', {timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short'}) + ' WIB' : '—';
}
export function toWibInput(value: string) { return new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 16); }
export function fromWibInput(value: string) { return value ? new Date(value + ':00+07:00').toISOString() : ''; }
