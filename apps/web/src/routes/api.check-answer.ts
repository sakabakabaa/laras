import PocketBase from 'pocketbase';
import logger from '@/lib/logger.server';
import { apiError, json, readFormData, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import {
	activityTypeOf,
	isPastDeadline,
	SHAPE_LABEL,
	type Assignment,
	type AssignmentSubmission,
} from '@/lib/assignments';
import {
	parseSpeakingConfig,
	parseWritingConfig,
	taskKindForShape,
	TASK_KIND_LABEL,
	type TaskKind,
} from '@/lib/task-types';
import {
	criteriaForAssignment,
	extractStoredFiles,
	parseExtracted,
	taskSourceContext,
	type ExtractedContent,
} from '@/lib/feedback.server';
import { resolveAssignmentPolicy } from '@/lib/ai-policy';
import { authorizeCapabilities, CHECK_ANSWER_CAPABILITIES } from '@/lib/ai-policy.server';
import {
	buildCheckFeedback,
	normalizeOcrText,
	renderResponseText,
	responseHasDirectAnswer,
} from '@/lib/check-answer.server';
import { buildLearnerProfileForUser, enrolledUserIdFromKey } from '@/lib/learner-profile.server';
import {
	buildPersonalizationContext,
	selectStrategy,
	summarizeDecision,
	type PersonalizationDecision,
} from '@/lib/personalization.server';
import {
	checkMaxOf,
	enrolledIdentityKey,
	identityOf,
	interactionMetaOf,
	publicIdentityComplete,
	type CheckResponsePayload,
	type PublicCheckIdentity,
} from '@/lib/check-types';
import {
	continuationMatches,
	findPublicAssignment,
	findPublicRow,
	publicFileUrl,
	randomContinuationCode,
	type PublicSubmissionRow,
} from '@/lib/public-drafts.server';
import { cefrLevelGuide, extractCefrLevel } from '@/lib/cefr-level';

type Body = {
	action?: string;
	assignmentId?: string;
	token?: string;
	participantName?: string;
	nim?: string;
	groupName?: string;
	members?: string;
	/** Public participants: continuation code protecting their draft. */
	continuationToken?: string;
	response?: CheckResponsePayload;
	focus?: string;
	/** OCR-first image flow: student-reviewed OCR text + confirmation. */
	ocrText?: string;
	ocrRaw?: string;
	ocrConfirmed?: boolean;
	/** Phase 8: student explicitly requested explicit correction (Level 4). */
	explicitCorrection?: boolean;
};

type AttemptRow = {
	id: string;
	assignment: string;
	submission: string;
	owner: string;
	channel: string;
	attempt: number;
	level?: number;
	participantName: string;
	identityKey: string;
	responseSnapshot: unknown;
	extracted?: unknown;
	feedback: string;
	area: string;
	evidence: string;
	focus: string;
	created: string;
};

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/** Same-site URL for one stored file (draft row / submission attachment). */
const storedFileUrl = (collection: string, recordId: string, filename: string) =>
	`/hcgi/platform/api/files/${collection}/${recordId}/${encodeURIComponent(filename)}`;

/** OCR snapshot kept on a check attempt (lecturer history only). */
type OcrSnapshot = {
	rawText: string;
	reviewedText: string;
	normalizedText: string;
	image: { name: string; url: string } | null;
};

const ocrSnapshotOf = (row: AttemptRow): OcrSnapshot | null => {
	if (!row.extracted || typeof row.extracted !== 'object') return null;
	const ocr = (row.extracted as { ocr?: unknown }).ocr;
	if (!ocr || typeof ocr !== 'object') return null;
	const o = ocr as Record<string, unknown>;
	const image = o.image && typeof o.image === 'object' ? (o.image as Record<string, unknown>) : null;
	const name = typeof image?.name === 'string' ? image.name : '';
	const url = typeof image?.url === 'string' ? image.url : '';
	const snapshot: OcrSnapshot = {
		rawText: typeof o.rawText === 'string' ? o.rawText : '',
		reviewedText: typeof o.reviewedText === 'string' ? o.reviewedText : '',
		normalizedText: typeof o.normalizedText === 'string' ? o.normalizedText : '',
		image: name ? { name, url } : null,
	};
	if (!snapshot.normalizedText && !snapshot.rawText) return null;
	return snapshot;
};

/** Authenticate the caller's PocketBase token; returns null on failure. */
async function authUser(request: Request) {
	const header = request.headers.get('Authorization') || '';
	const token = header.replace(/^Bearer\s+/i, '').trim();
	if (!token) return { error: apiError(401, 'Masuk untuk memakai Cek jawaban.') } as const;
	const pb = new PocketBase(pocketbaseUrl());
	pb.autoCancellation(false);
	pb.authStore.save(token, null);
	try {
		await pb.collection('users').authRefresh();
	} catch {
		return { error: apiError(401, 'Sesi tidak valid. Masuk kembali.') } as const;
	}
	const user = pb.authStore.record as
		| { id: string; role?: string; verified?: boolean; name?: string; email?: string }
		| null;
	if (!user?.id) return { error: apiError(401, 'Sesi tidak valid. Masuk kembali.') } as const;
	return { pb, user } as const;
}

const identityBody = (body: Body): PublicCheckIdentity => ({
	participantName: (body.participantName || '').trim(),
	nim: (body.nim || '').trim(),
	groupName: (body.groupName || '').trim(),
	members: (body.members || '').trim(),
});

const listAttempts = (assignmentId: string, identityKey: string) =>
	pocketbaseAdmin.listRecords<AttemptRow>('check_attempts', {
		perPage: 200,
		filter: `assignment="${assignmentId}" && identityKey="${identityKey}"`,
		sort: 'created',
	});

const attemptSummary = (row: AttemptRow) => {
	const ocr = ocrSnapshotOf(row);
	return {
		attempt: row.attempt,
		level: row.level ?? undefined,
		area: row.area,
		feedback: row.feedback,
		evidence: row.evidence,
		focus: row.focus,
		created: row.created,
		...(ocr ? { ocr } : {}),
	};
};

/**
 * POST /api/check-answer
 *
 * Formative "Cek jawaban" checks on the participant's CURRENT response,
 * before the official submission:
 * - `check`   — run one numbered check (AI recommendation only: no answer
 *   keys, no right/wrong verdicts, no rewrites, no grades). Default max 5
 *   per participant per assignment (lecturer-configurable).
 * - `history` — the participant's own check history + remaining checks.
 *
 * Works for authenticated students (identity = account) and public-link
 * participants (identity = required name + NIM / group fields, verified
 * against earlier attempts on return). Official grading stays with the
 * lecturer; every check is recorded for lecturer review.
 */
type CheckRequest = {
	body: Body;
	uploads: File[];
	keptFiles: string[];
};

const parseKept = (raw: string) => {
	try {
		const parsed = JSON.parse(raw || '[]');
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((name): name is string => typeof name === 'string' && name.trim().length > 0).slice(0, 10);
	} catch {
		return [];
	}
};

async function readCheckRequest(request: Request): Promise<CheckRequest | Response> {
	const type = request.headers.get('content-type') || '';
	if (!type.includes('multipart/form-data')) {
		return { body: await readJsonBody<Body>(request), uploads: [], keptFiles: [] };
	}
	const form = await readFormData(request);
	let response: CheckResponsePayload | undefined;
	const rawResponse = String(form.get('response') || '');
	if (rawResponse.trim()) {
		try {
			response = JSON.parse(rawResponse) as CheckResponsePayload;
		} catch {
			return apiError(422, 'Jawaban tidak dapat dibaca.');
		}
	}
	const uploads = form
		.getAll('files')
		.filter((item): item is File => item instanceof File && item.size > 0)
		.slice(0, 10);
	for (const file of uploads) {
		if (file.size > 20 * 1024 * 1024) return apiError(422, `Berkas ${file.name} melebihi 20 MB.`);
	}
	return {
		body: {
			action: String(form.get('action') || ''),
			token: String(form.get('token') || ''),
			participantName: String(form.get('participantName') || ''),
			nim: String(form.get('nim') || ''),
			groupName: String(form.get('groupName') || ''),
			members: String(form.get('members') || ''),
			continuationToken: String(form.get('continuationToken') || ''),
			focus: String(form.get('focus') || ''),
			ocrText: String(form.get('ocrText') || ''),
			ocrRaw: String(form.get('ocrRaw') || ''),
			ocrConfirmed: String(form.get('ocrConfirmed') || '') === 'true',
			explicitCorrection: String(form.get('explicitCorrection') || '') === 'true',
			response,
		},
		uploads,
		keptFiles: parseKept(String(form.get('keptFiles') || '[]')),
	};
}

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const parsed = await readCheckRequest(request);
	if (parsed instanceof Response) return parsed;
	const body = parsed.body;
	const act = body.action?.trim();

	if (act === 'check') {
		return body.token ? publicCheck(body, parsed.uploads, parsed.keptFiles) : enrolledCheck(request, body);
	}
	if (act === 'history') {
		return body.token ? publicHistory(body) : enrolledHistory(request, body);
	}
	return apiError(422, 'Aksi tidak dikenal (check atau history).');
});

