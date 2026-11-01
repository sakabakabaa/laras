import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import PocketBase from 'pocketbase';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
const pocketbaseUrl = () =>
	process.env.POCKETBASE_URL || 'http://localhost:8090';
// Process-local key: tickets are short-lived and refreshed by the viewer. A restart
// invalidates old tickets without exposing an account-wide storage credential.
const secret = randomBytes(32);
const sign = (payload: string) =>
	createHmac('sha256', secret).update(payload).digest('base64url');
const failure = (status: number, message: string) =>
	Response.json(
		{ message },
		{ status, headers: { 'Cache-Control': 'no-store' } },
	);
export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== 'POST') return failure(405, 'Method not allowed');
	const token = (request.headers.get('Authorization') || '').replace(
		/^Bearer\s+/i,
		'',
	);
	if (!token) return failure(401, 'Masuk terlebih dahulu.');
	try {
		const body = await request.json();
		const pb = new PocketBase(pocketbaseUrl());
		pb.authStore.save(token, null);
		const result = await pb.send('/api/laras/builder-delivery', {
			method: 'POST',
			body: {
				action: 'media',
				runId: body.runId,
				fileId: body.fileId,
				filename: body.filename,
				version: body.version,
			},
		});
		const payload = Buffer.from(
			JSON.stringify({ asset: result.asset, exp: Date.now() + 20 * 60000 }),
		).toString('base64url');
		return Response.json(
			{ url: '/api/builder-media?ticket=' + payload + '.' + sign(payload) },
			{ headers: { 'Cache-Control': 'no-store' } },
		);
	} catch {
		return failure(403, 'Media tidak tersedia untuk kegiatan ini.');
	}
}
export async function loader({ request }: LoaderFunctionArgs) {
	const ticket = new URL(request.url).searchParams.get('ticket') || '';
	if (ticket.length > 4000) return failure(403, 'Tautan media tidak valid.');
	const [payload, signature, extra] = ticket.split('.');
	if (!payload || !signature || extra)
		return failure(403, 'Tautan media tidak valid.');
	const expected = Buffer.from(sign(payload)),
		actual = Buffer.from(signature);
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
		return failure(403, 'Tautan media tidak valid.');
	try {
		const { asset, exp } = JSON.parse(
			Buffer.from(payload, 'base64url').toString(),
		);
		if (!Number.isFinite(exp) || exp < Date.now())
			return failure(403, 'Tautan media kedaluwarsa. Muat ulang kegiatan.');
		const record = await pocketbaseAdmin.getRecord<{
			file: string;
			version: number;
		}>('file_library', asset.fileId);
		let collection = 'file_library',
			id = asset.fileId,
			filename = asset.filename;
		if (record.file !== filename || (record.version || 1) !== asset.version) {
			const prior = await pocketbaseAdmin.listRecords<{
				id: string;
				fileData: string;
				filename: string;
			}>('file_versions', {
				filter: `file = "${asset.fileId}" && version = ${Number(asset.version)}`,
				perPage: 1,
			});
			const version = prior.items[0];
			if (!version || version.filename !== filename)
				return failure(404, 'Versi media tidak ditemukan.');
			collection = 'file_versions';
			id = version.id;
			filename = version.fileData;
		}
		const fileToken = await pocketbaseAdmin.getFileToken();
		const headers: Record<string, string> = { 'Accept-Encoding': 'identity' };
		const range = request.headers.get('Range');
		if (range) headers.Range = range;
		const upstream = await fetch(
			`${pocketbaseUrl()}/api/files/${collection}/${id}/${encodeURIComponent(filename)}?token=${encodeURIComponent(fileToken)}`,
			{ headers, signal: request.signal },
		);
		if (![200, 206, 416].includes(upstream.status))
			return failure(404, 'Media tidak tersedia.');
		const outgoing = new Headers({
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff',
			'Referrer-Policy': 'no-referrer',
			'Content-Security-Policy':
				"sandbox; default-src 'none'; style-src 'unsafe-inline'",
		});
		for (const key of [
			'content-type',
			'content-length',
			'content-range',
			'accept-ranges',
		]) {
			const value = upstream.headers.get(key);
			if (value) outgoing.set(key, value);
		}
		return new Response(upstream.body, {
			status: upstream.status,
			headers: outgoing,
		});
	} catch {
		return failure(404, 'Media tidak tersedia.');
	}
}
