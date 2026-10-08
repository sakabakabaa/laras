import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { pocketbaseAdmin as db } from '@/lib/pocketbase-client.server';
import { groupedComponents, type AttendanceSession, type AttendanceRecord, type ParticipationAward } from '@/lib/grouped-gradebook';
import { calculateFinalGrade, componentScore, type GradeComponent, type GradeEntry, type GradeOverride } from '@/lib/gradebook';
import type { Assignment, AssignmentSubmission } from '@/lib/assignments';
export const action = withApi(async ({ request }) => {
    const auth = await authenticateUser(request);
    if ('error' in auth) return apiError(auth.error.status, auth.error.message);
    const body = await readJsonBody<{ courseId: string }>(request);
    if (!/^[a-zA-Z0-9]{5,40}$/.test(body.courseId || '')) return apiError(422,'Mata kuliah tidak valid.');
    const enrolled = await auth.pb.collection('enrollments').getList(1,1,{filter: auth.pb.filter('course={:c} && owner={:u}',{c:body.courseId,u:auth.user.id})});
    if (!enrolled.items.length || auth.user.role !== 'student') return apiError(403,'Hanya mahasiswa terdaftar.');
    const q = JSON.stringify, course = 'course=' + q(body.courseId);
    const all = async <T,>(name: string, filter: string) => {
        const rows: T[] = [];
        for(let page=1;;page++) { const result=await db.listRecords<T>(name,{filter,page,perPage:200}); rows.push(...result.items); if(result.items.length<200) return rows; }
    };
    const [components, tasks, submissions, sessions, attendance, entries, overrides, publications, awards] = await Promise.all([
        all<GradeComponent>('grade_components',course+' && status="active"'),
        all<Assignment>('assignments',course),
        all<AssignmentSubmission>('assignment_submissions','assignment.'+course+' && owner='+q(auth.user.id)),
        all<AttendanceSession>('class_sessions',course),
        all<AttendanceRecord>('attendance','session.'+course+' && student='+q(auth.user.id)),
        all<GradeEntry>('grade_entries','component.'+course+' && student='+q(auth.user.id)),
        all<GradeOverride>('grade_overrides',course+' && student='+q(auth.user.id)),
        all<{id:string}>('grade_publications',course),
        all<ParticipationAward>('participation_awards','session.'+course+' && student='+q(auth.user.id)),
    ]);
    const grouped = groupedComponents(components,tasks,submissions,[{id:auth.user.id,sectionId:enrolled.items[0].section}],sessions,attendance,awards);
    const entryMap = new Map<string,Map<string,GradeEntry>>();
    entries.forEach(e => entryMap.set(e.component,new Map([[auth.user.id,e]])));
    const subMap = new Map<string,Map<string,AssignmentSubmission>>();
    submissions.forEach(s => subMap.set(s.assignment,new Map([[auth.user.id,s]])));
    return json({ published: publications.length>0,
        final: publications.length ? calculateFinalGrade(grouped,auth.user.id,entryMap,subMap,overrides[0]) : null,
        components: grouped.map(c => ({name:c.name,weight:c.weight,bonus:c.sourceType==='bonus',
            score:c.sourceType==='bonus' ? (publications.length ? componentScore(c,auth.user.id,entryMap,subMap).score : null) : c.computed?.[auth.user.id]?.score ?? (publications.length ? componentScore(c,auth.user.id,entryMap,subMap).score : null),
            detail:c.computed?.[auth.user.id]?.detail || (c.sourceType==='bonus' ? 'Bonus maksimal +'+c.maxScore : 'Nilai komponen tersedia setelah diterbitkan.'),
        })),
    });
});
