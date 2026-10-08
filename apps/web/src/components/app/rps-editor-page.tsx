import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type Dispatch,
	type SetStateAction,
} from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { courseRouteId } from '@/lib/course-route';
import {
	AlertTriangle,
	Check,
	ChevronLeft,
	ChevronRight,
	Copy,
	Download,
	FileSpreadsheet,
	FileText,
	LoaderCircle,
	Plus,
	Save,
	Trash2,
	Upload,
	Wand2,
} from 'lucide-react';
import { AppShell } from '@/components/app/app-shell';
import { OverflowMenu } from '@/components/app/overflow-menu';
import { FormStepper } from '@/components/form-stepper';
import { CharMeter } from '@/components/app/char-meter';
import { useAssistantPageContext } from '@/components/app/assistant-page-context-provider';
import pb from '@/lib/pocketbase-client';
import { cachedQuery, invalidate, invalidateCourseData } from '@/lib/local-cache';
import type {
	Assessment,
	ClassSession,
	CollaborativeTask,
	Course,
	Cpmk,
	StructuredItem,
	SubCpmk,
} from '@/lib/learning';
import { errorMessage, isAbortError } from '@/lib/learning';
import {
	composeRpsText,
	draftFromCourse,
	EMPTY_DRAFT,
	isFieldMissing,
	missingFields,
	RPS_STEPS,
	type DraftAssessment,
	type DraftCollab,
	type DraftCpmk,
	type DraftItem,
	type DraftSession,
	type RpsDraft,
} from '@/lib/rps-draft';
import {
	mergePatch,
	replacePatch,
	SECTION_PARSERS,
	type SectionPatch,
	type SectionParseResult,
} from '@/lib/rps-text-parse';
import { CSV_TEMPLATES, downloadCsvTemplate, parseSectionCsv } from '@/lib/rps-csv';
import {
	copyToClipboard,
	getSectionPrompt,
	SECTION_PROMPT_LABELS,
} from '@/lib/rps-prompt';
import {
	validateRps,
	validationFromDraft,
	VALIDATION_CATEGORY_LABELS,
	type ValidationCategory,
} from '@/lib/rps-validation';
import {
	findRpsLimitIssue,
	issueFromPocketBase,
	LIMITS,
	runeCount,
	type LimitIssue,
} from '@/lib/rps-limits';

type ParsedPayload = Partial<RpsDraft> & {
	cpl?: string;
	cpmk?: string;
	assessments?: string;
	cplItems?: DraftItem[];
	cpmkItems?: DraftCpmk[];
	topicItems?: DraftItem[];
	assessmentItems?: DraftAssessment[];
	sessions?: DraftSession[];
	collaborativeTasks?: DraftCollab[];
	warnings?: string[];
};

type ExtractDiag = {
	ok: boolean;
	method: string;
	pages: number;
	chars: number;
	tables: number;
	tableChars: number;
	error?: string;
};
type AiDiag = {
	ok: boolean;
	attempts: number;
	inputChars: number;
	outputChars: number;
	repaired: boolean;
	error?: string;
};
type NormalizeDiag = {
	ok: boolean;
	cpl: number;
	cpmk: number;
	subCpmk: number;
	topics: number;
	assessments: number;
	sessions: number;
	collab: number;
	warnings: number;
};
type TableDiag = {
	ok: boolean;
	rows: number;
	detected: boolean;
};
type ImportStages = {
	extract: ExtractDiag;
	table?: TableDiag;
	ai: AiDiag;
	normalize: NormalizeDiag;
};

function numOrEmpty(v: number | null | undefined) {
	return v == null ? '' : String(v);
}

function parseNum(raw: string): number | null {
	if (raw.trim() === '') return null;
	const n = Number(raw);
	return Number.isNaN(n) ? null : n;
}

const itemKey = (item: { code: string; description: string }) =>
	(item.code || item.description || '').trim().toLowerCase();

