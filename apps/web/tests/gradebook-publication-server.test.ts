import { describe, expect, it } from 'vitest';
import {
	APPROVAL_HASH_PREFIX,
	GradeReleaseError,
	approvalHashOf,
	buildReleaseInputs,
	canonicalInputsJson,
	currentReleaseOf,
	normalizeApprovalHash,
	previewReleaseFromStore,
	publishReleaseToStore,
	type AtomicReleaseWrite,
	type ReleaseSources,
	type ReleaseStore,
	type StoredReleaseHead,
	type StoredReleaseItem,
} from '@/lib/gradebook/publication.server';
import { inputsHashOf, type ReleaseInputs } from '@/lib/gradebook/publication';
import type { GradeComponent, GradeEntry } from '@/lib/gradebook';
import type { AssignmentSubmission } from '@/lib/assignments';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COURSE = 'course1';
const OWNER = 'faculty1';

const component = (overrides: Partial<GradeComponent> & { id: string }): GradeComponent => ({
	owner: OWNER,
	course: COURSE,
	name: overrides.id,
	description: '',
	maxScore: 100,
	weight: 0,
	kind: 'manual',
	assignment: '',
	order: 0,
	status: 'active',
	created: '',
	updated: '',
	...overrides,
});

const entry = (componentId: string, studentId: string, value: number | null): GradeEntry => ({
	id: '',
	owner: OWNER,
	component: componentId,
	student: studentId,
	value,
	source: 'manual',
	note: '',
	created: '',
	updated: '',
});

/** Two manual components that total 100 and two fully graded students. */
const baseSources = (): ReleaseSources => ({
	students: [
		{ id: 'stu_b', name: 'Budi', nim: '2002', sectionId: 'sec1' },
		{ id: 'stu_a', name: 'Ani', nim: '2001', sectionId: 'sec1' },
	],
	components: [
		component({ id: 'c1', name: 'Tugas', weight: 60, order: 0 }),
		component({ id: 'c2', name: 'UAS', weight: 40, order: 1 }),
	],
	assignments: [],
	submissions: [],
	entries: [entry('c1', 'stu_a', 80), entry('c1', 'stu_b', 90), entry('c2', 'stu_a', 90), entry('c2', 'stu_b', 100)],
	overrides: [],
	sessions: [],
	attendance: [],
	awards: [],
});

const baseInputs = (): ReleaseInputs => buildReleaseInputs(baseSources());

/**
 * The FNV-1a used by `publication.ts`, re-implemented here on purpose: the
 * approval hash is only meaningful if it covers exactly the bytes the pure
 * fingerprint covers, so this copy detects drift in either implementation.
 */
const fnv1a32 = (text: string): string => {
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
};

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

type FakeRelease = {
	id: string;
	course: string;
	owner: string;
	revision: number;
	status: 'published' | 'superseded';
	created: string;
	publishedAt: string;
	inputsHash: string;
	reason: string;
	summary: Record<string, unknown>;
};

/**
 * In-memory `ReleaseStore`. `writeRelease` stages every row first and only
 * commits when the whole write succeeds, which is the guarantee the real
 * PocketBase batch transaction provides — so a simulated failure proves the
 * service never leaves a partial release behind.
 */
class MemoryStore implements ReleaseStore {
	readonly course: { id: string; owner: string } | null;
	sources: ReleaseSources;
	releases: FakeRelease[] = [];
	items = new Map<string, StoredReleaseItem[]>();
	transactions = 0;
	/** 0-based item index that throws before the transaction commits. */
	failAtItem: number | null = null;
	/** Runs after a successful commit, to simulate a racing replica. */
	afterCommit: ((write: AtomicReleaseWrite) => void) | null = null;
	readFails = false;

	constructor(sources: ReleaseSources = baseSources(), course: { id: string; owner: string } | null = { id: COURSE, owner: OWNER }) {
		this.sources = sources;
		this.course = course;
	}

	async loadCourse(courseId: string) {
		return this.course && this.course.id === courseId ? this.course : null;
	}

	async loadSources() {
		return this.sources;
	}

	async loadPublishedReleases(courseId: string): Promise<StoredReleaseHead[]> {
		if (this.readFails) throw new Error('read failed');
		return this.releases
			.filter((row) => row.course === courseId && row.status === 'published')
			.map((row) => ({ id: row.id, revision: row.revision, created: row.created }));
	}

