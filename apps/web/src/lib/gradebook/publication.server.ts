/**
 * Grade release publication — the server half of PR 2 ("Stable student
 * publication") of the agentic grading plan.
 *
 * `publication.ts` is pure: it builds the snapshot, fingerprints the inputs and
 * validates a release. This module is the only place that touches the database:
 * it loads the live gradebook for one course, turns it into the exact
 * `ReleaseInputs` the pure module expects, and writes the immutable release.
 *
 * Two hashes, two jobs — this is the part that is easy to get wrong:
 *
 *  - `inputsHash` is the FNV-1a fingerprint produced by `inputsHashOf` in
 *    publication.ts. It is a fast CHANGE DETECTOR (and the value the pure
 *    module exposes on its snapshot). It is NOT approval proof: 32 bits can be
 *    brute-forced and the value is visible in the preview payload.
 *  - `approvalHash` is SHA-256 (node:crypto) over the same canonical
 *    serialization of the same inputs. This is what the lecturer approves and
 *    what `publishRelease` re-derives before writing anything. The stored
 *    `grade_releases.inputsHash` column carries THIS value (`sha256:<hex>`),
 *    and the FNV fingerprint is kept in `summary` for cross-checking.
 *
 * Publication rules enforced here:
 *
 *  1. Re-derive, never trust the client. `publishRelease` reloads every input
 *     from the database and rebuilds the snapshot; a preview payload sent by
 *     the browser is never used as the source of released values.
 *  2. Stale inputs abort the publish (`stale_release_inputs`), stale revisions
 *     abort the publish (`stale_release_revision`).
 *  3. Validation gates publication: `validateRelease` must pass or nothing is
 *     written (`release_not_ready` with the machine-readable issues).
 *  4. All-or-nothing: the supersede update, the release row and EVERY
 *     `grade_release_items` row go out in one PocketBase batch request, which
 *     the server executes inside a single transaction. A partial release is
 *     never published. The release id is generated here (15 chars, the same
 *     shape PocketBase generates) so the item rows can reference the release
 *     inside that one transaction.
 *  5. Concurrency: an in-process per-course lock serializes publishes inside
 *     this server, the revision compare-and-swap rejects a publish that was
 *     prepared against an older head, and after the transaction a read-back
 *     confirms this release is still the current one. A publish that loses a
 *     cross-replica race supersedes its own row and fails loudly instead of
 *     leaving two current releases. See `publishReleaseToStore` for the exact
 *     ordering and the documented limitation.
 *
 * The PocketBase client is a parameter (`ReleaseClient`) so the publish
 * semantics can be unit-tested against an in-memory store; production passes
 * `pocketbaseAdmin`, the shared superuser client, and nothing here ever creates
 * its own PocketBase connection.
 */

import { createHash, randomBytes } from 'node:crypto';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import {
	groupedComponents,
	type AttendanceRecord,
	type AttendanceSession,
	type ParticipationAward,
} from '@/lib/grouped-gradebook';
import {
	chapterValue,
	isChapterComponent,
	type GradeComponent,
	type GradeEntry,
	type GradeOverride,
} from '@/lib/gradebook';
import type { Assignment, AssignmentSubmission } from '@/lib/assignments';
import {
	buildReleaseSnapshot,
	diffReleases,
	inputsHashOf,
	validateRelease,
	type ReleaseComponentInput,
	type ReleaseComponentRow,
	type ReleaseIssue,
	type ReleaseInputs,
	type ReleaseSnapshot,
	type ReleaseState,
	type ReleaseStudentResult,
	type ReleaseValidation,
} from './publication';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type GradeReleaseErrorCode =
	| 'course_not_found'
	| 'course_not_owned'
	| 'stale_release_inputs'
	| 'stale_release_revision'
	| 'stale_release_concurrent'
	| 'release_not_ready'
	| 'release_too_large'
	| 'release_unverified';

/**
 * Typed failure for the route layer. `status` is the HTTP status the endpoint
 * should answer with; `issues` carries validation codes so the UI never has to
 * match on Indonesian prose.
 */
export class GradeReleaseError extends Error {
	readonly code: GradeReleaseErrorCode;
	readonly status: number;
	readonly issues: ReleaseIssue[];

	constructor(code: GradeReleaseErrorCode, status: number, message: string, issues: ReleaseIssue[] = []) {
		super(message);
		this.name = 'GradeReleaseError';
		this.code = code;
		this.status = status;
		this.issues = issues;
	}
}

