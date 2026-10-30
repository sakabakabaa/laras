import { useT } from '@/lib/i18n';
import { PracticeMascot } from './practice-mascot';
import { useEffect, useId, useMemo, useState } from 'react';
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
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
	const chartId = useId();
	const t = useT();
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [reloadKey, setReloadKey] = useState(0);
	const [week, setWeek] = useState(0);
	const [showAlerts, setShowAlerts] = useState(false);
	const canSeeClass = !isStudent && course.owner === pb.authStore.record?.id;
	const [now, setNow] = useState(0);
	const [bundle, setBundle] = useState<{
		assignments: Assignment[];
		submissions: AssignmentSubmission[];
		publicSubmissions: (AssignmentSubmission & { linkedSubmission?: string })[];
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
				const [submissions, attempts, roster, publicSubmissions] = await Promise.all([
					assignFilter
						? pb.collection('assignment_submissions').getFullList<AssignmentSubmission>({
								filter: isStudent ? `(${assignFilter}) && ${pb.filter('owner = {:id}', { id: pb.authStore.record?.id })}` : assignFilter,
								fields: 'id,assignment,owner,status,grade,updated,created',
							})
						: Promise.resolve([] as AssignmentSubmission[]),
					assignFilter
						? pb.collection('check_attempts').getFullList<AnalyticsAttempt>({
								filter: isStudent ? `(${assignFilter}) && ${pb.filter('owner = {:id}', { id: pb.authStore.record?.id })}` : assignFilter,
								fields: 'id,assignment,area,identityKey,owner,participantName,created,level',
							})
						: Promise.resolve([] as AnalyticsAttempt[]),
					canSeeClass
						? pb.collection('course_roster').getFullList<CourseRosterEntry>({
								filter: pb.filter('course = {:id}', { id: course.id }),
								sort: 'name',
							})
						: Promise.resolve([] as CourseRosterEntry[]),
					canSeeClass && assignFilter ? pb.collection('public_submissions').getFullList<AssignmentSubmission & { linkedSubmission?: string }>({filter: assignFilter, fields: 'id,assignment,status,grade,updated,created,linkedSubmission'}) : Promise.resolve([]),
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
					publicSubmissions,
					sessions,
					subCpmks,
					roster,
					accounts,
					attempts: myAttempts,
					identities,
					insights,
				});
			} catch {
				if (alive) setError(t('audit.error'));
			} finally {
				if (alive) setLoading(false);
			}
		})();
		return () => {
			alive = false;
		};
	}, [course.id, canSeeClass, isStudent, reloadKey, t]);

	const model = useMemo(() => {
		if (!bundle || !now) return null;
		return buildCourseAnalytics({ ...bundle, now, week, studentId: isStudent ? pb.authStore.record?.id : undefined });
	}, [bundle, now, week, isStudent]);

	const weeks = useMemo(() => {
		const set = new Set((bundle?.sessions || []).map((s) => s.week).filter((w) => w > 0));
		return [...set].sort((a, b) => a - b);
	}, [bundle]);

	const personalAlerts = (model?.alerts || []).map(alert => !isStudent ? alert : alert.id.startsWith('own-') && alert.id !== 'own-grading' ? { ...alert, title: t('audit.ownMissing', { title: bundle?.assignments.find(a => `/app/kerja/${a.id}` === alert.href)?.title || '' }), action: t('audit.openTask') } : { ...alert, title: t('audit.ownPending', { count: String((model?.submittedCount || 0) - (model?.graded || 0)) }), detail: t('audit.draftNote'), action: t('audit.ownGrades') });
 const visibleAlerts = showAlerts ? personalAlerts : personalAlerts.slice(0, 3);

	return (
		<section className="an-page" aria-label={`Analitik ${course.title}`}>
			<div className={`an-head${isStudent ? ' student-page-banner' : ''}`}>
				<div>
					<Link to="/analytics" className="an-back">
						← {t('audit.analytics')}
					</Link>
					<h1>{course.title}</h1>
					<p>
						{[course.semester, course.academicYear].filter(Boolean).join(' · ') || t('audit.noPeriod')}
					</p>
				</div>
				{isStudent && <span className="student-banner-mascot" aria-hidden="true"><PracticeMascot size={85} /></span>}
				<label className="an-period">
					<CalendarRange size={16} />
					<select value={String(week)} onChange={(e) => setWeek(Number(e.target.value))} aria-label={t('audit.period')}>
						<option value="0">{t('audit.semester')}</option>
						{weeks.map((w) => (
							<option key={w} value={w}>
								{t('audit.week', { week: String(w) })}
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

			{error ? (<div className="ld-alert" role="alert">{error} <button type="button" onClick={() => setReloadKey(k => k + 1)}>{t('audit.retry')}</button></div>) : loading || !model ? (
				<div className="an-loading">
					<LoaderCircle size={20} className="spin" /> Memuat analitik...
				</div>
			) : error ? (
				<div className="ld-alert" role="alert">
					{error}
				</div>
			) : (
				<>
					{!isStudent && !model.taskTotal && (
						<div className="an-nudge" role="note">
							<div className="an-nudge-copy">
								<strong>Belum ada data untuk dianalisis</strong>
								<span>Analitik terisi otomatis setelah tugas pertama diterbitkan dan mahasiswa mulai mengumpulkan.</span>
							</div>
							<Link to="/app/tugas/buat" className="an-nudge-cta">
								Buat tugas pertama <ChevronRight size={16} />
							</Link>
						</div>
					)}
					<div className="an-stats">
						<Stat
							icon={<Users size={18} />}
							tint="slate"
							value={isStudent ? String(model.taskTotal) : model.studentTotal ? String(model.studentTotal) : '—'}
							label={isStudent ? t('audit.formal') : t('audit.students')}
							hint={
								isStudent
									? String(model.taskTotal)
									: model.studentTotal
										? `${model.active} akun aktif · ${model.inactive} belum aktivasi`
										: t('audit.noRoster')
							}
							empty={!model.studentTotal && !isStudent}
						/>
						<Stat
							icon={<ClipboardList size={18} />}
							tint="green"
							value={model.collectionRate == null ? '—' : `${model.collectionRate}%`}
							label={t('audit.collection')}
							hint={
								model.expected
									? `${model.collected} / ${model.expected}`
									: t('audit.noTask')
							}
							empty={model.collectionRate == null}
						/>
						<Stat
							icon={<BarChart3 size={18} />}
							tint="amber"
							value={model.gradedRate == null ? '—' : `${model.gradedRate}%`}
							label={t('audit.grading')}
							hint={
								model.submittedCount
									? `${model.graded} / ${model.submittedCount}`
									: t('audit.noCollected')
							}
							empty={model.gradedRate == null}
						/>
						<Stat
							icon={<BookOpen size={18} />}
							tint="blue"
							value={model.sessionTotal ? String(model.sessionTotal) : '—'}
							label={t('audit.sessions')}
							hint={
								model.sessionTotal
									? `${model.sessionsDone} selesai · ${model.sessionsUpcoming} mendatang`
									: t('audit.noSession')
							}
							empty={!model.sessionTotal}
						/>
						<Stat
							icon={<ClipboardList size={18} />}
							tint="violet"
							value={model.taskTotal ? String(model.taskTotal) : '—'}
							label={t('audit.tasks')}
							hint={
								model.taskTotal
									? `${model.taskGraded} dinilai · ${model.taskOpen} berlangsung`
									: t('audit.noTask')
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
										{showAlerts ? t('audit.short') : t('audit.all')}
									</button>
								)}
							</header>
							{visibleAlerts.length === 0 ? (
								<Empty
									title={t('audit.noAttention')}
									text={t('audit.emptyAttention')}
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
														alert.href ? alert.href : isStudent ? courseSectionPath(routeId, 'nilai') : alert.id === 'ungraded'
															? courseSectionPath(routeId, 'tugas')
															: alert.id.startsWith('materi-')
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
								<h2>{t('audit.progress')}</h2>
								<div className="an-legend">
									<span><i className="materi" /> {t('audit.materials')}</span>
									<span><i className="tugas" /> {t('audit.tasks')}</span>
									<span><i className="nilai" /> {t('audit.assessment')}</span>
								</div>
							</header>
							{model.weeks.length === 0 ? (
								<Empty title={t('audit.noWeekly')} text={t('audit.weeklyEmpty')} />
							) : (
								<div className="an-chart">
									<ResponsiveContainer width="100%" height={220}>
										<AreaChart data={model.weeks.map(row => ({ ...row, label: t('audit.week', { week: String(row.week) }) }))} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                                            <defs>
                                                {['#12B76A', '#3B82F6', '#F04438'].map((color, index) => <linearGradient key={color} id={`${chartId}-area-${index}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.22} /><stop offset="100%" stopColor={color} stopOpacity={0.02} /></linearGradient>)}
                                            </defs>
											<CartesianGrid vertical={false} stroke="#EEF1F4" />
											<XAxis dataKey="label" tick={{ fontSize: 11, fill: '#98A2B3' }} axisLine={false} tickLine={false} />
											<YAxis tick={{ fontSize: 11, fill: '#98A2B3' }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" width={36} />
											<Tooltip formatter={(value, name) => [`${value}%`, String(name)]} />
											<Area type="monotone" dataKey="materi" name={t('audit.materials')} stroke="#12B76A" strokeWidth={2.5} fill={`url(#${chartId}-area-0)`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
											<Area type="monotone" dataKey="tugas" name={t('audit.tasks')} stroke="#3B82F6" strokeWidth={2.5} fill={`url(#${chartId}-area-1)`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
											<Area type="monotone" dataKey="penilaian" name={t('audit.assessment')} stroke="#F04438" strokeWidth={2.5} fill={`url(#${chartId}-area-2)`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
										</AreaChart>
									</ResponsiveContainer>
								</div>
							)}
						</article>
					</div>

					<div className="an-grid-2">
						<article className="an-card">
							<header className="an-card-head">
								<h2>{isStudent ? t('audit.yourAchievement') : t('audit.achievement')}</h2>
								<Link to={courseSectionPath(routeId, 'rps')} className="an-text">{t('audit.detail')}</Link>
							</header>
							{model.subCpmk.length === 0 ? (
								<Empty title={t('audit.noOutcome')} text={isStudent ? t('audit.ownNoTasks') : 'Susun Sub-CPMK di RPS untuk melihat pencapaian kelas.'} />
							) : (
								<div className="an-table-wrap">
									<table className="an-table">
										<thead>
											<tr>
												<th>Sub-CPMK</th>
												<th>{t('audit.activities')}</th>
												<th>{isStudent ? t('audit.yourAchievement') : t('audit.classAchievement')}</th>
												<th>{t('audit.status')}</th>
											</tr>
										</thead>
										<tbody>
											{model.subCpmk.map((row) => (
												<tr key={row.id}>
													<td>
														<strong>{row.code}</strong> {row.description}
													</td>
													<td>{row.activities ? `${row.activities} aktivitas` : t('audit.unlinked')}</td>
													<td>
														{row.percent == null ? (
															<span className="an-muted">{t('audit.noGrade')}</span>
														) : (
															<span className="an-meter">
																<span><i className={row.status} style={{ width: `${row.percent}%` }} /></span>
																<em>{row.percent}%</em>
															</span>
														)}
													</td>
													<td>
														<span className={`an-pill ${row.status}`}>
															{row.status === 'baik' ? t('audit.good') : row.status === 'cukup' ? t('audit.adequate') : row.status === 'perhatian' ? t('audit.needsAttention') : t('audit.noData')}
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
								<h2>{t('audit.distribution')}</h2>
								<div className="an-legend">
									<span><i className="materi" /> {t('audit.onTime')}</span>
									<span><i className="late" /> {t('audit.late')}</span>
									<span><i className="nilai" /> {t('audit.missing')}</span>
								</div>
							</header>
							{model.distribution.length === 0 ? (
								<Empty title={t('audit.noTask')} text={t('audit.ownNoTasks')} />
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
									<Link to={courseSectionPath(routeId, 'mahasiswa')} className="an-text">{t('audit.all')}</Link>
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
								<h2>{t('audit.topicTitle')}</h2>
								{canSeeClass ? <Link to="/app/tugas/insights" className="an-text">{t('audit.all')}</Link> : null}
							</header>
							{model.topics.length === 0 ? (
								<Empty title={t('audit.noTopics')} text={t('audit.topicsEmpty')} />
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
									<Link to="/app/tugas/insights" className="an-text">{t('audit.all')}</Link>
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