export function RpsEditorPage({ courseId }: { courseId: string | null }) {
	const navigate = useNavigate();
	const location = useLocation();
	const [searchParams] = useSearchParams();
	const { setContext: setAssistantPageContext } = useAssistantPageContext();
	const startImport = searchParams.get('import') === '1';
	const startStep = Number(searchParams.get('step')) || 1;
	const [step, setStep] = useState(Math.min(7, Math.max(1, startStep)));
	const [draft, setDraft] = useState<RpsDraft>(EMPTY_DRAFT);
	const [loading, setLoading] = useState(Boolean(courseId));
	const [saving, setSaving] = useState(false);
	const [parsing, setParsing] = useState(false);
	const [error, setError] = useState('');
	const [saveMsg, setSaveMsg] = useState('');
	const [limitFocus, setLimitFocus] = useState<LimitIssue | null>(null);
	const [focusTick, setFocusTick] = useState(0);
	const [file, setFile] = useState<File | null>(null);
	const [showUpload, setShowUpload] = useState(!courseId || startImport);
	const [stages, setStages] = useState<ImportStages | null>(null);
	const [importSource, setImportSource] = useState<'ai' | 'heuristic' | 'table' | null>(null);
	const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
	const [thumbStatus, setThumbStatus] = useState<'idle' | 'generating' | 'done' | 'failed'>('idle');
	const inputRef = useRef<HTMLInputElement>(null);
	const draftRef = useRef(draft);
	draftRef.current = draft;
	/** Set right before a save-induced navigation so the courseId effect does not
	 *  re-fetch and wipe the editor with a full loading screen. */
	const skipLoadRef = useRef(false);

	const set = useCallback(<K extends keyof RpsDraft>(field: K, value: RpsDraft[K]) => {
		setDraft((prev) => ({ ...prev, [field]: value }));
	}, []);

	const applySectionImport = useCallback(
		(patch: SectionPatch, mode: 'merge' | 'replace') => {
			setDraft((prev) => (mode === 'replace' ? replacePatch(prev, patch) : mergePatch(prev, patch)));
			setError('');
			setSaveMsg(
				mode === 'replace'
					? 'Teks dipetakan dan mengganti isi bagian ini. Klik "Simpan draf" untuk menyimpan.'
					: 'Teks dipetakan dan digabung ke bagian ini. Klik "Simpan draf" untuk menyimpan.',
			);
		},
		[],
	);

	const loadExisting = useCallback(async (id: string, isStale?: () => boolean) => {
		// Do NOT flip `loading` here: this runs on re-syncs too, and doing so would
		// flash the whole editor to a spinner on every progressive save. The initial
		// load is already covered by `useState(Boolean(courseId))`.
		setError('');
		try {
			// Cached reads — re-opening the editor reuses rows (TTL + SWR) instead
			// of re-querying PocketBase; saves invalidate these keys.
			const course = await cachedQuery<Course>(`courses:one=${id}`, () =>
				pb.collection('courses').getOne<Course>(id),
			);
			if (isStale?.()) return;
			if (course.owner !== pb.authStore.record?.id) {
				setError('Anda tidak memiliki akses untuk mengedit RPS mata kuliah ini.');
				setLoading(false);
				return;
			}
			const filter = pb.filter('course = {:id}', { id });
			const [cpl, cpmk, sub, topics, assessments, sessions, collab] = await Promise.all([
				cachedQuery<StructuredItem[]>(`cpl:course=${id}`, () =>
					pb.collection('cpl').getFullList<StructuredItem>({ filter, sort: 'order,created' })),
				cachedQuery<Cpmk[]>(`cpmk:course=${id}`, () =>
					pb.collection('cpmk').getFullList<Cpmk>({ filter, sort: 'order,created' })),
				cachedQuery<SubCpmk[]>(`sub_cpmk:course=${id}`, () =>
					pb.collection('sub_cpmk').getFullList<SubCpmk>({ filter, sort: 'order,created' })),
				cachedQuery<StructuredItem[]>(`topics:course=${id}`, () =>
					pb.collection('topics').getFullList<StructuredItem>({ filter, sort: 'order,created' })),
				cachedQuery<Assessment[]>(`assessments:course=${id}`, () =>
					pb.collection('assessments').getFullList<Assessment>({ filter, sort: 'order,created' })),
				cachedQuery<ClassSession[]>(`class_sessions:course=${id}`, () =>
					pb.collection('class_sessions').getFullList<ClassSession>({
						filter,
						sort: 'week,created',
					})),
				cachedQuery<CollaborativeTask[]>(`collaborative_tasks:course=${id}`, () =>
					pb
						.collection('collaborative_tasks')
						.getFullList<CollaborativeTask>({ filter, sort: 'order,created' })).catch(
					() => [] as CollaborativeTask[],
				),
			]);
			if (isStale?.()) return;
			const cplCodeById = new Map(cpl.map((r) => [r.id, r.code]));
			const next = draftFromCourse(course);
			next.cplItems = cpl.map((r) => ({ id: r.id, code: r.code, description: r.description }));
			next.cpmkItems = cpmk.map((r) => ({
				id: r.id,
				code: r.code,
				description: r.description,
				cplCode: r.cpl ? cplCodeById.get(r.cpl) || '' : '',
				cplId: r.cpl || '',
				taxonomy: r.taxonomy ?? null,
				weight: r.weight ?? null,
				criteria: r.criteria || '',
				subCpmk: sub
					.filter((s) => s.cpmk === r.id)
					.map((s) => ({ id: s.id, code: s.code, description: s.description })),
			}));
			next.topicItems = topics.map((r) => ({
				id: r.id,
				code: r.code,
				description: r.description,
			}));
			next.assessmentItems = assessments.map((r) => ({
				id: r.id,
				code: r.code,
				description: r.description,
				weight: r.weight,
			}));
			next.sessions = sessions.map((s) => ({
				id: s.id,
				week: s.week,
				title: s.title,
				topic: s.topic,
				objectives: '',
				activities: '',
				duration: s.duration || '',
				assessment: '',
				references: s.references || '',
				// notes may hold composed detail — leave free-form in topic if needed
				cpls: s.cpls || [],
				cpmks: s.cpmks || [],
				subCpmks: s.subCpmks || [],
				topics: s.topics || [],
				assessments: s.assessments || [],
				specialWeekType: (s.specialWeekType as DraftSession['specialWeekType']) || 'normal',
				learningIndicator: s.learningIndicator || '',
				learningMaterial: s.learningMaterial || '',
				assessmentMethod: s.assessmentMethod || '',
				assessmentWeight: s.assessmentWeight ?? null,
				synchronousMethod: s.synchronousMethod || '',
				asynchronousMethod: s.asynchronousMethod || '',
				accessDateTime: s.accessDateTime ? String(s.accessDateTime).slice(0, 16) : '',
			}));
			// Split notes back into fields when possible (only fill empty fields —
			// real structured fields take precedence over composed notes).
			for (const s of next.sessions) {
				const raw = sessions.find((x) => x.id === s.id)?.notes || '';
				if (!raw) continue;
				const lines = raw.split('\n');
				for (const line of lines) {
					if (line.startsWith('Tujuan:') && !s.objectives) s.objectives = line.replace(/^Tujuan:\s*/, '');
					else if (line.startsWith('Kegiatan:') && !s.activities) s.activities = line.replace(/^Kegiatan:\s*/, '');
					else if (line.startsWith('Durasi:') && !s.duration) s.duration = line.replace(/^Durasi:\s*/, '');
					else if (line.startsWith('Penilaian:') && !s.assessment) s.assessment = line.replace(/^Penilaian:\s*/, '');
					else if (line.startsWith('Referensi:') && !s.references) s.references = line.replace(/^Referensi:\s*/, '');
				}
			}
			next.collaborativeTasks = collab.map((c) => ({
				id: c.id,
				title: c.title,
				description: c.description || '',
				objectives: c.objectives || '',
				schedule: c.schedule || '',
				groupInfo: c.groupInfo || '',
				method: c.method || '',
				weight: c.weight ?? null,
				subCpmkNote: c.subCpmkNote || '',
				steps: c.steps || '',
				outputs: c.outputs || '',
				indicators: c.indicators || '',
				notes: c.notes || '',
				cpls: c.cpls || [],
				cpmks: c.cpmks || [],
				subCpmks: c.subCpmks || [],
				assessments: c.assessments || [],
			}));
			if (course.rpsFile) {
				next.hasRpsFile = true;
				next.rpsFileName = course.rpsFile;
				try {
					next.rpsFileUrl = pb.files.getURL(course, course.rpsFile);
				} catch {
					next.rpsFileUrl = '';
				}
			}
			setDraft(next);
			const done = new Set<number>();
			if (next.title) done.add(1);
			if (next.description || next.cplItems.length) done.add(2);
			if (next.sessions.length) done.add(3);
			if (next.workloadLecture != null || next.workload) done.add(4);
			if (next.assessmentItems.length) done.add(5);
			if (next.collaborativeTasks.length) done.add(6);
			setCompletedSteps(done);
		} catch (err) {
			if (isStale?.() || isAbortError(err)) return;
			setError(errorMessage(err));
		} finally {
			if (!isStale?.()) setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!courseId) return;
		// A save that created a new course navigates to /app/rps/:id; that changes
		// `courseId` and would re-trigger this effect. The draft already holds the
		// just-saved data, so skip the reload and just clear the flag.
		if (skipLoadRef.current) {
			skipLoadRef.current = false;
			return;
		}
		let ignore = false;
		void loadExisting(courseId, () => ignore);
		return () => {
			ignore = true;
		};
	}, [courseId, loadExisting]);

	// Publish semantic page context for the assistant: the RPS feature scoped to
	// the course being edited, the current step, and the import/editing state.
	useEffect(() => {
		const resolvedCourseId = draft.courseId || courseId || '';
		setAssistantPageContext({
			route: location.pathname,
			feature: 'rps',
			...(resolvedCourseId ? { entity: { type: 'course', id: resolvedCourseId } } : {}),
			state: {
				step,
				importMode: showUpload,
				hasRpsFile: Boolean(draft.hasRpsFile),
				courseCode: draft.code || '',
			},
			availableActions: resolvedCourseId
				? ['import_rps_pdf', 'save_rps_draft', 'publish_rps']
				: ['import_rps_pdf'],
		});
		return () => setAssistantPageContext(null);
	}, [draft.courseId, draft.hasRpsFile, draft.code, courseId, step, showUpload, location.pathname, setAssistantPageContext]);

	const applyParsed = (parsed: ParsedPayload) => {
		setDraft((prev) => ({
			...prev,
			title: parsed.title || prev.title,
			code: parsed.code || prev.code,
			semester: parsed.semester || prev.semester,
			academicYear: parsed.academicYear || prev.academicYear,
			description: parsed.description || prev.description,
			syllabus: parsed.syllabus || prev.syllabus,
			strategies: parsed.strategies || prev.strategies,
			workload: parsed.workload || prev.workload,
			references: parsed.references || prev.references,
			credits: parsed.credits ?? prev.credits,
			prerequisites: parsed.prerequisites || prev.prerequisites,
			courseGroup: parsed.courseGroup || prev.courseGroup,
			lecturerName: parsed.lecturerName || prev.lecturerName,
			reviewerName: parsed.reviewerName || prev.reviewerName,
			approverName: parsed.approverName || prev.approverName,
			demonstrableOutcomes: parsed.demonstrableOutcomes || prev.demonstrableOutcomes,
			learningSteps: parsed.learningSteps || prev.learningSteps,
			workloadIdealHours: parsed.workloadIdealHours ?? prev.workloadIdealHours,
			workloadSksMatch: parsed.workloadSksMatch || prev.workloadSksMatch,
			workloadBreakdown: parsed.workloadBreakdown ?? prev.workloadBreakdown,
			publishedAt: parsed.publishedAt || prev.publishedAt,
			workloadLecture: parsed.workloadLecture ?? prev.workloadLecture,
			workloadTutorial: parsed.workloadTutorial ?? prev.workloadTutorial,
			workloadPractice: parsed.workloadPractice ?? prev.workloadPractice,
			workloadIndependent: parsed.workloadIndependent ?? prev.workloadIndependent,
			workloadTotal: parsed.workloadTotal ?? prev.workloadTotal,
			assessmentNotes: parsed.assessments || prev.assessmentNotes,
			cplItems: parsed.cplItems?.length ? parsed.cplItems : prev.cplItems,
			cpmkItems: parsed.cpmkItems?.length ? parsed.cpmkItems : prev.cpmkItems,
			topicItems: parsed.topicItems?.length ? parsed.topicItems : prev.topicItems,
			assessmentItems: parsed.assessmentItems?.length
				? parsed.assessmentItems
				: prev.assessmentItems,
			sessions: parsed.sessions?.length ? parsed.sessions : prev.sessions,
			collaborativeTasks: parsed.collaborativeTasks?.length
				? parsed.collaborativeTasks
				: prev.collaborativeTasks,
			warnings: parsed.warnings || [],
		}));
		setShowUpload(false);
		setStep(1);
		setCompletedSteps(new Set());
	};

	const analyzePdf = async () => {
		if (!file) return;
		setParsing(true);
		setError('');
		try {
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch('/api/rps-import', { method: 'POST', body: fd });
			const data = (await res.json()) as {
				ok?: boolean;
				error?: string;
				parsed?: ParsedPayload;
				source?: 'ai' | 'heuristic' | 'table';
				stages?: ImportStages;
			};
			if (!res.ok || !data.ok || !data.parsed) {
				if (data.stages) setStages(data.stages);
				throw new Error(data.error || 'Gagal membaca PDF.');
			}
			applyParsed(data.parsed);
			setStages(data.stages ?? null);
			setImportSource(data.source ?? null);
			setSaveMsg(
				data.source === 'heuristic'
					? 'PDF dipetakan dengan parser cadangan. Tinjau setiap langkah dengan teliti.'
					: data.source === 'table'
						? 'Jadwal pertemuan dipetakan langsung dari tabel RPS. Tinjau setiap langkah sebelum menyimpan.'
						: 'PDF berhasil dipetakan dengan AI. Tinjau setiap langkah sebelum menyimpan.',
			);
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setParsing(false);
		}
	};

	const revealIssue = useCallback((issue: LimitIssue) => {
		setStep(issue.step);
		setError(issue.message);
		setLimitFocus(issue);
		setFocusTick((n) => n + 1);
	}, []);

	useEffect(() => {
		if (!limitFocus || focusTick === 0) return;
		const timer = window.setTimeout(() => {
			const el = document.getElementById(limitFocus.focusId);
			if (!el) return;
			el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			el.focus({ preventScroll: true });
		}, 120);
		return () => window.clearTimeout(timer);
	}, [limitFocus, focusTick]);

	/**
	 * Fires an AI thumbnail generation request for a newly created course.
	 * Non-blocking: uses `keepalive` so it survives the finalize navigation,
	 * and never throws — a failure leaves the gradient cover in place. Cache
	 * invalidation runs on success so the course list/detail picks up the new
	 * thumbnail on the next read.
	 */
	const fireThumbnailGeneration = useCallback((courseId: string, finalize: boolean) => {
		setThumbStatus('generating');
		const token = pb.authStore.token;
		fetch('/api/course-thumbnail', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
			body: JSON.stringify({ courseId }),
			keepalive: finalize,
		})
			.then(async (res) => {
				const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
				if (res.ok && data.ok) {
					setThumbStatus('done');
					invalidate('courses');
				} else {
					setThumbStatus('failed');
				}
			})
			.catch(() => setThumbStatus('failed'));
	}, []);

	const persistAll = async (finalize: boolean) => {
		setSaving(true);
		setError('');
		setSaveMsg('');
		const d = draftRef.current;
		const blocked = findRpsLimitIssue(d);
		if (blocked) {
			revealIssue(blocked);
			setSaving(false);
			return;
		}
		try {
			const ownerId = pb.authStore.record?.id || '';
			const fd = new FormData();
			fd.append('title', d.title.trim() || 'Mata kuliah tanpa judul');
			fd.append('code', d.code.trim());
			fd.append('semester', d.semester.trim());
			fd.append('academicYear', d.academicYear.trim());
			fd.append('description', d.description.trim());
			fd.append('syllabus', d.syllabus.trim());
			fd.append('rps', composeRpsText(d));
			fd.append('strategies', d.strategies.trim());
			fd.append('workloadNotes', d.workload.trim());
			fd.append('assessmentNotes', d.assessmentNotes.trim());
			fd.append('prerequisites', d.prerequisites.trim());
			fd.append('courseGroup', d.courseGroup.trim());
			fd.append('lecturerName', d.lecturerName.trim());
			fd.append('reviewerName', d.reviewerName.trim());
			fd.append('approverName', d.approverName.trim());
			fd.append('demonstrableOutcomes', d.demonstrableOutcomes.trim());
			fd.append('learningSteps', d.learningSteps.trim());
			fd.append('workloadSksMatch', d.workloadSksMatch.trim());
			if (d.workloadBreakdown != null)
				fd.append('workloadBreakdown', JSON.stringify(d.workloadBreakdown));
			if (d.workloadIdealHours != null)
				fd.append('workloadIdealHours', String(d.workloadIdealHours));
			if (d.publishedAt) fd.append('publishedAt', d.publishedAt);
			if (d.credits != null) fd.append('credits', String(d.credits));
			if (d.workloadLecture != null) fd.append('workloadLecture', String(d.workloadLecture));
			if (d.workloadTutorial != null) fd.append('workloadTutorial', String(d.workloadTutorial));
			if (d.workloadPractice != null) fd.append('workloadPractice', String(d.workloadPractice));
			if (d.workloadIndependent != null)
				fd.append('workloadIndependent', String(d.workloadIndependent));
			if (d.workloadTotal != null) fd.append('workloadTotal', String(d.workloadTotal));
			if (file) fd.append('rpsFile', file);

			let id = d.courseId;
		const isNewCourse = !id;
			if (id) {
				await pb.collection('courses').update(id, fd);
			} else {
				fd.append('owner', ownerId);
				const created = await pb.collection('courses').create<Course>(fd);
				id = created.id;
				setDraft((prev) => ({ ...prev, courseId: id }));
			}

			const maps = await syncStructured(id!, d, ownerId);
			const sessionIdByIndex = await syncSessions(id!, d, ownerId);
			await syncCollab(id!, d, ownerId);

			// Saved rows must not be served stale elsewhere — drop every cached
			// read for this user; mounted pages refetch via their subscriptions.
			invalidateCourseData();

			// Merge the resolved record ids back into the draft so the next progressive
			// save updates rows in place instead of matching by key (which would
			// duplicate when a description changes). No full reload needed.
			setDraft((prev) => ({
				...prev,
				cplItems: prev.cplItems.map((it) => ({
					...it,
					id: it.id || maps.cpl.get(itemKey(it)),
				})),
				cpmkItems: prev.cpmkItems.map((it) => ({
					...it,
					id: it.id || maps.cpmk.get(itemKey(it)),
				})),
				topicItems: prev.topicItems.map((it) => ({
					...it,
					id: it.id || maps.topics.get(itemKey(it)),
				})),
				assessmentItems: prev.assessmentItems.map((it) => ({
					...it,
					id: it.id || maps.assessments.get(itemKey(it)),
				})),
				// Reattach stored session ids so a later save updates the same rows
				// instead of creating duplicates (especially after a PDF/text import
				// that replaced draft.sessions with id-less parsed rows).
				sessions: prev.sessions.map((s, idx) => ({
					...s,
					id: s.id || sessionIdByIndex.get(idx),
				})),
			}));

			setCompletedSteps((prev) => new Set([...prev, step]));
			setSaveMsg(finalize ? 'RPS berhasil disimpan.' : 'Draf disimpan.');
		if (isNewCourse && id) {
			fireThumbnailGeneration(id, finalize);
		}
			if (finalize) {
				navigate(`/app/courses/${courseRouteId({ id: id || '', code: d.code })}`);
			} else if (!courseId && id) {
				// Switch the URL from /app/rps/new to /app/rps/:id so subsequent saves
				// update the course. Mark skip so the courseId effect doesn't reload.
				skipLoadRef.current = true;
				navigate(`/app/rps/${id}`, { replace: true });
			}
			setLimitFocus(null);
		} catch (err) {
			const mapped = issueFromPocketBase(err, draftRef.current);
			if (mapped) revealIssue(mapped);
			else setError(errorMessage(err));
		} finally {
			setSaving(false);
		}
	};

	const goNext = () => {
		setCompletedSteps((prev) => new Set([...prev, step]));
		setStep((s) => Math.min(7, s + 1));
	};

	const miss = useMemo(() => missingFields(draft), [draft]);

	if (loading) {
		return (
			<AppShell title="Editor RPS" eyebrow="RPS" back variant="saas" hideHeading>
				<div className="ld-loading">
					<LoaderCircle size={24} className="spin" /> Memuat editor RPS...
				</div>
			</AppShell>
		);
	}

	return (
		<AppShell
			title={draft.title || 'Editor RPS'}
			eyebrow="Rencana Pembelajaran Semester"
			back
			variant="saas"
			hideHeading
		>
			<div className="rps-editor">
				<header className="rps-editor-head">
					<div>
						<span className="ld-eyebrow">RENCANA PEMBELAJARAN SEMESTER (RPS)</span>
						<h1>
							{draft.code
								? `${draft.code}${draft.title ? ` — ${draft.title}` : ''}`
								: draft.title || 'RPS baru'}
						</h1>
					</div>
					<div className="rps-editor-actions">
						<OverflowMenu label="Tindakan RPS">
							{draft.courseId ? (
								<Link
									to={`/app/courses/${courseRouteId({ id: draft.courseId || '', code: draft.code })}`}
									role="menuitem"
								>
									<FileText size={16} /> Dashboard
								</Link>
							) : null}
							{(draft.hasRpsFile || file) && draft.rpsFileUrl ? (
								<a href={draft.rpsFileUrl} target="_blank" rel="noreferrer" role="menuitem">
									<Download size={16} /> Download RPS
								</a>
							) : null}
							<button type="button" role="menuitem" onClick={() => setShowUpload((v) => !v)}>
								<Upload size={16} /> {showUpload ? 'Tutup unggah' : 'Impor PDF'}
							</button>
						</OverflowMenu>
						<button
							type="button"
							className="ld-btn-primary"
							disabled={saving || !draft.title.trim()}
							onClick={() => void persistAll(true)}
						>
							{saving ? <LoaderCircle size={18} className="spin" /> : <Save size={16} />}
							Simpan RPS
						</button>
					</div>
				</header>

				{showUpload && (
					<div className="rps-upload-panel">
						<button
							type="button"
							className="pdf-dropzone"
							onClick={() => inputRef.current?.click()}
						>
							<span className="pdf-dropzone-icon">
								<Upload size={26} strokeWidth={1.5} />
							</span>
							<strong>{file ? file.name : 'Pilih berkas PDF RPS'}</strong>
							<span className="pdf-dropzone-hint">
								{file
									? `${(file.size / 1024).toFixed(0)} KB · klik untuk mengganti`
									: 'PDF berbasis teks, maks. 10MB — AI akan memetakan ke langkah-langkah di bawah'}
							</span>
						</button>
						<input
							ref={inputRef}
							type="file"
							accept="application/pdf,.pdf"
							className="pdf-file-input"
							onChange={(e) => {
								const f = e.target.files?.[0] ?? null;
								if (f && f.type && f.type !== 'application/pdf') {
									setError('Berkas harus berformat PDF.');
									return;
								}
								setFile(f);
								setError('');
							}}
						/>
						<div className="rps-upload-actions">
							<button
								type="button"
								className="ld-btn-primary"
								disabled={!file || parsing}
								onClick={() => void analyzePdf()}
							>
								{parsing ? (
									<LoaderCircle size={18} className="spin" />
								) : (
									<>
										<Wand2 size={17} /> Baca & petakan dengan AI
									</>
								)}
							</button>
							{!courseId && (
								<button
									type="button"
									className="ld-btn-quiet"
									onClick={() => setShowUpload(false)}
								>
									Isi manual tanpa PDF
								</button>
							)}
						</div>
						{stages && <ImportDiagnostics stages={stages} source={importSource} />}
					</div>
				)}

				<FormStepper
					ariaLabel="Langkah RPS"
					current={step}
					steps={RPS_STEPS.map((s) => ({ id: s.id, label: s.short }))}
					completed={
						new Set(
							RPS_STEPS.filter((s) => completedSteps.has(s.id) || step > s.id).map((s) => s.id),
						)
					}
					canSelect={() => true}
					onSelect={setStep}
				/>
				<div className="rps-step-title">
					<span>{RPS_STEPS[step - 1]?.label}</span>
					<small>Langkah {step} dari {RPS_STEPS.length}</small>
				</div>

				{error && (
					<div className="ld-alert" role="alert">
						{error}{' '}
						{limitFocus && (
							<button type="button" onClick={() => setFocusTick((n) => n + 1)}>
								Ke isian
							</button>
						)}
						<button
							type="button"
							onClick={() => {
								setError('');
								setLimitFocus(null);
							}}
						>
							Tutup
						</button>
					</div>
				)}
				{saveMsg && (
					<div className="rps-save-msg" role="status">
						<Check size={16} /> {saveMsg}
					</div>
				)}
				{thumbStatus === 'generating' && (
				<div className="rps-save-msg rps-thumb-status" role="status">
					<LoaderCircle size={16} className="spin" /> Menghasilkan thumbnail mata kuliah dengan AI...
				</div>
			)}
			{thumbStatus === 'done' && (
				<div className="rps-save-msg" role="status">
					<Check size={16} /> Thumbnail mata kuliah dibuat dengan AI.
				</div>
			)}
			{thumbStatus === 'failed' && (
				<div className="rps-save-msg rps-thumb-failed" role="status">
					<AlertTriangle size={16} /> Thumbnail tidak dapat dibuat — gradient default dipakai.
				</div>
			)}
			{draft.warnings.length > 0 && step === 7 && (
					<div className="pdf-warnings" role="status">
						<AlertTriangle size={16} />
						<div>
							<strong>Perhatian dari hasil impor:</strong>
							<ul>
								{draft.warnings.map((w) => (
									<li key={w}>{w}</li>
								))}
							</ul>
						</div>
					</div>
				)}

				<div className="rps-step-body">
					{step === 1 && (
						<>
							<SectionTextImport step={1} onApply={applySectionImport} />
							<StepIdentity draft={draft} set={set} />
						</>
					)}
					{step === 2 && (
						<>
							<SectionTextImport step={2} onApply={applySectionImport} />
							<StepOutcomes
								draft={draft}
								setDraft={setDraft}
								expandCpmk={
									limitFocus?.expand?.kind === 'cpmk' ? limitFocus.expand.index : null
								}
							/>
						</>
					)}
					{step === 3 && (
						<>
							<SectionTextImport step={3} onApply={applySectionImport} />
							<StepPlan
								draft={draft}
								setDraft={setDraft}
								courseId={draft.courseId}
								expandSession={
									limitFocus?.expand?.kind === 'session' ? limitFocus.expand.index : null
								}
							/>
						</>
					)}
					{step === 4 && (
						<>
							<SectionTextImport step={4} onApply={applySectionImport} />
							<StepWorkload draft={draft} set={set} />
						</>
					)}
					{step === 5 && (
						<>
							<SectionTextImport step={5} onApply={applySectionImport} />
							<StepAssessment draft={draft} setDraft={setDraft} set={set} />
						</>
					)}
					{step === 6 && (
						<>
							<SectionTextImport step={6} onApply={applySectionImport} />
							<StepCollab draft={draft} setDraft={setDraft} />
						</>
					)}
					{step === 7 && (
						<StepReview
							draft={draft}
							miss={miss}
							file={file}
							onSave={() => void persistAll(true)}
							saving={saving}
						/>
					)}
				</div>

				<footer className="rps-step-footer">
					<button
						type="button"
						className="ld-outline-action"
						disabled={step <= 1}
						onClick={() => setStep((s) => Math.max(1, s - 1))}
					>
						<ChevronLeft size={16} /> Sebelumnya
					</button>
					<div className="rps-step-footer-mid">
						<button
							type="button"
							className="ld-btn-quiet"
							disabled={saving || !draft.title.trim()}
							onClick={() => void persistAll(false)}
						>
							{saving ? <LoaderCircle size={16} className="spin" /> : <Save size={15} />}
							Simpan draf
						</button>
					</div>
					{step < 7 ? (
						<button type="button" className="ld-btn-primary" onClick={() => void goNext()}>
							Berikutnya <ChevronRight size={16} />
						</button>
					) : (
						<button
							type="button"
							className="ld-btn-primary"
							disabled={saving || !draft.title.trim()}
							onClick={() => void persistAll(true)}
						>
							{saving ? <LoaderCircle size={18} className="spin" /> : <Check size={16} />}
							Selesai & simpan
						</button>
					)}
				</footer>
			</div>
		</AppShell>
	);
}

