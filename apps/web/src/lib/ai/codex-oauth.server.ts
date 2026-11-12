/**
 * Codex/ChatGPT OAuth provider — device login, grant storage and refresh.
 *
 * A `codex_oauth` provider is not an API key: it is an OAuth grant that
 * identifies one lecturer's ChatGPT account, expires, rotates on refresh, and
 * can be revoked. This module owns every interaction with the identity provider
 * so that the rest of the app only ever sees `{ accessToken, accountId }`.
 *
 * ## Why device code and not a loopback callback
 *
 * Codex's browser login redirects to `http://127.0.0.1:<port>/auth/callback`,
 * which only works when the browser and the process are the same machine.
 * Laras runs on a host the lecturer does not run locally, so that callback can
 * never complete. The device flow needs no redirect: the lecturer opens a
 * verification page and types a short code.
 *
 * ## What is our contract and what is not
 *
 * The endpoint paths, the client id and the request bodies below mirror the
 * open-source Codex client (`codex-rs/login/src/device_code_auth.rs`,
 * `codex-rs/login/src/server.rs`, `codex-rs/login/src/auth/manager.rs`). They
 * are an implementation detail of another product, not a published API. They
 * are centralised here so a change is a one-file edit, and the whole feature
 * sits behind `CODEX_OAUTH_ENABLED`.
 *
 * ## What this module will not do
 *
 * - It never logs a token, an authorization code or a PKCE verifier.
 * - It never returns token material to a caller that might serialise it: the
 *   only export that yields a token is `codexCredentialsFor`, used server-side.
 * - It never verifies JWT signatures. Claims are read for routing and display
 *   only (which account, which plan); they never authorise anything on their
 *   own. Authority comes from the access token being accepted by the backend.
 */
import logger from '@/lib/logger.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { decryptSecret, encryptSecret } from './secrets.server';

/** Identity provider, client id and backend base — see the module doc. */
export const CODEX_ISSUER = 'https://auth.openai.com';
export const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
/**
 * Inference base for ChatGPT-auth accounts. Codex appends `/responses` to it, so
 * the full URL is `https://chatgpt.com/backend-api/codex/responses`.
 *
 * This is NOT the same as the plain `https://chatgpt.com/backend-api` used for
 * routing context; mixing them up yields a 404 from the backend.
 */
export const CODEX_CHATGPT_BASE_URL = 'https://chatgpt.com/backend-api/codex';
/** Header value the backend expects from a Codex-family client. */
export const CODEX_ORIGINATOR = 'codex_cli_rs';
/** `chatgpt-account-id` — required on every backend request. */
export const CODEX_ACCOUNT_HEADER = 'chatgpt-account-id';

/** A pending device login expires after 15 minutes, matching Codex. */
const DEVICE_LOGIN_TTL_MS = 15 * 60 * 1000;
/** Refresh this long before the access token expires. */
const REFRESH_WINDOW_MS = 5 * 60 * 1000;
/** Refresh at least this often even when the token looks fresh. */
const REFRESH_INTERVAL_MS = 8 * 24 * 60 * 60 * 1000;
/** Default poll cadence when the service does not send a usable interval. */
const DEFAULT_POLL_INTERVAL_SECONDS = 5;

const REQUEST_TIMEOUT_MS = 20_000;

export type CodexAuthStatus = 'active' | 'expired' | 'revoked' | 'error';

/** What the UI may see about a connection. Never contains token material. */
export type CodexConnection = {
	accountId: string;
	planType: string;
	status: CodexAuthStatus;
	expiresAt: string | null;
	lastRefresh: string | null;
	lastError: string;
};

export type CodexAuthRow = {
	id: string;
	owner: string;
	provider: string;
	ciphertext: string;
	accountId: string;
	planType: string;
	expiresAt: string;
	lastRefresh: string;
	status: CodexAuthStatus;
	lastError: string;
};

type CodexLoginRow = {
	id: string;
	owner: string;
	deviceAuthId: string;
	userCode: string;
	verificationUrl: string;
	intervalSeconds: number;
	providerLabel: string;
	models: string[];
	isDefault: boolean;
	expiresAt: string;
	status: string;
};

