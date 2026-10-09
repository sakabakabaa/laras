import { pocketbaseAdmin as db } from '@/lib/pocketbase-client.server';
import { buildLearnerProfileForUser } from '@/lib/learner-profile.server';
import { normalizePracticeSkill, PRACTICE_SKILLS, type StudentProgress } from './student-progress';
import type { PersonalQuestion, PracticeResult } from './personal-practice';
import type { ClassSession, SubCpmk } from './learning';

async function all<T>(collection: string, filter: string) {
    const rows: T[] = [];
    for (let page = 1; ; page++) {
        const result = await db.listRecords<T>(collection, { filter, page, perPage: 200, sort: '-created' });
        rows.push(...result.items);
        if (result.items.length < 200) return rows;
    }
}
// Caller must authorize enrollment/ownership before invoking this aggregation.
// Derived from authoritative records: rescoring and reports replace evidence,
// rather than incrementing counters or creating duplicate observations.
export async function studentProgress(student: string, course: string): Promise<StudentProgress> {
    const q = JSON.stringify;
    const [rounds, submissions, assignments, outcomes] = await Promise.all([
        all<{ id: string; payload: { questions?: PersonalQuestion[]; sources?: { id: string; session: string }[]; sessions?: ClassSession[] } }>('personal_practice_rounds', `student=${q(student)} && course=${q(course)} && preview=false`),
        all<{ id: string; feedback: string; updated: string; assignment: string }>('assignment_submissions', `owner=${q(student)} && assignment.course=${q(course)} && status="graded"`),
        all<{ id: string; title: string; activityType: string }>('assignments', `course=${q(course)}`),
        all<SubCpmk>('sub_cpmk', `course=${q(course)}`),
    ]);
    const formal = assignments.filter(a => a.activityType !== 'formative');
    const formalIds = new Set(formal.map(a => a.id));
    const graded = submissions.filter(s => formalIds.has(s.assignment));
    const profile = await buildLearnerProfileForUser({ learnerUserId: student, assignmentIds: graded.map(s => s.assignment).filter((id,i,ids) => ids.indexOf(id) === i), threshold: 3 });
    const observations: { id: string; skill: keyof typeof PRACTICE_SKILLS; outcomeIds: string[]; verdict: string; date: string; title: string; feedback: string; correction: string }[] = [];
    const interactions: { kind: string; verdict?: string; skill: keyof typeof PRACTICE_SKILLS; outcomeIds: string[] }[] = [];
    for (const round of rounds) {
        const [attempts, reports, roundInteractions] = await Promise.all([
            all<{ id: string; ordinal: number; updated: string; result: PracticeResult }>('personal_practice_attempts', `round=${q(round.id)} && status="done"`),
            all<{ ordinal: number }>('personal_practice_reports', `round=${q(round.id)}`),
            all<{ attempt: string; kind: string; verdict?: string }>('personal_practice_interactions', `attempt.round=${q(round.id)}`),
        ]);
        const reportedOrdinals = new Set(reports.map(report => report.ordinal));
        const learningByAttempt = new Map<string, { skill: keyof typeof PRACTICE_SKILLS; outcomeIds: string[] }>();
        for (const attempt of attempts) {
            const question = round.payload.questions?.[attempt.ordinal - 1];
            if (!question) continue;
            const sourceIds = new Set(question.sourceIds || []);
            const sessionIds = new Set((round.payload.sources || []).filter(source => sourceIds.has(source.id)).map(source => source.session));
            const outcomeIds = [...new Set((round.payload.sessions || []).filter(session => sessionIds.has(session.id)).flatMap(session => session.subCpmks || []))]
                .filter(id => outcomes.some(outcome => outcome.id === id));
            const skill = normalizePracticeSkill(question.skillId, question.skill);
            learningByAttempt.set(attempt.id, { skill, outcomeIds });
            if (attempt.result.verdict === 'uncertain' || reportedOrdinals.has(attempt.ordinal)) continue;
            observations.push({ id: attempt.id, skill, outcomeIds, verdict: attempt.result.verdict,
                date: attempt.updated, title: question.prompt, feedback: attempt.result.explanation, correction: attempt.result.correction });
        }
        interactions.push(...roundInteractions.flatMap(event => {
            const context = learningByAttempt.get(event.attempt);
            const attempt = attempts.find(item => item.id === event.attempt);
            return context && attempt && !reportedOrdinals.has(attempt.ordinal) ? [{ kind: event.kind, verdict: event.verdict, ...context }] : [];
        }));
    }
    observations.sort((a,b) => b.date.localeCompare(a.date));
    const skills = Object.entries(PRACTICE_SKILLS).flatMap(([id,label]) => {
        const evidence = observations.filter(o => o.skill === id);
        if (!evidence.length) return [];
        const recent = evidence.slice(0,5), previous = evidence.slice(5,10);
        const correct = evidence.filter(o => o.verdict === 'correct').length;
        const recentCorrect = recent.filter(o => o.verdict === 'correct').length;
        const improving = recent.length >= 3 && previous.length >= 3 && recentCorrect / recent.length > previous.filter(o => o.verdict === 'correct').length / previous.length + .2;
        const status = evidence.length < 3 ? 'building' : improving ? 'improving' : recentCorrect / recent.length >= .8 ? 'steady' : 'focus';
        return [{ id, label, total: evidence.length, correct, recentCorrect, recentTotal: recent.length, status } as StudentProgress['skills'][number]];
    });
    const outcomeProgress = outcomes.flatMap(outcome => {
        const evidence = observations.filter(item => item.outcomeIds.includes(outcome.id));
        if (!evidence.length) return [];
        const recent = evidence.slice(0, 5), previous = evidence.slice(5, 10);
        const recentCorrect = recent.filter(item => item.verdict === 'correct').length;
        const previousRate = previous.length ? previous.filter(item => item.verdict === 'correct').length / previous.length : 0;
        const recentRate = recentCorrect / recent.length;
        const improving = recent.length >= 3 && previous.length >= 3 && recentRate > previousRate + .2;
        const status = evidence.length < 3 ? 'building' : improving ? 'improving' : recentRate >= .8 ? 'steady' : 'focus';
        return [{ id: outcome.id, code: outcome.code, description: outcome.description, total: evidence.length,
            correct: evidence.filter(item => item.verdict === 'correct').length, recentCorrect, recentTotal: recent.length, status } as StudentProgress['outcomes'][number]];
    });
    return { scoredTasks: graded.length, practiceAnswers: observations.length, skills,
        outcomes: outcomeProgress,
        miniLessons: { opened: interactions.filter(item => item.kind === 'lesson_opened').length,
            checks: interactions.filter(item => item.kind === 'lesson_check').length,
            correct: interactions.filter(item => item.kind === 'lesson_check' && item.verdict === 'correct').length,
            needsWork: interactions.filter(item => item.kind === 'lesson_check' && (item.verdict === 'needs_work' || item.verdict === 'partially_correct')).length,
            bySkill: Object.entries(PRACTICE_SKILLS).flatMap(([id, label]) => {
                const evidence = interactions.filter(item => item.skill === id);
                const opened = evidence.filter(item => item.kind === 'lesson_opened').length;
                const checks = evidence.filter(item => item.kind === 'lesson_check');
                return opened || checks.length ? [{ id, label, opened, checks: checks.length, correct: checks.filter(item => item.verdict === 'correct').length,
                    needsWork: checks.filter(item => item.verdict === 'needs_work' || item.verdict === 'partially_correct').length }] : [];
            }),
            byOutcome: outcomes.flatMap(outcome => {
                const evidence = interactions.filter(item => item.outcomeIds.includes(outcome.id));
                const opened = evidence.filter(item => item.kind === 'lesson_opened').length;
                const checks = evidence.filter(item => item.kind === 'lesson_check');
                return opened || checks.length ? [{ id: outcome.id, code: outcome.code, opened, checks: checks.length, correct: checks.filter(item => item.verdict === 'correct').length,
                    needsWork: checks.filter(item => item.verdict === 'needs_work' || item.verdict === 'partially_correct').length }] : [];
            }) },
        confirmed: (profile?.patterns || []).map(p => ({ label: p.category + (p.subcategory ? ' · ' + p.subcategory : ''), count: p.count })),
        recent: [
            ...observations.filter(o => o.verdict !== 'correct').map(o => ({ ...o, kind: 'practice' as const })),
            ...graded.filter(s => s.feedback).map(s => ({ id: s.id, kind: 'task' as const, title: formal.find(a => a.id === s.assignment)?.title || 'Tugas', feedback: s.feedback, correction: '', date: s.updated })),
        ].sort((a,b) => b.date.localeCompare(a.date)).slice(0,10),
    };
}
