import { useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, RotateCcw, ScanText, ShieldCheck, Sparkles } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { errorMessage } from '@/lib/learning';
import type { AssignmentMode } from '@/lib/assignments';
import {
	checkMaxOf,
	CHECK_LEVEL_LABEL,
	publicIdentityComplete,
	type CheckResponsePayload,
	type PublicCheckIdentity,
} from '@/lib/check-types';
import { CheckEvidence } from '@/components/app/task-workspaces/check-feedback-body';
import { PointFeedback } from '@/components/app/task-workspaces/point-feedback';

export type CheckAssignmentInfo = {
	/** Enrolled: the assignment id. */
	id?: string;
	/** Public: the assignment's public token. */
	token?: string;
	status: string;
	deadline: string;
	mode: AssignmentMode;
	checkEnabled?: boolean;
	checkMax?: number | null;
};

export type CheckHistoryAttempt = {
	attempt: number;
	level?: number;
	area: string;
	feedback: string;
	evidence: string;
	focus: string;
	created: string;
	/** OCR-first image check: the normalized text that was evaluated. */
	ocr?: {
		rawText: string;
		reviewedText: string;
		normalizedText: string;
		image: { name: string; url: string } | null;
	};
};

type HistoryResponse = {
	used?: number;
	max?: number;
	checkEnabled?: boolean;
	attempts?: CheckHistoryAttempt[];
	lastResponse?: CheckResponsePayload | null;
	error?: string;
};

type CheckResponse = {
	attempt: number;
	used: number;
	max: number;
	level?: number;
	area: string;
	feedback: string;
	evidence: string;
	hasRubric: boolean;
	unreadable?: string[];
	/** Public: continuation code issued with the first check's draft row. */
	continuationToken?: string;
	files?: { name: string; url: string }[];
	/** OCR-first image flow: the extracted reading awaiting participant review. */
	ocrRequired?: boolean;
	ocrText?: string;
	image?: { name: string; url: string };
	/** Confirmed OCR check: the normalized text that was evaluated. */
	ocr?: { normalizedText: string; image?: { name: string; url: string } | null };
	error?: string;
};

export type LatestFeedback = { feedback: string; evidence: string; area: string; level?: number };

/**
 * Formative "Cek jawaban" panel: the participant checks their CURRENT response
 * before the official submission. Each check is a numbered attempt (default
 * max 5, lecturer-configurable) and returns an AI recommendation only — no
 * answers, no right/wrong verdicts, no grades. Every check is recorded for
 * lecturer review; official grading stays with the lecturer.
 *
 * Works for authenticated students (identity = account) and public-link
 * participants (identity = required name + NIM / group fields, verified
 * against earlier attempts on return). Public participants with a saved draft
 * must present their continuation code — it is the only credential that may
 * spend that identity's check quota.
 */
