import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Codex device login, grant storage and refresh.
 *
 * Every network call is stubbed: these tests describe our contract with the
 * identity provider, not the provider's behaviour. `pocketbaseAdmin` is an
 * in-memory map so the assertions can inspect exactly what would be persisted.
 */

type Row = Record<string, unknown> & { id: string; created?: string };

const db = vi.hoisted(() => ({
	logins: new Map<string, Row>(),
	auth: new Map<string, Row>(),
	providers: new Map<string, Row>(),
	seq: 0,
}));

const nextId = () => {
	db.seq += 1;
	return `rec${String(db.seq).padStart(4, '0')}`;
};

const storeFor = (collection: string) => {
	if (collection === 'ai_codex_logins') return db.logins;
	if (collection === 'ai_provider_codex_auth') return db.auth;
	if (collection === 'ai_providers') return db.providers;
	if (collection === 'ai_provider_secrets') return new Map<string, Row>();
	throw new Error(`unexpected collection ${collection}`);
};

/** Supports only the `field="value"` filters this module actually issues. */
const matches = (row: Row, filter: string): boolean => {
	const match = /^(\w+)="([^"]*)"$/.exec(filter.trim());
	if (!match) return false;
	return String(row[match[1]!] ?? '') === match[2];
};

vi.mock('@/lib/logger.server', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/lib/pocketbase-client.server', () => ({
	pocketbaseAdmin: {
		listRecords: vi.fn(async (collection: string, query: Record<string, unknown> = {}) => {
			const rows = [...storeFor(collection).values()].filter((row) =>
				typeof query.filter === 'string' ? matches(row, query.filter) : true,
			);
			return { items: rows, totalItems: rows.length, page: 1, perPage: 30, totalPages: 1 };
		}),
		getRecord: vi.fn(async (collection: string, id: string) => {
			const row = storeFor(collection).get(id);
			if (!row) throw new Error(`404 ${collection}/${id}`);
			return structuredClone(row);
		}),
		createRecord: vi.fn(async (collection: string, data: Record<string, unknown>) => {
			const row = { id: nextId(), ...structuredClone(data) } as Row;
			storeFor(collection).set(row.id, row);
			return structuredClone(row);
		}),
		updateRecord: vi.fn(async (collection: string, id: string, data: Record<string, unknown>) => {
			const store = storeFor(collection);
			const existing = store.get(id);
			if (!existing) throw new Error(`404 ${collection}/${id}`);
			const row = { ...existing, ...structuredClone(data), id };
			store.set(id, row);
			return structuredClone(row);
		}),
		deleteRecord: vi.fn(async (collection: string, id: string) => {
			storeFor(collection).delete(id);
		}),
	},
}));

/** A JWT-shaped token whose payload is whatever the test needs. */
const jwt = (claims: Record<string, unknown>): string => {
	const encode = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
	return `${encode({ alg: 'none' })}.${encode(claims)}.signature`;
};

const idToken = (accountId: string, plan = 'plus') =>
	jwt({ 'https://api.openai.com/auth': { chatgpt_account_id: accountId, chatgpt_plan_type: plan } });

const jsonResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type FetchCall = { url: string; init: RequestInit };
const calls: FetchCall[] = [];
let handler: (url: string, init: RequestInit) => Response | Promise<Response>;

const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
	calls.push({ url, init });
	return handler(url, init);
});

beforeEach(() => {
	vi.clearAllMocks();
	db.logins.clear();
	db.auth.clear();
	db.providers.clear();
	db.seq = 0;
	calls.length = 0;
	process.env.AI_SETTINGS_KEY = Buffer.alloc(32, 7).toString('base64');
	process.env.CODEX_OAUTH_ENABLED = 'true';
	vi.stubGlobal('fetch', fetchMock);
	handler = () => jsonResponse({});
});

const importModule = async () => import('@/lib/ai/codex-oauth.server');

describe('JWT claim reading', () => {
	it('reads the namespaced auth claim', async () => {
		const mod = await importModule();
		const token = idToken('acct-123', 'pro');
		expect(mod.codexAccountIdOf(token)).toBe('acct-123');
		expect(mod.codexPlanTypeOf(token)).toBe('pro');
	});

	it('accepts a top-level claim as well', async () => {
		const mod = await importModule();
		const token = jwt({ chatgpt_account_id: 'acct-top' });
		expect(mod.codexAccountIdOf(token)).toBe('acct-top');
	});

	it('returns empty strings instead of guessing', async () => {
		const mod = await importModule();
		expect(mod.codexAccountIdOf('not-a-jwt')).toBe('');
		expect(mod.codexAccountIdOf('')).toBe('');
		expect(mod.codexPlanTypeOf(jwt({}))).toBe('');
	});

	it('reads expiry as milliseconds and rejects nonsense', async () => {
		const mod = await importModule();
		expect(mod.jwtExpiryMs(jwt({ exp: 1_700_000_000 }))).toBe(1_700_000_000_000);
		expect(mod.jwtExpiryMs(jwt({ exp: 'soon' }))).toBeNull();
		expect(mod.jwtExpiryMs('garbage')).toBeNull();
	});
});

