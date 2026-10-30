import { useEffect, useMemo, useState } from 'react';
import { Lightbulb, LoaderCircle } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { useAuth } from '@/hooks/use-auth';
import type { Assignment } from '@/lib/assignments';
import type { Course } from '@/lib/learning';

type RecStatus = 'draft' | 'accepted' | 'dismissed' | 'acted_on';

const STATUS_LABEL: Record<RecStatus, string> = {
	draft: 'Draf',
	accepted: 'Diterima',
	dismissed: 'Ditolak',
	acted_on: 'Sudah ditindak',
};

const NEXT_ACTIONS: Record<RecStatus, { status: RecStatus; label: string }[]> = {
	draft: [
		{ status: 'accepted', label: 'Terima' },
		{ status: 'dismissed', label: 'Tolak' },
	],
	accepted: [
		{ status: 'acted_on', label: 'Tandai sudah ditindak' },
		{ status: 'dismissed', label: 'Tolak' },
	],
	dismissed: [{ status: 'draft', label: 'Buka kembali' }],
	acted_on: [],
};

type Citation = {
	fileId?: string;
	file?: string;
	title?: string;
	version?: number;
	sectionId?: string;
	section?: string;
	pageRef?: string;
	extractedAt?: string;
};

type AuditEntry = { status?: string; reviewerId?: string; at?: string; note?: string };

type RecommendationRecord = {
	id: string;
	scope?: { course?: string; assignment?: string } | null;
	bundleId?: string;
	evidence?: {
		bundleId?: string;
		retrievedAt?: string;
		citations?: Citation[] | null;
		signals?: {
			total?: number;
			participants?: number;
			areas?: { label: string; checks: number; people: number }[] | null;
			fullQuota?: number;
		} | null;
	} | null;
	observed: string;
	interpretation: string;
	action: string;
	signal?: string;
	status: RecStatus;
	note?: string;
	audit?: AuditEntry[] | null;
	created: string;
	updated: string;
};

type GenerateResponse = {
	ok?: boolean;
	result?: 'sufficient' | 'insufficient';
	reason?: string;
	recommendations?: RecommendationRecord[];
	bundle?: { bundleId?: string; sectionCount?: number };
};

const fmt = (value?: string) => {
	if (!value) return '';
	try {
		return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
	} catch {
		return value;
	}
};

/**
 * Phase 6 — lecturer review of evidence-based recommendation drafts, inside
 * the existing Wawasan kesulitan page. Drafts are generated only from
 * lecturer-approved document sections (Phase 5) and the lecturer's own
 * aggregate formative signals; each card separates observed evidence,
 * interpretation, and suggested action, and shows its exact citations and
 * status trail. All controls are lecturer-only: accept, dismiss, reopen,
 * mark as acted on, and a private review note. Nothing is auto-applied —
 * every change is a lecturer decision recorded in the audit trail.
 */
