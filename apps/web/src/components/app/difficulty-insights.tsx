import { useMemo, useState } from 'react';
import { BarChart3, LoaderCircle } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { channelOf, useDifficultyData, type DifficultyChannel } from '@/lib/difficulty-data';
import { CHECK_LEVEL_LABEL } from '@/lib/check-types';
import type { Assignment } from '@/lib/assignments';
import type { Course } from '@/lib/learning';

type Channel = DifficultyChannel;
type StatusFilter = 'all' | 'collected' | 'pending' | 'late' | 'graded';

const NO_AREA = '(area tidak tercatat)';

/** Slice palette for the difficulty-area pie chart — brand red first, then readable companions. */
const PIE_COLORS = ['#7F1D16', '#B3261E', '#8A6500', '#047857', '#2563EB', '#98A2B3'];

const PIE_TOP = 5;

function pct(n: number, total: number) {
	if (!total) return 0;
	return Math.round((n / total) * 100);
}

function dayStart(day: string) {
	return new Date(`${day}T00:00:00`).getTime();
}

function dayEnd(day: string) {
	return new Date(`${day}T23:59:59.999`).getTime();
}

/**
 * Lecturer-only aggregate difficulty insights over the recorded formative
 * "Cek jawaban" history: which reflection areas and hint levels came up most,
 * and how many checks participants needed. Formative signals only — never
 * grades, verdicts, or invented criteria — and aggregate only: no names,
 * answers, attachments, feedback text, or OCR text are shown here.
 * Access stays scoped to the lecturer's own assignments via PocketBase rules.
 */
