import { afterEach, describe, expect, it, vi } from 'vitest';
import { enhancedAuthoringNotice, fetchBuilderCapability } from '../src/lib/builder-capability';

vi.mock('../src/lib/pocketbase-client', () => ({
	default: { authStore: { token: 'session-token' } },
}));

afterEach(() => vi.unstubAllGlobals());

describe('builder capability browser request', () => {
	it('uses the web endpoint with session authentication and shows no denial for enabled authoring', async () => {
		const capability = { authoring: true, readOnlyRendering: true as const, mode: 'on' as const, reason: 'enabled' as const, notice: '' };
		const request = vi.fn().mockResolvedValue(Response.json(capability));
		vi.stubGlobal('fetch', request);
		const document = { activities: [] };
		const result = await fetchBuilderCapability(document);
		expect(request).toHaveBeenCalledWith('/api/builder-capability', expect.objectContaining({
			method: 'POST',
			headers: { Authorization: 'Bearer session-token', 'Content-Type': 'application/json' },
			body: JSON.stringify({ document }),
		}));
		expect(result).toEqual(capability);
		expect(enhancedAuthoringNotice(result, true)).toBe('');
	});

	it('preserves an explicit server denial and its protection notice', async () => {
		const capability = { authoring: false, readOnlyRendering: true as const, mode: 'off' as const, reason: 'disabled' as const, notice: '' };
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(capability)));
		const result = await fetchBuilderCapability();
		expect(result.authoring).toBe(false);
		expect(enhancedAuthoringNotice(result, true)).toContain('hanya-baca');
	});
});
