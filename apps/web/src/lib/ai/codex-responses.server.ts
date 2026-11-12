/**
 * Codex/ChatGPT backend adapter — the Responses API over an OAuth grant.
 *
 * This is the second transport in `lib/ai`. `openai-compatible.server.ts` speaks
 * Chat Completions with an API key; this module speaks the Responses API to the
 * ChatGPT backend with a ChatGPT account grant. They are separate because the
 * request body, the auth headers and the response stream format all differ.
 *
 * Everything here mirrors the open-source Codex client. Two consequences are
 * worth stating plainly:
 *
 * - This is not a published API. The path and the `originator` value are Codex's
 *   own conventions, kept in `codex-oauth.server.ts` and here so a change is a
 *   small edit rather than a hunt.
 * - We send only what the surface actually needs (text, images, an optional JSON
 *   response format). No tools, no shell, no filesystem. Laras is not running
 *   the Codex agent loop.
 */
import { codexCredentialsFor, CODEX_ACCOUNT_HEADER, CODEX_ORIGINATOR } from './codex-oauth.server';

export type CodexImage = string;

export type CodexRequest = {
	prompt?: string;
	model?: string;
	systemPrompt?: string;
	images?: CodexImage[];
	/** Ask for a JSON object response. Surfaces that parse JSON set this. */
	responseFormat?: { type: 'json_object' };
	timeoutMs?: number;
};

export type CodexResult = {
	content: string;
	model: string;
	providerId: string;
	providerLabel: string;
};

type InputPart =
	| { type: 'input_text'; text: string }
	| { type: 'input_image'; image_url: string };

type InputItem = { type: 'message'; role: 'user' | 'system'; content: InputPart[] };

/**
 * Builds the `input` array.
 *
 * The Codex request has no top-level `instructions` field: base instructions are
 * sent as the first item of `input`. We follow that shape rather than the public
 * Responses `instructions` parameter, because the shape we must match is the one
 * the Codex backend is actually driven with.
 */
const buildInput = (prompt: string, systemPrompt: string | undefined, images: CodexImage[]): InputItem[] => {
	const items: InputItem[] = [];
	if (systemPrompt) items.push({ type: 'message', role: 'system', content: [{ type: 'input_text', text: systemPrompt }] });
	const content: InputPart[] = [{ type: 'input_text', text: prompt }];
	for (const image of images) content.push({ type: 'input_image', image_url: image });
	items.push({ type: 'message', role: 'user', content });
	return items;
};

const responsesUrl = (baseUrl: string): string => `${baseUrl.replace(/\/+$/, '')}/responses`;

/**
 * Extracts assistant text from one Responses SSE event.
 *
 * The backend emits deltas as it generates and a completed item at the end.
 * Both are collected: deltas give a partial result if the stream dies, the
 * completed item is authoritative when present.
 */
type StreamState = { deltas: string; final: string; model: string };

const readEvent = (payload: string, state: StreamState): void => {
	let event: Record<string, unknown>;
	try {
		event = JSON.parse(payload) as Record<string, unknown>;
	} catch {
		return;
	}
	const type = typeof event.type === 'string' ? event.type : '';

	if (type === 'response.output_text.delta') {
		if (typeof event.delta === 'string') state.deltas += event.delta;
		return;
	}

	if (type === 'response.output_item.done') {
		const item = event.item;
		if (item && typeof item === 'object' && !Array.isArray(item)) {
			const record = item as Record<string, unknown>;
			if (record.type === 'message' && Array.isArray(record.content)) {
				const text = record.content
					.map((part) => {
						if (!part || typeof part !== 'object') return '';
						const piece = part as Record<string, unknown>;
						return piece.type === 'output_text' && typeof piece.text === 'string' ? piece.text : '';
					})
					.join('');
				if (text) state.final = text;
			}
		}
		return;
	}

	if (type === 'response.completed') {
		const response = event.response;
		if (response && typeof response === 'object' && !Array.isArray(response)) {
			const record = response as Record<string, unknown>;
			if (typeof record.model === 'string' && record.model) state.model = record.model;
			if (Array.isArray(record.output)) {
				const text = record.output
					.map((item) => {
						if (!item || typeof item !== 'object') return '';
						const entry = item as Record<string, unknown>;
						if (entry.type !== 'message' || !Array.isArray(entry.content)) return '';
						return entry.content
							.map((part) => {
								if (!part || typeof part !== 'object') return '';
								const piece = part as Record<string, unknown>;
								return piece.type === 'output_text' && typeof piece.text === 'string' ? piece.text : '';
							})
							.join('');
					})
					.join('');
				if (text) state.final = text;
			}
		}
		return;
	}

	if (type === 'response.failed') {
		const response = event.response;
		const message =
			response && typeof response === 'object' && !Array.isArray(response)
				? (response as Record<string, unknown>).error
				: undefined;
		const detail =
			message && typeof message === 'object' && !Array.isArray(message)
				? (message as Record<string, unknown>).message
				: undefined;
		throw new Error(typeof detail === 'string' && detail ? detail : 'Model menolak permintaan.');
	}

	if (type === 'error') {
		throw new Error(typeof event.message === 'string' && event.message ? event.message : 'Terjadi kesalahan pada model.');
	}
};

