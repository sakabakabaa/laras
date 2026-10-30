export type AgentStep = { label: string; status: 'pending' | 'running' | 'done'; detail?: string };
export type LessonPlan = {
 title: string; objective: string; evidenceNote: string; preparation?: string; outcomeIds?: string[];
 activities: { title: string; minutes: number; instructions: string; studentActivity?: string; sourceIds: string[] }[];
 check: string; sources: { id: string; title: string; locator: string; href: string; version: number; sectionIds: string[] }[];
};
export type AgentTask = {
 id: string; owner: string; course: string; kind: 'lesson' | 'practice';
 status: 'queued' | 'running' | 'awaiting_approval' | 'awaiting_practice' | 'needs_auth' | 'failed' | 'completed' | 'cancelled';
 goal: string; steps: AgentStep[]; revision: number; approvedRevision: number; attempts: number;
 payload: { sessionId?: string; sessionTitle?: string; lessonPlanId?: string; baseRevision?: number; baselinePlan?: LessonPlan; courseTitle?: string; plan?: LessonPlan; focus?: { id: string; label: string; reason: string }; roundIds?: string[]; targetRounds?: number };
 result: { link?: string; recordId?: string; verifiedAt?: string }; error: string; created: string; updated: string;
};
export const AGENT_STATUS: Record<AgentTask['status'], string> = {
 queued: 'Dalam antrean', running: 'Sedang dikerjakan', awaiting_approval: 'Draf siap ditinjau',
 awaiting_practice: 'Giliranmu berlatih', needs_auth: 'Masuk kembali untuk melanjutkan', failed: 'Perlu dicoba lagi', completed: 'Selesai', cancelled: 'Dibatalkan',
};
