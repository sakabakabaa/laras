/**
 * POST /api/recommendations/generate — evidence-based lecturer
 * recommendations (Phase 6, feature-scoped to the insights flow).
 *
 * Faculty-only, ownership-verified. Builds DRAFT recommendations grounded
 * strictly in (a) a Phase 5 "insights" context bundle — only lecturer-approved
 * document sections marked suitable against the active file version — and
 * (b) the lecturer's own aggregate formative Cek-jawaban signals for the same
 * scope. Each saved draft carries its full evidence: exact citations (file,
 * active version, section, page reference, extraction timestamp), the context
 * bundle id and retrieval timestamp, and the aggregate signals used.
 *
 * Explicit insufficient-evidence states (nothing saved, nothing guessed):
 * - the approved material context is insufficient (Phase 5 reason echoed);
 * - no recorded formative signal exists in the scope;
 * - the model produced no usable, citation-grounded draft.
 *
 * Recommendations are drafts for lecturer review only — this route never
 * edits, publishes, assigns, grades, notifies, or changes any course,
 * assignment, or content record.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authenticateFaculty } from '@/lib/berkas-versions.server';
import {
	cpmkOfSubCpmk,
	retrieveContextBundle,
	type RetrievalScope,
} from '@/lib/context-retrieval.server';
import { draftRecommendations, loadInsightSignals } from '@/lib/lecturer-recommendations.server';
import type { Assignment } from '@/lib/assignments';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

type Body = { courseId?: string; assignmentId?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateFaculty(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	const user = auth.user;

	const body = await readJsonBody<Body>(request);
	let scope: RetrievalScope;
	let scopeLabel: string;
	let signalAssignments: { id: string; title: string; checkMax?: number | null }[];

	if (body.assignmentId) {
		const id = body.assignmentId.trim();
		if (!SAFE_ID.test(id)) return apiError(422, 'assignmentId tidak valid.');
		let assignment: Assignment;
		try {
			assignment = await pocketbaseAdmin.getRecord<Assignment>('assignments', id);
		} catch {
			return apiError(404, 'Tugas tidak ditemukan.');
		}
		if (assignment.owner !== user.id) {
			return apiError(403, 'Hanya pemilik tugas yang dapat menyusun rekomendasi.');
		}
		scope = {
			course: assignment.course,
			session: assignment.session || '',
			subCpmk: assignment.subCpmk || '',
			cpmk: await cpmkOfSubCpmk(assignment.subCpmk || ''),
			assignment: assignment.id,
		};
		scopeLabel = `tugas "${assignment.title}"`;
		signalAssignments = [
			{ id: assignment.id, title: assignment.title, checkMax: assignment.checkMax },
		];
	} else if (body.courseId) {
		const id = body.courseId.trim();
		if (!SAFE_ID.test(id)) return apiError(422, 'courseId tidak valid.');
		let course: { id: string; owner: string; title: string };
		try {
			course = await pocketbaseAdmin.getRecord<{ id: string; owner: string; title: string }>(
				'courses',
				id,
			);
		} catch {
			return apiError(404, 'Mata kuliah tidak ditemukan.');
		}
		if (course.owner !== user.id) {
			return apiError(403, 'Hanya pemilik mata kuliah yang dapat menyusun rekomendasi.');
		}
		scope = { course: course.id };
		const owned = await pocketbaseAdmin.listRecords<Assignment>('assignments', {
			filter: `course = "${course.id}" && owner = "${user.id}"`,
			fields: 'id,title,checkMax',
			perPage: 200,
		});
		signalAssignments = owned.items.map((a) => ({
			id: a.id,
			title: a.title,
			checkMax: a.checkMax,
		}));
		scopeLabel = `mata kuliah "${course.title}"`;
	} else {
		return apiError(422, 'courseId atau assignmentId wajib diisi.');
	}

	// ── Grounding 1: Phase 5 approved material context (insights feature) ──
	const bundle = await retrieveContextBundle({
		feature: 'insights',
		scope,
		requester: { id: user.id, role: 'faculty', label: `faculty:${user.id}` },
		ownerLecturerId: user.id,
	});
	if (bundle.result !== 'sufficient') {
		return json({
			ok: true,
			result: 'insufficient',
			reason: `Konteks materi yang disetujui belum cukup: ${bundle.reason}`,
		});
	}

	// ── Grounding 2: the lecturer's own aggregate formative signals ──
	const signals = await loadInsightSignals(signalAssignments);
	if (signals.total === 0) {
		return json({
			ok: true,
			result: 'insufficient',
			reason:
				'Belum ada riwayat Cek jawaban pada lingkup ini. Rekomendasi tindakan memerlukan sinyal kesulitan yang tercatat — tidak ada yang dikarang.',
		});
	}

	// ── Draft generation, validated against the bundle's citations ──
	const drafts = await draftRecommendations({ bundle, signals, scopeLabel });
	if (!drafts.ok) {
		return json({ ok: true, result: 'insufficient', reason: drafts.reason });
	}

	const now = new Date().toISOString();
	const created: unknown[] = [];
	for (const draft of drafts.drafts) {
		const record = await pocketbaseAdmin.createRecord('lecturer_recommendations', {
			owner: user.id,
			scope: {
				course: scope.course,
				cpmk: scope.cpmk || '',
				subCpmk: scope.subCpmk || '',
				session: scope.session || '',
				assignment: scope.assignment || '',
			},
			bundleId: bundle.bundleId,
			evidence: {
				bundleId: bundle.bundleId,
				retrievedAt: bundle.retrievedAt,
				citations: draft.citations,
				signals: {
					total: signals.total,
					participants: signals.participants,
					areas: signals.areas.slice(0, 5),
					levels: signals.levels,
					fullQuota: signals.fullQuota,
				},
				limits: bundle.limits,
			},
			observed: draft.observed,
			interpretation: draft.interpretation,
			action: draft.action,
			signal: draft.signal,
			status: 'draft',
			note: '',
			audit: [
				{
					status: 'draft',
					at: now,
					note: `Draf disusun dari bundel konteks ${bundle.bundleId}`,
				},
			],
		});
		created.push(record);
	}

	return json({
		ok: true,
		result: 'sufficient',
		recommendations: created,
		bundle: {
			bundleId: bundle.bundleId,
			retrievedAt: bundle.retrievedAt,
			sectionCount: bundle.sectionCount,
			charCount: bundle.charCount,
		},
		signals: { total: signals.total, participants: signals.participants },
		note: 'Rekomendasi berupa draf untuk tinjauan dosen — tidak ada yang diubah otomatis.',
	});
});
