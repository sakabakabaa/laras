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
	type RefObject,
	type SyntheticEvent,
} from 'react';
import {
	AlertCircle,
	AlertTriangle,
	Check,
	CheckCircle2,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Eraser,
	EyeOff,
	FileAudio,
	FlaskConical,
	Highlighter,
	Info,
	ListChecks,
	LoaderCircle,
	MessageSquare,
	PenLine,
	RotateCcw,
	Send,
	Sparkles,
	Trash2,
	X,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { useT } from '@/lib/i18n';
import type { Assignment } from '@/lib/assignments';
import { letterGrade } from '@/lib/assignments';
import {
	buildMarkedSegments,
	deriveAiReviewFindings,
	normalizeReviewFindings,
	type MarkedSegment,
	parseCitations,
	parseFindings,
	parseProvenance,
	parseReviewFindings,
	parseRubric,
	parseTranscriptConfidence,
	REVIEW_STATUS_LABEL,
	SEVERITY_LABEL,
	type AiEvaluationRow,
	type EvalSeverity,
	type ResearchProvenance,
	type ReviewFinding,
	type TranscriptConfidence,
} from '@/lib/ai-evaluation';
import {
	calculateRubricScores,
	countWords,
	rubricCriteriaOf,
	RUBRIC_MAJOR_PENALTY,
	RUBRIC_MINOR_PENALTY,
	speakingTranscriptUnavailable,
	type RubricScores,
} from '@/lib/evaluation-scoring';
import {
	annotationIsStarted,
	COMPLETENESS_JUDGMENT_LABEL,
	COMPLETENESS_JUDGMENT_OPTIONS,
	CORRECTION_JUDGMENT_LABEL,
	CORRECTION_JUDGMENT_OPTIONS,
	DETECTION_JUDGMENT_LABEL,
	DETECTION_JUDGMENT_OPTIONS,
	EMPTY_ANNOTATION,
	EMPTY_MISSED_ERROR_DRAFT,
	ERROR_PRESENT_LABEL,
	ERROR_PRESENT_OPTIONS,
	EXPLANATION_JUDGMENT_LABEL,
	EXPLANATION_JUDGMENT_OPTIONS,
	findingFingerprint,
	type HumanMissedError,
	type MissedErrorDraft,
	NECESSITY_JUDGMENT_LABEL,
	NECESSITY_JUDGMENT_OPTIONS,
	PEDAGOGICAL_JUDGMENT_LABEL,
	PEDAGOGICAL_JUDGMENT_OPTIONS,
	REFERENCE_CATEGORIES,
	REFERENCE_SEVERITY_LABEL,
	REFERENCE_SEVERITY_OPTIONS,
	referenceSubcategories,
	type ReferenceSeverity,
	type ResearchAnnotation,
} from '@/lib/research-annotation';
import { projectBlindResearchItems, assertBlindResearchRound, type BlindResearchLoad } from '@/lib/research-rater-client';

export type EvaluatedParticipant = {
	channel: 'enrolled' | 'public';
	/** The assignment_submissions row id (enrolled channel). */
	enrolledId?: string;
	/** The public_submissions row id (public channel). */
	publicId?: string;
	status: string;
};

function stamp(iso: string) {
	if (!iso) return '';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleString('id-ID', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

/** Compact rubric criterion label for the score list: the criterion name
 *  before its description, without the conditional "Jika dimasukkan" prefix. */
const SPEAKER_PALETTE = ['#dbeafe|#1d4ed8', '#dcfce7|#166534', '#fce7f3|#9d174d', '#fef3c7|#8A6500', '#e0e7ff|#3730a3'];

function speakerTone(name: string) {
	let hash = 0;
	for (const char of name) hash = (hash + char.charCodeAt(0)) % SPEAKER_PALETTE.length;
	const [background, color] = SPEAKER_PALETTE[hash].split('|');
	return { background, color };
}

function speakerOf(line: string) {
	const match = line.match(/^([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.'-]{0,18})\s*:\s+([\s\S]+)$/);
	if (!match) return null;
	return { name: match[1], rest: match[2], prefix: line.length - match[2].length };
}

function sliceSegments(segments: MarkedSegment[], start: number, end: number) {
	let pos = 0;
	const parts: MarkedSegment[] = [];
	for (const segment of segments) {
		const segStart = pos;
		const segEnd = pos + segment.text.length;
		pos = segEnd;
		const from = Math.max(segStart, start);
		const to = Math.min(segEnd, end);
		if (to > from) {
			parts.push({
				text: segment.text.slice(from - segStart, to - segStart),
				severity: segment.severity,
				findingIndex: segment.findingIndex,
			});
		}
	}
	return parts;
}

function shortCriterionLabel(label: string): string {
	let text = label.trim().replace(/^jika dimasukkan,?\s*/i, '');
	const colon = text.indexOf(':');
	if (colon > 0) text = text.slice(0, colon);
	const word = (text.split(/\s+/)[0] || text).replace(/[.,;:()]/g, '');
	return word ? word.charAt(0).toUpperCase() + word.slice(1) : label;
}

function SeverityToggle({
	value,
	onChange,
}: {
	value: EvalSeverity;
	onChange: (severity: EvalSeverity) => void;
}) {
	const t = useT();
	return (
		<div className="aevr-sev-toggle" role="group" aria-label="Tingkat temuan">
			<button
				type="button"
				className={`minor ${value === 'minor' ? 'active' : ''}`}
				onClick={() => onChange('minor')}
			>
				{t('aevr.minor')}
			</button>
			<button
				type="button"
				className={`major ${value === 'major' ? 'active' : ''}`}
				onClick={() => onChange('major')}
			>
				{t('aevr.major')}
			</button>
		</div>
	);
}

type ReviewContextValue = {
	hasRecord: boolean;
	content: string;
	assignmentShape: Assignment['shape'];
	cefrLevel: string | null;
	transcriptStatus: string;
	transcriptError: string;
	/** Speaking submission whose transcript is not ready — cannot be graded yet. */
	ungradable: boolean;
	row: AiEvaluationRow | null;
	ready: AiEvaluationRow | null;
	preparing: boolean;
	items: ReviewFinding[];
	visible: ReviewFinding[];
	rejected: ReviewFinding[];
	marked: ReviewFinding[];
	segments: ReturnType<typeof buildMarkedSegments> | null;
	dirty: boolean;
	saving: boolean;
	notice: string;
	saveError: string;
	editingId: string | null;
	editNote: string;
	editSeverity: EvalSeverity;
	manualNote: string;
	manualError: string;
	selection: string;
	pendingMark: { quote: string; severity: EvalSeverity } | null;
	criteria: { id: string; label: string; weight: number }[];
	calc: RubricScores;
	override: string;
	overrideValid: boolean;
	finalScore: number;
	adjustedByLecturer: boolean;
	aiScore: number | null;
	/** Step 4 — model recommendedScore vs detail score divergence (>15). */
	divergence: { recommendedScore: number; detailScore: number } | null;
	/** Step 6 — speaking pronunciation confidence (advisory, never auto-penalizes). */
	confidence: TranscriptConfidence | null;
	pendingCount: number;
	activeFindingId: string | null;
	noteTick: number;
	published: AiEvaluationRow | null;
	publishNote: string;
	confirmPublish: boolean;
	publishing: boolean;
	publishError: string;
	publishNotice: string;
	regenerating: boolean;
	aiCount: number;
	lecturerCount: number;
	/** Phase 5 — research provenance (lecturer/researcher private). */
	provenance: ResearchProvenance | null;
	// Phase 4 — research-only missed errors (AI false negatives) + counters.
	missedErrors: HumanMissedError[];
	researchAnnotations: Record<string, ResearchAnnotation>;
	researchAnnotationCount: number;
	/** Off in the normal evaluation flow so rater identity / provenance stay hidden. */
	researchMode: boolean;
	setResearchMode: (v: boolean) => void;
	researchRound: 0 | 1 | 2;
	researchRoundLocked: boolean;
	setResearchRound: (v: 0 | 1 | 2) => void;
	researchLoadError: string;
	researchLoading: boolean;
	createMissedError: (draft: MissedErrorDraft) => Promise<void>;
	deleteMissedError: (id: string) => Promise<void>;
	setResearchAnnotation: (fingerprint: string, annotation: ResearchAnnotation) => void;
	// actions
	captureSelection: (text: string) => void;
	setEditNote: (value: string) => void;
	setEditSeverity: (severity: EvalSeverity) => void;
	setManualNote: (value: string) => void;
	setPublishNote: (value: string) => void;
	changeOverride: (value: string) => void;
	clearOverride: () => void;
	applyAiScore: () => void;
	startEdit: (finding: ReviewFinding) => void;
	saveEdit: (finding: ReviewFinding) => void;
	cancelEdit: () => void;
	updateFinding: (id: string, patch: Partial<ReviewFinding>) => void;
	rejectingId: string | null;
	rejectReason: string;
	rejectError: string;
	setRejectReason: (value: string) => void;
	startReject: (id: string) => void;
	confirmReject: (id: string) => void;
	cancelReject: () => void;
	removeFinding: (id: string) => void;
	focusFinding: (id: string | null) => void;
	focusNote: () => void;
	markSelection: (severity: EvalSeverity) => void;
	addManual: () => void;
	cancelSelection: () => void;
	resetReview: () => void;
	regenerate: () => void;
	saveReview: () => void;
	publish: () => void;
	requestConfirmPublish: () => void;
	cancelPublish: () => void;
};

const ReviewContext = createContext<ReviewContextValue | null>(null);

function useReview() {
	return useContext(ReviewContext);
}

/**
 * Shared lecturer-review state for one Tugas formal submission. Wraps the
 * evaluation workspace grid (it renders no DOM node of its own) so the
 * inline-marked answer in the middle column and the single consolidated
 * penilaian panel in the right column stay in sync: the same findings drive
 * the marks on the text, the rubric recalculation, and the publishing flow.
 */
export function AiEvaluationReviewProvider({
	assignment,
	participant,
	content,
	cefrLevel,
	transcriptConfidence,
	transcriptStatus,
	transcriptError,
	onPublished,
	onAdvance,
	children,
}: {
	assignment: Assignment;
	/** Null when no formal participant is selected — children render without review state. */
	participant: EvaluatedParticipant | null;
	content: string;
	/** CEFR level derived from the language-skills course code (null when N/A). */
	cefrLevel?: string | null;
	/** Speaking-task per-word confidence (json from the submission, advisory only). */
	transcriptConfidence?: unknown;
	/** Speaking-task transcript readiness ('' for non-speaking tasks). */
	transcriptStatus?: string;
	/** Speaking-task last transcription error message. */
	transcriptError?: string;
	onPublished?: () => void;
	/** After a confirmed publish, move the lecturer to the next participant. */
	onAdvance?: () => void;
	children: ReactNode;
}) {
	const [row, setRow] = useState<AiEvaluationRow | null>(null);
	const [loading, setLoading] = useState(true);
	const [working, setWorking] = useState<ReviewFinding[] | null>(null);
	const [saving, setSaving] = useState(false);
	const [notice, setNotice] = useState('');
	const [saveError, setSaveError] = useState('');
	const [editingId, setEditingId] = useState<string | null>(null);
	const [rejectingId, setRejectingId] = useState<string | null>(null);
	const [rejectReason, setRejectReason] = useState('');
	const [rejectError, setRejectError] = useState('');
	const [editNote, setEditNote] = useState('');
	const [editSeverity, setEditSeverity] = useState<EvalSeverity>('minor');
	const [selection, setSelection] = useState('');
	const [pendingMark, setPendingMark] = useState<{ quote: string; severity: EvalSeverity } | null>(null);
	const [manualNote, setManualNote] = useState('');
	const [manualError, setManualError] = useState('');
	// Phase 3 — rubric recalculation, lecturer override, and publish state.
	const [override, setOverride] = useState('');
	const [publishNote, setPublishNote] = useState('');
	const [confirmPublish, setConfirmPublish] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [publishError, setPublishError] = useState('');
	const [publishNotice, setPublishNotice] = useState('');
	const [regenerating, setRegenerating] = useState(false);
	const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
	const [noteTick, setNoteTick] = useState(0);
	const triggered = useRef<string | null>(null);
	const mergedSig = useRef('');
	// Set after a successful save/publish so the next merge resyncs the
	// working copy from the server's stored review (dropping any findings the
	// server omitted as invalid) instead of preserving the in-progress copy.
	const resyncFromSaved = useRef(false);
	// True once the lecturer edits the score field themselves — distinguishes
	// an explicit lecturer adjustment from the untouched AI-recommendation autofill.
	const overrideTouched = useRef(false);

	// Phase 4 — lecturer-only research items for this evaluation: human missed
	// errors (AI false negatives) and AI-finding research annotations. Loaded
	// once per evaluation row so the answer column, the missed-error section,
	// and the right-panel counters all share one source of truth. Students can
	// never read these (owner-only collection rules).
	const [researchItems, setResearchItems] = useState<{
		annotations: Record<string, ResearchAnnotation>;
		missedErrors: HumanMissedError[];
	}>({ annotations: {}, missedErrors: [] });
	// Research annotation/provenance is a separate workflow — hidden from the
	// normal evaluation flow so rater identity and research metadata never
	// appear unless the lecturer explicitly opts in.
	const [researchMode, setResearchMode] = useState(false);
	const [researchRound, setResearchRound] = useState<0 | 1 | 2>(1);
	const [researchRoundLocked, setResearchRoundLocked] = useState(false);
	const [researchLoadError, setResearchLoadError] = useState('');
	const [researchLoading, setResearchLoading] = useState(false);

	const relationField = participant
		? participant.channel === 'enrolled'
			? 'submission'
			: 'publicSubmission'
		: '';
	const recordKey = participant
		? participant.channel === 'enrolled'
			? participant.enrolledId
			: participant.publicId
		: '';
	const filter = recordKey ? `${relationField}="${recordKey}"` : '';

	const load = useCallback(async () => {
		if (!filter) {
			setRow(null);
			setLoading(false);
			return;
		}
		try {
			const found = await pb.collection('ai_evaluations').getFirstListItem<AiEvaluationRow>(filter);
			setRow(found);
		} catch {
			setRow(null);
		} finally {
			setLoading(false);
		}
	}, [filter]);

	useEffect(() => {
		setLoading(true);
		setRow(null);
		setWorking(null);
		setResearchItems({ annotations: {}, missedErrors: [] });
		setResearchLoadError('');
		setResearchLoading(true);
		mergedSig.current = '';
		resyncFromSaved.current = false;
		setEditingId(null);
		setSelection('');
		setPendingMark(null);
		setManualNote('');
		setNotice('');
		setSaveError('');
		setOverride('');
		overrideTouched.current = false;
		setPublishNote('');
		setConfirmPublish(false);
		setPublishError('');
		setPublishNotice('');
		setActiveFindingId(null);
		void load();
	}, [load]);

	// Phase 4 — reload all research items (missed errors + AI annotations) for
	// the current evaluation row. Splits by `origin`: human rows are missed
	// errors, ai rows with a parentAiFindingId are research annotations.
	const reloadResearchItems = useCallback(async (round: 0 | 1 | 2 = researchRound) => {
		const evaluationId = row?.id;
		if (!evaluationId || !recordKey || !participant) {
			setResearchItems({ annotations: {}, missedErrors: [] });
			setResearchLoadError('Submission/evaluasi tidak tersedia untuk pemuatan anotasi riset.');
			setResearchLoading(false);
			return;
		}
		setResearchLoading(true);
		setResearchLoadError('');
		setResearchRoundLocked(false);
		try {
			const token = pb.authStore.token;
			if (!token) throw new Error('Sesi autentikasi tidak tersedia.');
			const res = await fetch('/api/evaluation-annotation', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({ intent: 'load', ...(participant.channel === 'enrolled' ? { submissionId: recordKey } : { publicSubmissionId: recordKey }), round }),
			});
			const data = (await res.json().catch(() => ({}))) as BlindResearchLoad & { message?: string; error?: string; assignedRound?: 0 | 1 | 2 };
			if (!res.ok) throw new Error(data.message || data.error || 'Akses rater ditolak atau respons tidak valid.');
			assertBlindResearchRound(data, round);
			setResearchRoundLocked(data.assignedRound !== undefined);
			setResearchItems(projectBlindResearchItems(data));
		} catch (error) {
			setResearchItems({ annotations: {}, missedErrors: [] });
			setResearchLoadError(error instanceof Error ? error.message : 'Gagal memuat anotasi riset secara aman.');
		} finally {
			setResearchLoading(false);
		}
	}, [row?.id, recordKey, participant, researchRound]);

	useEffect(() => {
		void reloadResearchItems();
	}, [reloadResearchItems]);

	// Backfill: a final submission without a draft yet gets one prepared in
	// the background, so AI recommendations appear while the lecturer works.
	useEffect(() => {
		if (loading || row || !recordKey || !participant) return;
		if (participant.status !== 'submitted' && participant.status !== 'late') return;
		if (triggered.current === recordKey) return;
		triggered.current = recordKey;
		const token = pb.authStore.token;
		if (!token) return;
		void fetch('/api/evaluation-draft', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(
				participant.channel === 'enrolled'
					? { submissionId: recordKey }
					: { publicSubmissionId: recordKey },
			),
		})
			.then(() => load())
			.catch(() => {
				/* background convenience only — the note below says it is pending */
			});
	}, [loading, row, recordKey, participant, load]);

	// While the background analysis runs, refresh until it settles.
	useEffect(() => {
		if (row?.status !== 'pending') return;
		let tries = 0;
		const timer = window.setInterval(() => {
			tries += 1;
			void load();
			if (tries >= 40) window.clearInterval(timer);
		}, 4000);
		return () => window.clearInterval(timer);
	}, [row?.status, row?.id, load]);

	// The assignment's stored rubric criteria (Menulis / Berbicara).
	const criteria = useMemo(() => rubricCriteriaOf(assignment), [assignment]);

	// Builds the lecturer's working copy: the saved review when there is one,
	// otherwise the AI recommendations laid in as 'pending'. Once the
	// lecturer has reviewed AI items, their copy is authoritative — a
	// regenerated draft never clobbers their decisions.
	useEffect(() => {
		if (loading || !row) return;
		if (row.status !== 'ready' && row.status !== 'failed') return;
		const stored = normalizeReviewFindings(parseReviewFindings(row.reviewFindings), criteria);
		const ai = row.status === 'ready' ? parseFindings(row.findings) : [];
		const sig = JSON.stringify([stored, ai]);
		if (mergedSig.current === sig) return;
		mergedSig.current = sig;
		setWorking((prev) => {
			// After an explicit save/publish, the stored review is authoritative —
			// resync to it so any findings the server omitted as invalid (empty
			// note or a quote that no longer matches the submitted text) are
			// dropped from the working copy rather than lingering in the UI.
			if (resyncFromSaved.current) {
				resyncFromSaved.current = false;
				return stored.length > 0 ? stored : deriveAiReviewFindings(ai, criteria);
			}
			const current = prev ?? [];
			if (current.length === 0) return stored.length > 0 ? stored : deriveAiReviewFindings(ai, criteria);
			const hasAi = current.some((f) => f.source === 'ai');
			const derived = deriveAiReviewFindings(ai, criteria);
			if (hasAi || derived.length === 0) return current;
			// Manual-only review saved while the draft was still preparing:
			// lay the AI recommendations under the lecturer's own findings
			// without touching them.
			const taken = new Set(current.map((f) => f.id));
			return [...current, ...derived.filter((f) => !taken.has(f.id))];
		});
	}, [row, loading, criteria]);

	// The model's stored recommendedScore is a separate estimate and must not
	// prefill the grade — it diverged from the rubric rule (e.g. 62 vs 86).

	const ready = row?.status === 'ready' ? row : null;
	const items = working ?? [];
	const visible = items.filter((f) => f.status !== 'rejected');
	const rejected = items.filter((f) => f.status === 'rejected');
	const markPreview: ReviewFinding[] = pendingMark
		? [
				{
					id: 'pending-mark',
					source: 'lecturer',
					severity: pendingMark.severity,
					quote: pendingMark.quote,
					note: '',
					evidence: '',
					status: 'manual',
				},
			]
		: [];
	const marked = [...visible, ...markPreview];
	const segments =
		content && marked.some((finding) => finding.quote) ? buildMarkedSegments(content, marked) : null;
	const preparing = Boolean(
		row?.status === 'pending' ||
			(!row && participant && (participant.status === 'submitted' || participant.status === 'late')),
	);
	const saved = row ? normalizeReviewFindings(parseReviewFindings(row.reviewFindings), criteria) : [];
	const dirty = working != null && JSON.stringify(items) !== JSON.stringify(saved);

	// Warn before navigating away (tab close / reload) with unsaved review edits,
	// so a draft grade or feedback is not silently lost.
	useEffect(() => {
		if (!dirty) return;
		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	}, [dirty]);
	const aiCount = visible.filter((f) => f.source === 'ai').length;
	const lecturerCount = visible.filter((f) => f.source === 'lecturer').length;

	// Live rubric recalculation — every non-rejected finding (pending AI
	// recommendations included) is reflected immediately so the panel stays
	// live while the lecturer reviews. The server republishes with the same
	// rule once no findings remain pending. Lecturer override and publish
	// state of this submission follow.
	const calc = calculateRubricScores(items, criteria, {
		includePending: true,
		wordCount: countWords(content),
	});
	// One provisional score: the live rubric total. Keep the untouched grade
	// field on that number so the headline, rubric total, and nilai akhir agree
	// until the lecturer edits the grade. Rejected findings are already excluded.
	useEffect(() => {
		if (loading || overrideTouched.current || working == null) return;
		const next = String(calc.total);
		setOverride((prev) => (prev === next ? prev : next));
	}, [loading, working, calc.total]);
	const overrideTrim = override.trim();
	const overrideNum = overrideTrim === '' ? null : Number(overrideTrim);
	const overrideValid =
		overrideNum != null && Number.isFinite(overrideNum) && overrideNum >= 0 && overrideNum <= 100;
	const finalScore = overrideValid && overrideNum != null ? Math.round(overrideNum) : calc.total;
	const adjustedByLecturer = overrideValid && overrideTouched.current;
	const pendingCount = items.filter((f) => f.status === 'pending').length;
	const published = row?.publishedAt ? row : null;
	// Displayed recommendation is the rubric total, not the model's stored estimate.
	const aiScore = calc.total;
	// Step 4 — surface a warning when the model's recommendedScore diverges
	// from the detail score computed from findings by more than 15 points.
	// The lecturer's explicit finalScore always wins; this never auto-averages.
	const recommendedScore = row?.recommendedScore ?? null;
	const divergence =
		recommendedScore != null && Math.abs(recommendedScore - calc.total) > 15
			? { recommendedScore, detailScore: calc.total }
			: null;
	// Step 6 — speaking pronunciation confidence (advisory only, never auto-penalizes).
	const confidence = useMemo(
		() => parseTranscriptConfidence(transcriptConfidence),
		[transcriptConfidence],
	);
	const transcriptStatusValue = transcriptStatus ?? '';
	const transcriptErrorValue = transcriptError ?? '';
	const ungradable = speakingTranscriptUnavailable(
		assignment.shape || '',
		transcriptStatusValue,
	);

	const updateFinding = (id: string, patch: Partial<ReviewFinding>) => {
		setNotice('');
		setSaveError('');
		setWorking((prev) => (prev ?? []).map((f) => (f.id === id ? { ...f, ...patch } : f)));
	};

	const startReject = (id: string) => {
		const current = (working ?? []).find((f) => f.id === id);
		setRejectingId(id);
		setRejectReason(current?.rejectReason || '');
		setRejectError('');
		setActiveFindingId(id);
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

	const removeFinding = (id: string) => {
		setNotice('');
		setSaveError('');
		setWorking((prev) => (prev ?? []).filter((f) => f.id !== id));
	};

	const startEdit = (finding: ReviewFinding) => {
		setEditingId(finding.id);
		setEditNote(finding.note);
		setEditSeverity(finding.severity);
		setManualError('');
	};

	const saveEdit = (finding: ReviewFinding) => {
		const note = editNote.trim();
		if (!note) {
			setManualError('Catatan temuan wajib diisi.');
			return;
		}
		updateFinding(finding.id, {
			note: note.slice(0, 600),
			severity: editSeverity,
			status: finding.source === 'ai' ? 'edited' : 'manual',
		});
		setEditingId(null);
	};

	const markSelection = (severity: EvalSeverity) => {
		const quote = selection.trim();
		if (!quote) {
			setManualError('Blok teks pada kiriman terlebih dahulu, lalu pilih kuning atau merah.');
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
		setNotice('');
		setSaveError('');
		setWorking((prev) => [
			...(prev ?? []),
			{
				id: `dosen-${Date.now()}`,
				source: 'lecturer',
				severity: pendingMark.severity,
				quote: pendingMark.quote,
				note: note.slice(0, 600),
				evidence: '',
				status: 'manual',
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

	const resetReview = () => {
		setWorking(
			saved.length > 0
				? saved
				: deriveAiReviewFindings(parseFindings(ready?.findings), criteria),
		);
		setEditingId(null);
		setNotice('');
		setSaveError('');
	};

	// Phase 4 — lets the lecturer (re)request an AI evaluation draft. For
	// speaking tasks this is how the draft is produced once the transcript
	// is ready; for written tasks it re-runs after the submission changed.
	const regenerate = async () => {
		if (!recordKey || !participant) return;
		setRegenerating(true);
		try {
			await fetch('/api/evaluation-draft', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${pb.authStore.token}`,
				},
				body: JSON.stringify(
					participant.channel === 'enrolled'
						? { submissionId: recordKey }
						: { publicSubmissionId: recordKey },
				),
			});
			await load();
		} catch {
			/* background convenience only — the note below stays */
		} finally {
			setRegenerating(false);
		}
	};

	const saveReview = async () => {
		if (!recordKey || !participant) return;
		setSaving(true);
		setSaveError('');
		setNotice('');
		try {
			const res = await fetch('/api/evaluation-review', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${pb.authStore.token}`,
				},
				body: JSON.stringify(
					participant.channel === 'enrolled'
						? { submissionId: recordKey, findings: items }
						: { publicSubmissionId: recordKey, findings: items },
				),
			});
			const data = (await res.json().catch(() => ({}))) as {
				message?: string;
				error?: string;
				omitted?: number;
			};
			if (!res.ok) {
				throw new Error(data.message || data.error || 'Gagal menyimpan tinjauan temuan.');
			}
			const omittedCount = typeof data.omitted === 'number' ? data.omitted : 0;
			setNotice(
				omittedCount > 0
					? `Tinjauan temuan tersimpan. ${omittedCount} temuan tidak disimpan karena catatan kosong atau kutipan tidak cocok dengan teks kiriman peserta — periksa kembali daftar temuan.`
					: 'Tinjauan temuan tersimpan.',
			);
			resyncFromSaved.current = true;
			await load();
		} catch (err) {
			setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan tinjauan temuan.');
		} finally {
			setSaving(false);
		}
	};

	// Explicit lecturer confirmation and publishing. The server recalculates
	// the score with the same rule shown here, applies the override when valid
	// (an untouched AI autofill is not flagged as a lecturer adjustment), and
	// writes the official grade + feedback.
	const publish = async () => {
		if (!recordKey || !participant) return;
		setPublishing(true);
		setPublishError('');
		setPublishNotice('');
		try {
			const res = await fetch('/api/evaluation-publish', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${pb.authStore.token}`,
				},
				body: JSON.stringify({
					...(participant.channel === 'enrolled'
						? { submissionId: recordKey }
						: { publicSubmissionId: recordKey }),
					findings: items,
					finalScore: overrideValid ? finalScore : null,
					scoreAdjusted: overrideTouched.current,
					note: publishNote,
				}),
			});
			const data = (await res.json().catch(() => ({}))) as {
				message?: string;
				error?: string;
				omitted?: number;
				divergence?: { recommendedScore: number; detailScore: number } | null;
			};
			if (!res.ok) {
				throw new Error(data.message || data.error || 'Gagal mempublikasikan penilaian.');
			}
			const omittedCount = typeof data.omitted === 'number' ? data.omitted : 0;
			const divergenceNote = data.divergence
				? ` Skor rekomendasi AI (${data.divergence.recommendedScore}) berbeda dari skor hitung (${data.divergence.detailScore}) — periksa bila perlu.`
				: '';
			setPublishNotice(
				`Penilaian dipublikasikan ke peserta. Nilai akhir ${finalScore}/100${letterGrade(finalScore) ? ` · ${letterGrade(finalScore)}` : ''}${adjustedByLecturer ? ' (disesuaikan dosen)' : ''}.${omittedCount > 0 ? ` ${omittedCount} temuan tidak valid tidak ikut dipublikasikan.` : ''}${divergenceNote}`,
			);
			setConfirmPublish(false);
			resyncFromSaved.current = true;
			await load();
			onPublished?.();
			onAdvance?.();
		} catch (err) {
			setPublishError(err instanceof Error ? err.message : 'Gagal mempublikasikan penilaian.');
		} finally {
			setPublishing(false);
		}
	};

	// Phase 4 — create / delete a human missed-error annotation (AI false
	// negative). Server-only writes through /api/evaluation-missed-error; the
	// record never affects the product score, grade, feedback, or publishing.
	const createMissedError = async (draft: MissedErrorDraft) => {
		if (!recordKey || !participant) return;
		const res = await fetch('/api/evaluation-missed-error', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${pb.authStore.token}`,
			},
			body: JSON.stringify({
				...(participant.channel === 'enrolled'
					? { submissionId: recordKey }
					: { publicSubmissionId: recordKey }),
				round: researchRound,
				quote: draft.quote,
				referenceCategory: draft.referenceCategory,
				referenceSubcategory: draft.referenceSubcategory,
				referenceSeverity: draft.referenceSeverity,
				referenceCorrection: draft.referenceCorrection,
				referenceExplanation: draft.referenceExplanation,
				reviewerNote: draft.reviewerNote,
			}),
		});
		const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
		if (!res.ok) {
			throw new Error(data.message || data.error || 'Gagal menyimpan kesalahan terlewat.');
		}
		await reloadResearchItems();
	};

	const deleteMissedError = async (id: string) => {
		if (!recordKey || !participant || researchRound === 0) throw new Error('Anotasi final tidak dapat dihapus.');
		const res = await fetch('/api/evaluation-missed-error', {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json',
				...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
			},
			body: JSON.stringify({ id, ...(recordKey ? (participant?.channel === 'enrolled' ? { submissionId: recordKey } : { publicSubmissionId: recordKey }) : {}), round: researchRound }),
		});
		const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
		if (!res.ok) {
			throw new Error(data.message || data.error || 'Gagal menghapus kesalahan terlewat.');
		}
		await reloadResearchItems();
	};

	const value: ReviewContextValue = {
		hasRecord: !!recordKey,
		content,
		assignmentShape: assignment.shape,
		cefrLevel: cefrLevel ?? null,
		transcriptStatus: transcriptStatusValue,
		transcriptError: transcriptErrorValue,
		ungradable,
		row,
		ready,
		preparing,
		items,
		visible,
		rejected,
		marked,
		segments,
		dirty,
		saving,
		notice,
		saveError,
		editingId,
		editNote,
		editSeverity,
		manualNote,
		manualError,
		selection,
		pendingMark,
		criteria,
		calc,
		override,
		overrideValid,
		finalScore,
		adjustedByLecturer,
		aiScore,
		divergence,
		confidence,
		pendingCount,
		activeFindingId,
		noteTick,
		published,
		publishNote,
		confirmPublish,
		publishing,
		publishError,
		publishNotice,
		regenerating,
		aiCount,
		lecturerCount,
		provenance: row ? parseProvenance(row as unknown as Record<string, unknown>) : null,
		missedErrors: researchItems.missedErrors,
		researchAnnotations: researchItems.annotations,
		researchAnnotationCount: Object.keys(researchItems.annotations).length,
		researchMode,
		setResearchMode,
		researchRound,
		researchRoundLocked,
		setResearchRound: (v) => {
			setResearchItems({ annotations: {}, missedErrors: [] });
			setResearchLoadError('');
			setResearchLoading(true);
			setResearchRound(v);
		},
		researchLoadError,
		researchLoading,
		createMissedError,
		deleteMissedError,
		setResearchAnnotation: (fingerprint, annotation) =>
			setResearchItems((prev) => ({
				...prev,
				annotations: { ...prev.annotations, [fingerprint]: annotation },
			})),
		captureSelection: (text) => setSelection((prev) => (prev === text ? prev : text)),
		setEditNote: (v) => setEditNote(v),
		setEditSeverity: (s) => setEditSeverity(s),
		setManualNote: (v) => {
			setManualNote(v);
			setManualError('');
		},
		setPublishNote: (v) => setPublishNote(v),
		changeOverride: (v) => {
			overrideTouched.current = true;
			setOverride(v);
			setPublishNotice('');
			setPublishError('');
		},
		clearOverride: () => {
			overrideTouched.current = true;
			setOverride('');
			setPublishNotice('');
			setPublishError('');
		},
		applyAiScore: () => {
			overrideTouched.current = false;
			setOverride(String(calc.total));
			setPublishNotice('');
			setPublishError('');
		},
		startEdit,
		saveEdit,
		cancelEdit: () => setEditingId(null),
		updateFinding,
		rejectingId,
		rejectReason,
		rejectError,
		setRejectReason: (value: string) => {
			setRejectReason(value);
			setRejectError('');
		},
		startReject,
		confirmReject,
		cancelReject,
		removeFinding,
		focusFinding: (id) => setActiveFindingId(id),
		focusNote: () => setNoteTick((n) => n + 1),
		markSelection,
		addManual,
		cancelSelection,
		resetReview,
		regenerate: () => void regenerate(),
		saveReview: () => void saveReview(),
		publish: () => void publish(),
		requestConfirmPublish: () => {
			setPublishNotice('');
			setPublishError('');
			setConfirmPublish(true);
		},
		cancelPublish: () => setConfirmPublish(false),
	};

	return <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>;
}

function RejectReasonFields({ id }: { id: string }) {
	const ctx = useReview();
	const fieldRef = useRef<HTMLTextAreaElement | null>(null);
	useEffect(() => {
		const field = fieldRef.current;
		if (!field) return;
		const focus = () => field.focus();
		focus();
		const timer = window.setTimeout(focus, 0);
		return () => window.clearTimeout(timer);
	}, [id]);
	if (!ctx) return null;
	const keepField = (event: SyntheticEvent) => {
		event.stopPropagation();
	};
	return (
		<span className="fer-reject-form" onMouseDown={keepField} onClick={keepField}>
			<strong>Alasan penolakan (wajib)</strong>
			<textarea
				ref={fieldRef}
				rows={2}
				maxLength={600}
				value={ctx.rejectReason}
				onChange={(e) => ctx.setRejectReason(e.target.value)}
				onMouseDown={keepField}
				onClick={keepField}
				onKeyDown={keepField}
				onKeyUp={keepField}
				placeholder="Mengapa temuan AI ini ditolak?"
				aria-label="Alasan penolakan temuan AI"
			/>
			{ctx.rejectError ? (
				<span className="form-error" role="alert">
					{ctx.rejectError}
				</span>
			) : null}
			<span className="aevr-mark-form-actions">
				<button
					type="button"
					className="ld-btn-primary"
					onMouseDown={(e) => {
						e.preventDefault();
						e.stopPropagation();
					}}
					onClick={(e) => {
						e.stopPropagation();
						ctx.confirmReject(id);
					}}
				>
					Tolak temuan
				</button>
				<button
					type="button"
					className="ld-outline-action sm"
					onMouseDown={(e) => {
						e.preventDefault();
						e.stopPropagation();
					}}
					onClick={(e) => {
						e.stopPropagation();
						ctx.cancelReject();
					}}
				>
					Batal
				</button>
			</span>
		</span>
	);
}

function RejectedFinding({ finding }: { finding: ReviewFinding }) {
	const ctx = useReview();
	if (!ctx) return null;
	return (
		<div className="aevr-rejected-item">
			<button type="button" onClick={() => ctx.updateFinding(finding.id, { status: 'pending', rejectReason: '' })}>
				Pulihkan: {finding.note.slice(0, 60)}
				{finding.note.length > 60 ? '…' : ''}
			</button>
			{finding.rejectReason ? (
				<span className="fer-reject-reason">Alasan: {finding.rejectReason}</span>
			) : null}
		</div>
	);
}

function AnswerScript({
	textRef,
	content,
	segments,
	marked,
	visibleCount,
	activeId,
	onFocus,
	onApprove,
	onRemove,
	checked,
}: {
	textRef: RefObject<HTMLDivElement | null>;
	content: string;
	segments: MarkedSegment[] | null;
	marked: ReviewFinding[];
	visibleCount: number;
	activeId: string | null;
	onFocus: (id: string | null) => void;
	onApprove: (id: string) => void;
	onReject: (id: string) => void;
	onRemove: (id: string) => void;
	/** True once an AI draft exists, so unmarked lines can be shown as checked-correct. */
	checked: boolean;
}) {
	const review = useReview();
	const rejectingId = review?.rejectingId ?? null;
	const startReject = review?.startReject ?? (() => {});
	const lines = content.split('\n');
	const supportsSpeakerLabels = review?.assignmentShape === 'speaking' || review?.assignmentShape === 'conversation';
	const speakerMode = supportsSpeakerLabels && lines.filter((line) => speakerOf(line)).length >= 2;
	// Visual line counts per hard-line row, so the gutter numbers one-per
	// rendered (wrapped) line stay aligned with the answer text — including
	// lines that wrap beyond the first. Marks are inline and never alter the
	// text, so plain and annotated views share the same numbering.
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
	}, [content, textRef]);

	const navIds: string[] = [];
	for (const finding of marked.slice(0, visibleCount)) {
		if (finding?.quote && !navIds.includes(finding.id)) navIds.push(finding.id);
	}
	let offset = 0;
	let lineNum = 0;
	return (
		<div className={`evx-script${speakerMode ? ' speakers' : ''}`} ref={textRef}>
			{lines.map((line, index) => {
				const start = offset;
				offset += line.length + 1;
				const speaker = speakerMode ? speakerOf(line) : null;
				const parts = segments
					? sliceSegments(segments, start, start + line.length)
					: [{ text: line }];
				const shown = speaker ? dropPrefix(parts, speaker.prefix) : parts;
				const tone = speaker ? speakerTone(speaker.name) : null;
				const count = rowCounts[index] || 1;
				const nums = Array.from({ length: count }, (_, k) => lineNum + 1 + k);
				lineNum += count;
				return (
					<div className="evx-line" key={index}>
						<span className="evx-ln">
							{nums.map((n, k) => (
								<span key={k} className="evx-ln-num">
									{n}
								</span>
							))}
						</span>
						{speakerMode &&
							(speaker ? (
								<span className="evx-spk" style={{ background: tone?.background, color: tone?.color }}>
									{speaker.name}
								</span>
							) : (
								<span className="evx-spk empty" />
							))}
						<span className="evx-line-text">
							{shown.map((part, partIndex) => {
								if (!part.text) return null;
								if (!part.severity || part.findingIndex == null) {
									if (checked && part.text.trim()) {
									return (
										<mark key={partIndex} className="aev-mark ok" title="Frasa sudah dicek dan benar">
											{part.text}
											<span className="sr-only">Frasa sudah dicek dan benar</span>
										</mark>
									);
								}
								return <span key={partIndex}>{part.text}</span>;
								}
								const finding = marked[part.findingIndex];
								const pending = part.findingIndex >= visibleCount;
								const focused = !!finding && finding.id === activeId;
								const navIndex = finding ? navIds.indexOf(finding.id) : -1;
								return (
									<mark
										key={partIndex}
										className={`aev-mark ${part.severity}${pending ? ' pending' : ''}${focused ? ' focused' : ''}${finding && rejectingId === finding.id ? ' rejecting' : ''}`}
										onMouseDown={(event) => {
											const target = event.target as HTMLElement;
											if (target.closest('textarea, input, select')) return;
											if (event.button === 0) event.preventDefault();
										}}
										onClick={(event) => {
											if ((event.target as HTMLElement).closest('.aev-mark-pop')) return;
											if (!finding || pending) return;
											onFocus(focused ? null : finding.id);
										}}
									>
										{part.text}
										{finding && !pending && (
											<span className="aev-mark-pop" role="tooltip">
												<span className="aev-mark-pop-head">
													<span className="aev-chip">{SEVERITY_LABEL[finding.severity]}</span>
													<span className={`aevr-src ${finding.source}`}>
														{finding.source === 'ai' ? 'AI' : 'Dosen'}
													</span>
												</span>
												<span className="aev-mark-pop-note">{finding.note}</span>
												{navIds.length > 1 && navIndex >= 0 && (
													<span className="aev-mark-pop-nav">
														<button
															type="button"
															disabled={navIndex <= 0}
															onMouseDown={(e) => e.preventDefault()}
															onClick={(e) => {
																e.stopPropagation();
																const id = navIds[navIndex - 1];
																if (id) onFocus(id);
															}}
														>
															<ChevronLeft size={12} /> Sebelumnya
														</button>
														<span>
															{navIndex + 1}/{navIds.length}
														</span>
														<button
															type="button"
															disabled={navIndex >= navIds.length - 1}
															onMouseDown={(e) => e.preventDefault()}
															onClick={(e) => {
																e.stopPropagation();
																const id = navIds[navIndex + 1];
																if (id) onFocus(id);
															}}
														>
															Berikutnya <ChevronRight size={12} />
														</button>
													</span>
												)}
												{finding.source === 'ai' && rejectingId === finding.id ? (
													<RejectReasonFields id={finding.id} />
												) : (
												<span className="aev-mark-pop-actions">
													{finding.source === 'ai' && finding.status !== 'approved' && (
														<button type="button" className="approve" onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); onApprove(finding.id); }}>
															<Check size={12} /> Setujui
														</button>
													)}
													{finding.source === 'ai' ? (
														<button type="button" className="reject" onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); startReject(finding.id); }}>
															<X size={12} /> Tolak
														</button>
													) : (
														<button type="button" className="delete" onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); onRemove(finding.id); }}>
															<X size={12} /> Hapus
														</button>
													)}
												</span>
												)}
											</span>
										)}
									</mark>
								);
							})}
							{shown.every((part) => !part.text) ? '\u00a0' : null}
						</span>
					</div>
				);
			})}
		</div>
	);
}

