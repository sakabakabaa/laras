import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
	AlertTriangle,
	Archive,
	BarChart3,
	CheckCircle2,
	ChevronRight,
	ClipboardList,
	ExternalLink,
	LayoutGrid,
	LoaderCircle,
	Pencil,
	Plus,
	Search,
	Settings2,
	Sparkles,
	Table2,
	Trash2,
	TrendingUp,
	Users,
	X,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { groupedComponents, type AttendanceRecord, type AttendanceSession, type ParticipationAward } from '@/lib/grouped-gradebook';
import { useT } from '@/lib/i18n';
import { useCourseRoster } from '@/hooks/use-course-roster';
import { useCourseSections } from '@/hooks/use-course-sections';
import { SectionSelector } from '@/components/app/course-sections';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { invalidate } from '@/lib/local-cache';
import { confirmDialog } from '@/components/confirm-dialog';
import { OverflowMenu } from '@/components/app/overflow-menu';
import { activityTypeOf, type Assignment, type AssignmentSubmission } from '@/lib/assignments';
import {
	calculateFinalGrade,
	componentScore,
	LETTER_GRADES,
	parseGradeInput,
	STATUS_LABEL,
	studentStatus,
	totalWeight,
	type GradeComponent,
	type GradeEntry,
	type GradeOverride,
	type GradePublication,
	type GradebookStudent,
	type StudentStatus,
} from '@/lib/gradebook';
import type { Course } from '@/lib/learning';
import { AppModal } from '@/components/app/app-modal';

type Tab = 'nilai' | 'komponen' | 'analitik';

/** Builds a PocketBase `field = "a" || field = "b"` filter from ids. */
function orFilter(field: string, ids: string[]): string {
	if (ids.length === 0) return '';
	return ids.map((id) => `${field} = '${id}'`).join(' || ');
}

/**
 * Lecturer Penilaian / Gradebook. A practical spreadsheet-style gradebook
 * for one course: assessment components as columns, students as rows, inline
 * manual grade entry, weighted final-grade calculation, manual components
 * independent from assignment-linked grades, and an explicit publish workflow.
 *
 * Assignment-linked columns read the published submission grade live (never
 * duplicated, never overwritten from here); manual columns read/write
 * `grade_entries`. The detailed per-submission evaluation workflow stays in
 * its own route — this gradebook only links out to it.
 */
