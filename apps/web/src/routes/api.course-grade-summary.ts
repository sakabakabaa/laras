import { withApi, apiError, json, readJsonBody } from '@/lib/api.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { pocketbaseAdmin as db } from '@/lib/pocketbase-client.server';
import { groupedComponents, type AttendanceSession, type AttendanceRecord, type ParticipationAward } from '@/lib/grouped-gradebook';
import { calculateFinalGrade, componentScore, type GradeComponent, type GradeEntry, type GradeOverride } from '@/lib/gradebook';
import type { Assignment, AssignmentSubmission } from '@/lib/assignments';
import type { ReleaseComponentRow } from '@/lib/gradebook/publication';
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
    // Current release = newest published snapshot for this course. The reader
    // is GATED: it serves stored values only when the release actually has an
    // item for this student. Marker-only backfilled releases (created by
    // migration 1791900000 without per-student items — the historical values
    // are unrecoverable) deliberately fall through to the legacy live path so
    // no student ever sees an empty snapshot in place of real published
    // values. Once releases carry complete items this path takes over and
    // lecturer edits stop affecting what students see.
    const [releases, components, tasks, submissions, sessions, attendance, entries, overrides, publications, awards] = await Promise.all([
        all<{id:string;revision:number;status:string}>('grade_releases',course+' && status="published"'),
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
    const release = releases.sort((a,b) => b.revision-a.revision)[0];
    const items = release ? await all<{finalScore:number|null;letterGrade:string|null;complete:boolean;overridden:boolean;components:ReleaseComponentRow[]}>('grade_release_items','release='+q(release.id)+' && student='+q(auth.user.id)) : [];
    const item = items[0];
    if (release && item) {
        const counting = item.components.filter(c => !c.bonus && c.weight>0);
        return json({ published:true, revision:release.revision,
            final:{ value:item.finalScore, overridden:item.overridden, gradedCount:counting.filter(c=>c.score!=null).length, countingCount:counting.length, letter:item.letterGrade },
            components:item.components.map(c => ({name:c.name,weight:c.weight,bonus:c.bonus,score:c.score,detail:c.detail || (c.bonus ? 'Bonus maksimal +'+(c.weight||'') : 'Nilai komponen tersedia setelah diterbitkan.')})),
        });
    }
    // Legacy path (marker-only release or nothing released yet). Draft manual
    // scores stay hidden until publication; computed component scores that
    // derive from ALREADY-PUBLISHED assignment results (tasks/uts/uas from
    // graded submissions) stay visible, attendance does not.
    const grouped = groupedComponents(components,tasks,submissions,[{id:auth.user.id,sectionId:enrolled.items[0].section}],sessions,attendance,awards);
    const entryMap = new Map<string,Map<string,GradeEntry>>();
    entries.forEach(e => entryMap.set(e.component,new Map([[auth.user.id,e]])));
    const subMap = new Map<string,Map<string,AssignmentSubmission>>();
    submissions.forEach(s => subMap.set(s.assignment,new Map([[auth.user.id,s]])));
    const published = publications.length>0;
    return json({ published, revision:null,
        final: published ? calculateFinalGrade(grouped,auth.user.id,entryMap,subMap,overrides[0]) : null,
        components: grouped.map(c => {
            const isAssignmentDerived = c.sourceType!=='attendance' && (c.computed?.[auth.user.id]!=null || (c.kind==='assignment' && Boolean(c.assignment)));
            return {name:c.name,weight:c.weight,bonus:c.sourceType==='bonus',
                score:c.sourceType==='bonus' ? (published ? componentScore(c,auth.user.id,entryMap,subMap).score : null)
                    : isAssignmentDerived ? c.computed?.[auth.user.id]?.score ?? componentScore(c,auth.user.id,entryMap,subMap).score
                    : (published ? componentScore(c,auth.user.id,entryMap,subMap).score : null),
                detail:c.computed?.[auth.user.id]?.detail || (c.sourceType==='bonus' ? 'Bonus maksimal +'+c.maxScore : 'Nilai komponen tersedia setelah diterbitkan.'),
            };
        }),
    });
});
