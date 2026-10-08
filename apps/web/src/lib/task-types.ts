/**
 * Shared task-type foundation for specialized assignments (Kuis, Menyimak,
 * Menulis). Later types (speaking, presentation, case study, practical,
 * portfolio, discussion) can reuse the same config/key/answers/review split.
 *
 * Data model:
 * - `assignments.taskConfig` (json) — student-visible configuration: question
 *   stems, options, points, media, rubric. It NEVER contains correct answers.
 * - `task_answer_keys` (owner-only collection) — correct answers, expected
 *   texts, and explanations per question id.
 * - `assignment_submissions.taskAnswers` (json) — the student's progressive
 *   answers and draft state.
 * - `assignment_submissions.taskReview` (json) — lecturer-only rubric scores.
 *
 * The builder edits a merged "editable" config (config + key reattached);
 * `splitTaskConfigForSave` / `mergeTaskConfigWithKey` move the answer material
 * between the two shapes.
 */
import type { AssignmentShape } from '@/lib/assignments';
import type { CourseResource } from '@/lib/learning';
import type { StructuredAssignmentContent } from '@/lib/structured-assignment';
import { parseStructuredContentFromConfig } from '@/lib/structured-assignment';

export type TaskKind = 'quiz' | 'listening' | 'writing' | 'speaking' | 'reading';

/** Which specialized builder a shape uses (null = generic form). */
export function taskKindForShape(shape: AssignmentShape | '' | undefined | null): TaskKind | null {
	if (shape === 'quiz' || shape === 'vocabulary') return 'quiz';
	if (shape === 'listening') return 'listening';
	if (shape === 'writing' || shape === 'language_project') return 'writing';
	if (shape === 'speaking' || shape === 'conversation') return 'speaking';
	if (shape === 'reading') return 'reading';
	return null;
}

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
	quiz: 'Kuis Bahasa',
	listening: 'Menyimak',
	writing: 'Menulis',
	speaking: 'Berbicara',
	reading: 'Membaca',
};

// ── Quiz (Kuis) ───────────────────────────────────────────────

export type QuizReleaseMode = 'after_submit' | 'after_deadline' | 'manual';

export const QUIZ_RELEASE_LABEL: Record<QuizReleaseMode, string> = {
	after_submit: 'Langsung setelah dikumpulkan',
	after_deadline: 'Setelah batas waktu lewat',
	manual: 'Diterbitkan dosen manual',
};

/** Builder-side question (correct answer + explanation included). */
export type QuizQuestionEditable = {
	id: string;
	text: string;
	options: string[];
	/** Index into options; -1 = not set yet (never invented). */
	correctIndex: number;
	points: number;
	explanation: string;
};

export type QuizConfig = {
	questions: {
		id: string;
		text: string;
		options: string[];
		points: number;
	}[];
	shuffleQuestions: boolean;
	shuffleOptions: boolean;
	/** 0 = unlimited. */
	attempts: number;
	/** Minutes; 0 = no limit. */
	timeLimitMin: number;
	releaseResults: QuizReleaseMode;
};

export const DEFAULT_QUIZ_CONFIG: QuizConfig = {
	questions: [],
	shuffleQuestions: false,
	shuffleOptions: false,
	attempts: 1,
	timeLimitMin: 0,
	releaseResults: 'after_submit',
};

// ── Listening (Menyimak) ──────────────────────────────────────

export type ListeningQuestionType = 'mc' | 'short' | 'matching' | 'transcription';

export const LISTENING_TYPE_LABEL: Record<ListeningQuestionType, string> = {
	mc: 'Pilihan ganda',
	short: 'Jawaban singkat',
	matching: 'Mencocokkan',
	transcription: 'Transkripsi',
};

export type ListeningQuestionEditable = {
	id: string;
	type: ListeningQuestionType;
	text: string;
	/** Seconds into the media; null = whole material. */
	timestampSec: number | null;
	options: string[];
	/** mc only. */
	correctIndex: number;
	/** matching: left item -> right item (the mapping is the key). */
	pairs: { left: string; right: string }[];
	/** short/transcription: expected answer for grading (never shown to students). */
	expected: string;
	points: number;
};

export type ListeningConfig = {
	media: {
		/** 'resource' = existing course resource, 'link' = external URL, 'none' = unset. */
		kind: 'resource' | 'link' | 'none';
		resourceId: string;
		url: string;
		title: string;
	};
	questions: {
		id: string;
		type: ListeningQuestionType;
		text: string;
		timestampSec: number | null;
		options: string[];
		pairs: { left: string; right: string }[];
		points: number;
	}[];
};

export const DEFAULT_LISTENING_CONFIG: ListeningConfig = {
	media: { kind: 'none', resourceId: '', url: '', title: '' },
	questions: [],
};

// ── Writing (Menulis) ────────────────────────────────────────

export type WritingCriterion = {
	id: string;
	label: string;
	/** Relative weight within the rubric; not a course assessment weight. */
	weight: number;
};

/**
 * One numbered question/answer block in a multi-question writing task.
 * Each block carries its own prompt and optional guidance or word limits;
 * the assignment-level rubric (`WritingConfig.criteria`) still applies to
 * the whole submission. An empty `questions` array means a legacy
 * single-block writing task (the global `prompt` is the only prompt).
 */
export type WritingQuestion = {
	id: string;
	prompt: string;
	/** Optional per-block guidance (format focus, scope, etc.). */
	guidance: string;
	/** 0 = inherit the assignment-level limit / no lower bound. */
	minWords: number;
	/** 0 = inherit the assignment-level limit / no upper bound. */
	maxWords: number;
};

