import { activityTypeOf, type Assignment, type AssignmentSubmission } from './assignments';
import type { GradeComponent } from './gradebook';
export type ParticipationAward = {student:string; points:number; revoked:boolean; reason?:string};
export type AttendanceRecord = { student: string; session: string; status: string };
export type AttendanceSession = { id: string; date: string; completed: boolean; section?: string; specialWeekType?: string };
export function groupedComponents(
    components: GradeComponent[], assignments: Assignment[], submissions: AssignmentSubmission[],
    students: { id: string; sectionId?: string }[], sessions: AttendanceSession[], attendance: AttendanceRecord[], awards: ParticipationAward[] = [],
): GradeComponent[] {
    const grouped = components.some(c => c.status === 'active' && c.sourceType === 'tasks');
    return components.filter(c => !grouped || c.kind !== 'assignment' || Boolean(c.sourceType)).map(component => {
        if (!['attendance','tasks','uts','uas','bonus'].includes(component.sourceType || '')) return component;
        const computed: NonNullable<GradeComponent['computed']> = {};
        for (const student of students) {
            if (component.sourceType === 'bonus') {
                const rows=awards.filter(a=>a.student===student.id&&!a.revoked);
                computed[student.id]={score:rows.reduce((sum,a)=>sum+a.points,0),complete:true,detail:rows.length+' apresiasi pertemuan; total sebelum batas bonus. Entri manual tetap menjadi penyesuaian tambahan.'};
                continue;
            }
            if (component.sourceType === 'attendance') {
                const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0,10);
                const eligible = sessions.filter(s => s.completed && s.date && s.date.slice(0,10) < today && (!s.specialWeekType || s.specialWeekType === 'normal') && (!s.section || s.section === student.sectionId));
                const records = eligible.map(s => attendance.find(a => a.student === student.id && a.session === s.id));
                const recorded = records.filter(Boolean).length;
                const lateCredit = component.attendanceLateCredit ?? 1, excusedCredit = component.attendanceExcusedCredit ?? 0;
                const present = records.reduce((sum,a) => sum + (a?.status === 'present' ? 1 : a?.status === 'late' ? lateCredit : ['excused','sick','permission'].includes(a?.status || '') ? excusedCredit : 0),0);
                computed[student.id] = { score: recorded ? Math.round(present / recorded * 1000)/10 : null, complete: eligible.length > 0 && recorded === eligible.length, detail: present + '/' + recorded + ' kredit kehadiran; ' + recorded + '/' + eligible.length + ' tercatat. Terlambat: ' + lateCredit*100 + '%; izin/sakit: ' + excusedCredit*100 + '%.' };
                continue;
            }
            const tasks = assignments.filter(a => activityTypeOf(a) === 'formal' && a.status !== 'draft' && (a.assessmentGroup || 'tasks') === component.sourceType);
            let weighted = 0, weights = 0, graded = 0;
            const detail: string[] = [];
            for (const task of tasks) {
                const sub = submissions.filter(s => s.assignment === task.id && s.owner === student.id && s.status === 'graded' && s.grade != null).sort((a,b) => b.updated.localeCompare(a.updated))[0];
                if (!sub) { detail.push(task.title + ': belum dinilai'); continue; }
                const weight = task.assessmentWeight && task.assessmentWeight > 0 ? task.assessmentWeight : 1;
                weighted += Math.max(0,Math.min(100,sub.grade!)) * weight; weights += weight; graded++;
                detail.push(task.title + ': ' + sub.grade + '/100 (bobot internal ' + weight + ')');
            }
            computed[student.id] = { score: weights ? Math.round(weighted/weights*10)/10 : null, complete: tasks.length > 0 && graded === tasks.length, detail: graded + '/' + tasks.length + ' tugas dinilai;\n' + detail.join('\n') };
        }
        // Exam groups without linked tasks retain a manual entry path.
        if (['uts','uas'].includes(component.sourceType || '') && !assignments.some(a => a.status !== 'draft' && activityTypeOf(a) === 'formal' && a.assessmentGroup === component.sourceType)) return component;
        return { ...component, computed };
    });
}
