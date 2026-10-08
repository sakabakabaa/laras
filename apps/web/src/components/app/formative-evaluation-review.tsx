import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import {
	AlertCircle,
	AlertTriangle,
	CheckCircle2,
	ChevronDown,
	Eraser,
	Highlighter,
	MessageSquare,
	Sparkles,
	X,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import type { Assignment } from '@/lib/assignments';
import { marksFromCheck } from '@/components/app/formative-answer-script';
import { parseFeedbackPoints, shortenAdvice } from '@/components/app/task-workspaces/point-feedback';
import { rubricCriteriaOf } from '@/lib/evaluation-scoring';
import {
	calculateFormativeAdvisory,
	feedbackCitesMaterial,
	type FormativeAdvisory,
} from '@/lib/formative-scoring';

type Severity = 'minor' | 'major';
type FindingStatus = 'pending' | 'approved' | 'rejected' | 'manual';

export type FormativeFinding = {
	id: string;
	source: 'ai' | 'lecturer';
	severity: Severity;
	/** Exact substring of the answer ('' = general finding, not on text). */
	quote: string;
	note: string;
	status: FindingStatus;
	/** Required when an AI finding is rejected. */
	rejectReason: string;
};

type ReviewRow = {
	id: string;
	findings: FormativeFinding[];
	strengths: string;
	weaknesses: string;
};

type MarkedPart = {
	text: string;
	severity?: Severity;
	source?: 'ai' | 'lecturer';
	finding?: FormativeFinding;
};

const SEVERITY_LABEL: Record<Severity, string> = {
	minor: 'Kuning · saran',
	major: 'Merah · perlu perbaikan',
};

const QUOTE_RE = /["\u201c\u201e\u00ab']([^"\u201d\u201c\u00bb']{3,180})["\u201d\u201c\u00bb']/g;

function quotedBits(text: string): string[] {
	return [...text.matchAll(QUOTE_RE)].map((m) => m[1].replace(/\s+/g, ' ').trim()).filter((bit) => bit.length >= 4);
}

/** Case-insensitive match of a cited phrase back onto the original answer. */
function locatePhrase(content: string, phrase: string): string {
	const needle = phrase
		.replace(/[\u2026.]{1,3}/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (needle.length < 4) return '';
	const lower = content.toLocaleLowerCase('de-DE');
	const at = lower.indexOf(needle.toLocaleLowerCase('de-DE'));
	if (at >= 0) return content.slice(at, at + needle.length);
	const words = needle.split(/\s+/).filter((word) => word.length > 2);
	for (let len = Math.min(words.length, 8); len >= 2; len--) {
		for (let i = 0; i + len <= words.length; i++) {
			const slice = words.slice(i, i + len).join(' ');
			if (slice.length < 6) continue;
			const hit = lower.indexOf(slice.toLocaleLowerCase('de-DE'));
			if (hit >= 0) return content.slice(hit, hit + slice.length);
		}
	}
	return '';
}

/** Pull an exact answer substring out of quoted phrases in a note or quote. */
function quoteFromNote(content: string, note: string): string {
	if (!content || !note) return '';
	for (const phrase of quotedBits(note)) {
		const found = locatePhrase(content, phrase);
		if (found) return found;
	}
	return '';
}

/** Quote that can be painted on the answer, or '' when nothing in the text matches. */
function anchoredQuote(content: string, finding: FormativeFinding): string {
	if (!content) return '';
	if (finding.quote && content.includes(finding.quote)) return finding.quote;
	const fromStored = finding.quote ? locatePhrase(content, finding.quote) : '';
	if (fromStored) return fromStored;
	return quoteFromNote(content, finding.note);
}

/** Derive AI findings from the latest Cek jawaban feedback + evidence. */
function deriveAiFindings(content: string, feedback: string, evidence: string): FormativeFinding[] {
	const marks = marksFromCheck(content, feedback, evidence);
	const seen = new Set<string>();
	const out: FormativeFinding[] = [];
	marks.forEach((mark, index) => {
		const quote = content.slice(mark.start, mark.end);
		if (!quote || seen.has(quote)) return;
		seen.add(quote);
		out.push({
			id: `ai-${index}`,
			source: 'ai',
			severity: mark.color === 'red' ? 'major' : 'minor',
			quote,
			note: mark.note,
			status: 'pending',
			rejectReason: '',
		});
	});
	// General advice points without an on-text quote still appear for review.
	const points = parseFeedbackPoints([feedback, evidence].filter(Boolean).join('\n')).filter(
		(p) => p.status === 'fix' || p.status === 'improve',
	);
	const quotedNotes = new Set(out.map((f) => f.note));
	const evidencePhrases = [
		...quotedBits(feedback),
		...quotedBits(evidence),
		...evidence
			.split(/\n+/)
			.map((line) => line.replace(/^baris\s+[\d\s,.-–—]+[:.]\s*/i, '').trim())
			.filter((line) => line.length >= 4),
	];
	for (const point of points) {
		const blob = `${point.title} ${point.detail}`.trim();
		const note = shortenAdvice(blob) || point.title;
		if (!note || quotedNotes.has(note)) continue;
		let quote = quoteFromNote(content, `${blob} ${note}`);
		if (!quote) {
			for (const phrase of evidencePhrases) {
				const found = locatePhrase(content, phrase);
				if (!found || seen.has(found)) continue;
				const hint = phrase.slice(0, 18).toLocaleLowerCase('de-DE');
				if (blob.toLocaleLowerCase('de-DE').includes(hint) || note.toLocaleLowerCase('de-DE').includes(hint)) {
					quote = found;
					break;
				}
			}
		}
		if (quote && seen.has(quote)) continue;
		if (quote) seen.add(quote);
		quotedNotes.add(note);
		out.push({
			id: `ai-gen-${out.length}`,
			source: 'ai',
			severity: point.status === 'fix' ? 'major' : 'minor',
			quote,
			note,
			status: 'pending',
			rejectReason: '',
		});
	}
	return out;
}

/** Merge saved review findings with freshly derived AI findings. */
function mergeFindings(saved: FormativeFinding[], derived: FormativeFinding[]): FormativeFinding[] {
	const byId = new Map<string, FormativeFinding>();
	for (const f of saved) byId.set(f.id, f);
	const lecturer = saved.filter((f) => f.source === 'lecturer');
	const merged: FormativeFinding[] = [];
	for (const d of derived) {
		const existing = byId.get(d.id);
		merged.push(existing ? { ...d, status: existing.status, rejectReason: existing.rejectReason } : d);
	}
	return [...merged, ...lecturer];
}

/** Build inline segments for one line, marking every quoted finding in place.
 *  A quote that crosses a line break is painted on each line it touches. */
function lineSegments(content: string, findings: FormativeFinding[], from: number, to: number): MarkedPart[] {
	const visible = findings.filter((f) => f.status !== 'rejected');
	const local: { start: number; end: number; finding: FormativeFinding }[] = [];
	const used = new Set<string>();
	for (const f of visible) {
		const quote = anchoredQuote(content, f);
		if (!quote || quote.length > 300 || used.has(quote)) continue;
		const at = content.indexOf(quote);
		if (at < 0) continue;
		const end = at + quote.length;
		if (end <= from || at >= to) continue;
		used.add(quote);
		local.push({ start: Math.max(at, from), end: Math.min(end, to), finding: f });
	}
	local.sort((a, b) => a.start - b.start || b.end - a.end);
	const accepted: typeof local = [];
	let cursor = from;
	for (const m of local) {
		if (m.start < cursor) continue;
		accepted.push(m);
		cursor = m.end;
	}
	const parts: MarkedPart[] = [];
	let pos = from;
	for (const m of accepted) {
		if (m.start > pos) parts.push({ text: content.slice(pos, m.start) });
		parts.push({ text: content.slice(m.start, m.end), severity: m.finding.severity, source: m.finding.source, finding: m.finding });
		pos = m.end;
	}
	if (pos < to) parts.push({ text: content.slice(pos, to) });
	if (parts.length === 0) parts.push({ text: content.slice(from, to) });
	return parts;
}

type ReviewContextValue = {
	content: string;
	findings: FormativeFinding[];
	visible: FormativeFinding[];
	aiFindings: FormativeFinding[];
	lecturerFindings: FormativeFinding[];
	rejected: FormativeFinding[];
	pendingCount: number;
	strengths: string;
	weaknesses: string;
	autoScore: number | null;
	advisory: FormativeAdvisory;
	criteria: { id: string; label: string; weight: number }[];
	saving: boolean;
	notice: string;
	selection: string;
	pendingMark: { quote: string; severity: Severity } | null;
	manualNote: string;
	manualError: string;
	rejectingId: string | null;
	rejectReason: string;
	rejectError: string;
	activeFindingId: string | null;
	setStrengths: (v: string) => void;
	setWeaknesses: (v: string) => void;
	setManualNote: (v: string) => void;
	setRejectReason: (v: string) => void;
	captureSelection: (text: string) => void;
	markSelection: (severity: Severity) => void;
	addManual: () => void;
	cancelSelection: () => void;
	accept: (id: string) => void;
	startReject: (id: string) => void;
	confirmReject: (id: string) => void;
	cancelReject: () => void;
	restoreFinding: (id: string) => void;
	removeFinding: (id: string) => void;
	focusFinding: (id: string | null) => void;
	deriveInsight: () => void;
};

const ReviewContext = createContext<ReviewContextValue | null>(null);

function useReview() {
	return useContext(ReviewContext);
}

/**
 * Wraps the formative evaluation grid so the inline-marked answer (middle
 * column) and the insight panel (right column) share one review state,
 * persisted to `formative_reviews` per participant.
 */
export function FormativeReviewProvider({
	enabled = true,
	assignmentId,
	identityKey,
	channel,
	submissionId,
	content,
	feedback,
	evidence,
	autoScore,
	assignment,
	cefrLevel,
	children,
}: {
	enabled?: boolean;
	assignmentId: string;
	identityKey: string;
	channel: 'enrolled' | 'public';
	submissionId?: string;
	content: string;
	feedback: string;
	evidence: string;
	autoScore: number | null;
	assignment?: Assignment | null;
	/** CEFR level derived from the language-skills course code (null when N/A). */
	cefrLevel?: string | null;
	children: ReactNode;
}) {
	const [rowId, setRowId] = useState<string | null>(null);
	const [findings, setFindings] = useState<FormativeFinding[]>([]);
	const [strengths, setStrengths] = useState('');
	const [weaknesses, setWeaknesses] = useState('');
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [notice, setNotice] = useState('');
	const [selection, setSelection] = useState('');
	const [pendingMark, setPendingMark] = useState<{ quote: string; severity: Severity } | null>(null);
	const [manualNote, setManualNote] = useState('');
	const [manualError, setManualError] = useState('');
	const [rejectingId, setRejectingId] = useState<string | null>(null);
	const [rejectReason, setRejectReason] = useState('');
	const [rejectError, setRejectError] = useState('');
	const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
	const dirtyRef = useRef(false);
	const skipSave = useRef(true);

	const derived = useMemo(
		() => deriveAiFindings(content, feedback, evidence),
		[content, feedback, evidence],
	);

	const load = useCallback(async () => {
		if (!enabled || !identityKey) {
			setFindings(derived);
			setLoading(false);
			return;
		}
		try {
			const row = await pb.collection('formative_reviews').getFirstListItem<ReviewRow>(
				pb.filter('assignment = {:a} && identityKey = {:k}', { a: assignmentId, k: identityKey }),
			);
			setRowId(row.id);
			setFindings(mergeFindings(row.findings || [], derived));
			setStrengths(row.strengths || '');
			setWeaknesses(row.weaknesses || '');
		} catch {
			setRowId(null);
			setFindings(derived);
			setStrengths('');
			setWeaknesses('');
		} finally {
			setLoading(false);
		}
	}, [enabled, assignmentId, identityKey, derived]);

	useEffect(() => {
		setLoading(true);
		setSelection('');
		setPendingMark(null);
		setManualNote('');
		setManualError('');
		setRejectingId(null);
		setRejectReason('');
		setRejectError('');
		setActiveFindingId(null);
		setNotice('');
		skipSave.current = true;
		void load();
	}, [load]);

	// Debounced persistence — only after the initial load settles.
	useEffect(() => {
		if (!enabled || loading) return;
		if (skipSave.current) {
			skipSave.current = false;
			dirtyRef.current = false;
			return;
		}
		dirtyRef.current = true;
		const timer = window.setTimeout(() => {
			void (async () => {
				setSaving(true);
				setNotice('');
				try {
					const payload = {
						assignment: assignmentId,
						identityKey,
						channel,
						submission: submissionId || '',
						findings,
						strengths,
						weaknesses,
					};
					if (rowId) {
						await pb.collection('formative_reviews').update(rowId, payload);
					} else {
						const created = await pb.collection('formative_reviews').create<ReviewRow>({
							...payload,
							owner: pb.authStore.record?.id || '',
						});
						setRowId(created.id);
					}
					dirtyRef.current = false;
					setNotice('Tinjauan tersimpan.');
				} catch {
					setNotice('Gagal menyimpan tinjauan.');
				} finally {
					setSaving(false);
				}
			})();
		}, 800);
		return () => window.clearTimeout(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [findings, strengths, weaknesses]);

	const criteria = useMemo(() => (assignment ? rubricCriteriaOf(assignment) : []), [assignment]);
	const advisory = useMemo<FormativeAdvisory>(() => {
		const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
		return calculateFormativeAdvisory({
			findings: findings
				.filter((f) => f.status !== 'rejected')
				.map((f) => ({
					severity: f.severity,
					status: f.status === 'pending' ? 'approved' : f.status,
					quote: f.quote,
				})),
			wordCount,
			cefrLevel,
			hasRubric: criteria.length > 0,
			hasMaterial: feedbackCitesMaterial(feedback, evidence),
		});
	}, [findings, content, cefrLevel, criteria, feedback, evidence]);

	const visible = findings.filter((f) => f.status !== 'rejected');
	const aiFindings = findings.filter((f) => f.source === 'ai');
	const lecturerFindings = findings.filter((f) => f.source === 'lecturer');
	const rejected = findings.filter((f) => f.status === 'rejected');
	const pendingCount = aiFindings.filter((f) => f.status === 'pending').length;

	const updateFinding = (id: string, patch: Partial<FormativeFinding>) => {
		setNotice('');
		setFindings((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
	};

	const markSelection = (severity: Severity) => {
		const quote = selection.trim();
		if (!quote) {
			setManualError('Blok teks pada jawaban terlebih dahulu, lalu pilih kuning atau merah.');
			setPendingMark(null);
			return;
		}
		setPendingMark({ quote, severity });
		setManualNote('');
		setManualError('');
	};

	const addManual = () => {
		if (!pendingMark) return;
		const note = manualNote.trim();
		if (!note) {
			setManualError('Tulis catatan untuk teks yang ditandai.');
			return;
		}
		setFindings((prev) => [
			...prev,
			{
				id: `dosen-${Date.now()}`,
				source: 'lecturer',
				severity: pendingMark.severity,
				quote: pendingMark.quote,
				note: note.slice(0, 600),
				status: 'manual',
				rejectReason: '',
			},
		]);
		setPendingMark(null);
		setSelection('');
		setManualNote('');
		setManualError('');
		window.getSelection()?.removeAllRanges();
	};

	const cancelSelection = () => {
		setPendingMark(null);
		setSelection('');
		setManualNote('');
		setManualError('');
		window.getSelection()?.removeAllRanges();
	};

	const accept = (id: string) => {
		updateFinding(id, { status: 'approved', rejectReason: '' });
	};

	const startReject = (id: string) => {
		setRejectingId(id);
		setRejectReason('');
		setRejectError('');
	};

	const confirmReject = (id: string) => {
		const reason = rejectReason.trim();
		if (reason.length < 4) {
			setRejectError('Alasan penolakan wajib diisi (minimal 4 karakter).');
			return;
		}
		updateFinding(id, { status: 'rejected', rejectReason: reason.slice(0, 600) });
		setRejectingId(null);
		setRejectReason('');
		setRejectError('');
	};

	const cancelReject = () => {
		setRejectingId(null);
		setRejectReason('');
		setRejectError('');
	};

	const restoreFinding = (id: string) => {
		updateFinding(id, { status: 'pending', rejectReason: '' });
	};

	const removeFinding = (id: string) => {
		setFindings((prev) => prev.filter((f) => f.id !== id));
	};

	const deriveInsight = () => {
		const majors = visible.filter((f) => f.severity === 'major');
		const minors = visible.filter((f) => f.severity === 'minor');
		const weakLines = majors
			.map((f) => `• ${f.note}${f.rejectReason ? ` (ditolak: ${f.rejectReason})` : ''}`)
			.slice(0, 8);
		const strengthLines: string[] = [];
		if (majors.length === 0) strengthLines.push('• Tidak ada kesalahan berarti pada pemeriksaan terakhir.');
		if (minors.length === 0 && majors.length > 0)
			strengthLines.push('• Tidak ada saran minor — fokus pada kesalahan utama.');
		const ok = parseFeedbackPoints([feedback, evidence].filter(Boolean).join('\n')).filter(
			(p) => p.status === 'ok',
		);
		for (const p of ok.slice(0, 4)) strengthLines.push(`• ${shortenAdvice(`${p.title} ${p.detail}`.trim())}`);
		setWeaknesses(weakLines.length ? weakLines.join('\n') : '');
		setStrengths(strengthLines.length ? strengthLines.join('\n') : '');
		setNotice('Insight disusun dari umpan balik Cek jawaban.');
	};

	const value: ReviewContextValue = {
		content,
		findings,
		visible,
		aiFindings,
		lecturerFindings,
		rejected,
		pendingCount,
		strengths,
		weaknesses,
		autoScore,
		advisory,
		criteria,
		saving,
		notice,
		selection,
		pendingMark,
		manualNote,
		manualError,
		rejectingId,
		rejectReason,
		rejectError,
		activeFindingId,
		setStrengths,
		setWeaknesses,
		setManualNote: (v) => {
			setManualNote(v);
			setManualError('');
		},
		setRejectReason,
		captureSelection: (text) => setSelection((prev) => (prev === text ? prev : text)),
		markSelection,
		addManual,
		cancelSelection,
		accept,
		startReject,
		confirmReject,
		cancelReject,
		restoreFinding,
		removeFinding,
		focusFinding: (id) => setActiveFindingId(id),
		deriveInsight,
	};

	return <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>;
}

/** The answer text with inline red/yellow marks (AI + lecturer) and the
 *  marking toolbar. Clicking an AI mark opens its note with accept/reject. */
export function FormativeReviewAnswer() {
	const ctx = useReview();
	const textRef = useRef<HTMLDivElement>(null);
	const noteRef = useRef<HTMLTextAreaElement | null>(null);
	const content = ctx?.content || '';

	const lines = content.split('\n');
	const [rowCounts, setRowCounts] = useState<number[]>(() => lines.map(() => 1));

	useLayoutEffect(() => {
		const el = textRef.current;
		if (!el) return;
		const rows = Array.from(el.querySelectorAll<HTMLElement>(':scope > .evx-line'));
		if (rows.length === 0) return;
		const textLh = parseFloat(getComputedStyle(rows[0]).lineHeight) || 20.15;
		const measure = () => {
			const counts = rows.map((row) => {
				const textEl = row.querySelector<HTMLElement>(':scope > .evx-line-text');
				if (!textEl) return 1;
				return Math.max(1, Math.round(textEl.getBoundingClientRect().height / textLh));
			});
			setRowCounts((prev) =>
				prev.length === counts.length && prev.every((n, i) => n === counts[i]) ? prev : counts,
			);
		};
		measure();
		if (typeof ResizeObserver === 'undefined') return;
		const obs = new ResizeObserver(measure);
		rows.forEach((row) => obs.observe(row));
		let cancelled = false;
		if (typeof document !== 'undefined' && document.fonts && 'ready' in document.fonts) {
			document.fonts.ready.then(() => {
				if (!cancelled) measure();
			});
		}
		return () => {
			cancelled = true;
			obs.disconnect();
		};
	}, [content, ctx?.findings]);

	// Capture text selections inside the answer for manual marking.
	useEffect(() => {
		if (!content) return;
		const capture = () => {
			const el = textRef.current;
			if (!el) return;
			const sel = window.getSelection();
			if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
			const node = sel.getRangeAt(0).commonAncestorContainer;
			if (!el.contains(node)) return;
			const text = sel.toString().trim();
			if (!text || text.length > 300 || !content.includes(text)) return;
			ctx?.captureSelection(text);
		};
		const onSettled = () => window.setTimeout(capture, 0);
		document.addEventListener('mouseup', onSettled);
		document.addEventListener('keyup', onSettled);
		return () => {
			document.removeEventListener('mouseup', onSettled);
			document.removeEventListener('keyup', onSettled);
		};
	}, [content, ctx]);

	useEffect(() => {
		if (ctx?.pendingMark) window.setTimeout(() => noteRef.current?.focus(), 0);
	}, [ctx?.pendingMark]);

	if (!ctx) return null;
	if (!content) return <p className="asg-empty-line">Tidak ada catatan teks.</p>;

	let offset = 0;
	let lineNum = 0;
	const words = content.trim() ? content.trim().split(/\s+/).length : 0;
	const yellow = ctx.visible.filter((f) => f.severity === 'minor' && anchoredQuote(content, f)).length;
	const red = ctx.visible.filter((f) => f.severity === 'major' && anchoredQuote(content, f)).length;
	const unanchored = ctx.visible.filter((f) => f.source === 'ai' && !anchoredQuote(content, f));

	return (
		<div className="aev-answer fer-answer">
			<div className="aev-markbar" role="toolbar" aria-label="Tandai teks jawaban">
				<span className="aev-markbar-label">
					<Highlighter size={14} /> Tandai teks
				</span>
				<button
					type="button"
					className={`aev-mark-btn minor${ctx.pendingMark?.severity === 'minor' ? ' active' : ''}${ctx.selection ? ' ready' : ''}`}
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => ctx.markSelection('minor')}
				>
					Kuning · saran
				</button>
				<button
					type="button"
					className={`aev-mark-btn major${ctx.pendingMark?.severity === 'major' ? ' active' : ''}${ctx.selection ? ' ready' : ''}`}
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => ctx.markSelection('major')}
				>
					Merah · perlu perbaikan
				</button>
				<button type="button" className="aev-tool" onClick={() => ctx.focusFinding(null)}>
					<MessageSquare size={13} /> Catatan
				</button>
				<button
					type="button"
					className="aev-tool"
					title="Bersihkan pilihan"
					onClick={ctx.cancelSelection}
				>
					<Eraser size={13} /> Bersihkan
				</button>
			</div>

			{ctx.pendingMark && (
				<div className={`aev-inline-note ${ctx.pendingMark.severity}`}>
					<strong>
						{ctx.pendingMark.severity === 'minor' ? 'Catatan kuning' : 'Catatan merah'}: tulis
						penjelasan untuk teks ini
					</strong>
					<blockquote>{ctx.pendingMark.quote}</blockquote>
					<textarea
						ref={noteRef}
						rows={3}
						maxLength={600}
						value={ctx.manualNote}
						onChange={(e) => ctx.setManualNote(e.target.value)}
						placeholder="Catatan dosen (wajib)..."
						aria-label="Catatan untuk teks yang ditandai"
					/>
					{ctx.manualError && (
						<p className="form-error" role="alert">
							{ctx.manualError}
						</p>
					)}
					<div className="aevr-mark-form-actions">
						<button type="button" className="ld-btn-primary" onClick={ctx.addManual}>
							Simpan catatan
						</button>
						<button type="button" className="ld-outline-action sm" onClick={ctx.cancelSelection}>
							Batal
						</button>
					</div>
				</div>
			)}
			{!ctx.pendingMark && ctx.manualError && (
				<p className="form-error" role="alert">
					{ctx.manualError}
				</p>
			)}

			<div className="evx-script fas-lines" ref={textRef}>
				{lines.map((line, index) => {
					const start = offset;
					offset += line.length + 1;
					const parts = lineSegments(content, ctx.findings, start, start + line.length);
					const count = rowCounts[index] || 1;
					const nums = Array.from({ length: count }, (_, k) => lineNum + 1 + k);
					lineNum += count;
					return (
						<div className="evx-line" key={index}>
							<span className="evx-ln" aria-hidden="true">
								{nums.map((n, k) => (
									<span key={k} className="evx-ln-num">
										{n}
									</span>
								))}
							</span>
							<span className="evx-line-text">
								{parts.map((part, partIndex) => {
									if (!part.text) return null;
									if (!part.severity || !part.finding) return <span key={partIndex}>{part.text}</span>;
									const f = part.finding;
									const focused = f.id === ctx.activeFindingId;
									const showBubble = focused && partIndex === parts.findIndex((p) => p.finding?.id === f.id);
									return (
										<mark
											key={partIndex}
											className={`aev-mark ${f.severity}${f.source === 'lecturer' ? ' lecturer' : ''}${focused ? ' focused' : ''}`}
											tabIndex={0}
											onClick={() => ctx.focusFinding(focused ? null : f.id)}
											onKeyDown={(event) => {
												if (event.key === 'Enter' || event.key === ' ') {
													event.preventDefault();
													ctx.focusFinding(focused ? null : f.id);
												}
											}}
										>
											{part.text}
											{showBubble ? (
												<span
													className="aev-mark-pop"
													role="dialog"
													aria-label="Keputusan temuan"
													onClick={(e) => e.stopPropagation()}
													onKeyDown={(e) => e.stopPropagation()}
												>
													<span className="aev-mark-pop-head">
														<span className="aev-chip">{SEVERITY_LABEL[f.severity]}</span>
														<span className={`aevr-src ${f.source}`}>{f.source === 'ai' ? 'AI' : 'Dosen'}</span>
													</span>
													<span className="aev-mark-pop-note">{f.note}</span>
													{ctx.rejectingId === f.id ? (
														<span className="fer-reject-form">
															<strong>Alasan penolakan (wajib)</strong>
															<textarea
																rows={2}
																maxLength={600}
																value={ctx.rejectReason}
																onChange={(e) => ctx.setRejectReason(e.target.value)}
																placeholder="Mengapa temuan AI ini ditolak?"
															/>
															{ctx.rejectError ? (
																<span className="form-error" role="alert">{ctx.rejectError}</span>
															) : null}
															<span className="aevr-mark-form-actions">
																<button type="button" className="ld-btn-primary" onMouseDown={(e) => e.preventDefault()} onClick={() => ctx.confirmReject(f.id)}>
																	Tolak temuan
																</button>
																<button type="button" className="ld-outline-action sm" onMouseDown={(e) => e.preventDefault()} onClick={ctx.cancelReject}>
																	Batal
																</button>
															</span>
														</span>
													) : (
														<span className="aev-mark-pop-actions">
															{f.source === 'ai' && f.status !== 'approved' ? (
																<button type="button" className="approve" onMouseDown={(e) => e.preventDefault()} onClick={() => ctx.accept(f.id)}>
																	<CheckCircle2 size={12} /> Setujui
																</button>
															) : null}
															{f.source === 'ai' && f.status !== 'rejected' ? (
																<button type="button" className="reject" onMouseDown={(e) => e.preventDefault()} onClick={() => ctx.startReject(f.id)}>
																	<X size={12} /> Tolak
																</button>
															) : null}
															{f.source === 'lecturer' ? (
																<button type="button" className="delete" onMouseDown={(e) => e.preventDefault()} onClick={() => ctx.removeFinding(f.id)}>
																	<X size={12} /> Hapus
																</button>
															) : null}
														</span>
													)}
												</span>
											) : null}
										</mark>
									);
								})}
								{parts.every((part) => !part.text) ? '\u00a0' : null}
							</span>
						</div>
					);
				})}
			</div>
			<UnanchoredPills items={unanchored} />
			<footer className="evx-script-foot">
				<span>{words} kata</span>
				<span className="evx-ann">
					{ctx.visible.filter((f) => f.quote).length} anotasi
					<i className="minor">{yellow}</i>
					<i className="major">{red}</i>
				</span>
			</footer>
			<p className="fas-legend">
				<mark className="aev-mark minor">kuning</mark> saran AI
				<mark className="aev-mark major">merah</mark> perlu diperbaiki AI
				<mark className="aev-mark minor lecturer">garis</mark> catatan dosen
			</p>
		</div>
	);
}

function oneWordCriterion(label: string) {
	let text = label.trim().replace(/^jika dimasukkan,?\s*/i, '');
	const colon = text.indexOf(':');
	if (colon > 0) text = text.slice(0, colon);
	const word = (text.split(/\s+/)[0] || text).replace(/[.,;:()]/g, '');
	return word ? word.charAt(0).toUpperCase() + word.slice(1) : label;
}

function UnanchoredPills({ items }: { items: FormativeFinding[] }) {
	const ctx = useReview();
	const [open, setOpen] = useState<Severity | null>(null);
	if (!ctx || items.length === 0) return null;
	const minors = items.filter((f) => f.severity === 'minor');
	const majors = items.filter((f) => f.severity === 'major');
	const shown = open === 'minor' ? minors : open === 'major' ? majors : [];
	return (
		<div className="fer-pills">
			<div className="fer-pill-row" role="group" aria-label="Temuan tidak tertaut ke teks">
				{minors.length > 0 && (
					<button
						type="button"
						className={`fer-pill minor${open === 'minor' ? ' open' : ''}`}
						aria-expanded={open === 'minor'}
						onClick={() => setOpen(open === 'minor' ? null : 'minor')}
					>
						<AlertTriangle size={14} /> {minors.length} saran
					</button>
				)}
				{majors.length > 0 && (
					<button
						type="button"
						className={`fer-pill major${open === 'major' ? ' open' : ''}`}
						aria-expanded={open === 'major'}
						onClick={() => setOpen(open === 'major' ? null : 'major')}
					>
						<AlertCircle size={14} /> {majors.length} perlu diperbaiki
					</button>
				)}
			</div>
			{open && shown.length > 0 && (
				<ul className="fer-pill-list" aria-label={open === 'minor' ? 'Daftar saran' : 'Daftar yang perlu diperbaiki'}>
					{shown.map((f) => (
						<li key={f.id}>
							<p>{f.note}</p>
							{ctx.rejectingId === f.id ? (
								<div className="fer-reject-form">
									<strong>Alasan penolakan (wajib)</strong>
									<textarea
										rows={2}
										maxLength={600}
										value={ctx.rejectReason}
										onChange={(e) => ctx.setRejectReason(e.target.value)}
										placeholder="Mengapa temuan AI ini ditolak?"
									/>
									{ctx.rejectError ? (
										<span className="form-error" role="alert">{ctx.rejectError}</span>
									) : null}
									<div className="aevr-mark-form-actions">
										<button type="button" className="ld-btn-primary" onClick={() => ctx.confirmReject(f.id)}>
											Tolak temuan
										</button>
										<button type="button" className="ld-outline-action sm" onClick={ctx.cancelReject}>
											Batal
										</button>
									</div>
								</div>
							) : (
								<div className="aevr-item-actions">
									{f.status !== 'approved' ? (
										<button type="button" className="approve" onClick={() => ctx.accept(f.id)}>
											<CheckCircle2 size={12} /> Setujui
										</button>
									) : (
										<span className="asg-tag status-published">Disetujui</span>
									)}
									<button type="button" onClick={() => ctx.startReject(f.id)}>
										<X size={12} /> Tolak
									</button>
								</div>
							)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

/** Evaluasi AI berada tepat di bawah tinjauan teks jawaban. */
export function FormativeReviewEvaluation() {
	const ctx = useReview();
	if (!ctx) return null;

	return (
		<section className="evx-panel fer-eval-action" aria-label="Evaluasi AI">
			<header>
				<h4>Evaluasi AI</h4>
			</header>
			<button type="button" className="ld-btn-primary fer-eval-btn" onClick={ctx.deriveInsight}>
				<Sparkles size={14} /> Susun insight dari Cek jawaban
			</button>
			<p className="evx-muted">
				Menyusun ringkasan kelebihan dan kekurangan dari umpan balik Cek jawaban terakhir.
				AI bersifat saran; dosen mengontrol keputusan akhir.
			</p>
			{ctx.pendingCount > 0 && (
				<p className="aev-note failed">
					{ctx.pendingCount} temuan AI menunggu tinjauan. Setujui atau tolak dari tanda pada teks.
				</p>
			)}
		</section>
	);
}

/** Right column: advisory score from kept corrections, stored rubric, insight. */
export function FormativeReviewPanel() {
	const ctx = useReview();
	if (!ctx) return null;
	const advisory = ctx.advisory;
	const score = advisory.score;

	return (
		<section className="evx-panel fer-panel" aria-label="Saran nilai dan rubrik">
			<section className="evx-block fer-score-block">
				<header>
					<h4>Saran nilai</h4>
					<span className="evx-draft">{ctx.saving ? 'Menyimpan…' : 'Bukan nilai resmi'}</span>
				</header>
				<div className="fer-score">
					<strong>{score}</strong>
					<small>/ 100 · saran</small>
				</div>
				<details className="fer-score-details">
					<summary>
						<span>Rincian nilai dan rubrik</span>
						<ChevronDown size={16} aria-hidden="true" />
					</summary>
					<div className="fer-score-details-body">
						<p className="evx-muted fer-rationale">{advisory.rationale}</p>
						<ul className="fer-factors" aria-label="Faktor perhitungan skor">
							{advisory.factors.map((factor) => (
								<li key={factor.key}>
									<span className="fer-factor-label">{factor.label}</span>
									<span className="fer-factor-detail">{factor.detail}</span>
									{factor.impact !== 0 && (
										<em className={factor.impact < 0 ? 'penalty' : 'tolerance'}>
											{factor.impact > 0 ? '+' : ''}{factor.impact}
										</em>
									)}
								</li>
							))}
						</ul>
						<p className="evx-muted">
							{advisory.majorCount} merah · {advisory.minorCount} kuning · {advisory.wordCount} kata
							{advisory.cefrLevel ? ` · CEFR ${advisory.cefrLevel}` : ''}. Temuan yang ditolak tidak dihitung.
							Kepercayaan: {advisory.confidence === 'high' ? 'tinggi' : advisory.confidence === 'medium' ? 'sedang' : 'rendah'}.
							Dosen tetap memegang keputusan akhir; angka ini tidak dipublikasikan.
						</p>
						{ctx.autoScore != null && (
							<p className="evx-muted">Skor otomatis Cek jawaban: {ctx.autoScore}/100 (referensi terpisah).</p>
						)}
						{ctx.criteria.length > 0 && (
							<section className="evx-block">
								<header>
									<h4>Rubrik</h4>
									<span>Saran <strong>{score}</strong> / 100</span>
								</header>
								<ul className="evx-rubric fer-rubric">
									{ctx.criteria.map((row) => (
										<li key={row.id}>
											<span>{oneWordCriterion(row.label)}</span>
											<span className="evx-bar"><i style={{ width: `${score}%` }} /></span>
											<strong>{score}</strong>
										</li>
									))}
								</ul>
								<p className="evx-muted">Kriteria dari rubrik tugas. Temuan formatif belum dipetakan per kriteria, jadi seluruh kriteria memakai skor saran menyeluruh — bukan nilai per kriteria.</p>
							</section>
						)}
					</div>
				</details>
			</section>


			<section className="evx-block">
				<header>
					<h4>Insight</h4>
				</header>
				<label className="fer-insight-field">
					<strong>Kelebihan</strong>
					<textarea
						rows={3}
						maxLength={4000}
						value={ctx.strengths}
						onChange={(e) => ctx.setStrengths(e.target.value)}
						placeholder="Aspek yang sudah baik pada jawaban peserta..."
					/>
				</label>
				<label className="fer-insight-field">
					<strong>Kekurangan</strong>
					<textarea
						rows={3}
						maxLength={4000}
						value={ctx.weaknesses}
						onChange={(e) => ctx.setWeaknesses(e.target.value)}
						placeholder="Aspek yang perlu diperbaiki..."
					/>
				</label>
			</section>

			{ctx.rejected.length > 0 && (
				<div className="aevr-rejected">
					<span>Ditolak ({ctx.rejected.length}) — tidak dihitung</span>
					{ctx.rejected.map((f) => (
						<div className="aevr-rejected-item" key={f.id}>
							<button type="button" onClick={() => ctx.restoreFinding(f.id)}>
								Pulihkan: {f.note.slice(0, 60)}
								{f.note.length > 60 ? '…' : ''}
							</button>
							{f.rejectReason ? <span className="fer-reject-reason">Alasan: {f.rejectReason}</span> : null}
						</div>
					))}
				</div>
			)}

			{ctx.notice && (
				<p className="eval-saved" role="status">
					<CheckCircle2 size={13} /> {ctx.notice}
				</p>
			)}
		</section>
	);
}
