import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api.server', () => ({
	withApi: (handler: (args: { request: Request }) => unknown) => handler,
	json: (data: unknown, init?: ResponseInit) => Response.json(data, init),
	apiError: (status: number, error: string) => Response.json({ error }, { status }),
	readJsonBody: (request: Request) => request.json(),
}));
vi.mock('@/lib/context-retrieval.server', () => ({ authenticateUser: auth }));

import routes from '../src/routes';
import { action, loader } from '../src/routes/api.builder-capability';

describe('builder capability route registration', () => {
	beforeEach(() => {
		auth.mockReset();
	});

	it('registers the capability API path to its route module', () => {
		expect(routes).toContainEqual(expect.objectContaining({
			path: 'api/builder-capability',
			file: 'routes/api.builder-capability.ts',
		}));
	});

	it('rejects loader requests with an explicit POST allowance', async () => {
		const getResponse = await loader({ request: new Request('http://localhost/api/builder-capability'), params: {} });
		expect(getResponse.status).toBe(405);
		expect(getResponse.headers.get('Allow')).toBe('POST');
		expect(auth).not.toHaveBeenCalled();
	});

	it('routes POST requests through authentication checks', async () => {
		auth.mockResolvedValue({ error: { status: 401, message: 'Unauthorized' } });
		const postResponse = await action({
			request: new Request('http://localhost/api/builder-capability', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({}),
			}),
			params: {},
		});
		expect(postResponse.status).toBe(401);
		expect(auth).toHaveBeenCalledOnce();
	});
});