	async loadReleaseItems(releaseId: string): Promise<StoredReleaseItem[]> {
		return this.items.get(releaseId) ?? [];
	}

	async writeRelease(write: AtomicReleaseWrite) {
		// Stage everything, commit nothing on failure.
		const stagedReleases = this.releases.map((row) =>
			write.supersedeIds.includes(row.id) ? { ...row, status: 'superseded' as const } : row,
		);
		stagedReleases.push({
			id: write.release.id,
			course: write.release.course,
			owner: write.release.owner,
			revision: write.release.revision,
			status: write.release.status,
			created: new Date().toISOString(),
			publishedAt: write.release.publishedAt,
			inputsHash: write.release.inputsHash,
			reason: write.release.reason,
			summary: write.release.summary,
		});
		const stagedItems = new Map(this.items);
		stagedItems.set(
			write.release.id,
			write.items.map((item) => ({
				student: item.student,
				finalScore: item.finalScore,
				letterGrade: item.letterGrade,
				complete: item.complete,
				components: item.components,
				override: item.override,
			})),
		);
		if (this.failAtItem !== null && this.failAtItem < write.items.length) {
			throw new Error('simulated item write failure');
		}
		this.releases = stagedReleases;
		this.items = stagedItems;
		this.transactions += 1;
		this.afterCommit?.(write);
	}

	async supersede(releaseId: string) {
		this.releases = this.releases.map((row) => (row.id === releaseId ? { ...row, status: 'superseded' as const } : row));
	}

	published(): FakeRelease[] {
		return this.releases.filter((row) => row.status === 'published');
	}
}

const codeOf = async (work: Promise<unknown>): Promise<string> => {
	try {
		await work;
	} catch (error) {
		return error instanceof GradeReleaseError ? error.code : `unexpected:${String(error)}`;
	}
	return 'no_error';
};

// ---------------------------------------------------------------------------
// Hash stability and the approval binding
// ---------------------------------------------------------------------------

describe('canonical inputs and the two hashes', () => {
	it('serializes equal inputs identically regardless of key order', () => {
		const a = baseInputs();
		const shuffled: ReleaseInputs = {
			students: a.students,
			components: a.components,
			entries: { c2: a.entries.c2, c1: a.entries.c1 },
			submissions: {},
			overrides: {},
		};
		expect(canonicalInputsJson(shuffled)).toBe(canonicalInputsJson(a));
	});

	it('covers exactly the bytes the FNV fingerprint covers', () => {
		// If either canonical serializer drifts, this comparison fails: the FNV
		// fingerprint must be reproducible from the approval serialization.
		expect('fnv1a-' + fnv1a32(canonicalInputsJson(baseInputs()))).toBe(inputsHashOf(baseInputs()));
	});

	it('is a stable sha256 with the prefix, and changes with the inputs', () => {
		const first = approvalHashOf(baseInputs());
		expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
		expect(approvalHashOf(baseInputs())).toBe(first);
		expect(first.startsWith(APPROVAL_HASH_PREFIX)).toBe(true);

		const edited = baseSources();
		edited.entries = edited.entries.map((row) =>
			row.component === 'c1' && row.student === 'stu_a' ? { ...row, value: 79 } : row,
		);
		expect(approvalHashOf(buildReleaseInputs(edited))).not.toBe(first);
	});

	it('never confuses the FNV fingerprint with an approval hash', () => {
		const fnv = inputsHashOf(baseInputs());
		expect(() => normalizeApprovalHash(fnv)).toThrow(GradeReleaseError);
		expect(() => normalizeApprovalHash('')).toThrow(GradeReleaseError);
		expect(() => normalizeApprovalHash('a'.repeat(63))).toThrow(GradeReleaseError);
		const sha = approvalHashOf(baseInputs());
		expect(normalizeApprovalHash(sha.slice(APPROVAL_HASH_PREFIX.length))).toBe(sha);
		expect(normalizeApprovalHash(sha.toUpperCase())).toBe(sha);
	});
});

// ---------------------------------------------------------------------------
// Input mapping
// ---------------------------------------------------------------------------