export type WritingConfig = {
	prompt: string;
	formatGuidance: string;
	/** Free-text language guidance, e.g. "Indonesia" or "English". */
	language: string;
	minWords: number;
	maxWords: number;
	criteria: { id: string; label: string; weight: number }[];
	allowText: boolean;
	allowDocument: boolean;
	allowPhotos: boolean;
	/** Multi-question blocks. Empty = legacy single-block writing task. */
	questions: WritingQuestion[];
	/** Structured assignment content (AI-generated, validated). Optional —
	 *  legacy assignments have none and use the free-form text renderer. */
	structured?: StructuredAssignmentContent | null;
};

export const DEFAULT_WRITING_CONFIG: WritingConfig = {
	prompt: '',
	formatGuidance: '',
	language: '',
	minWords: 0,
	maxWords: 0,
	criteria: [],
	allowText: true,
	allowDocument: true,
	allowPhotos: true,
	questions: [],
};

/** True when a writing config defines multiple answer blocks. */
export function hasWritingQuestions(config: WritingConfig): boolean {
	return config.questions.length > 0;
}

// ── Speaking (Berbicara / Percakapan) ─────────────────────────

export type SpeakingConfig = {
	prompt: string;
	language: string;
	/** 0 = no suggested duration. */
	durationMin: number;
	allowAudio: boolean;
	allowVideo: boolean;
	allowLink: boolean;
	criteria: { id: string; label: string; weight: number }[];
	/** Structured assignment content (AI-generated, validated). Optional. */
	structured?: StructuredAssignmentContent | null;
};

export const DEFAULT_SPEAKING_CONFIG: SpeakingConfig = {
	prompt: '',
	language: '',
	durationMin: 0,
	allowAudio: true,
	allowVideo: true,
	allowLink: true,
	criteria: [],
};

// ── Reading (Membaca) ─────────────────────────────────────────

export type ReadingConfig = {
	passage: string;
	questions: QuizConfig['questions'];
	releaseResults: QuizReleaseMode;
};

export const DEFAULT_READING_CONFIG: ReadingConfig = {
	passage: '',
	questions: [],
	releaseResults: 'after_submit',
};

// ── Answer key ────────────────────────────────────────────────

export type TaskKeyEntry = {
	correctIndex?: number;
	explanation?: string;
	expected?: string;
};

export type TaskAnswerKey = {
	quiz?: Record<string, TaskKeyEntry>;
	listening?: Record<string, TaskKeyEntry>;
	reading?: Record<string, TaskKeyEntry>;
};

export const EMPTY_ANSWER_KEY: TaskAnswerKey = {};

// ── Student answers ───────────────────────────────────────────

export type QuizStudentAnswers = Record<string, number>;

export type ListeningStudentAnswers = Record<
	string,
	number | string | Record<string, string>
>;

export type TaskAnswers = {
	quiz?: {
		answers: QuizStudentAnswers;
		attemptsUsed: number;
		startedAt: string;
		savedAt: string;
		/** Snapshot of the final, graded attempt (written server-side). */
		lastAttempt?: {
			answers: QuizStudentAnswers;
			submittedAt: string;
			scorePct: number;
			earned: number;
			total: number;
		};
	};
	listening?: {
		answers: ListeningStudentAnswers;
		savedAt: string;
		/** Server-graded snapshot for auto-gradable (mc) questions. */
		lastAttempt?: {
			answers: ListeningStudentAnswers;
			submittedAt: string;
			scorePct: number;
			earned: number;
			total: number;
		};
	};
	writing?: {
		imageOrder: string[];
		savedAt: string;
		wordCount?: number;
		/** Multi-question writing: per-block answers keyed by question id. */
		answers?: Record<string, { content: string; wordCount: number }>;
	};
};

// ── Lecturer review ───────────────────────────────────────────

export type TaskReview = {
	/** criterionId -> score (raw points, lecturer's own scale). */
	criteria?: Record<string, number>;
	notes?: string;
	/** Last AI suggestion shown to the lecturer (kept for audit only). */
	aiSuggestion?: string;
};

// ── Tolerant parsing (PocketBase json columns) ────────────────

function parseJson<T>(value: unknown): T | null {
	if (!value) return null;
	let raw: unknown = value;
	if (typeof raw === 'string') {
		try {
			raw = JSON.parse(raw);
		} catch {
			return null;
		}
	}
	if (raw && typeof raw === 'object') return raw as T;
	return null;
}

export function parseTaskConfig(value: unknown): Record<string, unknown> | null {
	return parseJson<Record<string, unknown>>(value);
}

export function parseTaskAnswers(value: unknown): TaskAnswers | null {
	return parseJson<TaskAnswers>(value);
}

export function parseTaskReview(value: unknown): TaskReview | null {
	return parseJson<TaskReview>(value);
}

export function parseAnswerKey(value: unknown): TaskAnswerKey {
	return parseJson<TaskAnswerKey>(value) ?? { ...EMPTY_ANSWER_KEY };
}

function str(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback = false): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function qid(value: unknown, index: number): string {
	const id = str(value).trim();
	return id || `q${index + 1}`;
}