describe('device login start', () => {
	it('records the pending attempt with the provider settings the lecturer chose', async () => {
		handler = () =>
			jsonResponse({ device_auth_id: 'dev-1', user_code: 'ABCD-1234', interval: '7' });
		const mod = await importModule();
		const login = await mod.startCodexLogin('user1', { label: 'Akun saya', models: ['m1'], isDefault: true });

		expect(login.userCode).toBe('ABCD-1234');
		expect(login.verificationUrl).toBe('https://auth.openai.com/codex/device');
		// `interval` arrives as a string in the Codex source and must be parsed.
		expect(login.intervalSeconds).toBe(7);
		expect(Date.parse(login.expiresAt)).toBeGreaterThan(Date.now());

		const row = db.logins.get(login.loginId)!;
		expect(row).toMatchObject({
			owner: 'user1',
			deviceAuthId: 'dev-1',
			providerLabel: 'Akun saya',
			models: ['m1'],
			isDefault: true,
			status: 'pending',
		});
	});

	it('falls back to a sane interval when the service sends nothing usable', async () => {
		handler = () => jsonResponse({ device_auth_id: 'dev-1', user_code: 'X', interval: 'nonsense' });
		const mod = await importModule();
		const login = await mod.startCodexLogin('user1', { label: 'L', models: ['m'], isDefault: false });
		expect(login.intervalSeconds).toBe(5);
	});

	it('explains a disabled device flow instead of a bare status code', async () => {
		handler = () => jsonResponse({ error: 'nope' }, 404);
		const mod = await importModule();
		await expect(mod.startCodexLogin('user1', { label: 'L', models: ['m'], isDefault: false })).rejects.toThrow(
			/login perangkat tidak tersedia/i,
		);
	});

	it('rejects a response without a code', async () => {
		handler = () => jsonResponse({ device_auth_id: 'dev-1' });
		const mod = await importModule();
		await expect(mod.startCodexLogin('user1', { label: 'L', models: ['m'], isDefault: false })).rejects.toThrow(
			/kode login yang valid/i,
		);
	});
});

