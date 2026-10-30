/**
 * Phase 9 — lecturer/researcher-only feedback uptake review.
 *
 * Shows the research sequence for formative AI feedback:
 *   Feedback item → student interaction (hints) → revision → uptake judgment
 *
 * The lecturer selects a participant's check-attempt chain, links a feedback
 * event to a subsequent revision (attribution defaults to 'uncertain'), and
 * annotates uptake with a HUMAN-ONLY judgment, before/after error status,
 * and a reviewer note. Uptake judgments are never auto-assigned by AI.
 *
 * Students never reach this view (route guard + server-side role check).
 * Research judgments stay private to the lecturer/researcher.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	AlertTriangle,
	ArrowRight,
	CheckCircle2,
	ClipboardCheck,
	FlaskConical,
	LoaderCircle,
	ShieldCheck,
	X,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { useAuth } from '@/hooks/use-auth';
import { activityTypeOf, type Assignment } from '@/lib/assignments';
import { errorMessage } from '@/lib/learning';
import {
	AFTER_STATUS_OPTIONS,
	ATTRIBUTION_OPTIONS,
	ATTRIBUTION_LABEL,
	BEFORE_STATUS_OPTIONS,
	UPTAKE_JUDGMENT_OPTIONS,
	UPTAKE_JUDGMENT_LABEL,
	type AttributionStatus,
	type BeforeRevisionStatus,
	type AfterRevisionStatus,
	type UptakeJudgment,
} from '@/lib/feedback-uptake';

type AttemptSummary = {
	id: string;
	attempt: number;
	level: number | null;
	area: string;
	feedback: string;
	evidence: string;
	focus: string;
	requestedNextHint: boolean;
	revisionSubmitted: boolean;
	revisesAttempt: string;
	created: string;
	responseText: string;
	submission: string;
};

type ParticipantData = {
	identityKey: string;
	participantName: string;
	channel: string;
	attempts: AttemptSummary[];
};

type Association = {
	id: string;
	feedbackAttempt: string;
	revisionAttempt: string;
	attributionStatus: string;
	numberOfHints: number;
	identityKey: string;
	participantName: string;
};

type Annotation = {
	id: string;
	feedbackRevision: string;
	uptakeJudgment: string;
	beforeRevisionStatus: string;
	afterRevisionStatus: string;
	uptakeNote: string;
	uptakeReviewedAt: string;
};

const LEVEL_LABEL: Record<number, string> = {
	1: 'Tingkat 1 · Refleksi',
	2: 'Tingkat 2 · Konsep',
	3: 'Tingkat 3 · Terarah',
	4: 'Tingkat 4 · Koreksi eksplisit',
};

function shortTime(iso: string) {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function FeedbackUptakeReview() {
	const { user } = useAuth();
	const [assignments, setAssignments] = useState<Assignment[]>([]);
	const [assignmentId, setAssignmentId] = useState('');
	const [loadingAssignments, setLoadingAssignments] = useState(true);

	const [participants, setParticipants] = useState<ParticipantData[]>([]);
	const [associations, setAssociations] = useState<Association[]>([]);
	const [annotations, setAnnotations] = useState<Annotation[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	const [selectedParticipant, setSelectedParticipant] = useState<string>('');
	const [linkFeedback, setLinkFeedback] = useState('');
	const [linkRevision, setLinkRevision] = useState('');
	const [linkAttribution, setLinkAttribution] = useState<AttributionStatus>('uncertain');
	const [saving, setSaving] = useState(false);
	const [notice, setNotice] = useState('');

	useEffect(() => {
		let alive = true;
		void (async () => {
			try {
				const rows = await pb.collection('assignments').getFullList<Assignment>({
					filter: `owner="${user?.id ?? ''}"`,
					sort: '-updated',
				});
				if (!alive) return;
				// Include both formal and formative — formative Cek jawaban is the
				// primary research target for uptake.
				setAssignments(rows);
			} catch (err) {
				if (alive) setError(errorMessage(err));
			} finally {
				if (alive) setLoadingAssignments(false);
			}
		})();
		return () => {
			alive = false;
		};
	}, [user?.id]);

	const loadData = useCallback(async () => {
		if (!assignmentId) return;
		setLoading(true);
		setError('');
		setNotice('');
		try {
			const res = await fetch('/api/feedback-uptake', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({ action: 'list', assignmentId }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
				throw new Error(body.error || body.message || 'Gagal memuat data uptake.');
			}
			const data = (await res.json()) as {
				participants: ParticipantData[];
				associations: Association[];
				annotations: Annotation[];
			};
			setParticipants(data.participants);
			setAssociations(data.associations);
			setAnnotations(data.annotations);
			if (data.participants.length > 0 && !selectedParticipant) {
				setSelectedParticipant(data.participants[0].identityKey);
			}
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setLoading(false);
		}
	}, [assignmentId, selectedParticipant]);

	useEffect(() => {
		if (assignmentId) void loadData();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [assignmentId]);

	const activeParticipant = useMemo(
		() => participants.find((p) => p.identityKey === selectedParticipant) || null,
		[participants, selectedParticipant],
	);

	const annotationByRevision = useMemo(() => {
		const map = new Map<string, Annotation>();
		for (const a of annotations) map.set(a.feedbackRevision, a);
		return map;
	}, [annotations]);

	const attemptById = useMemo(() => {
		const map = new Map<string, AttemptSummary>();
		for (const p of participants) for (const a of p.attempts) map.set(a.id, a);
		return map;
	}, [participants]);

	const handleSaveAssociation = async () => {
		if (!assignmentId || !linkFeedback || !linkRevision) return;
		setSaving(true);
		setError('');
		setNotice('');
		try {
			const res = await fetch('/api/feedback-uptake', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({
					action: 'save-association',
					assignmentId,
					feedbackAttemptId: linkFeedback,
					revisionAttemptId: linkRevision,
					attributionStatus: linkAttribution,
				}),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
				throw new Error(body.error || body.message || 'Gagal menyimpan asosiasi.');
			}
			setNotice('Asosiasi tersimpan. Atribusi disetel ke "Tidak pasti" secara default.');
			setLinkFeedback('');
			setLinkRevision('');
			await loadData();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setSaving(false);
		}
	};

	const handleSaveUptake = async (
		feedbackRevisionId: string,
		fields: {
			uptakeJudgment: UptakeJudgment;
			beforeRevisionStatus: BeforeRevisionStatus | '';
			afterRevisionStatus: AfterRevisionStatus | '';
			uptakeNote: string;
		},
	) => {
		setSaving(true);
		setError('');
		setNotice('');
		try {
			const res = await fetch('/api/feedback-uptake', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({
					action: 'save-uptake',
					assignmentId,
					feedbackRevisionId,
					uptakeJudgment: fields.uptakeJudgment,
					beforeRevisionStatus: fields.beforeRevisionStatus || undefined,
					afterRevisionStatus: fields.afterRevisionStatus || undefined,
					uptakeNote: fields.uptakeNote || undefined,
				}),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
				throw new Error(body.error || body.message || 'Gagal menyimpan anotasi uptake.');
			}
			setNotice('Anotasi uptake tersimpan.');
			await loadData();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="research-export feedback-uptake">
			<div className="research-export-head">
				<span className="research-export-badge">
					<FlaskConical size={14} /> Riset
				</span>
				<h1>Uptake umpan balik & revisi</h1>
				<p>
					Tinjau urutan: <strong>item umpan balik AI</strong> → interaksi mahasiswa
					(tingkat panduan) → <strong>revisi</strong> → <strong>penilaian uptake</strong>.
					Atribusi revisi ke umpan balik disetel "Tidak pasti" secara default — sistem
					tidak mengasumsikan bahwa revisi disebabkan oleh umpan balik AI. Penilaian
					uptake diisi manusia saja; AI tidak pernah menetapkannya.
				</p>
				<p className="research-export-private">
					<ShieldCheck size={14} /> Khusus dosen pemilik atau peneliti yang diotorisasi.
					Hasil uptake bersifat "Feedback-associated revision outcomes" — bukan klaim
					kausalitas. Tidak tersedia untuk mahasiswa.
				</p>
			</div>

			<div className="research-export-form">
				<label className="research-export-field">
					<span>Tugas</span>
					<select
						value={assignmentId}
						onChange={(e) => {
							setAssignmentId(e.target.value);
							setSelectedParticipant('');
							setParticipants([]);
							setAssociations([]);
							setAnnotations([]);
						}}
					>
						<option value="">— pilih tugas —</option>
						{assignments.map((a) => (
							<option key={a.id} value={a.id}>
								{a.title || '(tanpa judul)'}
								{activityTypeOf(a) === 'formative' ? ' (latihan formatif)' : ''}
							</option>
						))}
					</select>
				</label>
			</div>

			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
			{notice && (
				<p className="eval-saved" role="status">
					<CheckCircle2 size={14} /> {notice}
				</p>
			)}

			{loading && (
				<div className="ld-loading">
					<LoaderCircle size={18} className="spin" /> Memuat data uptake…
				</div>
			)}

			{!loading && assignmentId && participants.length === 0 && (
				<div className="research-export-empty">
					<ClipboardCheck size={28} />
					<h3>Belum ada riwayat Cek jawaban</h3>
					<p>
						Data uptake muncul setelah mahasiswa memakai Cek jawaban pada tugas ini dan
						melakukan revisi.
					</p>
				</div>
			)}

			{!loading && participants.length > 0 && (
				<div className="uptake-layout">
					<aside className="uptake-sidebar">
						<h3>Peserta ({participants.length})</h3>
						<ul className="uptake-participant-list">
							{participants.map((p) => (
								<li key={p.identityKey}>
									<button
										type="button"
										className={selectedParticipant === p.identityKey ? 'active' : ''}
										onClick={() => setSelectedParticipant(p.identityKey)}
									>
										<span className="cw-student-avatar">
											{p.participantName.charAt(0).toUpperCase()}
										</span>
										<span>
											<strong>{p.participantName}</strong>
											<small>
												{p.channel === 'public' ? 'Publik' : 'Terdaftar'} · {p.attempts.length}{' '}
												cek
											</small>
										</span>
									</button>
								</li>
							))}
						</ul>
					</aside>

					<div className="uptake-main">
						{activeParticipant && (
							<>
								<section className="uptake-section">
									<h3>Rantai pemeriksaan — {activeParticipant.participantName}</h3>
									<p className="uptake-hint">
										Pilih satu peristiwa umpan balik (pemeriksaan) dan satu revisi
										(pemeriksaan berikutnya dengan jawaban yang berubah) untuk dikaitkan.
									</p>
									<ol className="uptake-chain">
										{activeParticipant.attempts.map((a) => {
											const linked = associations.some(
												(x) =>
													x.feedbackAttempt === a.id || x.revisionAttempt === a.id,
											);
											return (
												<li key={a.id} className={`uptake-chain-item${linked ? ' linked' : ''}`}>
													<div className="uptake-chain-head">
														<span className="uptake-level">
															{a.level
																? LEVEL_LABEL[a.level] || `Tingkat ${a.level}`
																: `Pemeriksaan ${a.attempt}`}
														</span>
														{a.revisionSubmitted && (
															<span className="asg-tag">Revisi</span>
														)}
														{a.requestedNextHint && (
															<span className="asg-tag">Minta panduan lanjut</span>
														)}
														<span className="ckp-time">{shortTime(a.created)}</span>
													</div>
													{a.area && <span className="fbp-area">{a.area}</span>}
													{a.responseText && (
														<details className="uptake-text">
															<summary>Teks jawaban saat pemeriksaan</summary>
															<pre>{a.responseText.slice(0, 2000)}</pre>
														</details>
													)}
													{a.feedback && (
														<details className="uptake-text">
															<summary>Umpan balik AI</summary>
															<pre>{a.feedback.slice(0, 2000)}</pre>
														</details>
													)}
													<div className="uptake-chain-actions">
														<label className="uptake-pick">
															<input
																type="radio"
																name="link-feedback"
																checked={linkFeedback === a.id}
																onChange={() => setLinkFeedback(a.id)}
															/>
															Sebagai umpan balik
														</label>
														<label className="uptake-pick">
															<input
																type="radio"
																name="link-revision"
																checked={linkRevision === a.id}
																onChange={() => setLinkRevision(a.id)}
															/>
															Sebagai revisi
														</label>
													</div>
												</li>
											);
										})}
									</ol>

									{linkFeedback && linkRevision && linkFeedback !== linkRevision && (
										<div className="uptake-link-form">
											<span className="uptake-link-arrow">
												Umpan balik <ArrowRight size={13} /> Revisi
											</span>
											<label className="research-export-field">
												<span>Atribusi</span>
												<select
													value={linkAttribution}
													onChange={(e) =>
														setLinkAttribution(e.target.value as AttributionStatus)
													}
												>
													{ATTRIBUTION_OPTIONS.map((o) => (
														<option key={o.value} value={o.value}>
															{o.label}
														</option>
													))}
												</select>
											</label>
											<button
												type="button"
												className="ld-pill primary"
												disabled={saving}
												onClick={() => void handleSaveAssociation()}
											>
												{saving ? (
													<LoaderCircle size={14} className="spin" />
												) : (
													<ClipboardCheck size={14} />
												)}
												Kaitkan umpan balik ↔ revisi
											</button>
										</div>
									)}
								</section>

								{associations.filter((x) => x.identityKey === activeParticipant.identityKey)
									.length > 0 && (
									<section className="uptake-section">
										<h3>Anotasi uptake</h3>
										<p className="uptake-hint">
											Untuk setiap asosiasi, klasifikasikan uptake mahasiswa. Penilaian
											diisi manusia saja — AI tidak pernah menetapkan uptake.
										</p>
										<div className="uptake-annotations">
											{associations
												.filter((x) => x.identityKey === activeParticipant.identityKey)
												.map((assoc) => {
													const feedback = attemptById.get(assoc.feedbackAttempt);
													const revision = attemptById.get(assoc.revisionAttempt);
													const existing = annotationByRevision.get(assoc.id);
													return (
														<UptakeAnnotationCard
															key={assoc.id}
															association={assoc}
															feedbackText={feedback?.feedback || ''}
															feedbackLevel={feedback?.level ?? null}
															originalText={feedback?.responseText || ''}
															revisionText={revision?.responseText || ''}
															existing={existing}
															saving={saving}
															onSave={(fields) =>
																void handleSaveUptake(assoc.id, fields)
															}
														/>
													);
												})}
										</div>
									</section>
								)}
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function UptakeAnnotationCard({
	association,
	feedbackText,
	feedbackLevel,
	originalText,
	revisionText,
	existing,
	saving,
	onSave,
}: {
	association: Association;
	feedbackText: string;
	feedbackLevel: number | null;
	originalText: string;
	revisionText: string;
	existing?: Annotation;
	saving: boolean;
	onSave: (fields: {
		uptakeJudgment: UptakeJudgment;
		beforeRevisionStatus: BeforeRevisionStatus | '';
		afterRevisionStatus: AfterRevisionStatus | '';
		uptakeNote: string;
	}) => void;
}) {
	const [judgment, setJudgment] = useState<UptakeJudgment | ''>(
		(existing?.uptakeJudgment as UptakeJudgment) || '',
	);
	const [before, setBefore] = useState<BeforeRevisionStatus | ''>(
		(existing?.beforeRevisionStatus as BeforeRevisionStatus) || '',
	);
	const [after, setAfter] = useState<AfterRevisionStatus | ''>(
		(existing?.afterRevisionStatus as AfterRevisionStatus) || '',
	);
	const [note, setNote] = useState(existing?.uptakeNote || '');

	useEffect(() => {
		setJudgment((existing?.uptakeJudgment as UptakeJudgment) || '');
		setBefore((existing?.beforeRevisionStatus as BeforeRevisionStatus) || '');
		setAfter((existing?.afterRevisionStatus as AfterRevisionStatus) || '');
		setNote(existing?.uptakeNote || '');
	}, [existing?.id]);

	return (
		<div className="uptake-card">
			<div className="uptake-card-head">
				<span className="asg-tag">{ATTRIBUTION_LABEL[association.attributionStatus as AttributionStatus] || 'Tidak pasti'}</span>
				{feedbackLevel && (
					<span className="asg-tag">{LEVEL_LABEL[feedbackLevel] || `Tingkat ${feedbackLevel}`}</span>
				)}
				<span className="ckp-time">{association.numberOfHints} panduan</span>
			</div>

			<div className="uptake-triple">
				<div className="uptake-triple-col">
					<strong>Teks asli</strong>
					<pre>{originalText.slice(0, 1500) || '(tidak ada teks)'}</pre>
				</div>
				<div className="uptake-triple-col">
					<strong>Umpan balik AI</strong>
					<pre>{feedbackText.slice(0, 1500) || '(tidak ada umpan balik)'}</pre>
				</div>
				<div className="uptake-triple-col">
					<strong>Revisi mahasiswa</strong>
					<pre>{revisionText.slice(0, 1500) || '(tidak ada revisi)'}</pre>
				</div>
			</div>

			<div className="uptake-form">
				<label className="uptake-field">
					<span>Penilaian uptake *</span>
					<select
						value={judgment}
						onChange={(e) => setJudgment(e.target.value as UptakeJudgment)}
					>
						<option value="">— pilih uptake —</option>
						{UPTAKE_JUDGMENT_OPTIONS.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</select>
				</label>
				<label className="uptake-field">
					<span>Status sebelum revisi</span>
					<select
						value={before}
						onChange={(e) => setBefore(e.target.value as BeforeRevisionStatus)}
					>
						<option value="">— pilih —</option>
						{BEFORE_STATUS_OPTIONS.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</select>
				</label>
				<label className="uptake-field">
					<span>Status setelah revisi</span>
					<select
						value={after}
						onChange={(e) => setAfter(e.target.value as AfterRevisionStatus)}
					>
						<option value="">— pilih —</option>
						{AFTER_STATUS_OPTIONS.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</select>
				</label>
				<label className="uptake-field uptake-field-wide">
					<span>Catatan peninjau</span>
					<textarea
						rows={2}
						maxLength={4000}
						value={note}
						onChange={(e) => setNote(e.target.value)}
						placeholder="Catatan peninjau (opsional)…"
					/>
				</label>
			</div>

			<div className="uptake-card-actions">
				{existing && (
					<span className="eval-saved">
						<CheckCircle2 size={13} /> Dinilai {shortTime(existing.uptakeReviewedAt)}
					</span>
				)}
				<button
					type="button"
					className="ld-pill primary"
					disabled={saving || !judgment}
					onClick={() =>
						onSave({
							uptakeJudgment: judgment as UptakeJudgment,
							beforeRevisionStatus: before,
							afterRevisionStatus: after,
							uptakeNote: note,
						})
					}
				>
					{saving ? <LoaderCircle size={14} className="spin" /> : <ShieldCheck size={14} />}
					Simpan anotasi uptake
				</button>
			</div>
		</div>
	);
}