/** Decrypted grant. Never serialise this. */
type CodexTokens = { accessToken: string; refreshToken: string; idToken: string };

/** Operator switch. Off unless explicitly enabled — see the design doc. */
export const isCodexOAuthEnabled = (): boolean => process.env.CODEX_OAUTH_ENABLED === 'true';

/**
 * A message safe to show a lecturer. Upstream bodies can echo credential
 * material, so only fixed strings and status codes leave this module.
 */
const safeMessage = (error: unknown, fallback: string): string => {
	if (error instanceof Error && error.message) return error.message;
	return fallback;
};

const postJson = async (url: string, body: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify(body),
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timer);
	}
};

const postForm = async (url: string, body: Record<string, string>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/json',
			},
			body: new URLSearchParams(body).toString(),
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timer);
	}
};

// ── JWT claim reading (routing and display only, never authorisation) ──────

/**
 * Decodes a JWT payload without verifying the signature.
 *
 * This is deliberately not a security check. The access token is only ever
 * trusted because the backend accepts it; these claims just tell us which
 * account to address and which plan to display.
 */
export const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
	const parts = (token || '').split('.');
	if (parts.length < 2) return null;
	try {
		const payload = Buffer.from(parts[1]!, 'base64url').toString('utf8');
		const parsed: unknown = JSON.parse(payload);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
};

/** [OI] nests account claims under a namespaced key; accept both shapes. */
const authClaimsOf = (token: string): Record<string, unknown> => {
	const payload = decodeJwtPayload(token);
	if (!payload) return {};
	const namespaced = payload['https://api.openai.com/auth'];
	return namespaced && typeof namespaced === 'object' && !Array.isArray(namespaced)
		? { ...payload, ...(namespaced as Record<string, unknown>) }
		: payload;
};

/** The `chatgpt_account_id` claim, or '' when the token does not carry one. */
export const codexAccountIdOf = (idToken: string): string => {
	const claim = authClaimsOf(idToken).chatgpt_account_id;
	return typeof claim === 'string' ? claim.trim() : '';
};

/** The `chatgpt_plan_type` claim, or '' when absent. Display only. */
export const codexPlanTypeOf = (idToken: string): string => {
	const claim = authClaimsOf(idToken).chatgpt_plan_type;
	return typeof claim === 'string' ? claim.trim() : '';
};

/** `exp` in milliseconds, or null when the token carries no usable expiry. */
export const jwtExpiryMs = (token: string): number | null => {
	const exp = decodeJwtPayload(token)?.exp;
	if (typeof exp === 'number' && Number.isFinite(exp) && exp > 0) return exp * 1000;
	return null;
};

// ── Grant storage ─────────────────────────────────────────────────────────

const encryptTokens = (tokens: CodexTokens): string =>
	encryptSecret(JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, idToken: tokens.idToken }));

const decryptTokens = (ciphertext: string): CodexTokens | null => {
	try {
		const parsed: unknown = JSON.parse(decryptSecret(ciphertext));
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
		const row = parsed as Record<string, unknown>;
		const accessToken = typeof row.accessToken === 'string' ? row.accessToken : '';
		const refreshToken = typeof row.refreshToken === 'string' ? row.refreshToken : '';
		const idToken = typeof row.idToken === 'string' ? row.idToken : '';
		if (!accessToken || !refreshToken) return null;
		return { accessToken, refreshToken, idToken };
	} catch {
		// A decryption failure is a configuration problem, not a bad password.
		// Callers turn null into an explicit "reconnect" state.
		return null;
	}
};

const authRowFor = async (providerId: string): Promise<CodexAuthRow | null> => {
	const rows = await pocketbaseAdmin.listRecords<CodexAuthRow>('ai_provider_codex_auth', {
		filter: `provider="${providerId}"`,
		perPage: 1,
	});
	return rows.items[0] || null;
};

