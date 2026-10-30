/**
 * Research annotations are separate from grades, draft review and publishing.
 * Access requires an explicit assignment/round membership. Raw feedback items
 * have server-only reads; POST research loading projects only the caller's
 * independent judgment, or completed original pairs for the adjudicator.
 * Original submitted judgments are immutable. Shared judgment columns hold
 * adjudication only (never the latest independent rater's private answers).
 */
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { loadResearchTarget, type ResearchTargetBody } from '@/lib/research-target.server';
import { authenticateUser } from '@/lib/context-retrieval.server';
import { parseFindings, sanitizeTaxonomy, validateFindingAnchor, type EvalFinding } from '@/lib/ai-evaluation';
import { appendRaterJudgment, parseRaterJudgments, validateRaterIndependence, type RaterRound } from '@/lib/research-rater';
import { findSourceFindingByFingerprint } from '@/lib/research-annotation';
import {
	COMPLETENESS_JUDGMENT_OPTIONS,
	CORRECTION_JUDGMENT_OPTIONS,
	DETECTION_JUDGMENT_OPTIONS,
	ERROR_PRESENT_OPTIONS,
	EXPLANATION_JUDGMENT_OPTIONS,
	NECESSITY_JUDGMENT_OPTIONS,
	PEDAGOGICAL_JUDGMENT_OPTIONS,
	REFERENCE_SEVERITY_OPTIONS,
	type AdjudicationStatus,
	type CompletenessJudgment,
	type CorrectionJudgment,
	type DetectionJudgment,
	type ErrorPresent,
	type ExplanationJudgment,
	type NecessityJudgment,
	type PedagogicalJudgment,
	type ReferenceSeverity,
} from '@/lib/research-annotation';

const FINGERPRINT_RE = /^fp_[a-z0-9]{1,20}$/;
const SHORT_TEXT_MAX = 2000;

const ERROR_PRESENT_SET = new Set<ErrorPresent>(ERROR_PRESENT_OPTIONS);
const DETECTION_SET = new Set<DetectionJudgment>(DETECTION_JUDGMENT_OPTIONS);
const CORRECTION_SET = new Set<CorrectionJudgment>(CORRECTION_JUDGMENT_OPTIONS);
const EXPLANATION_SET = new Set<ExplanationJudgment>(EXPLANATION_JUDGMENT_OPTIONS);
const COMPLETENESS_SET = new Set<CompletenessJudgment>(COMPLETENESS_JUDGMENT_OPTIONS);
const NECESSITY_SET = new Set<NecessityJudgment>(NECESSITY_JUDGMENT_OPTIONS);
const PEDAGOGICAL_SET = new Set<PedagogicalJudgment>(PEDAGOGICAL_JUDGMENT_OPTIONS);
const REFERENCE_SEVERITY_SET = new Set<ReferenceSeverity>(REFERENCE_SEVERITY_OPTIONS);
const ADJUDICATION_SET = new Set<AdjudicationStatus>(['unreviewed', 'reviewed', 'adjudicated']);

