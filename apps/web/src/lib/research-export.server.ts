/**
 * Phase 6 — research dataset export (lecturer/researcher-only).
 *
 * Exports the lecturer-only `ai_feedback_items` research records for one
 * Tugas formal assignment as CSV (one row per feedback item, for statistical
 * analysis) and JSON (complete research records with raw model output, full AI
 * generation provenance, assignment/task metadata, and approved-material
 * citation metadata).
 *
 * Privacy contract:
 * - Participants are identified ONLY by a stable pseudonymous id (P001, P002,
 *   …) derived from the submission owner. The mapping between a pseudonymous
 *   id and the real student identity is NEVER included in the export — it
 *   exists only in memory for the duration of one export and is discarded.
 * - No student name, email, NIM, or other direct identifier is exported. The
 *   reviewer column carries the lecturer/researcher's PocketBase record id (a
 *   random non-personal identifier), never their email or name.
 *
 * Authorization: only the assignment owner or an explicitly authorized
 * researcher (configured via the `RESEARCHER_USER_IDS` env var) may export.
 * Students are blocked by the route's auth + role guard and by the
 * owner-scoped PocketBase list rules. The export is strictly READ-ONLY: it
 * never writes to any collection and never modifies grades, feedback, or any
 * existing academic record.
 */
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { extractCefrLevel } from '@/lib/cefr-level';
import type { Assignment } from '@/lib/assignments';
import { parseRaterJudgments } from '@/lib/research-rater';
import { parseFindings, type EvalFinding } from '@/lib/ai-evaluation';
import { findSourceFindingByFingerprint, findingFingerprint } from '@/lib/research-annotation';
import { createHash } from 'node:crypto';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

/** Phase 10.2 — research dataset version identifier. Bump when the schema or
 *  annotation rules materially change so a researcher can identify which rules
 *  were active when data were exported. Does not alter existing raw records. */
export const RESEARCH_DATASET_VERSION = 'laras-research-v3';

/** Export schema version; distinct from the generation-time evaluation schema. */
export const EXPORT_RESEARCH_SCHEMA_VERSION = 3;