/** Parse a stored quiz config (tolerant of bad data). */
export function parseQuizConfig(value: unknown): QuizConfig {
	const raw = parseTaskConfig(value);
	if (!raw) return { ...DEFAULT_QUIZ_CONFIG, questions: [] };
	const release = str(raw.releaseResults);
	const questions = Array.isArray(raw.questions)
		? (raw.questions as Record<string, unknown>[])
				.map((q, i) => ({
					id: qid(q.id, i),
					text: str(q.text),
					options: Array.isArray(q.options)
						? (q.options as unknown[]).map((o) => str(o)).filter((o) => o.trim())
						: [],
					points: Math.max(0, num(q.points, 1)),
				}))
				.filter((q) => q.text.trim() || q.options.length > 0)
		: [];
	return {
		questions,
		shuffleQuestions: bool(raw.shuffleQuestions),
		shuffleOptions: bool(raw.shuffleOptions),
		attempts: Math.max(0, Math.round(num(raw.attempts, 1))),
		timeLimitMin: Math.max(0, Math.round(num(raw.timeLimitMin, 0))),
		releaseResults:
			release === 'after_deadline' || release === 'manual'
				? (release as QuizReleaseMode)
				: 'after_submit',
	};
}

/** Parse a stored listening config (tolerant of bad data). */
export function parseListeningConfig(value: unknown): ListeningConfig {
	const raw = parseTaskConfig(value);
	if (!raw) return { ...DEFAULT_LISTENING_CONFIG, questions: [] };
	const mediaRaw = (raw.media && typeof raw.media === 'object' ? raw.media : {}) as Record<
		string,
		unknown
	>;
	const mediaKind = str(mediaRaw.kind);
	const questions = Array.isArray(raw.questions)
		? (raw.questions as Record<string, unknown>[])
				.map((q, i) => {
					const type = str(q.type);
					const ts = num(q.timestampSec, NaN);
					return {
						id: qid(q.id, i),
						type:
							type === 'short' || type === 'matching' || type === 'transcription'
								? (type as ListeningQuestionType)
								: 'mc',
						text: str(q.text),
						timestampSec: Number.isFinite(ts) && ts >= 0 ? Math.round(ts) : null,
						options: Array.isArray(q.options)
							? (q.options as unknown[]).map((o) => str(o)).filter((o) => o.trim())
							: [],
						pairs: Array.isArray(q.pairs)
							? (q.pairs as Record<string, unknown>[])
									.map((p) => ({ left: str(p.left), right: str(p.right) }))
									.filter((p) => p.left.trim() && p.right.trim())
							: [],
						points: Math.max(0, num(q.points, 1)),
					};
				})
				.filter((q) => q.text.trim() || q.options.length > 0 || q.pairs.length > 0)
		: [];
	return {
		media: {
			kind:
				mediaKind === 'resource' || mediaKind === 'link'
					? (mediaKind as 'resource' | 'link')
					: 'none',
			resourceId: str(mediaRaw.resourceId),
			url: str(mediaRaw.url),
			title: str(mediaRaw.title),
		},
		questions,
	};
}

/** Parse a stored writing config (tolerant of bad data). */
export function parseWritingConfig(value: unknown): WritingConfig {
	const raw = parseTaskConfig(value);
	if (!raw) return { ...DEFAULT_WRITING_CONFIG, criteria: [], questions: [] };
	const criteria = Array.isArray(raw.criteria)
		? (raw.criteria as Record<string, unknown>[])
				.map((c, i) => ({
					id: qid(c.id, i),
					label: str(c.label),
					weight: Math.max(0, num(c.weight, 1)),
				}))
				.filter((c) => c.label.trim())
		: [];
	const questions = Array.isArray(raw.questions)
		? (raw.questions as Record<string, unknown>[])
				.map((q, i) => ({
					id: qid(q.id, i),
					prompt: str(q.prompt),
					guidance: str(q.guidance),
					minWords: Math.max(0, Math.round(num(q.minWords, 0))),
					maxWords: Math.max(0, Math.round(num(q.maxWords, 0))),
				}))
				.filter((q) => q.prompt.trim())
		: [];
	return {
		prompt: str(raw.prompt),
		formatGuidance: str(raw.formatGuidance),
		language: str(raw.language),
		minWords: Math.max(0, Math.round(num(raw.minWords, 0))),
		maxWords: Math.max(0, Math.round(num(raw.maxWords, 0))),
		criteria,
		allowText: bool(raw.allowText, true),
		allowDocument: bool(raw.allowDocument, true),
		allowPhotos: bool(raw.allowPhotos, true),
		questions,
		structured: parseStructuredContentFromConfig(value),
	};
}

export function parseSpeakingConfig(value: unknown): SpeakingConfig {
	const raw = parseTaskConfig(value);
	if (!raw) return { ...DEFAULT_SPEAKING_CONFIG, criteria: [] };
	const criteria = Array.isArray(raw.criteria)
		? (raw.criteria as Record<string, unknown>[])
				.map((c, i) => ({
					id: qid(c.id, i),
					label: str(c.label),
					weight: Math.max(0, num(c.weight, 1)),
				}))
				.filter((c) => c.label.trim())
		: [];
	return {
		prompt: str(raw.prompt),
		language: str(raw.language),
		durationMin: Math.max(0, Math.round(num(raw.durationMin, 0))),
		allowAudio: bool(raw.allowAudio, true),
		allowVideo: bool(raw.allowVideo, true),
		allowLink: bool(raw.allowLink, true),
		criteria,
		structured: parseStructuredContentFromConfig(value),
	};
}

