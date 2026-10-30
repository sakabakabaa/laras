import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { createAgentTask, listAgentTasks, actOnAgentTask } from '@/lib/agent-tasks.server';
import { createRateLimiter } from '@/lib/rate-limit.server';
const budget = createRateLimiter({ maxRequests: 8, windowSeconds: 60 });
export const action = withApi(async ({ request }) => {
 if (request.method !== 'POST') return apiError(405, 'Method not allowed');
 const auth = await authenticateUser(request);
 if ('error' in auth) return apiError(auth.error.status, auth.error.message);
 if (!['faculty', 'student'].includes(auth.user.role || '')) return apiError(403, 'Peran tidak didukung.');
 const body = await readJsonBody<Record<string, unknown>>(request);
 if (body.action === 'list') return json({ tasks: await listAgentTasks(auth.pb, auth.user) });
 if (!(await budget('agent-task:' + auth.user.id))) return apiError(429, 'Tunggu sebentar sebelum membuat atau mengubah tugas lagi.');
 try {
  if (body.action === 'create') {
   if (typeof body.courseId !== 'string' || !/^[a-zA-Z0-9]{15}$/.test(body.courseId) || !['lesson', 'practice'].includes(String(body.kind))) return apiError(422, 'Pilih mata kuliah dan alur yang valid.');
   return json({ task: await createAgentTask(auth.pb, auth.user, body.courseId, body.kind as 'lesson' | 'practice', typeof body.goal === 'string' ? body.goal : '', typeof body.sessionId === 'string' ? body.sessionId : '') });
  }
  if (typeof body.taskId !== 'string' || !/^[a-zA-Z0-9]{15}$/.test(body.taskId)) return apiError(422, 'Tugas tidak valid.');
  return json({ task: await actOnAgentTask(auth.pb, auth.user, body.taskId, String(body.action), typeof body.revision === 'number' ? body.revision : undefined) });
 } catch (error) {
  return apiError((error as { status?: number }).status || 500, error instanceof Error ? error.message : 'Tugas asisten belum tersedia.');
 }
});