export function CheckAnswerPanel({
	assignment,
	channel,
	buildResponse,
	identity,
	continuationToken,
	onRestore,
	onContinuation,
	collectFiles,
	onFilesSaved,
	onApplyOcrText,
	onLatestFeedback,
	buildNumberedContent,
	hideCount,
	hideLineByLineFeedback = false,
}: {
	assignment: CheckAssignmentInfo;
	channel: 'enrolled' | 'public';
	/** Snapshot of the participant's current response at check time. */
	buildResponse: () => CheckResponsePayload;
	/** Public participants: identity fields from the public form. */
	identity?: PublicCheckIdentity;
	/** Public participants: continuation code protecting their draft row. */
	continuationToken?: string;
	/** Public continuation: restore the last checked response into the form. */
	onRestore?: (response: CheckResponsePayload) => void;
	/** Public: surface a continuation code issued by the server (first check). */
	onContinuation?: (code: string) => void;
	/** Public: files currently attached, including ones not yet uploaded. */
	collectFiles?: () => { kept: string[]; pending: File[] };
	/** Public: server stored the attachments on the draft — drop local copies. */
	onFilesSaved?: (files: { name: string; url: string }[]) => void;
	/** Typed-answer tasks only: let the participant adopt the reviewed OCR text. */
	onApplyOcrText?: (text: string) => void;
	/** Reports the latest check so the writing workspace can draw annotations over the answer. */
	onLatestFeedback?: (latest: LatestFeedback | null) => void;
	/**
	 * Writing tasks only: a line-numbered copy of the answer matching the
	 * editor's displayed visual lines (including auto-wrapped lines). Sent
	 * alongside `content` so the model can reference line numbers; the
	 * original answer text is never modified.
	 */
	buildNumberedContent?: () => string;
	/** Speaking worksheet: the button already shows remaining checks. */
	hideCount?: boolean;
	hideLineByLineFeedback?: boolean;
}) {
	const max = checkMaxOf(assignment);
	const enabled = assignment.checkEnabled !== false;
	const identityReady =
		channel === 'enrolled' ||
		(identity ? publicIdentityComplete(assignment.mode, identity) : false);

	const [history, setHistory] = useState<CheckHistoryAttempt[]>([]);
	const [used, setUsed] = useState(0);
	const [lastResponse, setLastResponse] = useState<CheckResponsePayload | null>(null);
	const [loaded, setLoaded] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [notes, setNotes] = useState<string[]>([]);
	const [noRubric, setNoRubric] = useState(false);
	const [focus, setFocus] = useState('');
	/** OCR-first image flow: reading awaiting the participant's review. */
	const [ocr, setOcr] = useState<{
		raw: string;
		text: string;
		image: { name: string; url: string };
	} | null>(null);

	const identityKey = useMemo(
		() =>
			channel === 'enrolled'
				? 'enrolled'
				: [
						identity?.participantName.trim().toLowerCase(),
						identity?.nim.trim().toLowerCase(),
						identity?.groupName.trim().toLowerCase(),
					].join('|'),
		[channel, identity?.participantName, identity?.nim, identity?.groupName],
	);

	// Report the latest check's feedback upward so the writing workspace can
	// draw annotations over the answer. Uses a ref so a changing parent callback
	// does not retrigger the history effect.
	const onLatestRef = useRef(onLatestFeedback);
	onLatestRef.current = onLatestFeedback;
	useEffect(() => {
		const fn = onLatestRef.current;
		if (!fn) return;
		const last = history[history.length - 1];
		fn(
			last
				? {
						feedback: last.feedback,
						evidence: last.evidence,
						area: last.area,
						level: last.level,
					}
				: null,
		);
	}, [history]);

	useEffect(() => {
		if (!enabled || !identityReady) {
			setLoaded(true);
			return;
		}
		let alive = true;
		const timer = setTimeout(() => {
			void (async () => {
				try {
					const response = await fetch('/api/check-answer', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							...(channel === 'enrolled' && pb.authStore.token
								? { Authorization: `Bearer ${pb.authStore.token}` }
								: {}),
						},
						body: JSON.stringify({
							action: 'history',
							...(channel === 'enrolled'
								? { assignmentId: assignment.id }
								: {
										token: assignment.token,
										participantName: identity?.participantName,
										nim: identity?.nim,
										groupName: identity?.groupName,
										members: identity?.members,
											...(continuationToken ? { continuationToken } : {}),
									}),
						}),
					});
					const body = (await response.json()) as HistoryResponse;
					if (!alive) return;
					if (!response.ok) {
						setError(body.error || 'Riwayat pemeriksaan gagal dimuat.');
						return;
					}
					setHistory(body.attempts || []);
					setUsed(body.used || 0);
					setLastResponse(body.lastResponse || null);
				} catch {
					if (alive) setError('Riwayat pemeriksaan gagal dimuat. Coba lagi.');
				} finally {
					if (alive) setLoaded(true);
				}
			})();
		}, 350);
		return () => {
			alive = false;
			clearTimeout(timer);
		};
	}, [
		enabled,
		identityReady,
		channel,
		assignment.id,
		assignment.token,
		identityKey,
		// identity fields are captured through identityKey; avoid re-running per keystroke beyond it
		identity?.participantName,
		identity?.nim,
		identity?.groupName,
		identity?.members,
		continuationToken,
	]);

	if (!enabled) return null;

	const remaining = Math.max(0, max - used);
	const limitReached = used >= max;
	const kind = buildResponse().kind;
	// Level 4 (explicit correction) is offered only after the student has
	// progressed through the progressive hints to Level 3 — never auto-escalated.
	const latestLevel = history.length ? history[history.length - 1].level ?? 0 : 0;
	const canRequestExplicit = latestLevel >= 3 && remaining > 0;
	// Question-based tasks have no typed answer field: reviewed OCR text stays
	// an internal checked-answer version instead of being inserted anywhere.
	const isQuestionKind = ['quiz', 'listening', 'reading'].includes(kind);

	/** One request to /api/check-answer — shared by the first check and the OCR confirmation. */
	const sendCheck = async (extra: {
		ocrText?: string;
		ocrRaw?: string;
		ocrConfirmed?: boolean;
		explicit?: boolean;
	}): Promise<{ response: Response; body: CheckResponse }> => {
		const payload = buildResponse();
		// Attach a line-numbered copy of the answer (writing tasks) so the
		// model can reference line numbers. Skipped on the OCR-confirmation
		// path — there the checked answer is the reviewed OCR text, not the
		// editor's visual lines.
		if (buildNumberedContent && !extra.ocrConfirmed) {
			const numbered = buildNumberedContent();
			if (numbered) payload.numberedContent = numbered;
		}
		const attached = collectFiles?.() ?? { kept: [], pending: [] };
		const hasFiles = attached.kept.length > 0 || attached.pending.length > 0;
		const useFiles = channel === 'public' && hasFiles;
		const response = await fetch('/api/check-answer', useFiles
			? {
					method: 'POST',
					body: (() => {
						const fd = new FormData();
						fd.set('action', 'check');
						fd.set('token', assignment.token || '');
						fd.set('participantName', identity?.participantName || '');
						fd.set('nim', identity?.nim || '');
						fd.set('groupName', identity?.groupName || '');
						fd.set('members', identity?.members || '');
						if (continuationToken) fd.set('continuationToken', continuationToken);
						fd.set('focus', focus.trim());
						if (extra.ocrConfirmed) fd.set('ocrConfirmed', 'true');
						if (extra.ocrText) fd.set('ocrText', extra.ocrText);
						if (extra.ocrRaw) fd.set('ocrRaw', extra.ocrRaw);
					if (extra.explicit) fd.set('explicitCorrection', 'true');
						fd.set(
							'response',
							JSON.stringify({
								...payload,
								attachments: [...attached.kept, ...attached.pending.map((file) => file.name)].map(
									(name) => ({ name }),
								),
							}),
						);
						fd.set('keptFiles', JSON.stringify(attached.kept));
						for (const file of attached.pending) fd.append('files', file, file.name);
						return fd;
					})(),
				}
			: {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(channel === 'enrolled' && pb.authStore.token
							? { Authorization: `Bearer ${pb.authStore.token}` }
							: {}),
					},
					body: JSON.stringify({
						action: 'check',
						...(channel === 'enrolled'
							? { assignmentId: assignment.id }
							: {
									token: assignment.token,
									participantName: identity?.participantName,
									nim: identity?.nim,
									groupName: identity?.groupName,
									members: identity?.members,
									...(continuationToken ? { continuationToken } : {}),
								}),
						response: payload,
						focus: focus.trim(),
						...(extra.ocrConfirmed ? { ocrConfirmed: true } : {}),
						...(extra.ocrText ? { ocrText: extra.ocrText } : {}),
						...(extra.ocrRaw ? { ocrRaw: extra.ocrRaw } : {}),
						...(extra.explicit ? { explicitCorrection: true } : {}),
					}),
				});
		const body = (await response.json()) as CheckResponse;
		if (body.continuationToken && onContinuation) onContinuation(body.continuationToken);
		if (body.files && onFilesSaved) onFilesSaved(body.files);
		return { response, body };
	};

	const handleCheckResult = (body: CheckResponse, focusUsed: string) => {
		setUsed(body.used);
		setNoRubric(body.hasRubric === false);
		setNotes(body.unreadable || []);
		setFocus('');
		setHistory((prev) => [
			...prev,
			{
				attempt: body.attempt,
				level: body.level,
				area: body.area,
				feedback: body.feedback,
				evidence: body.evidence,
				focus: focusUsed,
				created: new Date().toISOString(),
				...(body.ocr
					? {
							ocr: {
								rawText: '',
								reviewedText: '',
								normalizedText: body.ocr.normalizedText,
								image: body.ocr.image || null,
							},
						}
					: {}),
			},
		]);
	};

	const runCheck = async (opts: { explicit?: boolean } = {}) => {
		setError('');
		setNotes([]);
		const payload = buildResponse();
		const attached = collectFiles?.() ?? { kept: [], pending: [] };
		const hasFiles = attached.kept.length > 0 || attached.pending.length > 0;
		const hasWork =
			(payload.answers && Object.keys(payload.answers).length > 0) ||
			Boolean(payload.content?.trim()) ||
			Boolean(payload.link?.trim()) ||
			hasFiles;
		if (!hasWork) {
			setError('Belum ada jawaban untuk diperiksa. Isi jawaban Anda lebih dulu.');
			return;
		}
		setBusy(true);
		try {
			const { response, body } = await sendCheck({ explicit: opts.explicit });
			// OCR-first image flow: the server returns the extracted reading for
			// review — no attempt is consumed yet.
			if (response.ok && body.ocrRequired) {
				setOcr({
					raw: body.ocrText || '',
					text: body.ocrText || '',
					image: body.image || { name: '', url: '' },
				});
				setNotes(body.unreadable || []);
				return;
			}
			if (!response.ok) {
				setError(body.error || 'Pemeriksaan gagal. Coba lagi.');
				setNotes(body.unreadable || []);
				return;
			}
			handleCheckResult(body, focus.trim());
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	/** OCR confirmation: the reviewed text becomes the checked answer version. */
	const confirmOcr = async () => {
		if (!ocr || !ocr.text.trim()) return;
		setError('');
		setNotes([]);
		setBusy(true);
		try {
			const { response, body } = await sendCheck({
				ocrConfirmed: true,
				ocrText: ocr.text,
				ocrRaw: ocr.raw,
			});
			if (!response.ok) {
				setError(body.error || 'Pemeriksaan gagal. Coba lagi.');
				setNotes(body.unreadable || []);
				return;
			}
			setOcr(null);
			handleCheckResult(body, focus.trim());
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="fbp-panel">
			<div className="fbp-head">
				<ShieldCheck size={16} />
				<div className="fbp-head-copy">
					<h4>Cek jawaban — panduan AI formatif</h4>
					<p>Bantuan AI, bukan umpan balik dosen. Tanpa nilai resmi.</p>
				</div>
				<div className="fbp-head-meta">
					<span className="fbp-ai-tag" aria-label="Bantuan AI">AI</span>
					{!hideCount && (
						<span className={`ckp-count${limitReached ? ' full' : ''}`}>
							Pemeriksaan: {used} dari {max}
						</span>
					)}
				</div>
			</div>

			{!identityReady && (
				<p className="fbp-note">
					Isi identitas (nama lengkap dan {assignment.mode === 'collaborative' ? 'nama kelompok + daftar anggota' : 'NIM / nomor mahasiswa'}) lebih dulu untuk memakai Cek jawaban.
				</p>
			)}
			{identityReady && limitReached && (
				<p className="fbp-note over">
					Kuota pemeriksaan sudah habis ({max} dari {max}). Perbaiki jawaban berdasarkan panduan
					di bawah, lalu kumpulkan.
				</p>
			)}
			{identityReady && !limitReached && !ocr && (
				<div className="fbp-request">
					<button
						type="button"
						className="ld-outline-action sm"
						onClick={() => void runCheck()}
						disabled={busy}
					>
						{busy ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}
						Cek jawaban ({remaining} tersisa)
					</button>
					{canRequestExplicit && (
						<button
							type="button"
							className="ld-outline-action sm explicit"
							onClick={() => void runCheck({ explicit: true })}
							disabled={busy}
						>
							{busy ? <LoaderCircle size={14} className="spin" /> : <ShieldCheck size={14} />}
							Minta koreksi eksplisit (Level 4)
						</button>
					)}
				</div>
			)}
			{canRequestExplicit && !ocr && (
				<p className="fbp-note">
					Sudah melalui petunjuk terarah (Level 3). Jika masih bingung, minta koreksi
					eksplisit (Level 4) — bentuk benar disertai penjelasan singkat. Gunakan untuk
					belajar, bukan sekadar mendapat jawaban.
				</p>
			)}

			{ocr && (
				<div className="ocr-review" aria-label="Periksa hasil bacaan foto">
					<div className="ocr-head">
						<ScanText size={15} />
						<strong>Periksa hasil bacaan foto Anda</strong>
					</div>
					<p className="ocr-note">
						Ini hasil bacaan otomatis (OCR) dari foto jawaban Anda. Perbaiki kesalahan baca —
						huruf, spasi, atau kata yang salah dikenali — sebelum pemeriksaan dijalankan.
						Pemeriksaan baru dihitung setelah Anda konfirmasi di bawah.
					</p>
					{ocr.image.url && (
						<a className="ocr-thumb" href={ocr.image.url} target="_blank" rel="noreferrer">
							<img src={ocr.image.url} alt={ocr.image.name || 'Foto jawaban'} />
							<span>Lihat foto asli</span>
						</a>
					)}
					<textarea
						className="ocr-text"
						rows={8}
						value={ocr.text}
						onChange={(e) => setOcr((prev) => (prev ? { ...prev, text: e.target.value } : prev))}
						aria-label="Hasil bacaan foto (dapat dikoreksi)"
					/>
					{isQuestionKind && (
						<p className="ocr-internal">
							Tugas ini tidak memakai jawaban teks — teks di atas hanya dipakai sebagai versi
							jawaban yang diperiksa dan tidak dimasukkan ke kolom jawaban.
						</p>
					)}
					<div className="ocr-actions">
						{onApplyOcrText && !isQuestionKind && (
							<button
								type="button"
								className="ld-text-btn"
								onClick={() => onApplyOcrText(ocr.text)}
							>
								Gunakan teks ini di kolom jawaban
							</button>
						)}
						<button
							type="button"
							className="ld-outline-action sm"
							onClick={() => setOcr(null)}
							disabled={busy}
						>
							Batal
						</button>
						<button
							type="button"
							className="ld-outline-action sm"
							onClick={() => void confirmOcr()}
							disabled={busy || !ocr.text.trim()}
						>
							{busy ? <LoaderCircle size={14} className="spin" /> : <ShieldCheck size={14} />}
							Cek jawaban sekarang
						</button>
					</div>
				</div>
			)}

			{noRubric && (
				<p className="fbp-note">
					Rubrik dosen belum tersedia untuk tugas ini — pemeriksaan hanya berdasar instruksi tugas.
				</p>
			)}
			{notes.length > 0 && (
				<ul className="fbp-unreadable" aria-label="Catatan berkas">
					{notes.map((note, i) => (
						<li key={i}>{note}</li>
					))}
				</ul>
			)}

			{loaded && history.length === 0 && !error && (
				<p className="fbp-empty">Belum ada pemeriksaan. Cek jawaban Anda untuk mendapat panduan.</p>
			)}
			{history.length > 0 && (
				<ol className="fbp-list">
					{[...history].reverse().map((r, i) => {
						const isLatest = i === 0;
						return (
							<li key={r.attempt} className={`fbp-item${isLatest ? '' : ' fbp-collapsed'}`}>
								<details open={isLatest}>
									<summary className="fbp-item-head fbp-item-summary">
										<span className="fbp-level">
											{r.level ? CHECK_LEVEL_LABEL[r.level] || `Tingkat ${r.level}` : `Pemeriksaan ${r.attempt}`}
										</span>
										{r.area && <span className="fbp-area">{r.area}</span>}
										<span className="ckp-time">
											Pemeriksaan {r.attempt} · {formatCheckTime(r.created)}
										</span>
									</summary>
									<div className="fbp-item-body">
										{r.focus && <p className="fbp-evidence">Fokus Anda: {r.focus}</p>}
										{!hideLineByLineFeedback && <PointFeedback text={r.feedback} />}
										{!hideLineByLineFeedback && r.evidence && <CheckEvidence evidence={r.evidence} />}
										{r.ocr?.normalizedText && (
											<details className="cho-snap">
												<summary>Teks foto yang diperiksa</summary>
												<p className="cho-snap-text">{r.ocr.normalizedText}</p>
											</details>
										)}
									</div>
								</details>
							</li>
						);
					})}
				</ol>
			)}

			{channel === 'public' && lastResponse && onRestore && (
				<button
					type="button"
					className="ld-text-btn ckp-restore"
					onClick={() => onRestore(lastResponse)}
				>
					<RotateCcw size={13} /> Muat jawaban dari pemeriksaan terakhir
				</button>
			)}

			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
			{busy && (
				<p className="pub-status">
					<LoaderCircle size={14} className="spin" /> Memeriksa jawaban… panduan dapat muncul beberapa
					saat.
				</p>
			)}
		</div>
	);
}

/** Indonesian short timestamp for a check attempt (client-only data). */
function formatCheckTime(iso: string) {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleString('id-ID', {
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
	});
}
