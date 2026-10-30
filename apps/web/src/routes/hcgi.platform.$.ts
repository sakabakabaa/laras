import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://localhost:8090';
const API_PREFIX = '/api/';

/**
 * Hop-by-hop headers must not be forwarded: Node's fetch rejects
 * `Expect: 100-continue` outright (UND_ERR_NOT_SUPPORTED), and
 * connection-level headers are meaningless on a new upstream socket.
 */
const HOP_BY_HOP = [
	'host',
	'expect',
	'connection',
	'keep-alive',
	'transfer-encoding',
	'upgrade',
	'proxy-connection',
	'proxy-authorization',
	'te',
	'trailer',
];

async function proxyToPocketBase(request: Request, params: Record<string, string | undefined>) {
	const path = params['*'] || '';
	const target = new URL(`${API_PREFIX}${path}`, POCKETBASE_URL);
	target.search = new URL(request.url).search;

	const headers = new Headers(request.headers);
	for (const name of HOP_BY_HOP) headers.delete(name);
	// Content-Length is recomputed from the buffered body; a stale value from
	// the inbound request would be wrong after we replace the stream.
	headers.delete('content-length');
	const method = request.method.toUpperCase();
	const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();
	const response = await fetch(target, { method, headers, body, redirect: 'manual' });
	const responseHeaders = new Headers(response.headers);
	responseHeaders.delete('content-encoding');
	responseHeaders.delete('content-length');

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: responseHeaders,
	});
}

export function loader({ request, params }: LoaderFunctionArgs) {
	return proxyToPocketBase(request, params);
}

export function action({ request, params }: ActionFunctionArgs) {
	return proxyToPocketBase(request, params);
}
