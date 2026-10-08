/**
 * POST /api/berkas-suggest — generate AI academic-context suggestions.
 *
 * Faculty-only and ownership-verified: the caller must own the library file.
 * Reads the file's stored extraction text plus the lecturer's authorized
 * academic records, asks the platform model for grounded suggestions
 * (language, topics, content sections, optional course/session links), and
 * stores them as `pending` in `context_suggestions`. Nothing is applied to
 * the confirmed context stores — approval is a separate lecturer action.
 *
 * Returns the freshly stored suggestions, or an explicit `insufficient`
 * result with an Indonesian reason when the extraction is empty, the model
 * fails, or the text provides no usable evidence. Never invents tags.
 */
import { apiError, json, readJsonBody, withApi } from '@/lib/api.server';
import { authenticateFaculty } from '@/lib/berkas-versions.server';
import { generateSuggestions } from '@/lib/context-suggestions.server';

type Body = { fileId?: string };

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') return apiError(405, 'Method not allowed');

	const auth = await authenticateFaculty(request);
	if ('error' in auth) return apiError(auth.error.status, auth.error.message);
	const user = auth.user;

	const body = await readJsonBody<Body>(request);
	const fileId = (body.fileId || '').trim();
	if (!/^[A-Za-z0-9]{5,40}$/.test(fileId)) return apiError(422, 'fileId tidak valid.');

	const result = await generateSuggestions({ fileId, ownerId: user.id });

	if (!result.ok) {
		return json({ ok: false, suggestions: [], reason: result.reason });
	}

	return json({
		ok: true,
		bundleId: result.bundleId,
		suggestions: result.suggestions,
		reason: '',
	});
});