describe('buildReleaseInputs', () => {
	it('sorts students by id and keeps component order', () => {
		const inputs = baseInputs();
		expect(inputs.students.map((student) => student.id)).toEqual(['stu_a', 'stu_b']);
		expect(inputs.components.map((row) => row.id)).toEqual(['c1', 'c2']);
	});

	it('collapses a chapter-tracked entry to its derived chapter score', () => {
		const sources = baseSources();
		sources.components = [
			component({
				id: 'c1',
				weight: 100,
				chapters: [
					{ id: 'ch1', label: 'Bab 1' },
					{ id: 'ch2', label: 'Bab 2' },
				],
			}),
		];
		sources.entries = [
			{ ...entry('c1', 'stu_a', 0), chapters: { ch1: 'done', ch2: 'partial' } },
			{ ...entry('c1', 'stu_b', 0), chapters: { ch1: 'done', ch2: 'done' } },
		];
		const inputs = buildReleaseInputs(sources);
		// done + partial = 0.75 of the component, not the stored 0.
		expect(inputs.entries.c1.stu_a).toBe(75);
		expect(inputs.entries.c1.stu_b).toBe(100);
	});

	it('uses only graded submissions, newest per assignment and student', () => {
		const sources = baseSources();
		sources.components = [component({ id: 'c1', weight: 100, kind: 'assignment', assignment: 'a1' })];
		sources.entries = [];
		const submission = (id: string, owner: string, grade: number | null, status: string, updated: string): AssignmentSubmission =>
			({ id, owner, assignment: 'a1', group: '', content: '', files: [], link: '', status, grade, feedback: '', gradedBy: '', gradedAt: '', taskAnswers: null, autoScore: null, taskReview: null, created: '', updated }) as AssignmentSubmission;
		sources.submissions = [
			submission('s1', 'stu_a', 70, 'graded', '2026-01-01T00:00:00.000Z'),
			submission('s2', 'stu_a', 88, 'graded', '2026-02-01T00:00:00.000Z'),
			submission('s3', 'stu_b', null, 'graded', '2026-02-01T00:00:00.000Z'),
			submission('s4', 'stu_b', 50, 'submitted', '2026-03-01T00:00:00.000Z'),
		];
		const inputs = buildReleaseInputs(sources);
		expect(inputs.submissions.a1.stu_a).toBe(88);
		// A missing grade and an ungraded submission stay absent, never 0.
		expect('stu_b' in inputs.submissions.a1).toBe(false);
	});

	it('keeps manual bonus adjustments but drops entries for computed components', () => {
		const sources = baseSources();
		sources.components = [
			component({ id: 'c1', weight: 100 }),
			component({ id: 'att', weight: 0, sourceType: 'attendance' }),
			component({ id: 'bon', weight: 0, sourceType: 'bonus' }),
		];
		sources.entries = [
			entry('c1', 'stu_a', 80),
			entry('c1', 'stu_b', 80),
			entry('att', 'stu_a', 100),
			entry('bon', 'stu_a', 2),
		];
		const inputs = buildReleaseInputs(sources);
		expect(inputs.entries.att).toBeUndefined();
		expect(inputs.entries.bon).toEqual({ stu_a: 2 });
	});

	it('leaves an edit that cannot change the result out of the approval hash', () => {
		// A manual entry on a computed component is ignored by the calculation,
		// so it is also excluded from the hash: editing it must not force a new
		// preview and approval for numbers that cannot move.
		const sources = baseSources();
		sources.components = [component({ id: 'c1', weight: 100 }), component({ id: 'att', weight: 0, sourceType: 'attendance' })];
		sources.entries = [entry('c1', 'stu_a', 80), entry('c1', 'stu_b', 80), entry('att', 'stu_a', 100)];
		const before = approvalHashOf(buildReleaseInputs(sources));
		sources.entries = [...sources.entries.filter((row) => row.component !== 'att'), entry('att', 'stu_a', 0)];
		expect(approvalHashOf(buildReleaseInputs(sources))).toBe(before);
	});
});

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

