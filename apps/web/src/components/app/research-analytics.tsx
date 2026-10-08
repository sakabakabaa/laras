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

function DetectionCard({ stats }: { stats: SliceStats }) {
	const d = stats.detection;
	return (
		<div className="ra-panel">
			<div className="ra-panel-head">
				<h3>Deteksi kesalahan</h3>
				<span className="asg-tag">TP / FP / FN</span>
			</div>
			<div className="ra-confusion">
				<div className="ra-conf-cell">
					<span>TP</span>
					<strong>{d.tp}</strong>
					<small>AI menemukan kesalahan nyata</small>
				</div>
				<div className="ra-conf-cell">
					<span>FP</span>
					<strong>{d.fp}</strong>
					<small>AI menandai bukan kesalahan</small>
				</div>
				<div className="ra-conf-cell">
					<span>FN</span>
					<strong>{d.fn}</strong>
					<small>Kesalahan terlewat AI (anotasi ahli)</small>
				</div>
			</div>
			<div className="ra-metric-grid">
				<MetricCard icon={<BarChart3 size={15} />} label="Presisi" value={pct(d.precision)} hint="TP / (TP + FP)" />
				<MetricCard icon={<BarChart3 size={15} />} label="Recall" value={pct(d.recall)} hint="TP / (TP + FN)" />
				<MetricCard icon={<BarChart3 size={15} />} label="F1" value={d.f1 == null ? INSUFFICIENT : String(d.f1)} hint="harmonik P & R" />
			</div>
			{!d.sufficient && <p className="ra-note">{INSUFFICIENT} — anotasi deteksi kurang dari minimum.</p>}
		</div>
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

function RateCard({
	title,
	icon,
	rate,
	hint,
}: {
	title: string;
	icon: React.ReactNode;
	rate: { count: number; total: number; rate: number | null; sufficient: boolean };
	hint: string;
}) {
	return (
		<div className="ra-panel">
			<div className="ra-panel-head">
				<h3>{title}</h3>
				<span className="asg-tag">{rate.total} dinilai</span>
			</div>
			<MetricCard icon={icon} label="Tingkat" value={rate.sufficient ? `${rate.rate}%` : INSUFFICIENT} hint={hint} />
			<div className="ra-acc-row">
				<span>Memenuhi</span>
				<strong>{rate.count}</strong>
				<span>Total dinilai</span>
				<strong>{rate.total}</strong>
			</div>
			{!rate.sufficient && <p className="ra-note">{INSUFFICIENT} — anotasi kurang dari minimum.</p>}
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
					Metrik kesepakatan berbasis anotasi ahli atas data tervalidasi <code>ai_feedback_items</code>.
					Dihitung dari penilaian riset eksplisit (bukan korelasi) — presisi, recall, F1, akurasi
					koreksi/penjelasan, kelengkapan, keperluan, kesesuaian pedagogis, serta false positive/negative.
				</p>
				<p className="research-export-private">
					<ShieldCheck size={14} /> Khusus dosen pemilik atau peneliti yang diotorisasi. Tidak tersedia
					for mahasiswa. Metrik hanya ditampilkan bila anotasi memadai; jika tidak, ditampilkan
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
				<button type="button" className="ld-pill primary" onClick={onExport}>
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

						<div className="ra-section-label">
							<AlertTriangle size={13} /> Metrik berikut membedakan: observasi AI, referensi ahli,
							dan penilaian riset. Persentase ditampilkan hanya bila anotasi memadai.
						</div>

						<DetectionCard stats={stats} />
						<AccuracyCard title="Akurasi koreksi AI" stats={stats} kind="correction" />
						<AccuracyCard title="Akurasi penjelasan AI" stats={stats} kind="explanation" />
						<RateCard
							title="Tingkat kelengkapan"
							icon={<ClipboardCheck size={15} />}
							rate={stats.completeness}
							hint="temuan lengkap / dinilai"
						/>
						<RateCard
							title="Tingkat keperluan"
							icon={<ClipboardCheck size={15} />}
							rate={stats.necessity}
							hint="perlu ditandai / dinilai"
						/>
						<RateCard
							title="Kesesuaian pedagogis"
							icon={<ClipboardCheck size={15} />}
							rate={stats.pedagogical}
							hint="tepat secara pedagogis / dinilai"
						/>
						<div className="ra-metric-grid">
							<MetricCard
								icon={<AlertTriangle size={15} />}
								label="False positive"
								value={stats.falsePositive.sufficient ? `${stats.falsePositive.rate}%` : INSUFFICIENT}
								hint={`${stats.falsePositive.count} dari ${stats.falsePositive.total} item AI`}
							/>
							<MetricCard
								icon={<AlertTriangle size={15} />}
								label="False negative"
								value={stats.falseNegative.sufficient ? `${stats.falseNegative.rate}%` : INSUFFICIENT}
								hint={`${stats.falseNegative.count} dari ${stats.falseNegative.total} kesalahan nyata`}
							/>
						</div>

						<div className="ra-section-label">
							<BarChart3 size={13} /> Rincian per kelompok
						</div>
						<BreakdownTable title="Kategori linguistik" rows={data!.breakdowns.byCategory} />
						<BreakdownTable title="Subkategori linguistik" rows={data!.breakdowns.bySubcategory} />
						<BreakdownTable title="Tingkat CEFR" rows={data!.breakdowns.byCefr} />
						<BreakdownTable title="Tugas" rows={data!.breakdowns.byAssignment} />
						<BreakdownTable title="Model AI" rows={data!.breakdowns.byModel} />
						<BreakdownTable title="Versi prompt" rows={data!.breakdowns.byPromptVersion} />

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
			<div className="ra-metric-grid">
				<MetricCard
					icon={<ShieldCheck size={15} />}
					label="Uptake berhasil"
					value={pct(data.successfulUptakeRate)}
					hint="revisi berhasil diadopsi / dianotasi"
				/>
				<MetricCard
					icon={<ShieldCheck size={15} />}
					label="Uptake sebagian"
					value={pct(data.partialUptakeRate)}
					hint="sebagian diadopsi / dianotasi"
				/>
				<MetricCard
					icon={<AlertTriangle size={15} />}
					label="Uptake tidak berhasil"
					value={pct(data.unsuccessfulUptakeRate)}
					hint="ditanggapi tapi keliru / dianotasi"
				/>
				<MetricCard
					icon={<AlertTriangle size={15} />}
					label="Tidak diadopsi"
					value={pct(data.noUptakeRate)}
					hint="tidak ditindaklanjuti / dianotasi"
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