describe('device login poll', () => {
	const startPending = async () => {
		handler = () => jsonResponse({ device_auth_id: 'dev-1', user_code: 'CODE', interval: 5 });
		const mod = await importModule();
		const login = await mod.startCodexLogin('user1', { label: 'Akun saya', models: ['m1'], isDefault: false });
		return { mod, login };
	};

	/**
	 * Mirrors what the poll route wires in: a real provider row, created only
	 * after a grant exists. The grant layer takes it as a callback so it never
	 * imports the provider registry.
	 */
	const createProvider = async (settings: { label: string; models: string[]; isDefault: boolean }) => {
		const id = nextId();
		db.providers.set(id, { id, owner: 'user1', kind: 'codex_oauth', enabled: true, capabilities: {}, ...settings });
		return id;
	};

	it('reports pending while the user has not approved', async () => {
		const { mod, login } = await startPending();
		handler = () => jsonResponse({}, 403);
		expect(await mod.pollCodexLogin({ ownerId: 'user1', loginId: login.loginId, createProvider })).toEqual({ status: 'pending' });
		// A pending poll must not create a provider.
		expect(db.providers.size).toBe(0);
	});

	it('creates the provider and stores an encrypted grant once approved', async () => {
		const { mod, login } = await startPending();
		handler = (url) => {
			if (url.endsWith('/api/accounts/deviceauth/token')) {
				return jsonResponse({ authorization_code: 'auth-code', code_verifier: 'verifier-1' });
			}
			if (url.endsWith('/oauth/token')) {
				return jsonResponse({
					id_token: idToken('acct-9', 'plus'),
					access_token: 'access-1',
					refresh_token: 'refresh-1',
				});
			}
			return jsonResponse({}, 500);
		};

		const result = await mod.pollCodexLogin({ ownerId: 'user1', loginId: login.loginId, createProvider });
		expect(result).toMatchObject({ status: 'connected', accountId: 'acct-9', planType: 'plus' });

		// The authorization code is exchanged with the verifier the service handed back.
		const exchange = calls.find((call) => call.url.endsWith('/oauth/token'))!;
		const body = new URLSearchParams(String(exchange.init.body));
		expect(body.get('grant_type')).toBe('authorization_code');
		expect(body.get('code')).toBe('auth-code');
		expect(body.get('code_verifier')).toBe('verifier-1');
		expect(body.get('redirect_uri')).toBe('https://auth.openai.com/deviceauth/callback');

		// Exactly one provider, and it is the Codex kind.
		expect(db.providers.size).toBe(1);
		const provider = [...db.providers.values()][0]!;
		expect(provider).toMatchObject({ kind: 'codex_oauth', label: 'Akun saya', models: ['m1'] });

		// The grant is encrypted, and the row carries only non-secret metadata.
		const auth = [...db.auth.values()][0]!;
		expect(String(auth.ciphertext)).toMatch(/^v1:/);
		expect(JSON.stringify(auth)).not.toContain('access-1');
		expect(JSON.stringify(auth)).not.toContain('refresh-1');
		expect(auth).toMatchObject({ status: 'active', accountId: 'acct-9', planType: 'plus' });

		// The pending login is consumed.
		expect(db.logins.size).toBe(0);
	});

	it('refuses a grant whose token has no account id', async () => {
		const { mod, login } = await startPending();
		handler = (url) => {
			if (url.endsWith('/api/accounts/deviceauth/token')) {
				return jsonResponse({ authorization_code: 'auth-code', code_verifier: 'v' });
			}
			return jsonResponse({ id_token: jwt({}), access_token: 'a', refresh_token: 'r' });
		};
		const result = await mod.pollCodexLogin({ ownerId: 'user1', loginId: login.loginId, createProvider });
		expect(result.status).toBe('failed');
		expect(db.providers.size).toBe(0);
		expect(db.auth.size).toBe(0);
	});

	it('rejects a login owned by someone else', async () => {
		const { mod, login } = await startPending();
		await expect(mod.pollCodexLogin({ ownerId: 'intruder', loginId: login.loginId, createProvider })).rejects.toThrow(/bukan milik Anda/i);
	});

	it('expires an abandoned attempt', async () => {
		const { mod, login } = await startPending();
		const row = db.logins.get(login.loginId)!;
		row.expiresAt = new Date(Date.now() - 1000).toISOString();
		expect(await mod.pollCodexLogin({ ownerId: 'user1', loginId: login.loginId, createProvider })).toEqual({ status: 'expired' });
		expect(db.logins.get(login.loginId)!.status).toBe('expired');
	});

	it('reports failure and stores nothing when the provider factory refuses', async () => {
		const { mod, login } = await startPending();
		// The factory is where the operator flag and input validation live, so a
		// refusal there must not leave a provider or a usable grant behind.
		const refusingFactory = async () => {
			throw new Error('Login akun Codex belum diaktifkan di server ini.');
		};
		handler = (url) => {
			if (url.endsWith('/api/accounts/deviceauth/token')) {
				return jsonResponse({ authorization_code: 'c', code_verifier: 'v' });
			}
			return jsonResponse({ id_token: idToken('acct-1'), access_token: 'a', refresh_token: 'r' });
		};
		const result = await mod.pollCodexLogin({ ownerId: 'user1', loginId: login.loginId, createProvider: refusingFactory });
		expect(result).toMatchObject({ status: 'failed' });
		expect(db.providers.size).toBe(0);
		expect(db.auth.size).toBe(0);
		// The attempt is not consumed, so a retry after the flag is enabled works.
		expect(db.logins.size).toBe(1);
	});
});

