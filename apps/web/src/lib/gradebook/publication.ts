/**
 * Grade release publication — snapshot building, fingerprinting, diffing and
 * validation for immutable release snapshots (PR 2 of the grading plan).
 *
 * This module is pure: no database, no framework types, no `.server` imports.
 * It DOES import the real calculation from `@/lib/gradebook` so the released
 * numbers can never drift from the lecturer's working gradebook — the snapshot
 * is computed by exactly the same `calculateFinalGrade`/`componentScore` code.
 * (`gradebook.ts`'s import from `@/lib/assignments` is type-only and erased at
 * runtime; `grouped-gradebook.ts` is NOT imported because its runtime import
 * of `activityTypeOf` would drag in the PocketBase client bundle. Instead this
 * module takes pre-computed component maps — the output of
 * `groupedComponents` — as caller-supplied input.)
 *
 * Design notes that are easy to get wrong:
 *
 *  - A release is immutable. Once built, the per-student results are the
 *    released truth even if the live gradebook changes a second later.
 *  - `inputsHash` pins the exact inputs that were previewed. Publishing must
 *    reject (see `isStale`) when the live inputs no longer match. This
 *    fingerprint is a fast change detector only: approval binding on the
 *    server must additionally record a cryptographic hash (node:crypto
 *    SHA-256 over the same canonical serialization) in a `.server` module —
 *    a 32-bit FNV fingerprint is deliberately NOT trusted as approval proof.
 *  - An empty grade is not zero: a missing entry contributes nothing and can
 *    make the final grade null, never silently 0.
 */

import {
	calculateFinalGrade,
	componentScore,
	letterGrade,
	totalWeight,
	type GradeComponent,
	type GradeEntry,
	type GradeOverride,
} from '@/lib/gradebook';

/** Minimal component description a release is computed from. */
export type ReleaseComponentInput = {
	id: string;
	name: string;
	/** Weight in the final grade; bonus components carry 0. */
	weight: number;
	maxScore: number;
	kind: GradeComponent['kind'];
	/** 'attendance' | 'tasks' | 'uts' | 'uas' | 'bonus' | '' */
	sourceType?: GradeComponent['sourceType'];
	/** Assignment id for assignment-linked components. */
	assignment?: string;
	/** Cap for bonus components when maxScore is not meaningful. */
	bonusMax?: number;
	/** Chapter-tracked component definitions, mirrored for completeness rows. */
	chapters?: GradeComponent['chapters'];
	/**
	 * Pre-computed per-student scores for grouped components
	 * (attendance/tasks/uts/uas/bonus), keyed by student id. Supplied by the
	 * caller (from `groupedComponents`) — this module never derives them.
	 */
	computed?: Record<string, { score: number | null; complete: boolean; detail: string }>;
};

/**
 * The exact inputs a release is computed from. All maps are plain records so
 * the hash serialization is deterministic; convert PocketBase rows via the
 * helpers at the bottom.
 *
 * `entries` holds raw component-space values: for chapter-tracked components
 * the caller derives the numeric value from the chapter statuses first
 * (gradebook.chapterValue) and passes the result, so the hash covers exactly
 * what was previewed.
 */
export type ReleaseInputs = {
	/** Students included in the release. */
	students: { id: string; name: string }[];
	components: ReleaseComponentInput[];
	/** Manual entry values, componentId → studentId → value|null (raw scale). */
	entries: Record<string, Record<string, number | null>>;
	/** Graded submission raw grades, assignmentId → studentId → grade|null. */
	submissions: Record<string, Record<string, number | null>>;
	/** Explicit final overrides, keyed by studentId (reason required). */
	overrides: Record<string, { value: number; note: string }>;
};

/** One released component row for one student (stored in `components` json). */
export type ReleaseComponentRow = {
	componentId: string;
	name: string;
	weight: number;
	bonus: boolean;
	score: number | null;
	complete: boolean;
	detail: string;
};

/** One released per-student result (stored as a `grade_release_items` row). */
export type ReleaseStudentResult = {
	studentId: string;
	finalScore: number | null;
	letterGrade: string | null;
	complete: boolean;
	overridden: boolean;
	/** Released component rows, in component order. */
	components: ReleaseComponentRow[];
};

export type ReleaseSnapshot = {
	/** Deterministic fingerprint of the exact inputs the snapshot came from. */
	inputsHash: string;
	results: ReleaseStudentResult[];
};

/**
 * Adapts a ReleaseComponentInput into the GradeComponent shape the shared
 * calculation expects. Only fields `componentScore`/`calculateFinalGrade`
 * read are populated; computed maps come straight through.
 */
function asGradeComponent(c: ReleaseComponentInput): GradeComponent {
	return {
		id: c.id,
		owner: '',
		course: '',
		name: c.name,
		description: '',
		maxScore: c.maxScore,
		weight: c.weight,
		kind: c.kind,
		assignment: c.assignment ?? '',
		chapters: c.chapters,
		order: 0,
		status: 'active',
		sourceType: c.sourceType,
		bonusMax: c.bonusMax,
		attendanceLateCredit: undefined,
		attendanceExcusedCredit: undefined,
		computed: c.computed,
		created: '',
		updated: '',
	};
}

