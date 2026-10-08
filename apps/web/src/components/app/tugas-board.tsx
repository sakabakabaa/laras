import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ClipboardCheck, ClipboardList, Clock3, LoaderCircle, Plus, Repeat, Search } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { useAuth } from '@/hooks/use-auth';
import { CourseThumb } from '@/components/app/course-thumb';
import { CardCta } from '@/components/card-cta';
import { DifficultySummary } from '@/components/app/difficulty-summary';
import {
	activityTypeOf,
	ASSIGNMENT_STATUS_LABEL,
	deadlineLabel,
	isPracticeOutdated,
	MODE_LABEL,
	SHAPE_LABEL,
	type Assignment,
	type AssignmentStatus,
} from '@/lib/assignments';
import type { Course } from '@/lib/learning';

type Row = {
	id: string;
	assignment: string;
	status: string;
	grade: number | null;
};

type CheckRow = {
	id: string;
	assignment: string;
	identityKey: string;
};

/**
 * Lecturer index under the existing Tugas nav: every owned assignment with
 * collection counts, opening the evaluation workspace. Students never land
 * here — the route guard redirects them. Phase 1 of the creator restructure
 * centralizes creation here: the “Buat tugas” action opens the four-step
 * creator, preselecting the active course filter (or the ?course= param a
 * course page launched with). Phase 3 separates Tugas formal
 * (final-submission and grading progress) from Latihan formatif (repeatable
 * practice and Cek jawaban feedback progress).
 */