export function LecturerRecommendations({
	assignments,
	courses,
}: {
	assignments: Assignment[];
	courses: Course[];
}) {
	const { user } = useAuth();
	const me = user?.id || '';
	const [scopeKey, setScopeKey] = useState('');
	const [records, setRecords] = useState<RecommendationRecord[] | null>(null);
	const [loadError, setLoadError] = useState('');
	const [generating, setGenerating] = useState(false);
	const [message, setMessage] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(
		null,
	);
	const [busyId, setBusyId] = useState('');
	const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

	useEffect(() => {
		if (scopeKey) return;
		if (assignments.length) setScopeKey(`assignment:${assignments[0].id}`);
		else if (courses.length) setScopeKey(`course:${courses[0].id}`);
	}, [scopeKey, assignments, courses]);

	useEffect(() => {
		if (!me) return;
		let alive = true;
		setLoadError('');
		void (async () => {
			try {
				const rows = await pb
					.collection('lecturer_recommendations')
					.getFullList<RecommendationRecord>({ sort: '-created' });
				if (alive) setRecords(rows);
			} catch {
				if (alive) {
					setRecords([]);
					setLoadError('Rekomendasi gagal dimuat. Muat ulang halaman.');
				}
			}
		})();
		return () => {
			alive = false;
		};
	}, [me]);

	const scoped = useMemo(() => {
		if (!records || !scopeKey) return [];
		const separator = scopeKey.indexOf(':');
		const kind = scopeKey.slice(0, separator);
		const id = scopeKey.slice(separator + 1);
		return records.filter((r) => {
			const s = r.scope || {};
			if (kind === 'assignment') return s.assignment === id;
			return s.course === id;
		});
	}, [records, scopeKey]);

	const generate = async () => {
		if (!scopeKey || generating) return;
		setGenerating(true);
		setMessage(null);
		try {
			const separator = scopeKey.indexOf(':');
			const kind = scopeKey.slice(0, separator);
			const id = scopeKey.slice(separator + 1);
			const response = await fetch('/api/recommendations/generate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify(kind === 'assignment' ? { assignmentId: id } : { courseId: id }),
			});
			const payload = (await response.json().catch(() => null)) as GenerateResponse | null;
			if (!response.ok || !payload?.ok) {
				setMessage({
					kind: 'error',
					text: payload?.reason || 'Rekomendasi gagal disusun. Coba lagi.',
				});
				return;
			}
			if (payload.result === 'insufficient') {
				setMessage({ kind: 'warn', text: payload.reason || 'Bukti belum cukup.' });
				return;
			}
			const fresh = payload.recommendations || [];
			setRecords((prev) => [...fresh, ...(prev || [])]);
			setMessage({
				kind: 'ok',
				text: `${fresh.length} draf rekomendasi disusun dari ${payload.bundle?.sectionCount || 0} bagian konteks yang disetujui. Semua berupa draf — tinjau sebelum ditindak; tidak ada yang berubah otomatis.`,
			});
		} catch {
			setMessage({ kind: 'error', text: 'Rekomendasi gagal disusun. Coba lagi.' });
		} finally {
			setGenerating(false);
		}
	};

	const review = async (record: RecommendationRecord, patch: { status?: RecStatus; note?: string }) => {
		if (busyId) return;
		setBusyId(record.id);
		try {
			const response = await fetch('/api/recommendations/review', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({ id: record.id, ...patch }),
			});
			const payload = (await response.json().catch(() => null)) as
				| { ok?: boolean; record?: RecommendationRecord; reason?: string }
				| null;
			if (!response.ok || !payload?.ok || !payload.record) {
				setMessage({
					kind: 'error',
					text: payload?.reason || 'Perubahan gagal disimpan.',
				});
				return;
			}
			const updated = payload.record;
			setRecords((prev) => (prev || []).map((r) => (r.id === updated.id ? updated : r)));
			setMessage(null);
		} catch {
			setMessage({ kind: 'error', text: 'Perubahan gagal disimpan. Coba lagi.' });
		} finally {
			setBusyId('');
		}
	};

	const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

	return (
		<section className="asg-submissions-panel" aria-label="Rekomendasi tindakan">
			<div className="asg-submissions-head">
				<h3>
					<Lightbulb size={16} /> Rekomendasi tindakan
				</h3>
				<span className="asg-tag">Draf tinjauan dosen — bukan perubahan otomatis</span>
			</div>
			<p className="rps-help">
				Draf rekomendasi disusun hanya dari bagian dokumen yang Anda setujui sebagai konteks AI
				(Manajemen berkas) dan sinyal kesulitan formatif tercatat pada lingkup yang dipilih.
				Setiap draf memisahkan bukti teramati, interpretasi, dan tindakan yang disarankan, lengkap
				dengan sumber persisnya. Semua keputusan ada di tangan Anda — tidak ada yang diedit,
				dipublikasikan, dinilai, atau dikirim otomatis.
			</p>

			<div className="rec-scope-row">
				<label className="rec-select">
					Lingkup
					<select value={scopeKey} onChange={(e) => setScopeKey(e.target.value)}>
						<optgroup label="Mata kuliah">
							{courses.map((c) => (
								<option key={c.id} value={`course:${c.id}`}>
									{c.title}
								</option>
							))}
						</optgroup>
						<optgroup label="Tugas">
							{assignments.map((a) => (
								<option key={a.id} value={`assignment:${a.id}`}>
									{a.title}
									{courseById.get(a.course) ? ` — ${courseById.get(a.course)!.title}` : ''}
								</option>
							))}
						</optgroup>
					</select>
				</label>
				<button
					type="button"
					className="rec-generate"
					onClick={() => void generate()}
					disabled={!scopeKey || generating || !me}
				>
					{generating ? (
						<>
							<LoaderCircle size={14} className="spin" /> Menyusun draf…
						</>
					) : (
						'Susun draf rekomendasi'
					)}
				</button>
			</div>

			{message && <p className={`rec-message ${message.kind}`}>{message.text}</p>}
			{loadError && <p className="rec-message error">{loadError}</p>}

			{records === null ? (
				<div className="ld-loading">
					<LoaderCircle size={18} className="spin" /> Memuat rekomendasi…
				</div>
			) : scoped.length === 0 ? (
				<p className="rec-empty">
					Belum ada rekomendasi pada lingkup ini. Susun draf dari materi yang disetujui dan sinyal
					kesulitan yang tercatat — jika bukti belum cukup, akan dikatakan secara eksplisit.
				</p>
			) : (
				<ul className="rec-list">
					{scoped.map((r) => (
						<li key={r.id}>
							<article className="rec-card">
								<div className="rec-card-head">
									<span className={`rec-status status-${r.status}`}>
										{STATUS_LABEL[r.status] || r.status}
									</span>
									{r.signal ? <span className="rec-signal">Sinyal: {r.signal}</span> : null}
									<time className="rec-time">{fmt(r.created)}</time>
								</div>

								<div className="rec-blocks">
									<div className="rec-block">
										<strong>Bukti teramati</strong>
										<p>{r.observed}</p>
									</div>
									<div className="rec-block">
										<strong>Interpretasi</strong>
										<p>{r.interpretation}</p>
									</div>
									<div className="rec-block">
										<strong>Tindakan yang disarankan</strong>
										<p>{r.action}</p>
									</div>
								</div>

								<details className="rec-evidence">
									<summary>Bukti sumber &amp; sinyal</summary>
									<ul>
										{(r.evidence?.citations || []).map((c, i) => (
											<li key={`${c.sectionId || i}-${i}`}>
												{`"${c.title || 'Berkas'}" — bagian "${c.section || '—'}"${c.pageRef ? ` (hal. ${c.pageRef})` : ''} · versi ${c.version || 1} · berkas ${c.file || '—'}`}
											</li>
										))}
									</ul>
									<p className="rec-bundle">
										{`Bundel konteks ${r.evidence?.bundleId || r.bundleId || '—'} · diambil ${fmt(r.evidence?.retrievedAt) || '—'}${
											r.evidence?.signals?.total
												? ` · ${r.evidence.signals.total} pemeriksaan dari ${r.evidence.signals.participants || 0} peserta`
												: ''
										}${
											r.evidence?.signals?.fullQuota
												? ` · ${r.evidence.signals.fullQuota} peserta memakai seluruh kuota`
												: ''
										}`}
									</p>
								</details>

								<label className="rec-note-field">
									Catatan dosen
									<textarea
										rows={2}
										value={noteDrafts[r.id] ?? r.note ?? ''}
										placeholder="Catatan pribadi untuk rekomendasi ini (opsional)"
										onChange={(e) =>
											setNoteDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))
										}
									/>
								</label>

								<div className="rec-actions">
									{NEXT_ACTIONS[r.status]?.map((next) => (
										<button
											key={next.status}
											type="button"
											className={next.status === 'accepted' ? 'primary' : ''}
											disabled={busyId === r.id}
											onClick={() => void review(r, { status: next.status })}
										>
											{next.label}
										</button>
									))}
									<button
										type="button"
										disabled={busyId === r.id}
										onClick={() =>
											void review(r, { note: noteDrafts[r.id] ?? r.note ?? '' })
										}
									>
										Simpan catatan
									</button>
								</div>

								<details className="rec-audit">
									<summary>Jejak status</summary>
									<ul>
										{(r.audit || []).map((entry, i) => (
											<li key={`${entry.at || i}-${i}`}>
												{`${
													STATUS_LABEL[(entry.status || 'draft') as RecStatus] || entry.status
												} — ${fmt(entry.at) || '—'} · ${
													entry.reviewerId ? 'ditinjau dosen' : 'dibuat otomatis'
												}${entry.note ? ` · ${entry.note}` : ''}`}
											</li>
										))}
									</ul>
								</details>
							</article>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
