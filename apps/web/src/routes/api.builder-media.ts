import PocketBase from 'pocketbase';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { builderMediaTicketKey, openBuilderMediaTicket, sealBuilderMediaTicket } from '@/lib/builder-media-ticket.server';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
const pocketbaseUrl = () =>
	process.env.POCKETBASE_URL || 'http://localhost:8090';
type MediaAsset = { fileId: string; filename: string; version: number };
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
	let key: Buffer;
	try { key = builderMediaTicketKey(); } catch { return failure(503, 'Media sementara tidak tersedia.'); }
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
		const exp = Date.now() + 20 * 60000;
		const ref = { fileId: body.fileId, filename: body.filename, version: body.version };
		const ticket = sealBuilderMediaTicket({ asset: result.asset, token, exp, runId: body.runId, ref }, key);
		return Response.json(
			{ url: '/api/builder-media?ticket=' + ticket },
			{ headers: { 'Cache-Control': 'no-store' } },
		);
	} catch {
		return failure(403, 'Media tidak tersedia untuk kegiatan ini.');
	}
}
export async function loader({ request }: LoaderFunctionArgs) {
	const ticket = new URL(request.url).searchParams.get('ticket') || '';
	let key: Buffer;
	try { key = builderMediaTicketKey(); } catch { return failure(503, 'Media sementara tidak tersedia.'); }
	try {
		const issued = openBuilderMediaTicket(ticket, key);
		const pb = new PocketBase(pocketbaseUrl());
		pb.authStore.save(issued.token, null);
		const authorization = await pb.send('/api/laras/builder-delivery', {
			method: 'POST',
			body: { action: 'media', runId: issued.runId, ...issued.ref },
		});
		if (JSON.stringify(authorization.asset) !== JSON.stringify(issued.asset)) {
			return failure(403, 'Akses media tidak lagi tersedia.');
		}
		const asset = issued.asset;
		const record = await pocketbaseAdmin.getRecord<{
			file: string;
			version: number;
		}>('file_library', asset.fileId);
		let collection = 'file_library',
			recordId = asset.fileId,
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
			recordId = version.id;
			filename = version.fileData;
		}
		const fileToken = await pocketbaseAdmin.getFileToken();
		const headers: Record<string, string> = { 'Accept-Encoding': 'identity' };
		const range = request.headers.get('Range');
		if (range) headers.Range = range;
		const upstream = await fetch(
			`${pocketbaseUrl()}/api/files/${collection}/${recordId}/${encodeURIComponent(filename)}?token=${encodeURIComponent(fileToken)}`,
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
