import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
	AlertTriangle,
	ArrowRight,
	BookOpenText,
	CalendarDays,
	Check,
	CheckCircle2,
	ChevronDown,
	CircleDashed,
	ClipboardList,
	FileText,
	GraduationCap,
	Library,
	LoaderCircle,
	Paperclip,
	Pencil,
	Plus,
	Scale,
	Sparkles,
	Users,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import type { Course, ClassSession, Enrollment, CollaborativeTask } from '@/lib/learning';
import type { CourseRecords } from '@/hooks/use-course-records';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { useCourseResources } from '@/hooks/use-course-resources';
import {
	validateRps,
	validationFromRecords,
	type ValidationCategory,
} from '@/lib/rps-validation';
import { RpsAiHelper } from '@/components/app/rps-ai-helper';
import type { FixContext } from '@/lib/rps-fix';
import { useCourseAssignments } from '@/hooks/use-course-assignments';
import { activityTypeOf, deadlineLabel, isPastDeadline } from '@/lib/assignments';

type EnrichedEnrollment = Enrollment & { expand?: { owner?: { name?: string; email?: string } } };

type SectionStatus = {
	/** 0–100 completion for this section. */
	pct: number;
	/** Short Indonesian label, e.g. "3 CPL · 4 CPMK". */
	summary: string;
	/** True when the section has no data at all. */
	empty: boolean;
};

type Props = {
	course: Course;
	sessions: ClassSession[];
	records: CourseRecords;
	isFacultyOwner: boolean;
	isStudent: boolean;
	onEditCourse: () => void;
	onAddSession: () => void;
	onTab: (tab: 'rps' | 'syllabus' | 'sessions' | 'materials' | 'assignments') => void;
};

/** Maps a validation category to the RPS editor step that fixes it. */
const CATEGORY_STEP: Record<ValidationCategory, number> = {
	subcpmk: 3,
	weekly: 3,
	assessment: 5,
	workload: 4,
};

