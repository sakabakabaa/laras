/**
 * POST /api/recommendations/review — lecturer review of a recommendation
 * draft (Phase 6).
 *
 * Faculty-only, ownership-verified. The owning lecturer can change a draft's
 * status along the allowed transitions (draft → accepted/dismissed,
 * accepted → acted_on/dismissed, dismissed → draft) and add or edit their own
 * review note. Every status change appends an audit entry (status, reviewer
 * id, timestamp, optional note) — the trail is append-only and never
 * rewritten. Nothing here edits, publishes, assigns, grades, or notifies any
 * course, assignment, or content record; "acted_on" is only a marker the
 * lecturer sets themselves.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { authenticateFaculty } from '@/lib/berkas-versions.server';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

type RecStatus = 'draft' | 'accepted' | 'dismissed' | 'acted_on';

type AuditEntry = { status?: string; reviewerId?: string; at?: string; note?: string };

type RecommendationRecord = {
	id: string;
	owner: string;
	status: RecStatus;
	note?: string;
	audit?: AuditEntry[] | null;
};

/** Allowed status transitions — acted_on is terminal (note edits still allowed). */
const ALLOWED: Record<RecStatus, RecStatus[]> = {
	draft: ['accepted', 'dismissed'],
	accepted: ['acted_on', 'dismissed'],
	dismissed: ['draft'],
	acted_on: [],
};

const STATUS_LABEL: Record<RecStatus, string> = {
	draft: 'draf',
	accepted: 'diterima',
	dismissed: 'ditolak',
	acted_on: 'sudah ditindak',
};

type Body = { id?: string; status?: string; note?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateFaculty(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	const user = auth.user;

	const body = await readJsonBody<Body>(request);
	const id = body.id?.trim();
	if (!id || !SAFE_ID.test(id)) return apiError(422, 'id rekomendasi tidak valid.');

	let record: RecommendationRecord;
	try {
		record = await pocketbaseAdmin.getRecord<RecommendationRecord>('lecturer_recommendations', id);
	} catch {
		return apiError(404, 'Rekomendasi tidak ditemukan.');
	}
	if (record.owner !== user.id) {
		return apiError(403, 'Hanya pemilik rekomendasi yang dapat meninjau rekomendasi ini.');
	}

	const patch: Record<string, unknown> = {};

	if (body.status !== undefined) {
		const next = body.status.trim() as RecStatus;
		if (!(next in STATUS_LABEL)) return apiError(422, 'Status tidak dikenal.');
		const allowed = ALLOWED[record.status] || [];
		if (!allowed.includes(next)) {
			return apiError(
				422,
				`Status "${STATUS_LABEL[record.status]}" tidak dapat diubah ke "${STATUS_LABEL[next]}".`,
			);
		}
		const now = new Date().toISOString();
		const audit = JSON.parse(JSON.stringify(record.audit || [])) as AuditEntry[];
		audit.push({ status: next, reviewerId: user.id, at: now });
		patch.status = next;
		patch.reviewedBy = user.id;
		patch.reviewedAt = now;
		patch.audit = audit;
	}

	if (body.note !== undefined) {
		if (typeof body.note !== 'string') return apiError(422, 'Catatan tidak valid.');
		patch.note = body.note.trim().slice(0, 2000);
	}

	if (Object.keys(patch).length === 0) {
		return apiError(422, 'Tidak ada perubahan yang dikirim.');
	}

	const updated = await pocketbaseAdmin.updateRecord<RecommendationRecord>(
		'lecturer_recommendations',
		id,
		patch,
	);

	return json({ ok: true, record: updated });
});