export function parseReadingConfig(value: unknown): ReadingConfig {
	const raw = parseTaskConfig(value);
	const quiz = parseQuizConfig(value);
	if (!raw) return { ...DEFAULT_READING_CONFIG, questions: [] };
	const release = str(raw.releaseResults);
	return {
		passage: str(raw.passage),
		questions: quiz.questions,
		releaseResults:
			release === 'after_deadline' || release === 'manual' ? release : 'after_submit',
	};
}

// ── Merge (config + key) → editable, and split back ──────────

export type EditableTaskConfig =
	| { kind: 'quiz'; quiz: { questions: QuizQuestionEditable[] } & Omit<QuizConfig, 'questions'> }
	| { kind: 'listening'; listening: { questions: ListeningQuestionEditable[] } & Omit<ListeningConfig, 'questions'> }
	| { kind: 'writing'; writing: WritingConfig }
	| { kind: 'speaking'; speaking: SpeakingConfig }
	| {
			kind: 'reading';
			reading: Omit<ReadingConfig, 'questions'> & { questions: QuizQuestionEditable[] };
	  };

export function emptyEditableConfig(kind: TaskKind): EditableTaskConfig {
	if (kind === 'quiz')
		return { kind: 'quiz', quiz: { ...DEFAULT_QUIZ_CONFIG, questions: [] } };
	if (kind === 'listening')
		return { kind: 'listening', listening: { ...DEFAULT_LISTENING_CONFIG, questions: [] } };
	if (kind === 'speaking')
		return { kind: 'speaking', speaking: { ...DEFAULT_SPEAKING_CONFIG, criteria: [] } };
	if (kind === 'reading')
		return { kind: 'reading', reading: { ...DEFAULT_READING_CONFIG, questions: [] } };
	return { kind: 'writing', writing: { ...DEFAULT_WRITING_CONFIG, criteria: [] } };
}

/** Reattach the owner-only key onto a stored config for editing. */
export function mergeTaskConfigWithKey(
	kind: TaskKind,
	configValue: unknown,
	keyValue: unknown,
): EditableTaskConfig {
	const key = parseAnswerKey(keyValue);
	if (kind === 'quiz') {
		const config = parseQuizConfig(configValue);
		return {
			kind: 'quiz',
			quiz: {
				...config,
				questions: config.questions.map((q) => {
					const entry = key.quiz?.[q.id] ?? {};
					return {
						...q,
						correctIndex: typeof entry.correctIndex === 'number' ? entry.correctIndex : -1,
						explanation: entry.explanation || '',
					};
				}),
			},
		};
	}
	if (kind === 'listening') {
		const config = parseListeningConfig(configValue);
		return {
			kind: 'listening',
			listening: {
				...config,
				questions: config.questions.map((q) => {
					const entry = key.listening?.[q.id] ?? {};
					return {
						...q,
						correctIndex: typeof entry.correctIndex === 'number' ? entry.correctIndex : -1,
						expected: entry.expected || '',
					};
				}),
			},
		};
	}
	if (kind === 'speaking') {
		return { kind: 'speaking', speaking: parseSpeakingConfig(configValue) };
	}
	if (kind === 'reading') {
		const config = parseReadingConfig(configValue);
		return {
			kind: 'reading',
			reading: {
				...config,
				questions: config.questions.map((q) => {
					const entry = key.reading?.[q.id] ?? {};
					return {
						...q,
						correctIndex: typeof entry.correctIndex === 'number' ? entry.correctIndex : -1,
						explanation: entry.explanation || '',
					};
				}),
			},
		};
	}
	return { kind: 'writing', writing: parseWritingConfig(configValue) };
}

/** Split an editable config into the student-visible config + owner-only key. */
export function splitTaskConfigForSave(editable: EditableTaskConfig): {
	taskConfig: Record<string, unknown>;
	answerKey: TaskAnswerKey;
} {
	if (editable.kind === 'quiz') {
		const key: TaskAnswerKey = { quiz: {} };
		const questions = editable.quiz.questions.map((q) => {
			if (q.correctIndex >= 0 || q.explanation.trim()) {
				key.quiz![q.id] = {
					...(q.correctIndex >= 0 ? { correctIndex: q.correctIndex } : {}),
					...(q.explanation.trim() ? { explanation: q.explanation.trim() } : {}),
				};
			}
			return {
				id: q.id,
				text: q.text.trim(),
				options: q.options.map((o) => o.trim()).filter((o) => o.trim()),
				points: q.points,
			};
		});
		return {
			taskConfig: {
				questions,
				shuffleQuestions: editable.quiz.shuffleQuestions,
				shuffleOptions: editable.quiz.shuffleOptions,
				attempts: editable.quiz.attempts,
				timeLimitMin: editable.quiz.timeLimitMin,
				releaseResults: editable.quiz.releaseResults,
			},
			answerKey: key,
		};
	}
	if (editable.kind === 'listening') {
		const key: TaskAnswerKey = { listening: {} };
		const questions = editable.listening.questions.map((q) => {
			if (q.type === 'mc' && (q.correctIndex >= 0 || q.expected.trim())) {
				key.listening![q.id] = {
					...(q.correctIndex >= 0 ? { correctIndex: q.correctIndex } : {}),
					...(q.expected.trim() ? { expected: q.expected.trim() } : {}),
				};
			} else if ((q.type === 'short' || q.type === 'transcription') && q.expected.trim()) {
				key.listening![q.id] = { expected: q.expected.trim() };
			}
			return {
				id: q.id,
				type: q.type,
				text: q.text.trim(),
				timestampSec: q.timestampSec,
				options: q.options.map((o) => o.trim()).filter((o) => o.trim()),
				pairs: q.pairs
					.map((p) => ({ left: p.left.trim(), right: p.right.trim() }))
					.filter((p) => p.left && p.right),
				points: q.points,
			};
		});
		return {
			taskConfig: { media: editable.listening.media, questions },
			answerKey: key,
		};
	}
	if (editable.kind === 'speaking') {
		return { taskConfig: { ...editable.speaking }, answerKey: { ...EMPTY_ANSWER_KEY } };
	}
	if (editable.kind === 'reading') {
		const key: TaskAnswerKey = { reading: {} };
		const questions = editable.reading.questions.map((q) => {
			if (q.correctIndex >= 0 || q.explanation.trim()) {
				key.reading![q.id] = {
					...(q.correctIndex >= 0 ? { correctIndex: q.correctIndex } : {}),
					...(q.explanation.trim() ? { explanation: q.explanation.trim() } : {}),
				};
			}
			return {
				id: q.id,
				text: q.text.trim(),
				options: q.options.map((o) => o.trim()).filter((o) => o.trim()),
				points: q.points,
			};
		});
		return {
			taskConfig: {
				passage: editable.reading.passage.trim(),
				questions,
				releaseResults: editable.reading.releaseResults,
			},
			answerKey: key,
		};
	}
	return {
		taskConfig: {
			...editable.writing,
			questions: editable.writing.questions
				.map((q) => ({
					id: q.id,
					prompt: q.prompt.trim(),
					guidance: q.guidance.trim(),
					minWords: q.minWords,
					maxWords: q.maxWords,
				}))
				.filter((q) => q.prompt),
		},
		answerKey: { ...EMPTY_ANSWER_KEY },
	};
}

