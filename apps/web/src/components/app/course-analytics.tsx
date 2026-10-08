import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
	AlertTriangle,
	BarChart3,
	BookOpen,
	CalendarRange,
	ChevronRight,
	ClipboardList,
	LoaderCircle,
	Sparkles,
	Users,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import pb from '@/lib/pocketbase-client';
import type { Assignment, AssignmentSubmission } from '@/lib/assignments';
import type { ClassSession, Course, CourseRosterEntry, StructuredItem } from '@/lib/learning';
import { courseSectionPath } from '@/lib/course-sections';
import {
	buildCourseAnalytics,
	type AnalyticsAttempt,
	type OwnerIdentity,
	type RosterAccount,
} from '@/lib/course-analytics';
import '@/styles/course-analytics.css';

type Rec = { id: string; observed: string; action: string; status: string; scope?: { course?: string } };

async function authPost<T>(path: string, body: unknown): Promise<T | null> {
	const response = await fetch(path, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
		},
		body: JSON.stringify(body),
	});
	if (!response.ok) return null;
	return (await response.json()) as T;
}

export function CourseAnalytics({
	course,
	routeId,
	isStudent,
}: {
	course: Course;
	routeId: string;
	isStudent: boolean;
}) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [week, setWeek] = useState(0);
	const [showAlerts, setShowAlerts] = useState(false);
	const canSeeClass = !isStudent && course.owner === pb.authStore.record?.id;
	const [now, setNow] = useState(0);
	const [bundle, setBundle] = useState<{
		assignments: Assignment[];
		submissions: AssignmentSubmission[];
		sessions: ClassSession[];
		subCpmks: StructuredItem[];
		roster: CourseRosterEntry[];
		accounts: RosterAccount[];
		attempts: AnalyticsAttempt[];
		identities: Record<string, OwnerIdentity>;
		insights: Rec[];
	} | null>(null);

	useEffect(() => {
		setNow(Date.now());
	}, []);

	useEffect(() => {
		let alive = true;
		setLoading(true);
		setError('');
		void (async () => {
			try {
				const [assignments, sessions, subCpmks] = await Promise.all([
					pb.collection('assignments').getFullList<Assignment>({
						filter: pb.filter('course = {:id}', { id: course.id }),
						sort: 'created',
					}),
					pb.collection('class_sessions').getFullList<ClassSession>({
						filter: pb.filter('course = {:id}', { id: course.id }),
						sort: 'week,created',
					}),
					pb.collection('sub_cpmk').getFullList<StructuredItem>({
						filter: pb.filter('course = {:id}', { id: course.id }),
						sort: 'order,created',
					}),
				]);
				const formal = assignments.filter((a) => a.activityType !== 'formative' && a.status !== 'draft');
				const assignFilter = formal.length
					? formal.map((a) => pb.filter('assignment = {:id}', { id: a.id })).join(' || ')
					: '';
				const [submissions, attempts, roster] = await Promise.all([
					assignFilter
						? pb.collection('assignment_submissions').getFullList<AssignmentSubmission>({
								filter: assignFilter,
								fields: 'id,assignment,owner,status,grade,updated,created',
							})
						: Promise.resolve([] as AssignmentSubmission[]),
					assignFilter
						? pb.collection('check_attempts').getFullList<AnalyticsAttempt>({
								filter: assignFilter,
								fields: 'id,assignment,area,identityKey,owner,participantName,created,level',
							})
						: Promise.resolve([] as AnalyticsAttempt[]),
					canSeeClass
						? pb.collection('course_roster').getFullList<CourseRosterEntry>({
								filter: pb.filter('course = {:id}', { id: course.id }),
								sort: 'name',
							})
						: Promise.resolve([] as CourseRosterEntry[]),
				]);

				const identities: Record<string, OwnerIdentity> = {};
				const accounts: RosterAccount[] = [];
				const insights: Rec[] = [];
				if (canSeeClass) {
					const identLists = await Promise.all(
						formal.slice(0, 12).map((assignment) =>
							authPost<{ identities?: Record<string, OwnerIdentity> }>('/api/evaluation-participants', {
								assignmentId: assignment.id,
							}),
						),
					);
					for (const row of identLists) {
						if (row?.identities) Object.assign(identities, row.identities);
					}
					const status = await authPost<{ entries?: { rosterId: string; nim: string; name: string; enrolled: boolean; accountExists: boolean }[] }>(
						'/api/roster-status',
						{ courseId: course.id },
					);
					const userByNim = new Map<string, string>();
					for (const ident of Object.values(identities)) {
						if (ident.nim) {
							const sub = submissions.find((s) => identities[s.id]?.nim === ident.nim);
							if (sub?.owner) userByNim.set(ident.nim, sub.owner);
						}
					}
					for (const entry of status?.entries || []) {
						accounts.push({
							rosterId: entry.rosterId,
							nim: entry.nim,
							name: entry.name,
							userId: userByNim.get(entry.nim) || '',
							enrolled: entry.enrolled,
						});
					}
					try {
						const recs = await pb.collection('lecturer_recommendations').getFullList<Rec>({
							filter: pb.filter('owner = {:id}', { id: pb.authStore.record?.id }),
							sort: '-created',
						});
						insights.push(
							...recs.filter((rec) => {
								const scope = rec.scope;
								if (!scope || typeof scope !== 'object') return false;
								return scope.course === course.id;
							}),
						);
					} catch {
						/* recommendations are optional */
					}
				}

				const mine = canSeeClass ? submissions : submissions.filter((s) => s.owner === pb.authStore.record?.id);
				const myAttempts = isStudent
					? attempts.filter((a) => a.owner === pb.authStore.record?.id)
					: attempts;
				if (!alive) return;
				setBundle({
					assignments,
					submissions: mine,
					sessions,
					subCpmks,
					roster,
					accounts,
					attempts: myAttempts,
					identities,
					insights,
				});
			} catch {
				if (alive) setError('Analitik gagal dimuat. Muat ulang halaman.');
			} finally {
				if (alive) setLoading(false);
			}
		})();
		return () => {
			alive = false;
		};
	}, [course.id, canSeeClass]);

	const model = useMemo(() => {
		if (!bundle || !now) return null;
		return buildCourseAnalytics({ ...bundle, now, week });
	}, [bundle, now, week]);

	const weeks = useMemo(() => {
		const set = new Set((bundle?.sessions || []).map((s) => s.week).filter((w) => w > 0));
		return [...set].sort((a, b) => a - b);
	}, [bundle]);

	const visibleAlerts = showAlerts ? model?.alerts || [] : (model?.alerts || []).slice(0, 3);

	return (
		<section className="an-page" aria-label={`Analitik ${course.title}`}>
			<div className="an-head">
				<div>
					<Link to="/analytics" className="an-back">
						← Analitik
					</Link>
					<h1>{course.title}</h1>
					<p>
						{[course.semester, course.academicYear].filter(Boolean).join(' · ') || 'Semester belum diisi'}
					</p>
				</div>
				<label className="an-period">
					<CalendarRange size={16} />
					<select value={String(week)} onChange={(e) => setWeek(Number(e.target.value))} aria-label="Periode">
						<option value="0">Seluruh semester</option>
						{weeks.map((w) => (
							<option key={w} value={w}>
								Minggu {w}
							</option>
						))}
					</select>
				</label>
			</div>

			{isStudent && (
				<p className="an-privacy">
					Ringkasan kemajuan Anda sendiri. Nama dan hasil mahasiswa lain tidak ditampilkan.
				</p>
			)}

			{loading || !model ? (
				<div className="an-loading">
					<LoaderCircle size={20} className="spin" /> Memuat analitik...
				</div>
			) : error ? (
				<div className="ld-alert" role="alert">
					{error}
				</div>
			) : (
				<>
					<div className="an-stats">
						<Stat
							icon={<Users size={18} />}
							tint="slate"
							value={model.studentTotal ? String(model.studentTotal) : '—'}
							label={isStudent ? 'Tugas formal' : 'Mahasiswa'}
							hint={
								isStudent
									? `${model.taskTotal} tugas diterbitkan`
									: model.studentTotal
										? `${model.active} akun aktif · ${model.inactive} belum aktivasi`
										: 'Belum ada daftar mahasiswa'
							}
							empty={!model.studentTotal && !isStudent}
						/>
						<Stat
							icon={<ClipboardList size={18} />}
							tint="green"
							value={model.collectionRate == null ? '—' : `${model.collectionRate}%`}
							label="Tingkat pengumpulan"
							hint={
								model.expected
									? `${model.collected} / ${model.expected} pengumpulan`
									: 'Belum ada tugas formal'
							}
							empty={model.collectionRate == null}
						/>
						<Stat
							icon={<BarChart3 size={18} />}
							tint="amber"
							value={model.gradedRate == null ? '—' : `${model.gradedRate}%`}
							label="Penilaian selesai"
							hint={
								model.submittedCount
									? `${model.graded} / ${model.submittedCount} submission`
									: 'Belum ada yang terkumpul'
							}
							empty={model.gradedRate == null}
						/>
						<Stat
							icon={<BookOpen size={18} />}
							tint="blue"
							value={model.sessionTotal ? String(model.sessionTotal) : '—'}
							label="Sesi pertemuan"
							hint={
								model.sessionTotal
									? `${model.sessionsDone} selesai · ${model.sessionsUpcoming} mendatang`
									: 'Belum ada pertemuan'
							}
							empty={!model.sessionTotal}
						/>
						<Stat
							icon={<ClipboardList size={18} />}
							tint="violet"
							value={model.taskTotal ? String(model.taskTotal) : '—'}
							label="Tugas"
							hint={
								model.taskTotal
									? `${model.taskGraded} dinilai · ${model.taskOpen} berlangsung`
									: 'Belum ada tugas formal'
							}
							empty={!model.taskTotal}
						/>
					</div>

					<div className="an-grid-2">
						<article className="an-card">
							<header className="an-card-head">
								<h2>
									<AlertTriangle size={16} /> Hal yang perlu diperhatikan
								</h2>
								{model.alerts.length > 3 && (
									<button type="button" className="an-text" onClick={() => setShowAlerts((v) => !v)}>
										{showAlerts ? 'Ringkas' : 'Lihat semua'}
									</button>
								)}
							</header>
							{visibleAlerts.length === 0 ? (
								<Empty
									title="Tidak ada hal yang perlu diperhatikan"
									text="Peringatan muncul ketika ada tugas yang belum terkumpul, submission yang belum dinilai, atau pertemuan tanpa materi."
								/>
							) : (
								<ul className="an-alerts">
									{visibleAlerts.map((alert) => (
										<li key={alert.id} className={`an-alert ${alert.tone}`}>
											<div>
												<strong>{alert.title}</strong>
												<span>{alert.detail}</span>
											</div>
											{alert.action && (
												<Link
													to={
														alert.action === 'Lihat penilaian'
															? courseSectionPath(routeId, 'tugas')
															: alert.action === 'Buka pertemuan'
																? courseSectionPath(routeId, 'mata-kuliah')
																: courseSectionPath(routeId, 'mahasiswa')
													}
												>
													{alert.action} <ChevronRight size={14} />
												</Link>
											)}
										</li>
									))}
								</ul>
							)}
						</article>

						<article className="an-card">
							<header className="an-card-head">
								<h2>Progres per minggu</h2>
								<div className="an-legend">
									<span><i className="materi" /> Materi</span>
									<span><i className="tugas" /> Tugas</span>
									<span><i className="nilai" /> Penilaian</span>
								</div>
							</header>
							{model.weeks.length === 0 ? (
								<Empty title="Belum ada progres mingguan" text="Tambahkan pertemuan di Mata Kuliah agar grafik minggu terisi." />
							) : (
								<div className="an-chart">
									<ResponsiveContainer width="100%" height={220}>
										<BarChart data={model.weeks} barGap={0} barCategoryGap="10%">
											<CartesianGrid vertical={false} stroke="#EEF1F4" />
											<XAxis dataKey="label" tick={{ fontSize: 11, fill: '#98A2B3' }} axisLine={false} tickLine={false} />
											<YAxis tick={{ fontSize: 11, fill: '#98A2B3' }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" width={36} />
											<Tooltip formatter={(value, name) => [`${value}%`, String(name)]} />
											<Bar dataKey="materi" name="Materi" fill="#12B76A" radius={[3, 3, 0, 0]} barSize={6} />
											<Bar dataKey="tugas" name="Tugas" fill="#3B82F6" radius={[3, 3, 0, 0]} barSize={6} />
											<Bar dataKey="penilaian" name="Penilaian" fill="#F04438" radius={[3, 3, 0, 0]} barSize={6} />
										</BarChart>
									</ResponsiveContainer>
								</div>
							)}
						</article>
					</div>

					<div className="an-grid-2">
						<article className="an-card">
							<header className="an-card-head">
								<h2>Pencapaian Sub-CPMK</h2>
								<Link to={courseSectionPath(routeId, 'rps')} className="an-text">Lihat detail</Link>
							</header>
							{model.subCpmk.length === 0 ? (
								<Empty title="Belum ada Sub-CPMK" text="Susun Sub-CPMK di RPS untuk melihat pencapaian kelas." />
							) : (
								<div className="an-table-wrap">
									<table className="an-table">
										<thead>
											<tr>
												<th>Sub-CPMK</th>
												<th>Aktivitas terkait</th>
												<th>Pencapaian kelas</th>
												<th>Status</th>
											</tr>
										</thead>
										<tbody>
											{model.subCpmk.map((row) => (
												<tr key={row.id}>
													<td>
														<strong>{row.code}</strong> {row.description}
													</td>
													<td>{row.activities ? `${row.activities} aktivitas` : 'Belum ditautkan'}</td>
													<td>
														{row.percent == null ? (
															<span className="an-muted">Belum ada nilai</span>
														) : (
															<span className="an-meter">
																<span><i className={row.status} style={{ width: `${row.percent}%` }} /></span>
																<em>{row.percent}%</em>
															</span>
														)}
													</td>
													<td>
														<span className={`an-pill ${row.status}`}>
															{row.status === 'baik' ? 'Baik' : row.status === 'cukup' ? 'Cukup' : row.status === 'perhatian' ? 'Perlu perhatian' : 'Belum ada data'}
														</span>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</article>

						<article className="an-card">
							<header className="an-card-head">
								<h2>Distribusi pengumpulan tugas</h2>
								<div className="an-legend">
									<span><i className="materi" /> Tepat waktu</span>
									<span><i className="late" /> Terlambat</span>
									<span><i className="nilai" /> Tidak mengumpulkan</span>
								</div>
							</header>
							{model.distribution.length === 0 ? (
								<Empty title="Belum ada tugas formal" text="Tugas yang diterbitkan akan menampilkan tepat waktu, terlambat, dan belum mengumpulkan." />
							) : (
								<ul className="an-dist">
									{model.distribution.map((row) => {
										const base = row.total || 1;
										return (
											<li key={row.id}>
												<span>{row.title}</span>
												<span className="an-stack" aria-hidden>
													<i className="on" style={{ width: `${(row.onTime / base) * 100}%` }} />
													<i className="late" style={{ width: `${(row.late / base) * 100}%` }} />
													<i className="miss" style={{ width: `${(row.missing / base) * 100}%` }} />
												</span>
												<strong>{row.total ? `${Math.round((row.collected / row.total) * 100)}%` : '—'}</strong>
												<small>{row.collected}/{row.total || 0}</small>
											</li>
										);
									})}
								</ul>
							)}
						</article>
					</div>

					<div className="an-grid-3">
						{canSeeClass && (
							<article className="an-card">
								<header className="an-card-head">
									<h2>Mahasiswa yang perlu perhatian</h2>
									<Link to={courseSectionPath(routeId, 'mahasiswa')} className="an-text">Lihat semua</Link>
								</header>
								{model.attention.length === 0 ? (
									<Empty
										title="Tidak ada mahasiswa yang perlu perhatian"
										text={model.studentTotal ? 'Semua mahasiswa yang tercatat sudah mengumpulkan tugas formal.' : 'Isi daftar mahasiswa agar nama dan NIM bisa dipantau di sini.'}
									/>
								) : (
									<ul className="an-people">
										{model.attention.map((person) => (
											<li key={person.key}>
												<span className="an-avatar">{person.initials}</span>
												<div>
													<strong>{person.name}</strong>
													<span className="an-meter slim">
														<span><i className={person.tone === 'bad' ? 'perhatian' : person.tone === 'mid' ? 'cukup' : 'baik'} style={{ width: `${person.completion}%` }} /></span>
													</span>
												</div>
												<em>{person.completion}%</em>
												<span className="an-chip">{person.missing} belum</span>
												<small>{person.lastLabel}</small>
											</li>
										))}
									</ul>
								)}
							</article>
						)}

						<article className="an-card">
							<header className="an-card-head">
								<h2>Topik kesulitan yang sering muncul</h2>
								{canSeeClass ? <Link to="/app/tugas/insights" className="an-text">Lihat semua</Link> : null}
							</header>
							{model.topics.length === 0 ? (
								<Empty title="Belum ada topik kesulitan" text="Topik muncul dari riwayat Cek jawaban. Ini sinyal formatif, bukan nilai resmi." />
							) : (
								<ul className="an-topics">
									{model.topics.map((topic) => {
										const max = Math.max(...topic.bars, 1);
										return (
											<li key={topic.label}>
												<span>{topic.label}</span>
												<strong>{topic.people}</strong>
												<span className="an-spark" aria-hidden>
													{topic.bars.map((n, i) => (
														<i key={i} style={{ height: `${Math.max(12, (n / max) * 100)}%` }} />
													))}
												</span>
											</li>
										);
									})}
								</ul>
							)}
						</article>

						{canSeeClass && (
							<article className="an-card an-ai">
								<header className="an-card-head">
									<h2>
										<Sparkles size={16} /> Insight dari AI
									</h2>
									<Link to="/app/tugas/insights" className="an-text">Lihat semua</Link>
								</header>
								{(bundle?.insights.length || 0) === 0 ? (
									<Empty
										title="Belum ada insight AI"
										text="Rekomendasi dosen yang sudah dibuat untuk mata kuliah ini akan tampil di sini. Tidak ada teks yang dibuat-buat."
									/>
								) : (
									<ul className="an-alerts">
										{bundle!.insights.slice(0, 3).map((rec) => (
											<li key={rec.id} className="an-alert info">
												<div>
													<strong>{rec.observed}</strong>
													<span>{rec.action}</span>
												</div>
											</li>
										))}
									</ul>
								)}
							</article>
						)}
					</div>
				</>
			)}
		</section>
	);
}

function Stat({
	icon,
	tint,
	value,
	label,
	hint,
	empty,
}: {
	icon: React.ReactNode;
	tint: string;
	value: string;
	label: string;
	hint: string;
	empty?: boolean;
}) {
	return (
		<article className={`an-stat${empty ? ' is-empty' : ''}`}>
			<span className={`an-stat-ico ${tint}`}>{icon}</span>
			<div>
				<strong>{value}</strong>
				<span>{label}</span>
				<small>{hint}</small>
			</div>
		</article>
	);
}

function Empty({ title, text }: { title: string; text: string }) {
	return (
		<div className="an-empty">
			<strong>{title}</strong>
			<p>{text}</p>
		</div>
	);
}