describe('credential resolution and refresh', () => {
	/** Seeds a connected provider + grant, bypassing the device flow. */
	const seedConnected = async (options: { lastRefreshDaysAgo: number; accessToken?: string }) => {
		const mod = await importModule();
		const providerId = nextId();
		db.providers.set(providerId, { id: providerId, owner: 'user1', kind: 'codex_oauth', label: 'Akun saya', models: ['m1'] });
		// Use the module's own encryption so the test does not re-implement it.
		const { encryptSecret } = await import('@/lib/ai/secrets.server');
		const authId = nextId();
		db.auth.set(authId, {
			id: authId,
			owner: 'user1',
			provider: providerId,
			ciphertext: encryptSecret(
				JSON.stringify({ accessToken: options.accessToken || 'access-old', refreshToken: 'refresh-old', idToken: idToken('acct-1') }),
			),
			accountId: 'acct-1',
			planType: 'plus',
			expiresAt: new Date(Date.now() + 3600_000).toISOString(),
			lastRefresh: new Date(Date.now() - options.lastRefreshDaysAgo * 86_400_000).toISOString(),
			status: 'active',
			lastError: '',
		});
		return { mod, providerId, authId };
	};

	it('returns the stored token when it is still fresh', async () => {
		const { mod, providerId } = await seedConnected({ lastRefreshDaysAgo: 1 });
		const credentials = await mod.codexCredentialsFor(providerId);
		expect(credentials).toEqual({ accessToken: 'access-old', accountId: 'acct-1' });
		expect(calls).toHaveLength(0);
	});

	it('rotates the refresh token and persists both tokens together', async () => {
		const { mod, providerId, authId } = await seedConnected({ lastRefreshDaysAgo: 10 });
		handler = () => jsonResponse({ access_token: 'access-new', refresh_token: 'refresh-new' });

		const credentials = await mod.codexCredentialsFor(providerId);
		expect(credentials.accessToken).toBe('access-new');

		// ChatGPT refresh is a JSON request, unlike the form-encoded code exchange.
		const sent = JSON.parse(String(calls[0]!.init.body));
		expect(sent).toMatchObject({
			grant_type: 'refresh_token',
			refresh_token: 'refresh-old',
			refresh_reason: 'proactive_expiry',
		});

		const { decryptSecret } = await import('@/lib/ai/secrets.server');
		const stored = JSON.parse(decryptSecret(String(db.auth.get(authId)!.ciphertext)));
		expect(stored.accessToken).toBe('access-new');
		// The rotated refresh token must replace the consumed one.
		expect(stored.refreshToken).toBe('refresh-new');
		// The id token is kept when the service omits a new one.
		expect(stored.idToken).toContain('.');
	});

	it('keeps the old refresh token when the service does not rotate it', async () => {
		const { mod, providerId, authId } = await seedConnected({ lastRefreshDaysAgo: 10 });
		handler = () => jsonResponse({ access_token: 'access-new' });
		await mod.codexCredentialsFor(providerId);
		const { decryptSecret } = await import('@/lib/ai/secrets.server');
		const stored = JSON.parse(decryptSecret(String(db.auth.get(authId)!.ciphertext)));
		expect(stored.refreshToken).toBe('refresh-old');
	});

	it('marks the grant expired on a permanent refresh failure', async () => {
		const { mod, providerId, authId } = await seedConnected({ lastRefreshDaysAgo: 10 });
		handler = () => jsonResponse({ error: 'invalid_grant' }, 401);
		await expect(mod.codexCredentialsFor(providerId)).rejects.toThrow(/tidak berlaku/i);
		expect(db.auth.get(authId)!.status).toBe('expired');
	});

	it('keeps the grant active on a transient refresh failure', async () => {
		const { mod, providerId, authId } = await seedConnected({ lastRefreshDaysAgo: 10 });
		handler = () => jsonResponse({ error: 'upstream' }, 503);
		await expect(mod.codexCredentialsFor(providerId)).rejects.toThrow(/perpanjangan sesi gagal/i);
		expect(db.auth.get(authId)!.status).toBe('error');
	});

	it('asks the lecturer to reconnect when no grant is stored', async () => {
		const mod = await importModule();
		await expect(mod.codexCredentialsFor('missing1')).rejects.toThrow(/belum terhubung/i);
	});

	it('refuses a revoked grant without contacting the service', async () => {
		const { mod, providerId, authId } = await seedConnected({ lastRefreshDaysAgo: 1 });
		db.auth.get(authId)!.status = 'revoked';
		await expect(mod.codexCredentialsFor(providerId)).rejects.toThrow(/tidak berlaku/i);
		expect(calls).toHaveLength(0);
	});
});

describe('disconnect', () => {
	it('revokes upstream and always removes local ciphertext', async () => {
		const mod = await importModule();
		const providerId = nextId();
		const authId = nextId();
		const { encryptSecret } = await import('@/lib/ai/secrets.server');
		db.auth.set(authId, {
			id: authId,
			owner: 'user1',
			provider: providerId,
			ciphertext: encryptSecret(JSON.stringify({ accessToken: 'a', refreshToken: 'r', idToken: '' })),
			accountId: 'acct-1',
			status: 'active',
			lastRefresh: new Date().toISOString(),
			expiresAt: new Date().toISOString(),
			planType: '',
			lastError: '',
		});
		handler = () => jsonResponse({}, 200);
		await mod.forgetCodexGrant(providerId);
		expect(calls[0]!.url).toBe('https://auth.openai.com/oauth/revoke');
		expect(db.auth.size).toBe(0);
	});

	it('still deletes local ciphertext when revoke fails', async () => {
		const mod = await importModule();
		const providerId = nextId();
		const authId = nextId();
		const { encryptSecret } = await import('@/lib/ai/secrets.server');
		db.auth.set(authId, {
			id: authId,
			owner: 'user1',
			provider: providerId,
			ciphertext: encryptSecret(JSON.stringify({ accessToken: 'a', refreshToken: 'r', idToken: '' })),
			accountId: 'acct-1',
			status: 'active',
			lastRefresh: new Date().toISOString(),
			expiresAt: new Date().toISOString(),
			planType: '',
			lastError: '',
		});
		handler = () => jsonResponse({}, 500);
		await mod.forgetCodexGrant(providerId);
		expect(db.auth.size).toBe(0);
	});
});