describe('preview', () => {
	it('returns a draft with both hashes and writes nothing', async () => {
		const store = new MemoryStore();
		const preview = await previewReleaseFromStore(store, { courseId: COURSE, ownerId: OWNER });

		expect(preview.revision).toBe(1);
		expect(preview.previousRevision).toBe(0);
		expect(preview.ready).toBe(true);
		expect(preview.inputsHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
		expect(preview.approvalHash).toMatch(/^sha256:[0-9a-f]{64}$/);
		expect(preview.approvalHash).toBe(approvalHashOf(baseInputs()));
		// The FNV value is derivable from the approval serialization: same inputs.
		expect(preview.inputsHash).toBe(inputsHashOf(baseInputs()));
		expect(store.transactions).toBe(0);
		expect(store.releases).toEqual([]);
	});

	it('reports the changed students with before/after final grades', async () => {
		const store = new MemoryStore();
		store.releases.push({
			id: 'rel1',
			course: COURSE,
			owner: OWNER,
			revision: 1,
			status: 'published',
			created: '2026-01-01T00:00:00.000Z',
			publishedAt: '2026-01-01T00:00:00.000Z',
			inputsHash: 'sha256:old',
			reason: '',
			summary: {},
		});
		store.items.set('rel1', [
			{ student: 'stu_a', finalScore: 84, letterGrade: 'A-', complete: true },
			{ student: 'stu_b', finalScore: 94, letterGrade: 'A', complete: true },
		]);
		// One live edit: Ani drops from 84 to 79.6.
		store.sources = baseSources();
		store.sources.entries = store.sources.entries.map((row) =>
			row.component === 'c1' && row.student === 'stu_a' ? { ...row, value: 76 } : row,
		);

		const preview = await previewReleaseFromStore(store, { courseId: COURSE, ownerId: OWNER });
		expect(preview.revision).toBe(2);
		expect(preview.previousRevision).toBe(1);
		expect(preview.previousReleaseId).toBe('rel1');
		expect(preview.counts.changed).toBe(1);
		expect(preview.counts.unchanged).toBe(1);
		expect(preview.changed).toHaveLength(1);
		expect(preview.changed[0]).toMatchObject({
			studentId: 'stu_a',
			nim: '2001',
			before: { finalScore: 84, letterGrade: 'A-', complete: true },
			after: { finalScore: 81.6, letterGrade: 'A-' },
		});
	});

	it('refuses another lecturer’s course', async () => {
		const store = new MemoryStore();
		expect(await codeOf(previewReleaseFromStore(store, { courseId: COURSE, ownerId: 'intruder' }))).toBe('course_not_owned');
		expect(await codeOf(previewReleaseFromStore(store, { courseId: 'missing', ownerId: OWNER }))).toBe('course_not_found');
	});
});

// ---------------------------------------------------------------------------
// Publish — happy path, revision increment, supersede
// ---------------------------------------------------------------------------

describe('publish', () => {
	const approve = async (store: MemoryStore) => {
		const preview = await previewReleaseFromStore(store, { courseId: COURSE, ownerId: OWNER });
		return { preview, revision: preview.revision, expectedHash: preview.approvalHash };
	};

	it('writes the release and every item in one transaction, revision = previous + 1', async () => {
		const store = new MemoryStore();
		const approved = await approve(store);
		const result = await publishReleaseToStore(store, { ownerId: OWNER, courseId: COURSE, ...approved });

		expect(result.revision).toBe(1);
		expect(result.previousRevision).toBe(0);
		expect(result.supersededReleaseId).toBeNull();
		expect(store.transactions).toBe(1);
		expect(store.releases).toHaveLength(1);

		const row = store.releases[0];
		expect(row.status).toBe('published');
		expect(row.revision).toBe(1);
		// The approval binding is the sha256, and the FNV fingerprint rides along
		// in the summary for cross-checking only.
		expect(row.inputsHash).toBe(approved.expectedHash);
		expect(row.summary.inputsFingerprint).toBe(approved.preview.inputsHash);
		expect(store.items.get(row.id)?.map((item) => item.student)).toEqual(['stu_a', 'stu_b']);
		expect(store.items.get(row.id)?.find((item) => item.student === 'stu_a')?.finalScore).toBe(84);
	});

	it('supersedes the previous published release and bumps the revision', async () => {
		const store = new MemoryStore();
		const first = await approve(store);
		const firstRelease = await publishReleaseToStore(store, { ownerId: OWNER, courseId: COURSE, ...first });

		store.sources = baseSources();
		store.sources.entries = store.sources.entries.map((row) =>
			row.component === 'c2' && row.student === 'stu_b' ? { ...row, value: 60 } : row,
		);
		const second = await approve(store);
		expect(second.revision).toBe(2);
		const result = await publishReleaseToStore(store, { ownerId: OWNER, courseId: COURSE, ...second });

		expect(result.revision).toBe(2);
		expect(result.supersededReleaseId).toBe(firstRelease.releaseId);
		expect(store.published()).toHaveLength(1);
		expect(store.published()[0].revision).toBe(2);
		expect(store.releases.filter((row) => row.status === 'superseded').map((row) => row.id)).toEqual([
			firstRelease.releaseId,
		]);
		// The superseded snapshot is retained, not deleted.
		expect(store.items.get(firstRelease.releaseId)).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// Stale detection
// ---------------------------------------------------------------------------

describe('stale detection', () => {
	it('rejects a publish whose live inputs changed after the preview', async () => {
		const store = new MemoryStore();
		const preview = await previewReleaseFromStore(store, { courseId: COURSE, ownerId: OWNER });

		// A concurrent grade edit between preview and publish.
		store.sources = baseSources();
		store.sources.entries = store.sources.entries.map((row) =>
			row.component === 'c1' && row.student === 'stu_a' ? { ...row, value: 10 } : row,
		);

		const code = await codeOf(
			publishReleaseToStore(store, {
				ownerId: OWNER,
				courseId: COURSE,
				revision: preview.revision,
				expectedHash: preview.approvalHash,
			}),
		);
		expect(code).toBe('stale_release_inputs');
		expect(store.transactions).toBe(0);
		expect(store.releases).toEqual([]);
	});

	it('rejects a revision that no longer matches the published head', async () => {
		const store = new MemoryStore();
		const first = await previewReleaseFromStore(store, { courseId: COURSE, ownerId: OWNER });
		await publishReleaseToStore(store, {
			ownerId: OWNER,
			courseId: COURSE,
			revision: first.revision,
			expectedHash: first.approvalHash,
		});

		// The stale preview (revision 1) is replayed after revision 2 exists.
		const code = await codeOf(
			publishReleaseToStore(store, {
				ownerId: OWNER,
				courseId: COURSE,
				revision: first.revision,
				expectedHash: first.approvalHash,
			}),
		);
		expect(code).toBe('stale_release_revision');
		expect(store.transactions).toBe(1);
		expect(store.published()).toHaveLength(1);
	});

	it('refuses a revision that skips ahead', async () => {
		const store = new MemoryStore();
		const preview = await previewReleaseFromStore(store, { courseId: COURSE, ownerId: OWNER });
		const code = await codeOf(
			publishReleaseToStore(store, {
				ownerId: OWNER,
				courseId: COURSE,
				revision: preview.revision + 5,
				expectedHash: preview.approvalHash,
			}),
		);
		expect(code).toBe('stale_release_revision');
		expect(store.transactions).toBe(0);
	});

	it('rejects the FNV fingerprint presented as approval', async () => {
		const store = new MemoryStore();
		const preview = await previewReleaseFromStore(store, { courseId: COURSE, ownerId: OWNER });
		const code = await codeOf(
			publishReleaseToStore(store, {
				ownerId: OWNER,
				courseId: COURSE,
				revision: preview.revision,
				expectedHash: preview.inputsHash,
			}),
		);
		expect(code).toBe('stale_release_inputs');
		expect(store.transactions).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Validation gating
// ---------------------------------------------------------------------------

describe('validation gates publication', () => {
	it('blocks weights that do not total 100 and writes nothing', async () => {
		const sources = baseSources();
		sources.components = [
			component({ id: 'c1', name: 'Tugas', weight: 60 }),
			component({ id: 'c2', name: 'UAS', weight: 30 }),
		];
		const store = new MemoryStore(sources);
		const preview = await previewReleaseFromStore(store, { courseId: COURSE, ownerId: OWNER });
		expect(preview.ready).toBe(false);
		expect(preview.validation.ok).toBe(false);
		expect(preview.validation.ok === false && preview.validation.issues.map((issue) => issue.code)).toContain('weights_not_100');

		const code = await codeOf(
			publishReleaseToStore(store, {
				ownerId: OWNER,
				courseId: COURSE,
				revision: preview.revision,
				expectedHash: preview.approvalHash,
			}),
		);
		expect(code).toBe('release_not_ready');
		expect(store.transactions).toBe(0);
		expect(store.releases).toEqual([]);
	});

	it('blocks an incomplete student and surfaces the machine code', async () => {
		const sources = baseSources();
		sources.entries = sources.entries.filter((row) => row.student === 'stu_a');
		const store = new MemoryStore(sources);
		const preview = await previewReleaseFromStore(store, { courseId: COURSE, ownerId: OWNER });
		expect(preview.counts.incomplete).toBe(1);

		let issues: string[] = [];
		try {
			await publishReleaseToStore(store, {
				ownerId: OWNER,
				courseId: COURSE,
				revision: preview.revision,
				expectedHash: preview.approvalHash,
			});
		} catch (error) {
			issues = error instanceof GradeReleaseError ? error.issues.map((issue) => issue.code) : [];
			expect(error instanceof GradeReleaseError && error.status).toBe(422);
		}
		expect(issues).toContain('incomplete_students');
		expect(store.transactions).toBe(0);
	});

	it('blocks an override without a reason', async () => {
		const sources = baseSources();
		sources.overrides = [{ id: '', owner: OWNER, course: COURSE, student: 'stu_a', value: 70, note: '   ', created: '', updated: '' }];
		const store = new MemoryStore(sources);
		const preview = await previewReleaseFromStore(store, { courseId: COURSE, ownerId: OWNER });
		expect(preview.validation.ok === false && preview.validation.issues.map((issue) => issue.code)).toContain('empty_override_reason');
		expect(
			await codeOf(
				publishReleaseToStore(store, {
					ownerId: OWNER,
					courseId: COURSE,
					revision: preview.revision,
					expectedHash: preview.approvalHash,
				}),
			),
		).toBe('release_not_ready');
		expect(store.transactions).toBe(0);
	});

	it('blocks a course with no students', async () => {
		const sources = baseSources();
		sources.students = [];
		sources.entries = [];
		const store = new MemoryStore(sources);
		const preview = await previewReleaseFromStore(store, { courseId: COURSE, ownerId: OWNER });
		expect(preview.ready).toBe(false);
		expect(preview.validation.ok === false && preview.validation.issues.map((issue) => issue.code)).toContain('no_students');
	});

	it('refuses an out-of-range final score instead of failing inside the transaction', async () => {
		const sources = baseSources();
		sources.overrides = [{ id: '', owner: OWNER, course: COURSE, student: 'stu_a', value: 120, note: 'Keputusan rapat', created: '', updated: '' }];
		const store = new MemoryStore(sources);
		const preview = await previewReleaseFromStore(store, { courseId: COURSE, ownerId: OWNER });
		// `validateRelease` accepts it; the 0–100 column would reject it.
		expect(preview.validation.ok).toBe(true);
		expect(preview.blockers).toHaveLength(1);
		expect(preview.ready).toBe(false);

		const code = await codeOf(
			publishReleaseToStore(store, {
				ownerId: OWNER,
				courseId: COURSE,
				revision: preview.revision,
				expectedHash: preview.approvalHash,
			}),
		);
		expect(code).toBe('release_not_ready');
		expect(store.transactions).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Atomicity and concurrency
// ---------------------------------------------------------------------------

describe('atomicity and concurrency', () => {
	it('writes nothing when the item write fails part-way', async () => {
		const store = new MemoryStore();
		const preview = await previewReleaseFromStore(store, { courseId: COURSE, ownerId: OWNER });
		store.failAtItem = 1; // second item fails inside the transaction

		await expect(
			publishReleaseToStore(store, {
				ownerId: OWNER,
				courseId: COURSE,
				revision: preview.revision,
				expectedHash: preview.approvalHash,
			}),
		).rejects.toThrow('simulated item write failure');

		// Not even the release row survives: no partial release, no orphan items.
		expect(store.transactions).toBe(0);
		expect(store.releases).toEqual([]);
		expect(store.items.size).toBe(0);
	});

	it('serializes two concurrent publishes so only one wins', async () => {
		const store = new MemoryStore();
		const preview = await previewReleaseFromStore(store, { courseId: COURSE, ownerId: OWNER });
		const request = () =>
			publishReleaseToStore(store, {
				ownerId: OWNER,
				courseId: COURSE,
				revision: preview.revision,
				expectedHash: preview.approvalHash,
			});

		const results = await Promise.allSettled([request(), request()]);
		const fulfilled = results.filter((result) => result.status === 'fulfilled');
		const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');

		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect(rejected[0].reason instanceof GradeReleaseError && rejected[0].reason.code).toBe('stale_release_revision');
		expect(store.transactions).toBe(1);
		expect(store.published()).toHaveLength(1);
	});

	it('supersedes its own row when another replica wins the race', async () => {
		const store = new MemoryStore();
		const preview = await previewReleaseFromStore(store, { courseId: COURSE, ownerId: OWNER });
		// A foreign release with the same revision but an earlier created stamp
		// is what the deterministic head rule resolves as the winner.
		store.afterCommit = (write) => {
			store.releases.push({
				id: 'foreign',
				course: COURSE,
				owner: OWNER,
				revision: write.release.revision,
				status: 'published',
				created: '2000-01-01T00:00:00.000Z',
				publishedAt: '2000-01-01T00:00:00.000Z',
				inputsHash: 'sha256:foreign',
				reason: '',
				summary: {},
			});
			store.afterCommit = null;
		};

		const code = await codeOf(
			publishReleaseToStore(store, {
				ownerId: OWNER,
				courseId: COURSE,
				revision: preview.revision,
				expectedHash: preview.approvalHash,
			}),
		);
		expect(code).toBe('stale_release_concurrent');
		expect(store.published().map((row) => row.id)).toEqual(['foreign']);
	});

	it('reports an unverified release when the confirmation read fails', async () => {
		const store = new MemoryStore();
		const preview = await previewReleaseFromStore(store, { courseId: COURSE, ownerId: OWNER });
		store.afterCommit = () => {
			store.readFails = true;
		};
		const code = await codeOf(
			publishReleaseToStore(store, {
				ownerId: OWNER,
				courseId: COURSE,
				revision: preview.revision,
				expectedHash: preview.approvalHash,
			}),
		);
		// The write committed; failing loudly would invite a duplicate publish.
		expect(code).toBe('release_unverified');
		expect(store.transactions).toBe(1);
	});

	it('retires every published row, including a legacy duplicate', async () => {
		const store = new MemoryStore();
		// A legacy state with two published rows: the head is revision 2.
		for (const [id, revision, created] of [
			['legacy1', 1, '2025-01-01T00:00:00.000Z'],
			['legacy2', 2, '2025-02-01T00:00:00.000Z'],
		] as const) {
			store.releases.push({
				id,
				course: COURSE,
				owner: OWNER,
				revision,
				status: 'published',
				created,
				publishedAt: created,
				inputsHash: 'sha256:legacy',
				reason: '',
				summary: {},
			});
		}
		const preview = await previewReleaseFromStore(store, { courseId: COURSE, ownerId: OWNER });
		expect(preview.revision).toBe(3);

		const result = await publishReleaseToStore(store, {
			ownerId: OWNER,
			courseId: COURSE,
			revision: preview.revision,
			expectedHash: preview.approvalHash,
		});
		expect(store.published().map((row) => row.id)).toEqual([result.releaseId]);
		expect(store.releases.filter((row) => row.status === 'superseded').map((row) => row.id).sort()).toEqual([
			'legacy1',
			'legacy2',
		]);
	});
});

// ---------------------------------------------------------------------------
// Deterministic head selection
// ---------------------------------------------------------------------------

describe('currentReleaseOf', () => {
	it('picks the highest revision', () => {
		expect(currentReleaseOf([{ id: 'a', revision: 1, created: '1' }, { id: 'b', revision: 3, created: '2' }])?.id).toBe('b');
	});

	it('breaks a revision tie deterministically on the earliest row', () => {
		expect(
			currentReleaseOf([
				{ id: 'later', revision: 2, created: '2026-01-02T00:00:00.000Z' },
				{ id: 'earlier', revision: 2, created: '2026-01-01T00:00:00.000Z' },
			])?.id,
		).toBe('earlier');
		// The rule is stable regardless of the order rows arrive in.
		expect(
			currentReleaseOf([
				{ id: 'earlier', revision: 2, created: '2026-01-01T00:00:00.000Z' },
				{ id: 'later', revision: 2, created: '2026-01-02T00:00:00.000Z' },
			])?.id,
		).toBe('earlier');
	});

	it('returns undefined when nothing is published', () => {
		expect(currentReleaseOf([])).toBeUndefined();
	});
});