function dropPrefix(parts: MarkedSegment[], prefix: number) {
	let left = prefix;
	const out: MarkedSegment[] = [];
	for (const part of parts) {
		if (left <= 0) {
			out.push(part);
			continue;
		}
		if (part.text.length <= left) {
			left -= part.text.length;
			continue;
		}
		out.push({ ...part, text: part.text.slice(left) });
		left = 0;
	}
	return out;
}

/** Compact summary of AI findings that have no on-text quote, shown directly
 *  under the answer so the lecturer can approve/reject them without leaving
 *  the answer view — mirrors the formative practice review. */
function UnanchoredFindings() {
	const ctx = useReview();
	const [open, setOpen] = useState<EvalSeverity | null>(null);
	if (!ctx) return null;
	const unanchored = ctx.visible.filter((f) => f.source === 'ai' && !f.quote);
	if (unanchored.length === 0) return null;
	const minors = unanchored.filter((f) => f.severity === 'minor');
	const majors = unanchored.filter((f) => f.severity === 'major');
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
						<AlertCircle size={14} /> {majors.length} perlu perbaikan
					</button>
				)}
			</div>
			{open && shown.length > 0 && (
				<ul className="fer-pill-list" aria-label={open === 'minor' ? 'Daftar saran' : 'Daftar yang perlu diperbaiki'}>
					{shown.map((f) => (
						<li key={f.id}>
							<p>{f.note}</p>
							{ctx.rejectingId === f.id ? (
								<RejectReasonFields id={f.id} />
							) : (
							<div className="aevr-item-actions">
								{f.status !== 'approved' && (
									<button type="button" className="approve" onClick={() => ctx.updateFinding(f.id, { status: 'approved', rejectReason: '' })}>
										<CheckCircle2 size={12} /> Setujui
									</button>
								)}
								{f.status === 'approved' && <span className="asg-tag status-published">Disetujui</span>}
								{f.status !== 'rejected' && (
									<button type="button" onClick={() => ctx.startReject(f.id)}>
										<X size={12} /> Tolak
									</button>
								)}
							</div>
							)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

/**
 * Distinguishes a completed AI run (with or without findings) from a run that
 * never started, is still pending, or failed. Does not change grades.
 */
function DraftRunStatus() {
	const ctx = useReview();
	if (!ctx || !ctx.hasRecord) return null;
	const when = ctx.row?.generatedAt ? stamp(ctx.row.generatedAt) : '';

	if (!ctx.row) {
		return (
			<div className="aev-draft-status">
				<p className="aev-note failed" role="status">
					<Info size={13} />{' '}
					{ctx.preparing
						? 'Evaluasi AI belum tercatat untuk kiriman ini. Permintaan draf sedang dikirim dan tidak mengubah nilai resmi.'
						: 'Evaluasi AI belum dijalankan untuk kiriman ini. Pengumpulan tetap tersimpan; meminta draf tidak mengubah nilai resmi.'}
				</p>
				<button type="button" className="ld-outline-action sm" onClick={ctx.regenerate} disabled={ctx.regenerating}>
					{ctx.regenerating ? <LoaderCircle size={13} className="spin" /> : <Sparkles size={13} />} Minta draf AI
				</button>
			</div>
		);
	}
	if (ctx.row.status === 'pending' || ctx.preparing) {
		return (
			<p className="aev-note pending" aria-live="polite">
				<LoaderCircle className="spin" size={13} /> Menyiapkan draf evaluasi AI
				{ctx.row.created ? ` (dimulai ${stamp(ctx.row.created)})` : ''}. Temuan muncul otomatis
				beberapa saat lagi. Nilai resmi tidak berubah.
			</p>
		);
	}
	if (ctx.row.status === 'failed') {
		return (
			<div className="aev-draft-status">
				<p className="aev-note failed" role="alert">
					<AlertTriangle size={13} /> Draf AI gagal{when ? ` pada ${when}` : ''}. {ctx.row.reason}
				</p>
				<button type="button" className="ld-outline-action sm" onClick={ctx.regenerate} disabled={ctx.regenerating}>
					{ctx.regenerating ? <LoaderCircle size={13} className="spin" /> : <RotateCcw size={13} />} Minta draf AI
				</button>
			</div>
		);
	}
	if (
		ctx.row.status === 'ready' &&
		(ctx.ready?.result === 'insufficient' || parseFindings(ctx.ready?.findings).length === 0)
	) {
		return (
			<div className="aev-draft-status">
				<button type="button" className="ld-outline-action sm" onClick={ctx.regenerate} disabled={ctx.regenerating}>
					{ctx.regenerating ? <LoaderCircle size={13} className="spin" /> : <RotateCcw size={13} />} Minta draf AI ulang
				</button>
			</div>
		);
	}
	return null;
}

/** A single labeled select for one research-annotation judgment. */
function AnnotationSelect<T extends string>({
	label,
	value,
	options,
	labels,
	onChange,
}: {
	label: string;
	value: T | '';
	options: readonly T[];
	labels: Record<T, string>;
	onChange: (value: T | '') => void;
}) {
	return (
		<label className="aevr-ra-field">
			<span>{label}</span>
			<select value={value} onChange={(e) => onChange(e.target.value as T | '')}>
				<option value="">— pilih —</option>
				{options.map((opt) => (
					<option key={opt} value={opt}>
						{labels[opt]}
					</option>
				))}
			</select>
		</label>
	);
}

/**
 * Phase 3 — collapsible lecturer research annotation for one AI-generated
 * finding. Records an expert evaluation of the AI's output (error existence,
 * detection/correction/explanation judgments, completeness, necessity,
 * pedagogical appropriateness, and a human reference classification) plus a
 * reviewer note.
 *
 * This is strictly additional metadata: it never changes the AI's original
 * finding, never changes the official grade or feedback, is never visible to
 * students, and saves independently of publishing. The normal
 * approve/reject/edit workflow above it is untouched.
 */
function ResearchAnnotationSection({
	fingerprint,
	evaluationId,
	submissionId,
	publicSubmissionId,
	annotation,
	onSaved,
}: {
	fingerprint: string;
	evaluationId: string;
	submissionId: string;
	publicSubmissionId: string;
	annotation: ResearchAnnotation;
	onSaved: (a: ResearchAnnotation) => void;
}) {
	const ctx = useReview();
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<ResearchAnnotation>(annotation);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	// Phase 10.4 — explicit annotation role. The reviewer selects Rater 1,
	// Rater 2, or Adjudicator before saving. The server enforces independent-
	// rater identity; the UI selector is a convenience, not the guard.
	const round = ctx?.researchRound ?? 1;

	// Resync the local draft when the loaded annotation lands or changes.
	useEffect(() => {
		setDraft(annotation);
	}, [annotation.id, annotation.reviewedAt]);

	const dirty = JSON.stringify(draft) !== JSON.stringify(annotation);
	const started = annotationIsStarted(draft);
	const submitted = !!annotation.reviewedAt;

	const update = <K extends keyof ResearchAnnotation>(key: K, value: ResearchAnnotation[K]) => {
		setDraft((prev) => ({ ...prev, [key]: value }));
		setError('');
		setNotice('');
	};

	const save = async () => {
		if (!ctx || ctx.researchLoading || ctx.researchLoadError || submitted) return;
		setSaving(true);
		setError('');
		setNotice('');
		try {
			const res = await fetch('/api/evaluation-annotation', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({
					...(submissionId ? { submissionId } : { publicSubmissionId }),
					findingFingerprint: fingerprint,
					round,
					errorPresent: draft.errorPresent,
					detectionJudgment: draft.detectionJudgment,
					correctionJudgment: draft.correctionJudgment,
					explanationJudgment: draft.explanationJudgment,
					completenessJudgment: draft.completenessJudgment,
					necessityJudgment: draft.necessityJudgment,
					pedagogicalJudgment: draft.pedagogicalJudgment,
					referenceCategory: draft.referenceCategory,
					referenceSubcategory: draft.referenceSubcategory,
					referenceSeverity: draft.referenceSeverity,
					referenceCorrection: draft.referenceCorrection,
					referenceExplanation: draft.referenceExplanation,
					reviewerNote: draft.reviewerNote,
				}),
			});
			const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
			if (!res.ok) {
				setError(data.message || data.error || 'Gagal menyimpan anotasi riset.');
				return;
			}
			setNotice(
				round === 0
					? 'Adjudikasi tersimpan — keputusan final, tidak mengubah penilaian Rater 1/Rater 2.'
					: `Anotasi tersimpan sebagai ${round === 1 ? 'Rater 1' : 'Rater 2'} — tidak mengubah keluaran AI atau nilai.`,
			);
			onSaved({ ...draft, reviewedAt: new Date().toISOString() });
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Gagal menyimpan anotasi riset.');
		} finally {
			setSaving(false);
		}
	};

	const subcats = referenceSubcategories(draft.referenceCategory);

	return (
		<div className="aevr-research">
			<button
				type="button"
				className="aevr-research-toggle"
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
			>
				<FlaskConical size={13} />
				<span className="aevr-research-title">Anotasi riset</span>
				<span className="aevr-research-badge">Research annotation</span>
				<span className="aevr-research-private">Tidak terlihat mahasiswa</span>
				{started && <span className="aevr-research-dot" aria-hidden="true" />}
				<ChevronDown size={14} className={open ? 'open' : ''} />
			</button>
			{open && (
				<div className="aevr-research-body">
					<p className="aevr-research-intro">
						Evaluasi ahli atas keluaran AI — bukan keluaran AI itu sendiri. Metadata tambahan
						yang tidak mengubah temuan AI, nilai resmi, atau umpan balik mahasiswa, dan
						tersimpan terpisah dari publikasi.
					</p>
					<div className="aevr-role-select" role="group" aria-label="Peran anotasi riset">
						<span className="aevr-role-label">Peran peninjau</span>
						<div className="aevr-role-toggle">
							<button
								type="button"
								className={round === 1 ? 'active' : ''}
								aria-pressed={round === 1}
								disabled={!!ctx?.researchRoundLocked || !!ctx?.researchLoading}
								onClick={() => ctx?.setResearchRound(1)}
							>
								Rater 1
							</button>
							<button
								type="button"
								className={round === 2 ? 'active' : ''}
								aria-pressed={round === 2}
								disabled={!!ctx?.researchRoundLocked || !!ctx?.researchLoading}
								onClick={() => ctx?.setResearchRound(2)}
							>
								Rater 2
							</button>
							<button
								type="button"
								className={`adj${round === 0 ? ' active' : ''}`}
								aria-pressed={round === 0}
								disabled={!!ctx?.researchRoundLocked || !!ctx?.researchLoading}
								onClick={() => ctx?.setResearchRound(0)}
							>
								Adjudicator
							</button>
						</div>
						<p className="aevr-role-hint">
							{round === 0
								? 'Adjudikasi adalah keputusan final — tidak boleh sama dengan Rater 1 atau Rater 2.'
								: `Penilaian ${round === 1 ? 'Rater 1' : 'Rater 2'} independen — tidak boleh sama dengan rater lain pada temuan ini.`}
						</p>
					</div>
					{ctx?.researchLoading && <p role="status">Memuat penilaian blind…</p>}
					{ctx?.researchLoadError && <p className="form-error" role="alert">Pemuatan rater gagal: {ctx.researchLoadError}</p>}
					{submitted && <p role="status">Penilaian ronde ini sudah dikirim dan bersifat immutable.</p>}
					<fieldset disabled={!ctx || ctx.researchLoading || !!ctx.researchLoadError || submitted || ctx.researchRoundLocked}>
					<div className="aevr-ra-grid">
						<AnnotationSelect
							label="1. Keberadaan kesalahan"
							value={draft.errorPresent}
							options={ERROR_PRESENT_OPTIONS}
							labels={ERROR_PRESENT_LABEL}
							onChange={(v) => update('errorPresent', v)}
						/>
						<AnnotationSelect
							label="2. Deteksi AI"
							value={draft.detectionJudgment}
							options={DETECTION_JUDGMENT_OPTIONS}
							labels={DETECTION_JUDGMENT_LABEL}
							onChange={(v) => update('detectionJudgment', v)}
						/>
						<AnnotationSelect
							label="3. Koreksi AI"
							value={draft.correctionJudgment}
							options={CORRECTION_JUDGMENT_OPTIONS}
							labels={CORRECTION_JUDGMENT_LABEL}
							onChange={(v) => update('correctionJudgment', v)}
						/>
						<AnnotationSelect
							label="4. Penjelasan AI"
							value={draft.explanationJudgment}
							options={EXPLANATION_JUDGMENT_OPTIONS}
							labels={EXPLANATION_JUDGMENT_LABEL}
							onChange={(v) => update('explanationJudgment', v)}
						/>
						<AnnotationSelect
							label="5. Kelengkapan"
							value={draft.completenessJudgment}
							options={COMPLETENESS_JUDGMENT_OPTIONS}
							labels={COMPLETENESS_JUDGMENT_LABEL}
							onChange={(v) => update('completenessJudgment', v)}
						/>
						<AnnotationSelect
							label="6. Kepentingan"
							value={draft.necessityJudgment}
							options={NECESSITY_JUDGMENT_OPTIONS}
							labels={NECESSITY_JUDGMENT_LABEL}
							onChange={(v) => update('necessityJudgment', v)}
						/>
						<AnnotationSelect
							label="7. Kelayakan pedagogis"
							value={draft.pedagogicalJudgment}
							options={PEDAGOGICAL_JUDGMENT_OPTIONS}
							labels={PEDAGOGICAL_JUDGMENT_LABEL}
							onChange={(v) => update('pedagogicalJudgment', v)}
						/>
					</div>
					<div className="aevr-ra-ref">
						<span className="aevr-ra-ref-label">
							8–10. Klasifikasi referensi ahli (taksonomi Phase 2)
						</span>
						<div className="aevr-ra-ref-row">
							<label className="aevr-ra-field">
								<span>Kategori</span>
								<select
									value={draft.referenceCategory}
									onChange={(e) => {
										update('referenceCategory', e.target.value);
										update('referenceSubcategory', '');
									}}
								>
									<option value="">— pilih —</option>
									{REFERENCE_CATEGORIES.map((cat) => (
										<option key={cat} value={cat}>
											{cat}
										</option>
									))}
								</select>
							</label>
							<label className="aevr-ra-field">
								<span>Subkategori</span>
								<select
									value={draft.referenceSubcategory}
									onChange={(e) => update('referenceSubcategory', e.target.value)}
									disabled={subcats.length === 0}
								>
									<option value="">— pilih —</option>
									{subcats.map((sub) => (
										<option key={sub} value={sub}>
											{sub}
										</option>
									))}
								</select>
							</label>
							<AnnotationSelect
								label="Tingkat keparahan"
								value={draft.referenceSeverity}
								options={REFERENCE_SEVERITY_OPTIONS}
								labels={REFERENCE_SEVERITY_LABEL}
								onChange={(v) => update('referenceSeverity', v)}
							/>
						</div>
						<label className="aevr-ra-field">
							<span>11. Koreksi referensi</span>
							<textarea
								rows={2}
								maxLength={2000}
								value={draft.referenceCorrection}
								onChange={(e) => update('referenceCorrection', e.target.value)}
								placeholder="Koreksi yang benar menurut ahli…"
							/>
						</label>
						<label className="aevr-ra-field">
							<span>12. Penjelasan referensi</span>
							<textarea
								rows={2}
								maxLength={2000}
								value={draft.referenceExplanation}
								onChange={(e) => update('referenceExplanation', e.target.value)}
								placeholder="Alasan ahli untuk klasifikasi ini…"
							/>
						</label>
					</div>
					<label className="aevr-ra-field">
						<span>13. Catatan peninjau</span>
						<textarea
							rows={2}
							maxLength={2000}
							value={draft.reviewerNote}
							onChange={(e) => update('reviewerNote', e.target.value)}
							placeholder="Catatan internal peninjau untuk anotasi ini…"
						/>
					</label>
					<div className="aevr-ra-actions">
						<button
							type="button"
							className="ld-outline-action sm"
							disabled={saving || !dirty}
							onClick={() => void save()}
						>
							{saving ? <LoaderCircle size={13} className="spin" /> : <CheckCircle2 size={13} />} Simpan anotasi
						</button>
						{dirty && (
							<button
								type="button"
								className="ld-text-btn"
								disabled={saving}
								onClick={() => {
									setDraft(annotation);
									setError('');
									setNotice('');
								}}
							>
								Buang perubahan
							</button>
						)}
					</div>
					{error && (
						<p className="form-error" role="alert">
							{error}
						</p>
					)}
					{notice && (
						<p className="eval-saved" role="status">
							<CheckCircle2 size={13} /> {notice}
						</p>
					)}
					</fieldset>
				</div>
			)}
		</div>
	);
}

/**
 * Full findings list under the annotated answer. Opening a row is manual —
 * selecting a mark never expands this list or moves the viewport.
 */
function FindingsUnderText() {
	const ctx = useReview();
	const t = useT();
	const [openId, setOpenId] = useState<string | null>(null);
	const [listOpen, setListOpen] = useState(false);
	if (!ctx || !ctx.hasRecord) return null;
	const { criteria } = ctx;
	const annotations = ctx.researchAnnotations;
	const evaluationId = ctx.row?.id ?? '';
	const originalFindings = ctx.ready ? parseFindings(ctx.ready.findings) : [];
	const submissionId = ctx.row?.submission ?? '';
	const publicSubmissionId = ctx.row?.publicSubmission ?? '';
	const words = ctx.content.trim() ? ctx.content.trim().split(/\s+/).length : 0;
	const anchored = ctx.visible.filter((f) => f.quote);
	return (
		<section className="evx-block aev-temuan" aria-label="Temuan">
			<footer className="evx-script-foot aev-temuan-count">
				<span>{t('aevr.wordsCount', { count: String(words) })}</span>
				<span className="evx-ann">
					{anchored.length} anotasi
					<i className="minor">{anchored.filter((f) => f.severity === 'minor').length}</i>
					<i className="major">{anchored.filter((f) => f.severity === 'major').length}</i>
				</span>
			</footer>
			<button
				type="button"
				className="aev-temuan-toggle"
				aria-expanded={listOpen}
				onClick={() => setListOpen((open) => !open)}
			>
				<h4>{t('aevr.findingsHeading')}</h4>
				<span>
					AI {ctx.aiCount} · Dosen {ctx.lecturerCount}
					{ctx.rejected.length > 0 ? ` · Ditolak ${ctx.rejected.length}` : ''}
				</span>
				<ChevronDown size={14} className={listOpen ? 'open' : ''} />
			</button>
			{listOpen && <div className="aev-findings evx-finding-list">
				{ctx.visible.length === 0 ? (
					<p className="asg-empty-line">{t('aevr.findingsEmpty')}</p>
				) : (
					<ul>
						{ctx.visible.map((finding) => {
							const open = openId === finding.id;
							const aiIndex =
								finding.source === 'ai' && finding.id.startsWith('ai-')
									? Number(finding.id.slice(3))
									: -1;
							const original = aiIndex >= 0 ? originalFindings[aiIndex] : null;
							const fingerprint = original ? findingFingerprint(original) : '';
							return (
								<li key={finding.id} className={finding.severity}>
									<button type="button" className="evx-f-toggle" onClick={() => setOpenId(open ? null : finding.id)}>
										<span className="aev-chip">{SEVERITY_LABEL[finding.severity]}</span>
										<span className={`aevr-src ${finding.source}`}>{finding.source === 'ai' ? 'AI' : 'Dosen'}</span>
										<span className="evx-f-note">{finding.note}</span>
										<ChevronDown size={14} className={open ? 'open' : ''} />
									</button>
									{open && (
										<div className="evx-f-body">
											<div className="aevr-item-head">
												<span className={`aevr-status ${finding.status}`}>{REVIEW_STATUS_LABEL[finding.status]}</span>
											</div>
											{finding.quote && <blockquote>{finding.quote}</blockquote>}
											{ctx.editingId === finding.id ? (
												<div className="aevr-edit">
													<SeverityToggle value={ctx.editSeverity} onChange={ctx.setEditSeverity} />
													<textarea rows={3} maxLength={600} value={ctx.editNote} onChange={(e) => ctx.setEditNote(e.target.value)} />
													{ctx.manualError && <p className="form-error" role="alert">{ctx.manualError}</p>}
													<div className="aevr-mark-form-actions">
														<button type="button" className="ld-btn-primary" onClick={() => ctx.saveEdit(finding)}>{t('aevr.saveChanges')}</button>
														<button type="button" className="ld-outline-action sm" onClick={ctx.cancelEdit}>{t('aevr.cancel')}</button>
													</div>
												</div>
											) : (
												<p>{finding.note}</p>
											)}
											{finding.evidence && <small>Bukti: {finding.evidence}</small>}
										{finding.source === 'ai' &&
											(finding.category ||
												finding.correction ||
												finding.explanation ||
												finding.errorDescription ||
												finding.anchorValid === false ||
												finding.anchorAmbiguous) && (
												<div className="aevr-gfl">
													{finding.category && (
														<span className="aevr-gfl-tax">
															{finding.category}
															{finding.subcategory ? ` · ${finding.subcategory}` : ''}
														</span>
													)}
													{finding.errorDescription && (
														<p>
															<strong>{t('aevr.errorLabel')}</strong> {finding.errorDescription}
														</p>
													)}
													{finding.correction && (
														<p>
															<strong>{t('aevr.correctionLabel')}</strong> {finding.correction}
														</p>
													)}
													{finding.explanation && (
														<p>
															<strong>{t('aevr.explanationLabel')}</strong> {finding.explanation}
														</p>
													)}
													{typeof finding.confidence === 'number' && (
														<small>{t('aevr.aiConfidence')} {Math.round(finding.confidence * 100)}%</small>
													)}
													{finding.anchorValid === false && (
														<small className="aevr-gfl-anchor">
															Kutipan tidak ditemukan persis di teks — jangkar tidak valid.
														</small>
													)}
													{finding.anchorAmbiguous && (
														<small className="aevr-gfl-anchor">
															Kutipan muncul beberapa kali — jangkar ambigu.
														</small>
													)}
													<small className="aevr-gfl-note">
														Klasifikasi AI — bukan kebenaran ahli.
													</small>
												</div>
											)}
											{criteria.length > 0 && (
												<label className="aevr-crit">
													Kriteria rubrik
													<select
														value={finding.criterion || ''}
														onChange={(e) => ctx.updateFinding(finding.id, { criterion: e.target.value })}
														aria-label={`Kriteria rubrik untuk temuan ${finding.id}`}
													>
														<option value="">umum (tanpa kriteria)</option>
														{criteria.map((c) => (
															<option key={c.id} value={c.id}>{c.label}</option>
														))}
													</select>
												</label>
											)}
											{ctx.rejectingId === finding.id ? (
												<RejectReasonFields id={finding.id} />
											) : ctx.editingId !== finding.id && (
												<div className="aevr-item-actions">
													{finding.source === 'ai' && finding.status !== 'approved' && (
														<button type="button" className="approve" onClick={() => ctx.updateFinding(finding.id, { status: 'approved', rejectReason: '' })}>
															<CheckCircle2 size={12} /> Setujui
														</button>
													)}
													<button type="button" onClick={() => ctx.startEdit(finding)}>Edit catatan</button>
													{finding.source === 'ai' ? (
														<button type="button" onClick={() => ctx.startReject(finding.id)}>Tolak</button>
													) : (
														<button type="button" onClick={() => ctx.removeFinding(finding.id)}>Hapus</button>
													)}
												</div>
											)}
											{finding.source === 'ai' && original && fingerprint && ctx.researchMode && (
												<ResearchAnnotationSection
													fingerprint={fingerprint}
													evaluationId={evaluationId}
													submissionId={submissionId}
													publicSubmissionId={publicSubmissionId}
													annotation={annotations[fingerprint] ?? EMPTY_ANNOTATION}
													onSaved={(a) => ctx.setResearchAnnotation(fingerprint, a)}
												/>
											)}
										</div>
									)}
								</li>
							);
						})}
					</ul>
				)}
				{ctx.rejected.length > 0 && (
					<div className="aevr-rejected">
						<span>{t('aevr.rejectedParen', { count: String(ctx.rejected.length) })}</span>
						{ctx.rejected.map((finding) => (
							<RejectedFinding key={finding.id} finding={finding} />
						))}
					</div>
				)}
			</div>}
		</section>
	);
}

/**
 * Phase 4 — lecturer-only section for human-annotated missed errors (AI false
 * negatives). The lecturer selects an exact substring of the student's text
 * (or marks a genuinely global issue), then records the reference taxonomy,
 * severity, correction, explanation, and a reviewer note. Each record is stored
 * separately in `ai_feedback_items` with `origin = 'human'` — it is never an
 * AI finding, never affects the product score, and never publishes to
 * students. It exists solely to measure AI recall.
 */
function MissedErrorsSection() {
	const ctx = useReview();
	const t = useT();
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<MissedErrorDraft>(EMPTY_MISSED_ERROR_DRAFT);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');

	if (!ctx || !ctx.hasRecord) return null;

	const startWithSelection = () => {
		setDraft({ ...EMPTY_MISSED_ERROR_DRAFT, quote: ctx.selection });
		setError('');
		setNotice('');
		setOpen(true);
	};
	const startGlobal = () => {
		setDraft({ ...EMPTY_MISSED_ERROR_DRAFT, quote: '' });
		setError('');
		setNotice('');
		setOpen(true);
	};

	const update = <K extends keyof MissedErrorDraft>(key: K, value: MissedErrorDraft[K]) => {
		setDraft((prev) => ({ ...prev, [key]: value }));
		setError('');
		setNotice('');
	};

	const subcats = referenceSubcategories(draft.referenceCategory);

	const save = async () => {
		if (!draft.referenceCategory) {
			setError(t('aevr.errCategory'));
			return;
		}
		if (!draft.referenceSeverity) {
			setError(t('aevr.errSeverity'));
			return;
		}
		setSaving(true);
		setError('');
		try {
			await ctx.createMissedError(draft);
			setNotice(t('aevr.missedSaved'));
			setOpen(false);
		setDraft(EMPTY_MISSED_ERROR_DRAFT);
		} catch (err) {
			setError(err instanceof Error ? err.message : t('aevr.missedSaveError'));
		} finally {
			setSaving(false);
		}
	};

	const remove = async (id: string) => {
		try {
			await ctx.deleteMissedError(id);
			setNotice(t('aevr.missedDeleted'));
		} catch (err) {
			setError(err instanceof Error ? err.message : t('aevr.missedDeleteError'));
		}
	};

	return (
		<section className="aevr-missed" aria-label="Kesalahan yang tidak terdeteksi AI">
			<header className="aevr-missed-head">
				<h4>
					<EyeOff size={14} /> {t('aevr.missedErrors')}
				</h4>
				<span className="aevr-missed-badge">{t('aevr.missedBadge')}</span>
			</header>
			<p className="aevr-missed-intro">
				Tandai kesalahan nyata yang <em>tidak</em> ditemukan oleh draf AI — untuk mengukur
				recall AI. Pilih teks pada jawaban peserta lalu klik tombol di bawah. Catatan ini
				terpisah dari penilaian dan tidak mengubah nilai resmi.
			</p>
			{!open ? (
				<div className="aevr-missed-actions">
					<button type="button" className="ld-outline-action sm" onClick={startWithSelection}>
						<EyeOff size={13} /> {t('aevr.markMissed')}
					</button>
					<button type="button" className="ld-text-btn" onClick={startGlobal}>
						{t('aevr.globalError')}
					</button>
				</div>
			) : (
				<div className="aevr-missed-form">
					{draft.quote ? (
						<blockquote className="aevr-missed-quote">{draft.quote}</blockquote>
					) : (
						<p className="aevr-missed-global">{t('aevr.globalErrorDesc')}</p>
					)}
					<div className="aevr-ra-ref-row">
						<label className="aevr-ra-field">
							<span>{t('aevr.referenceCategory')}</span>
							<select
								value={draft.referenceCategory}
								onChange={(e) => {
									update('referenceCategory', e.target.value);
									update('referenceSubcategory', '');
								}}
							>
								<option value="">— pilih —</option>
								{REFERENCE_CATEGORIES.map((cat) => (
									<option key={cat} value={cat}>{cat}</option>
								))}
							</select>
						</label>
						<label className="aevr-ra-field">
							<span>Subkategori</span>
							<select
								value={draft.referenceSubcategory}
								onChange={(e) => update('referenceSubcategory', e.target.value)}
								disabled={subcats.length === 0}
							>
								<option value="">— pilih —</option>
								{subcats.map((sub) => (
									<option key={sub} value={sub}>{sub}</option>
								))}
							</select>
						</label>
						<label className="aevr-ra-field">
							<span>{t('aevr.severity')}</span>
							<select
								value={draft.referenceSeverity}
								onChange={(e) => update('referenceSeverity', e.target.value as ReferenceSeverity | '')}
							>
								<option value="">— pilih —</option>
								{REFERENCE_SEVERITY_OPTIONS.map((opt) => (
									<option key={opt} value={opt}>{REFERENCE_SEVERITY_LABEL[opt]}</option>
								))}
							</select>
						</label>
					</div>
					<label className="aevr-ra-field">
						<span>{t('aevr.correctForm')}</span>
						<textarea
							rows={2}
							maxLength={2000}
							value={draft.referenceCorrection}
							onChange={(e) => update('referenceCorrection', e.target.value)}
							placeholder="Bentuk yang benar menurut ahli…"
						/>
					</label>
					<label className="aevr-ra-field">
						<span>{t('aevr.explanationRef')}</span>
						<textarea
							rows={2}
							maxLength={4000}
							value={draft.referenceExplanation}
							onChange={(e) => update('referenceExplanation', e.target.value)}
							placeholder="Alasan ahli untuk klasifikasi ini…"
						/>
					</label>
					<label className="aevr-ra-field">
						<span>{t('aevr.reviewerNote')}</span>
						<textarea
							rows={2}
							maxLength={4000}
							value={draft.reviewerNote}
							onChange={(e) => update('reviewerNote', e.target.value)}
							placeholder="Catatan internal peninjau…"
						/>
					</label>
					<div className="aevr-ra-actions">
						<button type="button" className="ld-btn-primary" disabled={saving} onClick={() => void save()}>
							{saving ? <LoaderCircle size={13} className="spin" /> : <CheckCircle2 size={13} />} {t('aevr.saveMissed')}
						</button>
						<button type="button" className="ld-text-btn" disabled={saving} onClick={() => setOpen(false)}>Batal</button>
					</div>
				</div>
			)}
			{error && <p className="form-error" role="alert">{error}</p>}
			{notice && <p className="eval-saved" role="status"><CheckCircle2 size={13} /> {notice}</p>}
			{ctx.missedErrors.length > 0 && (
				<ul className="aevr-missed-list" aria-label="Daftar kesalahan terlewat">
					{ctx.missedErrors.map((item) => (
						<li key={item.id} className={`aevr-missed-item ${item.referenceSeverity || 'minor'}`}>
							<div className="aevr-missed-item-head">
								<span className="aevr-missed-chip">{item.referenceSeverity ? REFERENCE_SEVERITY_LABEL[item.referenceSeverity] : '—'}</span>
								<span className="aevr-missed-tax">{item.referenceCategory}{item.referenceSubcategory ? ` · ${item.referenceSubcategory}` : ''}</span>
								<button type="button" className="ld-text-btn danger" onClick={() => void remove(item.id)} aria-label={t('aevr.deleteMissedAria')}>
									<Trash2 size={13} /> Hapus
								</button>
							</div>
							{item.quote ? <blockquote>{item.quote}</blockquote> : <em className="aevr-missed-global-tag">{t('aevr.globalErrorTag')}</em>}
							{item.referenceCorrection && <p><strong>Koreksi:</strong> {item.referenceCorrection}</p>}
							{item.referenceExplanation && <p><strong>Penjelasan:</strong> {item.referenceExplanation}</p>}
							{item.reviewerNote && <small>Catatan: {item.reviewerNote}</small>}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

/**
 * Phase 4 — lecturer-only research counters (never shown to students). Sums
 * AI findings, human missed errors, and research annotations for the current
 * evaluation so the lecturer can see recall coverage at a glance.
 */
function ResearchCounters() {
	const ctx = useReview();
	const t = useT();
	if (!ctx || !ctx.hasRecord) return null;
	return (
		<div className="aevr-research-counters" aria-label={t('aevr.researchCounters')}>
			<span><strong>{t('aevr.aiFindingsCount')}</strong></span>
			<span><strong>{ctx.missedErrors.length}</strong> {t('aevr.missedAiCount')}</span>
			<span><strong>{ctx.researchAnnotationCount}</strong> {t('aevr.researchAnnotations')}</span>
		</div>
	);
}

/**
 * Phase 5 — compact lecturer/researcher-only research metadata panel. Shows
 * the model actually used (or "unknown"), the prompt version, when the draft
 * was generated, and the research schema version. Never shown to students —
 * the panel only renders inside the lecturer evaluation workspace, and the
 * underlying `ai_evaluations` row is owner-only. Old records without
 * provenance display "tidak tersedia" honestly rather than inventing values.
 */
function ResearchMetadataPanel() {
	const ctx = useReview();
	const t = useT();
	const [open, setOpen] = useState(false);
	if (!ctx || !ctx.hasRecord) return null;
	const p = ctx.provenance;
	const hasProvenance = !!p && (p.promptVersion || p.researchSchemaVersion != null || p.model !== 'unknown');
	const generated = ctx.row?.generatedAt ? stamp(ctx.row.generatedAt) : '';
	const sources: { label: string; on: boolean }[] = p
		? [
				{ label: 'Teks mahasiswa', on: p.usedStudentText },
				{ label: 'Gambar', on: p.usedImages },
				{ label: 'Materi disetujui', on: p.usedCourseMaterial },
				{ label: 'Rubrik', on: p.usedRubric },
				{ label: 'CEFR', on: p.usedCefr },
			]
		: [];
	return (
		<section className="aevr-provenance" aria-label="Metadata riset (dosen saja)">
			<button type="button" className="aevr-provenance-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
				<FlaskConical size={13} />
				<span className="aevr-provenance-title">{t('aevr.metadata')}</span>
				<span className="aevr-provenance-badge">{t('aevr.facultyOnly')}</span>
				<ChevronDown size={14} className={open ? 'open' : ''} />
			</button>
			{open && (
				<dl className="aevr-provenance-grid">
					<div>
						<dt>{t('aevr.model')}</dt>
						<dd>{p ? `${p.model}${p.modelVersion && p.modelVersion !== 'unknown' ? ` · ${p.modelVersion}` : ''}` : 'tidak tersedia'}</dd>
					</div>
					<div>
						<dt>{t('aevr.promptVersion')}</dt>
						<dd>{p?.promptVersion || 'tidak tersedia'}</dd>
					</div>
					<div>
						<dt>{t('aevr.created')}</dt>
						<dd>{generated || 'tidak tersedia'}</dd>
					</div>
					<div>
						<dt>{t('aevr.researchSchema')}</dt>
						<dd>{p?.researchSchemaVersion != null ? `v${p.researchSchemaVersion}` : 'tidak tersedia'}</dd>
					</div>
					{hasProvenance && (
						<>
							{p?.generationDurationMs != null && (
								<div>
									<dt>{t('aevr.duration')}</dt>
									<dd>{(p.generationDurationMs / 1000).toFixed(1)} dtk</dd>
								</div>
							)}
							{p?.inputTextHash && (
								<div className="aevr-provenance-hash">
									<dt>{t('aevr.inputHash')}</dt>
									<dd title={p.inputTextHash}>{p.inputTextHash.slice(0, 12)}…</dd>
								</div>
							)}
							{p?.outputHash && (
								<div className="aevr-provenance-hash">
									<dt>{t('aevr.outputHash')}</dt>
									<dd title={p.outputHash}>{p.outputHash.slice(0, 12)}…</dd>
								</div>
							)}
							<div className="aevr-provenance-sources">
								<dt>{t('aevr.inputSources')}</dt>
								<dd>
									{sources.map((s) => (
										<span key={s.label} className={s.on ? 'on' : 'off'}>{s.label}</span>
									))}
								</dd>
							</div>
						</>
					)}
					{!hasProvenance && (
						<p className="aevr-provenance-legacy">
							Evaluasi ini tidak memiliki metadata provenance (dibuat sebelum Phase 5). Skor dan temuan tetap valid.
						</p>
					)}
				</dl>
			)}
		</section>
	);
}

/**
 * The submitted text with the marking toolbar (middle column). AI findings
 * and lecturer marks render as yellow/red highlights directly on the text.
 * Clicking a mark opens its speech bubble without moving the viewport.
 */
export function AiEvaluationAnswer() {
	const ctx = useReview();
	const t = useT();
	const noteRef = useRef<HTMLTextAreaElement | null>(null);
	const textRef = useRef<HTMLDivElement | null>(null);
	const content = ctx?.content || '';

	// Focus the inline note as soon as a mark is placed.
	useEffect(() => {
		if (ctx?.pendingMark) window.setTimeout(() => noteRef.current?.focus(), 0);
	}, [ctx?.pendingMark]);

	// Manual inline marking: capture a text selection made inside the
	// student's submitted text (mouse or keyboard selection).
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

	if (!ctx || !ctx.hasRecord) {
		return content ? <p className="tsr-text">{content}</p> : null;
	}
	if (!content) return null;

	const { segments, marked, visible } = ctx;

	return (
		<div className="aev-answer">
			<div className="aev-markbar" role="toolbar" aria-label={t('aevr.markTextAria')}>
				<span className="aev-markbar-label">
					<Highlighter size={14} /> {t('aevr.markText')}
				</span>
				<button
					type="button"
					className={`aev-mark-btn minor${ctx.pendingMark?.severity === 'minor' ? ' active' : ''}${ctx.selection ? ' ready' : ''}`}
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => ctx.markSelection('minor')}
				>
					Kuning · perlu perbaikan
				</button>
				<button
					type="button"
					className={`aev-mark-btn major${ctx.pendingMark?.severity === 'major' ? ' active' : ''}${ctx.selection ? ' ready' : ''}`}
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => ctx.markSelection('major')}
				>
					Merah · kesalahan berarti
				</button>
				<button type="button" className="aev-tool" onClick={ctx.focusNote}>
					<MessageSquare size={13} /> {t('aevr.note')}
				</button>
				<button
					type="button"
					className="aev-tool"
					title={t('aevr.cancelMarkTitle')}
					onClick={() => {
						ctx.cancelSelection();
						ctx.focusFinding(null);
					}}
				>
					<Eraser size={13} /> {t('aevr.clearAnnotation')}
				</button>
			</div>
			{ctx.pendingMark && (
				<div className={`aev-inline-note ${ctx.pendingMark.severity}`}>
					<strong>
						{ctx.pendingMark.severity === 'minor' ? t('aevr.minorNote') : t('aevr.majorNote')}: tulis
						penjelasan untuk teks ini
					</strong>
					<blockquote>{ctx.pendingMark.quote}</blockquote>
					<textarea
						ref={noteRef}
						rows={3}
						maxLength={600}
						value={ctx.manualNote}
						onChange={(e) => ctx.setManualNote(e.target.value)}
						placeholder={t('aevr.notePlaceholder')}
						aria-label={t('aevr.noteAria')}
					/>
					{ctx.manualError && (
						<p className="form-error" role="alert">
							{ctx.manualError}
						</p>
					)}
					<div className="aevr-mark-form-actions">
						<button type="button" className="ld-btn-primary" onClick={ctx.addManual}>
							{t('aevr.saveNote')}
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
			<AnswerScript
				textRef={textRef}
				content={content}
				segments={segments}
				marked={marked}
				visibleCount={visible.length}
				activeId={ctx.activeFindingId}
				onFocus={ctx.focusFinding}
				onApprove={(id) => ctx.updateFinding(id, { status: 'approved', rejectReason: '' })}
				onReject={(id) => ctx.startReject(id)}
				onRemove={ctx.removeFinding}
				checked={Boolean(
					ctx.ready &&
					ctx.ready.result !== 'insufficient' &&
					parseFindings(ctx.ready.findings).length > 0,
				)}
			/>
			<UnanchoredFindings />
			<FindingsUnderText />
			{ctx.researchMode && <MissedErrorsSection />}

			<DraftRunStatus />
		</div>
	);
}

/**
 * Compact evaluation-status badge for the answer-column header. Surfaces the
 * AI evaluation run state and publication state next to the student's name so
 * the lecturer always knows where this submission stands at a glance. Reads
 * only from the review context — no extra requests.
 */
export function EvaluationStatusBadge() {
	const ctx = useReview();
	const t = useT();
	if (!ctx || !ctx.hasRecord) return null;
	let label = t('aevr.noAiSuggestion');
	let tone = 'pending';
	if (ctx.published) {
		label = t('aevr.publishedBadge');
		tone = 'published';
	} else if (ctx.ungradable) {
		label = t('aevr.notGradable');
		tone = 'wait';
	} else if (ctx.preparing) {
		label = t('aevr.aiPreparing');
		tone = 'preparing';
	} else if (ctx.ready) {
		label = ctx.dirty ? t('aevr.aiReadyDirty') : t('aevr.aiReady');
		tone = 'ready';
	}
	return <span className={`evx-eval-status ${tone}`}>{label}</span>;
}

/**
 * The single consolidated penilaian panel (right column): collapsible
 * findings review, the AI recommended score with its per-criteria reasoning
 * (which autofills the final score), rubric recalculation with the lecturer
 * override, and explicit publishing — one panel instead of two.
 */
export function AiEvaluationPanel() {
	const ctx = useReview();
	const t = useT();
	const noteRef = useRef<HTMLTextAreaElement | null>(null);
	const [openRubric, setOpenRubric] = useState<string | null>(null);

	useEffect(() => {
		if (!ctx?.noteTick) return;
		noteRef.current?.focus();
	}, [ctx?.noteTick]);

	if (!ctx || !ctx.hasRecord) return null;

	const { ready, criteria } = ctx;
	const breakdown = ready ? parseRubric(ready.rubricBreakdown) : [];
	const citations = ready ? parseCitations(ready.citations) : [];
	const wordsNote = ctx.publishNote.length;

	return (
		<section className="evx-panel" aria-label="Tinjauan temuan dan penilaian">
			<header className="evx-panel-head">
				<h3>
					<Sparkles size={14} /> {t('aevr.review')}
				</h3>
				<span className={`evx-draft${ctx.published ? ' live' : ''}`}>{ctx.published ? t('aevr.published') : t('aevr.draft')}</span>
			</header>
			<button
				type="button"
				className={`aev-research-toggle${ctx.researchMode ? ' on' : ''}`}
				aria-pressed={ctx.researchMode}
				onClick={() => ctx.setResearchMode(!ctx.researchMode)}
			>
				<FlaskConical size={13} /> {ctx.researchMode ? t('aevr.researchModeOn') : t('aevr.researchMode')}
			</button>
			{ctx.researchMode && <ResearchCounters />}
			{ctx.researchMode && <ResearchMetadataPanel />}

			<div className="evx-ai-card score-only">
				<div className="evx-ai-score">
					<strong>
						{ctx.calc.total}
						<small> / 100{letterGrade(ctx.calc.total) ? ` · ${letterGrade(ctx.calc.total)}` : ''}</small>
					</strong>
					<span>{t('aevr.recommendScore')}</span>
				</div>
			</div>

			<section className="evx-block">
				<header>
					<h4>
						<ListChecks size={14} /> {t('aevr.rubric')}
						<span className="evx-rubric-info" tabIndex={0} aria-label={t('aevr.rubricHowTo')}>
							<Info size={13} />
							<span className="evx-rubric-tip" role="tooltip">
								Skor total memakai model proporsional bertutup berbobot: setiap temuan merah −12,
								kuning −3 (maks −18), plus toleransi panjang jawaban — sehingga beberapa
								kesalahan pada jawaban panjang tidak menjatuhkan skor ke 0. Baris per
								kriteria bersifat informatif (merah −{RUBRIC_MAJOR_PENALTY}, kuning −{RUBRIC_MINOR_PENALTY})
								agar dosen melihat kriteria yang lemah. Temuan umum (tidak terpetakan ke
								kriteria) tetap mengurangi skor total dengan faktor 1.{ctx.cefrLevel ? ` Kalibrasi CEFR ${ctx.cefrLevel} pada kode mata kuliah (tugas bahasa).` : ''}
								Saran nilai bersifat sementara sampai dosen menyimpan &amp; lanjut.
							</span>
						</span>
					</h4>
					<span>Total <strong>{ctx.calc.total}</strong> / 100</span>
				</header>
				{ctx.calc.factors.length > 0 && (
					<details className="fer-score-details">
						<summary>
							<span>{t('aevr.detailScoring')}</span>
							<ChevronDown size={16} aria-hidden="true" />
						</summary>
						<div className="fer-score-details-body">
							<p className="evx-muted fer-rationale">{ctx.calc.rationale}</p>
							<ul className="fer-factors" aria-label="Rincian perhitungan skor">
								{ctx.calc.factors.map((factor) => {
									const isBase = factor.key === 'base';
									return (
										<li key={factor.key}>
											<span className="fer-factor-label">{factor.label}</span>
											<span className="fer-factor-detail">{factor.detail}</span>
											{isBase ? (
												<em className="tolerance">100</em>
											) : factor.impact !== 0 ? (
												<em className={factor.impact < 0 ? 'penalty' : 'tolerance'}>
													{factor.impact > 0 ? `+${factor.impact}` : factor.impact}
												</em>
											) : null}
										</li>
									);
								})}
							</ul>
						</div>
					</details>
				)}
				{ctx.calc.rows.length === 0 && (
					<p className="evx-muted">
						Skor hitung {ctx.calc.total}/100 dari temuan yang disetujui
						{criteria.length === 0 ? '. Tugas ini belum menyimpan kriteria rubrik.' : '.'}
					</p>
				)}
				{(ctx.calc.rows.length > 0 || ctx.calc.general) && (
					<ul className="evx-rubric">
						{ctx.calc.rows.map((row) => {
							const reason = breakdown.find((entry) => entry.criterion.toLowerCase().includes(shortCriterionLabel(row.label).toLowerCase()) || shortCriterionLabel(row.label).toLowerCase().includes(entry.criterion.toLowerCase().slice(0, 12)));
							const open = openRubric === row.id;
							return (
								<li key={row.id}>
									<button type="button" onClick={() => setOpenRubric(open ? null : row.id)}>
										<span>{shortCriterionLabel(row.label)}</span>
										<span className="evx-bar"><i style={{ width: `${row.score}%` }} /></span>
										<strong>{row.score}</strong>
									</button>
									{open && (
										<p>
											{row.major} merah · {row.minor} kuning. Skor mulai 100, merah −{RUBRIC_MAJOR_PENALTY}, kuning −{RUBRIC_MINOR_PENALTY}.
											{reason?.note ? ` Alasan AI: ${reason.note}` : ''}
										</p>
									)}
								</li>
							);
						})}
						{ctx.calc.general && (
							<li className="evx-rubric-general-row">
								<strong>Catatan umum (tidak terpetakan ke kriteria)</strong>
								<span>{ctx.calc.general.major} merah · {ctx.calc.general.minor} kuning</span>
								<span>−{ctx.calc.general.penalty} poin</span>
							</li>
						)}
					</ul>
				)}
				{ctx.calc.general && (
					<p className="evx-rubric-total-note">
						Penalti catatan umum sudah termasuk dalam total di atas dan tidak dikurangkan lagi.
					</p>
				)}
			</section>

			<section className="evx-block">
				<header>
					<h4><PenLine size={14} /> {t('aevr.feedback')}</h4>
				</header>
				<textarea
					ref={noteRef}
					className="aev-publish-note"
					rows={4}
					maxLength={2000}
					value={ctx.publishNote}
					onChange={(e) => ctx.setPublishNote(e.target.value)}
					placeholder={t('aevr.feedbackPlaceholder')}
				/>
				<div className="evx-note-meta">
					<button
						type="button"
						className="evx-ai-suggest"
						disabled={!ready?.summary}
						onClick={() => ready?.summary && ctx.setPublishNote(ready.summary.slice(0, 2000))}
					>
						<Sparkles size={13} /> {t('aevr.useAiSuggestion')}
					</button>
					<span>{wordsNote} / 2000</span>
				</div>
			</section>

			<section className="evx-block evx-final-block">
				<label>
					Nilai akhir
					<span className="evx-score-field">
						<input
							id="evx-score-input"
							inputMode="decimal"
							value={ctx.override}
							onChange={(e) => ctx.changeOverride(e.target.value)}
							placeholder={String(ctx.calc.total)}
							aria-label={t('aevr.finalGradeAria')}
						/>
						<em>/ 100</em>
					</span>
				</label>
				{ctx.overrideValid && (
					<span className={`aev-adjust-badge${ctx.adjustedByLecturer ? '' : ' ai'}`}>
						{ctx.adjustedByLecturer ? 'Disesuaikan dosen' : 'Skor rekomendasi'}
					</span>
				)}
				{ctx.override.trim() !== '' && !ctx.overrideValid && <span className="aev-override-warn">Nilai harus angka 0–100.</span>}
				{ctx.adjustedByLecturer && ctx.finalScore !== ctx.calc.total && (
					<p className="aev-override-delta">
						Skor hitung {ctx.calc.total} → nilai akhir {ctx.finalScore}
						{' '}(<em>{ctx.finalScore - ctx.calc.total > 0 ? '+' : ''}{ctx.finalScore - ctx.calc.total}</em>, disesuaikan dosen)
					</p>
				)}
				{ctx.adjustedByLecturer && (
					<button type="button" className="ld-outline-action sm" onClick={ctx.clearOverride}>Hapus penyesuaian</button>
				)}
			</section>

			{ctx.confidence && (
				<section className="evx-block evx-confidence-block">
					<header>
						<h4><FileAudio size={14} /> {t('aevr.confidenceHeading')}</h4>
					</header>
					<div className="evx-confidence">
						<div className="evx-conf-stat">
							<span>{t('aevr.average')}</span>
							<strong>{Math.round(ctx.confidence.mean * 100)}%</strong>
						</div>
						<div className="evx-conf-stat">
							<span>{t('aevr.lowest')}</span>
							<strong>{Math.round(ctx.confidence.min * 100)}%</strong>
						</div>
						{ctx.confidence.lowWords.length > 0 && (
							<div className="evx-conf-low">
								<span>Kata dengan kepercayaan rendah ({ctx.confidence.lowWords.length})</span>
								<ul>
									{ctx.confidence.lowWords.slice(0, 20).map((w, i) => (
										<li key={i}>{w.word} <em>{Math.round(w.confidence * 100)}%</em></li>
									))}
								</ul>
							</div>
						)}
					</div>
					<p className="evx-muted">Sinyal advisory dari transkripsi — tidak mengurangi nilai otomatis. Pakai sebagai pertimbangan saat meninjau temuan pelafalan.</p>
				</section>
			)}

			{ctx.divergence && (
				<p className="aev-note warn" role="alert">
					<AlertTriangle size={13} /> Skor rekomendasi AI ({ctx.divergence.recommendedScore}) berbeda
					jauh dari skor hitung temuan ({ctx.divergence.detailScore}). Periksa temuan dan rubrik
					sebelum mempublikasikan. Nilai akhir dosen tetap berlaku.
				</p>
			)}

			{ctx.published && (
				<p className="aev-published">
					<CheckCircle2 size={13} /> Sudah dipublikasikan {stamp(ctx.published.publishedAt)}. Nilai {ctx.published.finalScore ?? '—'}/100{ctx.published.finalScore != null && letterGrade(ctx.published.finalScore) ? ` · ${letterGrade(ctx.published.finalScore)}` : ''}
					{ctx.published.scoreAdjusted ? ' (disesuaikan dosen)' : ''}. Menyimpan ulang menimpa nilai sebelumnya.
				</p>
			)}
			{ctx.pendingCount > 0 && (
				<p className="aev-note failed">
					<AlertTriangle size={13} /> {ctx.pendingCount} temuan AI masih menunggu tinjauan. Setujui atau tolak sebelum mempublikasikan.
				</p>
			)}
			{ctx.preparing && (
				<p className="aev-note pending" aria-live="polite"><LoaderCircle className="spin" size={13} /> Menyiapkan draf evaluasi AI.</p>
			)}

			{ctx.ungradable && (
				<div className="aev-transcript-block" role="alert">
					<AlertTriangle size={13} /> Kiriman berbicara belum dapat dinilai — transkripsi{ctx.transcriptStatus === 'failed' ? ' gagal' : ctx.transcriptStatus === 'processing' || ctx.transcriptStatus === 'pending' ? ' masih diproses' : ' belum tersedia'}.{ctx.transcriptError ? ` (${ctx.transcriptError})` : ''} Publikasi dinonaktifkan sampai transkripsi siap; minta peserta mengunggah ulang audio lalu transkripsi ulang bila perlu.
				</div>
			)}

			{ctx.confirmPublish ? (
				<div className="aev-publish-confirm">
					<div className="aev-publish-summary" aria-label="Ringkasan sebelum terbit">
						<div className="aev-ps-row">
							<span>Nilai akhir</span>
							<strong>{ctx.finalScore}/100{letterGrade(ctx.finalScore) ? ` · ${letterGrade(ctx.finalScore)}` : ''}{ctx.adjustedByLecturer ? ' (disesuaikan dosen)' : ''}</strong>
						</div>
						<div className="aev-ps-row">
							<span>Koreksi disetujui</span>
							<strong>{ctx.visible.filter((f) => f.source === 'ai' && f.status === 'approved').length} saran AI</strong>
						</div>
						<div className="aev-ps-row">
							<span>Ditolak</span>
							<strong>{ctx.rejected.length}</strong>
						</div>
						{ctx.pendingCount > 0 && (
							<div className="aev-ps-row warn">
								<span>Belum ditinjau</span>
								<strong>{ctx.pendingCount} temuan AI</strong>
							</div>
						)}
						{ctx.publishNote.trim() && (
							<div className="aev-ps-feedback">
								<span>Umpan balik</span>
								<p>{ctx.publishNote.trim().slice(0, 160)}{ctx.publishNote.trim().length > 160 ? '…' : ''}</p>
							</div>
						)}
					</div>
					<div className="aev-publish-actions">
						<span>Publikasikan nilai {ctx.finalScore}/100{letterGrade(ctx.finalScore) ? ` · ${letterGrade(ctx.finalScore)}` : ''} lalu lanjut?</span>
						<button type="button" className="ld-btn-primary" disabled={ctx.publishing} onClick={ctx.publish}>
							{ctx.publishing ? <LoaderCircle size={14} className="spin" /> : <CheckCircle2 size={14} />} {t('aevr.yesSaveNext')}
						</button>
						<button type="button" className="ld-outline-action sm" disabled={ctx.publishing} onClick={ctx.cancelPublish}>Batal</button>
					</div>
				</div>
			) : (
				<div className="evx-actions">
					<button type="button" className="evx-draft-btn" disabled={ctx.saving} onClick={ctx.saveReview}>
						{ctx.saving ? <LoaderCircle size={14} className="spin" /> : null} Simpan draf
					</button>
					<button
						type="button"
						className="evx-next-btn"
						disabled={ctx.ungradable || ctx.publishing || ctx.pendingCount > 0 || (ctx.override.trim() !== '' && !ctx.overrideValid)}
						onClick={ctx.requestConfirmPublish}
					>
						<Send size={14} /> {t('aevr.saveNext')}
					</button>
				</div>
			)}
			{ctx.dirty && (
				<button type="button" className="evx-discard" disabled={ctx.saving} onClick={ctx.resetReview}>{t('aevr.discardReview')}</button>
			)}
			{ctx.publishError && <p className="form-error" role="alert"><AlertTriangle size={13} /> {ctx.publishError}</p>}
			{ctx.publishNotice && <p className="eval-saved" role="status"><CheckCircle2 size={13} /> {ctx.publishNotice}</p>}
			{ctx.saveError && <p className="form-error" role="alert"><AlertTriangle size={13} /> {ctx.saveError}</p>}
			{ctx.notice && <p className="eval-saved" role="status"><CheckCircle2 size={13} /> {ctx.notice}</p>}
			{(citations.length > 0 || ready?.contextNote) && (
				<footer className="aev-foot">
					{citations.length > 0 ? (
						<div className="aev-citations">
							<h6>Rujukan materi disetujui</h6>
							<ul>
								{citations.map((citation, index) => (
									<li key={index}>{citation.title} (versi {citation.version}): {citation.section}{citation.pageRef ? ` · hal. ${citation.pageRef}` : ''}</li>
								))}
							</ul>
						</div>
					) : (
						ready && <p className="aev-context">{ready.contextNote}</p>
					)}
				</footer>
			)}
		</section>
	);
}

/*
			<header className="aev-head">
				<h4>
					<PenLine size={13} /> Tinjauan temuan
				</h4>
				<span className="aev-badge">Tugas formal</span>
			</header>
			{ready?.summary && <p className="aev-summary">{ready.summary}</p>}

			<CollapseSection
				title="Temuan"
				icon={<ListChecks size={13} />}
				count={String(ctx.visible.length)}
				defaultOpen
			>
				<div className="aev-findings">
					{ctx.visible.length > 0 && (
						<p className="aevr-counts-line">
							AI {ctx.aiCount} · Dosen {ctx.lecturerCount}
							{ctx.rejected.length > 0 ? ` · Ditolak ${ctx.rejected.length}` : ''}
						</p>
					)}

					{ctx.visible.length > 0 ? (
						<ul>
							{ctx.visible.map((finding) => (
								<li key={finding.id} className={finding.severity}>
									<div className="aevr-item-head">
										<span className="aev-chip">{SEVERITY_LABEL[finding.severity]}</span>
										<span className={`aevr-src ${finding.source}`}>
											{finding.source === 'ai' ? 'AI · rekomendasi' : 'Dosen'}
										</span>
										<span className={`aevr-status ${finding.status}`}>
											{REVIEW_STATUS_LABEL[finding.status]}
										</span>
									</div>
									{finding.quote && <blockquote>{finding.quote}</blockquote>}
									{ctx.editingId === finding.id ? (
										<div className="aevr-edit">
											<SeverityToggle value={ctx.editSeverity} onChange={ctx.setEditSeverity} />
											<textarea
												rows={3}
												maxLength={600}
												value={ctx.editNote}
												onChange={(e) => ctx.setEditNote(e.target.value)}
											/>
											{ctx.manualError && (
												<p className="form-error" role="alert">
													{ctx.manualError}
												</p>
											)}
											<div className="aevr-mark-form-actions">
												<button
													type="button"
													className="ld-btn-primary"
													onClick={() => ctx.saveEdit(finding)}
												>
													Simpan perubahan
												</button>
												<button
													type="button"
													className="ld-outline-action sm"
													onClick={ctx.cancelEdit}
												>
													Batal
												</button>
											</div>
										</div>
									) : (
										<p>{finding.note}</p>
									)}
									{finding.evidence && <small>Bukti: {finding.evidence}</small>}
									{criteria.length > 0 && (
										<label className="aevr-crit">
											Kriteria rubrik
											<select
												value={finding.criterion || ''}
												onChange={(e) => ctx.updateFinding(finding.id, { criterion: e.target.value })}
												aria-label={`Kriteria rubrik untuk temuan ${finding.id}`}
											>
												<option value="">— umum (tanpa kriteria) —</option>
												{criteria.map((c) => (
													<option key={c.id} value={c.id}>
														{c.label}
													</option>
												))}
											</select>
										</label>
									)}
									{ctx.rejectingId === finding.id ? (
										<RejectReasonFields id={finding.id} />
									) : ctx.editingId !== finding.id && (
										<div className="aevr-item-actions">
											{finding.source === 'ai' && finding.status !== 'approved' && (
												<button
													type="button"
													className="approve"
													onClick={() => ctx.updateFinding(finding.id, { status: 'approved', rejectReason: '' })}
												>
													<CheckCircle2 size={12} /> Setujui
												</button>
											)}
											<button type="button" onClick={() => ctx.startEdit(finding)}>
												Edit catatan
											</button>
											{finding.source === 'ai' ? (
												<button type="button" onClick={() => ctx.startReject(finding.id)}>
													Tolak
												</button>
											) : (
												<button type="button" onClick={() => ctx.removeFinding(finding.id)}>
													Hapus
												</button>
											)}
										</div>
									)}
								</li>
							))}
						</ul>
					) : (
						<p className="asg-empty-line">
							Belum ada temuan — setujui temuan AI dari tanda pada teks, atau tandai teks manual.
						</p>
					)}

					{ctx.rejected.length > 0 && (
						<div className="aevr-rejected">
							<span>Ditolak ({ctx.rejected.length}) — tidak ditandai pada teks</span>
							{ctx.rejected.map((finding) => (
								<RejectedFinding key={finding.id} finding={finding} />
							))}
						</div>
					)}

					<p className="aev-legend">
						<span>
							<mark className="aev-mark minor">kuning</mark> perlu perbaikan / saran
						</span>
						<span>
							<mark className="aev-mark major">merah</mark> kesalahan berarti
						</span>
					</p>
				</div>
			</CollapseSection>

			<CollapseSection title="Skor rekomendasi AI" icon={<Sparkles size={13} />}>
				{ctx.aiScore != null ? (
					<div className="aev-score">
						<p className="aev-score-value">
							{ctx.aiScore}
							<small>/100 — rekomendasi AI</small>
						</p>
						{ctx.overrideValid && !ctx.adjustedByLecturer ? (
							<p className="aev-autofill-note">
								<CheckCircle2 size={12} /> Terisi otomatis pada nilai akhir — ubah atau hapus pada
								bagian Rubrik &amp; nilai akhir bila perlu.
							</p>
						) : (
							<button type="button" className="ld-outline-action sm" onClick={ctx.applyAiScore}>
								Gunakan skor AI ({ctx.aiScore})
							</button>
						)}
						<div className="aev-why">
							<h6>Alasan per kriteria</h6>
							<ul className="aev-breakdown">
								{breakdown.map((entry, index) => (
									<li key={index}>
										<span>{entry.criterion}</span>
										<strong>{entry.score}</strong>
										{entry.note && <small>{entry.note}</small>}
									</li>
								))}
							</ul>
						</div>
					</div>
				) : (
					<p className="asg-empty-line">Belum ada skor rekomendasi AI untuk kiriman ini.</p>
				)}
			</CollapseSection>

			<CollapseSection title="Rubrik & nilai akhir" icon={<Calculator size={13} />} defaultOpen>
				<p className="aev-phase3-note">
					Skor dihitung ulang dari temuan yang Anda setujui atau buat sendiri dan tugaskan ke
					kriteria rubrik — temuan AI yang ditolak tidak dihitung. Setiap kriteria mulai dari
					100; temuan merah −{RUBRIC_MAJOR_PENALTY}, kuning −{RUBRIC_MINOR_PENALTY}.
					{criteria.length === 0 &&
						' Tugas ini belum menyimpan kriteria rubrik — skor dihitung dari seluruh temuan yang disetujui.'}
				</p>
				{ctx.calc.rows.length > 0 && (
					<ul className="aev-rubric">
						{ctx.calc.rows.map((r) => (
							<li key={r.id}>
								<span className="aevr-crit-label">{shortCriterionLabel(r.label)}</span>
								<span className="aevr-crit-count">
									{r.major > 0 || r.minor > 0 ? `${r.major} merah · ${r.minor} kuning` : 'tanpa temuan'}
								</span>
								<strong className="aevr-crit-score">{r.score}</strong>
							</li>
						))}
					</ul>
				)}
				<div className="aev-rubric-total">
					<span>
						Skor hitung{' '}
						{ctx.calc.hasRubric ? '(rata-rata tertimbang rubrik)' : '(pengurangan temuan)'}
					</span>
					<strong>{ctx.calc.total}</strong>
				</div>
				<div className="aev-final">
					<div className="aev-final-row">
						<span className="aev-final-value">
							{ctx.finalScore}
							<small>/100 — nilai akhir</small>
						</span>
						{ctx.overrideValid && (
							<span className={`aev-adjust-badge${ctx.adjustedByLecturer ? '' : ' ai'}`}>
								{ctx.adjustedByLecturer ? 'Disesuaikan dosen' : 'Skor rekomendasi AI'}
							</span>
						)}
					</div>
					<div className="aev-override">
						<label>
							Penyesuaian dosen (0–100)
							<input
								inputMode="decimal"
								value={ctx.override}
								onChange={(e) => ctx.changeOverride(e.target.value)}
								placeholder="—"
								aria-label="Penyesuaian nilai akhir oleh dosen"
							/>
						</label>
						{ctx.override.trim() !== '' && (
							<button type="button" className="ld-outline-action sm" onClick={ctx.clearOverride}>
								Hapus penyesuaian
							</button>
						)}
						{ctx.override.trim() !== '' && !ctx.overrideValid && (
							<span className="aev-override-warn">Nilai harus angka 0–100.</span>
						)}
					</div>
				</div>
			</CollapseSection>

			<CollapseSection title="Publikasi ke peserta" icon={<Send size={13} />} defaultOpen>
				{ctx.published && (
					<p className="aev-published">
						<CheckCircle2 size={13} /> Sudah dipublikasikan {stamp(ctx.published.publishedAt)} — nilai{' '}
						{ctx.published.finalScore ?? '—'}/100
						{ctx.published.scoreAdjusted ? ' (disesuaikan dosen)' : ''}. Mempublikasikan ulang akan
						menimpa nilai dan umpan balik sebelumnya.
					</p>
				)}
				{ctx.pendingCount > 0 && (
					<p className="aev-note failed">
						<AlertTriangle size={13} /> {ctx.pendingCount} temuan AI masih menunggu tinjauan — setujui
						atau tolak sebelum mempublikasikan.
					</p>
				)}
				<textarea
					className="aev-publish-note"
					rows={3}
					maxLength={2000}
					value={ctx.publishNote}
					onChange={(e) => ctx.setPublishNote(e.target.value)}
					placeholder="Catatan dosen untuk peserta (opsional, ikut dipublikasikan)..."
				/>
				{ctx.confirmPublish ? (
					<div className="aev-publish-actions">
						<span>Publikasikan nilai {ctx.finalScore}/100 ke peserta?</span>
						<button
							type="button"
							className="ld-btn-primary"
							disabled={ctx.publishing}
							onClick={ctx.publish}
						>
							{ctx.publishing ? <LoaderCircle size={14} className="spin" /> : <CheckCircle2 size={14} />}{' '}
							Ya, publikasikan
						</button>
						<button
							type="button"
							className="ld-outline-action sm"
							disabled={ctx.publishing}
							onClick={ctx.cancelPublish}
						>
							Batal
						</button>
					</div>
				) : (
					<button
						type="button"
						className="ld-btn-primary"
						disabled={
							ctx.publishing || ctx.pendingCount > 0 || (ctx.override.trim() !== '' && !ctx.overrideValid)
						}
						onClick={ctx.requestConfirmPublish}
					>
						<Send size={14} /> {ctx.published ? 'Publikasikan ulang' : 'Publikasikan ke peserta'}
					</button>
				)}
				{ctx.publishError && (
					<p className="form-error" role="alert">
						<AlertTriangle size={13} /> {ctx.publishError}
					</p>
				)}
				{ctx.publishNotice && (
					<p className="eval-saved" role="status">
						<CheckCircle2 size={13} /> {ctx.publishNotice}
					</p>
				)}
			</CollapseSection>

			<footer className="aev-foot">
				{citations.length > 0 ? (
					<div className="aev-citations">
						<h6>Rujukan materi disetujui</h6>
						<ul>
							{citations.map((citation, index) => (
								<li key={index}>
									{citation.title} (versi {citation.version}) — {citation.section}
									{citation.pageRef ? ` · hal. ${citation.pageRef}` : ''}
								</li>
							))}
						</ul>
					</div>
				) : (
					ready && <p className="aev-context">{ready.contextNote}</p>
				)}
				{ctx.row?.reviewedAt ? (
					<small>Tinjauan terakhir disimpan {stamp(ctx.row.reviewedAt)}</small>
				) : (
					ready?.generatedAt && <small>Draf AI disusun {stamp(ready.generatedAt)}</small>
				)}
			</footer>

			{ctx.dirty && (
				<div className="aevr-savebar">
					<span>Ada perubahan tinjauan yang belum disimpan.</span>
					<div>
						<button
							type="button"
							className="ld-outline-action sm"
							disabled={ctx.saving}
							onClick={ctx.resetReview}
						>
							Buang perubahan
						</button>
						<button
							type="button"
							className="ld-btn-primary"
							disabled={ctx.saving}
							onClick={ctx.saveReview}
						>
							{ctx.saving ? (
								<LoaderCircle size={14} className="spin" />
							) : (
								<CheckCircle2 size={14} />
							)}{' '}
*/