const EMPTY_ENTRY: GradeEntry = {
	id: '',
	owner: '',
	component: '',
	student: '',
	value: null,
	source: 'manual',
	note: '',
	created: '',
	updated: '',
};

/** Builds the (component → student → GradeEntry) maps the shared calc reads. */
function entryMapsOf(inputs: ReleaseInputs): Map<string, Map<string, GradeEntry>> {
	const byComponent = new Map<string, Map<string, GradeEntry>>();
	for (const [componentId, students] of Object.entries(inputs.entries)) {
		const byStudent = new Map<string, GradeEntry>();
		for (const [studentId, value] of Object.entries(students)) {
			if (value == null) continue;
			byStudent.set(studentId, { ...EMPTY_ENTRY, component: componentId, student: studentId, value });
		}
		byComponent.set(componentId, byStudent);
	}
	return byComponent;
}

/** Builds the (assignment → student → AssignmentSubmission) maps. */
function submissionMapsOf(inputs: ReleaseInputs): Map<string, Map<string, AssignmentSubmission>> {
	const byAssignment = new Map<string, Map<string, AssignmentSubmission>>();
	for (const [assignmentId, students] of Object.entries(inputs.submissions)) {
		const byStudent = new Map<string, AssignmentSubmission>();
		for (const [studentId, grade] of Object.entries(students)) {
			if (grade == null) continue;
			byStudent.set(studentId, {
				id: '',
				owner: studentId,
				assignment: assignmentId,
				group: '',
				content: '',
				files: [],
				link: '',
				status: 'graded',
				grade,
				feedback: '',
				gradedBy: '',
				gradedAt: '',
				taskAnswers: null,
				autoScore: null,
				taskReview: null,
				created: '',
				updated: '',
			});
		}
		byAssignment.set(assignmentId, byStudent);
	}
	return byAssignment;
}

// Imported lazily below the helpers to keep the type import single-sourced.
import type { AssignmentSubmission } from '@/lib/assignments';

/** Shared-calc view of one student's override, or undefined. */
function overrideFor(
	studentId: string,
	inputs: ReleaseInputs,
): GradeOverride | undefined {
	const o = inputs.overrides[studentId];
	if (!o) return undefined;
	return { id: '', owner: '', course: '', student: studentId, value: o.value, note: o.note, created: '', updated: '' };
}

/**
 * Fingerprint of the inputs for one student, narrowed to the fields that
 * affect that student — kept for completeness/debugging; the release-level
 * hash covers the full input record.
 */
// (No per-student hash is exported; the release hash is the contract.)

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * Canonical JSON: object keys are sorted at every depth so two structurally
 * equal inputs always serialize identically. Arrays keep their given order
 * (component order and student order are meaningful).
 */
function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
	const keys = Object.keys(value as Record<string, unknown>).sort();
	return (
		'{' +
		keys
			.map((k) => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k]))
			.join(',') +
		'}'
	);
}

/**
 * FNV-1a 32-bit over the canonical serialization.
 *
 * This is a CHANGE DETECTOR, not a security primitive: it catches "the live
 * inputs moved between preview and publish". Approval binding on the server
 * must record a cryptographic hash (SHA-256 via node:crypto in a `.server`
 * module over the same canonical serialization) — do not trust this
 * fingerprint as authorization evidence.
 */