// ── Normalization (tolerant of stale local drafts) ───────────

/**
 * Coerce a possibly-stale editable config — e.g. one restored from a local
 * draft saved before a field was introduced (such as writing `questions`) —
 * into a well-formed one, preserving every value already present, including
 * the owner-only answer-key fields (`correctIndex`, `explanation`, `expected`)
 * merged into the editable shape. The builders, the validator, and the save
 * splitter all read these fields directly and would otherwise crash on
 * `undefined`. The edit path is already parsed tolerantly; this guards the
 * draft-restore path that bypasses the parsers.
 */
export function normalizeEditableConfig(editable: EditableTaskConfig): EditableTaskConfig {
	const raw = editable as unknown as Record<string, unknown>;
	const asObj = (value: unknown): Record<string, unknown> =>
		value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	const asList = (value: unknown): Record<string, unknown>[] =>
		Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

	if (editable.kind === 'quiz') {
		const q = asObj(raw.quiz);
		return {
			kind: 'quiz',
			quiz: {
				questions: asList(q.questions).map((item, i) => ({
					id: str(item.id, `q${i + 1}`),
					text: str(item.text),
					options: asList(item.options).map((o) => str(o)),
					correctIndex: typeof item.correctIndex === 'number' ? item.correctIndex : -1,
					points: num(item.points, 1),
					explanation: str(item.explanation),
				})),
				shuffleQuestions: bool(q.shuffleQuestions),
				shuffleOptions: bool(q.shuffleOptions),
				attempts: Math.max(0, Math.round(num(q.attempts, 1))),
				timeLimitMin: Math.max(0, Math.round(num(q.timeLimitMin, 0))),
				releaseResults:
					q.releaseResults === 'after_deadline' || q.releaseResults === 'manual'
						? (q.releaseResults as QuizReleaseMode)
						: 'after_submit',
			},
		};
	}
	if (editable.kind === 'listening') {
		const l = asObj(raw.listening);
		const m = asObj(l.media);
		const mediaKind = str(m.kind);
		return {
			kind: 'listening',
			listening: {
				media: {
					kind: mediaKind === 'resource' || mediaKind === 'link' ? mediaKind : 'none',
					resourceId: str(m.resourceId),
					url: str(m.url),
					title: str(m.title),
				},
				questions: asList(l.questions).map((item, i) => {
					const type = str(item.type);
					const ts = num(item.timestampSec, NaN);
					return {
						id: str(item.id, `q${i + 1}`),
						type:
							type === 'short' || type === 'matching' || type === 'transcription'
								? (type as ListeningQuestionType)
								: 'mc',
						text: str(item.text),
						timestampSec: Number.isFinite(ts) && ts >= 0 ? Math.round(ts) : null,
						options: asList(item.options).map((o) => str(o)),
						pairs: asList(item.pairs).map((p) => ({ left: str(p.left), right: str(p.right) })),
						correctIndex: typeof item.correctIndex === 'number' ? item.correctIndex : -1,
						expected: str(item.expected),
						points: num(item.points, 1),
					};
				}),
			},
		};
	}
	if (editable.kind === 'speaking') {
		const s = asObj(raw.speaking);
		return {
			kind: 'speaking',
			speaking: {
				prompt: str(s.prompt),
				language: str(s.language),
				durationMin: Math.max(0, Math.round(num(s.durationMin, 0))),
				allowAudio: bool(s.allowAudio, true),
				allowVideo: bool(s.allowVideo, true),
				allowLink: bool(s.allowLink, true),
				criteria: asList(s.criteria).map((c, i) => ({
					id: str(c.id, `c${i + 1}`),
					label: str(c.label),
					weight: num(c.weight, 1),
				})),
				structured: parseStructuredContentFromConfig(s),
			},
		};
	}
	if (editable.kind === 'reading') {
		const r = asObj(raw.reading);
		return {
			kind: 'reading',
			reading: {
				passage: str(r.passage),
				releaseResults:
					r.releaseResults === 'after_deadline' || r.releaseResults === 'manual'
						? (r.releaseResults as QuizReleaseMode)
						: 'after_submit',
				questions: asList(r.questions).map((item, i) => ({
					id: str(item.id, `q${i + 1}`),
					text: str(item.text),
					options: asList(item.options).map((o) => str(o)),
					correctIndex: typeof item.correctIndex === 'number' ? item.correctIndex : -1,
					points: num(item.points, 1),
					explanation: str(item.explanation),
				})),
			},
		};
	}
	const w = asObj(raw.writing);
	return {
		kind: 'writing',
		writing: {
			prompt: str(w.prompt),
			formatGuidance: str(w.formatGuidance),
			language: str(w.language),
			minWords: Math.max(0, Math.round(num(w.minWords, 0))),
			maxWords: Math.max(0, Math.round(num(w.maxWords, 0))),
			criteria: asList(w.criteria).map((c, i) => ({
				id: str(c.id, `c${i + 1}`),
				label: str(c.label),
				weight: num(c.weight, 1),
			})),
			allowText: bool(w.allowText, true),
			allowDocument: bool(w.allowDocument, true),
			allowPhotos: bool(w.allowPhotos, true),
			questions: asList(w.questions).map((item, i) => ({
				id: str(item.id, `q${i + 1}`),
				prompt: str(item.prompt),
				guidance: str(item.guidance),
				minWords: Math.max(0, Math.round(num(item.minWords, 0))),
				maxWords: Math.max(0, Math.round(num(item.maxWords, 0))),
			})),
			structured: parseStructuredContentFromConfig(w),
		},
	};
}