export function CourseWorkspace({
	course,
	sessions,
	records,
	isFacultyOwner,
	isStudent,
	onEditCourse,
	onAddSession,
	onTab,
}: Props) {
	const navigate = useNavigate();
	const { cpl, cpmk, subCpmk, topics, assessments } = records;

	// Cached reads — the students panel and tugas kolaboratif reuse rows from
	// the local cache instead of re-querying PocketBase on every visit.
	const enrollmentsQuery = useCachedQuery<EnrichedEnrollment[]>(
		isStudent ? null : `enrollments:course=${course.id}`,
		() =>
			pb.collection('enrollments').getFullList<EnrichedEnrollment>({
				filter: pb.filter('course = {:id}', { id: course.id }),
				expand: 'owner',
				sort: '-created',
			}),
	);
	const collabQuery = useCachedQuery<CollaborativeTask[]>(
		`collaborative_tasks:course=${course.id}`,
		() =>
			pb.collection('collaborative_tasks').getFullList<CollaborativeTask>({
				filter: pb.filter('course = {:id}', { id: course.id }),
				sort: 'order,created',
			}),
	);
	const enrollments = enrollmentsQuery.data ?? [];
	const enrollLoading = !isStudent && enrollmentsQuery.loading;
	const collabTasks = collabQuery.data ?? [];

	const validation = useMemo(
		() =>
			validateRps(
				validationFromRecords({
					credits: course.credits ?? null,
					workloadLecture: course.workloadLecture ?? null,
					workloadTutorial: course.workloadTutorial ?? null,
					workloadPractice: course.workloadPractice ?? null,
					workloadIndependent: course.workloadIndependent ?? null,
					workloadTotal: course.workloadTotal ?? null,
					sessions,
					assessments,
					cpmkCount: cpmk.length,
					subCpmkCount: subCpmk.length,
				}),
			),
		[course, sessions, assessments, cpmk, subCpmk],
	);

	const fixContext: FixContext = useMemo(
		() => ({
			courseId: course.id,
			workloadLecture: course.workloadLecture ?? null,
			workloadTutorial: course.workloadTutorial ?? null,
			workloadPractice: course.workloadPractice ?? null,
			workloadIndependent: course.workloadIndependent ?? null,
			workloadTotal: course.workloadTotal ?? null,
			sessions: sessions.map((s) => ({
				id: s.id,
				week: s.week,
				title: s.title || '',
				topic: s.topic || '',
				notes: s.notes || '',
				specialWeekType: s.specialWeekType || '',
				subCpmks: s.subCpmks || [],
				topics: s.topics || [],
				assessments: s.assessments || [],
				learningIndicator: s.learningIndicator || '',
				learningMaterial: s.learningMaterial || '',
				assessmentMethod: s.assessmentMethod || '',
				synchronousMethod: s.synchronousMethod || '',
				asynchronousMethod: s.asynchronousMethod || '',
			})),
			subCpmk,
			topics,
			assessments,
		}),
		[course, sessions, subCpmk, topics, assessments],
	);

	// ── Section statuses ───────────────────────────────────────
	const identityFields = [
		{ label: 'Nama', value: course.title },
		{ label: 'Kode', value: course.code },
		{ label: 'Semester', value: course.semester },
		{ label: 'Tahun Akademik', value: course.academicYear },
		{ label: 'SKS', value: course.credits != null ? String(course.credits) : '' },
		{ label: 'Dosen Pengampu', value: course.lecturerName },
		{ label: 'Deskripsi', value: course.description },
	];
	const identityFilled = identityFields.filter((f) => String(f.value || '').trim()).length;
	const identityStatus: SectionStatus = {
		pct: Math.round((identityFilled / identityFields.length) * 100),
		summary: `${identityFilled}/${identityFields.length} terisi`,
		empty: identityFilled === 0,
	};

	const capaianStatus: SectionStatus = {
		pct:
			cpl.length > 0 && cpmk.length > 0 && subCpmk.length > 0
				? 100
				: cpl.length > 0 || cpmk.length > 0
					? 50
					: 0,
		summary: `${cpl.length} CPL · ${cpmk.length} CPMK · ${subCpmk.length} Sub-CPMK`,
		empty: cpl.length === 0 && cpmk.length === 0 && subCpmk.length === 0,
	};

	const normalWeeks = sessions.filter((s) => !s.specialWeekType || s.specialWeekType === 'normal');
	const utsWeeks = sessions.filter((s) => s.specialWeekType === 'uts');
	const uasWeeks = sessions.filter((s) => s.specialWeekType === 'uas');
	const khususWeeks = sessions.filter((s) => s.specialWeekType === 'khusus');
	const sessionsDone = sessions.filter((s) => s.completed).length;
	const sessionsStatus: SectionStatus = {
		pct: sessions.length === 0 ? 0 : Math.min(100, Math.round((sessions.length / 16) * 100)),
		summary: `${sessions.length} sesi · ${normalWeeks.length} normal · ${utsWeeks.length} UTS · ${uasWeeks.length} UAS`,
		empty: sessions.length === 0,
	};

	const materialsStatus: SectionStatus = {
		pct: topics.length > 0 ? 100 : 0,
		summary: `${topics.length} topik / materi`,
		empty: topics.length === 0,
	};

	const weightedAssess = assessments.filter((a) => a.weight != null && !Number.isNaN(a.weight));
	const assessSum = weightedAssess.reduce((n, a) => n + (a.weight as number), 0);
	const assessmentsStatus: SectionStatus = {
		pct:
			assessments.length === 0
				? 0
				: weightedAssess.length === assessments.length && assessSum === 100
					? 100
					: weightedAssess.length === 0
						? 30
						: 60,
		summary:
			assessments.length === 0
				? 'Belum ada komponen'
				: `${assessments.length} komponen · total ${assessSum}%`,
		empty: assessments.length === 0,
	};

	const workloadParts = [
		course.workloadLecture,
		course.workloadTutorial,
		course.workloadPractice,
		course.workloadIndependent,
	];
	const workloadFilled = workloadParts.filter((v) => v != null).length;
	const workloadStatus: SectionStatus = {
		pct: course.workloadTotal != null ? 100 : workloadFilled > 0 ? 50 : 0,
		summary:
			course.workloadTotal != null
				? `Total ${course.workloadTotal} jam`
				: workloadFilled > 0
					? `${workloadFilled}/4 komponen`
					: 'Belum diisi',
		empty: course.workloadTotal == null && workloadFilled === 0,
	};

	const collabStatus: SectionStatus = {
		pct: 100, // optional section — not required for RPS completeness
		summary: `${collabTasks.length} tugas`,
		empty: collabTasks.length === 0,
	};

	const hasRefs = Boolean(course.rpsFile) || Boolean(course.rps) || Boolean(course.syllabus);
	const referencesStatus: SectionStatus = {
		pct: hasRefs ? 100 : 0,
		summary: [
			course.rpsFile ? 'PDF RPS' : null,
			course.syllabus ? 'Silabus' : null,
			course.rps ? 'RPS' : null,
		]
			.filter(Boolean)
			.join(' · ') || 'Belum ada',
		empty: !hasRefs,
	};

	// Overall completeness across required sections.
	const requiredSections = [
		identityStatus,
		capaianStatus,
		sessionsStatus,
		assessmentsStatus,
		workloadStatus,
	];
	const overallPct = Math.round(
		requiredSections.reduce((n, s) => n + s.pct, 0) / requiredSections.length,
	);
	const overallComplete = validation.complete && overallPct >= 90;

	const goRps = (step?: number) =>
		navigate(`/app/rps/${course.id}${step ? `?step=${step}` : ''}`);

	const fixWarning = (category: ValidationCategory) => goRps(CATEGORY_STEP[category]);

	// Collapsible "Tinjauan RPS" — the lecturer's choice persists across visits.
	// Starts expanded on the server/first paint, then applies the stored preference
	// after mount so hydration stays stable and no data is reloaded.
	const [reviewOpen, setReviewOpen] = useState(true);
	useEffect(() => {
		try {
			if (localStorage.getItem('cw-review-open') === '0') setReviewOpen(false);
		} catch {
			// storage unavailable — keep expanded
		}
	}, []);
	const toggleReview = () => {
		setReviewOpen((open) => {
			const next = !open;
			try {
				localStorage.setItem('cw-review-open', next ? '1' : '0');
			} catch {
				// ignore persistence failure
			}
			return next;
		});
	};

	return (
		<div className="cw-wrap">
			<header className="cw-page-head">
				<div>
					<span className="ld-eyebrow">Ruang mata kuliah</span>
					<h1>{course.title}</h1>
					<p>
						{[course.code, course.semester, course.academicYear, course.lecturerName]
							.filter(Boolean)
							.join(' · ') || 'Identitas mata kuliah belum lengkap'}
					</p>
				</div>
				{isFacultyOwner && (
					<div className="cw-page-head-actions">
						<button type="button" className="ld-outline-action" onClick={() => goRps(1)}>
							<Pencil size={16} /> Lengkapi identitas
						</button>
						<button type="button" className="ld-btn-primary" onClick={() => goRps()}>
							<FileText size={16} /> Buka Editor RPS
						</button>
					</div>
				)}
			</header>
			{/* ── Completeness hero ─────────────────────────────── */}
			<section className={`cw-hero${overallComplete ? ' ok' : ''}`}>
				<div className="cw-hero-ring" role="img" aria-label={`Kelengkapan RPS ${overallPct}%`}>
					<svg viewBox="0 0 48 48" aria-hidden>
						<circle cx="24" cy="24" r="20" className="cw-ring-bg" />
						<circle
							cx="24"
							cy="24"
							r="20"
							className="cw-ring-fg"
							strokeDasharray={`${(overallPct / 100) * 125.6} 125.6`}
						/>
					</svg>
					<span>{overallPct}%</span>
				</div>
				<div className="cw-hero-copy">
					<span className="ld-eyebrow">Status RPS</span>
					<h2>
						{overallComplete
							? 'RPS lengkap & konsisten.'
							: 'RPS sedang Anda susun.'}
					</h2>
					<p>
						{overallComplete
							? 'Semua bagian utama terisi dan tidak ada catatan konsistensi. Tinjau berkala untuk menjaga mutu.'
							: `${validation.warnings.length} catatan perlu ditinjau · lengkapi bagian yang masih kosong untuk menyelesaikan RPS.`}
					</p>
					<div className="cw-hero-meta">
						<span>
							<CheckCircle2 size={14} /> {identityStatus.summary} identitas
						</span>
						<span>
							<BookOpenText size={14} /> {capaianStatus.summary}
						</span>
						<span>
							<CalendarDays size={14} /> {sessions.length} sesi
						</span>
					</div>
				</div>
			</section>

			{isFacultyOwner && (
				<section
					className={`cw-review${reviewOpen ? '' : ' collapsed'}${validation.complete ? ' ok' : ''}`}
					aria-label="Tinjauan RPS"
				>
					<div className="cw-review-head">
						<div>
							<span className="ld-eyebrow">Asisten RPS</span>
							<h2 className={validation.complete ? 'ok' : undefined}>
								{validation.complete ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
								Tinjauan RPS
							</h2>
						</div>
						<div className="cw-review-head-side">
							<span className={`ld-chip${validation.complete ? ' ok' : ''}`}>
								{validation.complete ? 'Lengkap' : `${validation.warnings.length} catatan`}
							</span>
							<button
								type="button"
								className="cw-review-toggle"
								onClick={toggleReview}
								aria-expanded={reviewOpen}
								aria-controls="cw-review-body"
							>
								{reviewOpen ? 'Tutup' : 'Buka'}
								<ChevronDown size={15} className="cw-chev" />
							</button>
						</div>
					</div>
					{/* Kept mounted and hidden — toggling never unmounts the AI helper,
				    so its undo/notice state survives and no data is refetched. */}
					<div id="cw-review-body" className="cw-review-body" hidden={!reviewOpen}>
						{validation.complete ? (
							<div className="cw-validation-ok">
								<CheckCircle2 size={18} />
								<span>RPS lengkap dan konsisten. Tidak ada catatan yang perlu diperbaiki.</span>
							</div>
						) : (
							<RpsAiHelper
								courseId={course.id}
								context={fixContext}
								warnings={validation.warnings}
								onManualFix={fixWarning}
							/>
						)}
					</div>
				</section>
			)}

			<div className="cw-grid">
				<div className="cw-main">
					{/* Identity */}
					<SectionCard
						icon={<FileText size={16} />}
						title="Identitas & Deskripsi"
						status={identityStatus}
						action={
							isFacultyOwner ? (
								<button type="button" className="ld-text-btn" onClick={onEditCourse}>
									<Pencil size={13} /> Edit
								</button>
							) : undefined
						}
					>
						<div className="cw-identity-grid">
							<Field label="Kode" value={course.code} />
							<Field label="Semester" value={course.semester} />
							<Field label="Tahun Akademik" value={course.academicYear} />
							<Field label="SKS" value={course.credits != null ? String(course.credits) : ''} />
							<Field label="Dosen Pengampu" value={course.lecturerName || ''} />
							<Field label="Kelompok MK" value={course.courseGroup || ''} />
						</div>
						<div className="cw-desc">
							<small>Deskripsi</small>
							<p>{course.description || emptyMsg(isFacultyOwner, 'Deskripsi mata kuliah belum diisi.')}</p>
						</div>
						{course.prerequisites && (
							<div className="cw-desc">
								<small>Prasyarat</small>
								<p>{course.prerequisites}</p>
							</div>
						)}
					</SectionCard>

					{/* Capaian */}
					<SectionCard
						icon={<BookOpenText size={16} />}
						title="Capaian Pembelajaran"
						status={capaianStatus}
						action={
							isFacultyOwner ? (
								<button type="button" className="ld-text-btn" onClick={() => goRps(2)}>
									<Plus size={13} /> Kelola
								</button>
							) : undefined
						}
					>
						{capaianStatus.empty ? (
							<EmptyLine msg={emptyMsg(isFacultyOwner, 'CPL, CPMK, dan Sub-CPMK belum ditambahkan.')} />
						) : (
							<div className="cw-cap-stack">
								<CapRow label="CPL" count={cpl.length} items={cpl.slice(0, 3).map((i) => `${i.code ? i.code + ' — ' : ''}${i.description}`)} />
								<CapRow label="CPMK" count={cpmk.length} items={cpmk.slice(0, 3).map((i) => `${i.code ? i.code + ' — ' : ''}${i.description}`)} />
								<CapRow label="Sub-CPMK" count={subCpmk.length} items={subCpmk.slice(0, 3).map((i) => `${i.code ? i.code + ' — ' : ''}${i.description}`)} />
							</div>
						)}
					</SectionCard>

					{/* Weekly plan */}
					<SectionCard
						icon={<CalendarDays size={16} />}
						title="Rencana Pertemuan Mingguan"
						status={sessionsStatus}
						action={
							isFacultyOwner ? (
								<button type="button" className="ld-text-btn" onClick={onAddSession}>
									<Plus size={13} /> Tambah sesi
								</button>
							) : undefined
						}
					>
						{sessionsStatus.empty ? (
							<EmptyLine msg={emptyMsg(isFacultyOwner, 'Belum ada pertemuan terencana untuk mata kuliah ini.')} />
						) : (
							<>
								<div className="cw-week-chips">
									<span className="cw-week-chip normal">{normalWeeks.length} normal</span>
									{utsWeeks.length > 0 && <span className="cw-week-chip uts">{utsWeeks.length} UTS</span>}
									{uasWeeks.length > 0 && <span className="cw-week-chip uas">{uasWeeks.length} UAS</span>}
									{khususWeeks.length > 0 && <span className="cw-week-chip khusus">{khususWeeks.length} khusus</span>}
								</div>
								<ul className="cw-week-timeline">
									{[...sessions]
										.sort((a, b) => a.week - b.week)
										.slice(0, 8)
										.map((s) => (
											<li key={s.id} className={`cw-week-item${s.completed ? ' done' : ''}`}>
												<span className="cw-week-num">{String(s.week).padStart(2, '0')}</span>
												<span className="cw-week-title">
													{s.title}
													{s.specialWeekType && s.specialWeekType !== 'normal' && (
														<em>{s.specialWeekType.toUpperCase()}</em>
													)}
												</span>
												{s.completed && <Check size={13} className="cw-week-check" />}
											</li>
										))}
								</ul>
								<div className="cw-progress-line">
									<div className="ld-progress-track">
										<span
											style={{
												width: sessions.length
													? `${(sessionsDone / sessions.length) * 100}%`
													: '0%',
											}}
										/>
									</div>
									<em>
										{sessionsDone}/{sessions.length} selesai
									</em>
								</div>
								<button type="button" className="ld-text-btn cw-more" onClick={() => onTab('sessions')}>
									Lihat semua sesi <ArrowRight size={13} />
								</button>
							</>
						)}
					</SectionCard>

					{/* Materials */}
					<SectionCard
						icon={<Library size={16} />}
						title="Materi / Topik"
						status={materialsStatus}
						action={
							isFacultyOwner ? (
								<button type="button" className="ld-text-btn" onClick={() => goRps(2)}>
									<Plus size={13} /> Kelola
								</button>
							) : undefined
						}
					>
						{materialsStatus.empty ? (
							<EmptyLine msg={emptyMsg(isFacultyOwner, 'Topik / materi belum ditambahkan.')} />
						) : (
							<ul className="cw-simple-list">
								{topics.slice(0, 6).map((t) => (
									<li key={t.id}>
										{t.code && <span className="cw-code">{t.code}</span>}
										<span>{t.description}</span>
									</li>
								))}
								{topics.length > 6 && <li className="cw-more-li">+{topics.length - 6} topik lainnya</li>}
							</ul>
						)}
					</SectionCard>

					{/* Assessments */}
					<SectionCard
						icon={<ClipboardList size={16} />}
						title="Komponen Penilaian"
						status={assessmentsStatus}
						action={
							isFacultyOwner ? (
								<button type="button" className="ld-text-btn" onClick={() => goRps(5)}>
									<Plus size={13} /> Kelola
								</button>
							) : undefined
						}
					>
						{assessmentsStatus.empty ? (
							<EmptyLine msg={emptyMsg(isFacultyOwner, 'Komponen penilaian belum ditambahkan.')} />
						) : (
							<>
								<ul className="cw-simple-list">
									{assessments.map((a) => (
										<li key={a.id}>
											{a.code && <span className="cw-code">{a.code}</span>}
											<span>{a.description}</span>
											{a.weight != null && !Number.isNaN(a.weight) && (
												<span className="cw-weight">{a.weight}%</span>
											)}
										</li>
									))}
								</ul>
								<div className="cw-assess-sum">
									<Scale size={14} /> Total bobot: <strong>{assessSum}%</strong>
									{assessSum !== 100 && (
										<em className="cw-assess-warn">
											<AlertTriangle size={12} /> seharusnya 100%
										</em>
									)}
								</div>
							</>
						)}
					</SectionCard>

					{/* Workload */}
					<SectionCard
						icon={<Scale size={16} />}
						title="Beban Kerja"
						status={workloadStatus}
						action={
							isFacultyOwner ? (
								<button type="button" className="ld-text-btn" onClick={() => goRps(4)}>
									<Pencil size={13} /> Edit
								</button>
							) : undefined
						}
					>
						{workloadStatus.empty ? (
							<EmptyLine msg={emptyMsg(isFacultyOwner, 'Alokasi beban kerja belum diisi.')} />
						) : (
							<div className="cw-workload-grid">
								<Field label="Kuliah" value={course.workloadLecture != null ? `${course.workloadLecture} jam` : ''} />
								<Field label="Tutorial" value={course.workloadTutorial != null ? `${course.workloadTutorial} jam` : ''} />
								<Field label="Praktik" value={course.workloadPractice != null ? `${course.workloadPractice} jam` : ''} />
								<Field label="Mandiri" value={course.workloadIndependent != null ? `${course.workloadIndependent} jam` : ''} />
								<Field label="Total" value={course.workloadTotal != null ? `${course.workloadTotal} jam` : ''} />
							</div>
						)}
					</SectionCard>

					{/* Collaborative assignments */}
					<SectionCard
						icon={<Users size={16} />}
						title="Tugas Kolaboratif"
						status={collabStatus}
						optional
						action={
							isFacultyOwner ? (
								<button type="button" className="ld-text-btn" onClick={() => goRps(6)}>
									<Plus size={13} /> Kelola
								</button>
							) : undefined
						}
					>
						{collabStatus.empty ? (
							<EmptyLine msg={isFacultyOwner ? 'Opsional — tambahkan tugas kelompok dari Editor RPS bila ada.' : 'Belum ada tugas kolaboratif untuk mata kuliah ini.'} />
						) : (
							<ul className="cw-simple-list">
								{collabTasks.map((t) => (
									<li key={t.id}>
										<span>{t.title}</span>
										{t.schedule && <span className="cw-weight">{t.schedule}</span>}
									</li>
								))}
							</ul>
						)}
					</SectionCard>

					{/* References / resources */}
					<SectionCard
						icon={<Library size={16} />}
						title="Referensi & Sumber Daya"
						status={referencesStatus}
						action={
							isFacultyOwner ? (
								<button type="button" className="ld-text-btn" onClick={() => onTab('rps')}>
									<Pencil size={13} /> Edit RPS
								</button>
							) : undefined
						}
					>
						{referencesStatus.empty ? (
							<EmptyLine msg={emptyMsg(isFacultyOwner, 'Referensi, silabus, dan PDF RPS belum ditambahkan.')} />
						) : (
							<ul className="cw-resource-list">
								{course.rpsFile && (
									<li>
										<FileText size={15} />
										<a
											href={pb.files.getURL(course, course.rpsFile)}
											target="_blank"
											rel="noreferrer"
											download
										>
											PDF RPS asli
										</a>
									</li>
								)}
								{course.syllabus && (
									<li>
										<BookOpenText size={15} />
										<button type="button" onClick={() => onTab('syllabus')}>
											Silabus <ArrowRight size={12} />
										</button>
									</li>
								)}
								{course.rps && (
									<li>
										<Library size={15} />
										<button type="button" onClick={() => onTab('rps')}>
											RPS & referensi <ArrowRight size={12} />
										</button>
									</li>
								)}
							</ul>
						)}
					</SectionCard>

					{/* Course resources / file library */}
					<ResourcesSection
						courseId={course.id}
						isFacultyOwner={isFacultyOwner}
						onManage={() => onTab('materials')}
					/>

					{/* Assignments & student submissions */}
					<AssignmentsSection
						courseId={course.id}
						isFacultyOwner={isFacultyOwner}
						isStudent={isStudent}
						onManage={() => onTab('assignments')}
					/>
				</div>
			</div>

			{(isFacultyOwner || isStudent) && (
				<div className="cw-meta-row">
					{isFacultyOwner && (
						<section className="ld-panel cw-students-panel">
							<div className="ld-card-head">
								<h2>
									<GraduationCap size={16} className="ld-spark" /> Mahasiswa
								</h2>
								<span className="ld-chip">{enrollments.length} terdaftar</span>
							</div>
							{enrollLoading ? (
								<div className="cw-students-loading">
									<LoaderCircle size={16} className="spin" /> Memuat…
								</div>
							) : enrollments.length === 0 ? (
								<p className="ld-empty-sm">
									Belum ada mahasiswa terdaftar. Bagikan mata kuliah ini agar mahasiswa dapat mendaftar.
								</p>
							) : (
								<ul className="cw-student-list">
									{enrollments.map((e) => {
										const name = e.expand?.owner?.name || e.expand?.owner?.email || 'Mahasiswa';
										const initials = name.charAt(0).toUpperCase();
										return (
											<li key={e.id}>
												<span className="cw-student-avatar">{initials}</span>
												<span className="cw-student-name">
													<strong>{name}</strong>
													{e.expand?.owner?.email && e.expand.owner.email !== name && (
														<small>{e.expand.owner.email}</small>
													)}
												</span>
											</li>
										);
									})}
								</ul>
							)}
						</section>
					)}

					{isFacultyOwner && (
						<section className="ld-panel cw-quick-panel">
							<div className="ld-card-head">
								<h2>
									<Sparkles size={16} className="ld-spark" /> Aksi Cepat
								</h2>
							</div>
							<div className="cw-quick-grid">
								<button type="button" className="cw-quick" onClick={() => goRps()}>
									<FileText size={16} /> Editor RPS
								</button>
								<button type="button" className="cw-quick" onClick={() => goRps(3)}>
									<CalendarDays size={16} /> Rencana mingguan
								</button>
								<button type="button" className="cw-quick" onClick={() => goRps(5)}>
									<ClipboardList size={16} /> Penilaian
								</button>
								<button type="button" className="cw-quick" onClick={onAddSession}>
									<Plus size={16} /> Tambah sesi
								</button>
								<button type="button" className="cw-quick" onClick={onEditCourse}>
									<Pencil size={16} /> Edit detail
								</button>
								<button type="button" className="cw-quick" onClick={() => onTab('sessions')}>
									<CalendarDays size={16} /> Lihat sesi
								</button>
							</div>
						</section>
					)}

					{isStudent && (
						<section className="ld-panel cw-student-info">
							<div className="ld-card-head">
								<h2>
									<GraduationCap size={16} className="ld-spark" /> Status Anda
								</h2>
							</div>
							<p className="ld-empty-sm">
								Anda melihat mata kuliah ini sebagai mahasiswa. Sesi, materi, dan penilaian
								yang dosen terbitkan dapat diakses pada tab di atas.
							</p>
						</section>
					)}
				</div>
			)}
		</div>
	);
}

// ── Subcomponents ─────────────────────────────────────────────

function SectionCard({
	icon,
	title,
	status,
	optional,
	action,
	children,
}: {
	icon: React.ReactNode;
	title: string;
	status: SectionStatus;
	optional?: boolean;
	action?: React.ReactNode;
	children: React.ReactNode;
}) {
	const tone = status.empty ? 'empty' : status.pct >= 100 ? 'ok' : 'partial';
	return (
		<section className="cw-card">
			<div className="cw-card-head">
				<div className="cw-card-title">
					<span className="cw-card-icon">{icon}</span>
					<h3>{title}</h3>
					{optional && <span className="cw-optional">opsional</span>}
				</div>
				<div className="cw-card-meta">
					<span className={`cw-status ${tone}`}>
						{tone === 'ok' ? <Check size={12} /> : tone === 'empty' ? <CircleDashed size={12} /> : <AlertTriangle size={12} />}
						{status.summary}
					</span>
					{action}
				</div>
			</div>
			<div className="cw-card-body">{children}</div>
		</section>
	);
}

function Field({ label, value }: { label: string; value: string }) {
	return (
		<div className={`cw-field${value ? '' : ' empty'}`}>
			<small>{label}</small>
			<span>{value || '—'}</span>
		</div>
	);
}

function CapRow({ label, count, items }: { label: string; count: number; items: string[] }) {
	return (
		<div className="cw-cap-row">
			<span className="cw-cap-label">
				<strong>{count}</strong> {label}
			</span>
			{items.length > 0 ? (
				<ul className="cw-cap-items">
					{items.map((it, i) => (
						<li key={i}>{it}</li>
					))}
					{count > items.length && <li className="cw-more-li">+{count - items.length} lainnya</li>}
				</ul>
			) : (
				<span className="cw-cap-none">Belum ada</span>
			)}
		</div>
	);
}

function EmptyLine({ msg }: { msg: string }) {
	return <p className="cw-empty-line">{msg}</p>;
}

/** Compact resources summary for the workspace overview. */
function ResourcesSection({
	courseId,
	isFacultyOwner,
	onManage,
}: {
	courseId: string;
	isFacultyOwner: boolean;
	onManage: () => void;
}) {
	const { resources, loading } = useCourseResources(courseId);
	const count = resources.length;
	const status: SectionStatus = {
		pct: count > 0 ? 100 : 0,
		summary: loading ? 'Memuat…' : `${count} sumber daya`,
		empty: !loading && count === 0,
	};
	return (
		<SectionCard
			icon={<Paperclip size={16} />}
			title="Sumber Daya Mata Kuliah"
			status={status}
			action={
				<button type="button" className="ld-text-btn" onClick={onManage}>
					{isFacultyOwner ? 'Kelola' : 'Lihat'} <ArrowRight size={13} />
				</button>
			}
		>
			{status.empty ? (
				<EmptyLine
					msg={
						isFacultyOwner
							? 'Belum ada materi. Unggah slide, dokumen, media, atau tautan dari tab Materi.'
							: 'Dosen belum membagikan materi untuk mata kuliah ini.'
					}
				/>
			) : (
				<ul className="cw-simple-list">
					{resources.slice(0, 5).map((r) => (
						<li key={r.id}>
							<FileText size={14} className="cw-res-ico" />
							<span>{r.title}</span>
							<span className="cw-weight">{r.kind === 'link' ? 'Tautan' : 'Berkas'}</span>
						</li>
					))}
					{count > 5 && <li className="cw-more-li">+{count - 5} sumber daya lainnya</li>}
				</ul>
			)}
		</SectionCard>
	);
}

/** Compact assignments summary for the workspace overview. */
function AssignmentsSection({
	courseId,
	isFacultyOwner,
	isStudent,
	onManage,
}: {
	courseId: string;
	isFacultyOwner: boolean;
	isStudent: boolean;
	onManage: () => void;
}) {
	const { assignments, loading } = useCourseAssignments(courseId);
	// The collection's list rule already hides other lecturers' drafts; for
	// students, additionally ignore any draft rows cached from a faculty view.
	const visible = isStudent ? assignments.filter((a) => a.status !== 'draft') : assignments;
	const upcoming = visible
		.filter((a) => a.status === 'published' && a.deadline && !isPastDeadline(a.deadline))
		.sort(
				(a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
		)[0];
	const status: SectionStatus = {
		pct: visible.length > 0 ? 100 : 0,
		summary: loading
			? 'Memuat…'
			: visible.length === 0
				? 'Belum ada tugas'
				: upcoming
					? `${visible.length} tugas · terdekat ${deadlineLabel(upcoming.deadline)}`
					: `${visible.length} tugas`,
		empty: !loading && visible.length === 0,
	};
	return (
		<SectionCard
			icon={<ClipboardList size={16} />}
			title="Tugas & Pengumpulan"
			status={status}
			action={
				<button type="button" className="ld-text-btn" onClick={onManage}>
					{isFacultyOwner ? 'Kelola' : 'Lihat'} <ArrowRight size={13} />
				</button>
			}
		>
			{status.empty ? (
				<EmptyLine
					msg={
						isFacultyOwner
							? 'Belum ada tugas. Buat tugas individual atau kolaboratif dari halaman Tugas.'
							: 'Dosen belum menerbitkan tugas untuk mata kuliah ini.'
					}
				/>
			) : (
				<ul className="cw-simple-list">
					{visible.slice(0, 5).map((a) => (
						<li key={a.id}>
							<ClipboardList size={14} className="cw-res-ico" />
							<span>{a.title}</span>
							<span className="cw-weight">
								{activityTypeOf(a) === 'formative'
									? 'Latihan · tanpa nilai'
									: a.deadline
										? isPastDeadline(a.deadline)
											? 'Lewat batas'
											: deadlineLabel(a.deadline)
										: 'Tanpa batas'}
							</span>
						</li>
				))}
					{visible.length > 5 && (
						<li className="cw-more-li">+{visible.length - 5} tugas lainnya</li>
					)}
			</ul>
		)}
		</SectionCard>
	);
}

function emptyMsg(isFacultyOwner: boolean, msg: string) {
	return isFacultyOwner ? msg : msg.replace('belum diisi.', 'belum diterbitkan dosen.').replace('belum ditambahkan.', 'belum diterbitkan dosen.').replace('belum diisi.', 'belum diterbitkan dosen.');
}
