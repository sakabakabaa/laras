import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	ArrowDown,
	ArrowUp,
	Briefcase,
	CalendarClock,
	CheckCircle2,
	ClipboardCheck,
	ChevronDown,
	Eye,
	FileSearch,
	FileUp,
	FlaskConical,
	BookOpen,
	Headphones,
	Info,
	Languages,
	ListChecks,
	LoaderCircle,
	MessagesSquare,
	Mic,
	PencilLine,
	PenLine,
	Plus,
	Presentation,
	Repeat,
	RotateCcw,
	Save,
	Sparkles,
	Trash2,
	User,
	Users,
	X,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { useT } from '@/lib/i18n';
import { invalidate } from '@/lib/local-cache';
import type { Course } from '@/lib/learning';
import { errorMessage, type FileLibraryRecord } from '@/lib/learning';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { useCourseRecords } from '@/hooks/use-course-records';
import { useCourseResources } from '@/hooks/use-course-resources';
import {
	ACTIVITY_TYPE_LABEL,
	activityTypeOf,
	deadlineLabel,
	deadlineToLocalInput,
	localInputToDeadline,
	MODE_LABEL,
	parseStages,
	practiceSyncState,
	practiceTitleFor,
	SHAPE_LABEL,
	SHAPE_OPTIONS,
	defaultStagesForShape,
	shapeOption,
	STAGE_PRESETS,
	type ActivityType,
	type Assignment,
	type AssignmentMode,
	type AssignmentShape,
	type AssignmentStage,
	type AssignmentStatus,
} from '@/lib/assignments';
import { parseAssignmentImport, readAssignmentSourceFile } from '@/lib/assignment-import';
import {
	DEFAULT_QUIZ_CONFIG,
	TASK_KIND_LABEL,
	emptyEditableConfig,
	mergeTaskConfigWithKey,
	normalizeEditableConfig,
	parseQuizQuestionsFromText,
	splitTaskConfigForSave,
	taskKindForShape,
	validateEditableConfig,
	type EditableTaskConfig,
} from '@/lib/task-types';
import {
	EMPTY_SUGGESTED_CRITERIA,
	acceptSuggestion,
	canSuggestCriteria,
	dismissSuggestion,
	parseSuggestedCriteria,
	type SuggestedCriteria,
} from '@/lib/rubric-suggestions';
import { QuizBuilder } from '@/components/app/task-builders/quiz-builder';
import { ListeningBuilder } from '@/components/app/task-builders/listening-builder';
import { WritingBuilder } from '@/components/app/task-builders/writing-builder';
import { SpeakingBuilder } from '@/components/app/task-builders/speaking-builder';
import { ReadingBuilder } from '@/components/app/task-builders/reading-builder';
import { TaskAutofill } from '@/components/app/task-builders/task-autofill';
import { RubricSuggestionsPanel } from '@/components/app/task-builders/rubric-suggestions';
import { newRowId } from '@/components/app/task-builders/builder-shared';
import { MappingSelect, StatusMarks, type StatusDetail } from '@/components/app/form-status';
import type { ClassSession } from '@/lib/learning';
import { confirmDialog } from '@/components/confirm-dialog';
import { DateTimePicker } from '@/components/app/datetime-picker';
import { FormStepper } from '@/components/form-stepper';
import { AssignmentAiPolicy } from '@/components/app/assignment-ai-policy';
import {
	buildStoredPolicy,
	defaultEnabledCapsForLevel,
	policySummary,
	readEnabledCaps,
	readPolicyMode,
	type AiPolicyMode,
} from '@/lib/ai-policy-form';
import type { Capability } from '@/lib/ai-capabilities';
import { AppModal } from '@/components/app/app-modal';

type DraftResponse = {
	title?: string;
	mode?: AssignmentMode;
	instructions?: string;
	requirements?: string;
	groupInfo?: string;
	deadline?: string;
	stages?: AssignmentStage[];
	sessionId?: string;
	subCpmkId?: string;
	reviewNotes?: string[];
	error?: string;
};

/**
 * Four-section creator: Dasar → Tugas → Penilaian & Bantuan → Review.
 * Navigation between sections is flexible (never blocked by validation);
 * only publishing is validated. All underlying fields, save logic,
 * autosave/draft continuity, AI behavior, and task-type builders are
 * preserved — only the information architecture changed.
 */
const SECTIONS = [
	{ id: 1, label: 'Dasar' },
	{ id: 2, label: 'Tugas' },
	{ id: 3, label: 'Penilaian & Bantuan' },
	{ id: 4, label: 'Review' },
] as const;

const SHAPE_ICONS: Record<AssignmentShape, typeof User> = {
	individual: User,
	group_project: Users,
	case_study: FileSearch,
	presentation: Presentation,
	practical: FlaskConical,
	portfolio: Briefcase,
	discussion: MessagesSquare,
	quiz: ListChecks,
	listening: Headphones,
	writing: PenLine,
	speaking: Mic,
	reading: BookOpen,
	conversation: MessagesSquare,
	vocabulary: Languages,
	language_project: Briefcase,
};

const weekLabel = (week: number | undefined) => String(week || '—').padStart(2, '0');

/** Locally autosaved in-progress draft (fresh creation only, never edits). */
type LocalDraft = {
	courseSel: string;
	title: string;
	mode: AssignmentMode;
	activityType: ActivityType;
	allowRevision: boolean;
	checkOn: boolean;
	checkMaxInput: string;
	aiAssistOn: boolean;
	feedbackMode: 'generic' | 'personalized';
	personalizationThreshold: string;
	shape: AssignmentShape | '';
	status: AssignmentStatus;
	sessionId: string;
	subCpmkId: string;
	deadlineInput: string;
	instructions: string;
	requirements: string;
	groupInfo: string;
	stages: AssignmentStage[];
	attachments: string[];
	taskCfg: EditableTaskConfig | null;
	step: number;
	aiPolicyMode: AiPolicyMode;
	aiEnabledCaps: Capability[];
};