/** Public connection state for one provider, or null when not connected. */
export const codexConnectionFor = async (providerId: string): Promise<CodexConnection | null> => {
	const row = await authRowFor(providerId);
	if (!row) return null;
	return {
		accountId: row.accountId || '',
		planType: row.planType || '',
		status: (row.status || 'error') as CodexAuthStatus,
		expiresAt: row.expiresAt || null,
		lastRefresh: row.lastRefresh || null,
		lastError: row.lastError || '',
	};
};

/**
 * Persists a freshly issued or refreshed grant.
 *
 * The ciphertext and the metadata that describes it are written in one update
 * so a rotated refresh token can never be lost while the old expiry survives.
 */
const persistTokens = async (input: {
	providerId: string;
	ownerId: string;
	tokens: CodexTokens;
}): Promise<CodexAuthRow> => {
	const { providerId, ownerId, tokens } = input;
	const accountId = codexAccountIdOf(tokens.idToken);
	const planType = codexPlanTypeOf(tokens.idToken);
	const expiry = jwtExpiryMs(tokens.accessToken);
	const now = Date.now();
	const payload = {
		owner: ownerId,
		provider: providerId,
		ciphertext: encryptTokens(tokens),
		accountId,
		planType,
		expiresAt: new Date(expiry ?? now + REFRESH_INTERVAL_MS).toISOString(),
		lastRefresh: new Date(now).toISOString(),
		status: 'active',
		lastError: '',
	};

	const existing = await authRowFor(providerId);
	if (existing) {
		return pocketbaseAdmin.updateRecord<CodexAuthRow>('ai_provider_codex_auth', existing.id, payload);
	}
	return pocketbaseAdmin.createRecord<CodexAuthRow>('ai_provider_codex_auth', payload);
};

// ── Device login ──────────────────────────────────────────────────────────

export type StartedCodexLogin = {
	loginId: string;
	userCode: string;
	verificationUrl: string;
	intervalSeconds: number;
	expiresAt: string;
};

const parseInterval = (value: unknown): number => {
	const raw = typeof value === 'string' ? Number.parseInt(value.trim(), 10) : typeof value === 'number' ? value : NaN;
	return Number.isFinite(raw) && raw >= 1 && raw <= 60 ? Math.trunc(raw) : DEFAULT_POLL_INTERVAL_SECONDS;
};

/**
 * Requests a device code and records the pending attempt.
 *
 * No provider row exists yet: a provider is only created once the grant is
 * actually issued, so an abandoned login leaves nothing behind but an expired
 * `ai_codex_logins` row. The provider settings the lecturer chose are stored on
 * that row so the poll endpoint finishes exactly the request that was started.
 */
export const startCodexLogin = async (
	ownerId: string,
	input: { label: string; models: string[]; isDefault: boolean },
): Promise<StartedCodexLogin> => {
	const response = await postJson(`${CODEX_ISSUER}/api/accounts/deviceauth/usercode`, {
		client_id: CODEX_CLIENT_ID,
	});
	if (!response.ok) {
		// 404 is what Codex reports when device login is disabled server-side.
		throw new Error(
			response.status === 404
				? 'Login perangkat tidak tersedia untuk layanan ini. Hubungi admin atau gunakan provider kunci API.'
				: `Permintaan kode login gagal (HTTP ${response.status}).`,
		);
	}
	const body = (await response.json()) as { device_auth_id?: unknown; user_code?: unknown; interval?: unknown };
	const deviceAuthId = typeof body.device_auth_id === 'string' ? body.device_auth_id : '';
	const userCode = typeof body.user_code === 'string' ? body.user_code : '';
	if (!deviceAuthId || !userCode) throw new Error('Layanan tidak mengembalikan kode login yang valid.');

	const expiresAt = new Date(Date.now() + DEVICE_LOGIN_TTL_MS).toISOString();
	const row = await pocketbaseAdmin.createRecord<CodexLoginRow>('ai_codex_logins', {
		owner: ownerId,
		deviceAuthId,
		userCode,
		verificationUrl: `${CODEX_ISSUER}/codex/device`,
		intervalSeconds: parseInterval(body.interval),
		providerLabel: input.label,
		models: input.models,
		isDefault: input.isDefault,
		expiresAt,
		status: 'pending',
	});

	return {
		loginId: row.id,
		userCode,
		verificationUrl: row.verificationUrl,
		intervalSeconds: row.intervalSeconds || DEFAULT_POLL_INTERVAL_SECONDS,
		expiresAt,
	};
};

