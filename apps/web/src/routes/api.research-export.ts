/**
 * POST /api/research-export — Phase 6: lecturer/researcher-only research
 * dataset export (CSV or JSON) for one Tugas formal assignment.
 *
 * Returns the file as an attachment. The export is strictly READ-ONLY: it
 * never writes to any collection and never modifies grades, feedback, or any
 * academic record. Authorization is enforced server-side for the assignment
 * owner or an explicitly authorized researcher (RESEARCHER_USER_IDS env var);
 * students are blocked by the auth + ownership check and by the owner-scoped
 * PocketBase list rules. The export carries only pseudonymous participant ids
 * — never student names, emails, NIMs, or the identity mapping.
 */
import { apiError, readJsonBody, withApi } from '@/lib/api.server';
import { buildResearchExport } from '@/lib/research-export.server';
import { buildUptakeExportRows, buildUptakeCsv } from '@/lib/feedback-uptake.server';

type Body = { assignmentId?: string; format?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const body = await readJsonBody<Body>(request);
	const assignmentId = typeof body.assignmentId === 'string' ? body.assignmentId.trim() : '';
	const format = typeof body.format === 'string' ? body.format.trim().toLowerCase() : '';
	if (!assignmentId) return apiError(422, 'assignmentId wajib.');
	if (format !== 'csv' && format !== 'json') {
		return apiError(422, 'format harus "csv" atau "json".');
	}

	const result = await buildResearchExport(request, { assignmentId, format });
	if ('error' in result) return apiError(result.error.status, result.error.message);

	// Phase 9 — extend the export with feedback uptake data (revision
	// associations, hint levels, uptake judgments, reviewer metadata). No
	// direct identifiers; uptake rows are pseudonymized by identityKey.
	const uptakeRows = await buildUptakeExportRows(assignmentId);

	const isCsv = format === 'csv';
	const contentType = isCsv ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8';
	const ext = isCsv ? 'csv' : 'json';

	let bodyText: string;
	if (isCsv) {
		// CSV: ai_feedback_items rows, then a blank line + uptake header + rows.
		const uptakeCsv = uptakeRows.length > 0 ? buildUptakeCsv(uptakeRows) : '';
		bodyText = uptakeCsv ? `${result.csv}\r\n\r\n${uptakeCsv}` : result.csv;
	} else {
		// JSON: merge the uptake section into the existing payload.
		const payload = JSON.parse(result.json);
		payload.feedbackUptake = uptakeRows;
		payload.uptakeItemCount = uptakeRows.length;
		bodyText = JSON.stringify(payload, null, 2);
	}

	return new Response(bodyText, {
		status: 200,
		headers: {
			'Content-Type': contentType,
			'Content-Disposition': `attachment; filename="${result.filename}.${ext}"`,
			'X-Research-Item-Count': String(result.itemCount),
			'X-Research-Participant-Count': String(result.participantCount),
			'X-Research-Uptake-Count': String(uptakeRows.length),
		},
	});
});
