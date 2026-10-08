import { useEffect, useMemo, useState } from 'react';
import {
	ClipboardList,
	LoaderCircle,
	CalendarDays,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { useCourseRoster } from '@/hooks/use-course-roster';
import { useCourseSections } from '@/hooks/use-course-sections';
import { useSessionAttendance, useMyAttendance, type AttendanceStatus, type AttendanceRecord } from '@/hooks/use-attendance';
import type { ClassSession, CourseRosterEntry } from '@/lib/learning';
import { dateLabel, errorMessage } from '@/lib/learning';

type Props = {
	courseId: string;
	canEdit: boolean;
	isStudent: boolean;
	/** Selected kelas filter (empty = all sections). */
	sectionId?: string;
};

const STATUS_ORDER: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];

const STATUS_LABEL: Record<AttendanceStatus, string> = {
	present: 'Hadir',
	late: 'Terlambat',
	absent: 'Absen',
	excused: 'Izin',
};

const STATUS_SHORT: Record<AttendanceStatus, string> = {
	present: 'H',
	late: 'T',
	absent: 'A',
	excused: 'I',
};

export function AttendanceManager({ courseId, canEdit, isStudent, sectionId }: Props) {
	if (isStudent) {
		return <StudentAttendance courseId={courseId} />;
	}
	return (
		<LecturerAttendance courseId={courseId} canEdit={canEdit} sectionId={sectionId} />
	);
}

// ── Lecturer marking ──────────────────────────────────────────