// ── Validation (Indonesian, never invents fixes) ──────────────

export type TaskConfigWarning = { field: string; message: string };

export function validateEditableConfig(editable: EditableTaskConfig): TaskConfigWarning[] {
	const warnings: TaskConfigWarning[] = [];
	// Defensive: an editable config may reach here with missing inner fields —
	// e.g. a stale local draft restored before re-normalization, or an older
	// assignment whose stored config predates a field. Read every field safely
	// so validation never throws; a well-formed config yields the same warnings.
	const raw = editable as unknown as Record<string, unknown>;
	const asObj = (value: unknown): Record<string, unknown> =>
		value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	const asList = (value: unknown): Record<string, unknown>[] =>
		Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

	if (editable.kind === 'quiz') {
		const q = asObj(raw.quiz);
		const questions = asList(q.questions);
		if (questions.length === 0) {
			warnings.push({ field: 'questions', message: 'Tambahkan minimal satu soal sebelum menerbitkan.' });
		}
		questions.forEach((item, i) => {
			const n = i + 1;
			const options = asList(item.options).map((o) => str(o));
			if (!str(item.text).trim()) warnings.push({ field: 'questions', message: `Soal ${n} belum memiliki teks pertanyaan.` });
			if (options.filter((o) => o.trim()).length < 2)
				warnings.push({ field: 'questions', message: `Soal ${n} memerlukan minimal dua pilihan jawaban.` });
			const correctIndex = typeof item.correctIndex === 'number' ? item.correctIndex : -1;
			if (correctIndex < 0 || correctIndex >= options.filter((o) => o.trim()).length)
				warnings.push({ field: 'questions', message: `Soal ${n} belum menetapkan kunci jawaban — kunci tidak diarang, tetapkan manual.` });
			if (num(item.points) <= 0) warnings.push({ field: 'questions', message: `Soal ${n} memiliki poin 0.` });
		});
	}
	if (editable.kind === 'listening') {
		const l = asObj(raw.listening);
		const m = asObj(l.media);
		const mediaKind = str(m.kind);
		if (mediaKind === 'none' || (mediaKind === 'resource' && !str(m.resourceId)) || (mediaKind === 'link' && !str(m.url).trim()))
			warnings.push({ field: 'media', message: 'Pilih materi audio/video dari sumber daya mata kuliah atau tempel tautan eksternal.' });
		const questions = asList(l.questions);
		if (questions.length === 0)
			warnings.push({ field: 'questions', message: 'Tambahkan minimal satu pertanyaan menyimak.' });
		questions.forEach((item, i) => {
			const n = i + 1;
			if (!str(item.text).trim()) warnings.push({ field: 'questions', message: `Pertanyaan ${n} belum memiliki teks.` });
			if (str(item.type) === 'mc') {
				const options = asList(item.options).map((o) => str(o));
				if (options.filter((o) => o.trim()).length < 2)
					warnings.push({ field: 'questions', message: `Pertanyaan ${n} (pilihan ganda) memerlukan minimal dua pilihan.` });
				if (typeof item.correctIndex !== 'number' || item.correctIndex < 0)
					warnings.push({ field: 'questions', message: `Pertanyaan ${n} belum menetapkan kunci jawaban.` });
			}
			if (str(item.type) === 'matching' && asList(item.pairs).filter((p) => str(p.left).trim() && str(p.right).trim()).length < 2)
				warnings.push({ field: 'questions', message: `Pertanyaan ${n} (mencocokkan) memerlukan minimal dua pasangan.` });
		});
	}
	if (editable.kind === 'speaking') {
		const s = asObj(raw.speaking);
		if (!str(s.prompt).trim())
			warnings.push({ field: 'prompt', message: 'Prompt berbicara belum diisi — tidak diarang dari data lain.' });
		if (!bool(s.allowAudio, true) && !bool(s.allowVideo, true) && !bool(s.allowLink, true))
			warnings.push({ field: 'formats', message: 'Pilih minimal satu cara pengumpulan (audio, video, atau tautan).' });
	}
	if (editable.kind === 'reading') {
		const r = asObj(raw.reading);
		if (!str(r.passage).trim())
			warnings.push({ field: 'passage', message: 'Teks bacaan belum diisi. Tempel teks yang sudah Anda miliki — jangan mengandalkan teks yang diarang.' });
		const questions = asList(r.questions);
		if (questions.length === 0)
			warnings.push({ field: 'questions', message: 'Tambahkan minimal satu soal membaca.' });
		questions.forEach((item, i) => {
			const n = i + 1;
			const options = asList(item.options).map((o) => str(o));
			if (!str(item.text).trim()) warnings.push({ field: 'questions', message: `Soal ${n} belum memiliki teks.` });
			if (options.filter((o) => o.trim()).length < 2)
				warnings.push({ field: 'questions', message: `Soal ${n} memerlukan minimal dua pilihan.` });
			if (typeof item.correctIndex !== 'number' || item.correctIndex < 0)
				warnings.push({ field: 'questions', message: `Soal ${n} belum menetapkan kunci jawaban.` });
		});
	}
	if (editable.kind === 'writing') {
		const w = asObj(raw.writing);
		const questions = asList(w.questions);
		if (!str(w.prompt).trim() && questions.length === 0)
			warnings.push({ field: 'prompt', message: 'Prompt/ instruksi menulis belum diisi.' });
		if (!bool(w.allowText, true) && !bool(w.allowDocument, true) && !bool(w.allowPhotos, true))
			warnings.push({ field: 'formats', message: 'Pilih minimal satu format pengumpulan yang diizinkan.' });
		if (asList(w.criteria).length === 0)
			warnings.push({ field: 'criteria', message: 'Rubrik belum memiliki kriteria — tambahkan dari komponen penilaian RPS atau manual.' });
		const minWords = num(w.minWords);
		const maxWords = num(w.maxWords);
		if (minWords > 0 && maxWords > 0 && minWords > maxWords)
			warnings.push({ field: 'length', message: 'Panjang minimal melebihi panjang maksimal.' });
		questions.forEach((item, i) => {
			const n = i + 1;
			if (!str(item.prompt).trim()) warnings.push({ field: 'questions', message: `Pertanyaan ${n} belum memiliki prompt.` });
			const qMin = num(item.minWords);
			const qMax = num(item.maxWords);
			if (qMin > 0 && qMax > 0 && qMin > qMax)
				warnings.push({ field: 'questions', message: `Pertanyaan ${n}: panjang minimal melebihi panjang maksimal.` });
		});
	}
	return warnings;
}