const exchangeAuthorizationCode = async (input: {
	code: string;
	codeVerifier: string;
}): Promise<CodexTokens> => {
	const response = await postForm(`${CODEX_ISSUER}/oauth/token`, {
		grant_type: 'authorization_code',
		client_id: CODEX_CLIENT_ID,
		code: input.code,
		redirect_uri: `${CODEX_ISSUER}/deviceauth/callback`,
		code_verifier: input.codeVerifier,
	});
	if (!response.ok) {
		throw new Error(`Pertukaran kode otorisasi gagal (HTTP ${response.status}).`);
	}
	const body = (await response.json()) as { id_token?: unknown; access_token?: unknown; refresh_token?: unknown };
	const idToken = typeof body.id_token === 'string' ? body.id_token : '';
	const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
	const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : '';
	if (!accessToken || !refreshToken) throw new Error('Layanan tidak mengembalikan token yang lengkap.');
	if (!codexAccountIdOf(idToken)) {
		// Without the account id every backend call would be rejected, so fail
		// here with an actionable message instead of a 401 later.
		throw new Error('Token tidak memuat chatgpt_account_id. Akun ini mungkin belum punya akses Codex.');
	}
	return { accessToken, refreshToken, idToken };
};

export type CodexPollResult =
	| { status: 'pending' }
	| { status: 'expired' }
	| { status: 'failed'; message: string }
	| { status: 'connected'; providerId: string; accountId: string; planType: string };

/**
 * Polls one device login attempt.
 *
 * The caller polls on `intervalSeconds`; this function performs exactly one
 * upstream poll so a request never blocks for the full 15-minute window.
 *
 * `createProvider` is injected by the caller rather than imported: the provider
 * registry imports this module, so importing it back would create a cycle. It
 * runs only after a grant has actually been issued.
 */
export const pollCodexLogin = async (input: {
	ownerId: string;
	loginId: string;
	createProvider: (settings: { label: string; models: string[]; isDefault: boolean }) => Promise<string>;
}): Promise<CodexPollResult> => {
	const row = await pocketbaseAdmin.getRecord<CodexLoginRow>('ai_codex_logins', input.loginId);
	if (row.owner !== input.ownerId) throw new Error('Login bukan milik Anda.');
	if (row.status !== 'pending') return { status: 'failed', message: 'Login sudah selesai atau dibatalkan.' };
	if (Date.parse(row.expiresAt) <= Date.now()) {
		await pocketbaseAdmin.updateRecord('ai_codex_logins', row.id, { status: 'expired' });
		return { status: 'expired' };
	}

	const response = await postJson(`${CODEX_ISSUER}/api/accounts/deviceauth/token`, {
		device_auth_id: row.deviceAuthId,
		user_code: row.userCode,
	});

	// 403/404 mean "not approved yet"; anything else is a real failure.
	if (response.status === 403 || response.status === 404) return { status: 'pending' };
	if (!response.ok) {
		return { status: 'failed', message: `Pemeriksaan login gagal (HTTP ${response.status}).` };
	}

	const body = (await response.json()) as {
		authorization_code?: unknown;
		code_verifier?: unknown;
	};
	const code = typeof body.authorization_code === 'string' ? body.authorization_code : '';
	const codeVerifier = typeof body.code_verifier === 'string' ? body.code_verifier : '';
	if (!code || !codeVerifier) {
		return { status: 'failed', message: 'Layanan tidak mengembalikan kode otorisasi yang lengkap.' };
	}

	let tokens: CodexTokens;
	try {
		tokens = await exchangeAuthorizationCode({ code, codeVerifier });
	} catch (error) {
		return { status: 'failed', message: safeMessage(error, 'Pertukaran token gagal.') };
	}

	// Provider row is created only now, so an abandoned login never leaves a
	// half-configured provider in the lecturer's list. The factory is injected
	// rather than imported: this module must not depend on the provider
	// registry, which depends on it.
	let providerId: string;
	try {
		providerId = await input.createProvider({
			label: row.providerLabel,
			models: row.models,
			isDefault: row.isDefault === true,
		});
	} catch (error) {
		return { status: 'failed', message: safeMessage(error, 'Gagal menyimpan provider Codex.') };
	}
	await persistTokens({ providerId, ownerId: input.ownerId, tokens });
	await pocketbaseAdmin.deleteRecord('ai_codex_logins', row.id);

	return {
		status: 'connected',
		providerId,
		accountId: codexAccountIdOf(tokens.idToken),
		planType: codexPlanTypeOf(tokens.idToken),
	};
};