export function DifficultyInsights({
	assignments,
	courses,
}: {
	assignments: Assignment[];
	courses: Course[];
}) {
	const { attempts, statusByKey, error } = useDifficultyData(assignments);
	const [assignmentFilter, setAssignmentFilter] = useState('all');
	const [channelFilter, setChannelFilter] = useState<'all' | Channel>('all');
	const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
	const [areaFilter, setAreaFilter] = useState('all');
	const [from, setFrom] = useState('');
	const [to, setTo] = useState('');

	const areaOptions = useMemo(() => {
		if (!attempts) return [];
		const counts = new Map<string, { label: string; n: number }>();
		for (const a of attempts) {
			const label = a.area.trim().replace(/\s+/g, ' ');
			if (!label) continue;
			const key = label.toLowerCase();
			const row = counts.get(key);
			if (row) row.n += 1;
			else counts.set(key, { label, n: 1 });
		}
		return [...counts.values()].sort((x, y) => y.n - x.n);
	}, [attempts]);

	const filtered = useMemo(() => {
		if (!attempts) return [];
		return attempts.filter((a) => {
			if (assignmentFilter !== 'all' && a.assignment !== assignmentFilter) return false;
			if (channelFilter !== 'all' && channelOf(a) !== channelFilter) return false;
			if (areaFilter !== 'all') {
				const label = a.area.trim().replace(/\s+/g, ' ').toLowerCase();
				if (label !== areaFilter) return false;
			}
			const status = statusByKey.get(a.identityKey) || 'none';
			if (statusFilter === 'collected' && !(status === 'submitted' || status === 'late' || status === 'graded'))
				return false;
			if (statusFilter === 'pending' && !(status === 'none' || status === 'draft')) return false;
			if (statusFilter === 'late' && status !== 'late') return false;
			if (statusFilter === 'graded' && status !== 'graded') return false;
			const t = new Date(a.created).getTime();
			if (from && !Number.isNaN(t) && t < dayStart(from)) return false;
			if (to && !Number.isNaN(t) && t > dayEnd(to)) return false;
			return true;
		});
	}, [attempts, assignmentFilter, channelFilter, statusFilter, areaFilter, from, to, statusByKey]);

	const stats = useMemo(() => {
		const total = filtered.length;
		const byKey = new Map<string, { channel: Channel; checks: number; maxLevel: number }>();
		const levels = { 1: 0, 2: 0, 3: 0, none: 0 };
		const areaMap = new Map<string, { label: string; checks: number; people: Set<string> }>();
		const areaByAssignment = new Map<string, Map<string, { label: string; checks: number }>>();
		const maxByAssignment = new Map(assignments.map((a) => [a.id, a.checkMax || 5]));
		let fullQuota = 0;

		for (const a of filtered) {
			const level = a.level === 1 || a.level === 2 || a.level === 3 ? a.level : null;
			if (level) levels[level] += 1;
			else levels.none += 1;

			let p = byKey.get(a.identityKey);
			if (!p) {
				p = { channel: channelOf(a), checks: 0, maxLevel: 0 };
				byKey.set(a.identityKey, p);
			}
			p.checks += 1;
			if (level && level > p.maxLevel) p.maxLevel = level;

			const label = a.area.trim().replace(/\s+/g, ' ') || NO_AREA;
			const key = label.toLowerCase();
			let row = areaMap.get(key);
			if (!row) {
				row = { label, checks: 0, people: new Set() };
				areaMap.set(key, row);
			}
			row.checks += 1;
			row.people.add(a.identityKey);

			let areasOfAssignment = areaByAssignment.get(a.assignment);
			if (!areasOfAssignment) {
				areasOfAssignment = new Map();
				areaByAssignment.set(a.assignment, areasOfAssignment);
			}
			const areaRow = areasOfAssignment.get(key);
			if (areaRow) areaRow.checks += 1;
			else areasOfAssignment.set(key, { label: row.label, checks: 1 });
		}

		// A participant who exhausted their check quota on an assignment
		// signals persistent difficulty — counted once per participant.
		const quotaByKey = new Map<string, number>();
		for (const a of filtered) {
			const max = maxByAssignment.get(a.assignment) || 5;
			quotaByKey.set(a.identityKey, Math.max(quotaByKey.get(a.identityKey) || 0, max));
		}
		for (const [key, p] of byKey) {
			if (p.checks >= (quotaByKey.get(key) || 5)) fullQuota += 1;
		}

		const participants = byKey.size;
		const avg = participants ? Math.round((total / participants) * 10) / 10 : 0;

		const areas = [...areaMap.values()]
			.map((row) => ({ ...row, people: row.people.size }))
			.sort((x, y) => y.checks - x.checks || y.people - x.people);

		const buckets: { label: string; n: number }[] = [];
		for (let n = 1; n <= 5; n += 1) {
			buckets.push({ label: `${n} pemeriksaan`, n: 0 });
		}
		buckets.push({ label: '6+ pemeriksaan', n: 0 });
		for (const p of byKey.values()) {
			const idx = Math.min(p.checks, 6) - 1;
			buckets[idx].n += 1;
		}

		const byAssignment = new Map<string, { checks: number; people: Set<string> }>();
		for (const a of filtered) {
			let row = byAssignment.get(a.assignment);
			if (!row) {
				row = { checks: 0, people: new Set() };
				byAssignment.set(a.assignment, row);
			}
			row.checks += 1;
			row.people.add(a.identityKey);
		}

		return { total, participants, avg, levels, areas, buckets, fullQuota, byKey, byAssignment, areaByAssignment };
	}, [filtered, assignments]);

	/** Pie chart data: top difficulty areas by recorded checks, remainder aggregated. */
	const pieData = useMemo(() => {
		if (!stats.total) return [];
		const top = stats.areas.slice(0, PIE_TOP);
		const rest = stats.total - top.reduce((sum, area) => sum + area.checks, 0);
		const rows = top.map((area) => ({ name: area.label, value: area.checks, people: area.people }));
		if (rest > 0) rows.push({ name: 'Area lainnya', value: rest, people: 0 });
		return rows;
	}, [stats]);

	const assignmentRows = useMemo(() => {
		if (assignmentFilter !== 'all' || !stats.byAssignment.size) return [];
		const assignmentById = new Map(assignments.map((a) => [a.id, a]));
		return [...stats.byAssignment.entries()]
			.map(([id, row]) => {
				const assignment = assignmentById.get(id);
				const course = courses.find((c) => c.id === assignment?.course);
				const topArea = [...(stats.areaByAssignment.get(id)?.values() || [])]
					.sort((x, y) => y.checks - x.checks)[0];
				return {
					id,
					title: assignment?.title || 'Tugas',
					course: course?.title || '',
					checks: row.checks,
					people: row.people.size,
					topArea: topArea?.label || '',
				};
			})
			.sort((x, y) => y.checks - x.checks);
	}, [assignmentFilter, stats, assignments, courses]);

	const hasData = (attempts?.length ?? 0) > 0;

	return (
		<section className="asg-submissions-panel" aria-label="Wawasan kesulitan">
			<div className="asg-submissions-head">
				<h3>
					<BarChart3 size={16} /> Wawasan kesulitan
				</h3>
				<span className="asg-tag">Formatif — bukan nilai resmi</span>
			</div>
			<p className="rps-help">
				Agregat sinyal dari riwayat Cek jawaban: area yang paling sering perlu ditinjau, tingkat
				panduan terpakai, dan jumlah pemeriksaan per peserta. Murni ringkasan formatif — bukan
				nilai, bukan penilaian otomatis, dan tidak menampilkan nama, jawaban, lampiran, umpan
				balik, maupun teks OCR peserta.
			</p>

			{attempts === null ? (
				<div className="ld-loading">
					<LoaderCircle size={18} className="spin" /> Memuat wawasan kesulitan...
				</div>
			) : error ? (
				<p className="asg-empty-line">{error}</p>
			) : !hasData ? (
				<p className="asg-empty-line">
					Belum ada data Cek jawaban pada tugas Anda. Wawasan muncul setelah peserta memakai
					Cek jawaban.
				</p>
			) : (
				<>
					{filtered.length > 0 && pieData.length > 0 && (
						<div className="dif-pie-block">
							<div className="dif-pie-head">
								<h4>Sebaran area kesulitan</h4>
								<span className="asg-tag">Formatif — bukan nilai resmi</span>
							</div>
							<p className="dif-note">
								Lima area yang paling sering perlu ditinjau dari {stats.total} pemeriksaan
								tercatat. Diagram mengikuti saringan aktif di bawah — murni sinyal formatif.
							</p>
							<div className="dif-pie-body">
								<div className="dif-pie-chart">
									<ResponsiveContainer width="100%" height={260}>
										<PieChart>
											<Pie
												data={pieData}
												dataKey="value"
												nameKey="name"
												cx="50%"
												cy="50%"
												innerRadius={62}
												outerRadius={98}
												paddingAngle={2}
												stroke="#fff"
												strokeWidth={2}
											>
												{pieData.map((row, i) => (
													<Cell
														key={row.name}
														fill={PIE_COLORS[i % PIE_COLORS.length]}
													/>
												))}
											</Pie>
											<Tooltip
												formatter={(value, name) => [
													`${value} pemeriksaan (${pct(Number(value), stats.total)}%)`,
													String(name),
												]}
												contentStyle={{
													borderRadius: 10,
													border: '1px solid #E4E7EC',
													fontSize: 12,
												}}
											/>
										</PieChart>
									</ResponsiveContainer>
									<div className="dif-pie-center" aria-hidden="true">
										<strong>{stats.total}</strong>
										<span>pemeriksaan</span>
									</div>
								</div>
								<ul className="dif-pie-legend">
									{pieData.map((row, i) => (
										<li key={row.name}>
											<span
												className="dif-pie-swatch"
												style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
											/>
											<span className="dif-pie-name">{row.name}</span>
											<span className="dif-pie-count">
												{row.value} ({pct(row.value, stats.total)}%)
												{row.people ? ` · ${row.people} peserta` : ''}
											</span>
										</li>
									))}
								</ul>
							</div>
						</div>
					)}

					<div className="dif-filters">
						<label className="dif-select">
							Tugas
							<select value={assignmentFilter} onChange={(e) => setAssignmentFilter(e.target.value)}>
								<option value="all">Semua tugas</option>
								{assignments.map((a) => (
									<option key={a.id} value={a.id}>
										{a.title}
									</option>
								))}
							</select>
						</label>
						<div className="cho-tabs" role="group" aria-label="Saring jenis peserta">
							{(
								[
									['all', 'Semua peserta'],
									['enrolled', 'Terdaftar'],
									['public', 'Publik'],
								] as const
							).map(([value, label]) => (
								<button
									key={value}
									type="button"
									className={channelFilter === value ? 'active' : ''}
									onClick={() => setChannelFilter(value)}
								>
									{label}
								</button>
							))}
						</div>
						<div className="cho-tabs" role="group" aria-label="Saring status pengumpulan">
							{(
								[
									['all', 'Semua status'],
									['collected', 'Sudah kumpul'],
									['pending', 'Belum kumpul'],
									['late', 'Terlambat'],
									['graded', 'Dinilai'],
								] as const
							).map(([value, label]) => (
								<button
									key={value}
									type="button"
									className={statusFilter === value ? 'active' : ''}
									onClick={() => setStatusFilter(value)}
								>
									{label}
								</button>
							))}
						</div>
						{areaOptions.length > 0 && (
							<label className="dif-select">
								Area
								<select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
									<option value="all">Semua area</option>
									{areaOptions.map((o) => (
										<option key={o.label} value={o.label.toLowerCase()}>
											{o.label}
										</option>
									))}
								</select>
							</label>
						)}
						<label className="dif-date">
							Dari
							<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
						</label>
						<label className="dif-date">
							Sampai
							<input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
						</label>
					</div>

					{filtered.length === 0 ? (
						<p className="asg-empty-line">Tidak ada pemeriksaan yang cocok dengan saringan ini.</p>
					) : (
						<>
							<div className="asg-tags cho-summary">
								<span className="asg-tag">{stats.total} pemeriksaan</span>
								<span className="asg-tag">{stats.participants} peserta</span>
								<span className="asg-tag">Rata-rata {stats.avg} per peserta</span>
								{stats.levels[3] > 0 && (
									<span className="asg-tag grade">
										{stats.levels[3]} panduan tingkat 3 ({pct(stats.levels[3], stats.total)}%)
									</span>
								)}
								{stats.fullQuota > 0 && (
									<span className="asg-tag grade">
										{stats.fullQuota} peserta memakai seluruh kuota
									</span>
								)}
							</div>

							<div className="dif-grid">
								<div className="dif-block">
									<h4>Area yang paling sering perlu ditinjau</h4>
									{stats.areas.length === 0 ? (
										<p className="asg-empty-line">Belum ada area tercatat.</p>
									) : (
										<ol className="dif-rows">
											{stats.areas.slice(0, 8).map((area) => (
												<li key={area.label}>
													<span className="dif-area-name">{area.label}</span>
													<span className="dif-bar">
														<span style={{ width: `${pct(area.checks, stats.total)}%` }} />
													</span>
													<span className="dif-count">
														{area.checks} ({pct(area.checks, stats.total)}%) · {area.people} peserta
													</span>
												</li>
											))}
										</ol>
									)}
								</div>

								<div className="dif-block">
									<h4>Tingkat panduan terpakai</h4>
									<ol className="dif-rows">
										{([1, 2, 3] as const).map((level) => (
											<li key={level}>
												<span className="dif-area-name">{CHECK_LEVEL_LABEL[level]}</span>
												<span className="dif-bar">
													<span style={{ width: `${pct(stats.levels[level], stats.total)}%` }} />
												</span>
												<span className="dif-count">
													{stats.levels[level]} ({pct(stats.levels[level], stats.total)}%)
												</span>
											</li>
										))}
										{stats.levels.none > 0 && (
											<li>
												<span className="dif-area-name">Tingkat tidak tercatat</span>
												<span className="dif-bar">
													<span style={{ width: `${pct(stats.levels.none, stats.total)}%` }} />
												</span>
												<span className="dif-count">
													{stats.levels.none} ({pct(stats.levels.none, stats.total)}%)
												</span>
											</li>
										)}
									</ol>
									<p className="dif-note">
										Peserta yang mencapai tingkat 3 berulang kali memerlukan petunjuk terarah
										pada area yang sama.
									</p>
								</div>

								<div className="dif-block">
									<h4>Pemeriksaan per peserta</h4>
									<ol className="dif-rows">
										{stats.buckets
											.filter((b) => b.n > 0)
											.map((b) => (
												<li key={b.label}>
													<span className="dif-area-name">{b.label}</span>
													<span className="dif-bar">
														<span style={{ width: `${pct(b.n, stats.participants)}%` }} />
													</span>
													<span className="dif-count">
														{b.n} peserta ({pct(b.n, stats.participants)}%)
													</span>
												</li>
											))}
									</ol>
									<p className="dif-note">
										Semakin banyak pemeriksaan mandiri, semakin kuat sinyal kesulitan —
										tetap bukan penilaian.
									</p>
								</div>
							</div>

							{assignmentRows.length > 0 && (
								<div className="dif-block">
									<h4>Ringkasan per tugas</h4>
									<ol className="dif-rows">
										{assignmentRows.map((row) => (
											<li key={row.id}>
												<span className="dif-area-name">
													{row.title}
													{row.course ? <small>{row.course}</small> : null}
													{row.topArea ? <em>Area teratas: {row.topArea}</em> : null}
												</span>
												<span className="dif-count">
													{row.checks} pemeriksaan · {row.people} peserta
												</span>
											</li>
										))}
									</ol>
								</div>
							)}
						</>
					)}
				</>
			)}
		</section>
	);
}