function fnv1a32(text: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Prefix makes an accidental bare-hash comparison fail loudly. */
export const INPUTS_HASH_PREFIX = 'fnv1a-';

/**
 * Stable fingerprint of the exact release inputs. No node:crypto — this file
 * must be usable in browser and test contexts without Node.
 */
export function inputsHashOf(inputs: ReleaseInputs): string {
	return INPUTS_HASH_PREFIX + fnv1a32(stableStringify(inputs));
}

/** True when the live inputs no longer match what was previewed. */
export function isStale(expectedHash: string, currentHash: string): boolean {
	return expectedHash !== currentHash;
}

// ---------------------------------------------------------------------------
// Snapshot building
// ---------------------------------------------------------------------------

/** Builds the immutable per-student results for a release. */
export function buildReleaseSnapshot(inputs: ReleaseInputs): ReleaseSnapshot {
	const students = [...inputs.students].sort((a, b) => a.id.localeCompare(b.id));
	const entryMaps = entryMapsOf(inputs);
	const submissionMaps = submissionMapsOf(inputs);
	const results: ReleaseStudentResult[] = students.map((student) => {
		const override = overrideFor(student.id, inputs);
		const final = calculateFinalGrade(
			inputs.components.map(asGradeComponent),
			student.id,
			entryMaps,
			submissionMaps,
			override,
		);
		const components: ReleaseComponentRow[] = inputs.components.map((c) => {
			const { score } = componentScore(asGradeComponent(c), student.id, entryMaps, submissionMaps);
			const computed = c.computed?.[student.id];
			return {
				componentId: c.id,
				name: c.name,
				weight: c.weight ?? 0,
				bonus: c.sourceType === 'bonus',
				score,
				complete: c.sourceType === 'bonus' ? true : (computed?.complete ?? false),
				detail: computed?.detail ?? '',
			};
		});
		return {
			studentId: student.id,
			finalScore: final.value,
			letterGrade: final.letter,
			complete: final.gradedCount === final.countingCount && final.countingCount > 0,
			overridden: final.overridden,
			components,
		};
	});
	return { inputsHash: inputsHashOf(inputs), results };
}

// ---------------------------------------------------------------------------
// Diffing
// ---------------------------------------------------------------------------

export type ReleaseState = {
	finalScore: number | null;
	letterGrade: string | null;
	complete: boolean;
};

export type ReleaseDiffEntry = {
	studentId: string;
	before: ReleaseState | null;
	after: ReleaseState | null;
	changed: boolean;
};

const stateOf = (r: ReleaseStudentResult | undefined): ReleaseState | null =>
	r ? { finalScore: r.finalScore, letterGrade: r.letterGrade, complete: r.complete } : null;

const sameState = (a: ReleaseState | null, b: ReleaseState | null): boolean => {
	if (a === null || b === null) return a === b;
	return a.finalScore === b.finalScore && a.letterGrade === b.letterGrade && a.complete === b.complete;
};

/**
 * Per-student diff between two releases. Only students whose final score,
 * letter grade or completeness changed are returned.
 */
export function diffReleases(
	previous: ReleaseStudentResult[],
	next: ReleaseStudentResult[],
): ReleaseDiffEntry[] {
	const prevById = new Map(previous.map((r) => [r.studentId, r]));
	const nextById = new Map(next.map((r) => [r.studentId, r]));
	const ids = new Set<string>([...prevById.keys(), ...nextById.keys()]);
	const diffs: ReleaseDiffEntry[] = [];
	for (const id of ids) {
		const before = stateOf(prevById.get(id));
		const after = stateOf(nextById.get(id));
		if (!sameState(before, after)) diffs.push({ studentId: id, before, after, changed: true });
	}
	return diffs.sort((a, b) => a.studentId.localeCompare(b.studentId));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ReleaseIssueCode =
	| 'no_students'
	| 'no_components'
	| 'weights_not_100'
	| 'incomplete_students'
	| 'empty_override_reason';

export type ReleaseIssue = { code: ReleaseIssueCode; message: string };

export type ReleaseValidation =
	| { ok: true }
	| { ok: false; issues: ReleaseIssue[] };

const WEIGHT_TOLERANCE = 1e-9;

/**
 * Checks that a release is safe to publish. Every blocking condition gets a
 * stable machine code so callers and tests never match on prose.
 */
export function validateRelease(inputs: ReleaseInputs): ReleaseValidation {
	const issues: ReleaseIssue[] = [];

	if (inputs.students.length === 0) {
		issues.push({ code: 'no_students', message: 'Tidak ada mahasiswa untuk diterbitkan.' });
	}
	const counting = inputs.components.filter((c) => c.sourceType !== 'bonus' && (c.weight ?? 0) > 0);
	if (counting.length === 0) {
		issues.push({
			code: 'no_components',
			message: 'Tidak ada komponen berbobot untuk menghitung nilai akhir.',
		});
	}
	// Re-uses totalWeight from gradebook.ts — the real weight semantics — but
	// only its input type differs (ReleaseComponentInput), so the call goes
	// through the same adapter as the calculation.
	const weightSum = totalWeight(inputs.components.map(asGradeComponent));
	if (Math.abs(weightSum - 100) > WEIGHT_TOLERANCE) {
		issues.push({
			code: 'weights_not_100',
			message: `Total bobot komponen ${weightSum}%, harus tepat 100%.`,
		});
	}
	const entryMaps = entryMapsOf(inputs);
	const submissionMaps = submissionMapsOf(inputs);
	const components = inputs.components.map(asGradeComponent);
	const incomplete = inputs.students.filter((s) => {
		const final = calculateFinalGrade(components, s.id, entryMaps, submissionMaps, overrideFor(s.id, inputs));
		return !final.overridden && final.value == null;
	}).length;
	if (incomplete > 0) {
		issues.push({
			code: 'incomplete_students',
			message: `${incomplete} mahasiswa belum memiliki nilai akhir lengkap.`,
		});
	}
	for (const [studentId, override] of Object.entries(inputs.overrides)) {
		if (!override.note.trim()) {
			issues.push({
				code: 'empty_override_reason',
				message: 'Override nilai akhir wajib menyertakan alasan.',
			});
		}
	}
	return issues.length ? { ok: false, issues } : { ok: true };
}

/**
 * Reason recorded on the migration backfill release. Mirrored verbatim in
 * `pb_migrations/1791900000_gradebook_releases.js` (migrations cannot import
 * from the web app), kept in sync by hand.
 */
export const BACKFILL_REASON =
	'Backfill dari nilai live saat migrasi. Rilis lama tidak pernah menyimpan potret per-mahasiswa, sehingga nilai yang diterbitkan pada saat itu tidak dapat direkonstruksi. Baris ini hanya menandai bahwa mata kuliah ini pernah diterbitkan tanpa potret; dosen perlu menerbitkan ulang untuk membuat potret resmi yang baru.';