// ── Grading (used by the server route and lecturer review) ───

export type GradedQuestion = {
	id: string;
	points: number;
	earned: number;
	correct: boolean;
	/** True for questions that need manual lecturer grading. */
	manual?: boolean;
	/** Only filled when results may be shown. */
	correctIndex?: number;
	expected?: string;
	explanation?: string;
};

export type GradeResult = {
	earned: number;
	total: number;
	scorePct: number;
	perQuestion: GradedQuestion[];
};

/** Grade reading MC items. Keys live under `reading`, never copied into the quiz key. */
export function gradeReading(
	config: ReadingConfig,
	key: TaskAnswerKey,
	answers: QuizStudentAnswers,
): GradeResult {
	return gradeQuiz(
		{
			...DEFAULT_QUIZ_CONFIG,
			questions: config.questions,
			releaseResults: config.releaseResults,
		},
		{ quiz: key.reading },
		answers,
	);
}

/** Grade a quiz attempt against the owner-only key. Unset keys earn nothing. */
export function gradeQuiz(
	config: QuizConfig,
	key: TaskAnswerKey,
	answers: QuizStudentAnswers,
): GradeResult {
	const perQuestion: GradedQuestion[] = config.questions.map((q) => {
		const entry = key.quiz?.[q.id];
		const hasKey = typeof entry?.correctIndex === 'number';
		const picked = answers[q.id];
		const correct = hasKey && typeof picked === 'number' && picked === entry!.correctIndex;
		return {
			id: q.id,
			points: q.points,
			earned: correct ? q.points : 0,
			correct,
			...(hasKey ? { correctIndex: entry!.correctIndex } : {}),
			...(entry?.explanation ? { explanation: entry.explanation } : {}),
		};
	});
	return sumGrade(perQuestion);
}

/** Grade the auto-gradable (mc) listening questions; others stay manual. */
export function gradeListening(
	config: ListeningConfig,
	key: TaskAnswerKey,
	answers: ListeningStudentAnswers,
): GradeResult & { manualIds: string[] } {
	const manualIds: string[] = [];
	const perQuestion: GradedQuestion[] = config.questions.map((q) => {
		if (q.type !== 'mc') {
			manualIds.push(q.id);
			return { id: q.id, points: q.points, earned: 0, correct: false, manual: true };
		}
		const entry = key.listening?.[q.id];
		const hasKey = typeof entry?.correctIndex === 'number';
		const picked = answers[q.id];
		const correct = hasKey && typeof picked === 'number' && picked === entry!.correctIndex;
		return {
			id: q.id,
			points: q.points,
			earned: correct ? q.points : 0,
			correct,
			...(hasKey ? { correctIndex: entry!.correctIndex } : {}),
			...(entry?.explanation ? { explanation: entry.explanation } : {}),
		};
	});
	return { ...sumGrade(perQuestion), manualIds };
}

