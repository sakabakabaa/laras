import { useMemo } from 'react';
import { Link } from 'react-router';
import { BarChart3, LoaderCircle } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { channelOf, useDifficultyData } from '@/lib/difficulty-data';
import type { Assignment } from '@/lib/assignments';

/** Slice palette for the compact summary donuts — brand red first, then readable companions. */
const PIE_COLORS = ['#7F1D16', '#B3261E', '#8A6500', '#047857', '#2563EB', '#98A2B3'];

const NO_AREA = '(area tidak tercatat)';
const AREA_TOP = 4;

function pct(n: number, total: number) {
	if (!total) return 0;
	return Math.round((n / total) * 100);
}

type Slice = { name: string; value: number };
type Chart = { key: string; title: string; center: string; centerLabel: string; data: Slice[] };

/**
 * Compact lecturer summary on the Tugas board: four small donut charts of
 * category distributions aggregated across all authorized assignments, from
 * recorded Cek jawaban history only. Formative signals — no names, answers,
 * attachments, feedback text, or OCR text. Filters and per-assignment
 * breakdowns live on the separate Wawasan kesulitan page.
 */
export function DifficultySummary({ assignments }: { assignments: Assignment[] }) {
	const { attempts, error } = useDifficultyData(assignments);

	const charts = useMemo<Chart[]>(() => {
		if (!attempts || !attempts.length) return [];

		const areaMap = new Map<string, { label: string; n: number }>();
		const levels = { 1: 0, 2: 0, 3: 0, none: 0 };
		const checksByKey = new Map<string, number>();
		const channelCounts = { enrolled: 0, public: 0 };

		for (const a of attempts) {
			const label = a.area.trim().replace(/\s+/g, ' ') || NO_AREA;
			const key = label.toLowerCase();
			const row = areaMap.get(key);
			if (row) row.n += 1;
			else areaMap.set(key, { label, n: 1 });

			if (a.level === 1 || a.level === 2 || a.level === 3) levels[a.level] += 1;
			else levels.none += 1;

			checksByKey.set(a.identityKey, (checksByKey.get(a.identityKey) || 0) + 1);
			channelCounts[channelOf(a)] += 1;
		}

		const total = attempts.length;
		const participants = checksByKey.size;

		const topAreas = [...areaMap.values()].sort((x, y) => y.n - x.n);
		const shown = topAreas.slice(0, AREA_TOP);
		const rest = total - shown.reduce((sum, area) => sum + area.n, 0);
		const areaData: Slice[] = shown.map((area) => ({ name: area.label, value: area.n }));
		if (rest > 0) areaData.push({ name: 'Area lainnya', value: rest });

		const levelData: Slice[] = ([1, 2, 3] as const)
			.map((level) => ({ name: `Tingkat ${level}`, value: levels[level] }))
			.filter((row) => row.value > 0);
		if (levels.none > 0) levelData.push({ name: 'Tidak tercatat', value: levels.none });

		const buckets = [
			{ name: '1 kali', n: 0 },
			{ name: '2 kali', n: 0 },
			{ name: '3 kali', n: 0 },
			{ name: '4 kali', n: 0 },
			{ name: '5+ kali', n: 0 },
		];
		for (const checks of checksByKey.values()) {
			buckets[Math.min(checks, 5) - 1].n += 1;
		}
		const checksData: Slice[] = buckets
			.filter((b) => b.n > 0)
			.map((b) => ({ name: b.name, value: b.n }));

		const channelData: Slice[] = [
			{ name: 'Peserta terdaftar', value: channelCounts.enrolled },
			{ name: 'Peserta publik', value: channelCounts.public },
		].filter((row) => row.value > 0);

		return [
			{
				key: 'area',
				title: 'Area kesulitan',
				center: String(total),
				centerLabel: 'pemeriksaan',
				data: areaData,
			},
			{
				key: 'level',
				title: 'Tingkat panduan',
				center: String(total),
				centerLabel: 'pemeriksaan',
				data: levelData,
			},
			{
				key: 'checks',
				title: 'Pemeriksaan per peserta',
				center: String(participants),
				centerLabel: 'peserta',
				data: checksData,
			},
			{
				key: 'channel',
				title: 'Jenis peserta',
				center: String(total),
				centerLabel: 'pemeriksaan',
				data: channelData,
			},
		];
	}, [attempts]);

	return (
		<section className="asg-submissions-panel" aria-label="Ringkasan wawasan kesulitan">
			<div className="asg-submissions-head">
				<h3>
					<BarChart3 size={16} /> Wawasan kesulitan
				</h3>
				<div className="dsum-head-actions">
					<span className="asg-tag">Formatif — bukan nilai resmi</span>
					<Link to="/app/tugas/insights" className="ld-outline-action sm">
						<BarChart3 size={14} /> Lihat detail
					</Link>
				</div>
			</div>
			<p className="rps-help">
				Ringkasan agregat riwayat Cek jawaban di seluruh tugas Anda. Murni sinyal formatif —
				bukan nilai, dan tidak menampilkan nama, jawaban, lampiran, umpan balik, maupun teks
				OCR peserta. Buka halaman detail untuk saringan dan rincian per tugas.
			</p>

			{attempts === null ? (
				<div className="ld-loading">
					<LoaderCircle size={18} className="spin" /> Memuat ringkasan kesulitan...
				</div>
			) : error ? (
				<p className="asg-empty-line">{error}</p>
			) : charts.length === 0 ? (
				<p className="asg-empty-line">
					Belum ada data Cek jawaban pada tugas Anda. Ringkasan muncul setelah peserta memakai
					Cek jawaban.
				</p>
			) : (
				<div className="dsum-grid">
					{charts.map((chart) => {
						const total = chart.data.reduce((sum, row) => sum + row.value, 0);
						const ariaLabel = `${chart.title}: ${chart.data
							.map((row) => `${row.name} ${row.value} (${pct(row.value, total)}%)`)
							.join(', ')}`;
						return (
							<div className="dsum-card" key={chart.key}>
								<h4>{chart.title}</h4>
								<div className="dsum-chart" role="img" aria-label={ariaLabel}>
									<ResponsiveContainer width="100%" height={150}>
										<PieChart>
											<Pie
												data={chart.data}
												dataKey="value"
												nameKey="name"
												cx="50%"
												cy="50%"
												innerRadius={42}
												outerRadius={64}
												paddingAngle={2}
												stroke="#fff"
												strokeWidth={2}
											>
												{chart.data.map((row, i) => (
													<Cell
														key={row.name}
														fill={PIE_COLORS[i % PIE_COLORS.length]}
													/>
												))}
											</Pie>
											<Tooltip
												formatter={(value, name) => [
													`${value} (${pct(Number(value), total)}%)`,
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
									<div className="dsum-center" aria-hidden="true">
										<strong>{chart.center}</strong>
										<span>{chart.centerLabel}</span>
									</div>
								</div>
								<ul className="dsum-legend">
									{chart.data.map((row, i) => (
										<li key={row.name}>
											<span
												className="dsum-swatch"
												style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
											/>
											<span className="dsum-name">{row.name}</span>
											<span className="dsum-count">
												{row.value} ({pct(row.value, total)}%)
											</span>
										</li>
									))}
								</ul>
							</div>
						);
					})}
				</div>
			)}
		</section>
	);
}