/**
 * Runs one Responses request and returns the assistant's text.
 *
 * `providerId` identifies the provider row so the grant can be loaded and, when
 * needed, refreshed. Credential errors surface as thrown `Error`s with a
 * lecturer-facing message; callers already treat a failed model call as an
 * explicit unavailable state rather than inventing a result.
 */
export async function collectCodexResponse(
	config: { providerId: string; providerLabel: string; baseUrl: string; model: string },
	request: CodexRequest,
): Promise<CodexResult> {
	const { accessToken, accountId } = await codexCredentialsFor(config.providerId);
	if (!accessToken) throw new Error(`Akun Codex untuk "${config.providerLabel}" belum terhubung.`);

	const selectedModel = request.model || config.model;
	if (!selectedModel) throw new Error(`Provider "${config.providerLabel}" belum memiliki model.`);

	const controller = new AbortController();
	const timeoutMs = request.timeoutMs ?? 60_000;
	const timeout = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(responsesUrl(config.baseUrl), {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				[CODEX_ACCOUNT_HEADER]: accountId,
				originator: CODEX_ORIGINATOR,
				'Content-Type': 'application/json',
				Accept: 'text/event-stream',
			},
			body: JSON.stringify({
				model: selectedModel,
				input: buildInput(request.prompt || '', request.systemPrompt, request.images || []),
				// Laras never wants server-side conversation state.
				store: false,
				stream: true,
				...(request.responseFormat ? { text: { format: request.responseFormat } } : {}),
			}),
			signal: controller.signal,
		});

		if (!response.ok || !response.body) {
			// The body can echo request detail; only the status is safe to keep.
			await response.text().catch(() => '');
			throw new Error(
				response.status === 401
					? `Sesi akun Codex untuk "${config.providerLabel}" ditolak. Hubungkan ulang akun Anda.`
					: `${config.providerLabel} gagal menjawab (HTTP ${response.status}).`,
			);
		}

		const state: StreamState = { deltas: '', final: '', model: selectedModel };

		// A JSON body is possible for non-streamed deployments; accept it so the
		// adapter does not depend on a header we do not control.
		if ((response.headers.get('content-type') || '').includes('application/json')) {
			const body = (await response.json()) as Record<string, unknown>;
			readEvent(JSON.stringify({ type: 'response.completed', response: body }), state);
		} else {
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';
				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed.startsWith('data:')) continue;
					const payload = trimmed.slice(5).trim();
					if (!payload || payload === '[DONE]') continue;
					readEvent(payload, state);
				}
			}
			buffer += decoder.decode();
			const tail = buffer.trim();
			if (tail.startsWith('data:')) {
				const payload = tail.slice(5).trim();
				if (payload && payload !== '[DONE]') readEvent(payload, state);
			}
		}

		const content = (state.final || state.deltas).trim();
		if (!content) throw new Error(`${config.providerLabel} mengembalikan jawaban kosong.`);
		return {
			content,
			model: state.model || selectedModel,
			providerId: config.providerId,
			providerLabel: config.providerLabel,
		};
	} finally {
		clearTimeout(timeout);
	}
}