// ---------------------------------------------------------------------------
// PocketBase client port
// ---------------------------------------------------------------------------

/**
 * The subset of the admin client this module uses. `pocketbaseAdmin` satisfies
 * it structurally; tests pass an in-memory fake instead.
 */
export type ReleaseClient = {
	listRecords: <T>(
		collection: string,
		query?: Record<string, string | number>,
	) => Promise<{ items: T[]; totalItems: number }>;
	getRecord: <T>(collection: string, id: string) => Promise<T>;
	updateRecord: <T>(collection: string, id: string, data: Record<string, unknown>) => Promise<T>;
	send: <T>(path: string, init?: { method?: string; body?: unknown; requestKey?: string | null }) => Promise<T>;
};

// ---------------------------------------------------------------------------
// Source rows loaded from PocketBase
// ---------------------------------------------------------------------------

export type ReleaseStudent = { id: string; name: string; nim: string; sectionId: string };

/** Everything a release snapshot is computed from, loaded in one pass. */
export type ReleaseSources = {
	students: ReleaseStudent[];
	components: GradeComponent[];
	assignments: Assignment[];
	submissions: AssignmentSubmission[];
	entries: GradeEntry[];
	overrides: GradeOverride[];
	sessions: AttendanceSession[];
	attendance: AttendanceRecord[];
	awards: ParticipationAward[];
};

export type StoredReleaseHead = { id: string; revision: number; created: string };

export type StoredReleaseItem = {
	student: string;
	/** PocketBase returns absent numeric columns as `undefined`, not `null`. */
	finalScore?: number | null;
	letterGrade?: string | null;
	complete?: boolean;
	components?: ReleaseComponentRow[];
	override?: unknown;
};

/** One release row plus every item row, applied in a single transaction. */
export type AtomicReleaseWrite = {
	/** Currently published releases that this publish replaces. */
	supersedeIds: string[];
	release: {
		id: string;
		owner: string;
		course: string;
		revision: number;
		status: 'published';
		reason: string;
		publishedAt: string;
		inputsHash: string;
		summary: Record<string, unknown>;
	};
	items: Array<{
		release: string;
		student: string;
		finalScore: number | null;
		letterGrade: string | null;
		complete: boolean;
		components: ReleaseComponentRow[];
		override: { value: number; note: string } | null;
	}>;
};

/**
 * Persistence port. `writeRelease` is the transaction boundary: an
 * implementation MUST apply the supersede updates, the release row and all item
 * rows atomically, or apply nothing at all.
 */
export type ReleaseStore = {
	loadCourse: (courseId: string) => Promise<{ id: string; owner: string } | null>;
	loadSources: (courseId: string) => Promise<ReleaseSources>;
	/** Every release row of the course that is currently published. */
	loadPublishedReleases: (courseId: string) => Promise<StoredReleaseHead[]>;
	loadReleaseItems: (releaseId: string) => Promise<StoredReleaseItem[]>;
	writeRelease: (write: AtomicReleaseWrite) => Promise<void>;
	/** Compensation for a publish that lost a concurrent race. */
	supersede: (releaseId: string) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/** Prefix on the stored approval hash so a bare FNV value can never match it. */
export const APPROVAL_HASH_PREFIX = 'sha256:';

/**
 * Canonical JSON: object keys sorted at every depth, arrays in their given
 * order.
 *
 * This MUST stay byte-identical to the private `stableStringify` in
 * `publication.ts` (and to the `canonical` helper in
 * `pb_hooks/gradebook-commands.pb.js`): the approval hash is only a meaningful
 * binding if it covers exactly the bytes the FNV fingerprint covers. The unit
 * test `canonical serialization matches the FNV fingerprint` recomputes FNV
 * over this output and compares it with `inputsHashOf`, so a drift in either
 * implementation fails the suite.
 */
export function canonicalInputsJson(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return '[' + value.map(canonicalInputsJson).join(',') + ']';
	const record = value as Record<string, unknown>;
	const keys = Object.keys(record).sort();
	return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalInputsJson(record[key])).join(',') + '}';
}

/** SHA-256 of the canonical inputs — the approval binding. */
export function approvalHashOf(inputs: ReleaseInputs): string {
	return APPROVAL_HASH_PREFIX + createHash('sha256').update(canonicalInputsJson(inputs), 'utf8').digest('hex');
}