export function AssignmentForm({
	/** Preselected course (launch from a course page keeps the course). */
	courseId,
	/** Lecturer's own courses for the picker, when the caller already has them. */
	courses,
	assignment,
	/** Batch 1: create a Latihan formatif practice from this formal task. */
	practiceFrom,
	onClose,
	onSaved,
	/** Render as a dedicated full page (within AppShell) instead of a modal
	 *  dialog. The dedicated Tugas editor route uses this; in-context edits
	 *  (evaluation workspace) keep the default modal. */
	variant = 'modal',
}: {
	courseId?: string;
	courses?: Course[];
	assignment?: Assignment;
	practiceFrom?: Assignment;
	onClose: () => void;
	onSaved: (assignmentId: string) => void;
	variant?: 'modal' | 'page';
}) {
	const editing = Boolean(assignment);
	const t = useT();
	// Batch 1: creating a Latihan formatif practice from a formal task. Useful
	// context (mapping, instructions, rubric, stages, materials) is copied from
	// the parent and stays fully editable — the lecturer can reduce the scope
	// before publishing, and the saved practice is independent afterwards.
	const parent = practiceFrom;
	// The course is fixed when editing an existing task or creating a linked
	// practice (it must stay in the parent's course). Fresh creation from the
	// Tugas board picks the course in section 1, preselected when launched from
	// a course page.
	const courseLocked = Boolean(assignment || parent);
	const me = pb.authStore.record?.id || '';
	const draftKey = me ? `upi-asg-draft-${me}` : '';
	const [courseSel, setCourseSel] = useState(
		assignment?.course || parent?.course || courseId || '',
	);
	// Editing starts on the review section (everything is reachable from there);
	// a linked practice starts on the Tugas section like before.
	const [section, setSection] = useState(() =>
		editing && assignment?.session && assignment?.subCpmk
			? assignment.shape
				? 4
				: 2
			: parent?.session && parent?.subCpmk
				? 2
				: 1,
	);
	const [title, setTitle] = useState(assignment?.title || (parent ? practiceTitleFor(parent) : ''));
	const [mode, setMode] = useState<AssignmentMode>(
		assignment?.mode || parent?.mode || 'individual',
	);
	// Phase 1 activity model: Tugas formal (default) vs Latihan formatif.
	const [activityType, setActivityType] = useState<ActivityType>(
		assignment ? activityTypeOf(assignment) : parent ? 'formative' : 'formal',
	);
	// Phase 2 step 5 type-separated settings. Formal: revision policy for the
	// final submission. Formative: repeatable practice + Cek jawaban feedback.
	const [allowRevision, setAllowRevision] = useState(Boolean(assignment?.allowRevision));
	const [checkOn, setCheckOn] = useState(assignment?.checkEnabled !== false);
	const [checkMaxInput, setCheckMaxInput] = useState(String(assignment?.checkMax || 5));
	// Batch 3: optional AI practice assistance (Panduan AI) — off by default,
	// lecturer-enabled per practice, guidance-only.
	const [aiAssistOn, setAiAssistOn] = useState(Boolean(assignment?.aiAssistEnabled));
	// Phase 3 — lecturer controls for student AI assistance. 'default' preserves
	// the activity-type-derived behavior (no explicit policy stored); 'off'
	// disables student AI; a concrete level stores an explicit policy the
	// server enforces for every student AI request.
	const [aiPolicyMode, setAiPolicyMode] = useState<AiPolicyMode>(() =>
		assignment ? readPolicyMode(assignment) : 'default',
	);
	const [aiEnabledCaps, setAiEnabledCaps] = useState<Set<Capability>>(() =>
		assignment ? readEnabledCaps(assignment) : new Set(),
	);
	// Phase 10 — control-condition switch for adaptive personalized feedback.
	// Generic is the default; personalization requires explicit enablement.
	const [feedbackMode, setFeedbackMode] = useState<'generic' | 'personalized'>(
		assignment?.feedbackMode === 'personalized' ? 'personalized' : 'generic',
	);
	const [personalizationThreshold, setPersonalizationThreshold] = useState(
		String(assignment?.personalizationThreshold || 3),
	);
	const [shape, setShape] = useState<AssignmentShape | ''>(
		assignment?.shape || parent?.shape || '',
	);
	const [status, setStatus] = useState<AssignmentStatus>(assignment?.status || 'draft');
	const [sessionId, setSessionId] = useState(assignment?.session || parent?.session || '');
	const [subCpmkId, setSubCpmkId] = useState(assignment?.subCpmk || parent?.subCpmk || '');
	const [cpmkId, setCpmkId] = useState('');
	const [deadlineInput, setDeadlineInput] = useState(
		deadlineToLocalInput(assignment?.deadline || ''),
	);
	const [instructions, setInstructions] = useState(
		assignment?.instructions || parent?.instructions || '',
	);
	const [requirements, setRequirements] = useState(
		assignment?.requirements || parent?.requirements || '',
	);
	const [groupInfo, setGroupInfo] = useState(assignment?.groupInfo || parent?.groupInfo || '');
	const [stages, setStages] = useState<AssignmentStage[]>(
		parseStages(assignment?.stages || parent?.stages || null),
	);
	const [stagesTouched, setStagesTouched] = useState(Boolean(parent));
	const [attachments, setAttachments] = useState<string[]>(
		assignment?.attachments || parent?.attachments || [],
	);
	// Type-specific builder config (config + owner-only answer key merged).
	// Creating a practice from a parent formal task pre-fills the parent's
	// shape, so an EMPTY builder config of that same kind is seeded here too —
	// the type-specific config is deliberately not copied. Without it the
	// builder section, AI autofill, and save would all be unreachable for the
	// pre-filled shape ("Lengkapi konfigurasi …" with no way to complete it).
	const [taskCfg, setTaskCfg] = useState<EditableTaskConfig | null>(() => {
		if (assignment) {
			const kind = taskKindForShape(assignment.shape);
			return kind ? mergeTaskConfigWithKey(kind, assignment.taskConfig, null) : null;
		}
		if (parent) {
			const kind = taskKindForShape(parent.shape);
			return kind ? emptyEditableConfig(kind) : null;
		}
		return null;
	});
	useEffect(() => {
		if (!assignment) return;
		const kind = taskKindForShape(assignment.shape);
		if (!kind) return;
		let alive = true;
		void (async () => {
			try {
				const rec = await pb.collection('task_answer_keys').getFirstListItem(
					`assignment = "${assignment.id}"`,
				);
				if (alive) setTaskCfg(mergeTaskConfigWithKey(kind, assignment.taskConfig, rec.key));
			} catch {
				/* no stored key yet — keep the empty one */
			}
		})();
		return () => {
			alive = false;
		};
	}, [assignment]);
	// Defensive repair: a shape that maps to a specialized builder must always
	// hold a matching editable config — otherwise the builder section, the AI
	// autofill panel, and save would all dead-end behind "Lengkapi
	// konfigurasi …" with no visible way to complete it. Any path that sets a
	// builder shape without a config gets an empty config seeded here (never
	// copied content); pickShape already keeps the two in sync on manual picks.
	useEffect(() => {
		const kind = taskKindForShape(shape);
		if (!kind || (taskCfg && taskCfg.kind === kind)) return;
		setTaskCfg(emptyEditableConfig(kind));
	}, [shape, taskCfg]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [tool, setTool] = useState<'import' | 'ai'>('import');
	const [paste, setPaste] = useState('');
	const [hint, setHint] = useState('');
	const [toolBusy, setToolBusy] = useState(false);
	const [reviewNotes, setReviewNotes] = useState<string[]>([]);
	const [syncNote, setSyncNote] = useState('');
	const [draftNote, setDraftNote] = useState('');
	const [suggestions, setSuggestions] = useState<SuggestedCriteria | null>(null);
	const [suggestBusy, setSuggestBusy] = useState(false);
	const [suggestError, setSuggestError] = useState('');
	// Post-create success state: a fresh formal task shows a success panel with
	// an optional "Buat latihan persiapan" next action instead of navigating
	// away immediately. Edits and practices keep the direct onSaved navigation.
	const [createdId, setCreatedId] = useState('');
	const fileRef = useRef<HTMLInputElement>(null);

	// ── Local autosave / draft continuity (fresh creation only) ──
	// The form autosaves its in-progress state to this browser so an accidental
	// refresh or closed tab does not lose a half-finished task; it is cleared
	// on save or discard. This is a UI convenience only — the authoritative
	// draft is still the saved PocketBase record (status Draf).
	useEffect(() => {
		if (!draftKey || editing || parent) return;
		try {
			const raw = window.localStorage.getItem(draftKey);
			if (!raw) return;
			const d = JSON.parse(raw) as LocalDraft;
			if (d.courseSel) setCourseSel(d.courseSel);
			if (d.title) setTitle(d.title);
			if (d.mode) setMode(d.mode);
			setAllowRevision(Boolean(d.allowRevision));
			setCheckOn(d.checkOn !== false);
			if (d.checkMaxInput) setCheckMaxInput(d.checkMaxInput);
			setAiAssistOn(Boolean(d.aiAssistOn));
			if (d.feedbackMode) setFeedbackMode(d.feedbackMode);
			if (d.personalizationThreshold) setPersonalizationThreshold(d.personalizationThreshold);
			if (d.shape) setShape(d.shape);
			if (d.status) setStatus(d.status);
			if (d.sessionId) setSessionId(d.sessionId);
			if (d.subCpmkId) setSubCpmkId(d.subCpmkId);
			if (d.deadlineInput) setDeadlineInput(d.deadlineInput);
			if (d.instructions) setInstructions(d.instructions);
			if (d.requirements) setRequirements(d.requirements);
			if (d.groupInfo) setGroupInfo(d.groupInfo);
			if (Array.isArray(d.stages) && d.stages.length) {
				setStages(d.stages);
				setStagesTouched(true);
			}
			if (Array.isArray(d.attachments)) setAttachments(d.attachments);
			if (d.taskCfg && d.taskCfg.kind) setTaskCfg(normalizeEditableConfig(d.taskCfg));
			if (d.step >= 1 && d.step <= SECTIONS.length) setSection(d.step);
			if (d.aiPolicyMode) setAiPolicyMode(d.aiPolicyMode);
			if (Array.isArray(d.aiEnabledCaps)) setAiEnabledCaps(new Set(d.aiEnabledCaps));
			setDraftNote(
				'Draf lokal dipulihkan — Anda dapat melanjutkan pengisian, atau membuangnya untuk mulai dari awal.',
			);
		} catch {
			/* unreadable local draft — start fresh */
		}
	}, [draftKey, editing, parent]);

	useEffect(() => {
		if (!draftKey || editing || parent) return;
		const id = window.setTimeout(() => {
			try {
				const draft: LocalDraft = {
					courseSel,
					title,
					mode,
					activityType,
					allowRevision,
					checkOn,
					checkMaxInput,
					aiAssistOn,
					feedbackMode,
					personalizationThreshold,
					shape,
					status,
					sessionId,
					subCpmkId,
					deadlineInput,
					instructions,
					requirements,
					groupInfo,
					stages,
					attachments,
					taskCfg,
					step: section,
					aiPolicyMode,
					aiEnabledCaps: [...aiEnabledCaps],
				};
				window.localStorage.setItem(draftKey, JSON.stringify(draft));
			} catch {
				/* storage unavailable — autosave silently skipped */
			}
		}, 700);
		return () => window.clearTimeout(id);
	}, [
		draftKey,
		editing,
		parent,
		courseSel,
		title,
		mode,
		activityType,
		allowRevision,
		checkOn,
		checkMaxInput,
		aiAssistOn,
		feedbackMode,
		personalizationThreshold,
		shape,
		status,
		sessionId,
		subCpmkId,
		deadlineInput,
		instructions,
		requirements,
		groupInfo,
		stages,
		attachments,
		taskCfg,
		section,
		aiPolicyMode,
		aiEnabledCaps,
	]);

	const discardDraft = async () => {
		if (
			!(await confirmDialog({
				title: 'Buang draf lokal',
				message: 'Buang draf lokal yang tersimpan dan mulai dari awal?',
				variant: 'danger',
				confirmLabel: 'Buang draf',
			}))
		)
			return;
		try {
			if (draftKey) window.localStorage.removeItem(draftKey);
		} catch {
			/* ignore */
		}
		setCourseSel(courseId || '');
		setSection(1);
		setTitle('');
		setMode('individual');
		setActivityType('formal');
		setAllowRevision(false);
		setCheckOn(true);
		setCheckMaxInput('5');
		setAiAssistOn(false);
		setShape('');
		setStatus('draft');
		setSessionId('');
		setSubCpmkId('');
		setDeadlineInput('');
		setInstructions('');
		setRequirements('');
		setGroupInfo('');
		setStages([]);
		setStagesTouched(false);
		setAttachments([]);
		setTaskCfg(null);
		setAiPolicyMode('default');
		setAiEnabledCaps(new Set());
		setDraftNote('');
	};

	// ── Course & context data (loaded for the selected course) ──
	const courseListQuery = useCachedQuery<Course[]>(
		courseLocked || courses ? null : 'courses:owner-list',
		() => pb.collection('courses').getFullList<Course>({ sort: 'title' }),
	);
	const courseOptions = (courses || courseListQuery.data || []).filter((c) => c.owner === me);
	const courseQuery = useCachedQuery<Course>(
		courseSel ? `courses:one=${courseSel}` : null,
		() => pb.collection('courses').getOne<Course>(courseSel),
	);
	const activeCourse = courseSel || undefined;
	const libraryQuery = useCachedQuery<FileLibraryRecord[]>(
		courseSel ? `file_library:course=${courseSel}` : null,
		() =>
			pb.collection('file_library').getFullList<FileLibraryRecord>({
				filter: pb.filter('course = {:id}', { id: courseSel }),
				sort: '-updated',
			}),
	);
	const libraryFiles = libraryQuery.data ?? [];
	const {
		sessions,
		resources,
		loading: sessionsLoading,
		error: sessionsError,
	} = useCourseResources(activeCourse);
	const records = useCourseRecords(activeCourse);
	// A cached empty session list must not block latihan persiapan. If the
	// shared cache is empty after load, read pertemuan directly once.
	const [directSessions, setDirectSessions] = useState<ClassSession[] | null>(null);
	useEffect(() => {
		if (!courseSel || sessionsLoading || sessions.length > 0) {
			setDirectSessions(null);
			return;
		}
		let alive = true;
		void pb
			.collection('class_sessions')
			.getFullList<ClassSession>({
				filter: pb.filter('course = {:id}', { id: courseSel }),
				sort: 'week',
			})
			.then((rows) => {
				if (alive) setDirectSessions(rows);
			})
			.catch(() => {
				if (alive) setDirectSessions([]);
			});
		return () => {
			alive = false;
		};
	}, [courseSel, sessionsLoading, sessions.length]);
	const sessionChoices = useMemo(() => {
		const list = sessions.length > 0 ? sessions : directSessions || [];
		const expanded = parent?.expand?.session;
		if (expanded && !list.some((item) => item.id === expanded.id)) return [expanded, ...list];
		return list;
	}, [sessions, directSessions, parent]);
	const sessionsPending =
		Boolean(courseSel) && sessionsLoading && sessionChoices.length === 0 && directSessions === null;
	const subCpmks = records.subCpmk;
	const cpmks = records.cpmk;
	const cpls = records.cpl;
	const courseLabel = courseQuery.data
		? `${courseQuery.data.code ? `${courseQuery.data.code} · ` : ''}${courseQuery.data.title}`
		: '';

	// Batch 4: while EDITING a linked practice, the parent is only a reference
	// for an explicit, lecturer-triggered re-copy — never an automatic overwrite.
	const syncState = editing && parent ? practiceSyncState(assignment!, parent) : null;
	const syncOutdated = Boolean(syncState?.parentChanged && syncState.differing.length > 0);

	const resyncFromParent = async () => {
		if (!parent) return;
		if (
			!(await confirmDialog({
				title: 'Salin ulang dari tugas formal',
				message: `Salin ulang instruksi, ketentuan, tahapan, pemetaan, dan lampiran dari tugas formal “${parent.title}”? Isi latihan pada bagian itu akan diganti — konfigurasi soal khusus dan pengaturan latihan tidak disentuh.`,
				variant: 'default',
				confirmLabel: 'Salin ulang',
			}))
		)
			return;
		setInstructions(parent.instructions || '');
		setRequirements(parent.requirements || '');
		setGroupInfo(parent.groupInfo || '');
		setStages(parseStages(parent.stages));
		setStagesTouched(true);
		setSessionId(parent.session || '');
		setCpmkId('');
		setSubCpmkId(parent.subCpmk || '');
		setMode(parent.mode);
		setAttachments(parent.attachments || []);
		setSyncNote(
			'Isi latihan disalin ulang dari tugas formal — periksa tiap bagian lalu simpan perubahan. Konfigurasi soal khusus tidak disalin.',
		);
	};

	// ── Derived academic mapping (existing RPS data only) ──────
	const selectedSession = sessionChoices.find((s) => s.id === sessionId);
	const builderKind = taskKindForShape(shape);
	const builderReady = Boolean(builderKind && taskCfg?.kind === builderKind);
	const suggestPrompt =
		taskCfg?.kind === 'writing' ? taskCfg.writing.prompt : taskCfg?.kind === 'speaking' ? taskCfg.speaking.prompt : '';
	const suggestCriteriaCount =
		taskCfg?.kind === 'writing'
			? taskCfg.writing.criteria.length
			: taskCfg?.kind === 'speaking'
				? taskCfg.speaking.criteria.length
				: 0;
	const suggestEligible = editing && builderReady && (builderKind === 'writing' || builderKind === 'speaking');
	const showSuggestPanel =
		suggestEligible &&
		((suggestions?.pending.length ?? 0) > 0 ||
			Boolean(suggestions?.reason) ||
			suggestBusy ||
			Boolean(suggestError) ||
			canSuggestCriteria({ kind: builderKind, prompt: suggestPrompt, criteriaCount: suggestCriteriaCount }));
	const formal = activityType === 'formal';
	const checkMaxValue = Math.min(Math.max(parseInt(checkMaxInput, 10) || 5, 1), 10);
	const selectedSub = subCpmks.find((s) => s.id === subCpmkId);
	const mappingComplete = Boolean(
		courseSel &&
			sessionId &&
			cpmkId &&
			subCpmkId &&
			selectedSub?.cpmk === cpmkId &&
			(selectedSession?.subCpmks || []).includes(subCpmkId),
	);
	const parentCpmk = selectedSub?.cpmk ? cpmks.find((c) => c.id === selectedSub.cpmk) : undefined;
	const parentCpl = parentCpmk?.cpl ? cpls.find((c) => c.id === parentCpmk.cpl) : undefined;

	useEffect(() => {
		if (!selectedSub?.cpmk || cpmkId) return;
		setCpmkId(selectedSub.cpmk);
	}, [selectedSub?.cpmk, cpmkId]);

	const setStage = (i: number, patch: Partial<AssignmentStage>) => {
		setStagesTouched(true);
		setStages((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
	};
	const moveStage = (i: number, dir: -1 | 1) => {
		setStages((prev) => {
			const next = [...prev];
			const j = i + dir;
			if (j < 0 || j >= next.length) return prev;
			[next[i], next[j]] = [next[j], next[i]];
			return next;
		});
	};
	const applyPreset = async () => {
		const preset = shape
			? defaultStagesForShape(shape)
			: STAGE_PRESETS[mode].map((label) => ({ label }));
		if (
			stages.length > 0 &&
			!(await confirmDialog({
				title: 'Ganti tahapan',
				message: 'Ganti tahapan saat ini dengan tahapan bawaan?',
				variant: 'default',
				confirmLabel: 'Ganti',
			}))
		)
			return;
		setStages(preset);
		setStagesTouched(false);
	};

	const chooseCourse = (id: string) => {
		if (id === courseSel) return;
		setCourseSel(id);
		// Academic mapping and attachments belong to the previous course —
		// reset them so nothing is silently re-pointed at the new course.
		setSessionId('');
		setCpmkId('');
		setSubCpmkId('');
		setAttachments([]);
	};

	const sessionLinkedSubs = sessionId
		? subCpmks.filter((item) => (selectedSession?.subCpmks || []).includes(item.id))
		: [];
	const linkedCpmkIds = new Set([
		...(selectedSession?.cpmks || []),
		...sessionLinkedSubs.map((sub) => sub.cpmk).filter(Boolean),
	]);
	const cpmkChoices = cpmks.filter((item) => linkedCpmkIds.has(item.id));
	const mappedSubCpmks = cpmkId
		? sessionLinkedSubs.filter((item) => item.cpmk === cpmkId)
		: [];
	const contextReady =
		Boolean(courseSel) &&
		!sessionsPending &&
		!records.loading &&
		(sessions.length > 0 || directSessions !== null);
	const mappingMismatch = Boolean(
		contextReady &&
			subCpmkId &&
			sessionId &&
			selectedSession &&
			!(selectedSession.subCpmks || []).includes(subCpmkId),
	);
	const step1Warn: StatusDetail[] = [];
	const step1Bad: StatusDetail[] = [];
	if (sessionsError) {
		step1Bad.push({ id: 'sessions-error', text: sessionsError });
	}
	if (records.error) {
		step1Bad.push({ id: 'records-error', text: records.error });
	}
	if (contextReady && courseSel && sessionChoices.length === 0) {
		step1Warn.push({
			id: 'no-sessions',
			text: t('asg.s1.noSessionsWarn'),
			to: `/app/rps/${courseSel}?step=3`,
			linkLabel: t('asg.s1.rpsEditorLink'),
		});
	}
	if (contextReady && courseSel && subCpmks.length === 0) {
		step1Warn.push({
			id: 'no-sub',
			text: t('asg.s1.noSubCpmkWarn'),
			to: `/app/rps/${courseSel}?step=2`,
			linkLabel: t('asg.s1.rpsEditorLink'),
		});
	}
	if (contextReady && courseSel && sessionId && sessionLinkedSubs.length === 0 && subCpmks.length > 0) {
		step1Warn.push({
			id: 'session-unlinked',
			text: t('asg.s1.sessionUnlinkedWarn'),
			to: `/app/rps/${courseSel}?step=3`,
			linkLabel: t('asg.s1.linkInRpsLink'),
		});
	}
	if (contextReady && sessionId && sessionLinkedSubs.length > 0 && cpmkChoices.length === 0) {
		step1Warn.push({
			id: 'no-cpmk-link',
			text: t('asg.s1.noCpmkLinkWarn'),
			to: `/app/rps/${courseSel}?step=2`,
			linkLabel: t('asg.s1.rpsEditorLink'),
		});
	}
	if (mappingMismatch) {
		step1Warn.push({
			id: 'mismatch',
			text: t('asg.s1.mismatchWarn'),
		});
	}
	if (!mappingComplete) {
		if (!courseSel) step1Bad.push({ id: 'need-course', text: t('asg.s1.needCourseWarn') });
		if (courseSel && !sessionId && !sessionsPending)
			step1Bad.push({ id: 'need-session', text: t('asg.s1.needSessionWarn') });
		if (courseSel && sessionId && !cpmkId && contextReady && sessionLinkedSubs.length > 0)
			step1Bad.push({ id: 'need-cpmk', text: t('asg.s1.needCpmkWarn') });
		if (courseSel && sessionId && cpmkId && !subCpmkId && contextReady)
			step1Bad.push({ id: 'need-sub', text: t('asg.s1.needSubWarn') });
	}

	const chooseSession = (id: string) => {
		setSessionId(id);
		const next = sessionChoices.find((s) => s.id === id);
		const allowed = next?.subCpmks || [];
		if (subCpmkId && !allowed.includes(subCpmkId)) {
			setSubCpmkId('');
			setCpmkId('');
			return;
		}
		const stillOnSession =
			(next?.cpmks || []).includes(cpmkId) ||
			subCpmks.some((item) => allowed.includes(item.id) && item.cpmk === cpmkId);
		if (cpmkId && !stillOnSession) {
			setCpmkId('');
			setSubCpmkId('');
		}
	};

	const chooseCpmk = (id: string) => {
		setCpmkId(id);
		const sub = subCpmks.find((item) => item.id === subCpmkId);
		if (sub && sub.cpmk !== id) setSubCpmkId('');
	};

	const pickShape = async (value: AssignmentShape) => {
		const option = shapeOption(value);
		if (!option) return;
		const nextKind = taskKindForShape(value);
		const hasBuilderContent =
			taskCfg?.kind === 'quiz'
				? taskCfg.quiz.questions.length > 0
				: taskCfg?.kind === 'listening'
					? taskCfg.listening.questions.length > 0
					: taskCfg?.kind === 'writing'
					? Boolean(taskCfg.writing.prompt.trim() || taskCfg.writing.criteria.length)
					: false;
		if (nextKind && taskCfg && taskCfg.kind !== nextKind && hasBuilderContent) {
			if (
				!(await confirmDialog({
					title: t('asg.shapeChangeTitle'),
					message: t('asg.shapeChangeMessage'),
					variant: 'default',
					confirmLabel: t('asg.shapeChangeConfirm'),
				}))
			)
				return;
		}
		setShape(value);
		// Work format (Individu/Kelompok) is independent of task type.
		// Only replace stages the lecturer has not edited by hand.
		if (!stagesTouched) setStages(option.stages.map((label) => ({ label })));
		setTaskCfg(nextKind ? emptyEditableConfig(nextKind) : null);
	};

	const toggleAttachment = (id: string) => {
		setAttachments((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
	};

	// Phase 3 — student AI assistance policy handlers. Switching to a concrete
	// level presets the capability toggles to that level's safe defaults; the
	// lecturer may then restrict further or enable optional capabilities.
	const changePolicyMode = (next: AiPolicyMode) => {
		setAiPolicyMode(next);
		if (next === 'learning_support' || next === 'guided_assistance' || next === 'assessment_mode') {
			setAiEnabledCaps(defaultEnabledCapsForLevel(next));
		}
	};
	const togglePolicyCap = (cap: Capability, enabled: boolean) => {
		setAiEnabledCaps((prev) => {
			const next = new Set(prev);
			if (enabled) next.add(cap);
			else next.delete(cap);
			return next;
		});
	};

	// ── Provisional rubric-criterion suggestions (writing/speaking only) ──
	// Suggestions live in the separate `suggestedCriteria` field and never
	// affect grading until the lecturer accepts one, which moves it into
	// taskConfig.criteria as a normal editable criterion. Generation is
	// explicit (never on every keystroke, never blocking save). Dismissals are
	// durable (the label is remembered so regeneration won't bring it back).
	useEffect(() => {
		if (!assignment) {
			setSuggestions(null);
			return;
		}
		setSuggestions(parseSuggestedCriteria(assignment.suggestedCriteria));
	}, [assignment]);

	const handleGenerateSuggestions = async () => {
		if (!assignment) return;
		setSuggestBusy(true);
		setSuggestError('');
		try {
			const response = await fetch('/api/rubric-suggestions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({ assignmentId: assignment.id }),
			});
			const body = (await response.json()) as { suggestions?: SuggestedCriteria; error?: string };
			if (!response.ok) {
				setSuggestError(body.error || t('asg.suggestError'));
				return;
			}
			setSuggestions(body.suggestions ?? null);
		} catch (err) {
			setSuggestError(errorMessage(err));
		} finally {
			setSuggestBusy(false);
		}
	};

	const handleAcceptSuggestion = async (id: string) => {
		if (!assignment || !taskCfg) return;
		const kind = taskCfg.kind;
		if (kind !== 'writing' && kind !== 'speaking') return;
		const { state, criterion } = acceptSuggestion(suggestions ?? EMPTY_SUGGESTED_CRITERIA, id);
		if (!criterion) return;
		const newCriterion = { id: newRowId('c'), label: criterion.label, weight: criterion.weight };
		const nextCfg =
			kind === 'writing'
				? { ...taskCfg, writing: { ...taskCfg.writing, criteria: [...taskCfg.writing.criteria, newCriterion] } }
				: { ...taskCfg, speaking: { ...taskCfg.speaking, criteria: [...taskCfg.speaking.criteria, newCriterion] } };
		setTaskCfg(nextCfg);
		setSuggestions(state);
		// Persist both the new criterion (inside taskConfig) and the updated
		// provisional suggestions atomically, so acceptance survives a reload
		// even before the form is saved. Non-fatal on failure — the form save
		// still writes taskConfig, and the in-session state already reflects it.
		try {
			const split = splitTaskConfigForSave(nextCfg);
			await pb.collection('assignments').update(assignment.id, {
				taskConfig: split.taskConfig,
				suggestedCriteria: state,
			});
		} catch {
			/* non-fatal — saved on form submit */
		}
	};

	const handleDismissSuggestion = async (id: string) => {
		if (!assignment) return;
		const state = dismissSuggestion(suggestions ?? EMPTY_SUGGESTED_CRITERIA, id);
		setSuggestions(state);
		try {
			await pb.collection('assignments').update(assignment.id, { suggestedCriteria: state });
		} catch {
			/* non-fatal — dismissal is reflected in-session */
		}
	};

	const applyImported = (raw: string) => {
		const parsed = parseAssignmentImport(raw);
		if (parsed.title) setTitle(parsed.title);
		if (parsed.mode) setMode(parsed.mode);
		if (parsed.instructions) setInstructions(parsed.instructions);
		if (parsed.requirements) setRequirements(parsed.requirements);
		if (parsed.groupInfo) setGroupInfo(parsed.groupInfo);
		if (parsed.stages.length) {
			setStages(parsed.stages);
			setStagesTouched(true);
		}
		if (parsed.deadlineRaw) {
			const local = deadlineToLocalInput(parsed.deadlineRaw);
			if (local) setDeadlineInput(local);
		}
		const notes = [...parsed.reviewNotes];
		if (parsed.attachmentTitles.length) {
			const matched: string[] = [];
			for (const wanted of parsed.attachmentTitles) {
				const hit = libraryFiles.find((r) => r.title.trim().toLowerCase() === wanted.toLowerCase());
				if (hit) matched.push(hit.id);
				else notes.push(`Lampiran “${wanted}” tidak cocok dengan dokumen Manajemen berkas — tidak dilampirkan.`);
			}
			if (matched.length) setAttachments((prev) => [...new Set([...prev, ...matched])]);
		}
		setStatus('draft');
		notes.push(t('asg.importSavedDraft'));
		// Quiz imports may carry labeled question blocks — parse them into the builder.
		if (taskKindForShape(shape) === 'quiz') {
			const parsed = parseQuizQuestionsFromText(raw);
			if (parsed.questions.length > 0) {
				const base = taskCfg?.kind === 'quiz' ? taskCfg.quiz : DEFAULT_QUIZ_CONFIG;
				setTaskCfg({ kind: 'quiz', quiz: { ...base, questions: parsed.questions } });
				notes.push(`${parsed.questions.length} soal kuis terpetakan dari teks impor — tinjau kunci dan poin tiap soal.`);
			}
			notes.push(...parsed.notes);
		}
		setReviewNotes(notes);
	};

	const onFile = async (file: File | undefined) => {
		if (!file) return;
		setError('');
		try {
			const text = await readAssignmentSourceFile(file);
			setPaste(text);
			applyImported(text);
		} catch (err) {
			setError(errorMessage(err));
		}
	};

	const generate = async () => {
		if (!courseSel || !mappingComplete || !shape) return;
		setToolBusy(true);
		setError('');
		try {
			const response = await fetch('/api/assignment-draft', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({
					courseId: courseSel,
					sessionId,
					subCpmkId,
					shape,
					instruction: hint,
					sourceText: paste,
				}),
			});
			const body = (await response.json()) as DraftResponse;
			if (!response.ok) {
				setError(body.error || t('asg.aiDraftError'));
				return;
			}
			if (body.title) setTitle(body.title);
			if (body.mode) setMode(body.mode);
			setInstructions(body.instructions || '');
			setRequirements(body.requirements || '');
			setGroupInfo(body.groupInfo || '');
			if (body.stages?.length) {
				setStages(body.stages);
				setStagesTouched(true);
			}
			if (body.sessionId) setSessionId(body.sessionId);
			if (body.subCpmkId) setSubCpmkId(body.subCpmkId);
			if (body.deadline) setDeadlineInput(deadlineToLocalInput(body.deadline));
			setStatus('draft');
			setReviewNotes(body.reviewNotes || []);
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setToolBusy(false);
		}
	};

	const save = async (
		event: React.FormEvent<HTMLFormElement> | null,
		nextStatus?: AssignmentStatus,
	) => {
		event?.preventDefault();
		const saveStatus = nextStatus ?? status;
		setError('');
		if (!courseSel) {
			setError(t('asg.err.course'));
			setSection(1);
			return;
		}
		const session = sessionChoices.find((s) => s.id === sessionId);
		if (!session || !(session.subCpmks || []).includes(subCpmkId)) {
			setError(t('asg.err.mapping'));
			setSection(1);
			return;
		}
		if (!shape) {
			setError(t('asg.err.shape'));
			setSection(2);
			return;
		}
		if (!title.trim()) {
			setError(t('asg.err.title'));
			setSection(1);
			return;
		}
		if (stages.some((s) => !s.label.trim())) {
			setError(t('asg.err.stages'));
			setSection(2);
			return;
		}
		const kind = taskKindForShape(shape);
		let split: { taskConfig: Record<string, unknown>; answerKey: unknown } | null = null;
		if (kind) {
			if (!taskCfg || taskCfg.kind !== kind) {
				setError(t('asg.err.config', { kind: TASK_KIND_LABEL[kind] }));
				setSection(2);
				return;
			}
			const warnings = validateEditableConfig(taskCfg);
			if (warnings.length > 0 && saveStatus !== 'draft') {
				setError(t('asg.err.configPublish', { kind: TASK_KIND_LABEL[kind], first: warnings[0].message }));
				setSection(2);
				return;
			}
			split = splitTaskConfigForSave(taskCfg);
		}
		setBusy(true);
		try {
			const data: Record<string, unknown> = {
				title: title.trim(),
				mode,
				activityType,
				shape,
				status: saveStatus,
				instructions: instructions.trim(),
				requirements: requirements.trim(),
				groupInfo: groupInfo.trim(),
				session: sessionId,
				subCpmk: subCpmkId,
				deadline: localInputToDeadline(deadlineInput),
				stages: stages.filter((s) => s.label.trim()),
				attachments,
				...(split ? { taskConfig: split.taskConfig } : {}),
				// Phase 10 — adaptive personalized feedback control condition.
				// Generic is the default; personalization is explicit opt-in.
				feedbackMode,
				personalizationThreshold: Math.min(
					Math.max(parseInt(personalizationThreshold, 10) || 3, 1),
					20,
				),
				// Phase 2 step 5 type-separated settings. Formal keeps the
				// default formative checks (set only on create so an existing
				// lecturer choice is never overwritten) and carries the revision
				// policy. Formative saves the visible practice/feedback settings.
				...(formal
					? {
							allowRevision,
							...(!editing ? { checkEnabled: true, checkMax: assignment?.checkMax || 5 } : {}),
						}
					: {
							checkEnabled: checkOn,
							checkMax: checkMaxValue,
							// Batch 3: lecturer-controlled AI practice assistance.
							aiAssistEnabled: aiAssistOn,
						}),
			};
			if (editing && suggestions) data.suggestedCriteria = suggestions;
			// Phase 3 — student AI assistance policy. 'default' stores null so the
			// server derives from activity type (backward compatible); a concrete
			// level or 'off' stores an explicit policy the server enforces.
			data.aiPolicy = buildStoredPolicy(aiPolicyMode, aiEnabledCaps, activityType);
			let assignmentId = assignment?.id || '';
			if (editing) {
				await pb.collection('assignments').update(assignment!.id, data);
			} else {
				data.course = courseSel;
				data.owner = pb.authStore.record?.id;
				// Batch 1: link the practice to its formal parent. Only a formative
				// practice carries the link — switching the activity type to formal
				// drops it, so a formal task never points at another formal task.
				if (parent && activityType === 'formative') data.parentAssignment = parent.id;
				const created = await pb.collection('assignments').create<Assignment>(data);
				assignmentId = created.id;
			}
			// Upsert the owner-only answer key for auto-gradable types.
			if (split && assignmentId) {
				const existing = await pb
					.collection('task_answer_keys')
					.getFirstListItem(`assignment = "${assignmentId}"`)
					.catch(() => null);
				if (existing) {
					await pb.collection('task_answer_keys').update(existing.id, { key: split.answerKey });
				} else {
					await pb.collection('task_answer_keys').create({
						assignment: assignmentId,
						key: split.answerKey,
					});
				}
			}
			invalidate('assignments');
			invalidate('task_answer_keys');
			// The local autosave draft has served its purpose — clear it.
			try {
				if (draftKey && !editing && !parent) window.localStorage.removeItem(draftKey);
			} catch {
				/* ignore */
			}
			setStatus(saveStatus);
			// A fresh formal task shows a success panel with an optional
			// "Buat latihan persiapan" next action; edits and practices navigate
			// straight back as before.
			if (!editing && !parent && formal) {
				setCreatedId(assignmentId);
			} else {
				onSaved(assignmentId);
			}
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	const previewMaterials = libraryFiles.filter((f) => attachments.includes(f.id));
	const builderWarnings = taskCfg ? validateEditableConfig(taskCfg) : [];
	const previewMissing: string[] = [];
	if (!mappingComplete) previewMissing.push(t('asg.preview.missingMapping'));
	if (!shape) previewMissing.push(t('asg.preview.missingShape'));
	if (!title.trim()) previewMissing.push(t('asg.preview.missingTitle'));
	if (builderKind && (!taskCfg || taskCfg.kind !== builderKind))
		previewMissing.push(t('asg.preview.missingConfig', { kind: builderKind ? TASK_KIND_LABEL[builderKind] : '' }));
	if (stages.some((s) => !s.label.trim()))
		previewMissing.push(t('asg.preview.missingStages'));

	// Unified validation issues for the Review section + footer count. Each
	// issue carries the section it belongs to so the lecturer can jump there.
	const reviewIssues: { section: number; text: string }[] = [];
	if (!courseSel) reviewIssues.push({ section: 1, text: t('asg.review.needCourse') });
	if (courseSel && !sessionId && !sessionsPending)
		reviewIssues.push({ section: 1, text: t('asg.review.needSession') });
	if (courseSel && sessionId && !cpmkId && contextReady && sessionLinkedSubs.length > 0)
		reviewIssues.push({ section: 1, text: t('asg.review.needCpmk') });
	if (courseSel && sessionId && cpmkId && !subCpmkId && contextReady)
		reviewIssues.push({ section: 1, text: t('asg.review.needSub') });
	if (!shape) reviewIssues.push({ section: 2, text: t('asg.review.needShape') });
	if (!title.trim()) reviewIssues.push({ section: 1, text: t('asg.review.needTitle') });
	if (stages.some((s) => !s.label.trim()))
		reviewIssues.push({ section: 2, text: t('asg.review.needStages') });
	if (builderKind && (!taskCfg || taskCfg.kind !== builderKind))
		reviewIssues.push({ section: 2, text: t('asg.review.needConfig', { kind: TASK_KIND_LABEL[builderKind] }) });
	if (builderWarnings.length > 0)
		reviewIssues.push({ section: 2, text: builderWarnings[0].message });
	const issueCount = reviewIssues.length;

	const isPage = variant === 'page';
	const bodyClassName = isPage ? 'asg-editor-body' : 'asg-dialog-scroll';
	const footClassName = isPage ? 'asg-editor-foot' : 'asg-dialog-foot';
	const headerEl = isPage ? (
		<header className="asg-editor-head">
			<div>
				<span className="ld-eyebrow">
					TUGAS / {editing ? 'EDIT' : parent ? 'LATIHAN PERSIAPAN' : 'BARU'}
				</span>
				<h1>
					{editing ? 'Edit tugas' : parent ? 'Buat latihan persiapan' : 'Buat tugas baru'}
				</h1>
			</div>
			<div className="asg-editor-actions">
				{editing && assignment?.id ? (
					<Link to={`/app/tugas/${assignment.id}/pratinjau`} className="ld-outline-action">
						<Eye size={16} /> {t('asg.preview')}
					</Link>
				) : null}
				<button type="button" className="ld-outline-action" onClick={onClose}>
					<X size={16} /> {t('asg.close')}
				</button>
			</div>
		</header>
	) : (
		<header className="asg-dialog-head">
			<div>
				<p className="modal-top">
					TUGAS / {editing ? 'EDIT' : parent ? 'LATIHAN PERSIAPAN' : 'BARU'}
				</p>
				<h2 id="assignment-form-title">
					{editing ? 'Edit tugas' : parent ? 'Buat latihan persiapan' : 'Buat tugas baru'}
				</h2>
			</div>
			<button type="button" className="asg-dialog-close" aria-label="Tutup" onClick={onClose}>
				<X size={20} />
			</button>
		</header>
	);

	// ── Post-create success panel (fresh formal task only) ──
	if (createdId) {
		const goPractice = () => {
			window.location.assign(`/app/courses/${courseSel}/latihan`);
		};
		const successWrap = (children: React.ReactNode) =>
			isPage ? (
				<div className="asg-editor">
					<div className="asg-editor-form asg-success">{children}</div>
				</div>
			) : (
				<AppModal open onClose={() => {}} title={t('asg.success.title')} className="asg-success">
					{children}
				</AppModal>
			);

		return successWrap(
					<div className="asg-success-body">
						<div className="asg-success-icon">
							<CheckCircle2 size={32} />
						</div>
						<h2>{t('asg.success.title')}</h2>
						<p>
							“{title.trim() || 'Tanpa judul'}” tersimpan
							{status === 'published' ? ' dan diterbitkan' : ' sebagai draf'}. Mahasiswa
							melihat tugas setelah status Diterbitkan.
						</p>
						<div className="asg-success-actions">
							<button
								type="button"
								className="ld-btn-primary"
								onClick={() => onSaved(createdId)}
							>
								<Eye size={15} /> {t('asg.success.viewTask')}
							</button>
							<button
								type="button"
								className="ld-outline-action"
								onClick={goPractice}
							>
								<Repeat size={15} /> Buka Latihan Personal
							</button>
						</div>
						<p className="asg-success-note">
							<Info size={13} /> Latihan Personal menggunakan materi pertemuan terbaru dan umpan balik mahasiswa, tanpa dampak pada nilai resmi.
						</p>
					</div>
		);
	}

	const dialogTitle = editing ? t('asg.title.edit') : parent ? t('asg.title.practice') : t('asg.title.new');
	const wrap = (children: React.ReactNode) =>
		isPage ? (
			<div className="asg-editor">{children}</div>
		) : (
			<AppModal open onClose={onClose} title={dialogTitle} className="asg-dialog">
				{children}
			</AppModal>
		);

	return wrap(
			<form
				onSubmit={save}
				className={isPage ? 'asg-editor-form' : ''}
				style={
					isPage
						? undefined
						: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
				}
			>
				{headerEl}

				<div className={bodyClassName}>
					{/* ── Section navigation (flexible, never blocked) ── */}
					<FormStepper
						steps={SECTIONS}
						current={section}
						onSelect={setSection}
						canSelect={() => true}
						ariaLabel={t('asg.stepperAria')}
					/>

					{(courseLabel || selectedSession || selectedSub || shape) && (
						<div className="asg-wsummary">
							{courseLabel && <span className="asg-tag">{courseLabel}</span>}
							{selectedSession && (
								<span className="asg-tag">
									Minggu {weekLabel(selectedSession.week)} · {selectedSession.title}
								</span>
							)}
							{selectedSub && (
								<span className="asg-tag">
									Sub-CPMK {selectedSub.code || selectedSub.description}
								</span>
							)}
							{shape && <span className="asg-tag mode">{SHAPE_LABEL[shape]}</span>}
						</div>
					)}

					{draftNote && !editing && !parent && (
						<div className="asg-draft-note" role="status">
							<Info size={15} />
							<span>
								{draftNote}{' '}
								<button type="button" className="ld-text-btn" onClick={discardDraft}>
									Buang draf lokal
								</button>
							</span>
						</div>
					)}

					{parent && !editing && (
						<div className="asg-copy-note" role="status">
							<Info size={15} />
							<div>
								<strong>Latihan persiapan untuk tugas formal “{parent.title}”.</strong>
								<span>
									Pertemuan, Sub-CPMK, instruksi, ketentuan/rubrik, tahapan, dan materi
									tersalin dari tugas formal — kurangi atau ubah bagian mana pun sebelum
									menerbitkan. Konfigurasi soal khusus tidak disalin. Latihan ini berulang,
									tanpa pengumpulan final, dan tidak berdampak pada nilai resmi.
								</span>
							</div>
						</div>
					)}

					{editing && syncOutdated && syncState && (
						<div className="asg-sync-note" role="alert">
							<AlertTriangle size={15} />
							<div>
								<strong>
									Tugas formal “{parent?.title}” berubah setelah latihan ini dibuat.
								</strong>
								<span>
									Latihan tidak diperbarui otomatis dan tetap bisa diedit mandiri. Bagian yang
									berbeda dari tugas formal: {syncState.differing.join(' · ')}. Salin ulang
									hanya bila diperlukan — isi latihan pada bagian itu akan diganti.
								</span>
								<div className="asg-sync-actions">
									<button
										type="button"
										className="ld-outline-action sm"
										onClick={resyncFromParent}
									>
										<RotateCcw size={14} /> Salin ulang dari tugas formal
									</button>
								</div>
							</div>
						</div>
					)}
					{syncNote && (
						<p className="asg-map-ok" role="status">
							<CheckCircle2 size={14} /> {syncNote}
						</p>
					)}

					{/* ═════════ SECTION 1 — DASAR ═════════ */}
					{section === 1 && (
						<>
							<section className="asg-section" aria-label="Mata kuliah dan konteks">
								<h3>{t('asg.s1.heading')}</h3>
								<p className="rps-help">
									Tugas dibuat untuk satu mata kuliah dan harus terhubung ke pertemuan, CPMK,
									dan Sub-CPMK dari data RPS mata kuliah itu. Setelah pertemuan dipilih, hanya
									CPMK yang punya Sub-CPMK pada pertemuan itu yang muncul.
								</p>
								{courseLocked ? (
									<div className="asg-map-summary">
										<div className="asg-map-row">
											<small>Mata kuliah</small>
											<span>{courseLabel || 'Memuat mata kuliah...'}</span>
										</div>
									</div>
								) : courseOptions.length === 0 && courseListQuery.loading ? (
									<p className="asg-shape-note">
										<LoaderCircle size={13} className="spin" /> Memuat mata kuliah...
									</p>
								) : courseOptions.length === 0 ? (
									<p className="asg-map-note">
										<AlertTriangle size={14} />
										<span>
											Anda belum memiliki mata kuliah. Buat mata kuliah lebih dulu di{' '}
											<Link to="/app/courses">Mata kuliah</Link>, lalu kembali ke sini.
										</span>
									</p>
								) : (
									<MappingSelect
										label="Mata kuliah"
										required
										value={courseSel}
										onChange={chooseCourse}
										placeholder="Pilih mata kuliah…"
										options={courseOptions.map((c) => ({
											value: c.id,
											label: `${c.code ? `${c.code} · ` : ''}${c.title}`,
										}))}
									/>
								)}
								<div className="asg-pair">
									<MappingSelect
										label="Pertemuan"
										required
										value={sessionId}
										onChange={chooseSession}
										disabled={!courseSel || sessionsPending}
										placeholder={
											!courseSel
												? 'Pilih mata kuliah dulu'
												: sessionsPending
													? 'Memuat pertemuan...'
													: sessionChoices.length === 0
														? 'Tidak ada pertemuan'
														: 'Pilih pertemuan'
										}
										options={sessionChoices.map((s) => ({
											value: s.id,
											label: `Minggu ${weekLabel(s.week)} · ${s.title}`,
										}))}
									/>
									<MappingSelect
										label="CPMK"
										required
										value={cpmkChoices.some((item) => item.id === cpmkId) ? cpmkId : ''}
										onChange={chooseCpmk}
										disabled={!sessionId || sessionsPending || records.loading || cpmkChoices.length === 0}
										placeholder={
											!sessionId
												? 'Pilih pertemuan dulu'
												: sessionsPending || records.loading
													? 'Memuat CPMK...'
													: cpmkChoices.length === 0
														? 'Tidak ada CPMK pada pertemuan ini'
														: 'Pilih CPMK pertemuan ini'
										}
										options={cpmkChoices.map((item) => ({
											value: item.id,
											label: `${item.code ? `${item.code} · ` : ''}${item.description}`,
										}))}
									/>
								</div>
								<MappingSelect
									label="Sub-CPMK"
									required
									value={mappedSubCpmks.some((s) => s.id === subCpmkId) ? subCpmkId : ''}
									onChange={setSubCpmkId}
									disabled={!cpmkId || sessionsPending || records.loading || mappedSubCpmks.length === 0}
									placeholder={
										!sessionId
											? 'Pilih pertemuan dulu'
											: !cpmkId
												? 'Pilih CPMK dulu'
												: sessionsPending || records.loading
													? 'Memuat Sub-CPMK...'
													: mappedSubCpmks.length === 0
														? 'Tidak ada Sub-CPMK pada CPMK ini'
														: 'Pilih Sub-CPMK'
									}
									options={mappedSubCpmks.map((s) => ({
										value: s.id,
										label: `${s.code ? `${s.code} · ` : ''}${s.description}`,
									}))}
								/>
								<StatusMarks
									expanded
									bad={step1Bad}
									warn={step1Warn}
									ok={
										mappingComplete
											? [
													{
														id: 'map-ok',
														text: t('asg.s1.mapCompleteOk'),
													},
												]
											: []
									}
								/>
								{(selectedSession || selectedSub) && (
									<div className="asg-map-summary">
										<div className="asg-map-row">
											<small>{t('asg.s1.session')}</small>
											<span>
												{selectedSession
													? `Minggu ${weekLabel(selectedSession.week)} — ${selectedSession.title}`
													: 'Belum dipilih'}
											</span>
										</div>
										<div className="asg-map-row">
											<small>{t('asg.s1.subCpmk')}</small>
											<span>
												{selectedSub
													? `${selectedSub.code ? `${selectedSub.code} — ` : ''}${selectedSub.description}`
													: 'Belum dipilih'}
											</span>
										</div>
										<div className={`asg-map-row${parentCpmk ? '' : ' missing'}`}>
											<small>{t('asg.s1.cpmk')}</small>
											<span>
												{parentCpmk
													? `${parentCpmk.code ? `${parentCpmk.code} — ` : ''}${parentCpmk.description}`
													: selectedSub
														? t('asg.s1.subNotLinkedCpmk')
														: '—'}
											</span>
										</div>
										<div className={`asg-map-row${parentCpl ? '' : ' missing'}`}>
											<small>{t('asg.s1.cpl')}</small>
											<span>
												{parentCpl
													? `${parentCpl.code ? `${parentCpl.code} — ` : ''}${parentCpl.description}`
													: selectedSub
														? t('asg.s1.cplNotDerived')
														: '—'}
											</span>
										</div>
									</div>
								)}
							</section>

							<section className="asg-section" aria-label="Jenis aktivitas">
								<h3>{t('asg.s1.activityHeading')}</h3>
								<p className="rps-help">
									Tugas formal dinilai dan dihitung dalam penilaian resmi. Latihan Personal tersedia di tab Latihan pada mata kuliah.
								</p>
								<div className="asg-type-grid" role="radiogroup" aria-label="Jenis aktivitas">
									<label className={`asg-shape-card${formal ? ' checked' : ''}`}>
										<input
											type="radio"
											name="assignment-activity-type"
											checked={formal}
											onChange={() => setActivityType('formal')}
										/>
										<strong>
											<ClipboardCheck size={15} /> {t('asg.s1.formal')}
										</strong>
										<span>
											Pengumpulan final dengan batas waktu, rubrik, revisi, dan nilai resmi.
										</span>
										<em>Pengumpulan final · dinilai</em>
									</label>
									{editing ? <label className={`asg-shape-card${formal ? '' : ' checked'}`}>
										<input
											type="radio"
											name="assignment-activity-type"
											checked={!formal}
											onChange={() => setActivityType('formative')}
										/>
										<strong>
											<Repeat size={15} /> {t('asg.s1.formative')}
										</strong>
										<span>
											Latihan berulang dengan Cek jawaban dan umpan balik — tanpa pengumpulan
											final, tanpa dampak nilai.
										</span>
										<em>{t('asg.s1.formativeTag')}</em>
									</label> : <a className="asg-shape-card" href={courseSel ? `/app/courses/${courseSel}/latihan` : '/app/courses'}><strong><Repeat size={15} /> Latihan Personal</strong><span>Soal singkat dari materi terbaru, disesuaikan dengan kebutuhan mahasiswa.</span><em>Buka tab Latihan mata kuliah →</em></a>}
								</div>
							</section>

							<section className="asg-section" aria-label="Judul tugas">
								<h3>{t('asg.s1.titleHeading')}</h3>
								<label>
									{t('asg.s1.titleLabel')} <span>*</span>
									<input
										required
										maxLength={200}
										value={title}
										onChange={(e) => setTitle(e.target.value)}
										placeholder={t('asg.s1.titlePlaceholder')}
									/>
								</label>
								{!title.trim() && (
									<StatusMarks
										expanded
										bad={[{ id: 'need-title', text: 'Judul tugas wajib diisi sebelum menerbitkan.' }]}
									/>
								)}
							</section>
						</>
					)}

					{/* ═════════ SECTION 2 — TUGAS ═════════ */}
					{section === 2 && (
						<>
							<section className="asg-section" aria-label="Bentuk tugas">
								<h3>{t('asg.s2.shapeHeading')}</h3>
								<p className="rps-help">
									Pilih keterampilan atau format tugas. Format kerja (Individu/Kelompok)
									dipilih terpisah di bawah dan berlaku untuk semua jenis.
								</p>
								<div className="asg-shape-grid" role="radiogroup" aria-label="Bentuk tugas">
									{SHAPE_OPTIONS.map((option) => {
										const Icon = SHAPE_ICONS[option.value];
										const checked = shape === option.value;
										return (
											<label
												key={option.value}
												className={`asg-shape-card${checked ? ' checked' : ''}`}
											>
												<input
													type="radio"
													name="assignment-shape"
													checked={checked}
													onChange={() => void pickShape(option.value)}
												/>
												<strong>
													<Icon size={15} /> {option.label}
												</strong>
												<span>{option.description}</span>
												<em>
													{option.group === 'language' ? 'Keterampilan bahasa' : 'Format umum'} ·{' '}
													{option.stages.length} tahapan
												</em>
											</label>
										);
									})}
								</div>
								{!shape && (
									<StatusMarks expanded bad={[{ id: 'need-shape', text: 'Pilih salah satu bentuk tugas untuk melanjutkan.' }]} />
								)}
							</section>

							{/* Task-specific builder — the center of the creation experience */}
							{(() => {
								const kind = taskKindForShape(shape);
								if (!kind || !taskCfg || taskCfg.kind !== kind) return null;
								const warnings = validateEditableConfig(taskCfg);
								return (
									<section className="asg-section tkb-section" aria-label={`Konfigurasi ${TASK_KIND_LABEL[kind]}`}>
										<div className="asg-section-head">
											<h3>{t('asg.s2.configHeading', { kind: TASK_KIND_LABEL[kind] })}</h3>
										</div>
										{taskCfg?.kind === 'quiz' && (
											<QuizBuilder
												value={taskCfg.quiz}
												onChange={(quiz) => setTaskCfg({ kind: 'quiz', quiz })}
											/>
										)}
										{taskCfg?.kind === 'listening' && (
											<ListeningBuilder
												value={taskCfg.listening}
												onChange={(listening) => setTaskCfg({ kind: 'listening', listening })}
												resources={resources}
											/>
										)}
										{taskCfg?.kind === 'writing' && (
											<WritingBuilder
												value={taskCfg.writing}
												onChange={(writing) => setTaskCfg({ kind: 'writing', writing })}
											/>
										)}
										{taskCfg?.kind === 'speaking' && (
											<SpeakingBuilder
												value={taskCfg.speaking}
												heading={shape === 'conversation' ? 'Konfigurasi percakapan' : 'Konfigurasi berbicara'}
												lead={
													shape === 'conversation'
														? 'Skenario peran, durasi, bukti unjuk, dan rubrik. Peran tidak diarang.'
														: 'Prompt lisan, durasi, cara pengumpulan, dan rubrik.'
												}
												onChange={(speaking) => setTaskCfg({ kind: 'speaking', speaking })}
											/>
										)}
										{taskCfg?.kind === 'reading' && (
											<ReadingBuilder
												value={taskCfg.reading}
												onChange={(reading) => setTaskCfg({ kind: 'reading', reading })}
											/>
										)}
										{showSuggestPanel && (
											<RubricSuggestionsPanel
												suggestions={suggestions}
												busy={suggestBusy}
												error={suggestError}
												onGenerate={() => void handleGenerateSuggestions()}
												onAccept={(id) => void handleAcceptSuggestion(id)}
												onDismiss={(id) => void handleDismissSuggestion(id)}
											/>
										)}
										{warnings.length > 0 && (
											<StatusMarks
												warn={warnings.slice(0, 6).map((w, i) => ({ id: `cfg-${i}`, text: w.message }))}
											/>
										)}
									</section>
								);
							})()}

							<section className="asg-section" aria-label="Instruksi">
								<h3>{t('asg.s2.instructions')}</h3>
								<label>
									{t('asg.s2.instructionsLabel')}
									<textarea
										rows={5}
										maxLength={10000}
										value={instructions}
										onChange={(e) => setInstructions(e.target.value)}
										placeholder={t('asg.s2.instructionsPlaceholder')}
									/>
								</label>
							</section>

							<section className="asg-section" aria-label="Format kerja dan tahapan">
								<div className="asg-dialog-grid">
									<div className="asg-section-head">
										<h3>{t('asg.s2.formatHeading')}</h3>
									</div>
									<MappingSelect
										label="Format kerja"
										value={mode}
										onChange={(value) => setMode(value as AssignmentMode)}
										placeholder={t('asg.s2.formatPlaceholder')}
										options={[
											{ value: 'individual', label: t('asg.s2.formatIndividual') },
											{ value: 'collaborative', label: t('asg.s2.formatGroup') },
										]}
									/>
									{mode === 'collaborative' && (
										<label>
											{t('asg.s2.groupLabel')}
											<textarea
												rows={2}
												maxLength={2000}
												value={groupInfo}
												onChange={(e) => setGroupInfo(e.target.value)}
												placeholder={t('asg.s2.groupPlaceholder')}
											/>
										</label>
									)}
								</div>
								<div className="asg-section-head">
									<h3>{t('asg.s2.stages')}</h3>
									<button type="button" className="ld-text-btn" onClick={applyPreset}>
										<Sparkles size={13} /> {t('asg.s2.stagesPreset')}
									</button>
								</div>
								{stages.length === 0 && (
									<p className="asg-stage-empty">
										Belum ada tahapan. Tambahkan sendiri atau pakai tahapan bawaan bentuk
										tugas ini.
									</p>
								)}
								<ul className="asg-stage-list">
									{stages.map((stage, i) => (
										<li key={i} className="asg-stage-row">
											<span className="asg-stage-num">{i + 1}</span>
											<input
												maxLength={100}
												value={stage.label}
												onChange={(e) => setStage(i, { label: e.target.value })}
												placeholder={t('asg.s2.stageNamePlaceholder')}
												aria-label={`Nama tahapan ${i + 1}`}
											/>
											<input
												maxLength={200}
												value={stage.note || ''}
												onChange={(e) => setStage(i, { note: e.target.value })}
												placeholder={t('asg.s2.stageNotePlaceholder')}
												aria-label={`Catatan tahapan ${i + 1}`}
											/>
											<div className="asg-stage-row-actions">
												<button
													type="button"
													aria-label={`Naikkan tahapan ${i + 1}`}
													disabled={i === 0}
													onClick={() => moveStage(i, -1)}
												>
													<ArrowUp size={14} />
												</button>
												<button
													type="button"
													aria-label={`Turunkan tahapan ${i + 1}`}
													disabled={i === stages.length - 1}
													onClick={() => moveStage(i, 1)}
												>
													<ArrowDown size={14} />
												</button>
												<button
													type="button"
													aria-label={`Hapus tahapan ${i + 1}`}
													onClick={() =>
														setStages((prev) => prev.filter((_, idx) => idx !== i))
													}
												>
													<Trash2 size={14} />
												</button>
											</div>
										</li>
									))}
								</ul>
								<button
									type="button"
									className="ld-text-btn"
									onClick={() => {
										setStagesTouched(true);
										setStages((prev) => [...prev, { label: '' }]);
									}}
								>
									<Plus size={13} /> {t('asg.s2.stageAdd')}
								</button>
							</section>

							{/* AI / import as a secondary creation method */}
							<details className="asg-disclosure">
								<summary>
									<Sparkles size={14} /> {t('asg.s2.otherMethods')}
									<ChevronDown size={15} />
								</summary>
								<div className="asg-disclosure-body">
									{mappingComplete ? (
										<div className="asg-tools">
											<div className="asg-tool-tabs" role="tablist">
												<button
													type="button"
													role="tab"
													aria-selected={tool === 'import'}
													className={tool === 'import' ? 'active' : ''}
													onClick={() => setTool('import')}
												>
													<FileUp size={15} /> {t('asg.s2.import')}
												</button>
												<button
													type="button"
													role="tab"
													aria-selected={tool === 'ai'}
													className={tool === 'ai' ? 'active' : ''}
													onClick={() => setTool('ai')}
												>
													<Sparkles size={15} /> {t('asg.s2.ai')}
												</button>
											</div>
											{tool === 'import' ? (
												<div className="asg-tool-body">
													<p>
														Tempel teks berlabel (Judul:, Instruksi:, Tahapan:, Batas
														waktu:, Ketentuan:, Rubrik:) atau CSV dengan kolom yang sama.
														Unggah .txt, .csv, atau .md. Isi yang tidak terbaca ditandai,
														tidak ditebak.
													</p>
													<textarea
														rows={4}
														value={paste}
														onChange={(e) => setPaste(e.target.value)}
														placeholder={'Judul: Proyek mingguan\nInstruksi: ...\nTahapan: Riset | Draf | Pengumpulan\nBatas waktu: 2026-05-12 23:59'}
													/>
													<div className="asg-tool-actions">
														<input
															ref={fileRef}
															type="file"
															className="pdf-file-input"
															accept=".txt,.csv,.md,text/plain,text/csv"
															onChange={(e) => {
																void onFile(e.target.files?.[0]);
																e.target.value = '';
															}}
														/>
														<button
															type="button"
															className="ld-outline-action sm"
															onClick={() => fileRef.current?.click()}
														>
															<FileUp size={14} /> {t('asg.s2.uploadText')}
														</button>
														<button
															type="button"
															className="ld-btn-primary"
															onClick={() => applyImported(paste)}
															disabled={!paste.trim()}
														>
															{t('asg.s2.mapDraft')}
														</button>
													</div>
												</div>
											) : builderReady && builderKind && (builderKind === 'quiz' || builderKind === 'listening' || builderKind === 'writing' || builderKind === 'speaking') ? (
												<TaskAutofill
													courseId={courseSel}
													sessionId={sessionId}
													subCpmkId={subCpmkId}
													shape={shape as AssignmentShape}
													kind={builderKind}
													title={title}
													instructions={instructions}
													taskCfg={taskCfg}
													onTitle={setTitle}
													onInstructions={setInstructions}
													onTaskCfg={setTaskCfg}
													onApplied={(appliedNotes) => {
														setReviewNotes((prev) => [...prev, ...appliedNotes]);
														setStatus('draft');
													}}
												/>
											) : (
												<div className="asg-tool-body">
													<p>
														AI menyusun draf untuk <strong>satu tugas</strong>{' '}
														{shape ? SHAPE_LABEL[shape] : ''} — bukan rencana penilaian mata kuliah —
														memakai pemetaan yang dipilih (pertemuan, Sub-CPMK, CPMK/CPL), plus
														indikator, materi, dan referensi yang sudah tersimpan. Tidak mengarang
														bobot atau sumber.
													</p>
													<label>
														{t('asg.s2.aiHintLabel')}
														<textarea
															rows={2}
															maxLength={800}
															value={hint}
															onChange={(e) => setHint(e.target.value)}
															placeholder={t('asg.s2.aiHintPlaceholder')}
														/>
													</label>
													<div className="asg-tool-actions">
														<button
															type="button"
															className="ld-btn-primary"
															onClick={() => void generate()}
															disabled={toolBusy}
														>
															{toolBusy ? (
																<LoaderCircle size={15} className="spin" />
															) : (
																<Sparkles size={15} />
															)}
															{toolBusy ? t('asg.s2.aiComposing') : t('asg.s2.aiCompose')}
														</button>
													</div>
												</div>
											)}
											{reviewNotes.length > 0 && (
												<StatusMarks
													warn={reviewNotes.map((note, i) => ({ id: `note-${i}`, text: note }))}
												/>
											)}
										</div>
									) : (
										<div className="asg-tools-gate">
											<StatusMarks
												warn={[
													{
														id: 'ai-gate',
														text: 'Susun dengan AI dan impor teks nonaktif karena pemetaan akademik belum lengkap. Mata kuliah, pertemuan, dan Sub-CPMK wajib dipilih. Pengisian manual tetap tersedia.',
													},
												]}
											/>
											<button type="button" className="ld-text-btn" onClick={() => setSection(1)}>
												{t('asg.s2.completeMapping')}
											</button>
										</div>
									)}
								</div>
							</details>
						</>
					)}

					{/* ═════════ SECTION 3 — PENILAIAN & BANTUAN ═════════ */}
					{section === 3 && (
						<>
							<section className="asg-section" aria-label="Kriteria dan penilaian">
								<h3>{t('asg.s3.criteriaHeading')}</h3>
								<p className="rps-help">
									{formal
										? 'Tempel ketentuan dan rubrik penilaian tugas ini. Bobot tidak dihitung otomatis — rubrik menjadi rujukan penilaian dan draf evaluasi AI Anda.'
										: 'Kriteria latihan menjadi rujukan Cek jawaban dan umpan balik formatif — tanpa nilai resmi dan tanpa pengumpulan final.'}
								</p>
								<label>
									{formal ? 'KETENTUAN & RUBRIK' : 'KRITERIA LATIHAN (OPSIONAL)'}
									<textarea
										rows={6}
										maxLength={5000}
										value={requirements}
										onChange={(e) => setRequirements(e.target.value)}
										placeholder={
											formal
												? 'mis. Unggah PDF. Rubrik disalin di sini — bobot tidak dihitung otomatis.'
												: 'mis. Kriteria rubrik yang relevan - boleh dikurangi dari rubrik tugas formal.'
										}
									/>
								</label>
								{formal ? (
									<>
										<label className="asg-toggle">
											<input
												type="checkbox"
												checked={allowRevision}
												onChange={(e) => setAllowRevision(e.target.checked)}
											/>
											<span>
												<strong>Izinkan revisi pengumpulan</strong>
												<small>
													Mahasiswa dapat memperbarui pengumpulan setelah umpan balik dosen,
													sebelum status Dinilai.
												</small>
											</span>
										</label>
										<p className="asg-shape-note">
											<ClipboardCheck size={13} /> Penilaian resmi hanya terjadi di ruang
											kerja penilaian setelah pengumpulan — tidak otomatis, dan tidak
											dipengaruhi latihan persiapan.
										</p>
									</>
								) : (
									<>
										<label className="asg-toggle">
											<input
												type="checkbox"
												checked={checkOn}
												onChange={(e) => setCheckOn(e.target.checked)}
											/>
											<span>
												<strong>Aktifkan Cek jawaban</strong>
												<small>
													Pemeriksaan formatif dengan panduan bertahap — tanpa memberikan
													jawaban.
												</small>
											</span>
										</label>
										{checkOn && (
											<label>
												{t('asg.s3.checkMaxLabel')}
												<input
													type="number"
													min={1}
													max={10}
													value={checkMaxInput}
													onChange={(e) => setCheckMaxInput(e.target.value)}
												/>
											</label>
										)}
										<p className="asg-map-ok">
											<CheckCircle2 size={14} /> Latihan formatif tanpa pengumpulan final —
											tidak berdampak pada nilai resmi.
										</p>
									</>
								)}
							</section>

							{/* Materi pendukung — progressive disclosure */}
							<details className="asg-disclosure" open={attachments.length > 0}>
								<summary>
									<BookOpen size={14} /> {t('asg.s3.materials')}
									{attachments.length > 0 && <span className="asg-disclosure-count">{attachments.length}</span>}
									<ChevronDown size={15} />
								</summary>
								<div className="asg-disclosure-body">
									<p className="rps-help">
										Lampirkan dokumen dari Manajemen berkas yang ditautkan ke mata kuliah ini.
										Mahasiswa melihat lampiran ini pada lembar jawaban mereka. Dokumen dengan
										konteks yang ditolak, masih menunggu, atau versi tidak cocok tidak
										dipakai sebagai landasan AI.
									</p>
									{libraryQuery.loading ? (
										<p className="asg-shape-note">
											<LoaderCircle size={13} className="spin" /> Memuat dokumen Manajemen berkas...
										</p>
									) : libraryFiles.length === 0 ? (
										<p className="asg-stage-empty">
											Belum ada dokumen pada Manajemen berkas untuk mata kuliah ini. Unggah dan
											tautkan dokumen di <Link to="/app/berkas">Manajemen berkas</Link> bila ingin
											dilampirkan.
										</p>
									) : (
										<div className="asg-attach-picker">
											{libraryFiles.map((f) => {
												const sessionMatch = !sessionId || f.session === sessionId;
												return (
													<label key={f.id} className="asg-attach-option">
														<input
															type="checkbox"
															checked={attachments.includes(f.id)}
															onChange={() => toggleAttachment(f.id)}
														/>
														<span>{f.title}</span>
														<em>{sessionMatch ? 'Berkas' : 'Sesi lain'}</em>
													</label>
												);
											})}
										</div>
									)}
									{attachments.length > 0 && (
										<p className="asg-shape-note">
											<BookOpen size={13} /> {attachments.length} materi dilampirkan pada
											tugas ini.
										</p>
									)}
								</div>
							</details>

							{/* AI & bantuan belajar — progressive disclosure */}
							<details className="asg-disclosure" open={formal ? false : aiAssistOn}>
								<summary>
									<Sparkles size={14} /> {t('asg.s3.aiHelp')}
									<span className="asg-disclosure-tag">{t('asg.s3.aiHelpTag')}</span>
									<ChevronDown size={15} />
								</summary>
								<div className="asg-disclosure-body">
									<p className="rps-help">
										Atur bantuan AI yang tersedia untuk tugas ini. Semua keluaran AI berlabel
										panduan atau draf — tidak ada nilai atau umpan balik yang diterbitkan
										secara otomatis.
									</p>
									{formal ? (
										<>
											<div className="asg-map-ok">
												<CheckCircle2 size={14} />
												<span>
													Setelah pengumpulan masuk, draf evaluasi AI berbasis bukti disusun
													secara pribadi untuk Anda — menunggu tinjauan, suntingan, dan
													penerbitan Anda. Kegagalan penyusunan tidak memblokir pengumpulan
													mahasiswa.
												</span>
											</div>
											<p className="asg-shape-note">
												<Sparkles size={13} /> Isian otomatis soal dan draf instruksi dengan AI
												tersedia pada bagian Tugas (“Cara lain membuat tugas”).
											</p>
										</>
									) : (
										<>
											<label className="asg-toggle">
												<input
													type="checkbox"
													checked={aiAssistOn}
													onChange={(e) => setAiAssistOn(e.target.checked)}
												/>
												<span>
													<strong>Aktifkan Panduan AI latihan</strong>
													<small>
														Bantuan AI tambahan (petunjuk, saran, draf umpan balik formatif)
														berlandaskan instruksi latihan, materi mata kuliah yang disetujui,
														dan kriteria rubrik — selalu berlabel panduan, bukan penilaian
														resmi, dan tidak berdampak pada nilai.
													</small>
												</span>
											</label>
											{!aiAssistOn && (
												<p className="asg-shape-note">
													<Info size={13} /> Nonaktif secara bawaan — aktifkan hanya bila Anda
													ingin mahasiswa mendapat panduan AI pada latihan ini.
												</p>
											)}
										</>
									)}
									{/* Phase 3 — lecturer controls for the student AI assistant. */}
									<div className="asg-aipolicy-wrap">
										<AssignmentAiPolicy
											mode={aiPolicyMode}
											enabledCaps={aiEnabledCaps}
											activityType={activityType}
											onModeChange={changePolicyMode}
											onToggleCap={togglePolicyCap}
										/>
									</div>
								</div>
							</details>
							<section className="asg-section" aria-label="Waktu dan akses">
								<h3>{t('asg.s3.timeHeading')}</h3>
								{formal ? (
									<>
										<label>
											{t('asg.s3.deadlineLabel')}
											<DateTimePicker
												value={deadlineInput}
												onChange={setDeadlineInput}
											/>
										</label>
										{selectedSession?.accessDateTime && !deadlineInput && (
											<button
												type="button"
												className="ld-text-btn"
												onClick={() =>
													setDeadlineInput(deadlineToLocalInput(selectedSession.accessDateTime || ''))
												}
											>
												<CalendarClock size={13} /> {t('asg.s3.useSessionDate')}
											</button>
										)}
										{!deadlineInput && (
											<p className="asg-shape-note">
												<CalendarClock size={13} /> Tanpa batas waktu — pengumpulan tetap
												dibuka hingga tugas ditutup atau diarsipkan.
											</p>
										)}
									</>
								) : (
									<p className="asg-map-ok">
										<CheckCircle2 size={14} /> Latihan formatif tanpa batas waktu pengumpulan
										dan tanpa pengumpulan final — dapat dikerjakan berulang.
									</p>
								)}
								<div className="asg-map-summary">
									<div className="asg-map-row">
										<small>Akses mahasiswa</small>
										<span>
											Mahasiswa melihat tugas hanya setelah status Diterbitkan — status
											dipilih pada bagian Review.
										</span>
									</div>
									<div className="asg-map-row">
										<small>Tautan publik</small>
										<span>
											Tautan akses publik dengan kode akses dikelola pada halaman tugas
											setelah tugas disimpan — tidak diubah di sini.
										</span>
									</div>
								</div>
							</section>

							{/* Pengaturan lanjutan (riset) — collapsed by default */}
							<details className="asg-disclosure">
								<summary>
									<FlaskConical size={14} /> {t('asg.s3.advanced')}
									<span className="asg-disclosure-tag">{t('asg.s3.advancedTag')}</span>
									<ChevronDown size={15} />
								</summary>
								<div className="asg-disclosure-body">
									<div className="asg-personalization">
										<div className="asg-section-head">
											<h4>{t('asg.s3.personalization')}</h4>
											<span className="asg-tag">{t('asg.s3.personalizationTag2')}</span>
										</div>
										<p className="rps-help">
											Mode generik (bawaan) memberi umpan balik formatif umum. Mode
											terpersonalisasi menyesuaikan strategi panduan berdasarkan pola
											kesalahan tervalidasi mahasiswa — hanya dari temuan yang sudah divalidasi
											dosen, bukan satu temuan AI tunggal. Mahasiswa tidak melihat metadata riset.
										</p>
										<div className="asg-type-grid" role="radiogroup" aria-label="Mode umpan balik">
											<label className={`asg-shape-card${feedbackMode === 'generic' ? ' checked' : ''}`}>
												<input
													type="radio"
													name="assignment-feedback-mode"
													checked={feedbackMode === 'generic'}
													onChange={() => setFeedbackMode('generic')}
												/>
												<strong>Generik (bawaan)</strong>
												<span>Umpan balik formatif umum, tanpa riwayat pembelajar.</span>
												<em>Kontrol · tanpa personalisasi</em>
											</label>
											<label className={`asg-shape-card${feedbackMode === 'personalized' ? ' checked' : ''}`}>
												<input
													type="radio"
													name="assignment-feedback-mode"
													checked={feedbackMode === 'personalized'}
													onChange={() => setFeedbackMode('personalized')}
												/>
												<strong>Terpersonalisasi</strong>
												<span>Menyesuaikan strategi dari pola kesalahan tervalidasi.</span>
												<em>Riset · bukti tervalidasi</em>
											</label>
										</div>
										{feedbackMode === 'personalized' && (
											<label className="asg-threshold">
												{t('asg.s3.thresholdLabel')}
												<input
													type="number"
													min={1}
													max={20}
													value={personalizationThreshold}
													onChange={(e) => setPersonalizationThreshold(e.target.value)}
												/>
												<small>
													Jumlah minimum observasi tervalidasi sebelum sebuah pola dianggap
													berulang (bawaan 3). Pola di bawah ambang tidak digunakan untuk
													personalisasi.
												</small>
											</label>
										)}
									</div>
								</div>
							</details>
						</>
					)}

					{/* ═════════ SECTION 4 — REVIEW ═════════ */}
					{section === 4 && (
						<>
							<section className="asg-section" aria-label="Pratinjau tugas">
								<div className="asg-section-head">
									<h3>{t('asg.s4.preview')}</h3>
									<span className="asg-shape-note">
										<Eye size={13} /> Tampilan ringkas seperti yang dilihat mahasiswa
									</span>
								</div>
								<div className="asg-preview">
									<div className="asg-preview-head">
										<span className={`asg-type-chip ${formal ? 'formal' : 'formative'}`}>
											{formal ? <ClipboardCheck size={12} /> : <Repeat size={12} />}
											{formal ? 'Tugas formal' : 'Latihan formatif'}
										</span>
										<strong>{title.trim() || 'Tanpa judul'}</strong>
										<small>
											{courseLabel || 'Mata kuliah'}
											{selectedSession ? ` · Minggu ${weekLabel(selectedSession.week)} — ${selectedSession.title}` : ''}
											{shape ? ` · ${SHAPE_LABEL[shape]}` : ''}
										</small>
										<div className="asg-preview-meta">
											<span className="asg-tag">{MODE_LABEL[mode]}</span>
											{formal ? (
												<span className="asg-tag">{deadlineLabel(localInputToDeadline(deadlineInput))}</span>
											) : (
												<span className="asg-tag formative">{t('asg.s4.repeatNoGrade')}</span>
											)}
										</div>
									</div>
									{instructions.trim() && (
										<div className="asg-preview-block">
											<small>Instruksi</small>
											<p>{instructions}</p>
										</div>
									)}
									{requirements.trim() && (
										<div className="asg-preview-block">
											<small>{formal ? 'Ketentuan & rubrik' : 'Kriteria latihan'}</small>
											<p>{requirements}</p>
										</div>
									)}
									{stages.filter((s) => s.label.trim()).length > 0 && (
										<div className="asg-preview-block">
											<small>Tahapan</small>
											<div className="asg-stages">
												{stages
													.filter((s) => s.label.trim())
													.map((s, i) => (
														<span key={i} className="asg-stage">
															<small>{i + 1}</small>
															{s.label}
														</span>
													))}
											</div>
										</div>
									)}
									{previewMaterials.length > 0 && (
										<div className="asg-preview-block">
											<small>Materi</small>
											<ul className="asg-preview-materials">
												{previewMaterials.map((r) => (
													<li key={r.id}>
														<BookOpen size={13} /> {r.title}
													</li>
												))}
											</ul>
										</div>
									)}
									{formal ? (
										<p className="asg-shape-note">
											<ClipboardCheck size={13} /> Pengumpulan final
											{allowRevision ? ' dengan revisi diizinkan setelah umpan balik dosen' : ''}
											— dinilai dan dihitung dalam penilaian resmi.
										</p>
									) : (
										<p className="asg-shape-note">
											<Repeat size={13} /> Latihan berulang
											{checkOn ? ` dengan Cek jawaban (maks ${checkMaxValue} per peserta)` : ' tanpa Cek jawaban'}
											{aiAssistOn ? ' dan Panduan AI latihan' : ''} — tanpa pengumpulan final,
											tanpa nilai resmi.
										</p>
									)}
									<p className="asg-shape-note">
										<Sparkles size={13} /> {t('asg.s4.aiPolicy')} {policySummary(aiPolicyMode, aiEnabledCaps, activityType)}
									</p>
								</div>
							</section>

							{/* Validation issues — clickable, navigate to the relevant section */}
							{issueCount > 0 && (
								<section className="asg-section asg-review-issues" aria-label="Perlu perhatian">
									<div className="asg-section-head">
										<h3>
											<AlertTriangle size={14} /> {issueCount} item perlu perhatian
										</h3>
									</div>
									<ul className="asg-issue-list">
										{reviewIssues.map((issue, i) => (
											<li key={i}>
												<button
													type="button"
													className="ld-text-btn"
													onClick={() => setSection(issue.section)}
												>
													{issue.text}
												</button>
											</li>
										))}
									</ul>
									<p className="asg-shape-note">
										<Info size={13} /> Anda tetap dapat menyimpan sebagai draf kapan saja.
										Penerbitan memerlukan semua isian wajib lengkap.
									</p>
								</section>
							)}

							{previewMissing.length === 0 && (
								<p className="asg-map-ok">
									<CheckCircle2 size={14} /> {t('asg.s4.ready')}
								</p>
							)}
						</>
					)}

					{error && (
						<p className="form-error" role="alert">
							{error}
						</p>
					)}
				</div>

				<footer className={footClassName}>
					<div className="asg-dialog-foot-left">
						<p>
							<CalendarClock size={13} /> Bagian {section} dari {SECTIONS.length} —{' '}
							{SECTIONS[section - 1].label}
						</p>
						{section === 1 && !mappingComplete && (
							<StatusMarks
								expanded
								bad={[
									{
										id: 'map-required',
										text: 'Pemetaan wajib sebelum menyimpan, termasuk pembuatan manual. Navigasi antar bagian tetap tersedia.',
									},
								]}
							/>
						)}
						{!editing && !parent && (
							<p className="asg-shape-note">
								<Save size={13} /> Draf tersimpan otomatis di peramban ini selama Anda mengisi.
							</p>
						)}
					</div>
					<div className="asg-dialog-actions">
						{section > 1 && (
							<button
								type="button"
								className="ld-btn-quiet"
								onClick={() => setSection(section - 1)}
								disabled={busy}
							>
								<ArrowLeft size={15} /> {t('asg.back')}
							</button>
						)}
						{section < 4 && (
							<button
								type="button"
								className="ld-btn-primary"
								onClick={() => setSection(section + 1)}
							>
								{t('asg.next')} <ArrowRight size={15} />
							</button>
						)}
						<button type="submit" className="ld-outline-action sm" disabled={busy}>
							{busy ? (
								<>
									<LoaderCircle className="spin" size={16} /> {t('asg.saving')}
								</>
							) : (
								<>
									<Save size={15} /> {editing ? t('asg.saveChanges') : t('asg.saveDraft')}
								</>
							)}
						</button>
						{section === 4 && (
							<button
								type="button"
								className="ld-btn-primary"
								disabled={busy || previewMissing.length > 0}
								onClick={() => void save(null, 'published')}
							>
								{busy ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={15} />} {t('asg.publish')}
							</button>
						)}
					</div>
				</footer>
			</form>
	);
}