// ── Shared check runner ─────────────────────────────────────

async function runCheck(input: {
	assignment: Assignment;
	identityKey: string;
	channel: 'enrolled' | 'public';
	participantName: string;
	submission: AssignmentSubmission | null;
	response: CheckResponsePayload;
	focus: string;
	previous: { attempt: number; area: string }[];
	cachedExtracted: unknown;
	/** Where the participant's stored files live (public draft row / submission). */
	fileSource?: { collection: 'public_submissions' | 'assignment_submissions'; recordId: string } | null;
	/** Stored file names available to this check (uploads already persisted). */
	storedFiles?: string[];
	/** OCR-first image flow: student-reviewed OCR text + confirmation flag. */
	ocrText?: string;
	ocrRaw?: string;
	ocrConfirmed?: boolean;
	/** Phase 8: student explicitly requested explicit correction (Level 4). */
	explicit?: boolean;
	/** Previous check attempt (for revision-linkage interaction metadata). */
	previousAttempt?: { id: string; responseSnapshot: unknown } | null;
	/** Phase 10 — validated learner-history context for personalized feedback. */
	personalizationContext?: string;
	/** Phase 10 — personalization decision for provenance logging. */
	personalization?: PersonalizationDecision;
	/** Phase 10 — stable learner key for provenance logging. */
	learnerKey?: string;
}): Promise<Response | { payload: Record<string, unknown> }> {
	const { assignment } = input;
	const max = checkMaxOf(assignment);
	const kind = taskKindForShape(assignment.shape) as TaskKind | null;
	const used = input.previous.length;
	if (used >= max) {
		return apiError(
			422,
			`Pemeriksaan sudah mencapai batas maksimal (${max} dari ${max}). Perbaiki jawaban Anda lalu kumpulkan.`,
		);
	}
	if (!input.response || typeof input.response !== 'object') {
		return apiError(422, 'Belum ada jawaban untuk diperiksa. Isi jawaban Anda lebih dulu.');
	}

	const attachmentNames = (input.response.attachments || [])
		.map((file) => file.name)
		.filter(Boolean);
	const storedFiles = input.storedFiles || [];
	const imageNames = storedFiles.filter((f) => IMAGE_EXT.test(f));
	const documentNames = storedFiles.filter((f) => !IMAGE_EXT.test(f));
	const source = input.fileSource || null;

	// ── OCR-first image flow ──────────────────────────────
	// Images are never evaluated straight from bytes: the first request
	// returns the OCR reading for the participant to review and correct (no
	// attempt consumed); the confirmed request normalizes obvious reading
	// errors and evaluates the normalized text.
	if (imageNames.length > 0 && !input.ocrConfirmed) {
		if (!source) {
			return apiError(
				422,
				'Foto jawaban belum tersimpan pada draf. Simpan draf Anda lebih dulu, lalu periksa jawaban.',
			);
		}
		const ocrExtracted = await extractStoredFiles({
			collection: source.collection,
			recordId: source.recordId,
			files: imageNames,
			kind: kind || undefined,
		});
		const ocrText = ocrExtracted.text.trim();
		if (!ocrExtracted.ok || !ocrText) {
			return apiError(
				422,
				ocrExtracted.unreadable[0] ||
					'Foto jawaban tidak terbaca dengan jelas. Unggah ulang foto yang lebih terang dan tidak kabur — isi yang tidak terbaca tidak ditebak dan pemeriksaan tidak dihitung.',
			);
		}
		return {
			payload: {
				ok: true,
				ocrRequired: true,
				ocrText,
				image: {
					name: imageNames[0],
					url: storedFileUrl(source.collection, source.recordId, imageNames[0]),
				},
				used,
				max,
				unreadable: ocrExtracted.unreadable,
				note: 'Periksa dan perbaiki hasil bacaan foto Anda terlebih dulu — pemeriksaan belum dihitung.',
			},
		};
	}

	const ocrReviewed = input.ocrConfirmed ? (input.ocrText || '').trim().slice(0, 12000) : '';
	let fileText = '';
	let extracted: ExtractedContent | null = null;
	if (imageNames.length > 0 && ocrReviewed) {
		// Confirmed OCR check: normalize only obvious reading errors, then the
		// normalized text becomes the checked answer version.
		if (!source) {
			return apiError(
				422,
				'Foto jawaban tidak ditemukan pada draf. Unggah ulang foto, lalu periksa jawaban.',
			);
		}
		const normalized = await normalizeOcrText(ocrReviewed);
		let pages = 0;
		const unreadable: string[] = [];
		let docText = '';
		if (documentNames.length > 0) {
			const docs = await extractStoredFiles({
				collection: source.collection,
				recordId: source.recordId,
				files: documentNames,
				kind: kind || undefined,
			});
			docText = docs.text.trim();
			pages = docs.pages;
			unreadable.push(...docs.unreadable);
		}
		fileText = [
				`[JAWABAN FOTO — hasil bacaan OCR, sudah ditinjau peserta dan dirapikan dari kesalahan baca ringan]\n"""\n${normalized}\n"""`,
			docText,
		]
			.filter(Boolean)
			.join('\n\n');
		extracted = {
			ok: true,
			text: normalized,
			pages,
			images: imageNames.length,
			unreadable,
			ocr: {
				rawText: (input.ocrRaw || '').slice(0, 12000),
				reviewedText: ocrReviewed,
				normalizedText: normalized,
				image: {
					name: imageNames[0],
					url: storedFileUrl(source.collection, source.recordId, imageNames[0]),
				},
			},
		};
	} else {
		// No confirmed OCR image text: existing behavior — cached extraction,
		// a fresh document (PDF) read, or nothing.
		extracted =
			parseExtracted(input.cachedExtracted) ??
			(source && documentNames.length > 0
				? await extractStoredFiles({
						collection: source.collection,
						recordId: source.recordId,
						files: documentNames,
						kind: kind || undefined,
					})
				: null);
		fileText = extracted?.text?.trim() || '';
	}
	const hasDirect = responseHasDirectAnswer(input.response);
	if (!hasDirect && !fileText) {
		const note = extracted?.unreadable?.[0];
		if (attachmentNames.length > 0 || note) {
			return apiError(
				422,
				note ||
					'Berkas terlampir tidak dapat dibaca. Unggah foto (JPEG/PNG/WebP) atau PDF yang lebih jelas — isi yang tidak terbaca tidak ditebak.',
			);
		}
		return apiError(422, 'Belum ada jawaban untuk diperiksa. Isi jawaban Anda lebih dulu.');
	}
	const responseText = [
		renderResponseText(assignment, input.response),
		fileText,
		attachmentNames.length
			? `[KONTEKS LAMPIRAN]\n${attachmentNames.join('\n')}`
			: '',
	]
		.filter(Boolean)
		.join('\n\n');

	const criteria = criteriaForAssignment(assignment);
	const language =
		kind === 'writing'
			? parseWritingConfig(assignment.taskConfig).language
			: kind === 'speaking'
				? parseSpeakingConfig(assignment.taskConfig).language
				: '';

	const attempt = used + 1;
	let levelGuide = '';
	if (kind) {
		try {
			const course = await pocketbaseAdmin.getRecord<{ code?: string }>('courses', assignment.course);
			levelGuide = cefrLevelGuide(extractCefrLevel(course.code || ''));
		} catch {
			/* no course code — safe fallback, existing behavior unchanged */
		}
	}
	const result = await buildCheckFeedback({
		taskLabel: kind
			? TASK_KIND_LABEL[kind]
			: assignment.shape
				? SHAPE_LABEL[assignment.shape]
				: 'Tugas',
		workMode: assignment.mode,
		instructions: assignment.instructions || '',
		requirements: assignment.requirements || '',
		language,
		criteria,
		responseText,
		focus: input.focus,
		attempt,
		previous: input.previous,
		kind,
		sourceContext: taskSourceContext(assignment),
		numbered: Boolean(input.response.numberedContent?.trim()),
		levelGuide,
		explicit: input.explicit,
		personalizationContext: input.personalizationContext,
	});
	if (!result) {
		return apiError(
			422,
			'Pemeriksaan belum dapat disusun dari jawaban ini. Perbaiki jawaban Anda lalu coba lagi.',
		);
	}

	const snapshotResponse: CheckResponsePayload = { ...input.response };
	// numberedContent is a transient AI-analysis aid (a line-numbered copy of
	// the answer); it never belongs in the persisted check snapshot.
	delete snapshotResponse.numberedContent;

	// Phase 8 — research-safe interaction metadata: links this check to the
	// previous attempt and records whether the student revised. Never carries
	// research judgments, confidence, or lecturer-only data.
	const interaction = interactionMetaOf(input.previousAttempt, input.response);

	const record: Record<string, unknown> = {
		assignment: assignment.id,
		submission: input.submission?.id || '',
		channel: input.channel,
		attempt,
		level: result.level,
		participantName: input.participantName.slice(0, 200),
		identityKey: input.identityKey,
		responseSnapshot: {
			...snapshotResponse,
			...(ocrReviewed ? { ocrText: ocrReviewed } : {}),
			...(attachmentNames.length
				? { attachments: attachmentNames.map((name) => ({ name })) }
				: {}),
		},
		feedback: result.feedback,
		area: result.area,
		evidence: result.evidence,
		criteria,
		focus: input.focus.slice(0, 500),
		requestedNextHint: interaction.requestedNextHint,
		revisionSubmitted: interaction.revisionSubmitted,
		revisesAttempt: interaction.revisesAttempt.slice(0, 64),
	};
	if (input.channel === 'enrolled') record.owner = input.submission?.owner || '';
	if (extracted) record.extracted = extracted;
	const createdAttempt = await pocketbaseAdmin.createRecord<AttemptRow>('check_attempts', record);

	// Phase 10.2 — record experimental condition provenance for EVERY formative
	// feedback event (generic and personalized). The mode is immutable once
	// recorded; it can never change retroactively. Generic events log
	// feedbackMode='generic' with no learner-profile influence. Fire-and-forget:
	// a logging error never affects the student's check. Stores no student
	// answer text, no grade, no internal model confidence.
	try {
		await pocketbaseAdmin.createRecord('personalization_logs', {
			assignment: assignment.id,
			owner: input.submission?.owner || '',
			learnerKey: input.learnerKey || input.identityKey,
			feedbackItemId: createdAttempt.id,
			feedbackMode: assignment.feedbackMode || 'generic',
			personalizationThreshold: assignment.personalizationThreshold || 3,
			learnerProfileVersion: input.personalization?.profileVersion || '',
			personalizationEnabled: input.personalization?.enabled ?? false,
			relevantCategories: input.personalization?.relevantCategories ?? [],
			historicalObservationCount: input.personalization?.historicalObservationCount ?? 0,
			feedbackStrategy: input.personalization?.strategy || 'generic',
			hintLevel: result.level,
			// collectModel does not expose model id/version — recorded as
			// 'unknown' (never invented), matching the Phase 5 provenance pattern.
			model: 'unknown',
			modelVersion: 'unknown',
			promptVersion: 'phase10-v1',
			generatedAt: new Date().toISOString(),
		});
	} catch (error) {
		logger.error('personalization log failed', error);
	}

	return {
		payload: {
			ok: true,
			attempt,
			used: attempt,
			max,
			level: result.level,
			area: result.area,
			feedback: result.feedback,
			evidence: result.evidence,
			hasRubric: criteria.length > 0,
			unreadable: extracted?.unreadable || [],
			...(extracted?.ocr
				? {
						ocr: {
							normalizedText: extracted.ocr.normalizedText,
							image: extracted.ocr.image,
						},
					}
				: {}),
			note: 'Hasil pemeriksaan bersifat formatif — bukan nilai. Dosen dapat melihat seluruh riwayat pemeriksaan Anda.',
		},
	};
}