function opt<T extends string>(value: unknown, allowed: Set<T>): T | '' {
	return typeof value === 'string' && allowed.has(value as T) ? (value as T) : '';
}
function text(value: unknown, max: number): string {
	return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Phase 11 — the AI-origin content fields copied from the source AI finding
 * into an `ai_feedback_items` row, with the anchor re-validated against the
 * versioned submission text. `anchorError` is a machine-readable reason when
 * `anchorValid` is false ('' when valid). Offsets are null when absent or
 * invalid; a real `0` offset is preserved (distinguished from absent).
 */
export type AiContentFields = {
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
};

/** Empty AI content fields — used when no source finding is available. */
export const EMPTY_AI_CONTENT_FIELDS: AiContentFields = {
	quote: '',
	quoteStart: null,
	quoteEnd: null,
	anchorValid: false,
	anchorError: '',
	aiSeverity: '',
	aiCategory: '',
	aiSubcategory: '',
	aiNote: '',
	aiCorrection: '',
	aiExplanation: '',
	aiCriterion: '',
	aiConfidence: null,
};

/**
 * Phase 11 — copies the source AI finding's structured fields and re-validates
 * its anchor against the versioned submission text. The original quote is
 * ALWAYS preserved (never silently emptied); the confidence is preserved as-is
 * (never zeroed). When the stored offsets disagree with the text, the anchor
 * is marked invalid with a machine-readable `anchorError` reason and the
 * offsets are dropped (null) so the export never emits misleading offsets.
 */
export function buildAiContentFields(
	finding: EvalFinding,
	sourceText: string,
): AiContentFields {
	const anchor = validateFindingAnchor(
		finding.quote,
		finding.quoteStart,
		finding.quoteEnd,
		sourceText,
	);
	return {
		quote: finding.quote,
		quoteStart: anchor.quoteStart,
		quoteEnd: anchor.quoteEnd,
		anchorValid: anchor.anchorValid,
		anchorError: anchor.anchorError,
		aiSeverity: finding.severity,
		aiCategory: finding.category || '',
		aiSubcategory: finding.subcategory || '',
		aiNote: finding.note,
		aiCorrection: finding.correction || '',
		aiExplanation: finding.explanation || '',
		aiCriterion: finding.criterion || '',
		aiConfidence:
			typeof finding.confidence === 'number' && Number.isFinite(finding.confidence)
				? finding.confidence
				: null,
	};
}

export type AnnotationSave = {
	errorPresent: ErrorPresent | '';
	detectionJudgment: DetectionJudgment | '';
	correctionJudgment: CorrectionJudgment | '';
	explanationJudgment: ExplanationJudgment | '';
	completenessJudgment: CompletenessJudgment | '';
	necessityJudgment: NecessityJudgment | '';
	pedagogicalJudgment: PedagogicalJudgment | '';
	referenceCategory: string;
	referenceSubcategory: string;
	referenceSeverity: ReferenceSeverity | '';
	referenceCorrection: string;
	referenceExplanation: string;
	reviewerNote: string;
	adjudicationStatus: AdjudicationStatus;
};

export type AnnotationBody = {
	intent?: unknown;
	submissionId?: unknown;
	publicSubmissionId?: unknown;
	findingFingerprint?: unknown;
	/** Explicit human candidate for independent confirmation/adjudication. */
	itemId?: unknown;
	/** Phase 10.3 — rater round: 1 (Rater 1), 2 (Rater 2), or 0 (adjudication).
	 *  Defaults to 1 when omitted (backward compatible with the existing UI). */
	round?: unknown;
	errorPresent?: unknown;
	detectionJudgment?: unknown;
	correctionJudgment?: unknown;
	explanationJudgment?: unknown;
	completenessJudgment?: unknown;
	necessityJudgment?: unknown;
	pedagogicalJudgment?: unknown;
	referenceCategory?: unknown;
	referenceSubcategory?: unknown;
	referenceSeverity?: unknown;
	referenceCorrection?: unknown;
	referenceExplanation?: unknown;
	reviewerNote?: unknown;
};

export type AnnotationError = { status: number; message: string };

/**
 * Authenticates an explicitly assigned research account and persists an
 * immutable original round judgment or a separate adjudication. The
 * AI draft's own columns and official grade/feedback are never touched.
 */
export async function saveResearchAnnotation(
	request: Request,
	body: AnnotationBody,
): Promise<{ error: AnnotationError } | { ok: true; id: string }> {
	const loaded = await loadResearchTarget(request, body);
	if ('error' in loaded) return { error: loaded.error };
	const { target } = loaded;

	const fingerprint =
		typeof body.findingFingerprint === 'string' ? body.findingFingerprint.trim() : '';
	const humanItemId = typeof body.itemId === 'string' && SAFE_ITEM_ID.test(body.itemId) ? body.itemId : '';
	if (humanItemId && body.findingFingerprint !== undefined) return { error: { status: 422, message: 'Provide one candidate selector, not both.' } };
	if (body.itemId !== undefined && !humanItemId) return { error: { status: 422, message: 'Invalid human candidate ID.' } };
	if (!humanItemId && !FINGERPRINT_RE.test(fingerprint)) {
		return { error: { status: 422, message: 'findingFingerprint tidak valid.' } };
	}

	const relationField = target.channel === 'enrolled' ? 'submission' : 'publicSubmission';
	let evaluationId = '';
	let sourceFinding: EvalFinding | null = null;
	try {
		const evalRow = (
			await pocketbaseAdmin.listRecords<{ id: string; findings: unknown }>('ai_evaluations', {
				perPage: 1,
				filter: `${relationField}="${target.recordId}"`,
				sort: '-created',
			})
		).items[0];
		evaluationId = evalRow?.id ?? '';
		// Phase 11 — resolve the ORIGINAL AI finding this annotation targets,
		// so its structured fields (quote, offsets, taxonomy, correction,
		// explanation, criterion, confidence) are copied into the
		// `ai_feedback_items` row and survive into the research export. The
		// AI draft's own `findings`/`rawOutput` columns are NEVER modified.
		if (evaluationId && evalRow) {
			sourceFinding = findSourceFindingByFingerprint(
				parseFindings(evalRow.findings),
				fingerprint,
			);
		}
	} catch {
		evaluationId = '';
	}
	if (!evaluationId) {
		return { error: { status: 404, message: 'Draf evaluasi AI tidak ditemukan untuk kiriman ini.' } };
	}

	// Phase 11 — copy the source AI finding's structured fields and re-validate
	// its anchor against the versioned submission text. A broken anchor is made
	// EXPLICIT (anchorValid=false + anchorError reason); the quote is never
	// silently emptied and the confidence is never zeroed. When no source
	// finding is found (draft pending/regenerated), the AI content fields stay
	// empty — nothing is invented.
	if (!humanItemId && !sourceFinding) return { error: { status: 422, message: 'Finding is not present in the source evaluation.' } };
	const aiContentFields = sourceFinding ? buildAiContentFields(sourceFinding, target.content) : {};

	// Sanitize the reference taxonomy the same way AI findings are — invalid
	// pairs become '' rather than being stored as ground truth.
	const tax = sanitizeTaxonomy(body.referenceCategory, body.referenceSubcategory);

	// Phase 10.3 — rater round. Phase 10.4: the round is now an EXPLICIT
	// selection from the UI role selector (Rater 1 / Rater 2 / Adjudicator).
	// It defaults to 1 ONLY when omitted, for backward compatibility with any
	// caller that has not been updated; the UI always sends an explicit round.
	const round = target.round;

	const judgmentFields = {
		errorPresent: opt(body.errorPresent, ERROR_PRESENT_SET),
		detectionJudgment: opt(body.detectionJudgment, DETECTION_SET),
		correctionJudgment: opt(body.correctionJudgment, CORRECTION_SET),
		explanationJudgment: opt(body.explanationJudgment, EXPLANATION_SET),
		completenessJudgment: opt(body.completenessJudgment, COMPLETENESS_SET),
		necessityJudgment: opt(body.necessityJudgment, NECESSITY_SET),
		pedagogicalJudgment: opt(body.pedagogicalJudgment, PEDAGOGICAL_SET),
		referenceCategory: tax.category,
		referenceSubcategory: tax.subcategory,
		referenceSeverity: opt(body.referenceSeverity, REFERENCE_SEVERITY_SET),
		referenceCorrection: text(body.referenceCorrection, SHORT_TEXT_MAX),
		referenceExplanation: text(body.referenceExplanation, SHORT_TEXT_MAX),
	};
	const reviewerNote = text(body.reviewerNote, SHORT_TEXT_MAX);

	// Only an explicit round-0 decision populates the canonical shared judgment.
	// Independent original answers live only in raterJudgments.
	const adjudicationStatus: AdjudicationStatus = round === 0 ? 'adjudicated' : 'reviewed';

	const payload: AnnotationSave = {
		...judgmentFields,
		reviewerNote,
		adjudicationStatus,
	};

	const now = new Date().toISOString();

	let lockId: string;
	try {
		const lock = await pocketbaseAdmin.createRecord<{ id: string }>('research_annotation_locks', {
			key: `${evaluationId}:${humanItemId || fingerprint}`,
		});
		lockId = lock.id;
	} catch (error) {
		const status = (error as { status?: number }).status;
		return { error: { status: status === 400 ? 409 : 503, message: 'Research finding busy or lock storage unavailable. Retry later.' } };
	}
	try {
	// Find the existing annotation row for this evaluation + finding. The
	// relation to the evaluation row is the stable link; the fingerprint
	// distinguishes one AI finding from another within the same evaluation.
	let existingId = '';
	let existingRaterJudgments: unknown = [];
	let legacyOriginal = false;
	type StoredItem = { id: string; raterJudgments?: unknown; reviewer?: string; reviewedAt?: string; adjudicationStatus?: string };
	const isLegacyOriginal = (item: StoredItem) => !parseRaterJudgments(item.raterJudgments).length &&
		!!(item.reviewer || item.reviewedAt || item.adjudicationStatus === 'reviewed' || item.adjudicationStatus === 'adjudicated');
	try {
		if (humanItemId) {
			const human = await pocketbaseAdmin.getRecord<StoredItem & { evaluation: string; assignment: string; origin: string }>('ai_feedback_items', humanItemId);
			if (human.origin !== 'human' || human.evaluation !== evaluationId || human.assignment !== target.assignment.id) {
				return { error: { status: 404, message: 'Human candidate not found for this evaluation.' } };
			}
			existingId = human.id;
			existingRaterJudgments = human.raterJudgments ?? [];
			legacyOriginal = isLegacyOriginal(human);
		} else {
		const existing = (
			await pocketbaseAdmin.listRecords<StoredItem>(
				'ai_feedback_items',
				{
					perPage: 1,
					filter: `evaluation="${evaluationId}" && parentAiFindingId="${fingerprint}"`,
				},
			)
		).items[0];
		existingId = existing?.id ?? '';
		existingRaterJudgments = existing?.raterJudgments ?? [];
		legacyOriginal = !!existing && isLegacyOriginal(existing);
		}
	} catch {
		return { error: { status: 503, message: 'Research history unavailable.' } };
	}

	// Phase 10.3 — append this rater's judgment to the immutable history. The
	// pure helper replaces only the SAME (round, reviewer) entry and never
	// touches a different rater's judgment, so Rater 2 never overwrites
	// Rater 1 and an adjudication never destroys independent judgments.
	const nextRaterJudgment = {
		round,
		reviewer: target.user.id,
		reviewedAt: now,
		...(reviewerNote ? { note: reviewerNote } : {}),
		...judgmentFields,
	};
	if (legacyOriginal) return { error: { status: 409, message: 'Legacy original requires an explicit provenance audit; it will not be overwritten.' } };
	const existingJudgments = parseRaterJudgments(existingRaterJudgments);
	if (existingJudgments.some((judgment) => judgment.round === round) ||
		(round !== 0 && existingJudgments.some((judgment) => judgment.round === 0))) {
		return { error: { status: 409, message: 'Submitted original judgments are immutable.' } };
	}

	// Phase 10.4 — enforce independent-rater identity SERVER-SIDE before any
	// write. A reviewer may not occupy two independent rounds, and an
	// adjudicator may not be the same person as Rater 1 or Rater 2. On
	// rejection the existing judgments are left completely untouched.
	const independence = validateRaterIndependence(existingJudgments, nextRaterJudgment);
	if (!independence.ok) {
		return { error: { status: 422, message: independence.message } };
	}

	if (round === 0) {
		const r1 = existingJudgments.find((judgment) => judgment.round === 1);
		const r2 = existingJudgments.find((judgment) => judgment.round === 2);
		if (!r1 || !r2 || r1.reviewer === r2.reviewer) {
			return { error: { status: 409, message: 'Adjudication requires two independent original ratings.' } };
		}
	}
	const updatedRaterJudgments = appendRaterJudgment(existingJudgments, nextRaterJudgment);

	const shared = {
		...Object.fromEntries(Object.keys(payload).map((key) => [key, ''])),
		adjudicationStatus,
		...(round === 0 ? payload : {}),
		...aiContentFields,
		reviewer: round === 0 ? target.user.id : '',
		reviewedAt: round === 0 ? now : '',
		raterJudgments: updatedRaterJudgments,
	};

	if (existingId) {
		await pocketbaseAdmin.updateRecord('ai_feedback_items', existingId, shared);
		return { ok: true, id: existingId };
	}

	const created = await pocketbaseAdmin.createRecord<{ id: string }>('ai_feedback_items', {
		evaluation: evaluationId,
		assignment: target.assignment.id,
		submission: target.channel === 'enrolled' ? target.recordId : '',
		owner: target.assignment.owner,
		parentAiFindingId: fingerprint,
		origin: 'ai',
		...shared,
	});
	return { ok: true, id: created.id };
	} finally {
		await pocketbaseAdmin.deleteRecord('research_annotation_locks', lockId);
	}
}

export { ADJUDICATION_SET };

/** Server-side whitelisting, not client-side hiding. No raw PB records escape. */
export async function loadResearchRatings(request: Request, body: AnnotationBody): Promise<
	{ error: AnnotationError } | { ok: true; round: RaterRound; assignedRound: RaterRound; evaluationId: string; content: string; findings: EvalFinding[]; items: Record<string, unknown>[] }
> {
	const loaded = await loadResearchTarget(request, body);
	if ('error' in loaded) return loaded;
	const { target } = loaded;
	const relationField = target.channel === 'enrolled' ? 'submission' : 'publicSubmission';
	const evaluation = (await pocketbaseAdmin.listRecords<{ id: string; findings: unknown }>('ai_evaluations', {
		filter: `${relationField}="${target.recordId}"`, sort: '-created', perPage: 1,
	})).items[0];
	if (!evaluation) return { error: { status: 404, message: 'AI evaluation not found.' } };
	const rows: Record<string, unknown>[] = [];
	for (let page = 1; ; page++) {
		const batch = await pocketbaseAdmin.listRecords<Record<string, unknown>>('ai_feedback_items', {
			filter: `evaluation="${evaluation.id}"`, page, perPage: 200,
		});
		rows.push(...batch.items);
		if (batch.items.length < 200) break;
	}
	const items = rows.flatMap((row) => {
		const originals = parseRaterJudgments(row.raterJudgments);
		const own = originals.filter((judgment) => judgment.round === target.round && judgment.reviewer === target.user.id);
		const r1 = originals.find((judgment) => judgment.round === 1);
		const r2 = originals.find((judgment) => judgment.round === 2);
		const ready = !!r1 && !!r2 && r1.reviewer !== r2.reviewer;
		if (target.round === 0 ? !ready : row.origin === 'human' && !own.length) return [];
		return [{
			id: row.id,
			origin: row.origin,
			parentAiFindingId: row.parentAiFindingId,
			...(row.origin === 'human' ? { quote: row.quote, quoteStart: row.quoteStart, quoteEnd: row.quoteEnd, anchorValid: row.anchorValid } : {}),
			raterJudgments: target.round === 0 ? originals : own,
		}];
	});
	return { ok: true as const, round: target.round, assignedRound: target.round, evaluationId: evaluation.id, content: target.content,
		findings: parseFindings(evaluation.findings), items };
}


// ── Phase 4: human-annotated missed errors (AI false negatives) ────────────

export type MissedErrorBody = {
	round?: unknown;
	submissionId?: unknown;
	publicSubmissionId?: unknown;
	quote?: unknown;
	referenceCategory?: unknown;
	referenceSubcategory?: unknown;
	referenceSeverity?: unknown;
	referenceCorrection?: unknown;
	referenceExplanation?: unknown;
	reviewerNote?: unknown;
};

const SAFE_ITEM_ID = /^[A-Za-z0-9]{5,40}$/;

/**
 * Phase 4 — saves a lecturer-annotated missed error (AI false negative) as a
 * separate `ai_feedback_items` row with `origin = 'human'`,
 * `detectionJudgment = 'missed'`, and `adjudicationStatus = 'reviewed'`.
 * This records one independent observation, NOT gold-standard adjudication.
 * Round 0 is forbidden here; use the explicit candidate review endpoint after
 * both independent originals exist for adjudication.
 *
 * The quote MUST be an exact substring of the student's own submitted text
 * (offsets are computed server-side); an empty quote is allowed only for a
 * genuinely global reference error. No AI content fields are populated — this
 * is never an AI finding. The record never affects the product score, the
 * official grade, feedback, or publishing; it exists solely to measure AI
 * recall. Permission: explicitly assigned account + round, formal task only.
 */
export async function saveMissedErrorAnnotation(
	request: Request,
	body: MissedErrorBody,
): Promise<{ error: AnnotationError } | { ok: true; id: string }> {
	const loaded = await loadResearchTarget(request, body);
	if ('error' in loaded) return { error: loaded.error };
	const { target } = loaded;

	const relationField = target.channel === 'enrolled' ? 'submission' : 'publicSubmission';
	let evaluationId = '';
	try {
		const evalRow = (
			await pocketbaseAdmin.listRecords<{ id: string }>('ai_evaluations', {
				perPage: 1,
				filter: `${relationField}="${target.recordId}"`,
				sort: '-created',
			})
		).items[0];
		evaluationId = evalRow?.id ?? '';
	} catch {
		evaluationId = '';
	}
	if (!evaluationId) {
		return { error: { status: 404, message: 'Draf evaluasi AI tidak ditemukan untuk kiriman ini.' } };
	}

	const quote = typeof body.quote === 'string' ? body.quote.trim() : '';
	let quoteStart = 0;
	let quoteEnd = 0;
	let anchorValid = false;
	if (quote) {
		if (quote.length > 300) {
			return { error: { status: 422, message: 'Kutipan terlalu panjang (maks 300 karakter).' } };
		}
		const idx = target.content.indexOf(quote);
		if (idx === -1) {
			return { error: { status: 422, message: 'Kutipan harus persis dari teks kiriman peserta.' } };
		}
		quoteStart = idx;
		quoteEnd = idx + quote.length;
		anchorValid = true;
	}

	const tax = sanitizeTaxonomy(body.referenceCategory, body.referenceSubcategory);
	const severity = opt(body.referenceSeverity, REFERENCE_SEVERITY_SET);
	if (!tax.category) {
		return { error: { status: 422, message: 'Kategori referensi wajib diisi.' } };
	}
	if (!severity) {
		return { error: { status: 422, message: 'Tingkat keparahan wajib diisi.' } };
	}

	const now = new Date().toISOString();
	if (target.round === 0) return { error: { status: 409, message: 'A single missed-error observation is not an adjudication.' } };
	const record = await pocketbaseAdmin.createRecord<{ id: string }>('ai_feedback_items', {
		evaluation: evaluationId,
		assignment: target.assignment.id,
		submission: target.channel === 'enrolled' ? target.recordId : '',
		owner: target.assignment.owner,
		parentAiFindingId: '',
		origin: 'human',
		quote,
		quoteStart,
		quoteEnd,
		anchorValid,
		detectionJudgment: 'missed',
		referenceCategory: tax.category,
		referenceSubcategory: tax.subcategory,
		referenceSeverity: severity,
		referenceCorrection: text(body.referenceCorrection, SHORT_TEXT_MAX),
		referenceExplanation: text(body.referenceExplanation, SHORT_TEXT_MAX),
		reviewerNote: text(body.reviewerNote, SHORT_TEXT_MAX),
		reviewer: target.user.id,
		reviewedAt: now,
		adjudicationStatus: 'reviewed',
		raterJudgments: [{
			round: target.round,
			reviewer: target.user.id,
			reviewedAt: now,
			detectionJudgment: 'missed',
			errorPresent: 'yes',
			referenceCategory: tax.category,
			referenceSubcategory: tax.subcategory,
			referenceSeverity: severity,
			referenceCorrection: text(body.referenceCorrection, SHORT_TEXT_MAX),
			referenceExplanation: text(body.referenceExplanation, SHORT_TEXT_MAX),
			note: text(body.reviewerNote, SHORT_TEXT_MAX),
		}],
	});
	return { ok: true, id: record.id };
}

/**
 * Phase 4 — deletes a lecturer's missed-error annotation. The
 * `ai_feedback_items` delete rule is null (server-only), so this is the only
 * path. The caller is authenticated and the row's `owner` must match before
 * removal — a missed error is research-only, so deletion never affects grades,
 * feedback, or publishing.
 */
export async function deleteMissedErrorAnnotation(
	request: Request,
	id: string,
	body?: ResearchTargetBody,
): Promise<{ error: AnnotationError } | { ok: true }> {
	if (!SAFE_ITEM_ID.test(id)) return { error: { status: 422, message: 'ID tidak valid.' } };
	if (!body) return { error: { status: 422, message: 'Research target and round are required.' } };
	const loaded = await loadResearchTarget(request, body);
	if ('error' in loaded) return loaded;
	const target = loaded.target;

	const auth = await authenticateUser(request);
	if ('error' in auth) return { error: auth.error };

	let row: { owner: string; assignment?: string; submission?: string; publicSubmission?: string; origin: string; raterJudgments?: unknown; adjudicationStatus?: string };
	try {
		row = await pocketbaseAdmin.getRecord<typeof row>('ai_feedback_items', id);
	} catch {
		return { error: { status: 404, message: 'Anotasi tidak ditemukan.' } };
	}
	if (row.assignment !== target.assignment.id || (target.channel === 'enrolled' ? row.submission !== target.recordId : row.publicSubmission !== target.recordId)) {
		return { error: { status: 404, message: 'Anotasi tidak ditemukan untuk target ini.' } };
	}
	if (row.owner !== target.assignment.owner || row.owner !== auth.user.id) {
		return { error: { status: 403, message: 'Hanya pemilik anotasi yang dapat menghapusnya.' } };
	}
	if (row.origin !== 'human' || parseRaterJudgments(row.raterJudgments).length || row.adjudicationStatus === 'reviewed' || row.adjudicationStatus === 'adjudicated') {
		return { error: { status: 409, message: 'Submitted research originals cannot be deleted.' } };
	}
	await pocketbaseAdmin.deleteRecord('ai_feedback_items', id);
	return { ok: true };
}
