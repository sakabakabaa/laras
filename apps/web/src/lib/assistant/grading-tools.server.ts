/**
 * Assistant-facing grading tools.
 *
 * These adapters let the lecturer's assistant *read* the gradebook and *prepare*
 * a persisted grade-change proposal. They deliberately cannot approve or apply
 * anything: approval is a separate explicit lecturer action in the review panel
 * (`api.gradebook-commands.ts`), and the approve endpoint is superuser-only so a
 * model tool can never forge consent.
 *
 * The split matters. A tool that both prepared and applied would make the model
 * the authority over an official academic record. Here the model's output is a
 * draft with a stable id, revision and payload hash; a human converts it into a
 * saved grade.
 *
 * Every function takes the lecturer's own PocketBase client, so the collection
 * access rules stay the authorization layer — nothing here escalates.
 */
import type PocketBase from 'pocketbase';
import { prepareGradeChanges, getGradeChangeStatus, type GradeProposal } from '@/lib/gradebook/commands.server';
import type { ScoreOperation } from '@/lib/gradebook/validation';
import { authorizeCourseId } from './authorization.server';
import logger from '@/lib/logger.server';

/** Hard ceiling per proposal, mirroring the route's own limit. */
export const MAX_PROPOSAL_ITEMS = 200;

export type GradebookRow = {
	nim: string;
	name: string;
	studentId: string;
	scores: Record<string, number | null>;
	notes: Record<string, string>;
	missing: string[];
};

export type GradebookView = {
	courseId: string;
	courseTitle: string;
	components: Array<{ id: string; name: string; maxScore: number; weight: number; kind: string; computed: boolean }>;
	rows: GradebookRow[];
	/** True when the returned rows are a page of a larger set. */
	truncated: boolean;
	nextOffset: number | null;
};

const pageSize = 50;

/**
 * Reads a paginated gradebook slice for the assistant.
 *
 * Rows are keyed by NIM so the model resolves a student by the identifier the
 * lecturer actually uses. Names are context only — the plan forbids resolving
 * on a name alone, and the caller is told so in the tool description.
 */
export async function readGradebook(
	pb: PocketBase,
	userId: string,
	input: { courseId: string; offset?: number; componentId?: string },
): Promise<{ ok: true; data: GradebookView } | { ok: false; error: { code: string; message: string } }> {
	const auth = await authorizeCourseId(pb, userId, input.courseId);
	if (!auth.ok) return { ok: false, error: { code: auth.code, message: auth.message } };
	const course = auth.value;

	const components = await pb.collection('grade_components').getFullList<{
		id: string;
		name: string;
		maxScore: number;
		weight: number;
		kind: string;
		status: string;
		computed?: Record<string, unknown>;
	}>({ filter: pb.filter('course={:c} && status="active"', { c: course.id }), sort: 'order,name' });

	const selected = input.componentId ? components.filter((row) => row.id === input.componentId) : components;
	if (input.componentId && selected.length === 0) {
		return { ok: false, error: { code: 'not_found', message: 'Komponen nilai tidak ditemukan pada mata kuliah ini.' } };
	}

	const offset = Math.max(0, Math.trunc(input.offset ?? 0));
	const enrollments = await pb.collection('enrollments').getList<{ expand?: { owner?: { id: string; name?: string; email?: string; nim?: string } } }>(
		Math.floor(offset / pageSize) + 1,
		pageSize,
		{ filter: pb.filter('course={:c}', { c: course.id }), expand: 'owner', sort: 'owner' },
	);

	const studentIds = enrollments.items.map((row) => row.expand?.owner?.id).filter((id): id is string => Boolean(id));
	const entries = studentIds.length
		? await pb.collection('grade_entries').getFullList<{ component: string; student: string; value: number | null; note: string }>({
				filter: selected.map((c) => pb.filter('(component={:c})', { c: c.id })).join(' || ') || 'id=""',
				perPage: 2000,
			})
		: [];
	const byStudent = new Map<string, Map<string, { value: number | null; note: string }>>();
	for (const entry of entries) {
		if (!byStudent.has(entry.student)) byStudent.set(entry.student, new Map());
		byStudent.get(entry.student)?.set(entry.component, { value: entry.value ?? null, note: entry.note || '' });
	}

	const rows: GradebookRow[] = enrollments.items.map((row) => {
		const owner = row.expand?.owner;
		const studentId = owner?.id ?? '';
		const cells = byStudent.get(studentId);
		const scores: Record<string, number | null> = {};
		const notes: Record<string, string> = {};
		const missing: string[] = [];
		for (const component of selected) {
			const cell = cells?.get(component.id);
			// An absent score is "not graded", never zero — the distinction the
			// whole gradebook depends on.
			scores[component.id] = cell?.value ?? null;
			if (cell?.note) notes[component.id] = cell.note;
			if (cell?.value == null) missing.push(component.id);
		}
		return {
			nim: owner?.nim || '',
			name: owner?.name || owner?.email || '',
			studentId,
			scores,
			notes,
			missing,
		};
	});

	return {
		ok: true,
		data: {
			courseId: course.id,
			courseTitle: course.title,
			components: selected.map((component) => ({
				id: component.id,
				name: component.name,
				maxScore: component.maxScore,
				weight: component.weight,
				kind: component.kind,
				// Computed components are read-only through manual entry.
				computed: Boolean(component.computed),
			})),
			rows,
			truncated: enrollments.totalItems > offset + rows.length,
			nextOffset: enrollments.totalItems > offset + rows.length ? offset + rows.length : null,
		},
	};
}