function sumGrade(perQuestion: GradedQuestion[]): GradeResult {
	const earned = perQuestion.reduce((sum, q) => sum + q.earned, 0);
	const total = perQuestion.reduce((sum, q) => sum + q.points, 0);
	return {
		earned,
		total,
		scorePct: total > 0 ? Math.round((earned / total) * 100) : 0,
		perQuestion,
	};
}

// ── Quiz text import (labeled blocks; nothing invented) ───────

export type ParsedQuizImport = {
	questions: QuizQuestionEditable[];
	notes: string[];
};

const OPTION_RE = /^\(?([A-Ea-e])[).]\s*(.+)$/;
const ANSWER_RE = /^(jawaban|kunci|answer)\s*[:=]?\s*([A-Ea-e])\b/i;
const POINTS_RE = /^(poin|points?|bobot)\s*[:=]?\s*(\d+)\b/i;
const EXPLAIN_RE = /^(pembahasan|penjelasan|explanation)\s*[:=]?\s*(.+)$/i;
const QUESTION_RE = /^(soal|pertanyaan|question)\s*(\d+)?\s*[:.]\s*(.+)$/i;
const BULLET_QUESTION_RE = /^(\d+)[.)]\s+(.+)/;

/**
 * Parse labeled quiz-question blocks from pasted/imported text:
 *
 *   Soal 1: Ibu kota Indonesia adalah ...
 *   A. Bandung
 *   B. Jakarta
 *   Jawaban: B
 *   Poin: 10
 *   Pembahasan: ...
 *
 * Anything unreadable is reported in `notes`, never guessed.
 */
export function parseQuizQuestionsFromText(text: string): ParsedQuizImport {
	const notes: string[] = [];
	const questions: QuizQuestionEditable[] = [];
	const lines = text.split(/\r?\n/);

	let current: {
		text: string;
		options: string[];
		correctIndex: number;
		points: number;
		explanation: string;
	} | null = null;

	const push = () => {
		if (!current) return;
		if (!current.text.trim()) {
			notes.push('Sebuah blok soal tanpa teks pertanyaan dilewati.');
		} else if (current.options.length < 2) {
			notes.push(`Soal “${clip(current.text)}” dilewati — pilihan jawaban kurang dari dua.`);
		} else {
			questions.push({
				id: `q${questions.length + 1}-${Date.now().toString(36)}${questions.length}`,
				text: current.text.trim(),
				options: current.options.map((o) => o.trim()),
				correctIndex: current.correctIndex,
				points: current.points > 0 ? current.points : 1,
				explanation: current.explanation.trim(),
			});
			if (current.correctIndex < 0)
				notes.push(`Soal “${clip(current.text)}” belum ber-kunci — tetapkan kunci jawaban manual.`);
		}
		current = null;
	};

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;

		const q = QUESTION_RE.exec(line) || BULLET_QUESTION_RE.exec(line);
		if (q) {
			push();
			current = { text: q[3] || q[2] || '', options: [], correctIndex: -1, points: 0, explanation: '' };
			continue;
		}
		if (!current) continue;

		const answer = ANSWER_RE.exec(line);
		if (answer) {
			const letter = answer[2].toUpperCase();
			current.correctIndex = 'ABCDE'.indexOf(letter);
			continue;
		}
		const points = POINTS_RE.exec(line);
		if (points) {
			current.points = Number(points[2]);
			continue;
		}
		const explain = EXPLAIN_RE.exec(line);
		if (explain) {
			current.explanation = explain[2];
			continue;
		}
		const option = OPTION_RE.exec(line);
		if (option) {
			current.options.push(option[2]);
			continue;
		}
		// Continuation of the question stem.
		if (current.options.length === 0) current.text += ` ${line}`;
	}
	push();

	if (questions.length === 0 && text.trim())
		notes.push('Tidak ada blok soal yang terbaca. Gunakan format “Soal 1: …” dengan pilihan A–E.');
	return { questions, notes };
}

function clip(text: string, max = 40) {
	const t = text.trim();
	return t.length > max ? `${t.slice(0, max)}…` : t;
}

// ── Media helpers ─────────────────────────────────────────────

const AUDIO_VIDEO_EXT = /\.(mp3|wav|ogg|m4a|aac|mp4|webm|ogv|mov|mkv)$/i;

/** Course resources that look like audio/video material. */
export function mediaResources(resources: CourseResource[]): CourseResource[] {
	return resources.filter((r) => {
		if (r.kind === 'link') return /^https?:\/\//i.test(r.url || '');
		return AUDIO_VIDEO_EXT.test(r.file || '');
	});
}

/** "mm:ss" ↔ seconds for listening timestamps. */
export function formatTimestamp(seconds: number | null): string {
	if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
	const m = Math.floor(seconds / 60);
	const s = Math.round(seconds % 60);
	return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function parseTimestamp(value: string): number | null {
	if (!value.trim()) return null;
	const m = /^(\d+):([0-5]?\d)$/.exec(value.trim());
	if (m) return Number(m[1]) * 60 + Number(m[2]);
	const plain = Number(value);
	return Number.isFinite(plain) && plain >= 0 ? Math.round(plain) : null;
}

/** Count words for the writing workspace's live length guidance. */
export function countWords(text: string): number {
	const t = text.trim();
	if (!t) return 0;
	return t.split(/\s+/).length;
}
