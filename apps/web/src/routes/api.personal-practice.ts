import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { createRateLimiter } from '@/lib/rate-limit.server';
import { practiceContext, startPractice, readRound, publicRound, answerPractice, reportPractice, practiceLesson, checkPracticeLesson } from '@/lib/personal-practice.server';

const budget = createRateLimiter({ maxRequests: 12, windowSeconds: 60 });
export const action = withApi(async ({ request }) => {
    if (request.method !== 'POST') return apiError(405, 'Method not allowed');
    const auth = await authenticateUser(request);
    if ('error' in auth) return apiError(auth.error.status, auth.error.message);
    const body = await readJsonBody<Record<string, unknown>>(request);
    if (typeof body.courseId !== 'string' || !/^[a-zA-Z0-9]{5,40}$/.test(body.courseId)) return apiError(422, 'Mata kuliah tidak valid.');
    const ctx = await practiceContext(auth.pb, auth.user, body.courseId);
    if (body.action === 'readiness') {
        return json({ enabled: ctx.settings.enabled, language: ctx.settings.language, level: ctx.settings.level, canEdit: ctx.canEdit, activeRoundId: ctx.activeRoundId, totalXp: ctx.totalXp,
            sessions: ctx.sessions.map(s => ({ id: s.id, title: s.title, week: s.week, date: s.date })),
            sources: ctx.sources.map(s => ({ ...s, text: ctx.canEdit ? s.text : '' })), reason: ctx.reason, scopeNote: ctx.scopeNote,
            personalization: ctx.personalization, progress: ctx.progress, history: ctx.history, reports: ctx.reports, sections: ctx.canEdit ? ctx.sections : [] });
    }
    if (body.action === 'round' && typeof body.roundId === 'string') return json(await publicRound(await readRound(body.roundId, auth.user.id, ctx.course.id)));
    if (!(await budget('personal-practice:' + auth.user.id))) return apiError(429, 'Terlalu banyak permintaan. Tunggu sebentar.');
    if (body.action === 'lesson' && typeof body.roundId === 'string' && Number.isInteger(body.ordinal))
        return json(await practiceLesson(await readRound(body.roundId, auth.user.id, ctx.course.id), Number(body.ordinal)));
    if (body.action === 'lesson-check' && typeof body.roundId === 'string' && Number.isInteger(body.ordinal) && typeof body.answer === 'string')
        return json(await checkPracticeLesson(await readRound(body.roundId, auth.user.id, ctx.course.id), Number(body.ordinal), body.answer));
    if (body.action === 'report' && typeof body.roundId === 'string' && Number.isInteger(body.ordinal) && typeof body.reason === 'string') {
        await reportPractice(await readRound(body.roundId, auth.user.id, ctx.course.id), Number(body.ordinal), body.reason); return json({ ok: true });
    }
    if (body.action === 'start') return json(await startPractice(ctx, auth.user.id));
    if (body.action === 'answer' && typeof body.roundId === 'string' && Number.isInteger(body.ordinal) && typeof body.answer === 'string')
        return json(await answerPractice(await readRound(body.roundId, auth.user.id, ctx.course.id), Number(body.ordinal), body.answer));
    return apiError(422, 'Permintaan latihan tidak valid.');
});
