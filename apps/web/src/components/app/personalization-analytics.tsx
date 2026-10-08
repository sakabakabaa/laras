/**
 * Phase 10 — lecturer/researcher-only personalization analytics.
 *
 * Two research-only views built on existing Phase 9/10 data:
 *  1. Generic vs. personalized comparison — side-by-side interaction counts,
 *     uptake rate, successful-revision rate, and hint-level outcomes, with
 *     filters/breakdowns by category, CEFR, assignment, task shape, and model.
 *  2. Category-level improvement/recurrence trajectories — whether validated
 *     error patterns recur or decline over time.
 *
 * No-causality wording is preserved throughout: metrics describe
 * feedback-associated outcomes, never "personalization caused improvement."
 * Rates are suppressed ("Belum cukup data") below MIN_COMPARISON. Students
 * never reach this view (route guard + server role check).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	AlertTriangle,
	BarChart3,
	Filter,
	FlaskConical,
	LoaderCircle,
	Repeat,
	ShieldCheck,
	Sparkles,
	TrendingDown,
	TrendingUp,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { useAuth } from '@/hooks/use-auth';
import { errorMessage } from '@/lib/learning';
import {
	computePersonalizationComparison,
	computeCategoryTrajectories,
	type ComparisonFilters,
	type InteractionRecord,
	type ModeStats,
	type PersonalizationComparison,
	type CategoryTrajectories,
	type ValidatedObservation,
} from '@/lib/personalization-analytics';

const INSUFFICIENT = 'Belum cukup data';

function pct(value: number | null): string {
	return value == null ? INSUFFICIENT : `${value}%`;
}

function ModeColumn({ title, stats, accent }: { title: string; stats: ModeStats; accent: 'generic' | 'personalized' }) {
	return (
		<div className={`pa-mode-col ${accent}`}>
			<div className="pa-mode-head">
				<span className={`pa-mode-dot ${accent}`} />
				<h4>{title}</h4>
				<span className="asg-tag">{stats.interactions} interaksi</span>
			</div>
			<div className="pa-mode-grid">
				<div className="pa-mode-stat">
					<span>Interaksi</span>
					<strong>{stats.interactions}</strong>
				</div>
				<div className="pa-mode-stat">
					<span>Ada revisi</span>
					<strong>{stats.withRevision}</strong>
				</div>
				<div className="pa-mode-stat">
					<span>Dianotasi uptake</span>
					<strong>{stats.withUptakeAnnotation}</strong>
				</div>
				<div className="pa-mode-stat">
					<span>Uptake berhasil</span>
					<strong className={stats.uptakeRate == null ? 'ra-insufficient' : ''}>{pct(stats.uptakeRate)}</strong>
				</div>
				<div className="pa-mode-stat">
					<span>Revisi berhasil</span>
					<strong className={stats.successfulRevisionRate == null ? 'ra-insufficient' : ''}>
						{pct(stats.successfulRevisionRate)}
					</strong>
				</div>
				<div className="pa-mode-stat">
					<span>Rata-rata hint</span>
					<strong className={stats.averageHintLevel == null ? 'ra-insufficient' : ''}>
						{stats.averageHintLevel == null ? INSUFFICIENT : String(stats.averageHintLevel)}
					</strong>
				</div>
			</div>
			<div className="pa-hint-bars">
				{stats.hintDistribution.map((h) => (
					<div className="pa-hint-bar" key={h.level}>
						<div className="pa-hint-track">
							<span
								style={{
									height: stats.interactions > 0 ? `${Math.max(4, (h.count / stats.interactions) * 100)}%` : '4%',
								}}
							/>
						</div>
						<small>L{h.level}</small>
						<strong>{h.count}</strong>
						<em className={h.rate == null ? 'ra-insufficient' : ''}>{h.rate == null ? '—' : `${h.rate}%`}</em>
					</div>
				))}
			</div>
			{!stats.sufficient && <p className="ra-note">{INSUFFICIENT} — interaksi kurang dari minimum.</p>}
		</div>
	);
}

function ComparisonBreakdownTable({
	title,
	rows,
}: {
	title: string;
	rows: PersonalizationComparison['breakdowns']['byCategory'];
}) {
	if (rows.length === 0) return null;
	return (
		<div className="ra-panel ra-breakdown">
			<div className="ra-panel-head">
				<h3>{title}</h3>
				<span className="asg-tag">{rows.length} kelompok</span>
			</div>
			<div className="ra-table-wrap">
				<table className="ra-table">
					<thead>
						<tr>
							<th>Kelompok</th>
							<th>Generik · interaksi</th>
							<th>Generik · uptake</th>
							<th>Generik · revisi berhasil</th>
							<th>Personalisasi · interaksi</th>
							<th>Personalisasi · uptake</th>
							<th>Personalisasi · revisi berhasil</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.key}>
								<td>{row.label}</td>
								<td>{row.generic.interactions}</td>
								<td className={row.generic.uptakeRate == null ? 'ra-insufficient' : ''}>{pct(row.generic.uptakeRate)}</td>
								<td className={row.generic.successfulRevisionRate == null ? 'ra-insufficient' : ''}>
									{pct(row.generic.successfulRevisionRate)}
								</td>
								<td>{row.personalized.interactions}</td>
								<td className={row.personalized.uptakeRate == null ? 'ra-insufficient' : ''}>
									{pct(row.personalized.uptakeRate)}
								</td>
								<td className={row.personalized.successfulRevisionRate == null ? 'ra-insufficient' : ''}>
									{pct(row.personalized.successfulRevisionRate)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function FilterSelect({
	label,
	options,
	value,
	onChange,
}: {
	label: string;
	options: string[];
	value: string[];
	onChange: (v: string[]) => void;
}) {
	const toggle = (opt: string) => {
		onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
	};
	return (
		<div className="pa-filter">
			<span>{label}</span>
			<div className="pa-filter-chips">
				{options.length === 0 && <small className="ra-insufficient">Tidak ada opsi</small>}
				{options.map((opt) => (
					<button
						key={opt}
						type="button"
						className={`pa-chip${value.includes(opt) ? ' active' : ''}`}
						onClick={() => toggle(opt)}
					>
						{opt}
					</button>
				))}
			</div>
		</div>
	);
}

function TrendIcon({ trend }: { trend: string }) {
	if (trend === 'increasing') return <TrendingUp size={13} className="pa-trend up" />;
	if (trend === 'decreasing') return <TrendingDown size={13} className="pa-trend down" />;
	return <BarChart3 size={13} className="pa-trend" />;
}

const TREND_LABEL: Record<string, string> = {
	increasing: 'Meningkat',
	decreasing: 'Menurun',
	stable: 'Stabil',
	insufficient: 'Data kurang',
};

function TrajectoryCard({ traj }: { traj: CategoryTrajectories['trajectories'][number] }) {
	const maxCount = Math.max(1, ...traj.points.map((p) => p.count));
	return (
		<div className="ra-panel pa-traj">
			<div className="ra-panel-head">
				<h3>{traj.category}</h3>
				<span className="asg-tag">{traj.totalObservations} observasi tervalidasi</span>
			</div>
			<div className="pa-traj-trend">
				<TrendIcon trend={traj.trend} />
				<span>
					Tren: <strong>{TREND_LABEL[traj.trend]}</strong>
				</span>
				{!traj.sufficient && <em className="ra-insufficient">· {INSUFFICIENT}</em>}
			</div>
			<div className="pa-traj-chart">
				{traj.points.map((p) => (
					<div className="pa-traj-col" key={p.bucket}>
						<div className="pa-traj-bar-wrap">
							<div className="pa-traj-bar" style={{ height: `${(p.count / maxCount) * 100}%` }}>
								<span>{p.count}</span>
							</div>
						</div>
						<small>{p.label}</small>
						<div className="pa-traj-meta">
							<span title="Peserta unik">{p.distinctLearners} peserta</span>
							<span className={p.recurrenceRate == null ? 'ra-insufficient' : ''} title="Tingkat rekurensi">
								{p.recurrenceRate == null ? '—' : `${p.recurrenceRate}%`} rekuren
							</span>
							<span className={p.improvementRate == null ? 'ra-insufficient' : ''} title="Tingkat perbaikan">
								{p.improvementRate == null ? '—' : `${p.improvementRate}%`} membaik
							</span>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export function PersonalizationAnalytics() {
	const { user } = useAuth();
	const [records, setRecords] = useState<InteractionRecord[]>([]);
	const [observations, setObservations] = useState<ValidatedObservation[]>([]);
	const [assignments, setAssignments] = useState<{ id: string; title: string }[]>([]);
	const [assignmentId, setAssignmentId] = useState('');
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	const [filters, setFilters] = useState<ComparisonFilters>({
		categories: [],
		cefrLevels: [],
		assignmentIds: [],
		shapes: [],
		models: [],
	});

	const load = useCallback(async () => {
		setLoading(true);
		setError('');
		try {
			const res = await fetch('/api/personalization-analytics', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({ assignmentId: assignmentId || undefined }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
				throw new Error(body.error || body.message || 'Gagal memuat analitik personalisasi.');
			}
			const data = (await res.json()) as {
				comparisonRecords: InteractionRecord[];
				trajectoryObservations: ValidatedObservation[];
				assignments: { id: string; title: string }[];
			};
			setRecords(data.comparisonRecords);
			setObservations(data.trajectoryObservations);
			setAssignments(data.assignments);
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setLoading(false);
		}
	}, [assignmentId]);

	useEffect(() => {
		if (!user?.id) return;
		void load();
	}, [user?.id, load]);

	const comparison = useMemo<PersonalizationComparison | null>(
		() => (records.length > 0 ? computePersonalizationComparison(records, filters) : null),
		[records, filters],
	);

	const trajectories = useMemo<CategoryTrajectories>(
		() => computeCategoryTrajectories(observations),
		[observations],
	);

	const hasComparison = records.length > 0;
	const hasTrajectories = trajectories.trajectories.length > 0;

	return (
		<div className="research-analytics">
			<div className="research-export-head">
				<span className="research-export-badge">
					<Sparkles size={14} /> Personalisasi
				</span>
				<h1>Perbandingan umpan balik generik vs personalisasi</h1>
				<p>
					Metrik riset untuk membandingkan hasil umpan balik generik dan personalisasi: jumlah
					interaksi, tingkat uptake, tingkat revisi berhasil, dan hasil tingkat hint. Dapat
					difilter berdasarkan kategori linguistik, tingkat CEFR, tugas, tipe tugas, dan model.
				</p>
				<p className="research-export-private">
					<ShieldCheck size={14} /> Khusus dosen pemilik atau peneliti yang diotorisasi. Tidak
					tersedia untuk mahasiswa. Metrik bersifat asosiatif — bukan klaim kausalitas.
				</p>
			</div>

			<div className="ra-toolbar">
				<label className="research-export-field">
					<span>Cakupan tugas</span>
					<select value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>
						<option value="">Semua tugas saya</option>
						{assignments.map((a) => (
							<option key={a.id} value={a.id}>
								{a.title}
							</option>
						))}
					</select>
				</label>
			</div>

			{loading ? (
				<div className="ld-loading">
					<LoaderCircle size={18} className="spin" /> Memuat analitik personalisasi…
				</div>
			) : error ? (
				<div className="ld-alert" role="alert">
					{error}
					<button type="button" onClick={() => void load()}>
						Coba lagi
					</button>
				</div>
			) : !hasComparison && !hasTrajectories ? (
				<div className="research-export-empty">
					<FlaskConical size={28} />
					<h3>Belum ada data personalisasi</h3>
					<p>
						Analitik personalisasi muncul setelah ada interaksi Cek jawaban pada tugas dengan
						mode umpan balik personalisasi, dan/atau temuan AI tervalidasi pada tugas formal.
					</p>
				</div>
			) : (
				<>
					{hasComparison && comparison ? (
						<>
							<div className="ra-section-label">
								<Filter size={13} /> Filter perbandingan
							</div>
							<div className="pa-filters">
								<FilterSelect
									label="Kategori"
									options={comparison.filters.categories}
									value={filters.categories}
									onChange={(v) => setFilters((f) => ({ ...f, categories: v }))}
								/>
								<FilterSelect
									label="CEFR"
									options={comparison.filters.cefrLevels}
									value={filters.cefrLevels}
									onChange={(v) => setFilters((f) => ({ ...f, cefrLevels: v }))}
								/>
								<FilterSelect
									label="Tipe tugas"
									options={comparison.filters.shapes}
									value={filters.shapes}
									onChange={(v) => setFilters((f) => ({ ...f, shapes: v }))}
								/>
								<FilterSelect
									label="Model"
									options={comparison.filters.models}
									value={filters.models}
									onChange={(v) => setFilters((f) => ({ ...f, models: v }))}
								/>
								{(filters.categories.length > 0 ||
									filters.cefrLevels.length > 0 ||
									filters.shapes.length > 0 ||
									filters.models.length > 0) && (
									<button
										type="button"
										className="ld-text-btn"
										onClick={() =>
											setFilters({ categories: [], cefrLevels: [], assignmentIds: [], shapes: [], models: [] })
										}
									>
										Reset filter
									</button>
								)}
							</div>

							<div className="ra-section-label">
								<BarChart3 size={13} /> Hasil utama
							</div>
							<div className="pa-comparison">
								<ModeColumn title="Umpan balik generik" stats={comparison.generic} accent="generic" />
								<ModeColumn
									title="Umpan balik personalisasi"
									stats={comparison.personalized}
									accent="personalized"
								/>
							</div>
							<p className="ra-note">
								Metrik berikut menggambarkan hasil yang dikaitkan dengan masing-masing mode
								umpan balik — bukan klaim bahwa personalisasi menyebabkan perbaikan. Desain
								riset (mode dipilih dosen per tugas, bukan acak) tidak mendukung inferensi
								kausal.
							</p>

							<div className="ra-section-label">
								<BarChart3 size={13} /> Rincian per kelompok
							</div>
							<ComparisonBreakdownTable title="Kategori linguistik" rows={comparison.breakdowns.byCategory} />
							<ComparisonBreakdownTable title="Tingkat CEFR" rows={comparison.breakdowns.byCefr} />
							<ComparisonBreakdownTable title="Tugas" rows={comparison.breakdowns.byAssignment} />
							<ComparisonBreakdownTable title="Tipe tugas" rows={comparison.breakdowns.byShape} />
							<ComparisonBreakdownTable title="Model AI" rows={comparison.breakdowns.byModel} />
						</>
					) : (
						<div className="ra-panel">
							<div className="ra-panel-head">
								<h3>Perbandingan personalisasi</h3>
							</div>
							<p className="ra-note">
								Belum ada interaksi Cek jawaban dengan mode personalisasi. Aktifkan mode
								personalisasi pada tugas untuk mulai mengumpulkan data perbandingan.
							</p>
						</div>
					)}

					<div className="ra-section-label">
						<Repeat size={13} /> Rekurensi &amp; perbaikan kategori dari waktu ke waktu
					</div>
					{hasTrajectories ? (
						<>
							<p className="ra-note">
								Trajektori dibangun dari temuan AI tervalidasi (deteksi dikonfirmasi ahli atau
								kesalahan referensi ahli) pada tugas formal. Rekurensi = peserta yang muncul
								kembali pada kategori yang sama di periode sebelumnya. Tingkat perbaikan
								menggunakan anotasi uptake manusia saja dan ditampilkan bila anotasi memadai.
							</p>
							<div className="pa-traj-grid">
								{trajectories.trajectories.map((t) => (
									<TrajectoryCard key={t.category} traj={t} />
								))}
							</div>
						</>
					) : (
						<div className="ra-panel">
							<div className="ra-panel-head">
								<h3>
									<AlertTriangle size={15} /> Belum ada temuan tervalidasi
								</h3>
							</div>
							<p className="ra-note">
								Trajektori kategori muncul setelah Anda memberi anotasi riset (konfirmasi
								deteksi atau kesalahan referensi ahli) pada temuan AI tugas formal Anda.
							</p>
						</div>
					)}
				</>
			)}
		</div>
	);
}
