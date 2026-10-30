import type { ContentBlock } from '@/lib/integrated-ai.server';
import { SYSTEM_PROMPT } from '@/constants/ai-assistant.config';
import { apiError, readFormData, withApi } from '@/lib/api.server';
import {
	MAX_MESSAGE_BYTES,
	isOwnFileReference,
	resolveChatUserId,
	streamAssistant,
	uploadImages,
} from '@/lib/integrated-ai.server';
import { commitUsage, enforceAiAccess } from '@/lib/ai-usage.server';

const SSE_HEADERS = {
	'Content-Type': 'text/event-stream',
	'Cache-Control': 'no-cache',
	'Connection': 'keep-alive',
	'X-Accel-Buffering': 'no',
};

/**
 * Blocks come straight from the browser, so each one is checked rather than
 * cast. Image references must belong to this site: the server signs them with a
 * PocketBase file token and the model service fetches them.
 */
const toContentBlock = (block: unknown): ContentBlock => {
	if (!block || typeof block !== 'object') {
		throw apiError(400, 'Each content block must be an object');
	}

	const candidate = block as Partial<Record<'type' | 'text' | 'image', unknown>>;

	if (candidate.type === 'text' && typeof candidate.text === 'string') {
		return { type: 'text', text: candidate.text };
	}

	if (candidate.type === 'image' && typeof candidate.image === 'string') {
		if (!isOwnFileReference(candidate.image)) {
			throw apiError(400, 'Image references must point at files uploaded to this site');
		}

		return { type: 'image', image: candidate.image };
	}

	throw apiError(400, 'Each content block must be {type:"text",text} or {type:"image",image}');
};

const parseBlocks = (raw: FormDataEntryValue | null): ContentBlock[] => {
	if (typeof raw !== 'string' || raw.trim() === '') {
		throw apiError(400, 'message is required');
	}

	if (Buffer.byteLength(raw) > MAX_MESSAGE_BYTES) {
		throw apiError(413, 'Message is too long');
	}

	let parsed: unknown;

	try {
		parsed = JSON.parse(raw);
	} catch {
		throw apiError(400, 'message must be JSON-encoded content blocks');
	}

	if (!Array.isArray(parsed) || parsed.length === 0) {
		throw apiError(400, 'message must be a non-empty array of content blocks');
	}

	return parsed.map(toContentBlock);
};

export const action = withApi(async ({ request }) => {
	if (request.method !== 'POST') {
		return apiError(405, 'Method not allowed');
	}

	const form = await readFormData(request);
	const blocks = parseBlocks(form.get('message'));
	const images = form.getAll('images').filter((entry): entry is File => entry instanceof File && entry.size > 0);

	if (images.length > 0) {
		blocks.push(...(await uploadImages({ request, images })).map(image => ({ type: 'image' as const, image })));
	}

	// Rate limit + usage budget + concurrency before streaming. The general
	// assistant resolves the signed-in user; lecturers have their own higher-
	// budget assistant at /api/assistant, so this generic stream uses the
	// student profile (conservative).
	const userId = await resolveChatUserId(request);
	const inputChars = blocks.reduce((sum, b) => sum + (b.type === 'text' ? b.text.length : 0), 0);
	const access = await enforceAiAccess({
		userId: userId ?? 'anonymous',
		role: 'student',
		inputChars,
	});
	if (!access.ok) return apiError(access.status, access.message);

	// The stream runs async after the response is returned; release the
	// concurrency slot once the stream has been initiated. Usage is committed
	// when the model call is initiated (the request was accepted).
	void commitUsage({ userId: userId ?? 'anonymous', role: 'student' });
	const stream = await streamAssistant({ request, systemPrompt: SYSTEM_PROMPT, userMessage: blocks });
	access.release();

	return new Response(stream, { headers: SSE_HEADERS });
});
