/**
 * Phase 7 — lecturer/researcher-only research analytics dashboard.
 *
 * Renders agreement-based metrics computed solely from validated
 * `ai_feedback_items` research records. The dashboard clearly separates:
 *  - AI-generated observations (origin = 'ai')
 *  - human reference annotations (origin = 'human' — missed errors)
 *  - research judgments (the expert verdict fields driving every metric)
 *
 * Percentages are suppressed ("Belum cukup data teranotasi") when the
 * annotated sample for a metric is below MIN_ANNOTATED. Students never reach
 * this view (the route's clientLoader redirects them and the server re-checks).
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
	AlertTriangle,
	BarChart3,
	Brain,
	ClipboardCheck,
	Download,
	FlaskConical,
	LoaderCircle,
	Repeat,
	ShieldCheck,
	UserCheck,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { useAuth } from '@/hooks/use-auth';
import { errorMessage } from '@/lib/learning';
import type { BreakdownRow, ResearchAnalytics, SliceStats } from '@/lib/research-analytics';
import type { UptakeAnalytics } from '@/lib/feedback-uptake';

const INSUFFICIENT = 'Belum cukup data teranotasi';

function pct(value: number | null): string {
	return value == null ? INSUFFICIENT : `${value}%`;
}

/** Renders a rate, suppressing the percentage when the sample is too small. */
function RateCell({ rate }: { rate: { count: number; total: number; rate: number | null; sufficient: boolean } }) {
	return (
		<span className={rate.sufficient ? '' : 'ra-insufficient'}>
			{rate.sufficient ? `${rate.rate}%` : INSUFFICIENT}
			<span className="ra-count">
				{' '}({rate.count}/{rate.total})
			</span>
		</span>
	);
}

function MetricCard({
	icon,
	label,
	value,
	hint,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
	hint?: string;
}) {
	return (
		<div className="ra-metric">
			<div className="ra-metric-head">
				<span className="ra-metric-ico">{icon}</span>
				<span className="ra-metric-label">{label}</span>
			</div>
			<strong className={value === INSUFFICIENT ? 'ra-insufficient' : ''}>{value}</strong>
			{hint && <small>{hint}</small>}
		</div>
	);
}

/** A single hero metric: large tabular number, optional unit, optional 0–100 bar. */
function Kpi({
	label,
	value,
	unit,
	hint,
	sufficient = true,
	bar,
}: {
	label: string;
	value: number | null;
	unit?: string;
	hint: string;
	sufficient?: boolean;
	bar?: boolean;
}) {
	const show = sufficient && value != null;
	return (
		<div className="ra-kpi">
			<span className="ra-kpi-label">{label}</span>
			<strong className={show ? 'ra-kpi-value' : 'ra-kpi-value ra-insufficient'}>
				{show ? (
					<>
						{value}
						{unit && <i>{unit}</i>}
					</>
				) : (
					INSUFFICIENT
				)}
			</strong>
			{bar && (
				<span className="ra-kpi-track">
					<span className="ra-kpi-fill" style={{ width: `${show ? value : 0}%` }} />
				</span>
			)}
			<small>{hint}</small>
		</div>
	);
}

/** Proportional TP / FP / FN bar. Meaning is carried by position, color, and a count label. */
function ConfusionBar({ d }: { d: SliceStats['detection'] }) {
	const total = d.tp + d.fp + d.fn || 1;
	const seg = (n: number) => `${(n / total) * 100}%`;
	return (
		<div className="ra-confbar">
			<div className="ra-confbar-track" role="img" aria-label={`True positive ${d.tp}, false positive ${d.fp}, false negative ${d.fn}`}>
				<span className="ra-confbar-seg tp" style={{ width: seg(d.tp) }} />
				<span className="ra-confbar-seg fp" style={{ width: seg(d.fp) }} />
				<span className="ra-confbar-seg fn" style={{ width: seg(d.fn) }} />
			</div>
			<div className="ra-confbar-legend">
				<span>
					<i className="tp" /> TP {d.tp} · AI menemukan kesalahan nyata
				</span>
				<span>
					<i className="fp" /> FP {d.fp} · AI menandai bukan kesalahan
				</span>
				<span>
					<i className="fn" /> FN {d.fn} · kesalahan terlewat AI (anotasi ahli)
				</span>
			</div>
		</div>
	);
}