function LecturerAttendance({
	courseId,
	canEdit,
	sectionId,
}: {
	courseId: string;
	canEdit: boolean;
	sectionId?: string;
}) {
	const { sections } = useCourseSections(courseId);
	const hasSections = sections.length > 0;
	const sectionName = (id?: string) => sections.find((s) => s.id === id)?.name || '';

	const sessionsQuery = useCachedQuery<ClassSession[]>(
		courseId ? `class_sessions:course=${courseId}` : null,
		() =>
			pb.collection('class_sessions').getFullList<ClassSession>({
				filter: pb.filter('course = {:id}', { id: courseId }),
				sort: 'week,created',
			}),
	);
	const { entries, loading: rosterLoading } = useCourseRoster(courseId);

	const sessions = useMemo(
		() =>
			(sectionId
				? (sessionsQuery.data ?? []).filter((s) => s.section === sectionId)
				: (sessionsQuery.data ?? [])),
		[sessionsQuery.data, sectionId],
	);
	const roster = useMemo(
		() => (sectionId ? entries.filter((e) => e.section === sectionId) : entries),
		[entries, sectionId],
	);

	const [selectedSession, setSelectedSession] = useState('');
	const [error, setError] = useState('');

	// Default to the first session once loaded.
	useEffect(() => {
		if (selectedSession || sessions.length === 0) return;
		setSelectedSession(sessions[0].id);
	}, [sessions, selectedSession]);

	const session = sessions.find((s) => s.id === selectedSession) ?? null;
	const { map: serverMap, loading: attLoading } = useSessionAttendance(session?.id);

	// Local mirror of attendance records so optimistic updates re-render
	// immediately; resynced whenever the server fetch resolves.
	const [localMap, setLocalMap] = useState<Map<string, AttendanceRecord>>(new Map());
	useEffect(() => {
		setLocalMap(new Map(serverMap));
	}, [serverMap]);

	const setStatus = async (entry: CourseRosterEntry, status: AttendanceStatus) => {
		if (!session) return;
		setError('');
		const existing = localMap.get(entry.id);
		// Optimistic update.
		const optimistic: AttendanceRecord = existing
			? { ...existing, status }
			: {
					id: '',
					session: session.id,
					roster: entry.id,
					section: sectionId || session.section || '',
					owner: pb.authStore.record?.id || '',
					student: '',
					status,
					created: '',
					updated: '',
				};
		setLocalMap((prev) => {
			const next = new Map(prev);
			next.set(entry.id, optimistic);
			return next;
		});
		try {
			if (existing) {
				await pb.collection('attendance').update(existing.id, { status });
			} else {
				const rec = await pb.collection('attendance').create<AttendanceRecord>({
					session: session.id,
					roster: entry.id,
					section: sectionId || session.section || null,
					owner: pb.authStore.record?.id,
					status,
				});
				setLocalMap((prev) => {
					const next = new Map(prev);
					next.set(entry.id, rec);
					return next;
				});
			}
			invalidate('attendance');
		} catch (err) {
			// Rollback to server state.
			setLocalMap(new Map(serverMap));
			setError(errorMessage(err));
		}
	};

	const summary = useMemo(() => {
		const counts: Record<AttendanceStatus, number> = { present: 0, late: 0, absent: 0, excused: 0 };
		let marked = 0;
		for (const entry of roster) {
			const rec = localMap.get(entry.id);
			if (rec) {
				counts[rec.status] += 1;
				marked += 1;
			}
		}
		return { counts, marked, total: roster.length };
	}, [roster, localMap]);

	const loading = sessionsQuery.loading || rosterLoading;

	return (
		<div className="ld-attendance">
			<div className="ld-attendance-head">
				<div>
					<span className="ld-eyebrow">Absensi</span>
					<h2 className="ld-attendance-title">Kehadiran mahasiswa</h2>
					<p className="ld-attendance-sub">
						Catat kehadiran per pertemuan. Absensi terpisah dari nilai dan
						pengumpulan tugas.
						{hasSections && sectionId && (
							<> Menampilkan kelas <strong>{sectionName(sectionId)}</strong>.</>
						)}
					</p>
				</div>
				{canEdit && sessions.length > 0 && (
					<label className="ld-attendance-session">
						<CalendarDays size={15} />
						<select
							value={selectedSession}
							onChange={(e) => setSelectedSession(e.target.value)}
							aria-label="Pilih pertemuan"
						>
							{sessions.map((s) => (
								<option key={s.id} value={s.id}>
									Minggu {String(s.week || '—').padStart(2, '0')} · {s.title}
									{s.date ? ` · ${dateLabel(s.date)}` : ''}
								</option>
							))}
						</select>
					</label>
				)}
			</div>

			{error && (
				<div className="ld-alert" role="alert">
					{error}{' '}
					<button type="button" onClick={() => setError('')}>Tutup</button>
				</div>
			)}

			{loading ? (
				<div className="ld-loading">
					<LoaderCircle size={24} className="spin" /> Memuat absensi…
				</div>
			) : sessions.length === 0 ? (
				<div className="ld-empty">
					<div className="ld-empty-icon">
						<CalendarDays size={26} strokeWidth={1.4} />
					</div>
					<h3>Belum ada pertemuan</h3>
					<p>
						{hasSections && sectionId
							? 'Belum ada sesi pada kelas ini. Tambahkan sesi di tab Pertemuan.'
							: 'Tambahkan sesi pada tab Pertemuan sebelum mencatat absensi.'}
					</p>
				</div>
			) : roster.length === 0 ? (
				<div className="ld-empty">
					<div className="ld-empty-icon">
						<ClipboardList size={26} strokeWidth={1.4} />
					</div>
					<h3>Belum ada mahasiswa</h3>
					<p>
						{hasSections && sectionId
							? 'Belum ada mahasiswa pada kelas ini. Tambahkan di tab Mahasiswa.'
							: 'Tambahkan mahasiswa di tab Mahasiswa sebelum mencatat absensi.'}
					</p>
				</div>
			) : !session ? null : (
				<>
					<div className="ld-attendance-summary">
						{STATUS_ORDER.map((s) => (
							<span key={s} className={`ld-att-sum-chip ${s}`}>
								<strong>{summary.counts[s]}</strong> {STATUS_LABEL[s]}
							</span>
						))}
						<span className="ld-att-sum-chip muted">
							<strong>{summary.marked}</strong>/{summary.total} tercatat
						</span>
					</div>

					<div className="ld-attendance-table-wrap">
						<table className="ld-attendance-table">
							<thead>
								<tr>
									<th className="ld-att-th-nim">NIM</th>
									<th className="ld-att-th-name">Nama</th>
									<th className="ld-att-th-status">Kehadiran</th>
								</tr>
							</thead>
							<tbody>
								{roster.map((entry) => {
									const rec = localMap.get(entry.id);
									const current = rec?.status;
									return (
										<tr key={entry.id} className="ld-att-tr">
											<td className="ld-att-td-nim" data-label="NIM">{entry.nim}</td>
											<td className="ld-att-td-name" data-label="Nama">{entry.name}</td>
											<td className="ld-att-td-status" data-label="Kehadiran">
												<div className="ld-att-buttons">
													{STATUS_ORDER.map((s) => (
														<button
															key={s}
															type="button"
															className={`ld-att-btn ${s}${current === s ? ' active' : ''}`}
															onClick={() => void setStatus(entry, s)}
															disabled={!canEdit}
															aria-label={`${STATUS_LABEL[s]} — ${entry.name}`}
															aria-pressed={current === s}
														>
															<span className="ld-att-btn-glyph">{STATUS_SHORT[s]}</span>
															<span className="ld-att-btn-label">{STATUS_LABEL[s]}</span>
														</button>
													))}
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
					{attLoading && (
						<div className="ld-att-foot">
							<LoaderCircle size={14} className="spin" /> Memuat…
						</div>
					)}
					{!canEdit && (
						<p className="ld-att-foot muted">Hanya dosen pengampu yang dapat mengubah absensi.</p>
					)}
				</>
			)}
		</div>
	);
}

// ── Student self-view ─────────────────────────────────────────

function StudentAttendance({ courseId }: { courseId: string }) {
	const { rows, loading, error } = useMyAttendance(courseId);

	const summary = useMemo(() => {
		const counts: Record<AttendanceStatus, number> = { present: 0, late: 0, absent: 0, excused: 0 };
		for (const r of rows) counts[r.status] += 1;
		return counts;
	}, [rows]);

	return (
		<div className="ld-attendance">
			<div className="ld-attendance-head">
				<div>
					<span className="ld-eyebrow">Absensi</span>
					<h2 className="ld-attendance-title">Kehadiran saya</h2>
					<p className="ld-attendance-sub">
						Riwayat kehadiran Anda pada mata kuliah ini. Absensi terpisah dari
						nilai dan pengumpulan tugas.
					</p>
				</div>
			</div>

			{error && (
				<div className="ld-alert" role="alert">
					{error}
				</div>
			)}

			{loading ? (
				<div className="ld-loading">
					<LoaderCircle size={24} className="spin" /> Memuat absensi…
				</div>
			) : rows.length === 0 ? (
				<div className="ld-empty">
					<div className="ld-empty-icon">
						<ClipboardList size={26} strokeWidth={1.4} />
					</div>
					<h3>Belum ada catatan kehadiran</h3>
					<p>Dosen belum mencatat kehadiran untuk pertemuan mana pun.</p>
				</div>
			) : (
				<>
					<div className="ld-attendance-summary">
						{STATUS_ORDER.map((s) => (
							<span key={s} className={`ld-att-sum-chip ${s}`}>
								<strong>{summary[s]}</strong> {STATUS_LABEL[s]}
							</span>
						))}
					</div>
					<div className="ld-attendance-table-wrap">
						<table className="ld-attendance-table">
							<thead>
								<tr>
									<th className="ld-att-th-week">Pertemuan</th>
									<th className="ld-att-th-date">Tanggal</th>
									<th className="ld-att-th-status">Kehadiran</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((r) => {
									const session = r.expand?.session;
									return (
										<tr key={r.id} className="ld-att-tr">
											<td className="ld-att-td-week" data-label="Pertemuan">
												{session ? (
													<>
														<small>Minggu {String(session.week || '—').padStart(2, '0')}</small>
														<strong>{session.title}</strong>
													</>
												) : (
													<strong>Pertemuan tidak tersedia</strong>
												)}
											</td>
											<td className="ld-att-td-date" data-label="Tanggal">
												{session?.date ? dateLabel(session.date) : '—'}
											</td>
											<td className="ld-att-td-status" data-label="Kehadiran">
												<span className={`ld-att-pill ${r.status}`}>{STATUS_LABEL[r.status]}</span>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</>
			)}
		</div>
	);
}