// ── Enrolled student ─────────────────────────────────────────

async function enrolledCheck(request: Request, body: Body) {
	const auth = await authUser(request);
	if ('error' in auth) return auth.error;
	const { pb, user } = auth;

	const assignmentId = body.assignmentId?.trim();
	if (!assignmentId) return apiError(422, 'assignmentId wajib diisi.');
	let assignment: Assignment;
	try {
		assignment = await pb.collection('assignments').getOne<Assignment>(assignmentId);
	} catch {
		return apiError(404, 'Tugas tidak ditemukan.');
	}
	if (assignment.status !== 'published') {
		return apiError(422, 'Cek jawaban hanya tersedia saat tugas diterbitkan.');
	}
	if (assignment.checkEnabled === false && (assignment.checkMax || 0) > 0) {
		return apiError(422, 'Dosen belum mengaktifkan Cek jawaban untuk tugas ini.');
	}
	// Phase 1 — enforce the student AI assistance policy server-side before
	// any model call. The capability set Cek jawaban provides must be fully
	// permitted by the assignment's AI policy; a prohibited capability
	// rejects the request even if the frontend is manipulated.
	const checkPolicy = resolveAssignmentPolicy(assignment);
	const checkCapDecision = authorizeCapabilities(checkPolicy, CHECK_ANSWER_CAPABILITIES);
	if (!checkCapDecision.ok) return apiError(checkCapDecision.status, checkCapDecision.message);

	const subs = await pocketbaseAdmin.listRecords<AssignmentSubmission>('assignment_submissions', {
		perPage: 1,
		filter: `assignment="${assignment.id}" && owner="${user.id}"`,
		sort: '-created',
	});
	const submission = subs.items[0] || null;
	// Latihan formatif: repeatable practice without final submission — a
	// deadline (e.g. left over from a type change) or an old collected row
	// never closes the practice area.
	const formative = activityTypeOf(assignment) === 'formative';
	if (
		!formative &&
		submission &&
		submission.status !== 'draft' &&
		submission.status !== 'revision'
	) {
		return apiError(
			422,
			'Pekerjaan sudah dikumpulkan — Cek jawaban sudah ditutup untuk tugas ini. Menunggu penilaian dosen.',
		);
	}
	if (
		!formative &&
		isPastDeadline(assignment.deadline) &&
		submission?.status !== 'revision'
	) {
		return apiError(422, 'Batas waktu sudah lewat — Cek jawaban tidak tersedia lagi.');
	}

	const identityKey = enrolledIdentityKey(user.id);
	const rows = await listAttempts(assignment.id, identityKey);

	// Phase 10 — adaptive personalized feedback. Only enrolled students with
	// explicit lecturer enablement (feedbackMode = personalized) get a
	// personalized check; everyone else gets the generic formative check.
	// The profile is built ONLY from validated evidence; a failure or missing
	// profile silently falls back to generic feedback (never blocks the check).
	let personalizationContext = '';
	let personalization: PersonalizationDecision | undefined;
	if (assignment.feedbackMode === 'personalized') {
		try {
			const threshold =
				assignment.personalizationThreshold && assignment.personalizationThreshold > 0
					? assignment.personalizationThreshold
					: 3;
			// Aggregate validated evidence across the lecturer's formal assignments
			// in the same course (keeps CEFR/topic scope consistent).
			const courseAssignments = await pocketbaseAdmin
				.listRecords<{ id: string }>('assignments', {
					page: 1,
					perPage: 200,
					filter: `owner="${assignment.owner}" && course="${assignment.course}"`,
				})
				.then((r) => r.items.map((a) => a.id));
			const profile = await buildLearnerProfileForUser({
				learnerUserId: user.id,
				assignmentIds: courseAssignments,
				threshold,
			});
			if (profile) {
				const strategy = selectStrategy({ profile, currentCategory: '', hintLevel: rows.items.length + 1 });
				personalizationContext = buildPersonalizationContext({ profile, currentCategory: '' });
				personalization = summarizeDecision({ profile, currentCategory: '', strategy });
				// Optional student preferences affect explanation style only. They
				// enter this path only after both lecturer and student enablement.
				const preferences = await pocketbaseAdmin.listRecords<{
					aiPersonalization?: boolean; explanationLanguage?: string; supportPreference?: string; confidence?: string;
				}>('student_learning_profiles', { page: 1, perPage: 1, filter: `student="${user.id}"` });
				const prefs = preferences.items[0];
				if (prefs?.aiPersonalization) {
					const language = ({ id: 'Bahasa Indonesia', en: 'English', de: 'Deutsch' } as Record<string, string>)[prefs.explanationLanguage || ''];
					const support = ({ examples: 'contoh konkret', steps: 'langkah demi langkah', concise: 'penjelasan ringkas' } as Record<string, string>)[prefs.supportPreference || ''];
					const confidence = ({ low: 'gunakan penjelasan dasar dengan nada mendukung', medium: 'gunakan penjelasan bertahap', high: 'boleh berikan tantangan lanjutan yang tetap sesuai materi' } as Record<string, string>)[prefs.confidence || ''];
					const choices = [language && `bahasa: ${language}`, support && `gaya: ${support}`, confidence].filter(Boolean);
					if (choices.length) personalizationContext += `\nPreferensi belajar yang dipilih mahasiswa dan diizinkan untuk personalisasi AI: ${choices.join('; ')}. Terapkan pada gaya penjelasan saja, bukan pada kebenaran atau kriteria penilaian.`;
				}
			}
		} catch (error) {
			logger.error('personalization profile build failed', error);
		}
	}

	const result = await runCheck({
		assignment,
		identityKey,
		channel: 'enrolled',
		participantName: user.name || user.email || 'Mahasiswa',
		submission,
		response: body.response as CheckResponsePayload,
		focus: (body.focus || '').trim().slice(0, 500),
		previous: rows.items.map((r) => ({ attempt: r.attempt, area: r.area })),
		cachedExtracted: rows.items[rows.items.length - 1]?.extracted,
		fileSource: submission
			? { collection: 'assignment_submissions', recordId: submission.id }
			: null,
		storedFiles: submission?.files || [],
		ocrText: body.ocrText,
		ocrRaw: body.ocrRaw,
		ocrConfirmed: body.ocrConfirmed,
		explicit: body.explicitCorrection,
		previousAttempt: rows.items[rows.items.length - 1]
			? {
					id: rows.items[rows.items.length - 1].id,
					responseSnapshot: rows.items[rows.items.length - 1].responseSnapshot,
				}
			: null,
		personalizationContext,
		personalization,
		learnerKey: identityKey,
	});
	return result instanceof Response ? result : json(result.payload);
}