/** Export provenance only; source text, prompts, image URLs, and archived output stay server-side. */
export function serializeSnapshotProvenance(input: { researchSnapshot?: unknown; generationHistory?: unknown }) {
	const project = (value: unknown) => {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
		const snapshot = value as Record<string, unknown>;
		const hashes = snapshot.hashes && typeof snapshot.hashes === 'object' && !Array.isArray(snapshot.hashes)
			? Object.fromEntries(Object.entries(snapshot.hashes as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
			: {};
		const provider = snapshot.providerConfig && typeof snapshot.providerConfig === 'object' && !Array.isArray(snapshot.providerConfig)
			? snapshot.providerConfig as Record<string, unknown> : {};
		return {
			schemaVersion: snapshot.schemaVersion,
			generationId: typeof snapshot.generationId === 'string' ? snapshot.generationId : 'unknown',
			capturedAt: typeof snapshot.capturedAt === 'string' ? snapshot.capturedAt : '',
			buildId: typeof snapshot.buildId === 'string' ? snapshot.buildId : 'unknown',
			promptVersion: typeof snapshot.promptVersion === 'string' ? snapshot.promptVersion : '',
			systemPromptVersion: typeof snapshot.systemPromptVersion === 'string' ? snapshot.systemPromptVersion : '',
			providerConfig: {
				provider: typeof provider.provider === 'string' ? provider.provider : 'unknown',
				model: typeof provider.model === 'string' ? provider.model : 'unknown',
				modelVersion: typeof provider.modelVersion === 'string' ? provider.modelVersion : 'unknown',
			},
			hashes,
			snapshotHash: typeof snapshot.snapshotHash === 'string' ? snapshot.snapshotHash : '',
		};
	};
	const history = Array.isArray(input.generationHistory) ? input.generationHistory.map((entry) => {
		const row = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
		return {
			archivedAt: typeof row.archivedAt === 'string' ? row.archivedAt : '',
			reviewStatus: typeof row.reviewStatus === 'string' ? row.reviewStatus : '',
			outputHash: typeof row.outputHash === 'string' ? row.outputHash : '',
			snapshot: project(row.researchSnapshot),
		};
	}) : [];
	return { researchSnapshot: project(input.researchSnapshot), generationHistory: history };
}

/** CSV column order — one row per ai_feedback_items record. */
export const CSV_HEADERS = [
	'participantId',
	'submissionId',
	'assignmentId',
	'taskId',
	'cefrLevel',
	'model',
	'modelVersion',
	'promptVersion',
	'researchSchemaVersion',
	'evaluationGenerationId',
	'snapshotHash',
	'studentTextHash',
	'outputHash',
	'feedbackItemId',
	'origin',
	'quote',
	'quoteStart',
	'quoteEnd',
	'anchorValid',
	'anchorError',
	'aiCategory',
	'aiSubcategory',
	'aiSeverity',
	'aiNote',
	'aiCorrection',
	'aiExplanation',
	'aiCriterion',
	'aiConfidence',
	'parentAiFindingId',
	'reviewStatus',
	'rejectReason',
	'referenceCategory',
	'referenceSubcategory',
	'referenceSeverity',
	'referenceCorrection',
	'referenceExplanation',
	'errorPresent',
	'detectionJudgment',
	'correctionJudgment',
	'explanationJudgment',
	'completenessJudgment',
	'necessityJudgment',
	'pedagogicalJudgment',
	'reviewer',
	'reviewedAt',
	'adjudicationStatus',
	'matchedReferenceId',
] as const;

export type CsvRow = Record<(typeof CSV_HEADERS)[number], string>;

export type ExportError = { status: number; message: string };

/** Parses the comma-separated `RESEARCHER_USER_IDS` env var into a list. */
export function parseResearcherIds(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(',')
		.map((id) => id.trim())
		.filter((id) => id.length > 0);
}

export type ActiveRaterMembership = { reviewer: string; round: string; active: boolean };

/** Active independent rounds cannot read shared/raw research datasets. */
export function isActiveRater(userId: string, memberships: ActiveRaterMembership[]): boolean {
	return memberships.some((membership) => membership.reviewer === userId && membership.active && (membership.round === '1' || membership.round === '2'));
}

/** Fail closed when membership state cannot be determined. */
export async function isActiveRaterForAssignment(userId: string, assignmentId: string): Promise<boolean> {
	try {
		const rows = await pocketbaseAdmin.listRecords<ActiveRaterMembership>('research_rater_assignments', {
			filter: `assignment="${assignmentId}" && reviewer="${userId}" && active=true`, perPage: 3,
		});
		return isActiveRater(userId, rows.items);
	} catch {
		return true;
	}
}

/**
 * True when the caller may export this assignment's research data: the
 * assignment owner, or a user explicitly allowlisted as a researcher.
 */
export function isAuthorizedExporter(
	userId: string,
	assignmentOwnerId: string,
	researcherUserIds: string[],
): boolean {
	if (!userId || !assignmentOwnerId) return false;
	if (userId === assignmentOwnerId) return true;
	return researcherUserIds.includes(userId);
}

/**
 * Assigns stable pseudonymous participant ids (P001, P002, …) in order of
 * first appearance. The input `keys` are the real participant keys (e.g. a
 * student user id, or `public:<submissionId>` for anonymous public
 * participants); the returned map is the only place the real key appears and
 * it is never serialized into the export.
 */
export function assignParticipantIds(keys: string[]): Map<string, string> {
	const map = new Map<string, string>();
	let n = 1;
	for (const key of keys) {
		if (!key || map.has(key)) continue;
		map.set(key, `P${String(n).padStart(3, '0')}`);
		n += 1;
	}
	return map;
}

/**
 * Escapes one CSV field per RFC 4180: fields containing a comma, double quote,
 * newline, or carriage return are wrapped in double quotes, and every inner
 * double quote is doubled. Booleans render as `true`/`false`; null/undefined
 * as the empty string.
 */
export function csvEscape(value: unknown): string {
	let text: string;
	if (value === null || value === undefined) {
		text = '';
	} else if (typeof value === 'boolean') {
		text = value ? 'true' : 'false';
	} else if (typeof value === 'number') {
		text = Number.isFinite(value) ? String(value) : '';
	} else {
		text = String(value);
	}
	if (/[",\r\n]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

/** Builds the full CSV document from ordered rows. */
export function buildCsv(rows: CsvRow[]): string {
	const lines = [CSV_HEADERS.join(',')];
	for (const row of rows) {
		lines.push(CSV_HEADERS.map((header) => csvEscape(row[header])).join(','));
	}
	return lines.join('\r\n');
}

// ── Phase 10.3: export-local pseudonymous identifiers ─────────────────────

/**
 * The entity kinds that receive export-local pseudonymous ids. Each kind has
 * its OWN prefix and counter, so two different entity types can never collide
 * on the same pseudonymous id (e.g. a participant P001 and a feedback item
 * F001 are always distinguishable).
 */
export type PseudonymKind =
	| 'participant'
	| 'submission'
	| 'feedbackItem'
	| 'referenceError'
	| 'reviewer'
	| 'evaluation'
	| 'assignment';

const PSEUDONYM_PREFIX: Record<PseudonymKind, string> = {
	participant: 'P',
	submission: 'S',
	feedbackItem: 'F',
	referenceError: 'R',
	reviewer: 'RV',
	evaluation: 'EV',
	assignment: 'A',
};

/**
 * A stable, type-separated pseudonymizer for one export snapshot. Each kind
 * maintains its own counter and map; ids are assigned in order of first
 * appearance and are stable for the lifetime of the snapshot. Empty raw ids
 * map to '' (never pseudonymized). The raw internal id is NEVER exposed in
 * the external export.
 */
export type Pseudonymizer = {
	/** Returns the stable pseudonymous id for one raw internal id (or ''). */
	pseudonymize: (kind: PseudonymKind, rawId: string) => string;
	/** The number of distinct pseudonymous ids assigned for one kind. */
	count: (kind: PseudonymKind) => number;
};

export function createPseudonymizer(): Pseudonymizer {
	const maps = new Map<PseudonymKind, Map<string, string>>();
	const counters = new Map<PseudonymKind, number>();
	for (const kind of Object.keys(PSEUDONYM_PREFIX) as PseudonymKind[]) {
		maps.set(kind, new Map());
		counters.set(kind, 0);
	}
	const pseudonymize = (kind: PseudonymKind, rawId: string): string => {
		const id = (rawId || '').trim();
		if (!id) return '';
		const map = maps.get(kind)!;
		const existing = map.get(id);
		if (existing) return existing;
		const n = (counters.get(kind) ?? 0) + 1;
		counters.set(kind, n);
		const pseudo = `${PSEUDONYM_PREFIX[kind]}${String(n).padStart(3, '0')}`;
		map.set(id, pseudo);
		return pseudo;
	};
	const count = (kind: PseudonymKind) => maps.get(kind)?.size ?? 0;
	return { pseudonymize, count };
}

/**
 * Phase 10.3 — deterministic dataset snapshot identifier.
 *
 * A snapshot id distinguishes one dataset snapshot from another when records
 * or annotation states change. It is a SHA-256 hash over the STABLE, sorted
 * content of the exported research records (item ids, origins, judgments,
 * alignment, provenance, rater judgments) — NOT over the current time alone.
 * Two exports of the same record/annotation state produce the same snapshot
 * id; any change to the underlying research evidence produces a different
 * one. Previous exports are never retroactively modified.
 *
 * Phase 10.4 — upgraded from the non-cryptographic DJB2 hash to SHA-256
 * (Node's `node:crypto`, available in the server runtime) for a
 * collision-resistant, deterministic identifier. Historical snapshot ids
 * produced by the prior DJB2 implementation are not re-computed — they remain
 * valid identifiers for their already-exported snapshots.
 */
export function computeDatasetSnapshotId(records: {
	id: string;
	origin: string;
	detectionJudgment: string;
	correctionJudgment: string;
	explanationJudgment: string;
	adjudicationStatus: string;
	matchedReferenceId: string;
	raterJudgments?: unknown;
	evaluation?: string;
}[]): string {
	const lines = records
		.map((r) =>
			[
				r.id,
				r.origin,
				r.detectionJudgment || '',
				r.correctionJudgment || '',
				r.explanationJudgment || '',
				r.adjudicationStatus || '',
				r.matchedReferenceId || '',
				r.evaluation || '',
				typeof r.raterJudgments === 'string'
					? r.raterJudgments
					: JSON.stringify(r.raterJudgments ?? []),
			].join('|'),
		)
		.sort()
		.join('\n');
	const hash = createHash('sha256').update(lines, 'utf8').digest('hex');
	return `snap_${hash.slice(0, 24)}`;
}


type RawItem = Record<string, unknown>;

type EvaluationRecord = {
	id: string;
	submission: string;
	publicSubmission: string;
	model: string;
	modelVersion: string;
	promptVersion: string;
	systemPromptVersion: string;
	researchSchemaVersion: number | null;
	inputTextHash: string;
	outputHash: string;
	generationDurationMs: number | null;
	usedStudentText: boolean;
	usedImages: boolean;
	usedCourseMaterial: boolean;
	usedRubric: boolean;
	usedCefr: boolean;
	generatedAt: string;
	rawOutput: string;
	recommendedScore: number | null;
	summary: string;
	citations: unknown;
	/** Phase 11 — the AI draft's own validated findings JSON, used to enrich
	 *  historical `ai_feedback_items` rows that predate source-field copy. */
	findings: unknown;
	reviewFindings?: unknown;
	researchSnapshot?: unknown;
	generationHistory?: unknown;
};

type SubmissionRecord = { id: string; owner: string };

type PersonalizationLogRow = {
	id: string;
	assignment: string;
	learnerKey: string;
	feedbackItemId: string;
	learnerProfileVersion: string;
	personalizationEnabled: boolean;
	relevantCategories: unknown;
	historicalObservationCount: number;
	feedbackStrategy: string;
	hintLevel: number;
	model: string;
	modelVersion: string;
	promptVersion: string;
	generatedAt: string;
};

/** Loads every personalization_logs row for one assignment (paginated). */
async function loadPersonalizationLogs(assignmentId: string): Promise<PersonalizationLogRow[]> {
	const rows: PersonalizationLogRow[] = [];
	let page = 1;
	for (;;) {
		const result = await pocketbaseAdmin.listRecords<PersonalizationLogRow>('personalization_logs', {
			page,
			perPage: 500,
			filter: `assignment="${assignmentId}"`,
			sort: 'created',
		});
		rows.push(...result.items);
		if (result.items.length < 500) break;
		page += 1;
		if (page > 50) break;
	}
	return rows;
}

/** Loads every ai_feedback_items row for one assignment (paginated). */
async function loadFeedbackItems(assignmentId: string): Promise<RawItem[]> {
	const items: RawItem[] = [];
	let page = 1;
	for (;;) {
		const result = await pocketbaseAdmin.listRecords<RawItem>('ai_feedback_items', {
			page,
			perPage: 500,
			filter: `assignment="${assignmentId}"`,
			sort: 'created',
		});
		items.push(...result.items);
		if (result.items.length < 500) break;
		page += 1;
		if (page > 50) break; // hard cap — 25k items is well beyond any one course
	}
	return items;
}

/** Loads the evaluations referenced by the feedback items, keyed by id. */
async function loadEvaluations(evalIds: string[]): Promise<Map<string, EvaluationRecord>> {
	const map = new Map<string, EvaluationRecord>();
	for (const id of evalIds) {
		if (!id || map.has(id)) continue;
		try {
			const row = await pocketbaseAdmin.getRecord<EvaluationRecord>('ai_evaluations', id);
			map.set(id, row);
		} catch {
			/* a deleted evaluation leaves its items orphaned — skip provenance */
		}
	}
	return map;
}

/** Loads enrolled submissions (for their student owner), keyed by id. */
async function loadSubmissions(submissionIds: string[]): Promise<Map<string, SubmissionRecord>> {
	const map = new Map<string, SubmissionRecord>();
	for (const id of submissionIds) {
		if (!id || map.has(id)) continue;
		try {
			const row = await pocketbaseAdmin.getRecord<SubmissionRecord>('assignment_submissions', id);
			map.set(id, row);
		} catch {
			/* a deleted submission leaves its items orphaned — owner stays '' */
		}
	}
	return map;
}

export type ReviewDecision = { status: string; rejectReason: string };

/** Resolve saved lecturer decision without losing rejects when notes were edited. */
export function resolveReviewDecision(
	reviewFindings: unknown,
	sourceFinding: Pick<EvalFinding, 'severity' | 'quote' | 'note' | 'category' | 'subcategory'>,
	sourceIndex: number,
): ReviewDecision {
	if (!Array.isArray(reviewFindings)) return { status: '', rejectReason: '' };
	const aiRows = reviewFindings.filter(
		(row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row) && row.source === 'ai',
	);
	const indexMatch = aiRows.find((row) => row.id === `ai-${sourceIndex}`);
	if (!indexMatch && aiRows.some((row) => typeof row.id === 'string' && /^ai-\d+$/.test(row.id))) {
		return { status: '', rejectReason: '' };
	}
	const fingerprintMatch = aiRows.find((row) => {
		if (typeof row.severity !== 'string' || typeof row.quote !== 'string' || typeof row.note !== 'string') return false;
		return findingFingerprint({ severity: row.severity, quote: row.quote, note: row.note, category: str(row.category), subcategory: str(row.subcategory) }) === findingFingerprint(sourceFinding);
	});
	const row = indexMatch || fingerprintMatch;
	if (!row) return { status: '', rejectReason: '' };
	const allowed = new Set(['pending', 'approved', 'edited', 'rejected']);
	const status = typeof row.status === 'string' && allowed.has(row.status) ? row.status : '';
	return { status, rejectReason: status === 'rejected' ? str(row.rejectReason) : '' };
}

/** Export the review layer as a separate, linked record set. */
export function serializeReviewFindings(reviewFindings: unknown, sourceFindings: EvalFinding[]) {
	if (!Array.isArray(reviewFindings)) return [];
	return reviewFindings.flatMap((value) => {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
		const row = value as Record<string, unknown>;
		const source = row.source === 'ai' ? 'ai' : row.source === 'lecturer' ? 'lecturer' : '';
		if (!source) return [];
		const sourceIndex = typeof row.id === 'string' ? Number(/^ai-(\d+)$/.exec(row.id)?.[1]) : NaN;
		const sourceFinding = source === 'ai' && Number.isInteger(sourceIndex) ? sourceFindings[sourceIndex] : undefined;
		const parentAiFindingId = sourceFinding ? findingFingerprint(sourceFinding) : '';
		const status = ['pending', 'approved', 'edited', 'rejected', 'manual'].includes(str(row.status)) ? str(row.status) : '';
		return [{
			origin: source,
			parentAiFindingId,
			status,
			quote: str(row.quote),
			note: str(row.note),
			criterion: str(row.criterion),
			rejectReason: status === 'rejected' ? str(row.rejectReason) : '',
		}];
	});
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number | null =>
	typeof value === 'number' && Number.isFinite(value) ? value : null;
const bool = (value: unknown): boolean => value === true;

/**
 * Phase 11 — the resolved AI-origin content fields for one exported feedback
 * item. Every field is the ACTUAL source-finding value, never an invented
 * placeholder. `quoteStart`/`quoteEnd`/`aiConfidence` are `null` when absent
 * (unknown); a real `0` is preserved and distinguished from absent.
 */
export type ResolvedAiItemFields = {
	quote: string;
	quoteStart: number | null;
	quoteEnd: number | null;
	anchorValid: boolean;
	anchorError: string;
	aiSeverity: string;
	aiCategory: string;
	aiSubcategory: string;
	aiNote: string;
	aiCorrection: string;
	aiExplanation: string;
	aiCriterion: string;
	aiConfidence: number | null;
	parentAiFindingId: string;
};

/**
 * Phase 11 — resolves the AI-origin content fields for one feedback item,
 * preferring the item's OWN stored fields (populated at annotation-save time
 * since Phase 11) and falling back to the ORIGINAL AI finding (looked up by
 * `parentAiFindingId` fingerprint) for historical rows saved before the
 * source fields were copied. Nothing is invented: when neither the item nor
 * the source finding has a value, the field stays empty/null.
 *
 * The original quote is NEVER silently emptied and the confidence is NEVER
 * zeroed — a real `0` confidence and a `0` offset are preserved exactly.
 * `anchorValid` prefers the item's stored value (re-validated at save time
 * against the versioned text); when absent it falls back to the source
 * finding's generation-time anchor state.
 */
export function resolveAiItemFields(
	item: Record<string, unknown>,
	sourceFinding: EvalFinding | null,
): ResolvedAiItemFields {
	const itemQuote = str(item.quote);
	const itemStart = num(item.quoteStart);
	const itemEnd = num(item.quoteEnd);
	const itemAnchorValid = item.anchorValid;
	const itemConfidence = num(item.aiConfidence);

	// Prefer the item's stored quote; fall back to the source finding's.
	const quote = itemQuote || (sourceFinding ? sourceFinding.quote : '');

	// Offsets: prefer the item's stored offsets; fall back to the source
	// finding's. A real 0 is preserved (num() returns 0, not null).
	const quoteStart =
		itemStart != null
			? itemStart
			: sourceFinding && typeof sourceFinding.quoteStart === 'number'
				? sourceFinding.quoteStart
				: null;
	const quoteEnd =
		itemEnd != null
			? itemEnd
			: sourceFinding && typeof sourceFinding.quoteEnd === 'number'
				? sourceFinding.quoteEnd
				: null;

	// anchorValid: prefer the item's stored boolean; fall back to the source
	// finding's. When neither is present, default to false only when there is
	// a quote that could not be anchored — otherwise true (general finding).
	const anchorValid =
		typeof itemAnchorValid === 'boolean'
			? itemAnchorValid
			: sourceFinding
				? sourceFinding.anchorValid !== false
				: !quote;

	return {
		quote,
		quoteStart,
		quoteEnd,
		anchorValid,
		anchorError: str(item.anchorError),
		aiSeverity: str(item.aiSeverity) || (sourceFinding ? sourceFinding.severity : ''),
		aiCategory: str(item.aiCategory) || (sourceFinding ? sourceFinding.category || '' : ''),
		aiSubcategory: str(item.aiSubcategory) || (sourceFinding ? sourceFinding.subcategory || '' : ''),
		aiNote: str(item.aiNote) || (sourceFinding ? sourceFinding.note : ''),
		aiCorrection: str(item.aiCorrection) || (sourceFinding ? sourceFinding.correction || '' : ''),
		aiExplanation: str(item.aiExplanation) || (sourceFinding ? sourceFinding.explanation || '' : ''),
		aiCriterion: str(item.aiCriterion) || (sourceFinding ? sourceFinding.criterion || '' : ''),
		aiConfidence:
			itemConfidence != null
				? itemConfidence
				: sourceFinding && typeof sourceFinding.confidence === 'number'
					? sourceFinding.confidence
					: null,
		parentAiFindingId: str(item.parentAiFindingId),
	};
}

/**
 * The real participant key for one feedback item — the enrolled student's
 * user id when available, otherwise a deterministic `public:<submissionId>`
 * key for an anonymous public participant. This key is NEVER exported; it is
 * only fed to `assignParticipantIds` to produce the pseudonymous P00x id.
 */
function participantKeyFor(
	item: RawItem,
	evaluation: EvaluationRecord | undefined,
	submissions: Map<string, SubmissionRecord>,
): string {
	const submissionId = str(item.submission) || (evaluation ? evaluation.submission : '');
	if (submissionId) {
		const owner = submissions.get(submissionId)?.owner;
		if (owner) return owner;
	}
	if (evaluation && evaluation.publicSubmission) {
		return `public:${evaluation.publicSubmission}`;
	}
	return `anon:${str(item.id)}`;
}

export type ResearchExport = {
	csv: string;
	json: string;
	filename: string;
	itemCount: number;
	participantCount: number;
};

export type ExportInput = {
	assignmentId: string;
	format: 'csv' | 'json';
};

/**
 * Authorizes the caller and builds the research export for one assignment.
 * Never writes, never modifies grades. Returns the CSV and JSON documents
 * plus a download filename; the route picks the requested format.
 */
export async function buildResearchExport(
	request: Request,
	input: ExportInput,
): Promise<{ error: ExportError } | ResearchExport> {
	const assignmentId = (input.assignmentId || '').trim();
	if (!SAFE_ID.test(assignmentId)) {
		return { error: { status: 422, message: 'assignmentId tidak valid.' } };
	}

	const auth = await authenticateUser(request);
	if ('error' in auth) return { error: auth.error };
	const { user } = auth;

	let assignment: Assignment;
	try {
		assignment = await pocketbaseAdmin.getRecord<Assignment>('assignments', assignmentId);
	} catch {
		return { error: { status: 404, message: 'Tugas tidak ditemukan.' } };
	}

	const researcherIds = parseResearcherIds(process.env.RESEARCHER_USER_IDS);
	if (!isAuthorizedExporter(user.id, assignment.owner, researcherIds)) {
		return {
			error: {
				status: 403,
				message: 'Hanya pemilik tugas atau peneliti yang diotorisasi yang dapat mengekspor data riset.',
			},
		};
	}
	if (await isActiveRaterForAssignment(user.id, assignmentId)) {
		return { error: { status: 403, message: 'Rater aktif tidak dapat mengakses ekspor data riset selama putaran independen.' } };
	}

	// CEFR level comes from the course code (the source of truth).
	let courseCode = '';
	let cefrLevel: string | null = null;
	try {
		const course = await pocketbaseAdmin.getRecord<{ code?: string }>('courses', assignment.course);
		courseCode = course.code || '';
		cefrLevel = extractCefrLevel(courseCode);
	} catch {
		/* no course — CEFR stays null */
	}

	const items = await loadFeedbackItems(assignmentId);

	const evalIds = Array.from(
		new Set(items.map((item) => str(item.evaluation)).filter((id) => id.length > 0)),
	);
	const evaluations = await loadEvaluations(evalIds);
	const submissionIds = Array.from(
		new Set(
			items
				.map((item) => str(item.submission))
				.concat(
					Array.from(evaluations.values()).map((evaluation) => evaluation.submission),
				),
		),
	).filter((id) => id.length > 0);
	const submissions = await loadSubmissions(submissionIds);

	// Pseudonymous participant ids, assigned in order of first appearance
	// (items are already sorted by created). The real keys never leave this map.
	const participantKeys = items.map((item) =>
		participantKeyFor(item, evaluations.get(str(item.evaluation)), submissions),
	);
	const participantMap = assignParticipantIds(participantKeys);

	// Phase 10.3 — export-local pseudonymous ids for every entity. The raw
	// internal PocketBase record ids are NEVER exposed in the external export;
	// each entity kind gets its own prefix so different entities never collide.
	const pseudo = createPseudonymizer();
	// Seed the participant map into the pseudonymizer so participant ids stay
	// stable and consistent with the legacy P00x assignment order.
	for (const key of participantKeys) {
		const legacy = participantMap.get(key) || '';
		if (legacy) pseudo.pseudonymize('participant', key);
	}
	const assignmentPseudo = pseudo.pseudonymize('assignment', assignment.id);

	// Phase 11 — per-evaluation map of fingerprint → original AI finding, so
	// historical `ai_feedback_items` rows (saved before source fields were
	// copied) are enriched from the AI draft's own `findings` column at export
	// time. Read-only: no record is mutated.
	const sourceFindingsByEval = new Map<string, EvalFinding[]>();
	for (const evaluation of evaluations.values()) {
		sourceFindingsByEval.set(evaluation.id, parseFindings(evaluation.findings));
	}
	const provenanceByEval = new Map<string, ReturnType<typeof serializeSnapshotProvenance>>();
	for (const evaluation of evaluations.values()) {
		provenanceByEval.set(evaluation.id, serializeSnapshotProvenance(evaluation));
	}

	// ── CSV rows ──
	const csvRows: CsvRow[] = items.map((item, index) => {
		const evaluation = evaluations.get(str(item.evaluation));
		const participantId = pseudo.pseudonymize('participant', participantKeys[index]);
		const rawSubmissionId = str(item.submission) || (evaluation ? evaluation.submission : '');
		const submissionId = pseudo.pseudonymize('submission', rawSubmissionId);
		const evalFindings = evaluation ? sourceFindingsByEval.get(evaluation.id) ?? [] : [];
		const sourceFinding = findSourceFindingByFingerprint(
			evalFindings,
			str(item.parentAiFindingId),
		);
		const ai = resolveAiItemFields(item, sourceFinding);
		const sourceIndex = sourceFinding ? evalFindings.indexOf(sourceFinding) : -1;
		const decision = sourceIndex >= 0 && evaluation
			? resolveReviewDecision(evaluation.reviewFindings, sourceFinding!, sourceIndex)
			: { status: '', rejectReason: '' };
		const provenance = (evaluation && provenanceByEval.get(evaluation.id)) || serializeSnapshotProvenance({});
		const snapshotHashes = (provenance.researchSnapshot?.hashes ?? {}) as Record<string, string>;
		return {
			participantId,
			submissionId,
			assignmentId: assignmentPseudo,
			taskId: assignmentPseudo,
			cefrLevel: cefrLevel || '',
			model: evaluation?.model || '',
			modelVersion: evaluation?.modelVersion || '',
			promptVersion: evaluation?.promptVersion || '',
			researchSchemaVersion:
				evaluation?.researchSchemaVersion != null
					? String(evaluation.researchSchemaVersion)
					: '',
			evaluationGenerationId: provenance.researchSnapshot?.generationId ?? 'unknown',
			snapshotHash: provenance.researchSnapshot?.snapshotHash ?? '',
			studentTextHash: snapshotHashes.studentText || evaluation?.inputTextHash || '',
			outputHash: evaluation?.outputHash || '',
			feedbackItemId: pseudo.pseudonymize('feedbackItem', str(item.id)),
			origin: str(item.origin),
			quote: ai.quote,
			quoteStart: ai.quoteStart != null ? String(ai.quoteStart) : '',
			quoteEnd: ai.quoteEnd != null ? String(ai.quoteEnd) : '',
			anchorValid: ai.anchorValid ? 'true' : 'false',
			anchorError: ai.anchorError,
			aiCategory: ai.aiCategory,
			aiSubcategory: ai.aiSubcategory,
			aiSeverity: ai.aiSeverity,
			aiNote: ai.aiNote,
			aiCorrection: ai.aiCorrection,
			aiExplanation: ai.aiExplanation,
			aiCriterion: ai.aiCriterion,
			aiConfidence: ai.aiConfidence != null ? String(ai.aiConfidence) : '',
			parentAiFindingId: ai.parentAiFindingId,
			reviewStatus: decision.status,
			rejectReason: decision.rejectReason,
			referenceCategory: str(item.referenceCategory),
			referenceSubcategory: str(item.referenceSubcategory),
			referenceSeverity: str(item.referenceSeverity),
			referenceCorrection: str(item.referenceCorrection),
			referenceExplanation: str(item.referenceExplanation),
			errorPresent: str(item.errorPresent),
			detectionJudgment: str(item.detectionJudgment),
			correctionJudgment: str(item.correctionJudgment),
			explanationJudgment: str(item.explanationJudgment),
			completenessJudgment: str(item.completenessJudgment),
			necessityJudgment: str(item.necessityJudgment),
			pedagogicalJudgment: str(item.pedagogicalJudgment),
			reviewer: pseudo.pseudonymize('reviewer', str(item.reviewer)),
			reviewedAt: str(item.reviewedAt),
			adjudicationStatus: str(item.adjudicationStatus),
			matchedReferenceId: pseudo.pseudonymize('referenceError', str(item.matchedReferenceId)),
		};
	});

	// ── JSON payload (complete research records) ──
	const evaluationPayloads = Array.from(evaluations.values()).map((evaluation) => {
		const submissionId = evaluation.submission;
		const owner = submissionId ? submissions.get(submissionId)?.owner : '';
		const participantKey = owner
			? owner
			: evaluation.publicSubmission
				? `public:${evaluation.publicSubmission}`
				: `anon:${evaluation.id}`;
		const provenance = serializeSnapshotProvenance(evaluation);
		return {
			id: pseudo.pseudonymize('evaluation', evaluation.id),
			participantId: pseudo.pseudonymize('participant', participantKey),
			submissionId: pseudo.pseudonymize(
				'submission',
				evaluation.submission || evaluation.publicSubmission,
			),
			channel: evaluation.submission ? 'enrolled' : 'public',
			provenance: {
				model: evaluation.model || 'unknown',
				modelVersion: evaluation.modelVersion || 'unknown',
				promptVersion: evaluation.promptVersion || '',
				systemPromptVersion: evaluation.systemPromptVersion || '',
				researchSchemaVersion: evaluation.researchSchemaVersion,
				inputTextHash: evaluation.inputTextHash || '',
				outputHash: evaluation.outputHash || '',
				generationDurationMs: evaluation.generationDurationMs,
				usedStudentText: bool(evaluation.usedStudentText),
				usedImages: bool(evaluation.usedImages),
				usedCourseMaterial: bool(evaluation.usedCourseMaterial),
				usedRubric: bool(evaluation.usedRubric),
				usedCefr: bool(evaluation.usedCefr),
				generatedAt: evaluation.generatedAt || '',
			},
			rawModelOutput: evaluation.rawOutput || '',
			citations: evaluation.citations ?? [],
			recommendedScore: evaluation.recommendedScore,
			summary: evaluation.summary || '',
			reviewFindings: serializeReviewFindings(evaluation.reviewFindings, parseFindings(evaluation.findings)),
			researchSnapshot: provenance.researchSnapshot,
			generationHistory: provenance.generationHistory,
			generationId: provenance.researchSnapshot?.generationId ?? 'unknown',
		};
	});

	// Phase 10 — personalization provenance logs (generic vs personalized
	// comparison). Learner keys are pseudonymized through the same pseudonymizer;
	// no raw student id, name, or email is exported.
	const personalizationLogs = await loadPersonalizationLogs(assignmentId);
	const personalizationPayload = personalizationLogs.map((log) => {
		const rawLearnerId = log.learnerKey.startsWith('u:') ? log.learnerKey.slice(2) : '';
		const participantId = rawLearnerId ? pseudo.pseudonymize('participant', rawLearnerId) : '';
		return {
			id: pseudo.pseudonymize('feedbackItem', log.id),
			participantId,
			feedbackItemId: pseudo.pseudonymize('feedbackItem', log.feedbackItemId),
			learnerProfileVersion: log.learnerProfileVersion,
			personalizationEnabled: log.personalizationEnabled,
			relevantCategories: log.relevantCategories ?? [],
			historicalObservationCount: log.historicalObservationCount,
			feedbackStrategy: log.feedbackStrategy,
			hintLevel: log.hintLevel,
			model: log.model,
			modelVersion: log.modelVersion,
			promptVersion: log.promptVersion,
			generatedAt: log.generatedAt,
		};
	});

	// Phase 10.3 — deterministic snapshot id over the stable research record
	// content (ids, origins, judgments, alignment, provenance, rater judgments).
	const snapshotId = computeDatasetSnapshotId(
		items.map((item) => ({
			id: str(item.id),
			origin: str(item.origin),
			detectionJudgment: str(item.detectionJudgment),
			correctionJudgment: str(item.correctionJudgment),
			explanationJudgment: str(item.explanationJudgment),
			adjudicationStatus: str(item.adjudicationStatus),
			matchedReferenceId: str(item.matchedReferenceId),
			raterJudgments: item.raterJudgments,
			evaluation: str(item.evaluation),
		})),
	);

	const jsonPayload = {
		exportedAt: new Date().toISOString(),
		exportGeneratedAt: new Date().toISOString(),
		datasetSnapshotId: snapshotId,
		researchDatasetVersion: RESEARCH_DATASET_VERSION,
		researchSchemaVersion: EXPORT_RESEARCH_SCHEMA_VERSION,
		format: 'laras-research-export-v3',
		assignment: {
			id: assignmentPseudo,
			title: assignment.title,
			shape: assignment.shape || '',
			mode: assignment.mode || '',
			activityType: assignment.activityType || 'formal',
			instructions: assignment.instructions || '',
			requirements: assignment.requirements || '',
			courseCode,
			cefrLevel: cefrLevel || null,
			feedbackMode: (assignment as Assignment).feedbackMode || 'generic',
			personalizationThreshold: (assignment as Assignment).personalizationThreshold ?? null,
		},
		participantCount: pseudo.count('participant'),
		itemCount: items.length,
		evaluations: evaluationPayloads,
		items: items.map((item, index) => {
			const evaluation = evaluations.get(str(item.evaluation));
			const rawSubmissionId = str(item.submission) || (evaluation ? evaluation.submission : '');
			const evalFindings = evaluation ? sourceFindingsByEval.get(evaluation.id) ?? [] : [];
			const sourceFinding = findSourceFindingByFingerprint(
				evalFindings,
				str(item.parentAiFindingId),
			);
			const ai = resolveAiItemFields(item, sourceFinding);
			const provenance = (evaluation && provenanceByEval.get(evaluation.id)) || serializeSnapshotProvenance({});
			const snapshotHashes = (provenance.researchSnapshot?.hashes ?? {}) as Record<string, string>;
			return {
				feedbackItemId: pseudo.pseudonymize('feedbackItem', str(item.id)),
				participantId: pseudo.pseudonymize('participant', participantKeys[index]),
				evaluationGenerationId: provenance.researchSnapshot?.generationId ?? 'unknown',
				snapshotHash: provenance.researchSnapshot?.snapshotHash ?? '',
				studentTextHash: snapshotHashes.studentText || evaluation?.inputTextHash || '',
				outputHash: evaluation?.outputHash || '',
				evaluationId: pseudo.pseudonymize('evaluation', str(item.evaluation)),
				submissionId: pseudo.pseudonymize('submission', rawSubmissionId),
				origin: str(item.origin),
				quote: ai.quote,
				quoteStart: ai.quoteStart,
				quoteEnd: ai.quoteEnd,
				anchorValid: ai.anchorValid,
				anchorError: ai.anchorError,
				aiCategory: ai.aiCategory,
				aiSubcategory: ai.aiSubcategory,
				aiSeverity: ai.aiSeverity,
				aiNote: ai.aiNote,
				aiCorrection: ai.aiCorrection,
				aiExplanation: ai.aiExplanation,
				aiCriterion: ai.aiCriterion,
				aiConfidence: ai.aiConfidence,
				referenceCategory: str(item.referenceCategory),
				referenceSubcategory: str(item.referenceSubcategory),
				referenceSeverity: str(item.referenceSeverity),
				referenceCorrection: str(item.referenceCorrection),
				referenceExplanation: str(item.referenceExplanation),
				errorPresent: str(item.errorPresent),
				detectionJudgment: str(item.detectionJudgment),
				correctionJudgment: str(item.correctionJudgment),
				explanationJudgment: str(item.explanationJudgment),
				completenessJudgment: str(item.completenessJudgment),
				necessityJudgment: str(item.necessityJudgment),
				pedagogicalJudgment: str(item.pedagogicalJudgment),
				reviewer: pseudo.pseudonymize('reviewer', str(item.reviewer)),
				reviewedAt: str(item.reviewedAt),
				adjudicationStatus: str(item.adjudicationStatus),
				reviewerNote: str(item.reviewerNote),
				parentAiFindingId: ai.parentAiFindingId,
				matchedReferenceId: pseudo.pseudonymize('referenceError', str(item.matchedReferenceId)),
				raterJudgments: parseRaterJudgments(item.raterJudgments).map((r) => ({
					...r,
					reviewer: pseudo.pseudonymize('reviewer', r.reviewer),
				})),
				created: str(item.created),
			};
		}),
		personalizationLogs: personalizationPayload,
	};

	const csv = buildCsv(csvRows);
	const json = JSON.stringify(jsonPayload, null, 2);
	const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
	const filename = `laras-research-${assignment.id}-${stamp}`;

	return {
		csv,
		json,
		filename,
		itemCount: items.length,
		participantCount: pseudo.count('participant'),
	};
}
