import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	token: 'lecturer-session-token',
	asset: { fileId: 'file123', filename: 'background.png', version: 2 },
	revoked: false,
	mediaBytes: new Uint8Array([137, 80, 78, 71]),
	adminRecord: { file: 'background.png', version: 2 },
	fileToken: 'private-file-token',
}));

vi.mock('pocketbase', () => ({
	default: class PocketBase {
		authStore = { save: vi.fn() };
		async send(_path: string, options: { body: { action: string } }) {
			if (state.revoked) throw new Error('authorization revoked');
			if (options.body.action !== 'media') throw new Error('unexpected action');
			return { asset: state.asset };
		}
	},
}));

vi.mock('@/lib/pocketbase-client.server', () => ({
	pocketbaseAdmin: {
		getRecord: vi.fn(async () => state.adminRecord),
		listRecords: vi.fn(async () => ({ items: [] })),
		getFileToken: vi.fn(async () => state.fileToken),
	},
}));

import { action, loader } from '../src/routes/api.builder-media';

const makeRequest = (url: string, init?: RequestInit) =>
	new Request(url, init);

describe('builder media route', () => {
	beforeEach(() => {
		state.revoked = false;
		state.adminRecord = { file: 'background.png', version: 2 };
		process.env.BUILDER_MEDIA_TICKET_KEY = '0123456789abcdef'.repeat(4);
		vi.stubGlobal('fetch', vi.fn(async () => new Response(state.mediaBytes, {
			status: 200,
			headers: { 'Content-Type': 'image/png', 'Content-Length': String(state.mediaBytes.length), 'Accept-Ranges': 'bytes' },
		})));
	});

	it('denies an issued ticket after delivery authorization is revoked', async () => {
		const issued = await action({
			request: makeRequest('https://laras.test/api/builder-media', {
				method: 'POST',
				headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ runId: 'run123', ...state.asset }),
			}),
			params: {},
		} as never);
		const { url } = await issued.json() as { url: string };
		state.revoked = true;

		const response = await loader({
			request: makeRequest(`https://laras.test${url}`),
			params: {},
		} as never);

		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ message: 'Media tidak tersedia.' });
		expect(fetch).not.toHaveBeenCalled();
	});

	it('serves valid authorized media with private response headers', async () => {
		const issued = await action({
			request: makeRequest('https://laras.test/api/builder-media', {
				method: 'POST',
				headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({ runId: 'run123', ...state.asset }),
			}),
			params: {},
		} as never);
		const { url } = await issued.json() as { url: string };

		const response = await loader({
			request: makeRequest(`https://laras.test${url}`, { headers: { Range: 'bytes=0-1' } }),
			params: {},
		} as never);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/png');
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(state.mediaBytes);
		expect(fetch).toHaveBeenCalledWith(
			expect.stringContaining('/api/files/file_library/file123/background.png?token=private-file-token'),
			expect.objectContaining({ headers: expect.objectContaining({ Range: 'bytes=0-1' }) }),
		);
	});
});