/** Drops a pending attempt the lecturer abandoned. */
export const cancelCodexLogin = async (ownerId: string, loginId: string): Promise<void> => {
	try {
		const row = await pocketbaseAdmin.getRecord<CodexLoginRow>('ai_codex_logins', loginId);
		if (row.owner === ownerId) await pocketbaseAdmin.deleteRecord('ai_codex_logins', loginId);
	} catch {
		// Already gone — cancelling twice is not an error.
	}
};

// ── Refresh ───────────────────────────────────────────────────────────────

/**
 * Serialises refreshes per provider inside this process.
 *
 * Refresh tokens rotate, so two concurrent refreshes would race and one would
 * persist a token the service has already invalidated. Laras runs one web
 * process; a multi-replica deployment would need a database-level lock here.
 */
const refreshLocks = new Map<string, Promise<CodexTokens>>();

/**
 * Exchanges a refresh token for a new grant.
 *
 * ChatGPT refresh is a JSON request (authorization-code exchange is form
 * encoded), and every response field is optional. Rotation means a returned
 * `refresh_token` replaces the stored one, while an absent one means "keep the
 * current token" — getting this backwards loses the grant permanently.
 *
 * Failure classification follows the client: `refresh_token_expired`,
 * `refresh_token_reused` and `refresh_token_invalidated`, plus HTTP 401 or a
 * 400 `invalid_grant`, are permanent and require a fresh login. Anything else
 * (5xx, network) is transient and must not throw the grant away.
 */
const refreshTokens = async (refreshToken: string): Promise<CodexTokens> => {
	const response = await postJson(`${CODEX_ISSUER}/oauth/token`, {
		grant_type: 'refresh_token',
		client_id: CODEX_CLIENT_ID,
		refresh_token: refreshToken,
		refresh_reason: 'proactive_expiry',
	});

	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as
			| { error?: { code?: unknown; type?: unknown }; code?: unknown }
			| null;
		const code =
			typeof body?.error === 'object' && body.error && typeof body.error.code === 'string'
				? body.error.code
				: typeof body?.code === 'string'
					? body.code
					: '';
		const permanent =
			response.status === 401 ||
			code === 'refresh_token_expired' ||
			code === 'refresh_token_reused' ||
			code === 'refresh_token_invalidated' ||
			(response.status === 400 && code === 'invalid_grant');
		const message =
			code === 'refresh_token_reused'
				? 'Sesi akun Codex sudah dipakai di tempat lain. Hubungkan ulang akun Anda.'
				: permanent
					? 'Sesi akun Codex sudah tidak berlaku. Hubungkan ulang akun Anda.'
					: `Perpanjangan sesi gagal (HTTP ${response.status}).`;
		const error = new Error(message);
		(error as Error & { permanent?: boolean }).permanent = permanent;
		throw error;
	}

	const body = (await response.json()) as { id_token?: unknown; access_token?: unknown; refresh_token?: unknown };
	const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
	if (!accessToken) throw new Error('Layanan tidak mengembalikan access token.');
	const idToken = typeof body.id_token === 'string' && body.id_token ? body.id_token : '';
	const rotated = typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : refreshToken;
	return { accessToken, refreshToken: rotated, idToken };
};