function FieldWarn({ show }: { show: boolean }) {
	if (!show) return null;
	return <em className="rps-field-warn">Belum diisi</em>;
}

const SECTION_IMPORT_LABELS: Record<number, { title: string; hint: string; placeholder: string }> = {
	1: {
		title: 'Impor teks identitas',
		hint: 'Tempel teks header RPS (nama, kode, semester, SKS, dosen). Setiap baris berlabel akan dipetakan otomatis.',
		placeholder: 'Nama Mata Kuliah: Schreiben A1\nKode: JR242\nSKS: 2\nSemester: Ganjil\nTahun Akademik: 2025/2026\nDosen Pengampu: ...',
	},
	2: {
		title: 'Impor teks capaian',
		hint: 'Tempel bagian CPL, CPMK/Sub-CPMK, deskripsi, silabus, strategi, atau referensi. Pisahkan dengan judul bagian (CPL:, CPMK:) untuk hasil terbaik.',
		placeholder: 'CPL:\n1. CPL-1 Mampu memahami percakapan sederhana...\nCPMK:\n1. CPMK-1 Mahasiswa mampu menulis teks pendek...\n   a. Sub-CPMK-1 ...',
	},
	3: {
		title: 'Impor jadwal pertemuan',
		hint: 'Tempel jadwal mingguan. Gunakan penanda "Pertemuan ke-1" / "Minggu 1" atau baris bernomor 1–16.',
		placeholder: 'Pertemuan ke-1: Pengenalan dan kontrak belajar\nPertemuan ke-2: Teks deskriptif sederhana\n...',
	},
	4: {
		title: 'Impor teks beban kerja',
		hint: 'Tempel alokasi jam. Label seperti "Kuliah: 16", "Belajar mandiri: 32", "Total: 48" akan dipetakan ke field numerik.',
		placeholder: 'Kuliah: 16 jam\nBelajar mandiri: 32 jam\nTotal: 48 jam',
	},
	5: {
		title: 'Impor teks penilaian',
		hint: 'Tempel komponen dan bobot penilaian. Gunakan penomoran/bullet dan sertakan bobot seperti "UTS 30%" bila ada.',
		placeholder: '1. UTS 30% — Ujian tengah semester\n2. UAS 40% — Ujian akhir semester\n3. Tugas 30% — Tugas harian',
	},
	6: {
		title: 'Impor teks tugas kolaboratif',
		hint: 'Tempel rancangan tugas kelompok. Pisahkan setiap tugas dengan penomoran atau bullet.',
		placeholder: '1. Proyek mini: mahasiswa membuat poster perkelompok...\n2. Presentasi kelompok: ...',
	},
};