function DetectionHero({ stats }: { stats: SliceStats }) {
	const d = stats.detection;
	return (
		<section className="ra-hero">
			<div className="ra-panel-head">
				<h3>
					<BarChart3 size={15} /> Kesepakatan deteksi kesalahan
				</h3>
				<span className="asg-tag">TP / FP / FN</span>
			</div>
			<div className="ra-hero-kpis">
				<Kpi label="Presisi" value={d.precision} unit="%" hint="TP / (TP + FP)" sufficient={d.sufficient} bar />
				<Kpi label="Recall" value={d.recall} unit="%" hint="TP / (TP + FN)" sufficient={d.sufficient} bar />
				<Kpi label="F1" value={d.f1} hint="harmonik presisi & recall" sufficient={d.sufficient} />
			</div>
			<ConfusionBar d={d} />
			{!d.sufficient && <p className="ra-note">{INSUFFICIENT} — anotasi deteksi kurang dari minimum.</p>}
		</section>
	);
}

function AccuracyCard({
	title,
	stats,
	kind,
}: {
	title: string;
	stats: SliceStats;
	kind: 'correction' | 'explanation';
}) {
	const a = stats[kind];
	return (
		<div className="ra-panel">
			<div className="ra-panel-head">
				<h3>{title}</h3>
				<span className="asg-tag">{a.judged} dinilai</span>
			</div>
			<div className="ra-acc-row">
				<span>Tepat</span>
				<strong>{a.correct}</strong>
				<span>Sebagian</span>
				<strong>{a.partiallyCorrect}</strong>
				<span>Keliru</span>
				<strong>{a.incorrect}</strong>
			</div>
			<MetricCard
				icon={<ClipboardCheck size={15} />}
				label="Akurasi"
				value={a.accuracy == null ? INSUFFICIENT : `${a.accuracy}%`}
				hint="(tepat + ½ sebagian) / dinilai"
			/>
			{!a.sufficient && <p className="ra-note">{INSUFFICIENT} — anotasi kurang dari minimum.</p>}
		</div>
	);
}

/** A scannable 0–100 rate as a labeled bar; suppresses the fill when the sample is too small. */
function StatBar({
	label,
	rate,
	hint,
	tone,
}: {
	label: string;
	rate: { count?: number; total?: number; rate: number | null; sufficient: boolean };
	hint: string;
	tone?: 'warn';
}) {
	const show = rate.sufficient && rate.rate != null;
	return (
		<div className={`ra-bar${tone ? ` ${tone}` : ''}`}>
			<div className="ra-bar-top">
				<span className="ra-bar-label">{label}</span>
				<span className={show ? 'ra-bar-value' : 'ra-bar-value ra-insufficient'}>
					{show ? `${rate.rate}%` : INSUFFICIENT}
				</span>
			</div>
			<span className="ra-bar-track">
				<span className="ra-bar-fill" style={{ width: `${show ? rate.rate : 0}%` }} />
			</span>
			<div className="ra-bar-foot">
				<span>{hint}</span>
				{rate.total != null && (
					<span className="ra-count">
						{rate.count}/{rate.total}
					</span>
				)}
			</div>
		</div>
	);
}