export function TugasBoard() {
	const { user } = useAuth();
	const me = user?.id || '';
	const [assignments, setAssignments] = useState<Assignment[]>([]);
	const [courses, setCourses] = useState<Course[]>([]);
	const [subs, setSubs] = useState<Row[]>([]);
	const [pubs, setPubs] = useState<Row[]>([]);
	const [checks, setChecks] = useState<CheckRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [searchParams] = useSearchParams();
	const launchCourse = (searchParams.get('course') || '').trim();
	const [courseId, setCourseId] = useState(launchCourse || 'all');
	const [typeFilter, setTypeFilter] = useState<'all' | 'formal' | 'formative'>('all');
	const [query, setQuery] = useState('');
	const navigate = useNavigate();
	const startNew = searchParams.get('new') === '1';
	useEffect(() => {
		if (!startNew) return;
		const target = launchCourse
			? `/app/tugas/buat?course=${encodeURIComponent(launchCourse)}`
			: '/app/tugas/buat';
		navigate(target, { replace: true });
	}, [startNew, launchCourse, navigate]);
	const openCreator = () => {
		navigate(
			courseId !== 'all'
				? `/app/tugas/buat?course=${encodeURIComponent(courseId)}`
				: '/app/tugas/buat',
		);
	};

	useEffect(() => {
		if (!me) return;
		let alive = true;
		setLoading(true);
		void (async () => {
			try {
				const [courseRows, assignmentRows, subRows, pubRows, checkRows] = await Promise.all([
					pb.collection('courses').getFullList<Course>({ sort: 'title' }),
					pb.collection('assignments').getFullList<Assignment>({
						filter: pb.filter('owner = {:id}', { id: me }),
						sort: '-created',
						expand: 'session,subCpmk,parentAssignment',
					}),
					pb.collection('assignment_submissions').getFullList<Row>({
						fields: 'id,assignment,status,grade',
					}),
					pb.collection('public_submissions').getFullList<Row>({
						fields: 'id,assignment,status,grade',
					}),
					pb.collection('check_attempts').getFullList<CheckRow>({
						fields: 'id,assignment,identityKey',
					}),
				]);
				if (!alive) return;
				setCourses(courseRows.filter((c) => c.owner === me));
				setAssignments(assignmentRows);
				setSubs(subRows);
				setPubs(pubRows);
				setChecks(checkRows);
			} catch {
				if (alive) setError('Daftar tugas gagal dimuat. Muat ulang halaman.');
			} finally {
				if (alive) setLoading(false);
			}
		})();
		return () => {
			alive = false;
		};
	}, [me]);

	useEffect(() => {
		if (launchCourse && courses.length > 0 && !courses.some((c) => c.id === launchCourse)) {
			setCourseId('all');
		}
	}, [launchCourse, courses]);

	const visible = useMemo(() => {
		const q = query.trim().toLowerCase();
		return assignments.filter((a) => {
			if (courseId !== 'all' && a.course !== courseId) return false;
			if (typeFilter !== 'all' && activityTypeOf(a) !== typeFilter) return false;
			if (!q) return true;
			const course = courses.find((c) => c.id === a.course);
			return (
				a.title.toLowerCase().includes(q) ||
				(course?.title || '').toLowerCase().includes(q) ||
				(course?.code || '').toLowerCase().includes(q)
			);
		});
	}, [assignments, courseId, typeFilter, query, courses]);

	const totals = useMemo(() => {
		let formal = 0;
		let formative = 0;
		let collected = 0;
		let graded = 0;
		for (const a of visible) {
			const isFormative = activityTypeOf(a) === 'formative';
			if (isFormative) formative += 1;
			else formal += 1;
			if (isFormative) continue;
			const mine = [...subs, ...pubs].filter((s) => s.assignment === a.id);
			const rows = mine.filter((s) => s.status && s.status !== 'draft');
			collected += rows.length;
			graded += rows.filter((s) => s.status === 'graded' || s.grade != null).length;
		}
		return {
			total: visible.length,
			formal,
			formative,
			collected,
			waiting: Math.max(collected - graded, 0),
		};
	}, [visible, subs, pubs]);

	if (loading) {
		return (
			<div className="ld-loading">
				<LoaderCircle size={22} className="spin" /> Memuat tugas...
			</div>
		);
	}

	const hasTasks = assignments.length > 0;

	return (
		<div className="eval-board mk-page">
			<div className="ld-page-head mk-head">
				<span className="ld-eyebrow">Ruang Kerja</span>
				<h1>Tugas</h1>
				<p>Kelola tugas formal, latihan formatif, pengumpulan, dan penilaian.</p>
			</div>

			<div className="mk-toolbar">
				<label className="ld-search-bar mk-search">
					<Search size={16} strokeWidth={1.75} aria-hidden />
					<input
						type="search"
						placeholder="Cari tugas berdasarkan judul, mata kuliah, atau kode..."
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						aria-label="Cari tugas"
					/>
				</label>
				<label className="mk-select">
					<span className="sr-only">Jenis</span>
					<select
						value={typeFilter}
						onChange={(e) => setTypeFilter(e.target.value as 'all' | 'formal' | 'formative')}
						aria-label="Filter jenis aktivitas"
					>
						<option value="all">Semua jenis</option>
						<option value="formal">Tugas formal</option>
						<option value="formative">Latihan formatif</option>
					</select>
				</label>
				<label className="mk-select">
					<span className="sr-only">Mata kuliah</span>
					<select value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label="Filter mata kuliah">
						<option value="all">Semua mata kuliah</option>
						{courses.map((c) => (
							<option key={c.id} value={c.id}>
								{c.code ? `${c.code} · ` : ''}
								{c.title}
							</option>
						))}
					</select>
				</label>
				<button type="button" className="ld-btn-primary mk-create" onClick={openCreator}>
					<Plus size={17} /> Buat tugas
				</button>
			</div>

			{error && (
				<div className="ld-alert" role="alert">
					{error}
				</div>
			)}

			{!hasTasks ? (
				<div className="ld-empty ld-empty-lg">
					<div className="ld-empty-icon">
						<ClipboardList size={28} strokeWidth={1.4} />
					</div>
					<h3>Belum ada tugas</h3>
					<p>
						Penilaian dimulai di sini. Buat tugas formal untuk pengumpulan dan nilai resmi, atau latihan formatif dengan Cek jawaban.
					</p>
					<div className="ld-empty-actions">
						<button type="button" className="ld-btn-primary" onClick={openCreator}>
							<Plus size={16} /> Buat tugas pertama
						</button>
					</div>
				</div>
			) : (
				<>
					<ul className="mk-stats" aria-label="Ringkasan tugas">
						<li>
							<span className="mk-stat-ico rose">
								<ClipboardList size={16} />
							</span>
							<div>
								<strong>{totals.total}</strong>
								<small>Tugas</small>
								<em>Sesuai filter</em>
							</div>
						</li>
						<li>
							<span className="mk-stat-ico blue">
								<ClipboardCheck size={16} />
							</span>
							<div>
								<strong>{totals.formal}</strong>
								<small>Tugas formal</small>
								<em>Dinilai resmi</em>
							</div>
						</li>
						<li>
							<span className="mk-stat-ico green">
								<Repeat size={16} />
							</span>
							<div>
								<strong>{totals.formative}</strong>
								<small>Latihan formatif</small>
								<em>Tanpa nilai resmi</em>
							</div>
						</li>
						<li>
							<span className="mk-stat-ico violet">
								<ClipboardCheck size={16} />
							</span>
							<div>
								<strong>{totals.collected}</strong>
								<small>Terkumpul</small>
								<em>Pengumpulan formal</em>
							</div>
						</li>
						<li>
							<span className="mk-stat-ico amber">
								<Clock3 size={16} />
							</span>
							<div>
								<strong>{totals.waiting}</strong>
								<small>Menunggu nilai</small>
								<em>Belum dinilai</em>
							</div>
						</li>
					</ul>

					<section className="mk-board">
						<div className="mk-board-head">
							<h2>Semua Tugas ({visible.length})</h2>
							<div className="eval-legend" role="note" aria-label="Dua jenis aktivitas">
								<span>
									<ClipboardCheck size={13} /> <strong>Formal</strong> dinilai
								</span>
								<span>
									<Repeat size={13} /> <strong>Formatif</strong> tanpa nilai
								</span>
							</div>
						</div>
						{visible.length === 0 ? (
							<div className="ld-empty">
								<h3>
									{typeFilter === 'formative'
										? 'Belum ada latihan formatif'
										: typeFilter === 'formal'
											? 'Belum ada tugas formal'
											: 'Tidak ada tugas yang cocok'}
								</h3>
								<p>Coba kata kunci, jenis, atau mata kuliah lain.</p>
							</div>
						) : (
							<ul className="eval-board-list">
								{visible.map((a) => {
									const course = courses.find((c) => c.id === a.course);
									const formative = activityTypeOf(a) === 'formative';
									const mine = [...subs, ...pubs].filter((s) => s.assignment === a.id);
									const collected = mine.filter((s) => s.status && s.status !== 'draft');
									const graded = collected.filter((s) => s.status === 'graded' || s.grade != null);
									const myChecks = checks.filter((c) => c.assignment === a.id);
									const checkers = new Set(myChecks.map((c) => c.identityKey)).size;
									return (
										<li key={a.id}>
											<article className={`eval-board-card${formative ? ' formative' : ''}`}>
												{course ? (
													<CourseThumb course={course} />
												) : (
													<span className="eval-board-thumb" aria-hidden="true" />
												)}
												<div className="eval-board-main">
													<span className={`asg-type-chip ${formative ? 'formative' : 'formal'}`}>
														{formative ? <Repeat size={12} /> : <ClipboardCheck size={12} />}
														{formative ? 'Latihan formatif' : 'Tugas formal'}
													</span>
													<small>
														{course?.title || 'Mata kuliah'}
														{a.expand?.session?.week ? ` · Minggu ${a.expand.session.week}` : ''}
													</small>
													<strong>{a.title}</strong>
													<span className="asg-tags">
														<span className={`asg-tag status-${a.status}`}>
															{ASSIGNMENT_STATUS_LABEL[a.status as AssignmentStatus] || a.status}
														</span>
														<span className="asg-tag">{MODE_LABEL[a.mode]}</span>
														{formative ? (
															<>
																<span className="asg-tag formative">Tanpa nilai resmi</span>
																{a.expand?.parentAssignment &&
																isPracticeOutdated(a, a.expand.parentAssignment) ? (
																	<span className="asg-tag sync-warn">Tugas formal berubah — periksa</span>
																) : null}
															</>
														) : (
															<>
																{a.shape && (
																	<span className="asg-tag">{SHAPE_LABEL[a.shape] || a.shape}</span>
																)}
																{a.allowRevision && <span className="asg-tag">Revisi diizinkan</span>}
															</>
														)}
														{!formative && <span className="asg-tag">{deadlineLabel(a.deadline)}</span>}
													</span>
												</div>
												<div className="eval-board-side">
													<div className="eval-board-counts">
														{formative ? (
															<>
																<em>{myChecks.length} pemeriksaan</em>
																<em>{checkers} peserta memeriksa</em>
																<em>Latihan berulang</em>
															</>
														) : (
															<>
																<em>{collected.length} terkumpul</em>
																<em>{graded.length} dinilai</em>
																<em>{Math.max(collected.length - graded.length, 0)} menunggu</em>
															</>
														)}
													</div>
													<CardCta to={`/app/tugas/${a.id}`} label="Buka" />
												</div>
											</article>
										</li>
									);
								})}
							</ul>
						)}
					</section>
					<DifficultySummary assignments={assignments} />
				</>
			)}
		</div>
	);
}