function SectionTextImport({
	step,
	onApply,
}: {
	step: number;
	onApply: (patch: SectionPatch, mode: 'merge' | 'replace') => void;
}) {
	const [open, setOpen] = useState(false);
	const [format, setFormat] = useState<'text' | 'csv'>('text');
	const [text, setText] = useState('');
	const [result, setResult] = useState<SectionParseResult | null>(null);
	const [replace, setReplace] = useState(false);
	const [copied, setCopied] = useState(false);
	const parser = SECTION_PARSERS[step];
	const meta = SECTION_IMPORT_LABELS[step];
	const csvTpl = CSV_TEMPLATES[step];
	const promptText = getSectionPrompt(step);
	const promptLabel = SECTION_PROMPT_LABELS[step];
	if (!parser || !meta) return null;

	const analyze = () => {
		if (!text.trim()) return;
		setResult(format === 'csv' ? parseSectionCsv(step, text) : parser(text));
	};

	const copyPrompt = async () => {
		if (!promptText) return;
		const ok = await copyToClipboard(promptText);
		if (ok) {
			setCopied(true);
			setFormat('csv');
			setTimeout(() => setCopied(false), 2600);
		}
	};

	const apply = () => {
		if (!result) return;
		onApply(result.patch, replace ? 'replace' : 'merge');
		setText('');
		setResult(null);
		setReplace(false);
		setOpen(false);
	};

	const switchFormat = (next: 'text' | 'csv') => {
		setFormat(next);
		setResult(null);
	};

	return (
		<div className="rps-section-import">
			<button type="button" className="rps-section-import-toggle" onClick={() => setOpen((v) => !v)}>
				<Wand2 size={15} />
				{meta.title}
				<ChevronRight size={15} className={open ? 'rps-chev-open' : ''} />
			</button>
			{open && (
				<div className="rps-section-import-body">
					<div className="rps-import-format" role="tablist" aria-label="Format impor">
						<button
							type="button"
							role="tab"
							aria-selected={format === 'text'}
							className={`rps-format-tab${format === 'text' ? ' active' : ''}`}
							onClick={() => switchFormat('text')}
						>
							<Wand2 size={14} /> Teks bebas
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={format === 'csv'}
							className={`rps-format-tab${format === 'csv' ? ' active' : ''}`}
							onClick={() => switchFormat('csv')}
						>
							<FileSpreadsheet size={14} /> CSV
						</button>
						{promptText && (
							<button
								type="button"
								className="rps-csv-download"
								onClick={() => void copyPrompt()}
								title="Salin prompt siap pakai untuk ChatGPT / LLM, lalu tempel hasil CSV-nya di kotak di bawah"
							>
								{copied ? <Check size={14} /> : <Copy size={14} />}
								{copied ? 'Prompt disalin!' : promptLabel}
							</button>
						)}
						{csvTpl && (
							<button
								type="button"
								className="rps-csv-download rps-csv-download-alt"
								onClick={() => downloadCsvTemplate(step)}
								title="Unduh contoh CSV untuk bagian ini"
							>
								<Download size={14} /> Contoh CSV
							</button>
						)}
					</div>
					{copied && (
						<p className="rps-prompt-copied" role="status">
							<Check size={13} /> Prompt siap pakai disalin ke papan klip. Tempelkan ke
							ChatGPT/LLM, lampirkan PDF atau tempel teks RPS Anda di bagian yang ditandai,
							lalu salin hasil CSV-nya kembali ke kotak di bawah dan klik “Petakan CSV”.
						</p>
					)}
					<p className="rps-section-import-hint">
						{format === 'csv' && csvTpl ? csvTpl.hint : meta.hint}
					</p>
					{format === 'csv' && csvTpl && (
						<p className="rps-section-import-csv-note">
							<FileSpreadsheet size={13} /> Unduh “Contoh CSV”, edit isinya di aplikasi
							lembar sebar (Excel/Google Sheets), lalu salin-tempel seluruh isi CSV —
							termasuk baris header — ke kotak di bawah. Pisahkan beberapa kode (CPL/CPMK/
							Sub-CPMK/Topik/Penilaian) dengan koma atau titik koma.
						</p>
					)}
					<textarea
						rows={6}
						value={text}
						onChange={(e) => {
							setText(e.target.value);
							setResult(null);
						}}
						placeholder={
							format === 'csv' && csvTpl
								? csvTpl.content.split('\n').slice(0, 3).join('\n') + '\n...'
								: meta.placeholder
						}
					/>
					<div className="rps-section-import-actions">
						<button
							type="button"
							className="ld-btn-soft"
							disabled={!text.trim()}
							onClick={analyze}
						>
							<Wand2 size={15} /> {format === 'csv' ? 'Petakan CSV' : 'Petakan teks'}
						</button>
						<label className="rps-section-import-replace">
							<input
								type="checkbox"
								checked={replace}
								onChange={(e) => setReplace(e.target.checked)}
							/>
							Ganti isi yang sudah ada
						</label>
					</div>
					{result && (
						<div className="rps-section-import-result">
							{result.summary.length > 0 && (
								<div className="rps-section-import-summary">
									<Check size={14} /> Terdeteksi: {result.summary.join(' · ')}
								</div>
							)}
							{result.warnings.map((w) => (
								<p className="rps-section-import-warn" key={w}>
									<AlertTriangle size={13} /> {w}
								</p>
							))}
							<div className="rps-section-import-apply">
								<button
									type="button"
									className="ld-btn-primary"
									disabled={result.summary.length === 0 && result.warnings.length > 0}
									onClick={apply}
								>
									<Check size={15} /> {replace ? 'Ganti isi bagian' : 'Gabungkan ke bagian'}
								</button>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function DiagRow({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'err' }) {
	return (
		<div className={`rps-diag-row${tone ? ` ${tone}` : ''}`}>
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

function ImportDiagnostics({
	stages,
	source,
}: {
	stages: ImportStages;
	source: 'ai' | 'heuristic' | 'table' | null;
}) {
	const { extract, table, ai, normalize } = stages;
	const sourceLabel =
		source === 'heuristic' ? 'Parser cadangan' : source === 'table' ? 'Tabel + AI' : 'AI';
	return (
		<div className="rps-diag" role="status">
			<div className="rps-diag-head">
				<FileText size={15} />
				<strong>Hasil pemrosesan PDF</strong>
				<span className={`rps-diag-tag${source === 'heuristic' ? ' warn' : ''}`}>
					{sourceLabel}
				</span>
			</div>
			<div className="rps-diag-cols">
				<div className="rps-diag-col">
					<span className="rps-diag-title">1. Ekstraksi teks (lokal)</span>
					<DiagRow
						label="Status"
						value={extract.ok ? 'Berhasil' : 'Gagal'}
						tone={extract.ok ? 'ok' : 'err'}
					/>
					<DiagRow label="Halaman" value={String(extract.pages || '—')} />
					<DiagRow label="Karakter" value={extract.chars.toLocaleString('id-ID')} />
					<DiagRow label="Tabel terbaca" value={String(extract.tables)} />
					{extract.error && <p className="rps-diag-note">{extract.error}</p>}
				</div>
				<div className="rps-diag-col">
					<span className="rps-diag-title">2. Pemetaan tabel jadwal</span>
					<DiagRow
						label="Status"
						value={table?.detected ? 'Terdeteksi' : 'Tidak ada'}
						tone={table?.detected ? 'ok' : undefined}
					/>
					<DiagRow label="Sesi terbaca" value={String(table?.rows ?? 0)} />
					<p className="rps-diag-note">
						{table?.detected
							? 'Jadwal mingguan dipetakan langsung dari penanda nomor minggu — tidak bergantung pada AI.'
							: 'Bagian jadwal tidak terdeteksi; sesi diisi oleh AI atau parser heuristik.'}
					</p>
				</div>
				<div className="rps-diag-col">
					<span className="rps-diag-title">3. Pemetaan AI → JSON</span>
					<DiagRow
						label="Status"
						value={ai.ok ? 'Berhasil' : 'Gagal'}
						tone={ai.ok ? 'ok' : 'err'}
					/>
					<DiagRow label="Percobaan" value={String(ai.attempts)} />
					<DiagRow label="Teks masuk" value={ai.inputChars.toLocaleString('id-ID')} />
					<DiagRow label="Output mentah" value={ai.outputChars.toLocaleString('id-ID')} />
					<DiagRow
						label="JSON diperbaiki"
						value={ai.repaired ? 'Ya (terpotong)' : 'Tidak'}
						tone={ai.repaired ? 'warn' : undefined}
					/>
					{ai.error && <p className="rps-diag-note">{ai.error}</p>}
				</div>
				<div className="rps-diag-col">
					<span className="rps-diag-title">4. Normalisasi & validasi</span>
					<DiagRow label="CPL" value={String(normalize.cpl)} />
					<DiagRow label="CPMK / Sub" value={`${normalize.cpmk} / ${normalize.subCpmk}`} />
					<DiagRow label="Topik" value={String(normalize.topics)} />
					<DiagRow label="Penilaian" value={String(normalize.assessments)} />
					<DiagRow label="Pertemuan" value={String(normalize.sessions)} />
					<DiagRow label="Tugas kolaboratif" value={String(normalize.collab)} />
					<DiagRow
						label="Peringatan"
						value={String(normalize.warnings)}
						tone={normalize.warnings > 0 ? 'warn' : undefined}
					/>
				</div>
			</div>
		</div>
	);
}

function StepIdentity({
	draft,
	set,
}: {
	draft: RpsDraft;
	set: <K extends keyof RpsDraft>(f: K, v: RpsDraft[K]) => void;
}) {
	return (
		<div className="rps-card editor-form">
			<label className={isFieldMissing(draft, 'title') ? 'rps-missing' : ''}>
				NAMA MATA KULIAH <span>*</span>
				<FieldWarn show={isFieldMissing(draft, 'title')} />
				<input
					id="rps-field-title"
					value={draft.title}
					maxLength={200}
					onChange={(e) => set('title', e.target.value)}
					placeholder="mis. Schreiben A1"
				/>
			</label>
			<div className="form-two">
				<label className={isFieldMissing(draft, 'code') ? 'rps-missing' : ''}>
					KODE
					<FieldWarn show={isFieldMissing(draft, 'code')} />
					<input
						id="rps-field-code"
						value={draft.code}
						maxLength={40}
						onChange={(e) => set('code', e.target.value)}
						placeholder="mis. JR242"
					/>
				</label>
				<label>
					SKS / KREDIT
					<FieldWarn show={draft.credits == null} />
					<input
						type="number"
						min={0}
						step={0.5}
						value={numOrEmpty(draft.credits)}
						onChange={(e) => set('credits', parseNum(e.target.value))}
						placeholder="mis. 2"
					/>
				</label>
			</div>
			<div className="form-two">
				<label>
					SEMESTER
					<input
						id="rps-field-semester"
						value={draft.semester}
						onChange={(e) => set('semester', e.target.value)}
						placeholder="mis. Ganjil / 1"
					/>
				</label>
				<label>
					TAHUN AKADEMIK
					<input
						id="rps-field-year"
						value={draft.academicYear}
						onChange={(e) => set('academicYear', e.target.value)}
						placeholder="mis. 2025/2026"
					/>
				</label>
			</div>
			<div className="form-two">
				<label>
					KELOMPOK / RUMPUN MK
					<input
						id="rps-field-group"
						value={draft.courseGroup}
						onChange={(e) => set('courseGroup', e.target.value)}
						placeholder="opsional"
					/>
				</label>
				<label>
					DOSEN PENGAMPU (DIBUAT OLEH)
					<input
						id="rps-field-lecturer"
						value={draft.lecturerName}
						onChange={(e) => set('lecturerName', e.target.value)}
						placeholder="Nama dosen"
					/>
				</label>
			</div>
			<div className="form-two">
				<label>
					DIPERIKSA OLEH (TPK PROGRAM STUDI)
					<input
						id="rps-field-reviewer"
						value={draft.reviewerName}
						onChange={(e) => set('reviewerName', e.target.value)}
						placeholder="Nama pemeriksa"
					/>
				</label>
				<label>
					DISETUJUI OLEH (KETUA PROGRAM STUDI)
					<input
						id="rps-field-approver"
						value={draft.approverName}
						onChange={(e) => set('approverName', e.target.value)}
						placeholder="Nama penyetuju"
					/>
				</label>
			</div>
			<label>
				PRASYARAT
				<textarea
					id="rps-field-prerequisites"
					rows={2}
					value={draft.prerequisites}
					className={runeCount(draft.prerequisites) > LIMITS.prerequisites ? 'rps-over' : undefined}
					aria-invalid={runeCount(draft.prerequisites) > LIMITS.prerequisites || undefined}
					onChange={(e) => set('prerequisites', e.target.value)}
					placeholder="Mata kuliah prasyarat bila ada"
				/>
				<CharMeter value={draft.prerequisites} max={LIMITS.prerequisites} />
			</label>
			<label>
				TANGGAL PENETAPAN / PUBLIKASI
				<input
					type="date"
					value={draft.publishedAt}
					onChange={(e) => set('publishedAt', e.target.value)}
				/>
			</label>
			<label>
				BEBAN KERJA (ringkas)
				<textarea
					rows={2}
					value={draft.workload}
					className={runeCount(draft.workload) > LIMITS.workloadNotes ? 'rps-over' : undefined}
					onChange={(e) => set('workload', e.target.value)}
					placeholder="Ringkasan beban kerja — detail di langkah Workload"
				/>
				<CharMeter value={draft.workload} max={LIMITS.workloadNotes} />
			</label>
		</div>
	);
}

function ItemEditor({
	title,
	items,
	onChange,
	codePh,
	descPh,
	idPrefix,
}: {
	title: string;
	items: DraftItem[];
	onChange: (items: DraftItem[]) => void;
	codePh: string;
	descPh: string;
	idPrefix: string;
}) {
	return (
		<div className="pdf-item-group">
			<div className="pdf-item-head">
				<strong>{title}</strong>
				<button
					type="button"
					className="ld-btn-soft"
					onClick={() => onChange([...items, { code: '', description: '' }])}
				>
					<Plus size={15} /> Tambah
				</button>
			</div>
			{items.length === 0 ? (
				<p className="ld-empty-sm">Belum ada item. Tambahkan atau impor dari PDF.</p>
			) : (
				<ul className="pdf-session-list">
					{items.map((item, i) => (
						<li className="pdf-session-row" key={item.id || i}>
							<label className="pdf-week pdf-week-code">
								KODE
								<input
									id={`${idPrefix}-${i}-code`}
									value={item.code}
									maxLength={40}
									placeholder={codePh}
									onChange={(e) =>
										onChange(
											items.map((it, idx) =>
												idx === i ? { ...it, code: e.target.value } : it,
											),
										)
									}
								/>
							</label>
							<div className="pdf-session-fields">
								<textarea
									id={`${idPrefix}-${i}-desc`}
									rows={2}
									placeholder={descPh}
									value={item.description}
									className={
										runeCount(item.description) > LIMITS.itemDescription ? 'rps-over' : undefined
									}
									aria-invalid={
										runeCount(item.description) > LIMITS.itemDescription || undefined
									}
									onChange={(e) =>
										onChange(
											items.map((it, idx) =>
												idx === i ? { ...it, description: e.target.value } : it,
											),
										)
									}
								/>
								{runeCount(item.description) >= Math.floor(LIMITS.itemDescription * 0.85) && (
									<CharMeter value={item.description} max={LIMITS.itemDescription} />
								)}
							</div>
							<button
								type="button"
								className="pdf-session-remove"
								aria-label="Hapus"
								onClick={() => onChange(items.filter((_, idx) => idx !== i))}
							>
								<Trash2 size={16} />
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function StepOutcomes({
	draft,
	setDraft,
	expandCpmk,
}: {
	draft: RpsDraft;
	setDraft: Dispatch<SetStateAction<RpsDraft>>;
	expandCpmk?: number | null;
}) {
	const [open, setOpen] = useState<Set<number>>(new Set());
	useEffect(() => {
		if (expandCpmk == null) return;
		setOpen((prev) => {
			if (prev.has(expandCpmk)) return prev;
			const next = new Set(prev);
			next.add(expandCpmk);
			return next;
		});
	}, [expandCpmk]);
	const composed = composeRpsText(draft);
	const composedOver = runeCount(composed) > LIMITS.rps;
	return (
		<div className="rps-card rps-stack">
			<div
				id="rps-field-composed"
				className={`rps-composed${composedOver ? ' over' : ''}`}
				tabIndex={-1}
			>
				<div>
					<strong>Teks RPS tersusun</strong>
					<p>
						{composedOver
							? 'Gabungan CPL, CPMK, strategi, penilaian, beban kerja, dan referensi melebihi batas simpan. Pendekkan bagian terpanjang — tidak ada teks yang dihapus otomatis.'
							: 'Gabungan capaian, strategi, penilaian, beban kerja, dan referensi. Data terstruktur tetap disimpan terpisah.'}
					</p>
				</div>
				<CharMeter value={composed} max={LIMITS.rps} />
			</div>
			<label className="editor-form">
				DESKRIPSI MATA KULIAH
				<textarea
					id="rps-field-description"
					rows={4}
					value={draft.description}
					className={runeCount(draft.description) > LIMITS.description ? 'rps-over' : undefined}
					aria-invalid={runeCount(draft.description) > LIMITS.description || undefined}
					onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
					placeholder="Deskripsi singkat mata kuliah"
				/>
				<CharMeter value={draft.description} max={LIMITS.description} />
			</label>
			<label className="editor-form">
				SILABUS / GARIS BESAR
				<textarea
					id="rps-field-syllabus"
					rows={3}
					value={draft.syllabus}
					className={runeCount(draft.syllabus) > LIMITS.syllabus ? 'rps-over' : undefined}
					aria-invalid={runeCount(draft.syllabus) > LIMITS.syllabus || undefined}
					onChange={(e) => setDraft((p) => ({ ...p, syllabus: e.target.value }))}
				/>
				<CharMeter value={draft.syllabus} max={LIMITS.syllabus} />
			</label>
			<label className="editor-form">
				STRATEGI PEMBELAJARAN
				<textarea
					id="rps-field-strategies"
					rows={2}
					value={draft.strategies}
					className={runeCount(draft.strategies) > LIMITS.strategies ? 'rps-over' : undefined}
					aria-invalid={runeCount(draft.strategies) > LIMITS.strategies || undefined}
					onChange={(e) => setDraft((p) => ({ ...p, strategies: e.target.value }))}
				/>
				<CharMeter value={draft.strategies} max={LIMITS.strategies} />
			</label>
			<label className="editor-form">
				LANGKAH PEMBELAJARAN
				<textarea
					id="rps-field-learning-steps"
					rows={3}
					value={draft.learningSteps}
					className={runeCount(draft.learningSteps) > LIMITS.learningSteps ? 'rps-over' : undefined}
					aria-invalid={runeCount(draft.learningSteps) > LIMITS.learningSteps || undefined}
					onChange={(e) => setDraft((p) => ({ ...p, learningSteps: e.target.value }))}
					placeholder="Langkah pembelajaran (prose naratif)"
				/>
				<CharMeter value={draft.learningSteps} max={LIMITS.learningSteps} />
			</label>
			<label className="editor-form">
				HASIL BELAJAR YANG DAPAT DIPERAGAKAN
				<textarea
					id="rps-field-outcomes"
					rows={3}
					value={draft.demonstrableOutcomes}
					className={runeCount(draft.demonstrableOutcomes) > LIMITS.demonstrableOutcomes ? 'rps-over' : undefined}
					aria-invalid={runeCount(draft.demonstrableOutcomes) > LIMITS.demonstrableOutcomes || undefined}
					onChange={(e) => setDraft((p) => ({ ...p, demonstrableOutcomes: e.target.value }))}
					placeholder="Hasil belajar yang dapat diperagakan/ditunjukkan dengan bukti"
				/>
				<CharMeter value={draft.demonstrableOutcomes} max={LIMITS.demonstrableOutcomes} />
			</label>
			<label className="editor-form">
				REFERENSI
				<textarea
					id="rps-field-references"
					rows={2}
					value={draft.references}
					onChange={(e) => setDraft((p) => ({ ...p, references: e.target.value }))}
				/>
			</label>

			<ItemEditor
				title="CPL (Capaian Pembelajaran Lulusan)"
				items={draft.cplItems}
				codePh="CPL-1"
				descPh="Deskripsi CPL"
				idPrefix="rps-cpl"
				onChange={(cplItems) => setDraft((p) => ({ ...p, cplItems }))}
			/>

			<div className="pdf-item-group">
				<div className="pdf-item-head">
					<strong>CPMK / Sub-CPMK</strong>
					<button
						type="button"
						className="ld-btn-soft"
						onClick={() =>
							setDraft((p) => ({
								...p,
								cpmkItems: [
									...p.cpmkItems,
									{ code: '', description: '', cplCode: '', subCpmk: [] },
								],
							}))
						}
					>
						<Plus size={15} /> Tambah CPMK
					</button>
				</div>
				{draft.cpmkItems.length === 0 ? (
					<p className="ld-empty-sm">Belum ada CPMK.</p>
				) : (
					<ul className="pdf-cpmk-list">
						{draft.cpmkItems.map((cpmk, i) => (
							<li className="pdf-cpmk-row" key={cpmk.id || i}>
								<div className="pdf-cpmk-main">
									<div className="form-two">
										<input
											id={`rps-cpmk-${i}-code`}
											placeholder="Kode CPMK"
											maxLength={40}
											value={cpmk.code}
											onChange={(e) =>
												setDraft((p) => ({
													...p,
													cpmkItems: p.cpmkItems.map((it, idx) =>
														idx === i ? { ...it, code: e.target.value } : it,
													),
												}))
											}
										/>
										<input
											placeholder="Kode CPL induk"
											value={cpmk.cplCode}
											onChange={(e) =>
												setDraft((p) => ({
													...p,
													cpmkItems: p.cpmkItems.map((it, idx) =>
														idx === i ? { ...it, cplCode: e.target.value } : it,
													),
												}))
											}
										/>
									</div>
									<textarea
										id={`rps-cpmk-${i}-desc`}
										rows={2}
										placeholder="Deskripsi CPMK"
										className={
											runeCount(cpmk.description) > LIMITS.itemDescription ? 'rps-over' : undefined
										}
										aria-invalid={runeCount(cpmk.description) > LIMITS.itemDescription || undefined}
										value={cpmk.description}
										onChange={(e) =>
											setDraft((p) => ({
												...p,
												cpmkItems: p.cpmkItems.map((it, idx) =>
													idx === i ? { ...it, description: e.target.value } : it,
												),
											}))
										}
									/>
									<div className="form-two">
										<label>
											TAKSONOMI
											<input
												id={`rps-cpmk-${i}-taxonomy`}
												type="number"
												min={0}
												max={10}
												value={cpmk.taxonomy == null ? '' : cpmk.taxonomy}
												onChange={(e) =>
													setDraft((p) => ({
														...p,
														cpmkItems: p.cpmkItems.map((it, idx) =>
															idx === i ? { ...it, taxonomy: e.target.value === '' ? null : Number(e.target.value) } : it,
														),
													}))
												}
												placeholder="mis. 4"
											/>
										</label>
										<label>
											BOBOT (%)
											<input
												id={`rps-cpmk-${i}-weight`}
												type="number"
												min={0}
												max={100}
												value={cpmk.weight == null ? '' : cpmk.weight}
												onChange={(e) =>
													setDraft((p) => ({
														...p,
														cpmkItems: p.cpmkItems.map((it, idx) =>
															idx === i ? { ...it, weight: e.target.value === '' ? null : Number(e.target.value) } : it,
														),
													}))
												}
												placeholder="mis. 10"
											/>
										</label>
									</div>
									<label>
										KRITERIA PENCAPAIAN CPMK
										<textarea
											id={`rps-cpmk-${i}-criteria`}
											rows={2}
											value={cpmk.criteria || ''}
											className={runeCount(cpmk.criteria || '') > LIMITS.cpmkCriteria ? 'rps-over' : undefined}
											onChange={(e) =>
												setDraft((p) => ({
													...p,
														cpmkItems: p.cpmkItems.map((it, idx) =>
															idx === i ? { ...it, criteria: e.target.value } : it,
														),
													}))
												}
											placeholder="Kriteria pencapaian CPMK"
										/>
									</label>
									<div className="pdf-cpmk-actions">
										<button
											type="button"
											className="pdf-sub-toggle"
											onClick={() =>
												setOpen((prev) => {
													const n = new Set(prev);
													if (n.has(i)) n.delete(i);
													else n.add(i);
													return n;
												})
											}
										>
											Sub-CPMK ({cpmk.subCpmk.length})
										</button>
										<button
											type="button"
											className="ld-text-btn"
											onClick={() =>
												setDraft((p) => ({
													...p,
													cpmkItems: p.cpmkItems.map((it, idx) =>
														idx === i
															? {
																	...it,
																	subCpmk: [...it.subCpmk, { code: '', description: '' }],
																}
															: it,
													),
												}))
											}
										>
											<Plus size={14} /> Sub-CPMK
										</button>
										<button
											type="button"
											className="pdf-session-remove"
											onClick={() =>
												setDraft((p) => ({
													...p,
													cpmkItems: p.cpmkItems.filter((_, idx) => idx !== i),
												}))
											}
										>
											<Trash2 size={16} />
										</button>
									</div>
									{open.has(i) &&
										cpmk.subCpmk.map((sub, j) => (
											<div className="pdf-sub-row" key={sub.id || j}>
												<input
													id={`rps-sub-${i}-${j}-code`}
													placeholder="Kode"
													maxLength={40}
													value={sub.code}
													onChange={(e) =>
														setDraft((p) => ({
															...p,
															cpmkItems: p.cpmkItems.map((it, idx) =>
																idx === i
																	? {
																			...it,
																			subCpmk: it.subCpmk.map((s, jdx) =>
																				jdx === j ? { ...s, code: e.target.value } : s,
																			),
																		}
																	: it,
															),
														}))
													}
												/>
												<textarea
													id={`rps-sub-${i}-${j}-desc`}
													rows={2}
													placeholder="Deskripsi sub-CPMK"
													className={
														runeCount(sub.description) > LIMITS.itemDescription
															? 'rps-over'
															: undefined
													}
													aria-invalid={
														runeCount(sub.description) > LIMITS.itemDescription || undefined
													}
													value={sub.description}
													onChange={(e) =>
														setDraft((p) => ({
															...p,
															cpmkItems: p.cpmkItems.map((it, idx) =>
																idx === i
																	? {
																			...it,
																			subCpmk: it.subCpmk.map((s, jdx) =>
																				jdx === j
																					? { ...s, description: e.target.value }
																					: s,
																			),
																		}
																	: it,
															),
														}))
													}
												/>
												<button
													type="button"
													className="pdf-session-remove"
													onClick={() =>
														setDraft((p) => ({
															...p,
															cpmkItems: p.cpmkItems.map((it, idx) =>
																idx === i
																	? {
																			...it,
																			subCpmk: it.subCpmk.filter((_, jdx) => jdx !== j),
																		}
																	: it,
															),
														}))
													}
												>
													<Trash2 size={15} />
												</button>
											</div>
										))}
								</div>
							</li>
						))}
					</ul>
				)}
			</div>

			<ItemEditor
				title="Topik / Materi"
				items={draft.topicItems}
				codePh="T1"
				descPh="Deskripsi topik"
				idPrefix="rps-topic"
				onChange={(topicItems) => setDraft((p) => ({ ...p, topicItems }))}
			/>
		</div>
	);
}

function DuplicateSessionsCleanup({
	courseId,
	draft,
}: {
	courseId: string | null;
	draft: RpsDraft;
}) {
	const [stored, setStored] = useState<ClassSession[]>([]);
	const [loading, setLoading] = useState(false);
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState('');
	const [error, setError] = useState('');

	const load = useCallback(async () => {
		if (!courseId) {
			setStored([]);
			return;
		}
		setLoading(true);
		setError('');
		try {
			const filter = pb.filter('course = {:id}', { id: courseId });
			const rows = await cachedQuery<ClassSession[]>(`class_sessions:course=${courseId}`, () =>
				pb.collection('class_sessions').getFullList<ClassSession>({
					filter,
					sort: 'week,created',
			}),
			);
			setStored(rows);
		} catch (err) {
			if (!isAbortError(err)) setError(errorMessage(err));
		} finally {
			setLoading(false);
		}
	}, [courseId]);

	useEffect(() => {
		let ignore = false;
		void (async () => {
			if (!courseId) {
				setStored([]);
				return;
			}
			setLoading(true);
			setError('');
			try {
				const filter = pb.filter('course = {:id}', { id: courseId });
				const rows = await cachedQuery<ClassSession[]>(
					`class_sessions:course=${courseId}`,
					() =>
						pb.collection('class_sessions').getFullList<ClassSession>({
							filter,
							sort: 'week,created',
						}),
				);
				if (!ignore) setStored(rows);
			} catch (err) {
				if (!ignore && !isAbortError(err)) setError(errorMessage(err));
			} finally {
				if (!ignore) setLoading(false);
			}
		})();
		return () => {
			ignore = true;
		};
	}, [courseId]);

	// Detect duplicate weeks (more than one stored row per week) and orphan
	// weeks (stored rows whose week is not represented in the draft). Only the
	// extras beyond the first per week are candidates for removal — the first
	// row per week is always kept so legitimate sessions are never discarded.
	const draftWeeks = useMemo(
		() => new Set(draft.sessions.map((s) => s.week)),
		[draft.sessions],
	);
	const { duplicates, orphanExtras } = useMemo(() => {
		const byWeek = new Map<number, ClassSession[]>();
		for (const s of stored) {
			const arr = byWeek.get(s.week) || [];
			arr.push(s);
			byWeek.set(s.week, arr);
		}
		const keep = new Set<string>();
		const dups: ClassSession[] = [];
		const orph: ClassSession[] = [];
		for (const [week, rows] of byWeek) {
			rows.forEach((r, i) => {
				if (i === 0) keep.add(r.id);
				else dups.push(r);
			});
			if (!draftWeeks.has(week)) orph.push(...rows);
		}
		return {
			duplicates: dups,
			orphanExtras: orph.filter((o) => !keep.has(o.id)),
		};
	}, [stored, draftWeeks]);

	const removable = useMemo(() => {
		const ids = new Set(duplicates.map((d) => d.id));
		orphanExtras.forEach((o) => ids.add(o.id));
		return ids;
	}, [duplicates, orphanExtras]);

	const hasIssue = duplicates.length > 0 || orphanExtras.length > 0;

	if (loading || error || !courseId || !hasIssue) {
		if (error) {
			return (
				<div className="rps-section-import" style={{ marginBottom: 12 }}>
					<p className="form-error" style={{ margin: 0 }}>
						Gagal memeriksa sesi tersimpan: {error}
					</p>
				</div>
			);
		}
		return null;
	}

	const remove = async () => {
		setBusy(true);
		setError('');
		setMsg('');
		try {
			const ids = [...removable];
			await Promise.all(
				ids.map((id, i) =>
					pb.collection('class_sessions').delete(id, { requestKey: `sess-rm-${i}` }),
				),
			);
			setMsg(`${ids.length} sesi ganda berhasil dihapus.`);
			invalidate('class_sessions');
			await load();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="rps-section-import" style={{ marginBottom: 16 }}>
			<div className="rps-diag">
				<div className="rps-diag-head">
					<AlertTriangle size={16} />
					<strong>Sesi tersimpan tidak sesuai Rencana</strong>
					<span className="rps-diag-tag warn">
						{stored.length} tersimpan · {draft.sessions.length} di rencana
					</span>
				</div>
				<p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: '#667085' }}>
					Terdeteksi {duplicates.length} sesi ganda
					{orphanExtras.length > 0
						? ` dan ${orphanExtras.length} sesi yatim (minggu tidak ada di rencana)`
						: ''}.{' '}
					Ini biasanya terjadi akibat impor berulang. Tinjau daftar di bawah — hanya
					sesi tambahan yang dihapus; satu sesi per minggu selalu dipertahankan.
				</p>
				<ul className="pdf-session-list" style={{ marginTop: 8 }}>
					{[...duplicates, ...orphanExtras].map((s) => (
						<li
							key={s.id}
							style={{
								gridTemplateColumns: '60px minmax(0,1fr) auto',
								display: 'grid',
								gap: 12,
								alignItems: 'center',
								padding: '8px 10px',
								background: '#FEF2F2',
								border: '1px solid #FBE9E7',
								borderRadius: 10,
							}}
						>
							<span style={{ font: '700 11px var(--body)', color: '#E11D48' }}>
								Minggu {s.week}
							</span>
							<span style={{ fontSize: 12, color: '#475467', minWidth: 0 }}>
								{s.title || 'Tanpa judul'}
							</span>
							<span style={{ font: '700 10px var(--body)', color: '#E11D48' }}>
								{duplicates.some((d) => d.id === s.id) ? 'Ganda' : 'Yatim'}
							</span>
						</li>
					))}
				</ul>
				{msg && (
					<div className="rps-save-msg" style={{ marginBottom: 0, marginTop: 8 }}>
						<Check size={15} /> {msg}
					</div>
				)}
				{error && (
					<p className="form-error" style={{ margin: '8px 0 0' }}>
						{error}
					</p>
				)}
				<div className="rps-section-import-apply" style={{ marginTop: 8 }}>
					<button type="button" className="ld-btn-primary" disabled={busy} onClick={remove}>
						{busy ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />} Hapus{' '}
						{removable.size} sesi ganda
					</button>
				</div>
			</div>
		</div>
	);
}

function StepPlan({
	draft,
	setDraft,
	courseId,
	expandSession,
}: {
	draft: RpsDraft;
	setDraft: Dispatch<SetStateAction<RpsDraft>>;
	courseId: string | null;
	expandSession?: number | null;
}) {
	const [open, setOpen] = useState<Set<number>>(new Set());
	useEffect(() => {
		if (expandSession == null) return;
		setOpen((prev) => {
			if (prev.has(expandSession)) return prev;
			const next = new Set(prev);
			next.add(expandSession);
			return next;
		});
	}, [expandSession]);
	const update = (i: number, patch: Partial<DraftSession>) =>
		setDraft((p) => ({
			...p,
			sessions: p.sessions.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
		}));
	return (
		<div className="rps-card">
			<div className="pdf-sessions-head">
				<div>
					<span className="ld-eyebrow">Pertemuan mingguan</span>
					<h3>Rencana Pembelajaran</h3>
				</div>
				<button
					type="button"
					className="ld-btn-soft"
					onClick={() =>
						setDraft((p) => ({
							...p,
							sessions: [
								...p.sessions,
								{ week: p.sessions.length + 1, title: '', topic: '' },
							],
						}))
					}
				>
					<Plus size={15} /> Tambah sesi
				</button>
			</div>
			<DuplicateSessionsCleanup courseId={courseId} draft={draft} />
			{draft.sessions.length === 0 ? (
				<p className="ld-empty-sm">Belum ada sesi. Impor PDF atau tambah manual.</p>
			) : (
				<ul className="pdf-session-list">
					{draft.sessions.map((session, index) => (
						<li className="pdf-session-row pdf-session-row-stack" key={session.id || index}>
							<div className="pdf-session-row-main">
								<label className="pdf-week">
									MINGGU
									<input
										id={`rps-session-${index}-week`}
										type="number"
										min={1}
										max={52}
										value={session.week}
										onChange={(e) => update(index, { week: Number(e.target.value) || 1 })}
									/>
								</label>
								<div className="pdf-session-fields">
									<input
										id={`rps-session-${index}-title`}
										placeholder="Judul pertemuan"
										value={session.title}
										onChange={(e) => update(index, { title: e.target.value })}
									/>
									<textarea
										id={`rps-session-${index}-topic`}
										rows={2}
										placeholder="Topik / materi"
										value={session.topic}
										className={
											runeCount(session.topic) > LIMITS.sessionTopic ? 'rps-over' : undefined
										}
										onChange={(e) => update(index, { topic: e.target.value })}
									/>
									<button
										type="button"
										className="pdf-sub-toggle"
										onClick={() =>
											setOpen((prev) => {
												const n = new Set(prev);
												if (n.has(index)) n.delete(index);
												else n.add(index);
												return n;
											})
										}
									>
										Detail & relasi capaian
									</button>
								</div>
								<button
									type="button"
									className="pdf-session-remove"
									onClick={() =>
										setDraft((p) => ({
											...p,
											sessions: p.sessions.filter((_, i) => i !== index),
										}))
									}
								>
									<Trash2 size={16} />
								</button>
							</div>
							{open.has(index) && (
								<div className="pdf-session-detail">
									<label className="rps-week-type">
										TIPE MINGGU
										<select
											value={session.specialWeekType || 'normal'}
											onChange={(e) =>
												update(index, {
													specialWeekType: e.target.value as DraftSession['specialWeekType'],
												})
											}
										>
											<option value="normal">Pertemuan normal</option>
											<option value="uts">UTS (Ujian Tengah Semester)</option>
											<option value="uas">UAS (Ujian Akhir Semester)</option>
											<option value="khusus">Minggu khusus</option>
										</select>
										{(session.specialWeekType === 'uts' ||
											session.specialWeekType === 'uas' ||
											session.specialWeekType === 'khusus') && (
											<em className="rps-field-warn">
												Minggu khusus tidak wajib mengisi indikator/materi pembelajaran.
											</em>
										)}
									</label>
									<label>
										INDIKATOR PEMBELAJARAN
										<textarea
											id={`rps-session-${index}-indicator`}
											rows={2}
											value={session.learningIndicator || ''}
											onChange={(e) => update(index, { learningIndicator: e.target.value })}
											placeholder="Indikator yang menunjukkan capaian Sub-CPMK pada pertemuan ini"
										/>
									</label>
									<label>
										MATERI PEMBELAJARAN
										<textarea
											id={`rps-session-${index}-material`}
											rows={2}
											value={session.learningMaterial || ''}
											className={
												runeCount(session.learningMaterial || '') > LIMITS.learningMaterial
													? 'rps-over'
													: undefined
											}
											onChange={(e) => update(index, { learningMaterial: e.target.value })}
											placeholder="Materi / pokok bahasan rinci pertemuan ini"
										/>
										<CharMeter value={session.learningMaterial || ''} max={LIMITS.learningMaterial} />
									</label>
									<div className="form-two">
										<label>
											METODE SINKRONUS
											<input
												id={`rps-session-${index}-sync`}
												value={session.synchronousMethod || ''}
												onChange={(e) => update(index, { synchronousMethod: e.target.value })}
												placeholder="mis. Kuliah tatap muka, VC langsung"
											/>
										</label>
										<label>
											METODE ASINKRONUS
											<input
												id={`rps-session-${index}-async`}
												value={session.asynchronousMethod || ''}
												onChange={(e) => update(index, { asynchronousMethod: e.target.value })}
												placeholder="mis. Diskusi LMS, video mandiri"
											/>
										</label>
									</div>
									<div className="form-two">
										<label>
											ASPEK / METODE PENILAIAN
											<textarea
												id={`rps-session-${index}-assess-method`}
												rows={2}
												value={session.assessmentMethod || ''}
												onChange={(e) => update(index, { assessmentMethod: e.target.value })}
												placeholder="Cara menilai capaian pada pertemuan ini"
											/>
										</label>
										<label>
											BOBOT PENILAIAN SESI (%)
											<input
												id={`rps-session-${index}-weight`}
												type="number"
												min={0}
												max={100}
												value={
													session.assessmentWeight == null ? '' : session.assessmentWeight
												}
												onChange={(e) =>
													update(index, {
														assessmentWeight:
															e.target.value === '' ? null : Number(e.target.value),
													})
												}
												placeholder="opsional, 0–100"
											/>
										</label>
									</div>
									<div className="form-two">
										<label>
											TUJUAN
											<textarea
												id={`rps-session-${index}-objectives`}
												rows={2}
												value={session.objectives || ''}
												onChange={(e) => update(index, { objectives: e.target.value })}
											/>
										</label>
										<label>
											DURASI
											<input
												id={`rps-session-${index}-duration`}
												value={session.duration || ''}
												onChange={(e) => update(index, { duration: e.target.value })}
												placeholder="mis. 100 menit"
											/>
										</label>
									</div>
									<label>
										KEGIATAN
										<textarea
											rows={2}
											value={session.activities || ''}
											onChange={(e) => update(index, { activities: e.target.value })}
										/>
									</label>
									<div className="form-two">
										<label>
											CATATAN PENILAIAN
											<textarea
												rows={2}
												value={session.assessment || ''}
												onChange={(e) => update(index, { assessment: e.target.value })}
											/>
										</label>
										<label>
											REFERENSI
											<textarea
												id={`rps-session-${index}-references`}
												rows={2}
												value={session.references || ''}
												className={
													runeCount(session.references || '') > LIMITS.sessionReferences
														? 'rps-over'
														: undefined
												}
												onChange={(e) => update(index, { references: e.target.value })}
											/>
											<CharMeter value={session.references || ''} max={LIMITS.sessionReferences} />
										</label>
									</div>
									<label>
										TANGGAL / WAKTU AKSES
										<input
											type="datetime-local"
											value={session.accessDateTime || ''}
											onChange={(e) => update(index, { accessDateTime: e.target.value })}
										/>
									</label>
									<div className="pdf-session-codes">
										{(
											[
												['cplCodes', 'KODE CPL'],
												['cpmkCodes', 'KODE CPMK'],
												['subCpmkCodes', 'KODE SUB-CPMK'],
												['topicCodes', 'KODE TOPIK'],
												['assessmentCodes', 'KODE PENILAIAN'],
											] as const
										).map(([key, label]) => (
											<label key={key}>
												{label}
												<input
													value={(session[key] || []).join(', ')}
													onChange={(e) =>
														update(index, {
															[key]: e.target.value
																.split(',')
																.map((c) => c.trim())
																.filter(Boolean),
														})
													}
													placeholder="pisahkan dengan koma"
												/>
											</label>
										))}
									</div>
								</div>
							)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function StepWorkload({
	draft,
	set,
}: {
	draft: RpsDraft;
	set: <K extends keyof RpsDraft>(f: K, v: RpsDraft[K]) => void;
}) {
	const fields: { key: keyof RpsDraft; label: string }[] = [
		{ key: 'workloadLecture', label: 'Kuliah (jam)' },
		{ key: 'workloadTutorial', label: 'Tutorial (jam)' },
		{ key: 'workloadPractice', label: 'Praktik / responsi (jam)' },
		{ key: 'workloadIndependent', label: 'Belajar mandiri (jam)' },
		{ key: 'workloadTotal', label: 'Total (jam)' },
	];
	return (
		<div className="rps-card editor-form">
			<p className="rps-help">
				Isi alokasi jam per komponen. Kosongkan jika tidak disebutkan di RPS — jangan mengarang
				angka.
			</p>
			<div className="rps-workload-grid">
				{fields.map(({ key, label }) => (
					<label key={key}>
						{label}
						<input
							type="number"
							min={0}
							value={numOrEmpty(draft[key] as number | null)}
							onChange={(e) => set(key, parseNum(e.target.value) as never)}
						/>
					</label>
				))}
			</div>
			<div className="form-two">
				<label>
					JUMLAH JAM IDEAL
					<input
						id="rps-field-ideal-hours"
						type="number"
						min={0}
						value={numOrEmpty(draft.workloadIdealHours)}
						onChange={(e) => set('workloadIdealHours', parseNum(e.target.value))}
					/>
				</label>
				<label>
					KESESUAIAN DENGAN SKS
					<input
						id="rps-field-sks-match"
						value={draft.workloadSksMatch}
						onChange={(e) => set('workloadSksMatch', e.target.value)}
						placeholder="mis. SESUAI"
					/>
				</label>
			</div>
			<label>
				CATATAN BEBAN KERJA
				<textarea
					id="rps-field-workload"
					rows={4}
					value={draft.workload}
					className={runeCount(draft.workload) > LIMITS.workloadNotes ? 'rps-over' : undefined}
					aria-invalid={runeCount(draft.workload) > LIMITS.workloadNotes || undefined}
					onChange={(e) => set('workload', e.target.value)}
					placeholder="Uraian beban kerja mahasiswa"
				/>
				<CharMeter value={draft.workload} max={LIMITS.workloadNotes} />
			</label>
		</div>
	);
}

function StepAssessment({
	draft,
	setDraft,
	set,
}: {
	draft: RpsDraft;
	setDraft: Dispatch<SetStateAction<RpsDraft>>;
	set: <K extends keyof RpsDraft>(f: K, v: RpsDraft[K]) => void;
}) {
	return (
		<div className="rps-card rps-stack">
			<label className="editor-form">
				CATATAN KRITERIA / METODE PENILAIAN
				<textarea
					id="rps-field-assessment-notes"
					rows={3}
					value={draft.assessmentNotes}
					className={
						runeCount(draft.assessmentNotes) > LIMITS.assessmentNotes ? 'rps-over' : undefined
					}
					aria-invalid={runeCount(draft.assessmentNotes) > LIMITS.assessmentNotes || undefined}
					onChange={(e) => set('assessmentNotes', e.target.value)}
					placeholder="Metode dan kriteria penilaian secara umum"
				/>
				<CharMeter value={draft.assessmentNotes} max={LIMITS.assessmentNotes} />
			</label>
			<div className="pdf-item-group">
				<div className="pdf-item-head">
					<strong>Komponen & bobot</strong>
					<button
						type="button"
						className="ld-btn-soft"
						onClick={() =>
							setDraft((p) => ({
								...p,
								assessmentItems: [
									...p.assessmentItems,
									{ code: '', description: '', weight: null },
								],
							}))
						}
					>
						<Plus size={15} /> Tambah
					</button>
				</div>
				{draft.assessmentItems.length === 0 ? (
					<p className="ld-empty-sm">Belum ada komponen penilaian.</p>
				) : (
					<ul className="pdf-session-list">
						{draft.assessmentItems.map((item, i) => (
							<li className="pdf-assess-row" key={item.id || i}>
								<div className="pdf-assess-fields">
									<div className="form-two">
										<input
											id={`rps-assess-${i}-code`}
											placeholder="Kode (UTS)"
											maxLength={40}
											value={item.code}
											onChange={(e) =>
												setDraft((p) => ({
													...p,
													assessmentItems: p.assessmentItems.map((it, idx) =>
														idx === i ? { ...it, code: e.target.value } : it,
													),
												}))
											}
										/>
										<input
											id={`rps-assess-${i}-weight`}
											type="number"
											min={0}
											max={100}
											placeholder="Bobot %"
											value={item.weight == null ? '' : item.weight}
											onChange={(e) =>
												setDraft((p) => ({
													...p,
													assessmentItems: p.assessmentItems.map((it, idx) =>
														idx === i
															? {
																	...it,
																	weight:
																		e.target.value === '' ? null : Number(e.target.value),
																}
															: it,
													),
												}))
											}
										/>
									</div>
									<textarea
										id={`rps-assess-${i}-desc`}
										rows={2}
										placeholder="Deskripsi & metode"
										className={
											runeCount(item.description) > LIMITS.itemDescription ? 'rps-over' : undefined
										}
										value={item.description}
										onChange={(e) =>
											setDraft((p) => ({
												...p,
												assessmentItems: p.assessmentItems.map((it, idx) =>
													idx === i ? { ...it, description: e.target.value } : it,
												),
											}))
										}
									/>
								</div>
								<button
									type="button"
									className="pdf-session-remove"
									onClick={() =>
										setDraft((p) => ({
											...p,
											assessmentItems: p.assessmentItems.filter((_, idx) => idx !== i),
										}))
									}
								>
									<Trash2 size={16} />
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}

function StepCollab({
	draft,
	setDraft,
}: {
	draft: RpsDraft;
	setDraft: Dispatch<SetStateAction<RpsDraft>>;
}) {
	const update = (i: number, patch: Partial<DraftCollab>) =>
		setDraft((p) => ({
			...p,
			collaborativeTasks: p.collaborativeTasks.map((t, idx) =>
				idx === i ? { ...t, ...patch } : t,
			),
		}));
	return (
		<div className="rps-card">
			<div className="pdf-sessions-head">
				<div>
					<span className="ld-eyebrow">Rancangan tugas</span>
					<h3>Tugas Kolaboratif</h3>
				</div>
				<button
					type="button"
					className="ld-btn-soft"
					onClick={() =>
						setDraft((p) => ({
							...p,
							collaborativeTasks: [
								...p.collaborativeTasks,
								{
									title: '',
									description: '',
									objectives: '',
									schedule: '',
									groupInfo: '',
								},
							],
						}))
					}
				>
					<Plus size={15} /> Tambah tugas
				</button>
			</div>
			{draft.collaborativeTasks.length === 0 ? (
				<p className="ld-empty-sm">
					Opsional. Tambahkan jika RPS merancang tugas kelompok / kolaboratif.
				</p>
			) : (
				<ul className="pdf-session-list rps-stack">
					{draft.collaborativeTasks.map((task, i) => (
						<li className="pdf-cpmk-row" key={task.id || i}>
							<div className="pdf-cpmk-main editor-form">
								<input
									id={`rps-collab-${i}-title`}
									placeholder="Judul tugas"
									value={task.title}
									onChange={(e) => update(i, { title: e.target.value })}
								/>
								<textarea
									id={`rps-collab-${i}-desc`}
									rows={2}
									placeholder="Deskripsi"
									value={task.description}
									className={
										runeCount(task.description) > LIMITS.collabDescription ? 'rps-over' : undefined
									}
									onChange={(e) => update(i, { description: e.target.value })}
								/>
								<CharMeter value={task.description} max={LIMITS.collabDescription} />
								<textarea
									id={`rps-collab-${i}-objectives`}
									rows={2}
									placeholder="Tujuan"
									value={task.objectives}
									onChange={(e) => update(i, { objectives: e.target.value })}
								/>
								<div className="form-two">
									<textarea
										id={`rps-collab-${i}-schedule`}
										rows={2}
										placeholder="Jadwal"
										value={task.schedule}
										onChange={(e) => update(i, { schedule: e.target.value })}
									/>
									<textarea
										id={`rps-collab-${i}-group`}
										rows={2}
										placeholder="Info kelompok"
										value={task.groupInfo}
										onChange={(e) => update(i, { groupInfo: e.target.value })}
									/>
								</div>
								<div className="form-two">
									<input
										id={`rps-collab-${i}-method`}
										placeholder="Metode pembelajaran"
										value={task.method || ''}
										onChange={(e) => update(i, { method: e.target.value })}
									/>
									<input
										id={`rps-collab-${i}-weight`}
										type="number"
										min={0}
										max={100}
										placeholder="Bobot %"
										value={task.weight == null ? '' : task.weight}
										onChange={(e) => update(i, { weight: e.target.value === '' ? null : Number(e.target.value) })}
									/>
								</div>
								<textarea
									id={`rps-collab-${i}-subcpmk`}
									rows={2}
									placeholder="Sub-CPMK terkait"
									value={task.subCpmkNote || ''}
									className={runeCount(task.subCpmkNote || '') > LIMITS.collabSubCpmkNote ? 'rps-over' : undefined}
									onChange={(e) => update(i, { subCpmkNote: e.target.value })}
								/>
								<textarea
									id={`rps-collab-${i}-steps`}
									rows={3}
									placeholder="Langkah pengerjaan tugas"
									value={task.steps || ''}
									className={runeCount(task.steps || '') > LIMITS.collabSteps ? 'rps-over' : undefined}
									onChange={(e) => update(i, { steps: e.target.value })}
								/>
								<textarea
									id={`rps-collab-${i}-outputs`}
									rows={2}
									placeholder="Rincian luaran yang dihasilkan"
									value={task.outputs || ''}
									className={runeCount(task.outputs || '') > LIMITS.collabOutputs ? 'rps-over' : undefined}
									onChange={(e) => update(i, { outputs: e.target.value })}
								/>
								<textarea
									id={`rps-collab-${i}-indicators`}
									rows={2}
									placeholder="Indikator, kriteria, dan bobot penilai"
									value={task.indicators || ''}
									className={runeCount(task.indicators || '') > LIMITS.collabIndicators ? 'rps-over' : undefined}
									onChange={(e) => update(i, { indicators: e.target.value })}
								/>
								<textarea
									id={`rps-collab-${i}-notes`}
									rows={2}
									placeholder="Lain-lain"
									value={task.notes || ''}
									className={runeCount(task.notes || '') > LIMITS.collabNotes ? 'rps-over' : undefined}
									onChange={(e) => update(i, { notes: e.target.value })}
								/>
								<div className="pdf-session-codes">
									{(
										[
											['cplCodes', 'KODE CPL'],
											['cpmkCodes', 'KODE CPMK'],
											['subCpmkCodes', 'KODE SUB-CPMK'],
											['assessmentCodes', 'KODE PENILAIAN'],
										] as const
									).map(([key, label]) => (
										<label key={key}>
											{label}
											<input
												value={(task[key] || []).join(', ')}
												onChange={(e) =>
													update(i, {
														[key]: e.target.value
															.split(',')
															.map((c) => c.trim())
															.filter(Boolean),
													})
												}
											/>
										</label>
									))}
								</div>
								<button
									type="button"
									className="ld-text-btn"
									onClick={() =>
										setDraft((p) => ({
											...p,
											collaborativeTasks: p.collaborativeTasks.filter((_, idx) => idx !== i),
										}))
									}
								>
									<Trash2 size={14} /> Hapus tugas
								</button>
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function RpsValidationSummary({
	validation,
}: {
	validation: ReturnType<typeof validateRps>;
}) {
	const { warnings, counts, complete } = validation;
	const cats = Object.keys(VALIDATION_CATEGORY_LABELS) as ValidationCategory[];
	if (complete) {
		return (
			<div className="rps-validation rps-validation-ok" role="status">
				<Check size={16} />
				<div>
					<strong>RPS lengkap & konsisten.</strong>
					<span>
						Semua pemetaan Sub-CPMK, rencana mingguan, bobot penilaian, dan beban kerja sudah
						terisi dan konsisten.
					</span>
				</div>
			</div>
		);
	}
	return (
		<div className="rps-validation" role="status">
			<AlertTriangle size={16} />
			<div className="rps-validation-body">
				<strong>Hasil tinjauan RPS — {warnings.length} catatan</strong>
				<div className="rps-validation-chips">
					{cats
						.filter((c) => counts[c] > 0)
						.map((c) => (
							<span className="rps-validation-chip" key={c}>
								{VALIDATION_CATEGORY_LABELS[c]} · {counts[c]}
							</span>
						))}
				</div>
				<ul className="rps-validation-list">
					{warnings.map((w, i) => (
						<li key={i}>
							<small>{VALIDATION_CATEGORY_LABELS[w.category]}</small>
							{w.message}
						</li>
					))}
				</ul>
				<span className="rps-validation-note">
					Validasi tidak mengubah data Anda — perbaiki manual pada langkah yang disebut.
				</span>
			</div>
		</div>
	);
}

function StepReview({
	draft,
	miss,
	file,
	onSave,
	saving,
}: {
	draft: RpsDraft;
	miss: string[];
	file: File | null;
	onSave: () => void;
	saving: boolean;
}) {
	const validation = useMemo(() => validateRps(validationFromDraft(draft)), [draft]);
	return (
		<div className="rps-card rps-review">
			<RpsValidationSummary validation={validation} />
			{miss.length > 0 && (
				<div className="pdf-warnings">
					<AlertTriangle size={16} />
					<div>
						<strong>Masih kosong / belum lengkap:</strong>
						<ul>
							{miss.map((m) => (
								<li key={m}>{m}</li>
							))}
						</ul>
						<span>Anda tetap bisa menyimpan; lengkapi kapan saja.</span>
					</div>
				</div>
			)}
			<div className="rps-review-grid">
				<div>
					<small>Identitas</small>
					<strong>{draft.title || '—'}</strong>
					<span>
						{draft.code || 'tanpa kode'} · {draft.semester || '—'} · SKS {draft.credits ?? '—'}
					</span>
				</div>
				<div>
					<small>Capaian</small>
					<strong>
						{draft.cplItems.length} CPL · {draft.cpmkItems.length} CPMK
					</strong>
				</div>
				<div>
					<small>Pertemuan</small>
					<strong>{draft.sessions.length} sesi</strong>
				</div>
				<div>
					<small>Penilaian</small>
					<strong>{draft.assessmentItems.length} komponen</strong>
				</div>
				<div>
					<small>Tugas kolaboratif</small>
					<strong>{draft.collaborativeTasks.length}</strong>
				</div>
				<div>
					<small>Workload total</small>
					<strong>{draft.workloadTotal ?? '—'} jam</strong>
				</div>
			</div>
			{(file || draft.hasRpsFile) && (
				<div className="pdf-attached">
					<FileText size={16} />
					<span>{file?.name || draft.rpsFileName || 'PDF RPS'}</span>
					<em>PDF asli disimpan sebagai referensi</em>
				</div>
			)}
			<button
				type="button"
				className="ld-btn-primary"
				disabled={saving || !draft.title.trim()}
				onClick={onSave}
			>
				{saving ? <LoaderCircle size={18} className="spin" /> : <Check size={17} />}
				Simpan & buka mata kuliah
			</button>
		</div>
	);
}

/** Upsert structured records; keep existing ids when description/code match. */
async function syncStructured(
	courseId: string,
	d: RpsDraft,
	ownerId: string,
): Promise<{
	cpl: Map<string, string>;
	cpmk: Map<string, string>;
	topics: Map<string, string>;
	assessments: Map<string, string>;
}> {
	const filter = pb.filter('course = {:id}', { id: courseId });

	const existingCpl = await pb.collection('cpl').getFullList<StructuredItem>({ filter });
	const cplByKey = new Map(existingCpl.map((r) => [itemKey(r), r.id]));
	const cplByCode = new Map(
		existingCpl.filter((r) => r.code).map((r) => [r.code.trim().toLowerCase(), r.id]),
	);
	let order = 0;
	for (const item of d.cplItems) {
		if (!item.description.trim()) continue;
		const key = itemKey(item);
		const payload = {
			owner: ownerId,
			course: courseId,
			code: item.code.trim(),
			description: item.description.trim(),
			order,
		};
		if (item.id) {
			await pb.collection('cpl').update(item.id, payload, { requestKey: `cpl-u-${order}` });
			cplByKey.set(key, item.id);
			if (item.code.trim()) cplByCode.set(item.code.trim().toLowerCase(), item.id);
		} else if (cplByKey.has(key)) {
			const id = cplByKey.get(key)!;
			await pb.collection('cpl').update(id, payload, { requestKey: `cpl-m-${order}` });
		} else {
			const rec = await pb
				.collection('cpl')
				.create<StructuredItem>(payload, { requestKey: `cpl-c-${order}` });
			cplByKey.set(key, rec.id);
			if (item.code.trim()) cplByCode.set(item.code.trim().toLowerCase(), rec.id);
		}
		order += 1;
	}

	const existingCpmk = await pb.collection('cpmk').getFullList<Cpmk>({ filter });
	const cpmkByKey = new Map(existingCpmk.map((r) => [itemKey(r), r.id]));
	let cpmkOrder = 0;
	for (const cpmk of d.cpmkItems) {
		if (!cpmk.description.trim()) continue;
		const key = itemKey(cpmk);
		const cplId = cpmk.cplCode.trim()
			? cplByCode.get(cpmk.cplCode.trim().toLowerCase()) || cpmk.cplId || ''
			: cpmk.cplId || '';
		const payload = {
			owner: ownerId,
			course: courseId,
			cpl: cplId,
			code: cpmk.code.trim(),
			description: cpmk.description.trim(),
			taxonomy: cpmk.taxonomy ?? null,
			weight: cpmk.weight ?? null,
			criteria: (cpmk.criteria || '').trim(),
			order: cpmkOrder,
		};
		let cpmkId = cpmk.id || cpmkByKey.get(key);
		if (cpmkId) {
			await pb.collection('cpmk').update(cpmkId, payload, { requestKey: `cpmk-u-${cpmkOrder}` });
		} else {
			const rec = await pb
				.collection('cpmk')
				.create<Cpmk>(payload, { requestKey: `cpmk-c-${cpmkOrder}` });
			cpmkId = rec.id;
			cpmkByKey.set(key, cpmkId);
		}
		const existingSub = await pb.collection('sub_cpmk').getFullList<SubCpmk>({
			filter: pb.filter('course = {:id} && cpmk = {:cpmkId}', { id: courseId, cpmkId }),
		});
		const subByKey = new Map(existingSub.map((r) => [itemKey(r), r.id]));
		let subOrder = 0;
		for (const sub of cpmk.subCpmk) {
			if (!sub.description.trim()) continue;
			const skey = itemKey(sub);
			const sp = {
				owner: ownerId,
				course: courseId,
				cpmk: cpmkId,
				code: sub.code.trim(),
				description: sub.description.trim(),
				order: subOrder,
			};
			if (sub.id) {
				await pb.collection('sub_cpmk').update(sub.id, sp, { requestKey: `sub-u-${subOrder}` });
			} else if (subByKey.has(skey)) {
				await pb
					.collection('sub_cpmk')
					.update(subByKey.get(skey)!, sp, { requestKey: `sub-m-${subOrder}` });
			} else {
				await pb.collection('sub_cpmk').create(sp, { requestKey: `sub-c-${cpmkId}-${subOrder}` });
			}
			subOrder += 1;
		}
		cpmkOrder += 1;
	}

	const existingTopics = await pb.collection('topics').getFullList<StructuredItem>({ filter });
	const topicByKey = new Map(existingTopics.map((r) => [itemKey(r), r.id]));
	let tOrder = 0;
	for (const item of d.topicItems) {
		if (!item.description.trim()) continue;
		const key = itemKey(item);
		const payload = {
			owner: ownerId,
			course: courseId,
			code: item.code.trim(),
			description: item.description.trim(),
			order: tOrder,
		};
		if (item.id) {
			await pb.collection('topics').update(item.id, payload, { requestKey: `top-u-${tOrder}` });
		} else if (topicByKey.has(key)) {
			await pb
				.collection('topics')
				.update(topicByKey.get(key)!, payload, { requestKey: `top-m-${tOrder}` });
		} else {
			await pb.collection('topics').create(payload, { requestKey: `top-c-${tOrder}` });
		}
		tOrder += 1;
	}

	const existingA = await pb.collection('assessments').getFullList<Assessment>({ filter });
	const aByKey = new Map(existingA.map((r) => [itemKey(r), r.id]));
	let aOrder = 0;
	for (const item of d.assessmentItems) {
		if (!item.description.trim()) continue;
		const key = itemKey(item);
		const payload = {
			owner: ownerId,
			course: courseId,
			code: item.code.trim(),
			description: item.description.trim(),
			weight: item.weight,
			order: aOrder,
		};
		if (item.id) {
			await pb
				.collection('assessments')
				.update(item.id, payload, { requestKey: `as-u-${aOrder}` });
		} else if (aByKey.has(key)) {
			await pb
				.collection('assessments')
				.update(aByKey.get(key)!, payload, { requestKey: `as-m-${aOrder}` });
		} else {
			await pb.collection('assessments').create(payload, { requestKey: `as-c-${aOrder}` });
		}
		aOrder += 1;
	}

	return {
		cpl: cplByKey,
		cpmk: cpmkByKey,
		topics: topicByKey,
		assessments: aByKey,
	};
}

async function syncSessions(
	courseId: string,
	d: RpsDraft,
	ownerId: string,
): Promise<Map<number, string>> {
	const filter = pb.filter('course = {:id}', { id: courseId });
	const [cplRows, cpmkRows, subRows, topicRows, assessRows] = await Promise.all([
		pb.collection('cpl').getFullList<StructuredItem>({ filter }),
		pb.collection('cpmk').getFullList<StructuredItem>({ filter }),
		pb.collection('sub_cpmk').getFullList<StructuredItem>({ filter }),
		pb.collection('topics').getFullList<StructuredItem>({ filter }),
		pb.collection('assessments').getFullList<StructuredItem>({ filter }),
	]);
	const codeMap = (rows: StructuredItem[]) => {
		const map = new Map<string, string>();
		for (const row of rows) {
			const c = (row.code || '').trim().toLowerCase();
			if (c) map.set(c, row.id);
		}
		return map;
	};
	const resolve = (codes: string[] | undefined, map: Map<string, string>, existing?: string[]) => {
		if (codes && codes.length) {
			return codes.map((c) => map.get(c.trim().toLowerCase())).filter(Boolean) as string[];
		}
		return existing || [];
	};
	const cplMap = codeMap(cplRows);
	const cpmkMap = codeMap(cpmkRows);
	const subMap = codeMap(subRows);
	const topicMap = codeMap(topicRows);
	const assessMap = codeMap(assessRows);

	const existing = await pb.collection('class_sessions').getFullList<ClassSession>({ filter });
	const byId = new Map(existing.map((s) => [s.id, s]));
	// First stored session per week — used to reattach id-less draft sessions
	// (e.g. from a fresh PDF/text import) to the existing row for that week so
	// re-imports UPDATE instead of duplicating.
	const byWeek = new Map<number, string>();
	for (const s of existing) {
		if (!byWeek.has(s.week)) byWeek.set(s.week, s.id);
	}
	const kept = new Set<string>();
	// draft index → resolved stored session id, so the caller can merge the ids
	// back into the draft and subsequent saves update rows in place.
	const idByIndex = new Map<number, string>();

	for (let i = 0; i < d.sessions.length; i += 1) {
		const s = d.sessions[i];
		if (!s.title.trim() && !s.topic.trim()) continue;
		const notesParts: string[] = [];
		if (s.objectives?.trim()) notesParts.push(`Tujuan: ${s.objectives.trim()}`);
		if (s.activities?.trim()) notesParts.push(`Kegiatan: ${s.activities.trim()}`);
		if (s.duration?.trim()) notesParts.push(`Durasi: ${s.duration.trim()}`);
		if (s.assessment?.trim()) notesParts.push(`Penilaian: ${s.assessment.trim()}`);
		if (s.references?.trim()) notesParts.push(`Referensi: ${s.references.trim()}`);
		const payload = {
			course: courseId,
			owner: ownerId,
			title: s.title.trim() || s.topic.trim() || `Pertemuan ${s.week}`,
			week: s.week,
			topic: s.topic.trim(),
			notes: notesParts.join('\n'),
			cpls: resolve(s.cplCodes, cplMap, s.cpls),
			cpmks: resolve(s.cpmkCodes, cpmkMap, s.cpmks),
			subCpmks: resolve(s.subCpmkCodes, subMap, s.subCpmks),
			topics: resolve(s.topicCodes, topicMap, s.topics),
			assessments: resolve(s.assessmentCodes, assessMap, s.assessments),
			specialWeekType: s.specialWeekType || 'normal',
			learningIndicator: (s.learningIndicator || '').trim(),
			learningMaterial: (s.learningMaterial || '').trim(),
			assessmentMethod: (s.assessmentMethod || '').trim(),
			assessmentWeight: s.assessmentWeight == null ? null : s.assessmentWeight,
			synchronousMethod: (s.synchronousMethod || '').trim(),
			asynchronousMethod: (s.asynchronousMethod || '').trim(),
			duration: (s.duration || '').trim(),
			references: (s.references || '').trim(),
			accessDateTime: s.accessDateTime || '',
		};
		// Resolve the target row: an explicit draft id wins; otherwise reattach
		// to the existing row for this week (prevents duplicates on re-import).
		const targetId = s.id && byId.has(s.id) ? s.id : byWeek.get(s.week);
		if (targetId) {
			await pb
				.collection('class_sessions')
				.update(targetId, payload, { requestKey: `sess-u-${i}` });
			kept.add(targetId);
			idByIndex.set(i, targetId);
		} else {
			const rec = await pb
				.collection('class_sessions')
				.create<ClassSession>({ ...payload, completed: false }, { requestKey: `sess-c-${i}` });
			kept.add(rec.id);
			byWeek.set(s.week, rec.id);
			idByIndex.set(i, rec.id);
		}
	}
	// Do not auto-delete sessions not in draft — safer progressive edit. The
	// Rencana step exposes a reviewed "Bersihkan sesi ganda" action for that.
	void kept;
	return idByIndex;
}

async function syncCollab(courseId: string, d: RpsDraft, ownerId: string) {
	const filter = pb.filter('course = {:id}', { id: courseId });
	let existing: CollaborativeTask[] = [];
	try {
		existing = await pb
			.collection('collaborative_tasks')
			.getFullList<CollaborativeTask>({ filter });
	} catch {
		return;
	}
	const byId = new Map(existing.map((t) => [t.id, t]));
	const [cplRows, cpmkRows, subRows, assessRows] = await Promise.all([
		pb.collection('cpl').getFullList<StructuredItem>({ filter }),
		pb.collection('cpmk').getFullList<StructuredItem>({ filter }),
		pb.collection('sub_cpmk').getFullList<StructuredItem>({ filter }),
		pb.collection('assessments').getFullList<StructuredItem>({ filter }),
	]);
	const codeMap = (rows: StructuredItem[]) => {
		const map = new Map<string, string>();
		for (const row of rows) {
			const c = (row.code || '').trim().toLowerCase();
			if (c) map.set(c, row.id);
		}
		return map;
	};
	const resolve = (codes: string[] | undefined, map: Map<string, string>, existingIds?: string[]) => {
		if (codes && codes.length) {
			return codes.map((c) => map.get(c.trim().toLowerCase())).filter(Boolean) as string[];
		}
		return existingIds || [];
	};
	const cplMap = codeMap(cplRows);
	const cpmkMap = codeMap(cpmkRows);
	const subMap = codeMap(subRows);
	const assessMap = codeMap(assessRows);

	for (let i = 0; i < d.collaborativeTasks.length; i += 1) {
		const t = d.collaborativeTasks[i];
		if (!t.title.trim() && !t.description.trim()) continue;
		const payload = {
			owner: ownerId,
			course: courseId,
			title: t.title.trim() || 'Tugas kolaboratif',
			description: t.description.trim(),
			objectives: t.objectives.trim(),
			schedule: t.schedule.trim(),
			groupInfo: t.groupInfo.trim(),
			method: (t.method || '').trim(),
			weight: t.weight ?? null,
			subCpmkNote: (t.subCpmkNote || '').trim(),
			steps: (t.steps || '').trim(),
			outputs: (t.outputs || '').trim(),
			indicators: (t.indicators || '').trim(),
			notes: (t.notes || '').trim(),
			order: i,
			cpls: resolve(t.cplCodes, cplMap, t.cpls),
			cpmks: resolve(t.cpmkCodes, cpmkMap, t.cpmks),
			subCpmks: resolve(t.subCpmkCodes, subMap, t.subCpmks),
			assessments: resolve(t.assessmentCodes, assessMap, t.assessments),
		};
		if (t.id && byId.has(t.id)) {
			await pb
				.collection('collaborative_tasks')
				.update(t.id, payload, { requestKey: `col-u-${i}` });
		} else {
			await pb.collection('collaborative_tasks').create(payload, { requestKey: `col-c-${i}` });
		}
	}
}