async function enrolledHistory(request: Request, body: Body) {
	const auth = await authUser(request);
	if ('error' in auth) return auth.error;
	const { pb, user } = auth;

	const assignmentId = body.assignmentId?.trim();
	if (!assignmentId) return apiError(422, 'assignmentId wajib diisi.');
	let assignment: Assignment;
	try {
		assignment = await pb.collection('assignments').getOne<Assignment>(assignmentId);
	} catch {
		return apiError(404, 'Tugas tidak ditemukan.');
	}
	const identityKey = enrolledIdentityKey(user.id);
	const rows = await listAttempts(assignment.id, identityKey);
	const last = rows.items[rows.items.length - 1];
	return json({
		used: rows.items.length,
		max: checkMaxOf(assignment),
		checkEnabled: assignment.checkEnabled !== false,
		attempts: rows.items.map(attemptSummary),
		lastResponse: (last?.responseSnapshot as CheckResponsePayload | undefined) ?? null,
	});
}

// ── Public-link participant ───────────────────────────────────

async function storePublicCheckFiles(
	assignment: Assignment,
	identity: PublicCheckIdentity,
	identityKey: string,
	row: PublicSubmissionRow | null,
	response: CheckResponsePayload,
	uploads: File[],
	keptFiles: string[],
): Promise<PublicSubmissionRow | null> {
	const hasUpload = uploads.length > 0;
	const keptSent = keptFiles.length > 0 || hasUpload;
	if (!hasUpload && !row?.files?.length && !keptSent) return row;
	const code = row?.continuationToken || randomContinuationCode();
	const kept = keptSent ? keptFiles : row?.files || [];
	const fd = new FormData();
	if (!row) {
		fd.set('assignment', assignment.id);
		fd.set('participantName', identity.participantName.slice(0, 200));
		fd.set('nim', identity.nim.slice(0, 40));
		fd.set('groupName', identity.groupName.slice(0, 200));
		fd.set('members', identity.members.slice(0, 2000));
		fd.set('identityKey', identityKey.slice(0, 120));
		fd.set('status', 'draft');
		fd.set('continuationToken', code);
	}
	fd.set('content', (response.content || '').slice(0, 10000));
	if (response.link) fd.set('link', response.link);
	if (response.answers) fd.set('taskAnswers', JSON.stringify({ answers: response.answers }));
	for (const name of kept) fd.append('files', name);
	for (const file of uploads) fd.append('files', file, file.name);
	if (row) {
		return pocketbaseAdmin.updateRecord<PublicSubmissionRow>('public_submissions', row.id, fd);
	}
	return pocketbaseAdmin.createRecord<PublicSubmissionRow>('public_submissions', fd);
}