export function LecturerGradebook({ course }: { course: Course }) {
	const courseId = course.id;
	const t = useT();
	const me = pb.authStore.record?.id || '';
	const roster = useCourseRoster(courseId);
	const { sections } = useCourseSections(courseId);
	const [classFilter, setClassFilter] = useState('');
	// NIM → student user id, resolved server-side. The browser cannot expand
	// other users on enrollments, which previously invented "Tanpa NIM" rows.
	const [accountByNim, setAccountByNim] = useState<Map<string, { id: string; email: string }>>(
		new Map(),
	);

	useEffect(() => {
		if (!courseId || !pb.authStore.token) {
			setAccountByNim(new Map());
			return;
		}
		let alive = true;
		void (async () => {
			try {
				const response = await fetch('/api/roster-status', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${pb.authStore.token}`,
					},
					body: JSON.stringify({ courseId }),
				});
				if (!response.ok) return;
				const data = (await response.json()) as {
					entries?: { nim: string; userId?: string; recoveryEmail?: string }[];
				};
				if (!alive) return;
				const map = new Map<string, { id: string; email: string }>();
				for (const row of data.entries ?? []) {
					const nim = row.nim?.trim();
					if (nim && row.userId) map.set(nim, { id: row.userId, email: row.recoveryEmail || '' });
				}
				setAccountByNim(map);
			} catch {
				/* grades still render; unmatched roster rows stay unlinked */
			}
		})();
		return () => {
			alive = false;
		};
	}, [courseId, roster.entries.length]);

	const students: GradebookStudent[] = useMemo(() => {
		const sectionName = (id?: string) => sections.find((s) => s.id === id)?.name || '';
		return roster.entries
			.filter((entry) => !classFilter || entry.section === classFilter)
			.map((entry) => {
				const nim = entry.nim.trim();
				const matched = nim ? accountByNim.get(nim) : undefined;
				return {
					id: matched?.id || entry.id,
					name: entry.name,
					email: matched?.email || '',
					nim,
					section: sectionName(entry.section), sectionId: entry.section || '',
				};
			})
			.sort((a, b) => a.nim.localeCompare(b.nim, 'id') || a.name.localeCompare(b.name, 'id'));
	}, [roster.entries, accountByNim, classFilter, sections]);

	const [tab, setTab] = useState<Tab>('nilai');
	const [query, setQuery] = useState('');
	const [statusFilter, setStatusFilter] = useState<StudentStatus | 'all'>('all');
	const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
	const [addOpen, setAddOpen] = useState<'assignment' | 'manual' | null>(null);
	const [editingComponent, setEditingComponent] = useState<GradeComponent | 'new' | null>(null);
	const [publishOpen, setPublishOpen] = useState(false);

	// ── Data loads ────────────────────────────────────────────────────────
	const componentsQuery = useCachedQuery<GradeComponent[]>(
		courseId ? `grade_components:course=${courseId}` : null,
		() =>
			pb.collection('grade_components').getFullList<GradeComponent>({
				filter: pb.filter('course = {:id}', { id: courseId }),
				sort: 'order,created',
			}),
	);
	const rawComponents = (componentsQuery.data ?? []).filter((c) => c.status === 'active');
	const allComponents = componentsQuery.data ?? [];

	const componentIds = allComponents.map((c) => c.id);
	const linkedAssignmentIds = allComponents
		.filter((c) => c.kind === 'assignment' && c.assignment)
		.map((c) => c.assignment);

	const entriesQuery = useCachedQuery<GradeEntry[]>(
		componentIds.length ? `grade_entries:components=${courseId}` : null,
		() =>
			pb.collection('grade_entries').getFullList<GradeEntry>({
				filter: orFilter('component', componentIds),
			}),
	);

	const submissionsQuery = useCachedQuery<AssignmentSubmission[]>(
		courseId ? `assignment_submissions:gradebook=${courseId}` : null,
		() =>
			pb.collection('assignment_submissions').getFullList<AssignmentSubmission>({
				filter: pb.filter('assignment.course = {:id}', { id: courseId }),
			}),
	);

	const overridesQuery = useCachedQuery<GradeOverride[]>(
		courseId ? `grade_overrides:course=${courseId}` : null,
		() =>
			pb.collection('grade_overrides').getFullList<GradeOverride>({
				filter: pb.filter('course = {:id}', { id: courseId }),
			}),
	);

	const publicationQuery = useCachedQuery<GradePublication | null>(
		courseId ? `grade_publications:course=${courseId}` : null,
		async () => {
			const rows = await pb.collection('grade_publications').getFullList<GradePublication>({
				filter: pb.filter('course = {:id}', { id: courseId }),
			});
			return rows[0] ?? null;
		},
	);
	const published = Boolean(publicationQuery.data);

	// Available formal assignments not yet linked to a component.
	const assignmentsQuery = useCachedQuery<Assignment[]>(
		courseId ? `assignments:formal-gradebook=${courseId}` : null,
		() =>
			pb.collection('assignments').getFullList<Assignment>({
				filter: pb.filter('course = {:id}', { id: courseId }),
				sort: 'title',
			}),
	);
	useEffect(() => {
        const refresh = () => { componentsQuery.reload(); submissionsQuery.reload(); assignmentsQuery.reload(); attendanceSessions.reload(); attendanceRows.reload(); participation.reload(); };
        window.addEventListener('focus',refresh);
        return () => window.removeEventListener('focus',refresh);
    },[courseId]);
    const linkedSet = new Set(linkedAssignmentIds);
	const availableAssignments = (assignmentsQuery.data ?? []).filter(
		(a) => !rawComponents.some(c => c.sourceType === 'tasks') && activityTypeOf(a) === 'formal' && !linkedSet.has(a.id),
	);

	const attendanceSessions = useCachedQuery<AttendanceSession[]>(courseId ? 'gradebook:sessions:' + courseId : null, () => pb.collection('class_sessions').getFullList({ filter: pb.filter('course={:c}', { c: courseId }) }));
    const attendanceRows = useCachedQuery<AttendanceRecord[]>(courseId ? 'gradebook:attendance:' + courseId : null, () => pb.collection('attendance').getFullList({ filter: pb.filter('session.course={:c}', { c: courseId }) }));
    const participation = useCachedQuery<ParticipationAward[]>(courseId ? 'gradebook:participation:' + courseId : null, () => pb.collection('participation_awards').getFullList({filter:pb.filter('session.course={:c}',{c:courseId})}));
    const components = useMemo(() => groupedComponents(rawComponents, assignmentsQuery.data || [], submissionsQuery.data || [], students, attendanceSessions.data || [], attendanceRows.data || [], participation.data || []),
        [componentsQuery.data, assignmentsQuery.data, submissionsQuery.data, students, attendanceSessions.data, attendanceRows.data, participation.data]);

    const updateMapping = async (assignment: Assignment, patch: Record<string, unknown>) => {
        try {
            await pb.collection('assignments').update(assignment.id, patch);
            invalidate('assignments:formal-gradebook=' + courseId); assignmentsQuery.reload(); submissionsQuery.reload();
        } catch { window.alert('Pemetaan belum tersimpan. Coba lagi.'); }
    };
    const syncRps = async () => {
        if (!(await confirmDialog({ title: 'Sinkronkan komponen ke RPS?', message: 'Bobot Kehadiran, Tugas, UTS, UAS dan bonus Keaktivan mengikuti Penilaian. Komponen RPS lainnya tetap disimpan dengan bobot 0 agar tidak dihitung ganda.', confirmLabel: 'Sinkronkan' }))) return;
        try {
            const existing = await pb.collection('assessments').getFullList({filter:pb.filter('course={:c}',{c:courseId})});
            const codes: Record<string,string> = {attendance:'Kehadiran',tasks:'Tugas',uts:'UTS',uas:'UAS',bonus:'Keaktivan'};
            const used = new Set<string>();
            for (const component of rawComponents.filter(c => c.sourceType)) {
                const code = codes[component.sourceType!];
                const found = existing.find(a => a.componentType === component.sourceType || String(a.code).toLowerCase() === code.toLowerCase());
                const payload = {owner:me,course:courseId,componentType:component.sourceType,code,description:component.sourceType==='bonus' ? 'Bonus partisipasi maksimal +'+component.maxScore+' poin di luar bobot 100%.' : component.name, weight:component.sourceType==='bonus' ? 0 : component.weight,bonusMax:component.sourceType==='bonus' ? component.maxScore : 0,order:component.order};
                if(found) {used.add(found.id); await pb.collection('assessments').update(found.id,payload);} else await pb.collection('assessments').create(payload);
            }
            for(const old of existing) if(!used.has(old.id)) await pb.collection('assessments').update(old.id,{weight:0,componentType:''});
            invalidate('assessments:course='+courseId);
        } catch {window.alert('Sinkronisasi belum selesai. Coba lagi.');}
    };
    const adoptDefaults = async () => {
        if (!(await confirmDialog({ title: 'Gunakan komponen standar?', message: 'Komponen lama akan diarsipkan dan tidak dihitung ganda. Nilai tugas tetap tersimpan. Bobot awal 10/30/25/35 dan bonus maksimal +5. Periksa pemetaan UTS/UAS setelahnya.', confirmLabel: 'Terapkan' }))) return;
        try {
            for (const old of rawComponents) if (!old.sourceType) {
                if (old.assignment) await pb.collection('assignments').update(old.assignment, { assessmentGroup: /uas/i.test(old.name) ? 'uas' : /uts/i.test(old.name) ? 'uts' : 'tasks' });
                await pb.collection('grade_components').update(old.id, { status: 'archived' });
            }
            const defaults = [['attendance','Kehadiran',10],['tasks','Tugas',30],['uts','UTS',25],['uas','UAS',35],['bonus','Keaktivan',0]] as const;
            for (const [order, [sourceType,name,weight]] of defaults.entries()) {
                if (!(componentsQuery.data || []).some(c => c.sourceType === sourceType))
                    await pb.collection('grade_components').create({ owner: me, course: courseId, sourceType, name, weight, kind: 'manual', maxScore: sourceType === 'bonus' ? 5 : 100, bonusMax: sourceType === 'bonus' ? 5 : 0, attendanceLateCredit: 1, attendanceExcusedCredit: 0, status: 'active', order });
            }
            componentsQuery.reload(); assignmentsQuery.reload();
        } catch { window.alert('Pengaturan belum selesai tersimpan. Muat ulang dan coba lagi.'); }
    };

    // ── Derived maps ──────────────────────────────────────────────────────
	const entriesByComponent = useMemo(() => {
		const map = new Map<string, Map<string, GradeEntry>>();
		for (const e of entriesQuery.data ?? []) {
			let inner = map.get(e.component);
			if (!inner) {
				inner = new Map();
				map.set(e.component, inner);
			}
			inner.set(e.student, e);
		}
		return map;
	}, [entriesQuery.data]);

	const submissionsByAssignment = useMemo(() => {
		const map = new Map<string, Map<string, AssignmentSubmission>>();
		for (const s of submissionsQuery.data ?? []) {
			let inner = map.get(s.assignment);
			if (!inner) {
				inner = new Map();
				map.set(s.assignment, inner);
			}
			inner.set(s.owner, s);
		}
		return map;
	}, [submissionsQuery.data]);

	const overridesByStudent = useMemo(() => {
		const map = new Map<string, GradeOverride>();
		for (const o of overridesQuery.data ?? []) map.set(o.student, o);
		return map;
	}, [overridesQuery.data]);

	// ── Final grades per student ──────────────────────────────────────────
	const finals = useMemo(() => {
		const map = new Map<string, ReturnType<typeof calculateFinalGrade>>();
		for (const s of students) {
			map.set(
				s.id,
				calculateFinalGrade(
					components,
					s.id,
					entriesByComponent,
					submissionsByAssignment,
					overridesByStudent.get(s.id),
				),
			);
		}
		return map;
	}, [students, components, entriesByComponent, submissionsByAssignment, overridesByStudent]);

	// Enrollments are now only used to resolve roster rows to student user ids
	// for grade matching, so an enrollment fetch failure is non-fatal — the
	// roster still renders every student by name + NIM.
	const loading =
		roster.loading ||
		componentsQuery.loading ||
		entriesQuery.loading ||
		submissionsQuery.loading ||
		overridesQuery.loading ||
		publicationQuery.loading;
	const loadError =
		roster.error ||
		componentsQuery.error ||
		entriesQuery.error ||
		submissionsQuery.error ||
		overridesQuery.error ||
		publicationQuery.error;

	// ── Grade mutation (manual components) ────────────────────────────────
	const saveManualGrade = useCallback(
		async (component: GradeComponent, studentId: string, value: number | null, note?: string) => {
			const existing = entriesByComponent.get(component.id)?.get(studentId);
			const payload = {
				owner: me,
				component: component.id,
				student: studentId,
				value: value,
				source: 'manual' as const, note: note ?? existing?.note ?? '',
			};
			try {
				if (existing) {
					await pb.collection('grade_entries').update(existing.id, payload);
				} else {
					await pb.collection('grade_entries').create(payload, {
						requestKey: `ge-${component.id}-${studentId}`,
					});
				}
				invalidate(`grade_entries:components=${courseId}`);
			} catch (err) {
				console.error('Gagal menyimpan nilai', err);
				throw err;
			}
		},
		[entriesByComponent, me, courseId],
	);

	const setOverride = useCallback(
		async (studentId: string, value: number | null) => {
			const existing = overridesByStudent.get(studentId);
			try {
				if (value == null) {
					if (existing) await pb.collection('grade_overrides').delete(existing.id);
				} else if (existing) {
					await pb.collection('grade_overrides').update(existing.id, {
						owner: me,
						course: courseId,
						student: studentId,
						value,
					});
				} else {
					await pb.collection('grade_overrides').create(
						{ owner: me, course: courseId, student: studentId, value },
						{ requestKey: `go-${studentId}` },
					);
				}
				invalidate(`grade_overrides:course=${courseId}`);
			} catch (err) {
				console.error('Gagal menyimpan override', err);
				throw err;
			}
		},
		[overridesByStudent, me, courseId],
	);

	// ── Component CRUD ────────────────────────────────────────────────────
	const archiveComponent = useCallback(
		async (component: GradeComponent) => {
			const hasGrades =
				component.kind === 'manual' &&
				(entriesByComponent.get(component.id)?.size ?? 0) > 0;
			if (
				hasGrades &&
				!(await confirmDialog({
					title: t('gb.archive.title'),
					message: t('gb.archive.body', { name: component.name }),
					variant: 'danger',
					confirmLabel: t('gb.archive.confirm'),
				}))
			)
				return;
			try {
				await pb.collection('grade_components').update(component.id, { status: 'archived' });
				invalidate(`grade_components:course=${courseId}`);
			} catch (err) {
				console.error(err);
			}
		},
		[entriesByComponent, courseId],
	);

	const deleteComponent = useCallback(
		async (component: GradeComponent) => {
			const hasGrades =
				component.kind === 'manual' &&
				(entriesByComponent.get(component.id)?.size ?? 0) > 0;
			if (
				!(await confirmDialog({
					title: t('gb.delete.title'),
					message: hasGrades
						? t('gb.delete.bodyHasGrades', { name: component.name })
						: t('gb.delete.bodyEmpty', { name: component.name }),
					variant: 'danger',
					confirmLabel: t('gb.delete.confirm'),
				}))
			)
				return;
			try {
				await pb.collection('grade_components').delete(component.id);
				invalidate(`grade_components:course=${courseId}`);
				invalidate(`grade_entries:components=${courseId}`);
			} catch (err) {
				console.error(err);
			}
		},
		[entriesByComponent, courseId],
	);

	// ── Publish workflow ─────────────────────────────────────────────────
	const incompleteCount = useMemo(
		() =>
			students.filter((s) => {
				const f = finals.get(s.id);
				return f && f.countingCount > 0 && f.gradedCount < f.countingCount;
			}).length,
		[students, finals],
	);

    const publish = useCallback(async () => {
        if (totalWeight(components) !== 100) { window.alert('Total bobot komponen utama harus 100%.'); return; }
        if ([...finals.values()].some(f => f.countingCount === 0 || f.gradedCount < f.countingCount)) {
            window.alert('Lengkapi semua komponen nilai berbobot untuk setiap mahasiswa sebelum menerbitkan nilai akhir.');
            return;
        }
		try {
			const existing = publicationQuery.data;
			const payload = {
				owner: me,
				course: courseId,
				publishedAt: new Date().toISOString(),
			};
			if (existing) {
				await pb.collection('grade_publications').update(existing.id, payload);
			} else {
				await pb.collection('grade_publications').create(payload, {
					requestKey: `gp-${courseId}`,
				});
			}
			invalidate(`grade_publications:course=${courseId}`);
			setPublishOpen(false);
		} catch (err) {
			console.error(err);
		}
	}, [publicationQuery.data, me, courseId, finals, components]);

	const unpublish = useCallback(async () => {
		if (!publicationQuery.data) return;
		if (
			!(await confirmDialog({
				title: t('gb.unpublish.title'),
				message: t('gb.unpublish.body'),
				variant: 'danger',
				confirmLabel: t('gb.pubBar.unpublish'),
			}))
		)
			return;
		try {
			await pb.collection('grade_publications').delete(publicationQuery.data.id);
			invalidate(`grade_publications:course=${courseId}`);
		} catch (err) {
			console.error(err);
		}
	}, [publicationQuery.data, courseId]);

	// ── Summary KPIs ──────────────────────────────────────────────────────
	const finalValues = students
		.map((s) => finals.get(s.id)?.value)
		.filter((v): v is number => v != null);
	const avg = finalValues.length
		? Math.round((finalValues.reduce((a, b) => a + b, 0) / finalValues.length) * 10) / 10
		: null;
	const highest = finalValues.length ? Math.max(...finalValues) : null;
	const lowest = finalValues.length ? Math.min(...finalValues) : null;
	const notComplete = students.length - finalValues.length;

	// ── Filtering ────────────────────────────────────────────────────────
	const filteredStudents = useMemo(() => {
		const q = query.trim().toLowerCase();
		return students.filter((s) => {
			if (q && !`${s.name} ${s.email} ${s.nim}`.toLowerCase().includes(q)) return false;
			if (statusFilter !== 'all') {
				const f = finals.get(s.id);
				if (!f) return statusFilter === 'ungraded';
				const st = studentStatus(f, published);
				if (st !== statusFilter) return false;
			}
			return true;
		});
	}, [students, query, statusFilter, finals, published]);

	const weightTotal = totalWeight(allComponents);

	if (loading && students.length === 0 && allComponents.length === 0) {
		return (
			<div className="ld-loading">
				<LoaderCircle size={24} className="spin" /> {t('gb.loading')}
			</div>
		);
	}

	return (
		<div className="gb-wrap">
			{loadError && (
				<div className="ld-alert" role="alert">
					{loadError}{' '}
					<button
						type="button"
						onClick={() => {
							roster.reload();
							componentsQuery.reload();
							entriesQuery.reload();
							submissionsQuery.reload();
							overridesQuery.reload();
							publicationQuery.reload();
						}}
					>
						{t('gb.retry')}
					</button>
				</div>
			)}
			<header className="gb-head">
				<div className="gb-head-copy">
					<span className="ld-eyebrow">{t('gb.eyebrow')}</span>
					<h1 className="gb-title">{t('gb.title')}</h1>
					<p className="gb-sub">{t('gb.sub')}</p>
					<div className="gb-head-meta">
						<span>{course.code || t('gb.noCode')}</span>
						<span className="ld-dot" />
						<span>{course.title}</span>
						{published && <span className="gb-pub-badge">{t('gb.publishedBadge')}</span>}
					</div>
				</div>
				<div className="gb-head-actions">
					<SectionSelector sections={sections} value={classFilter} onChange={setClassFilter} />
					<button
						type="button"
						className="ld-outline-action"
						onClick={() => setTab('komponen')}
					>
						<Settings2 size={16} /> {t('gb.settings')}
					</button>
					<button
						type="button"
						className="ld-btn-primary"
						onClick={() => setAddOpen('assignment')}
					>
						<Plus size={16} /> {t('gb.add')}
					</button>
				</div>
			</header>

			<details className="pp-panel" style={{ margin: '16px 0' }}>
                <summary style={{ cursor: 'pointer' }}><strong>Pemetaan komponen penilaian</strong></summary>
                <button className="ld-outline-action" disabled={!rawComponents.some(c => c.sourceType)} onClick={() => void syncRps()}>Sinkronkan komponen ke RPS</button><p>Tugas formal otomatis masuk Tugas. Pindahkan ujian ke UTS/UAS; bobot internal 1 berarti semua tugas setara. Latihan personal tidak dihitung.</p>
                {!rawComponents.some(c => c.sourceType) && <button className="ld-btn-primary" onClick={() => void adoptDefaults()}>Gunakan Kehadiran, Tugas, UTS, UAS + Keaktivan</button>}
                {(assignmentsQuery.data || []).filter(a => activityTypeOf(a) === 'formal').map(a => <div key={a.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--p-line)' }}>
                    <span style={{ flex: '1 1 220px' }}>{a.title}{a.status === 'draft' ? ' · draf, belum dihitung' : ''}</span>
                    <label>Komponen<select aria-label={'Komponen ' + a.title} value={a.assessmentGroup || 'tasks'} onChange={e => void updateMapping(a, { assessmentGroup: e.target.value })}>
                        <option value="tasks">Tugas</option><option value="uts">UTS</option><option value="uas">UAS</option><option value="excluded">Tidak dihitung</option>
                    </select></label>
                    <label>Bobot internal<input aria-label={'Bobot internal ' + a.title} type="number" min={1} max={1000} defaultValue={a.assessmentWeight || 1} key={a.id + ':' + a.assessmentWeight} style={{ width: 80 }} onBlur={e => { const value = Number(e.target.value); if (Number.isFinite(value) && value >= 1 && value <= 1000) void updateMapping(a, { assessmentWeight: value }); else e.target.value = String(a.assessmentWeight || 1); }} /></label>
                </div>)}
                <a className="ld-outline-action" href={`/app/courses/${courseId}/absensi`}>Buka Absensi & Keaktivan →</a><p className="pp-muted">Kehadiran mengikuti pengaturan kredit terlambat dan izin/sakit pada komponen Kehadiran. Catatan absensi yang kosong membuat komponen belum lengkap. Keaktivan adalah bonus, bukan persentase bobot.</p>
            </details>
            <div className="gb-kpis">
				<Kpi icon={Users} tone="blue" value={String(students.length)} label={t('gb.kpi.students')} />
				<Kpi icon={TrendingUp} tone="teal" value={avg == null ? '—' : String(avg)} label={t('gb.kpi.avg')} />
				<Kpi icon={CheckCircle2} tone="green" value={highest == null ? '—' : String(highest)} label={t('gb.kpi.highest')} />
				<Kpi icon={BarChart3} tone="coral" value={lowest == null ? '—' : String(lowest)} label={t('gb.kpi.lowest')} />
				<Kpi icon={AlertTriangle} tone="red" value={String(notComplete)} label={t('gb.kpi.incomplete')} />
			</div>

			{weightTotal !== 100 && allComponents.length > 0 && (
				<div className="gb-weight-warn" role="alert">
					<AlertTriangle size={15} />
					<span>
						{t('gb.weightWarnPre')} <strong>{weightTotal}%</strong>{t('gb.weightWarnMid')}{' '}
						<button type="button" className="gb-warn-link" onClick={() => setTab('komponen')}>
							{t('gb.weightWarnLink')}
						</button>
					</span>
				</div>
			)}

			<nav className="gb-tabs" role="tablist" aria-label={t('gb.tab.nilai')}>
				<TabButton active={tab === 'nilai'} onClick={() => setTab('nilai')} icon={Table2} label={t('gb.tab.nilai')} />
				<TabButton active={tab === 'komponen'} onClick={() => setTab('komponen')} icon={LayoutGrid} label={t('gb.tab.komponen')} />
				<TabButton active={tab === 'analitik'} onClick={() => setTab('analitik')} icon={BarChart3} label={t('gb.tab.analitik')} />
			</nav>

			{tab === 'nilai' && (
				<NilaiTab
					students={filteredStudents}
					components={components}
					entriesByComponent={entriesByComponent}
					submissionsByAssignment={submissionsByAssignment}
					finals={finals}
					published={published}
					query={query}
					setQuery={setQuery}
					statusFilter={statusFilter}
					setStatusFilter={setStatusFilter}
					onSelectStudent={setSelectedStudent}
					onSaveGrade={saveManualGrade}
				/>
			)}

			{tab === 'komponen' && (
				<KomponenTab
					components={allComponents}
					availableAssignments={availableAssignments}
					entriesByComponent={entriesByComponent}
					submissionsByAssignment={submissionsByAssignment}
					weightTotal={weightTotal}
					onAdd={() => setAddOpen('assignment')}
					onEdit={(c) => setEditingComponent(c)}
					onArchive={archiveComponent}
					onDelete={deleteComponent}
				/>
			)}

			{tab === 'analitik' && (
				<AnalitikTab
					students={students}
					finals={finals}
					avg={avg}
					highest={highest}
					lowest={lowest}
				/>
			)}

			{/* Publish bar */}
			<div className="gb-publish-bar">
				<div className="gb-publish-info">
					{published ? (
						<>
							<CheckCircle2 size={16} />
							<span>{t('gb.pubBar.published')}</span>
						</>
					) : incompleteCount > 0 ? (
						<>
							<AlertTriangle size={16} />
							<span>{t('gb.pubBar.incomplete', { count: String(incompleteCount) })}</span>
						</>
					) : students.length > 0 ? (
						<>
							<CheckCircle2 size={16} />
							<span>{t('gb.pubBar.ready')}</span>
						</>
					) : (
						<span>{t('gb.pubBar.noStudents')}</span>
					)}
				</div>
				{published ? (
					<button type="button" className="ld-outline-action" onClick={() => void unpublish()}>
						{t('gb.pubBar.unpublish')}
					</button>
				) : (
					<button
						type="button"
						className="ld-btn-primary"
						onClick={() => setPublishOpen(true)}
						disabled={students.length === 0}
					>
						<CheckCircle2 size={16} /> {t('gb.pubBar.publish')}
					</button>
				)}
			</div>

			{selectedStudent && (
				<StudentDrawer
					studentId={selectedStudent}
					students={students}
					components={components}
					entriesByComponent={entriesByComponent}
					submissionsByAssignment={submissionsByAssignment}
					finals={finals}
					override={overridesByStudent.get(selectedStudent)}
					published={published}
					onClose={() => setSelectedStudent(null)}
					onSetOverride={setOverride}
				/>
			)}

			{addOpen && (
				<AddNilaiDialog
					availableAssignments={availableAssignments}
					onClose={() => setAddOpen(null)}
					onPickAssignment={(a) => {
						setAddOpen(null);
						sessionStorage.setItem('laras-gb-new-assignment', a.id);
						setEditingComponent('new');
					}}
					onManual={() => {
						setAddOpen(null);
						(sessionStorage as Storage).removeItem('laras-gb-new-assignment');
						setEditingComponent('new');
					}}
				/>
			)}

			{editingComponent && (
				<ComponentDialog
					component={editingComponent === 'new' ? null : editingComponent}
					courseId={courseId}
					availableAssignments={availableAssignments}
					onClose={() => {
						(sessionStorage as Storage).removeItem('laras-gb-new-assignment');
						setEditingComponent(null);
					}}
					onSaved={() => {
						(sessionStorage as Storage).removeItem('laras-gb-new-assignment');
						setEditingComponent(null);
						invalidate(`grade_components:course=${courseId}`);
						void componentsQuery.reload();
					}}
				/>
			)}

			{publishOpen && (
				<PublishDialog
					studentCount={students.length}
					incompleteCount={incompleteCount}
					onClose={() => setPublishOpen(false)}
					onConfirm={() => void publish()}
				/>
			)}
		</div>
	);
}

// ── KPI card ─────────────────────────────────────────────────────────────
function Kpi({
	icon: Icon,
	tone,
	value,
	label,
}: {
	icon: typeof Users;
	tone: 'blue' | 'teal' | 'green' | 'coral' | 'red';
	value: string;
	label: string;
}) {
	return (
		<div className="ld-stat">
			<div className="ld-stat-top">
				<span>{label}</span>
				<span className={`ld-stat-ico ${tone}`}>
					<Icon size={16} />
				</span>
			</div>
			<strong>{value}</strong>
		</div>
	);
}

// ── Tab button ────────────────────────────────────────────────────────────
function TabButton({
	active,
	onClick,
	icon: Icon,
	label,
}: {
	active: boolean;
	onClick: () => void;
	icon: typeof Table2;
	label: string;
}) {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={active}
			className={`gb-tab${active ? ' active' : ''}`}
			onClick={onClick}
		>
			<Icon size={15} />
			{label}
		</button>
	);
}

// ── NILAI tab: the spreadsheet gradebook ──────────────────────────────────
function NilaiTab({
	students,
	components,
	entriesByComponent,
	submissionsByAssignment,
	finals,
	published,
	query,
	setQuery,
	statusFilter,
	setStatusFilter,
	onSelectStudent,
	onSaveGrade,
}: {
	students: GradebookStudent[];
	components: GradeComponent[];
	entriesByComponent: Map<string, Map<string, GradeEntry>>;
	submissionsByAssignment: Map<string, Map<string, AssignmentSubmission>>;
	finals: Map<string, ReturnType<typeof calculateFinalGrade>>;
	published: boolean;
	query: string;
	setQuery: (v: string) => void;
	statusFilter: StudentStatus | 'all';
	setStatusFilter: (v: StudentStatus | 'all') => void;
	onSelectStudent: (id: string) => void;
	onSaveGrade: (c: GradeComponent, studentId: string, value: number | null, note?: string) => Promise<void>;
}) {
	const t = useT();
	if (students.length === 0) {
		return (
			<div className="ld-empty ld-empty-lg">
				<div className="ld-empty-icon">
					<Users size={26} strokeWidth={1.4} />
				</div>
				<h3>{t('gb.empty.title')}</h3>
				<p>{t('gb.empty.body')}</p>
			</div>
		);
	}
	const statusOptions: { value: StudentStatus | 'all'; label: string }[] = [
		{ value: 'all', label: t('gb.filter.all') },
		{ value: 'ungraded', label: t('gb.filter.ungraded') },
		{ value: 'incomplete', label: t('gb.filter.incomplete') },
		{ value: 'complete', label: t('gb.filter.complete') },
		{ value: 'published', label: t('gb.filter.published') },
	];
	return (
		<div className="gb-nilai">
			<div className="gb-toolbar">
				<label className="gb-search">
					<Search size={14} />
					<input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={t('gb.search.placeholder')}
						aria-label={t('gb.search.aria')}
					/>
				</label>
				<div className="gb-filters" role="group" aria-label={t('gb.filters.aria')}>
					{statusOptions.map((o) => (
						<button
							key={o.value}
							type="button"
							className={`gb-filter${statusFilter === o.value ? ' active' : ''}`}
							onClick={() => setStatusFilter(o.value)}
						>
							{o.label}
						</button>
					))}
				</div>
			</div>
			{components.length === 0 && (
				<p className="gb-foot-hint">
					{t('gb.hint.noComponents')}
				</p>
			)}
			<div className="gb-table-wrap" role="region" aria-label={t('gb.table.aria')} tabIndex={0}>
				<table className="gb-table">
					<caption className="sr-only">{t('gb.table.caption')}</caption>
					<thead>
						<tr>
							<th scope="col" className="gb-th-name">{t('gb.th.student')}</th>
							{components.map((c) => (
								<th key={c.id} scope="col" className="gb-th-comp">
									<span className="gb-th-comp-name">{c.name}</span>
									<span className="gb-th-comp-meta">
										{c.sourceType === 'bonus' ? 'Bonus keaktivan' : c.computed || ['tasks','attendance'].includes(c.sourceType || '') ? 'Otomatis' : c.kind === 'assignment' ? t('gb.fromAssignment') : t('gb.manual')} · {c.sourceType === 'bonus' ? '+' + c.maxScore + ' poin maks.' : (c.weight ?? 0) + '%'}
									</span>
								</th>
							))}
							<th scope="col" className="gb-th-final">{t('gb.th.final')}</th>
							<th scope="col" className="gb-th-grade">{t('gb.th.grade')}</th>
							<th scope="col" className="gb-th-status">{t('gb.th.status')}</th>
						</tr>
					</thead>
					<tbody>
						{students.map((s) => {
							const f = finals.get(s.id)!;
							const st = studentStatus(f, published);
							return (
								<tr key={s.id}>
									<th scope="row" className="gb-td-name">
										<button
											type="button"
											className="gb-student-btn"
											onClick={() => onSelectStudent(s.id)}
										>
											<span className="gb-student-avatar">
												{s.name.charAt(0).toUpperCase()}
											</span>
											<span className="gb-student-id">
												<strong>{s.name}</strong>
												<small>
													{s.nim || t('gb.nimMissing')}
													{s.section ? ` · ${s.section}` : ''}
												</small>
											</span>
										</button>
									</th>
									{components.map((c) => (
										<td
											key={c.id}
											className="gb-td-cell"
											data-student={s.id}
											data-component={c.id}
										>
											<GradeCell
												component={c}
												studentId={s.id}
												entriesByComponent={entriesByComponent}
												submissionsByAssignment={submissionsByAssignment}
												onSave={onSaveGrade}
											/>
										</td>
									))}
									<td className="gb-td-final">
										{f.overridden ? (
											<span className="gb-final-override" title={t('gb.overrideTitle')}>
												{f.value ?? '—'}
											</span>
										) : (
											<span>{f.value ?? '—'}</span>
										)}
									</td>
									<td className="gb-td-grade">{f.letter ?? '—'}</td>
									<td className="gb-td-status">
										<span className={`gb-status gb-status-${st}`}>{STATUS_LABEL[st]}</span>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			<p className="gb-foot-hint">
				{t('gb.footHintPre')} <kbd>{t('gb.footHintEnter')}</kbd> {t('gb.footHintMid')}{' '}
				<kbd>{t('gb.footHintTab')}</kbd> {t('gb.footHintMid2')} <em>{t('gb.footHintEm')}</em> {t('gb.footHintPost')}
			</p>
		</div>
	);
}

// ── Grade cell (inline entry for manual; read-only display for assignment) ─
function GradeCell({
	component,
	studentId,
	entriesByComponent,
	submissionsByAssignment,
	onSave,
}: {
	component: GradeComponent;
	studentId: string;
	entriesByComponent: Map<string, Map<string, GradeEntry>>;
	submissionsByAssignment: Map<string, Map<string, AssignmentSubmission>>;
	onSave: (c: GradeComponent, studentId: string, value: number | null, note?: string) => Promise<void>;
}) {
	const t = useT();
	const { score, source, aiEvaluated } = componentScore(
		component,
		studentId,
		entriesByComponent,
		submissionsByAssignment,
	);
	const entry = entriesByComponent.get(component.id)?.get(studentId);
	const rawValue = component.kind === 'manual' ? entry?.value ?? '' : '';
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(String(rawValue));
    const [bonusNote,setBonusNote] = useState(entry?.note || '');
	const [error, setError] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!editing) setDraft(String(rawValue));
	}, [rawValue, editing]);

	useEffect(() => {
		if (editing) inputRef.current?.focus();
	}, [editing]);

	if (component.kind === 'assignment' || component.computed) {
		return (
			<div className="gb-cell-assignment" title={component.computed?.[studentId]?.detail || (aiEvaluated ? t('gb.cell.aiTitle') : t('gb.cell.submissionTitle'))}>
				{score == null ? (
					<span className="gb-cell-empty">—</span>
				) : (
					<span className="gb-cell-value">{component.sourceType === "bonus" ? "+" + score : score}</span>
				)}
				{component.computed && <details style={{ fontSize: 10 }}><summary>{component.computed[studentId]?.detail.split(";")[0]}</summary><p style={{ whiteSpace: "pre-wrap", minWidth: 220 }}>{component.computed[studentId]?.detail}</p></details>}
{aiEvaluated && <Sparkles size={11} className="gb-ai-ico" aria-label={t('gb.cell.aiLabel')} />}
			</div>
		);
	}

	const commit = async (moveDown?: boolean) => {
		const parsed = parseGradeInput(draft, component.maxScore || 100);
		if (parsed.error) {
			setError(parsed.error);
			return;
		}
		const current = entry?.value ?? null;
		if (component.sourceType === 'bonus' && (parsed.value || 0) > 0 && !bonusNote.trim()) { setError('Tuliskan alasan bonus keaktivan.'); return; }
        if (parsed.value === current && bonusNote === (entry?.note || '')) {
			setEditing(false);
			setError('');
			if (moveDown) focusNextCell(studentId, component.id);
			return;
		}
		try {
			await onSave(component, studentId, parsed.value, component.sourceType === 'bonus' ? bonusNote.trim().slice(0,1000) : undefined);
			setEditing(false);
			setError('');
			if (moveDown) focusNextCell(studentId, component.id);
		} catch {
			setError(t('gb.cell.saveError'));
		}
	};

	if (!editing) {
		return (
			<button
				type="button"
				className="gb-cell-display"
				onClick={() => setEditing(true)}
				aria-label={t('gb.cell.displayAria', { name: component.name })}
			>
				{entry?.value == null ? (
					<span className="gb-cell-empty">—</span>
				) : (
					<span className="gb-cell-value">{component.sourceType === "bonus" ? "+" + entry.value : entry.value}</span>
				)}
			</button>
		);
	}
	return (
		<div className="gb-cell-edit">
			<input
				ref={inputRef}
				type="text"
				inputMode="decimal"
				value={draft}
				onChange={(e) => {
					setDraft(e.target.value);
					setError('');
				}}
				onKeyDown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						void commit(true);
					} else if (e.key === 'Escape') {
						e.preventDefault();
						setDraft(String(rawValue));
						setError('');
						setEditing(false);
					}
				}}
				onBlur={() => { if(component.sourceType !== 'bonus') void commit(false); }}
				aria-label={t('gb.cell.inputAria', { name: component.name, max: String(component.maxScore || 100) })}
				aria-invalid={Boolean(error) || undefined}
			/>
			{component.sourceType === 'bonus' && <><input aria-label="Alasan bonus keaktivan" placeholder="Alasan bonus" value={bonusNote} maxLength={1000} onChange={e=>setBonusNote(e.target.value)} /><button className="ld-outline-action" onClick={()=>void commit(false)}>Simpan</button></>}
{error && <span className="gb-cell-error">{error}</span>}
		</div>
	);
}

/** Moves focus to the grade cell directly below (Enter → next student). */
function focusNextCell(studentId: string, componentId: string) {
	if (typeof document === 'undefined') return;
	const cell = document.querySelector<HTMLTableCellElement>(
		`td.gb-td-cell[data-student="${studentId}"][data-component="${componentId}"]`,
	);
	const currentRow = cell?.closest('tr');
	const nextRow = currentRow?.nextElementSibling as HTMLTableRowElement | null;
	if (!currentRow || !nextRow) return;
	const colIndex = Array.from(currentRow.children).indexOf(cell!);
	const targetCell = nextRow.children[colIndex] as HTMLTableCellElement | undefined;
	targetCell?.querySelector<HTMLButtonElement>('.gb-cell-display')?.click();
}

// ── KOMPONEN tab ──────────────────────────────────────────────────────────
function KomponenTab({
	components,
	availableAssignments,
	entriesByComponent,
	submissionsByAssignment,
	weightTotal,
	onAdd,
	onEdit,
	onArchive,
	onDelete,
}: {
	components: GradeComponent[];
	availableAssignments: Assignment[];
	entriesByComponent: Map<string, Map<string, GradeEntry>>;
	submissionsByAssignment: Map<string, Map<string, AssignmentSubmission>>;
	weightTotal: number;
	onAdd: () => void;
	onEdit: (c: GradeComponent) => void;
	onArchive: (c: GradeComponent) => Promise<void>;
	onDelete: (c: GradeComponent) => Promise<void>;
}) {
	const t = useT();
	return (
		<div className="gb-komponen">
			<div className="gb-komponen-head">
				<div>
					<h2>{t('gb.komponen.title')}</h2>
					<p>{t('gb.komponen.weightPre')} <strong className={weightTotal === 100 ? 'ok' : 'warn'}>{weightTotal}%</strong>{weightTotal === 100 ? '' : ' ' + t('gb.komponen.weightSuggest')}</p>
				</div>
				<button type="button" className="ld-btn-primary" onClick={onAdd}>
					<Plus size={16} /> {t('gb.add')}
				</button>
			</div>
			{components.length === 0 ? (
				<div className="ld-empty">
					<div className="ld-empty-icon">
						<LayoutGrid size={24} strokeWidth={1.4} />
					</div>
					<h3>{t('gb.komponen.empty.title')}</h3>
					<p>{t('gb.komponen.empty.body')}</p>
				</div>
			) : (
				<ul className="gb-comp-list">
					{components.map((c) => {
						const graded =
							c.kind === 'manual'
								? entriesByComponent.get(c.id)?.size ?? 0
								: submissionsByAssignment.get(c.assignment)?.size ?? 0;
						return (
							<li key={c.id} className={`gb-comp-row${c.status === 'archived' ? ' archived' : ''}`}>
								<div className="gb-comp-main">
									<strong>{c.name}</strong>
									<small>
										{c.sourceType === 'bonus' ? 'Bonus keaktivan' : c.computed || ['tasks','attendance'].includes(c.sourceType || '') ? 'Otomatis' : c.kind === 'assignment' ? t('gb.fromAssignment') : t('gb.manual')} · {t('gb.komponen.max')} {c.maxScore || 100} · {t('gb.komponen.weight')} {c.sourceType === 'bonus' ? '+' + c.maxScore + ' poin maks.' : (c.weight ?? 0) + '%'}
										{c.expand?.assignment ? ` · ${c.expand.assignment.title}` : ''}
										{graded > 0 ? ` · ${graded} ${t('gb.komponen.graded')}` : ''}
									</small>
									{c.description && <p>{c.description}</p>}
								</div>
								<div className="gb-comp-actions">
									<OverflowMenu label={t('gb.menu.aria')}>
										<button type="button" role="menuitem" onClick={() => onEdit(c)}>
											<Pencil size={16} /> {t('gb.menu.edit')}
										</button>
										<button type="button" role="menuitem" onClick={() => void onArchive(c)}>
											<Archive size={16} /> {t('gb.menu.archive')}
										</button>
										<button
											type="button"
											role="menuitem"
											className="danger"
											onClick={() => void onDelete(c)}
										>
											<Trash2 size={16} /> {t('gb.menu.delete')}
										</button>
									</OverflowMenu>
								</div>
							</li>
						);
					})}
				</ul>
			)}
			<div className="gb-calc-note">
				<span className="ld-eyebrow">{t('gb.calc.eyebrow')}</span>
				<p>
					{t('gb.calc.body')}
				</p>
			</div>
		</div>
	);
}

// ── ANALITIK tab ──────────────────────────────────────────────────────────
function AnalitikTab({
	students,
	finals,
	avg,
	highest,
	lowest,
}: {
	students: GradebookStudent[];
	finals: Map<string, ReturnType<typeof calculateFinalGrade>>;
	avg: number | null;
	highest: number | null;
	lowest: number | null;
}) {
	const t = useT();
	const distribution = useMemo(() => {
		const counts = new Map<string, number>();
		for (const letter of LETTER_GRADES) counts.set(letter, 0);
		let noGrade = 0;
		for (const s of students) {
			const f = finals.get(s.id);
			if (!f?.letter) noGrade++;
			else counts.set(f.letter, (counts.get(f.letter) ?? 0) + 1);
		}
		return { counts, noGrade };
	}, [students, finals]);
	const maxCount = Math.max(1, ...Array.from(distribution.counts.values()));
	const completeCount = students.length - distribution.noGrade;
	const completionRate = students.length
		? Math.round((completeCount / students.length) * 100)
		: 0;
	return (
		<div className="gb-analitik">
			<div className="gb-kpis">
				<Kpi icon={TrendingUp} tone="teal" value={avg == null ? '—' : String(avg)} label={t('gb.analitik.avg')} />
				<Kpi icon={CheckCircle2} tone="green" value={highest == null ? '—' : String(highest)} label={t('gb.analitik.highest')} />
				<Kpi icon={BarChart3} tone="coral" value={lowest == null ? '—' : String(lowest)} label={t('gb.analitik.lowest')} />
				<Kpi icon={Users} tone="blue" value={`${completionRate}%`} label={t('gb.analitik.completion')} />
			</div>
			<section className="ld-panel gb-dist-panel">
				<div className="ld-card-head">
					<h2>{t('gb.analitik.dist')}</h2>
				</div>
				<div className="gb-dist">
					{LETTER_GRADES.map((letter) => {
						const count = distribution.counts.get(letter) ?? 0;
						return (
							<div key={letter} className="gb-dist-bar">
								<span className="gb-dist-letter">{letter}</span>
								<div className="gb-dist-track">
									<span
										className="gb-dist-fill"
										style={{ width: `${(count / maxCount) * 100}%` }}
									/>
								</div>
								<span className="gb-dist-count">{count}</span>
							</div>
						);
					})}
					<div className="gb-dist-bar">
						<span className="gb-dist-letter muted">—</span>
						<div className="gb-dist-track">
							<span
								className="gb-dist-fill muted"
								style={{ width: `${(distribution.noGrade / maxCount) * 100}%` }}
							/>
						</div>
						<span className="gb-dist-count">{distribution.noGrade}</span>
					</div>
				</div>
			</section>
		</div>
	);
}

// ── Student detail drawer ─────────────────────────────────────────────────
function StudentDrawer({
	studentId,
	students,
	components,
	entriesByComponent,
	submissionsByAssignment,
	finals,
	override,
	published,
	onClose,
	onSetOverride,
}: {
	studentId: string;
	students: GradebookStudent[];
	components: GradeComponent[];
	entriesByComponent: Map<string, Map<string, GradeEntry>>;
	submissionsByAssignment: Map<string, Map<string, AssignmentSubmission>>;
	finals: Map<string, ReturnType<typeof calculateFinalGrade>>;
	override: GradeOverride | undefined;
	published: boolean;
	onClose: () => void;
	onSetOverride: (studentId: string, value: number | null, note?: string) => Promise<void>;
}) {
	const t = useT();
	const student = students.find((s) => s.id === studentId);
	const f = finals.get(studentId);
	const [overrideDraft, setOverrideDraft] = useState(override ? String(override.value) : '');
	const [overrideErr, setOverrideErr] = useState('');
	useEffect(() => {
		setOverrideDraft(override ? String(override.value) : '');
		setOverrideErr('');
	}, [override, studentId]);
	if (!student || !f) return null;
	const st = studentStatus(f, published);
	return (
		<div className="gb-drawer-scrim" role="dialog" aria-modal="true" aria-label={t('gb.drawer.aria')}>
			<div className="gb-drawer">
				<header className="gb-drawer-head">
					<div className="gb-drawer-who">
						<span className="gb-student-avatar lg">{student.name.charAt(0).toUpperCase()}</span>
						<div>
							<h2>{student.name}</h2>
							<small>{student.email}</small>
						</div>
					</div>
					<button type="button" className="gb-drawer-close" aria-label={t('gb.drawer.close')} onClick={onClose}>
						<X size={20} />
					</button>
				</header>
				<div className="gb-drawer-final">
					<div>
						<span className="ld-eyebrow">{t('gb.drawer.final')}</span>
						<strong className="gb-drawer-final-value">
							{f.value ?? '—'} <small>{f.letter ?? ''}</small>
						</strong>
						<span className={`gb-status gb-status-${st}`}>{STATUS_LABEL[st]}</span>
					</div>
				</div>
				<div className="gb-drawer-section">
					<h3>{t('gb.drawer.detail')}</h3>
					<ul className="gb-drawer-grades">
						{components.map((c) => {
							const { score, aiEvaluated } = componentScore(
								c,
								studentId,
								entriesByComponent,
								submissionsByAssignment,
							);
							return (
								<li key={c.id}>
									<div className="gb-drawer-grade-main">
										<strong>{c.name}</strong>
										<small>
											{c.sourceType === 'bonus' ? 'Bonus keaktivan' : c.computed || ['tasks','attendance'].includes(c.sourceType || '') ? 'Otomatis' : c.kind === 'assignment' ? t('gb.fromAssignment') : t('gb.manual')} · {t('gb.komponen.weight')} {c.sourceType === 'bonus' ? '+' + c.maxScore + ' poin maks.' : (c.weight ?? 0) + '%'}
											{aiEvaluated && (
												<span className="gb-ai-tag" title={t('gb.cell.aiLabel')}>
													<Sparkles size={10} /> AI
												</span>
											)}
										</small>
									</div>
									<span className="gb-drawer-grade-value">
										{score == null ? '—' : score}
									</span>
									{c.kind === 'assignment' && c.assignment && (
										<Link
											to={`/app/tugas/${c.assignment}`}
											className="gb-drawer-eval-link"
											title={t('gb.drawer.evalLink')}
										>
											<ExternalLink size={13} />
										</Link>
									)}
								</li>
							);
						})}
					</ul>
					{components.length === 0 && <p className="gb-empty-line">{t('gb.drawer.noComponents')}</p>}
				</div>
				<div className="gb-drawer-section">
					<h3>{t('gb.drawer.override')}</h3>
					<p className="gb-drawer-hint">
						{t('gb.drawer.overrideHint')}
					</p>
					<div className="gb-override-row">
						<input
							type="text"
							inputMode="decimal"
							value={overrideDraft}
							onChange={(e) => {
								setOverrideDraft(e.target.value);
								setOverrideErr('');
							}}
							placeholder={f.value != null ? String(f.value) : '0–100'}
							aria-label={t('gb.drawer.overrideAria')}
							aria-invalid={Boolean(overrideErr) || undefined}
						/>
						<button
							type="button"
							className="ld-outline-action"
							onClick={() => {
								const parsed = parseGradeInput(overrideDraft, 100);
								if (parsed.error) {
									setOverrideErr(parsed.error || t('gb.drawer.overrideInvalid'));
									return;
								}
								void onSetOverride(studentId, parsed.value);
							}}
						>
							{t('gb.drawer.saveOverride')}
						</button>
						{override && (
							<button
								type="button"
								className="ld-btn-quiet"
								onClick={() => void onSetOverride(studentId, null)}
							>
								{t('gb.drawer.removeOverride')}
							</button>
						)}
					</div>
					{overrideErr && <span className="gb-cell-error">{overrideErr}</span>}
					{override && (
						<p className="gb-override-active">
							{t('gb.drawer.overrideActive')} <strong>{override.value}</strong> ({override.note || t('gb.drawer.noNote')})
						</p>
					)}
				</div>
				<div className="gb-drawer-section">
					<Link to={`/app/tugas`} className="ld-text-btn">
						{t('gb.drawer.viewEval')} <ChevronRight size={13} />
					</Link>
				</div>
			</div>
		</div>
	);
}

// ── Add Nilai dialog ──────────────────────────────────────────────────────
function AddNilaiDialog({
	availableAssignments,
	onClose,
	onPickAssignment,
	onManual,
}: {
	availableAssignments: Assignment[];
	onClose: () => void;
	onPickAssignment: (a: Assignment) => void;
	onManual: () => void;
}) {
	const t = useT();
	return (
		<AppModal open onClose={onClose} title={t('gb.addDialog.heading')}>
			<div className="modal-top">
				<span>{t('gb.addDialog.title')}</span>
					<button type="button" aria-label={t('gb.drawer.close')} onClick={onClose}>
						<X size={18} />
					</button>
				</div>
				<h2>{t('gb.addDialog.heading')}</h2>
				<p>{t('gb.addDialog.body')}</p>
				<div className="gb-add-options">
					<button type="button" className="gb-add-option" onClick={onManual}>
						<span className="gb-add-ico"><Pencil size={18} /></span>
						<strong>{t('gb.addDialog.manual')}</strong>
						<small>{t('gb.addDialog.manualDesc')}</small>
					</button>
					<div className="gb-add-option list">
						<span className="gb-add-ico"><ClipboardList size={18} /></span>
						<strong>{t('gb.addDialog.fromTask')}</strong>
						<small>{t('gb.addDialog.fromTaskDesc')}</small>
						{availableAssignments.length === 0 ? (
							<span className="gb-add-empty">{t('gb.addDialog.noTasks')}</span>
						) : (
							<ul className="gb-add-assignments">
								{availableAssignments.map((a) => (
									<li key={a.id}>
										<button type="button" onClick={() => onPickAssignment(a)}>
											<span>{a.title}</span>
											<ChevronRight size={14} />
										</button>
									</li>
								))}
							</ul>
						)}
					</div>
				</div>
		</AppModal>
	);
}

// ── Component create/edit dialog ──────────────────────────────────────────
function ComponentDialog({
	component,
	courseId,
	availableAssignments,
	onClose,
	onSaved,
}: {
	component: GradeComponent | null;
	courseId: string;
	availableAssignments: Assignment[];
	onClose: () => void;
	onSaved: () => void;
}) {
	const t = useT();
	const me = pb.authStore.record?.id || '';
	const preselectedAssignment =
		typeof window !== 'undefined' ? sessionStorage.getItem('laras-gb-new-assignment') : null;
	const isAssignment = component
		? component.kind === 'assignment'
		: Boolean(preselectedAssignment);
	const [name, setName] = useState(component?.name ?? '');
	const [description, setDescription] = useState(component?.description ?? '');
	const [maxScore, setMaxScore] = useState(String(component?.maxScore ?? 100));
	const [weight, setWeight] = useState(String(component?.weight ?? 0));
    const [lateCredit,setLateCredit] = useState(component?.attendanceLateCredit ?? 1);
    const [excusedCredit,setExcusedCredit] = useState(component?.attendanceExcusedCredit ?? 0);
	const [kind, setKind] = useState<'manual' | 'assignment'>(
		isAssignment ? 'assignment' : (component?.kind ?? 'manual'),
	);
	const [assignmentId, setAssignmentId] = useState(
		component?.assignment || preselectedAssignment || '',
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	const submit = async () => {
		setError('');
		if (!name.trim()) {
			setError(t('gb.compDialog.errName'));
			return;
		}
		const max = Number(maxScore);
		const w = Number(weight);
		if (Number.isNaN(max) || max <= 0) {
			setError(t('gb.compDialog.errMax'));
			return;
		}
		if (Number.isNaN(w) || w < 0 || w > 100) {
			setError(t('gb.compDialog.errWeight'));
			return;
		}
		if (kind === 'assignment' && !assignmentId) {
			setError(t('gb.compDialog.errTask'));
			return;
		}
		setSaving(true);
		const order = component?.order ?? Date.now();
		const payload = {
			owner: me,
			course: courseId,
        name: name.trim(),
        attendanceLateCredit: lateCredit,
        attendanceExcusedCredit: excusedCredit,
			description: description.trim(),
			maxScore: component?.sourceType && component.sourceType !== 'bonus' ? 100 : max, bonusMax: component?.sourceType === 'bonus' ? max : 0,
			weight: component?.sourceType === 'bonus' ? 0 : w,
			kind,
			assignment: kind === 'assignment' ? assignmentId : '',
			order,
			status: component?.status ?? 'active',
		};
		try {
			if (component) {
				await pb.collection('grade_components').update(component.id, payload);
			} else {
				await pb.collection('grade_components').create(payload, {
					requestKey: `gc-${courseId}-${Date.now()}`,
				});
			}
			onSaved();
		} catch (err) {
			setError(t('gb.compDialog.errSave'));
			console.error(err);
		} finally {
			setSaving(false);
		}
	};
	return (
		<AppModal open onClose={onClose} title={component ? t('gb.compDialog.edit') : t('gb.compDialog.new')}>
			<div className="modal-top">
				<span>{component ? t('gb.compDialog.edit') : t('gb.compDialog.new')}</span>
					<button type="button" aria-label={t('gb.drawer.close')} onClick={onClose}>
						<X size={18} />
					</button>
				</div>
				<h2>{component ? component.name : t('gb.compDialog.newTitle')}</h2>
				<p>{t('gb.compDialog.body')}</p>
				<div className="editor-form">
					<label>
						<span>{t('gb.compDialog.name')}</span>
						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder={t('gb.compDialog.namePlaceholder')}
						/>
					</label>
					<label>
						<span>{t('gb.compDialog.desc')}</span>
						<textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={2}
							placeholder={t('gb.compDialog.descPlaceholder')}
						/>
					</label>
					<div className="form-two">
						<label>
							<span>{t('gb.compDialog.max')}</span>
							<input
								type="number"
								inputMode="numeric"
								value={maxScore}
								onChange={(e) => setMaxScore(e.target.value)}
							/>
						</label>
						<label>
							<span>{t('gb.compDialog.weight')}</span>
							<input
								type="number"
								inputMode="numeric"
								value={weight}
								onChange={(e) => setWeight(e.target.value)}
							/>
						</label>
					</div>
					<label>
						{component?.sourceType === 'attendance' && <div style={{display:'flex',gap:12}}>
    <label>Kredit terlambat<select value={lateCredit} onChange={e=>setLateCredit(Number(e.target.value))}><option value={1}>100%</option><option value={0.5}>50%</option><option value={0}>0%</option></select></label>
    <label>Kredit izin/sakit<select value={excusedCredit} onChange={e=>setExcusedCredit(Number(e.target.value))}><option value={0}>0%</option><option value={0.5}>50%</option><option value={1}>100%</option></select></label>
</div>}
<span>{t('gb.compDialog.source')}</span>
						<select
							value={kind}
							onChange={(e) => setKind(e.target.value as 'manual' | 'assignment')}
							disabled={Boolean(component)}
						>
							<option value="manual">{t('gb.compDialog.sourceManual')}</option>
							<option value="assignment">{t('gb.compDialog.sourceAssignment')}</option>
						</select>
					</label>
					{kind === 'assignment' && (
						<label>
							<span>{t('gb.compDialog.linkedTask')}</span>
							<select
								value={assignmentId}
								onChange={(e) => setAssignmentId(e.target.value)}
								disabled={Boolean(component)}
							>
								<option value="">{t('gb.compDialog.pickTask')}</option>
								{availableAssignments.map((a) => (
									<option key={a.id} value={a.id}>
										{a.title}
									</option>
								))}
								{component?.assignment && !availableAssignments.some((a) => a.id === component.assignment) && (
									<option value={component.assignment}>{component.expand?.assignment?.title || t('gb.compDialog.linkedFallback')}</option>
								)}
							</select>
						</label>
					)}
					{error && <p className="form-error">{error}</p>}
					<div className="modal-actions">
						<button type="button" className="ld-btn-quiet" onClick={onClose}>
							{t('gb.compDialog.cancel')}
						</button>
						<button type="button" className="ld-btn-primary" onClick={() => void submit()} disabled={saving}>
							{saving ? <LoaderCircle size={16} className="spin" /> : <CheckCircle2 size={16} />}
							{t('gb.compDialog.save')}
						</button>
					</div>
				</div>
		</AppModal>
	);
}

// ── Publish confirmation dialog ──────────────────────────────────────────
function PublishDialog({
	studentCount,
	incompleteCount,
	onClose,
	onConfirm,
}: {
	studentCount: number;
	incompleteCount: number;
	onClose: () => void;
	onConfirm: () => void;
}) {
	const t = useT();
	return (
		<AppModal open onClose={onClose} title={t('gb.pubDialog.title')}>
			<div className="modal-top">
				<span>{t('gb.pubDialog.title')}</span>
					<button type="button" aria-label={t('gb.drawer.close')} onClick={onClose}>
						<X size={18} />
					</button>
				</div>
				<h2>{t('gb.pubDialog.heading')}</h2>
				<p>
					{incompleteCount > 0
						? t('gb.pubDialog.incomplete', { count: String(incompleteCount), total: String(studentCount) })
						: t('gb.pubDialog.complete', { total: String(studentCount) })}
				</p>
				<div className="modal-actions">
					<button type="button" className="ld-btn-quiet" onClick={onClose}>
						{t('gb.pubDialog.review')}
					</button>
					<button type="button" className="ld-btn-primary" onClick={onConfirm}>
						<CheckCircle2 size={16} /> {t('gb.pubDialog.confirm')}
					</button>
				</div>
		</AppModal>
	);
}