/**
 * Accepts the preview value with or without the `sha256:` prefix, and rejects
 * anything that is not a SHA-256 hex digest — an FNV fingerprint, a truncated
 * hash or a client-invented token must never be mistaken for approval.
 */
export function normalizeApprovalHash(value: string): string {
	const raw = String(value ?? '').trim().toLowerCase();
	const hex = raw.startsWith(APPROVAL_HASH_PREFIX) ? raw.slice(APPROVAL_HASH_PREFIX.length) : raw;
	if (!/^[0-9a-f]{64}$/.test(hex)) {
		throw new GradeReleaseError('stale_release_inputs', 409, 'Hash persetujuan tidak valid. Siapkan pratinjau rilis baru.');
	}
	return APPROVAL_HASH_PREFIX + hex;
}

const RELEASE_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Release ids are generated here, not by PocketBase, so the item rows can
 * reference the release inside the same batch transaction. 15 chars of
 * `[a-z0-9]` is exactly the shape PocketBase itself generates.
 */
export const newReleaseId = (): string => {
	const bytes = randomBytes(15);
	let id = '';
	for (let index = 0; index < 15; index += 1) id += RELEASE_ID_ALPHABET[bytes[index] % RELEASE_ID_ALPHABET.length];
	return id;
};

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** NIM fallback used by the gradebook hooks: `<nim>@student.upi.edu`. */
const nimFromEmail = (email: string | undefined): string => {
	const match = String(email ?? '').match(/^(\d+)@student\.upi\.edu$/);
	return match ? match[1] : '';
};

/**
 * Component-space value for one manual entry.
 *
 * `publication.ts` takes component-space values and derives nothing itself, so
 * a chapter-tracked component is collapsed to its chapter score here with the
 * SAME helper the live gradebook uses (`chapterValue`). Because the chapter
 * definitions are not forwarded into `ReleaseComponentInput` (see
 * `buildReleaseInputs`), the shared calculation reads this value directly
 * instead of re-deriving a zero from a missing chapter map.
 */
const entryValue = (component: GradeComponent, entry: GradeEntry): number | null => {
	if (!isChapterComponent(component)) return entry.value ?? null;
	return entry.chapters ? chapterValue(component, entry.chapters) : (entry.value ?? null);
};

/**
 * Turns loaded rows into the exact `ReleaseInputs` the pure module hashes and
 * calculates. Pure and exported so the mapping rules can be tested without a
 * database.
 *
 * Mapping decisions:
 *
 *  - Students and components keep a deterministic order (student id, then the
 *    `order,name` order the query used) so the hash is stable across loads.
 *  - Grouped components (attendance/tasks/uts/uas/bonus) get their pre-computed
 *    per-student maps from `groupedComponents`, the same function the lecturer's
 *    gradebook UI calls, so released numbers cannot drift from the working view.
 *  - A computed component carries no entry map (its value comes from
 *    `computed`); a bonus component keeps its entries because the manual entry
 *    is an adjustment on top of the computed award.
 *  - Only graded submissions with a grade are used, and the latest one per
 *    (assignment, student) wins, matching `groupedComponents`.
 *  - Chapter definitions are deliberately NOT forwarded: forwarding them would
 *    make the shared calculation re-derive the score from an entry chapter map
 *    that this module does not carry, silently zeroing every chapter component.
 */