async function publicCheck(body: Body, uploads: File[] = [], keptFiles: string[] = []) {
	const assignment = await findPublicAssignment(body.token || '');
	if (!assignment) return apiError(404, 'Tugas tidak ditemukan atau tautan publik dimatikan.');
	if (assignment.checkEnabled === false && (assignment.checkMax || 0) > 0) {
		return apiError(422, 'Dosen belum mengaktifkan Cek jawaban untuk tugas ini.');
	}
	// Phase 1 — enforce the student AI assistance policy server-side for
	// public-link participants too. The same capability gate applies.
	const publicCheckPolicy = resolveAssignmentPolicy(assignment);
	const publicCapDecision = authorizeCapabilities(publicCheckPolicy, CHECK_ANSWER_CAPABILITIES);
	if (!publicCapDecision.ok) return apiError(publicCapDecision.status, publicCapDecision.message);
	// Latihan formatif: repeatable practice stays open — no deadline and no
	// final submission closes it (matches the public form's behavior).
	const formative = activityTypeOf(assignment) === 'formative';
	if (!formative && isPastDeadline(assignment.deadline)) {
		return apiError(422, 'Batas waktu sudah lewat. Pemeriksaan ditutup.');
	}

	const identity = identityBody(body);
	if (!publicIdentityComplete(assignment.mode, identity)) {
		return apiError(
			422,
			assignment.mode === 'collaborative'
				? 'Isi nama lengkap, nama kelompok, dan daftar anggota sebelum memeriksa jawaban.'
				: 'Isi nama lengkap dan NIM / nomor mahasiswa sebelum memeriksa jawaban.',
		);
	}

	const identityKey = identityOf(assignment.mode, identity.nim, identity.groupName);
	const row = await findPublicRow(assignment.id, identityKey);
	if (!formative && row && row.status !== 'draft') {
		return apiError(
			422,
			'Identitas ini sudah mengumpulkan — Cek jawaban sudah ditutup. Menunggu penilaian dosen.',
		);
	}
	// A saved draft is protected by its continuation code: only the code
	// holder may keep checking (and spending) this identity's check quota.
	if (row && !continuationMatches(row, body.continuationToken)) {
		return apiError(
			403,
			'Draf identitas ini dilindungi kode lanjutan. Buka draf Anda lewat tautan/kode lanjutan yang Anda simpan, lalu periksa jawaban lagi.',
		);
	}

	const rows = await listAttempts(assignment.id, identityKey);
	// Legacy (pre-draft) attempts: verify identity on return by name match.
	const first = rows.items[0];
	if (
		!row &&
		first &&
		first.participantName.trim().toLowerCase() !== identity.participantName.toLowerCase()
	) {
		return apiError(
			403,
			'Nama tidak cocok dengan riwayat pemeriksaan identitas ini. Gunakan nama yang sama saat pemeriksaan pertama.',
		);
	}

	const response = {
		...(body.response || { kind: 'generic' }),
	} as CheckResponsePayload;
	let stored: PublicSubmissionRow | null = row;
	const wantsFiles = uploads.length > 0 || keptFiles.length > 0 || (row?.files?.length || 0) > 0;
	if (wantsFiles) {
		try {
			stored = await storePublicCheckFiles(
				assignment,
				identity,
				identityKey,
				row,
				response,
				uploads,
				keptFiles,
			);
		} catch (error) {
			logger.error('public check file store failed', error);
			return apiError(422, 'Berkas tidak dapat disimpan untuk diperiksa. Coba unggah ulang.');
		}
	}
	const storedNames = stored?.files || [];
	if (storedNames.length) {
		response.attachments = storedNames.map((name) => ({ name }));
	}

	const result = await runCheck({
		assignment,
		identityKey,
		channel: 'public',
		participantName: identity.participantName,
		submission: null,
		response,
		focus: (body.focus || '').trim().slice(0, 500),
		previous: rows.items.map((r) => ({ attempt: r.attempt, area: r.area })),
		cachedExtracted: wantsFiles ? null : rows.items[rows.items.length - 1]?.extracted,
		fileSource: stored ? { collection: 'public_submissions', recordId: stored.id } : null,
		storedFiles: storedNames,
		ocrText: body.ocrText,
		ocrRaw: body.ocrRaw,
		ocrConfirmed: body.ocrConfirmed,
		explicit: body.explicitCorrection,
		previousAttempt: rows.items[rows.items.length - 1]
			? {
					id: rows.items[rows.items.length - 1].id,
					responseSnapshot: rows.items[rows.items.length - 1].responseSnapshot,
				}
			: null,
	});
	if (result instanceof Response) {
		if (!stored?.continuationToken) return result;
		const failed = (await result.json().catch(() => ({ error: 'Pemeriksaan gagal.' }))) as Record<
			string,
			unknown
		>;
		return json(
			{
				...failed,
				continuationToken: stored.continuationToken,
				files: (stored.files || []).map((name) => ({
					name,
					url: publicFileUrl(stored.id, name),
				})),
			},
			{ status: result.status },
		);
	}

	// First check for this identity: create the protected draft row so the
	// participant receives a continuation code and every later access to this
	// identity's draft, feedback, and quota requires it.
	let code = stored?.continuationToken || '';
	if (!stored) {
		code = randomContinuationCode();
		try {
			await pocketbaseAdmin.createRecord('public_submissions', {
				assignment: assignment.id,
				participantName: identity.participantName.slice(0, 200),
				nim: identity.nim.slice(0, 40),
				groupName: identity.groupName.slice(0, 200),
				members: identity.members.slice(0, 2000),
				identityKey: identityKey.slice(0, 120),
				content: (response.content || '').slice(0, 10000),
				...(response.link ? { link: response.link } : {}),
				...(response.answers ? { taskAnswers: { answers: response.answers } } : {}),
				status: 'draft',
				continuationToken: code,
			});
		} catch (error) {
			// The check itself already succeeded and is recorded; without the
			// draft row the participant simply continues on the identity path.
			logger.error('public check draft row failed', error);
			code = '';
		}
	}
	return json({
		...result.payload,
		...(code ? { continuationToken: code } : {}),
		...(stored
			? {
					files: (stored.files || []).map((name) => ({
						name,
						url: publicFileUrl(stored.id, name),
					})),
				}
			: {}),
	});
}