const markStatus = async (row: CodexAuthRow, status: CodexAuthStatus, lastError: string): Promise<void> => {
	await pocketbaseAdmin.updateRecord('ai_provider_codex_auth', row.id, { status, lastError });
};

const needsRefresh = (row: CodexAuthRow, tokens: CodexTokens): boolean => {
	const expiry = jwtExpiryMs(tokens.accessToken);
	if (expiry != null) return expiry - Date.now() <= REFRESH_WINDOW_MS;
	const lastRefresh = Date.parse(row.lastRefresh || '');
	if (!Number.isFinite(lastRefresh)) return true;
	return Date.now() - lastRefresh >= REFRESH_INTERVAL_MS;
};

/**
 * Returns a usable access token for one provider, refreshing when needed.
 *
 * Throws with an actionable message when the grant cannot be used. It never
 * falls back to another provider: silently spending a different account's
 * quota is worse than a clear failure.
 */
export const codexCredentialsFor = async (providerId: string): Promise<{ accessToken: string; accountId: string }> => {
	const row = await authRowFor(providerId);
	if (!row) throw new Error('Akun Codex untuk provider ini belum terhubung. Hubungkan ulang akun Anda.');
	if (row.status === 'revoked' || row.status === 'expired') {
		throw new Error('Sesi akun Codex sudah tidak berlaku. Hubungkan ulang akun Anda.');
	}
	const tokens = decryptTokens(row.ciphertext);
	if (!tokens) {
		await markStatus(row, 'error', 'Token tersimpan tidak dapat dibaca.');
		throw new Error('Token akun Codex tidak dapat dibaca. Hubungkan ulang akun Anda.');
	}
	if (!needsRefresh(row, tokens)) {
		return { accessToken: tokens.accessToken, accountId: row.accountId || codexAccountIdOf(tokens.idToken) };
	}

	const pending = refreshLocks.get(providerId);
	if (pending) {
		const shared = await pending;
		return { accessToken: shared.accessToken, accountId: row.accountId || codexAccountIdOf(shared.idToken) };
	}

	const work = (async () => {
		try {
			const refreshed = await refreshTokens(tokens.refreshToken);
			const merged: CodexTokens = {
				accessToken: refreshed.accessToken,
				refreshToken: refreshed.refreshToken,
				idToken: refreshed.idToken || tokens.idToken,
			};
			await persistTokens({ providerId, ownerId: row.owner, tokens: merged });
			return merged;
		} catch (error) {
			const permanent = (error as { permanent?: boolean }).permanent === true;
			await markStatus(
				row,
				permanent ? 'expired' : 'error',
				safeMessage(error, 'Perpanjangan sesi gagal.'),
			);
			throw error;
		} finally {
			refreshLocks.delete(providerId);
		}
	})();

	refreshLocks.set(providerId, work);
	const result = await work;
	return { accessToken: result.accessToken, accountId: row.accountId || codexAccountIdOf(result.idToken) };
};

// ── Disconnect ────────────────────────────────────────────────────────────

/**
 * Revokes the grant upstream where possible, then always deletes it locally.
 *
 * A failed revoke must not leave usable ciphertext behind, so local deletion
 * happens regardless and the failure is only logged.
 */
export const forgetCodexGrant = async (providerId: string): Promise<void> => {
	const row = await authRowFor(providerId);
	if (!row) return;
	const tokens = decryptTokens(row.ciphertext);
	if (tokens) {
		try {
			// Revocation is a JSON request in the Codex client, not form encoded.
			const response = await postJson(`${CODEX_ISSUER}/oauth/revoke`, {
				token: tokens.refreshToken,
				token_type_hint: 'refresh_token',
				client_id: CODEX_CLIENT_ID,
			});
			if (!response.ok) {
				logger.warn(`Codex revoke returned HTTP ${response.status} for provider ${providerId}`);
			}
		} catch (error) {
			logger.warn(`Codex revoke failed for provider ${providerId}: ${safeMessage(error, 'unknown error')}`);
		}
	}
	await pocketbaseAdmin.deleteRecord('ai_provider_codex_auth', row.id);
};
