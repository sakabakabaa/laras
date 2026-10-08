import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://localhost:8090';
const API_PREFIX = '/api/';

async function proxyToPocketBase(request: Request, params: Record<string, string | undefined>) {
	const path = params['*'] || '';
	const target = new URL(`${API_PREFIX}${path}`, POCKETBASE_URL);
	target.search = new URL(request.url).search;

	const headers = new Headers(request.headers);
	headers.delete('host');
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