async function publicHistory(body: Body) {
	const assignment = await findPublicAssignment(body.token || '');
	if (!assignment) return apiError(404, 'Tugas tidak ditemukan atau tautan publik dimatikan.');

	const identity = identityBody(body);
	if (!publicIdentityComplete(assignment.mode, identity)) {
		return json({
			used: 0,
			max: checkMaxOf(assignment),
			checkEnabled: assignment.checkEnabled !== false,
			attempts: [],
			lastResponse: null,
		});
	}
	const identityKey = identityOf(assignment.mode, identity.nim, identity.groupName);
	const row = await findPublicRow(assignment.id, identityKey);
	// A saved draft (or submission) is protected by its continuation code.
	if (row && !continuationMatches(row, body.continuationToken)) {
		return apiError(
			403,
			'Draf identitas ini dilindungi kode lanjutan. Buka draf Anda lewat tautan/kode lanjutan yang Anda simpan untuk melihat riwayat pemeriksaan.',
		);
	}
	const rows = await listAttempts(assignment.id, identityKey);
	const first = rows.items[0];
	if (
		!row &&
		first &&
		first.participantName.trim().toLowerCase() !== identity.participantName.toLowerCase()
	) {
		return apiError(
			403,
			'Nama tidak cocok dengan riwayat pemeriksaan identitas ini. Gunakan nama yang sama saat pemeriksaan pertama.',
		);
	}
	const last = rows.items[rows.items.length - 1];
	return json({
		used: rows.items.length,
		max: checkMaxOf(assignment),
		checkEnabled: assignment.checkEnabled !== false,
		attempts: rows.items.map(attemptSummary),
		lastResponse: (last?.responseSnapshot as CheckResponsePayload | undefined) ?? null,
		...(row?.continuationToken ? { continuationToken: row.continuationToken } : {}),
	});
}