export type PrepareGradeChangeInput = {
	courseId: string;
	operationKey: string;
	items: Array<{ componentId: string; studentId: string; operation: ScoreOperation }>;
};

/**
 * Prepares a persisted grade-change proposal. Never applies it.
 *
 * The returned proposal id, revision and payload hash are what the lecturer
 * reviews; approval is their action, not the model's.
 */
export async function prepareGradeChangeProposal(
	pb: PocketBase,
	userId: string,
	input: PrepareGradeChangeInput,
): Promise<{ ok: true; data: GradeProposal } | { ok: false; error: { code: string; message: string } }> {
	const auth = await authorizeCourseId(pb, userId, input.courseId);
	if (!auth.ok) return { ok: false, error: { code: auth.code, message: auth.message } };

	if (!input.items.length) {
		return { ok: false, error: { code: 'invalid', message: 'Tidak ada perubahan nilai yang disiapkan.' } };
	}
	if (input.items.length > MAX_PROPOSAL_ITEMS) {
		return {
			ok: false,
			error: { code: 'too_many', message: `Satu usulan maksimal ${MAX_PROPOSAL_ITEMS} perubahan. Bagi menjadi beberapa usulan.` },
		};
	}

	try {
		const proposal = await prepareGradeChanges(pb, {
			courseId: auth.value.id,
			operationKey: input.operationKey,
			source: 'assistant_input',
			items: input.items,
		});
		return { ok: true, data: proposal };
	} catch (error) {
		logger.error('assistant grade proposal failed', error);
		// A validation failure is the lecturer's input, not a server fault; say so
		// without echoing student data or a raw database message.
		return {
			ok: false,
			error: { code: 'invalid', message: 'Usulan nilai ditolak. Periksa komponen, mahasiswa, dan batas nilai.' },
		};
	}
}

/** Reads a proposal's validation state, conflicts and verified result. */
export async function readGradeChangeStatus(
	pb: PocketBase,
	userId: string,
	proposalId: string,
): Promise<{ ok: true; data: GradeProposal } | { ok: false; error: { code: string; message: string } }> {
	try {
		const proposal = await getGradeChangeStatus(pb, { proposalId });
		const owned = await pb.collection('grade_change_sets').getOne<{ owner: string }>(proposalId);
		if (owned.owner !== userId) {
			return { ok: false, error: { code: 'forbidden', message: 'Usulan ini bukan milik Anda.' } };
		}
		return { ok: true, data: proposal };
	} catch {
		return { ok: false, error: { code: 'not_found', message: 'Usulan nilai tidak ditemukan.' } };
	}
}