function BreakdownTable({ title, rows }: { title: string; rows: BreakdownRow[] }) {
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
							<th>Item AI</th>
							<th>Ref. ahli</th>
							<th>Presisi</th>
							<th>Recall</th>
							<th>F1</th>
							<th>FP</th>
							<th>FN</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => {
							const d = row.stats.detection;
							return (
								<tr key={row.key}>
									<td>{row.label}</td>
									<td>{row.stats.aiItems}</td>
									<td>{row.stats.humanItems}</td>
									<td className={d.sufficient ? '' : 'ra-insufficient'}>{pct(d.precision)}</td>
									<td className={d.sufficient ? '' : 'ra-insufficient'}>{pct(d.recall)}</td>
									<td className={d.sufficient ? '' : 'ra-insufficient'}>
										{d.f1 == null ? (d.sufficient ? '—' : INSUFFICIENT) : String(d.f1)}
									</td>
									<td>{d.fp}</td>
									<td>{d.fn}</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}

export function ResearchAnalyticsView({ onExport }: { onExport: () => void }) {
	const { user } = useAuth();
	const [data, setData] = useState<ResearchAnalytics | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [assignmentId, setAssignmentId] = useState('');

	const load = useCallback(async () => {
		setLoading(true);
		setError('');
		try {
			const res = await fetch('/api/research-analytics', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({ assignmentId: assignmentId || undefined }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
				throw new Error(body.error || body.message || 'Gagal memuat analitik riset.');
			}
			setData((await res.json()) as ResearchAnalytics);
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

	const stats = data?.overall;
	const hasData = !!data && (data.counts.aiFeedbackItems > 0 || data.counts.humanReferenceItems > 0);

	return (
		<div className="research-analytics">
			<div className="research-export-head">
				<span className="research-export-badge">
					<FlaskConical size={14} /> Riset
				</span>
				<h1>Analitik umpan balik AI</h1>
				<p>
					Metrik kesepakatan berbasis anotasi ahli atas data umpan balik AI yang tervalidasi.
					Dihitung dari penilaian riset eksplisit (bukan korelasi) — presisi, recall, F1, akurasi
					koreksi/penjelasan, kelengkapan, keperluan, kesesuaian pedagogis, serta false positive/negative.
				</p>
				<p className="research-export-private">
					<ShieldCheck size={14} /> Khusus dosen pemilik atau peneliti yang diotorisasi. Tidak tersedia
					untuk mahasiswa. Metrik hanya ditampilkan bila anotasi memadai; jika tidak, ditampilkan
					“{INSUFFICIENT}”.
				</p>
			</div>

			<div className="ra-toolbar">
				<label className="research-export-field">
					<span>Cakupan tugas</span>
					<select value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>
						<option value="">Semua tugas formal saya</option>
						{data?.scope.allAssignments.map((a) => (
							<option key={a.id} value={a.id}>
								{a.title}
							</option>
						))}
					</select>
				</label>
				<button
					type="button"
					className="ld-pill primary"
					onClick={onExport}
					disabled={loading || !hasData}
					title={hasData ? undefined : 'Belum ada data riset untuk diekspor'}
				>
					<Download size={16} /> Ekspor data riset
				</button>
			</div>

			{loading ? (
				<div className="ld-loading">
					<LoaderCircle size={18} className="spin" /> Memuat analitik riset…
				</div>
			) : error ? (
				<div className="ld-alert" role="alert">
					{error}
					<button type="button" onClick={() => void load()}>
						Coba lagi
					</button>
				</div>
			) : !hasData ? (
				<div className="research-export-empty">
					<FlaskConical size={28} />
					<h3>Belum ada data teranotasi</h3>
					<p>
						Analitik riset muncul setelah Anda membuat anotasi riset (penilaian deteksi, koreksi,
						penjelasan, kesalahan terlewat) pada temuan AI tugas formal Anda.
					</p>
					<Link to="/app/tugas" className="ld-pill primary ra-empty-cta">
						<ClipboardCheck size={16} /> Buka tugas formal
					</Link>
				</div>
			) : (
				stats && (
					<>
						<div className="ra-counts">
							<div className="ra-count-card ai">
								<Brain size={18} />
								<strong>{data!.counts.aiFeedbackItems}</strong>
								<span>Item umpan balik AI</span>
							</div>
							<div className="ra-count-card human">
								<UserCheck size={18} />
								<strong>{data!.counts.humanReferenceItems}</strong>
								<span>Item referensi/kesalahan terlewat ahli</span>
							</div>
							<div className="ra-count-card sub">
								<ClipboardCheck size={18} />
								<strong>{data!.counts.submissionsAnalysed}</strong>
								<span>Submisi dianalisis</span>
							</div>
						</div>

						<div className="ra-two">
							<DetectionHero stats={stats} />

							<section className="ra-panel ra-rates">
								<div className="ra-panel-head">
									<h3>
										<BarChart3 size={15} /> Kualitas umpan balik
									</h3>
								</div>
								<div className="ra-bars">
									<StatBar label="Kelengkapan" rate={stats.completeness} hint="temuan lengkap / dinilai" />
									<StatBar label="Keperluan" rate={stats.necessity} hint="perlu ditandai / dinilai" />
									<StatBar label="Kesesuaian pedagogis" rate={stats.pedagogical} hint="tepat secara pedagogis / dinilai" />
									<StatBar label="False positive" rate={stats.falsePositive} hint="salah ditandai / item AI" tone="warn" />
									<StatBar label="False negative" rate={stats.falseNegative} hint="terlewat / kesalahan nyata" tone="warn" />
								</div>
								<p className="ra-note">
									Observasi AI, referensi ahli, dan penilaian riset dibedakan. Persentase hanya tampil bila
									anotasi memadai. Untuk false positive/negative, nilai lebih rendah lebih baik.
								</p>
							</section>
						</div>

						<section className="ra-sec">
							<h3 className="ra-sec-h">
								<ClipboardCheck size={15} /> Akurasi konten AI
							</h3>
							<div className="ra-grid-2">
								<AccuracyCard title="Koreksi AI" stats={stats} kind="correction" />
								<AccuracyCard title="Penjelasan AI" stats={stats} kind="explanation" />
							</div>
						</section>

						<details className="ra-breakdowns">
							<summary className="ra-section-label">
								<BarChart3 size={13} /> Rincian per kelompok
								<span className="ra-breakdowns-hint">Ketuk untuk membuka</span>
							</summary>
							<div className="ra-breakdowns-body">
								<BreakdownTable title="Kategori linguistik" rows={data!.breakdowns.byCategory} />
								<BreakdownTable title="Subkategori linguistik" rows={data!.breakdowns.bySubcategory} />
								<BreakdownTable title="Tingkat CEFR" rows={data!.breakdowns.byCefr} />
								<BreakdownTable title="Tugas" rows={data!.breakdowns.byAssignment} />
								<BreakdownTable title="Model AI" rows={data!.breakdowns.byModel} />
								<BreakdownTable title="Versi prompt" rows={data!.breakdowns.byPromptVersion} />
							</div>
						</details>

						<UptakeAnalyticsSection assignmentId={assignmentId} />
					</>
				)
			)}
		</div>
	);
}

/**
 * Phase 9 — feedback-associated revision outcomes (uptake analytics).
 *
 * Loads uptake metrics from /api/feedback-uptake (action: analytics) and
 * renders them with non-causal language: "Feedback-associated revision
 * outcomes," never "AI caused improvement." Rates are suppressed when the
 * annotated sample is too small.
 */
function UptakeAnalyticsSection({ assignmentId }: { assignmentId: string }) {
	const [data, setData] = useState<UptakeAnalytics | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		let alive = true;
		setLoading(true);
		setError('');
		void (async () => {
			try {
				const res = await fetch('/api/feedback-uptake', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
					},
					body: JSON.stringify({ action: 'analytics', assignmentId: assignmentId || undefined }),
				});
				if (!res.ok) {
					const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
					throw new Error(body.error || body.message || 'Gagal memuat analitik uptake.');
				}
				if (alive) setData((await res.json()) as UptakeAnalytics);
			} catch (err) {
				if (alive) setError(errorMessage(err));
			} finally {
				if (alive) setLoading(false);
			}
		})();
		return () => {
			alive = false;
		};
	}, [assignmentId]);

	if (loading) {
		return (
			<div className="ld-loading">
				<LoaderCircle size={16} className="spin" /> Memuat analitik uptake…
			</div>
		);
	}
	if (error) {
		return (
			<div className="ra-panel">
				<div className="ra-panel-head">
					<h3>Feedback-associated revision outcomes</h3>
				</div>
				<p className="ra-note">{error}</p>
			</div>
		);
	}
	if (!data || data.totalFeedbackItems === 0) {
		return (
			<div className="ra-panel">
				<div className="ra-panel-head">
					<h3>
						<Repeat size={15} /> Feedback-associated revision outcomes
					</h3>
				</div>
				<div className="research-export-empty">
					<Repeat size={24} />
					<h3>Belum ada asosiasi uptake</h3>
					<p>
						Metrik uptake muncul setelah Anda mengaitkan umpan balik Cek jawaban dengan revisi
						mahasiswa dan memberi anotasi uptake di tab "Uptake & revisi".
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="ra-panel">
			<div className="ra-panel-head">
				<h3>
					<Repeat size={15} /> Feedback-associated revision outcomes
				</h3>
				<span className="asg-tag">{data.itemsWithUptakeAnnotation} dianotasi</span>
			</div>
			<p className="ra-note">
				Metrik berikut menggambarkan hasil revisi yang dikaitkan dengan umpan balik —
				bukan klaim kausalitas. Atribusi default "Tidak pasti"; penilaian uptake diisi
				manusia saja.
			</p>
			<div className="ra-counts">
				<div className="ra-count-card ai">
					<Repeat size={16} />
					<strong>{data.itemsWithRevisions}</strong>
					<span>Asosiasi umpan balik ↔ revisi</span>
				</div>
				<div className="ra-count-card human">
					<ClipboardCheck size={16} />
					<strong>{data.itemsWithUptakeAnnotation}</strong>
					<span>Diberi anotasi uptake</span>
				</div>
			</div>
			<div className="ra-bars">
				<StatBar
					label="Uptake berhasil"
					rate={{ rate: data.successfulUptakeRate, sufficient: data.successfulUptakeRate != null }}
					hint="revisi berhasil diadopsi / dianotasi"
				/>
				<StatBar
					label="Uptake sebagian"
					rate={{ rate: data.partialUptakeRate, sufficient: data.partialUptakeRate != null }}
					hint="sebagian diadopsi / dianotasi"
				/>
				<StatBar
					label="Uptake tidak berhasil"
					rate={{ rate: data.unsuccessfulUptakeRate, sufficient: data.unsuccessfulUptakeRate != null }}
					hint="ditanggapi tapi keliru / dianotasi"
					tone="warn"
				/>
				<StatBar
					label="Tidak diadopsi"
					rate={{ rate: data.noUptakeRate, sufficient: data.noUptakeRate != null }}
					hint="tidak ditindaklanjuti / dianotasi"
					tone="warn"
				/>
			</div>
			<div className="ra-section-label">
				<BarChart3 size={13} /> Efisiensi panduan (tingkat hint sebelum revisi)
			</div>
			<div className="ra-metric-grid">
				<MetricCard
					icon={<BarChart3 size={15} />}
					label="Rata-rata tingkat hint"
					value={data.averageHintLevel == null ? INSUFFICIENT : String(data.averageHintLevel)}
					hint="tingkat maksimum sebelum revisi"
				/>
				<MetricCard
					icon={<BarChart3 size={15} />}
					label="Selesai di Tingkat 1"
					value={pct(data.proportionLevel1)}
					hint="revisi setelah Level 1 saja"
				/>
				<MetricCard
					icon={<BarChart3 size={15} />}
					label="Butuh Level 2"
					value={pct(data.proportionLevel2)}
					hint="revisi setelah mencapai Level 2"
				/>
				<MetricCard
					icon={<BarChart3 size={15} />}
					label="Butuh Level 3"
					value={pct(data.proportionLevel3)}
					hint="revisi setelah mencapai Level 3"
				/>
				<MetricCard
					icon={<AlertTriangle size={15} />}
					label="Butuh koreksi eksplisit (L4)"
					value={pct(data.proportionExplicit)}
					hint="revisi setelah Level 4 eksplisit"
				/>
			</div>
			<p className="ra-note">
				Jangan menafsirkan lebih sedikit hint secara otomatis sebagai lebih baik — data mentah
				interaksi disimpan untuk analisis lebih lanjut.
			</p>
		</div>
	);
}