export function buildReleaseInputs(sources: ReleaseSources): ReleaseInputs {
	const students = [...sources.students].sort((a, b) => a.id.localeCompare(b.id));
	const grouped = groupedComponents(
		sources.components,
		sources.assignments,
		sources.submissions,
		students.map((student) => ({ id: student.id, sectionId: student.sectionId || undefined })),
		sources.sessions,
		sources.attendance,
		sources.awards,
	);

	const components: ReleaseComponentInput[] = grouped.map((component) => ({
		id: component.id,
		name: component.name,
		weight: component.weight ?? 0,
		maxScore: component.maxScore || 100,
		kind: component.kind,
		sourceType: component.sourceType,
		assignment: component.assignment || undefined,
		bonusMax: component.bonusMax,
		computed: component.computed,
	}));

	const entriesByComponent = new Map<string, GradeEntry[]>();
	for (const entry of sources.entries) {
		if (!entry.component) continue;
		const rows = entriesByComponent.get(entry.component);
		if (rows) rows.push(entry);
		else entriesByComponent.set(entry.component, [entry]);
	}

	const entries: Record<string, Record<string, number | null>> = {};
	for (const component of grouped) {
		if (component.computed && component.sourceType !== 'bonus') continue;
		const byStudent: Record<string, number | null> = {};
		for (const entry of entriesByComponent.get(component.id) ?? []) {
			if (!entry.student) continue;
			byStudent[entry.student] = entryValue(component, entry);
		}
		entries[component.id] = byStudent;
	}

	const latest = new Map<string, AssignmentSubmission>();
	for (const submission of sources.submissions) {
		if (submission.status !== 'graded' || submission.grade == null) continue;
		const key = submission.assignment + ':' + submission.owner;
		const current = latest.get(key);
		if (!current || String(submission.updated ?? '').localeCompare(String(current.updated ?? '')) > 0) {
			latest.set(key, submission);
		}
	}
	const submissions: Record<string, Record<string, number | null>> = {};
	for (const [key, submission] of latest) {
		const separator = key.lastIndexOf(':');
		const assignmentId = key.slice(0, separator);
		const studentId = key.slice(separator + 1);
		const byStudent = submissions[assignmentId] ?? {};
		byStudent[studentId] = submission.grade;
		submissions[assignmentId] = byStudent;
	}

	const overrides: Record<string, { value: number; note: string }> = {};
	for (const override of sources.overrides) {
		if (!override.student) continue;
		overrides[override.student] = { value: override.value, note: override.note ?? '' };
	}

	return { students: students.map((student) => ({ id: student.id, name: student.name })), components, entries, submissions, overrides };
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export type ReleasePreviewStudent = {
	studentId: string;
	nim: string;
	name: string;
	before: ReleaseState | null;
	after: ReleaseState | null;
};

export type ReleasePreview = {
	courseId: string;
	/** Revision this preview would publish (current published revision + 1). */
	revision: number;
	previousRevision: number;
	previousReleaseId: string | null;
	/** FNV-1a change detector — NOT approval proof. */
	inputsHash: string;
	/** SHA-256 approval binding — this is what `publish` must echo back. */
	approvalHash: string;
	ready: boolean;
	validation: ReleaseValidation;
	/**
	 * Extra blocking conditions that `validateRelease` does not cover and that
	 * the database itself would reject (currently: a final score outside 0–100,
	 * which `grade_release_items.finalScore` refuses). Indonesian, user-facing;
	 * `ready` is false whenever this is non-empty.
	 */
	blockers: string[];
	counts: { students: number; changed: number; unchanged: number; complete: number; incomplete: number };
	weightsTotal: number;
	components: Array<{ id: string; name: string; weight: number; maxScore: number; bonus: boolean; computed: boolean }>;
	/** Only students whose final grade, letter or completeness would change. */
	changed: ReleasePreviewStudent[];
	generatedAt: string;
};

/** A preview plus the derived inputs, kept internal so publish can reuse them. */
type PreparedRelease = { preview: ReleasePreview; inputs: ReleaseInputs; snapshot: ReleaseSnapshot };

/**
 * Deterministic "current release" rule: the highest revision wins; a tie (two
 * concurrent publishes that both wrote `head + 1`) goes to the earliest row,
 * then to the lowest id. Every reader of the head applies this same rule, so
 * two racing publishes agree on exactly one winner.
 */
export const currentReleaseOf = (rows: StoredReleaseHead[]): StoredReleaseHead | undefined =>
	[...rows].sort(
		(a, b) =>
			b.revision - a.revision ||
			String(a.created ?? '').localeCompare(String(b.created ?? '')) ||
			a.id.localeCompare(b.id),
	)[0];

const asResults = (items: StoredReleaseItem[]): ReleaseStudentResult[] =>
	items.map((item) => ({
		studentId: item.student,
		finalScore: item.finalScore ?? null,
		letterGrade: item.letterGrade ?? null,
		complete: Boolean(item.complete),
		overridden: Boolean(item.override),
		components: item.components ?? [],
	}));

/**
 * `grade_release_items.finalScore` is `min: 0, max: 100`, so an out-of-range
 * value would fail INSIDE the transaction and abort the whole publish with an
 * opaque database error. Refusing it up front keeps the failure legible and
 * never silently clamps a grade.
 */
const scoreBlockers = (results: ReleaseStudentResult[]): string[] => {
	const outOfRange = results.filter(
		(result) => result.finalScore != null && (!Number.isFinite(result.finalScore) || result.finalScore < 0 || result.finalScore > 100),
	);
	return outOfRange.length
		? [`${outOfRange.length} nilai akhir berada di luar rentang 0–100 dan tidak dapat diterbitkan.`]
		: [];
};

/**
 * Builds the preview. `heads` lets the publish path reuse the head rows it has
 * already read for the revision CAS, so the revision it checked and the
 * revision the snapshot was diffed against can never come from two different
 * reads.
 */
const prepareRelease = async (
	store: ReleaseStore,
	courseId: string,
	heads?: StoredReleaseHead[],
): Promise<PreparedRelease> => {
	const sources = await store.loadSources(courseId);
	const inputs = buildReleaseInputs(sources);
	const snapshot = buildReleaseSnapshot(inputs);
	const validation = validateRelease(inputs);
	const head = currentReleaseOf(heads ?? (await store.loadPublishedReleases(courseId)));
	const previous = head ? asResults(await store.loadReleaseItems(head.id)) : [];
	const diff = diffReleases(previous, snapshot.results);
	const byStudent = new Map(sources.students.map((student) => [student.id, student]));
	const counting = inputs.components.filter((component) => component.sourceType !== 'bonus' && (component.weight ?? 0) > 0);
	const results = snapshot.results;
	const changedIds = new Set(diff.map((entry) => entry.studentId));
	const blockers = scoreBlockers(results);

	const preview: ReleasePreview = {
		courseId,
		revision: (head?.revision ?? 0) + 1,
		previousRevision: head?.revision ?? 0,
		previousReleaseId: head?.id ?? null,
		// Both hashes describe the SAME canonical inputs; the FNV one is the
		// change detector, the SHA-256 one is the approval binding. Publishing
		// compares the SHA-256 only.
		inputsHash: inputsHashOf(inputs),
		approvalHash: approvalHashOf(inputs),
		ready: validation.ok && blockers.length === 0,
		validation,
		blockers,
		counts: {
			students: results.length,
			changed: diff.length,
			unchanged: results.length - changedIds.size,
			complete: results.filter((result) => result.complete).length,
			incomplete: results.filter((result) => !result.complete).length,
		},
		weightsTotal: Math.round(counting.reduce((sum, component) => sum + (component.weight ?? 0), 0) * 100) / 100,
		components: inputs.components.map((component) => ({
			id: component.id,
			name: component.name,
			weight: component.weight,
			maxScore: component.maxScore,
			bonus: component.sourceType === 'bonus',
			computed: Boolean(component.computed),
		})),
		changed: diff.map((entry) => {
			const student = byStudent.get(entry.studentId);
			return {
				studentId: entry.studentId,
				nim: student?.nim ?? '',
				name: student?.name ?? '',
				before: entry.before,
				after: entry.after,
			};
		}),
		generatedAt: new Date().toISOString(),
	};

	return { preview, inputs, snapshot };
};

const assertOwner = async (store: ReleaseStore, courseId: string, ownerId: string) => {
	const course = await store.loadCourse(courseId);
	if (!course) throw new GradeReleaseError('course_not_found', 404, 'Mata kuliah tidak ditemukan.');
	if (course.owner !== ownerId) {
		throw new GradeReleaseError('course_not_owned', 403, 'Hanya pemilik mata kuliah yang dapat menerbitkan nilai.');
	}
	return course;
};

export type CreateReleasePreviewInput = { courseId: string; ownerId: string };

/** Builds the DRAFT preview: diff, readiness and both hashes. Writes nothing. */
export const previewReleaseFromStore = async (
	store: ReleaseStore,
	input: CreateReleasePreviewInput,
): Promise<ReleasePreview> => {
	await assertOwner(store, input.courseId, input.ownerId);
	return (await prepareRelease(store, input.courseId)).preview;
};

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

export type PublishReleaseInput = {
	ownerId: string;
	courseId: string;
	/** SHA-256 from the approved preview (`sha256:<hex>` or bare hex). */
	expectedHash: string;
	/** Revision the preview proposed — i.e. current published revision + 1. */
	revision: number;
	reason?: string;
};

export type PublishedRelease = {
	releaseId: string;
	courseId: string;
	revision: number;
	previousRevision: number;
	supersededReleaseId: string | null;
	inputsHash: string;
	approvalHash: string;
	publishedAt: string;
	counts: { students: number; changed: number; complete: number; incomplete: number };
};

/** Max characters persisted in `grade_releases.reason`. */
const MAX_REASON_LENGTH = 2000;

// In-process publish serialization, keyed by course. It stops the ordinary
// double-submit race (two clicks, two tabs in this process); it cannot stop a
// second replica, which is what the revision CAS and the post-transaction
// read-back below are for.
const courseLocks = new Map<string, Promise<void>>();

const withCourseLock = async <T>(courseId: string, work: () => Promise<T>): Promise<T> => {
	const previous = courseLocks.get(courseId) ?? Promise.resolve();
	const started = previous.then(() => work());
	const tail = started.then(
		() => undefined,
		() => undefined,
	);
	courseLocks.set(courseId, tail);
	try {
		return await started;
	} finally {
		// Drop the entry once nothing is queued behind it, so the map stays small.
		if (courseLocks.get(courseId) === tail) courseLocks.delete(courseId);
	}
};

/**
 * Publishes an approved release.
 *
 * Order of operations — each step is a hard stop:
 *
 *  1. Ownership, then the per-course in-process lock.
 *  2. Revision CAS: `revision` must equal `currentPublishedRevision + 1`. A
 *     publish prepared against an older head is rejected before any read of
 *     the gradebook, so it cannot supersede a newer release.
 *  3. Re-derive the snapshot from live rows and compare the SHA-256 with
 *     `expectedHash`. Any edit between preview and publish changes the hash and
 *     the publish is rejected (`stale_release_inputs`). The FNV fingerprint is
 *     never used for this decision.
 *  4. `validateRelease` must pass — incomplete students, weights that do not
 *     total 100, no components or an override without a reason all block the
 *     write (`release_not_ready`), as does a final score outside 0–100 that the
 *     `grade_release_items` column would reject.
 *  5. One transaction writes: every currently published release marked
 *     `superseded`, the new `grade_releases` row (`published`, `revision =
 *     head + 1`), and every `grade_release_items` row. Nothing is written
 *     before this point and nothing survives a failure inside it.
 *  6. Read-back: the new release must be the current one. If a concurrent
 *     publish (another replica) became current first, this publish supersedes
 *     its own row and reports `stale_release_concurrent` — two publishes can
 *     never both remain current.
 *
 * Documented limitation: `grade_releases` has no unique index on
 * `(course, revision)` (the migration is not editable from here), so the CAS is
 * enforced by the steps above rather than by a database constraint. Adding that
 * index is the follow-up that turns the cross-replica case into a plain 409.
 */
export const publishReleaseToStore = async (
	store: ReleaseStore,
	input: PublishReleaseInput,
): Promise<PublishedRelease> => {
	await assertOwner(store, input.courseId, input.ownerId);

	return withCourseLock(input.courseId, async () => {
		const expectedHash = normalizeApprovalHash(input.expectedHash);

		// Read the published rows ONCE: the revision CAS below and the diff in
		// `prepareRelease` must describe the same head, otherwise a racing write
		// could slip between the two reads.
		const published = await store.loadPublishedReleases(input.courseId);
		const head = currentReleaseOf(published);
		const previousRevision = head?.revision ?? 0;
		if (!Number.isInteger(input.revision) || input.revision !== previousRevision + 1) {
			throw new GradeReleaseError(
				'stale_release_revision',
				409,
				'Revisi rilis sudah berubah. Siapkan dan tinjau pratinjau baru.',
			);
		}

		const prepared = await prepareRelease(store, input.courseId, published);
		if (prepared.preview.approvalHash !== expectedHash) {
			throw new GradeReleaseError(
				'stale_release_inputs',
				409,
				'Nilai berubah setelah pratinjau. Siapkan dan tinjau pratinjau rilis baru.',
			);
		}
		if (!prepared.preview.validation.ok) {
			throw new GradeReleaseError(
				'release_not_ready',
				422,
				'Rilis belum siap diterbitkan.',
				prepared.preview.validation.issues,
			);
		}
		if (prepared.preview.blockers.length) {
			throw new GradeReleaseError('release_not_ready', 422, prepared.preview.blockers.join(' '));
		}

		const releaseId = newReleaseId();
		const publishedAt = new Date().toISOString();
		const { preview, inputs, snapshot } = prepared;

		await store.writeRelease({
			// Every currently published row is retired in the same transaction, so
			// a course never ends up with two current releases — including after a
			// legacy state that already held more than one.
			supersedeIds: published.map((row) => row.id),
			release: {
				id: releaseId,
				owner: input.ownerId,
				course: input.courseId,
				revision: previousRevision + 1,
				status: 'published',
				reason: String(input.reason ?? '').slice(0, MAX_REASON_LENGTH),
				publishedAt,
				inputsHash: preview.approvalHash,
				summary: {
					students: preview.counts.students,
					changed: preview.counts.changed,
					complete: preview.counts.complete,
					incomplete: preview.counts.incomplete,
					components: preview.components.length,
					weightsTotal: preview.weightsTotal,
					previousRevision,
					// Cross-check value only: the approval binding is `inputsHash`.
					inputsFingerprint: preview.inputsHash,
					validation: 'ok',
					generatedAt: preview.generatedAt,
				},
			},
			items: snapshot.results.map((result) => ({
				release: releaseId,
				student: result.studentId,
				finalScore: result.finalScore,
				letterGrade: result.letterGrade,
				complete: result.complete,
				components: result.components,
				override: inputs.overrides[result.studentId] ?? null,
			})),
		});

		let current: StoredReleaseHead | undefined;
		try {
			current = currentReleaseOf(await store.loadPublishedReleases(input.courseId));
		} catch {
			// The write committed; only the confirmation read failed. Reporting
			// failure would invite a duplicate publish, so say "unverified".
			throw new GradeReleaseError(
				'release_unverified',
				503,
				'Rilis tersimpan tetapi belum terverifikasi. Muat ulang halaman sebelum mencoba lagi.',
			);
		}
		if (!current || current.id !== releaseId) {
			// Another publish won the race. Retire our row so exactly one
			// release stays current, then fail loudly.
			await store.supersede(releaseId).catch(() => undefined);
			throw new GradeReleaseError(
				'stale_release_concurrent',
				409,
				'Rilis lain sudah diterbitkan lebih dulu. Muat ulang lalu terbitkan ulang bila perlu.',
			);
		}

		return {
			releaseId,
			courseId: input.courseId,
			revision: previousRevision + 1,
			previousRevision,
			supersededReleaseId: head?.id ?? null,
			inputsHash: preview.inputsHash,
			approvalHash: preview.approvalHash,
			publishedAt,
			counts: {
				students: preview.counts.students,
				changed: preview.counts.changed,
				complete: preview.counts.complete,
				incomplete: preview.counts.incomplete,
			},
		};
	});
};

// ---------------------------------------------------------------------------
// PocketBase store
// ---------------------------------------------------------------------------

const PAGE_SIZE = 200;
const MAX_PAGES = 100;

const listAll = async <T>(
	client: ReleaseClient,
	collection: string,
	query: Record<string, string | number> = {},
): Promise<T[]> => {
	const rows: T[] = [];
	for (let page = 1; ; page += 1) {
		if (page > MAX_PAGES) {
			// Never return a truncated set: a partial load would silently publish
			// an incomplete release.
			throw new GradeReleaseError(
				'release_too_large',
				422,
				'Data nilai terlalu besar untuk disiapkan dalam satu rilis.',
			);
		}
		const result = await client.listRecords<T>(collection, { ...query, page, perPage: PAGE_SIZE });
		rows.push(...result.items);
		if (result.items.length < PAGE_SIZE) return rows;
	}
};

type CourseRow = { id: string; owner: string };
type EnrollmentRow = {
	id: string;
	owner: string;
	section?: string;
	expand?: { owner?: { id: string; name?: string; email?: string; nim?: string; role?: string } };
};
type ReleaseRow = { id: string; revision: number; created: string };
type ReleaseItemRow = StoredReleaseItem;

const quoted = (value: string) => '"' + value.replace(/["\\]/g, '') + '"';

/**
 * Production store. Every read is scoped to one course; every write goes through
 * the single `/api/batch` request that PocketBase runs in one transaction.
 */
export const pocketbaseReleaseStore = (client: ReleaseClient): ReleaseStore => ({
	loadCourse: async (courseId) => {
		try {
			const course = await client.getRecord<CourseRow>('courses', courseId);
			return { id: course.id, owner: course.owner };
		} catch (error) {
			if (Number((error as { status?: number })?.status) === 404) return null;
			throw error;
		}
	},

	loadSources: async (courseId) => {
		const course = quoted(courseId);
		const [components, enrollments, assignments, submissions, entries, overrides, sessions, attendance, awards] =
			await Promise.all([
				listAll<GradeComponent>(client, 'grade_components', {
					filter: 'course=' + course + ' && status="active"',
					sort: 'order,name',
				}),
				listAll<EnrollmentRow>(client, 'enrollments', {
					filter: 'course=' + course,
					expand: 'owner',
					sort: 'owner',
				}),
				listAll<Assignment>(client, 'assignments', { filter: 'course=' + course, sort: 'title' }),
				listAll<AssignmentSubmission>(client, 'assignment_submissions', {
					filter: 'assignment.course=' + course,
				}),
				listAll<GradeEntry>(client, 'grade_entries', { filter: 'component.course=' + course }),
				listAll<GradeOverride>(client, 'grade_overrides', { filter: 'course=' + course }),
				listAll<AttendanceSession>(client, 'class_sessions', { filter: 'course=' + course }),
				listAll<AttendanceRecord>(client, 'attendance', { filter: 'session.course=' + course }),
				listAll<ParticipationAward>(client, 'participation_awards', { filter: 'session.course=' + course }),
			]);

		const seen = new Set<string>();
		const students: ReleaseStudent[] = [];
		for (const enrollment of enrollments) {
			const owner = enrollment.expand?.owner;
			if (!owner?.id || seen.has(owner.id)) continue;
			// Only registered students are released; the hooks already refuse to
			// write entries for anything else.
			if (owner.role && owner.role !== 'student') continue;
			seen.add(owner.id);
			students.push({
				id: owner.id,
				name: owner.name || owner.email || owner.nim || owner.id,
				nim: owner.nim || nimFromEmail(owner.email),
				sectionId: enrollment.section || '',
			});
		}

		return { students, components, assignments, submissions, entries, overrides, sessions, attendance, awards };
	},

	loadPublishedReleases: async (courseId) =>
		listAll<ReleaseRow>(client, 'grade_releases', {
			// Earliest row first among equal revisions — the same tie-break
			// `currentReleaseOf` applies in memory.
			filter: 'course=' + quoted(courseId) + ' && status="published"',
			sort: '-revision,created',
		}),

	loadReleaseItems: async (releaseId) =>
		listAll<ReleaseItemRow>(client, 'grade_release_items', { filter: 'release=' + quoted(releaseId) }),

	writeRelease: async (write) => {
		const requests: Array<{ method: string; url: string; body: Record<string, unknown> }> = [
			...write.supersedeIds.map((id) => ({
				method: 'PATCH',
				url: '/api/collections/grade_releases/records/' + encodeURIComponent(id),
				body: { status: 'superseded' },
			})),
			{
				method: 'POST',
				url: '/api/collections/grade_releases/records',
				body: { ...write.release },
			},
			...write.items.map((item) => ({
				method: 'POST',
				url: '/api/collections/grade_release_items/records',
				body: { ...item },
			})),
		];
		// PocketBase executes one /api/batch request inside one transaction, so
		// the supersede update, the release row and every item row land
		// together or not at all. The body shape (@jsonPayload) is the same one
		// the PocketBase SDK's own batch service sends.
		const payload = new FormData();
		payload.append('@jsonPayload', JSON.stringify({ requests }));
		await client.send('/api/batch', { method: 'POST', body: payload, requestKey: null });
	},

	supersede: async (releaseId) => {
		await client.updateRecord('grade_releases', releaseId, { status: 'superseded' });
	},
});

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Builds the draft release preview for one course.
 *
 * The client defaults to `pocketbaseAdmin` (the shared superuser client) so
 * production code never builds its own connection; tests pass an in-memory
 * store instead.
 */
export const createReleasePreview = async (
	pb: ReleaseClient = pocketbaseAdmin,
	input: CreateReleasePreviewInput,
): Promise<ReleasePreview> => previewReleaseFromStore(pocketbaseReleaseStore(pb), input);

/**
 * Publishes an approved release. `pb` is the shared admin client in production;
 * `expectedHash` is the SHA-256 from the approved preview and `revision` is the
 * revision that preview proposed.
 */
export const publishRelease = async (
	pb: ReleaseClient = pocketbaseAdmin,
	input: PublishReleaseInput,
): Promise<PublishedRelease> => publishReleaseToStore(pocketbaseReleaseStore(pb), input);
