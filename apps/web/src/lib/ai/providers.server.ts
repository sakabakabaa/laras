/**
 * Per-lecturer AI provider registry and model resolution.
 *
 * Resolution order: the lecturer's saved preference for the surface → their
 * default provider → the deployment's environment provider. Every surface asks
 * this module instead of reading `HROUTER_MODEL`, so a model change is a data
 * change, never a code change.
 *
 * Secrets are decrypted here and only here; nothing returned by the list/create
 * helpers contains a key, only a masked `last4`.
 */
import { createHash } from 'node:crypto';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import type { ProviderConfig } from './openai-compatible.server';
import { decryptSecret, encryptSecret, maskSecret, secretLast4 } from './secrets.server';

export type AiSurface = 'assistant' | 'evaluation' | 'lesson_plan' | 'practice' | 'rps_import' | 'student_help';

export type Capabilities = { tools: boolean; vision: boolean; json: boolean; streaming: boolean };

export type SurfaceDescriptor = {
	id: AiSurface;
	label: string;
	requires: Array<keyof Capabilities>;
};

/** What each surface needs from a model. A mismatch fails loudly, not mid-run. */
export const AI_SURFACES: SurfaceDescriptor[] = [
	{ id: 'assistant', label: 'Asisten dosen', requires: ['tools'] },
	{ id: 'evaluation', label: 'Evaluasi kiriman', requires: ['vision', 'json'] },
	{ id: 'lesson_plan', label: 'Rencana pembelajaran', requires: ['json'] },
	{ id: 'practice', label: 'Latihan personal', requires: [] },
	{ id: 'rps_import', label: 'Impor RPS', requires: ['json'] },
	// Student-facing help on an assignment. It has no owner of its own, so it
	// resolves against the course lecturer who set the provider up.
	{ id: 'student_help', label: 'Bantuan mahasiswa', requires: [] },
];

export type ProviderRecord = {
	id: string;
	owner: string;
	label: string;
	kind: 'openai_compatible' | 'codex_oauth';
	baseUrl: string;
	models: string[];
	capabilities: Partial<Capabilities>;
	enabled: boolean;
	isDefault: boolean;
};

export type PreferenceRecord = {
	id: string;
	owner: string;
	surface: AiSurface;
	provider: string;
	model: string;
};

export type ResolvedModel = ProviderConfig & {
	source: 'preference' | 'default' | 'env';
	capabilities: Capabilities;
	configVersion: string;
};

export type ProviderView = {
	id: string;
	label: string;
	kind: string;
	baseUrl: string;
	models: string[];
	capabilities: Partial<Capabilities>;
	enabled: boolean;
	isDefault: boolean;
	keyMasked: string;
};

const FULL_CAPABILITIES: Capabilities = { tools: true, vision: true, json: true, streaming: true };

const DEFAULT_BASE_URL = 'https://router.hostinger.com/v1';
const DEFAULT_MODEL = 'gpt-6-luna';

const configVersionOf = (providerId: string, baseUrl: string, model: string): string =>
	createHash('sha256').update(`${providerId}|${baseUrl}|${model}`).digest('hex').slice(0, 12);

const surfaceOf = (surface: AiSurface): SurfaceDescriptor => {
	const descriptor = AI_SURFACES.find((entry) => entry.id === surface);
	if (!descriptor) throw new Error(`Surface tidak dikenal: ${surface}`);
	return descriptor;
};

/** Throws when a provider cannot serve a surface (e.g. no tool support). */
export const assertCapabilities = (
	capabilities: Partial<Capabilities>,
	surface: AiSurface,
	providerLabel: string,
): Capabilities => {
	const merged = { ...FULL_CAPABILITIES, ...capabilities };
	const missing = surfaceOf(surface).requires.filter((capability) => !merged[capability]);
	if (missing.length > 0) {
		throw new Error(`Model pada "${providerLabel}" tidak mendukung: ${missing.join(', ')}. Pilih model lain untuk ${surfaceOf(surface).label}.`);
	}
	return merged;
};

/** The deployment-wide provider, used when a lecturer has configured nothing. */
const envProvider = (): ResolvedModel | null => {
	const apiKey = process.env.HROUTER_API_KEY || '';
	if (!apiKey) return null;
	const baseUrl = process.env.HROUTER_BASE_URL || DEFAULT_BASE_URL;
	const model = process.env.HROUTER_MODEL || DEFAULT_MODEL;
	return {
		providerId: 'env',
		providerLabel: 'Bawaan server',
		baseUrl,
		apiKey,
		model,
		source: 'env',
		capabilities: FULL_CAPABILITIES,
		configVersion: configVersionOf('env', baseUrl, model),
	};
};

const secretFor = async (providerId: string): Promise<string | null> => {
	const rows = await pocketbaseAdmin.listRecords<{ ciphertext: string }>('ai_provider_secrets', {
		filter: `provider="${providerId}"`,
		perPage: 1,
	});
	const ciphertext = rows.items[0]?.ciphertext;
	return ciphertext ? decryptSecret(ciphertext) : null;
};

const toResolved = async (
	provider: ProviderRecord,
	model: string,
	surface: AiSurface,
	source: 'preference' | 'default',
): Promise<ResolvedModel> => {
	const apiKey = await secretFor(provider.id);
	if (!apiKey) throw new Error(`Kunci API untuk "${provider.label}" belum tersimpan.`);
	const selected = model || provider.models[0] || '';
	if (!selected) throw new Error(`Provider "${provider.label}" belum memiliki model.`);
	return {
		providerId: provider.id,
		providerLabel: provider.label,
		baseUrl: provider.baseUrl,
		apiKey,
		model: selected,
		source,
		capabilities: assertCapabilities(provider.capabilities || {}, surface, provider.label),
		configVersion: configVersionOf(provider.id, provider.baseUrl, selected),
	};
};

/** Resolves the model a surface should use for one lecturer. */
export const resolveModel = async (ownerId: string, surface: AiSurface): Promise<ResolvedModel> => {
	surfaceOf(surface);

	const preferences = await pocketbaseAdmin.listRecords<PreferenceRecord>('ai_model_prefs', {
		filter: `owner="${ownerId}" && surface="${surface}"`,
		sort: '-updated',
		perPage: 1,
	});
	const preference = preferences.items[0];
	if (preference?.provider) {
		try {
			const provider = await pocketbaseAdmin.getRecord<ProviderRecord>('ai_providers', preference.provider);
			if (provider.enabled && provider.owner === ownerId) {
				return await toResolved(provider, preference.model, surface, 'preference');
			}
		} catch {
			/* stale preference — fall through to the default provider */
		}
	}

	const defaults = await pocketbaseAdmin.listRecords<ProviderRecord>('ai_providers', {
		filter: `owner="${ownerId}" && isDefault=true && enabled=true`,
		perPage: 1,
	});
	const fallback = defaults.items[0];
	if (fallback) return toResolved(fallback, fallback.models[0] || '', surface, 'default');

	const env = envProvider();
	if (!env) throw new Error('Belum ada model yang dikonfigurasi. Tambahkan provider di Pengaturan → Model AI.');
	return { ...env, capabilities: assertCapabilities(env.capabilities, surface, env.providerLabel) };
};

/**
 * Resolves a surface for a course, using the lecturer who owns that course.
 *
 * Student features have no provider of their own: the worksheet assistant and
 * personal practice used to call the deployment env directly, so a lecturer who
 * configured a provider in Settings saw it apply to their own assistant and to
 * nothing a student touched. Resolving through the course owner makes the
 * lecturer's configuration (surface preference, then default provider, then the
 * deployment env) apply to student work too.
 *
 * Resolution never makes a feature unavailable that used to work: if the
 * lecturer's provider cannot serve the surface, the deployment env is used.
 */
export const resolveModelForCourse = async (
	courseId: string | null | undefined,
	surface: AiSurface,
): Promise<ResolvedModel> => {
	const envOrThrow = (): ResolvedModel => {
		const env = envProvider();
		if (!env) throw new Error('Belum ada model yang dikonfigurasi. Tambahkan provider di Pengaturan → Model AI.');
		return { ...env, capabilities: assertCapabilities(env.capabilities, surface, env.providerLabel) };
	};
	if (!courseId) return envOrThrow();
	let ownerId: string | null = null;
	try {
		const course = await pocketbaseAdmin.getRecord<{ owner: string }>('courses', courseId);
		ownerId = course.owner || null;
	} catch {
		// An unknown course must not break generation.
		return envOrThrow();
	}
	if (!ownerId) return envOrThrow();
	try {
		return await resolveModel(ownerId, surface);
	} catch {
		// The lecturer's provider cannot serve this surface; keep the feature up.
		return envOrThrow();
	}
};

const validateProviderInput = (input: {
	label?: unknown;
	baseUrl?: unknown;
	models?: unknown;
	apiKey?: unknown;
}): { label: string; baseUrl: string; models: string[]; apiKey: string } => {
	const label = typeof input.label === 'string' ? input.label.trim() : '';
	const baseUrl = typeof input.baseUrl === 'string' ? input.baseUrl.trim().replace(/\/+$/, '') : '';
	const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
	const models = Array.isArray(input.models)
		? input.models.filter((model): model is string => typeof model === 'string' && model.trim().length > 0).map((model) => model.trim())
		: [];
	if (!label || label.length > 60) throw new Error('Nama provider wajib diisi (maksimal 60 karakter).');
	if (!/^https?:\/\/[^\s]+$/i.test(baseUrl)) throw new Error('Base URL harus berupa http(s)://…');
	if (apiKey.length < 8) throw new Error('Kunci API terlalu pendek.');
	if (models.length === 0 || models.length > 20) throw new Error('Isi 1–20 nama model.');
	return { label, baseUrl, models, apiKey };
};

/** Providers owned by one lecturer, with masked keys only. */
export const listProviders = async (ownerId: string): Promise<ProviderView[]> => {
	const rows = await pocketbaseAdmin.listRecords<ProviderRecord>('ai_providers', {
		filter: `owner="${ownerId}"`,
		sort: '-isDefault,-created',
		perPage: 50,
	});
	const secrets = await pocketbaseAdmin.listRecords<{ provider: string; last4: string }>('ai_provider_secrets', {
		filter: rows.items.map((row) => `provider="${row.id}"`).join(' || ') || 'id=""',
		perPage: 100,
	});
	const last4ByProvider = new Map(secrets.items.map((row) => [row.provider, row.last4]));
	return rows.items.map((row) => ({
		id: row.id,
		label: row.label,
		kind: row.kind,
		baseUrl: row.baseUrl,
		models: row.models || [],
		capabilities: row.capabilities || {},
		enabled: row.enabled !== false,
		isDefault: Boolean(row.isDefault),
		keyMasked: maskSecret(last4ByProvider.get(row.id) || ''),
	}));
};

/** Creates a provider + its encrypted secret in one call. */
export const createProvider = async (
	ownerId: string,
	input: { label?: unknown; baseUrl?: unknown; models?: unknown; apiKey?: unknown; capabilities?: unknown; isDefault?: unknown },
): Promise<ProviderView> => {
	const valid = validateProviderInput(input);
	const capabilities = (input.capabilities && typeof input.capabilities === 'object' ? input.capabilities : {}) as Partial<Capabilities>;
	const isDefault = input.isDefault === true;

	if (isDefault) {
		const existing = await pocketbaseAdmin.listRecords<ProviderRecord>('ai_providers', {
			filter: `owner="${ownerId}" && isDefault=true`,
			perPage: 50,
		});
		await Promise.all(existing.items.map((row) => pocketbaseAdmin.updateRecord('ai_providers', row.id, { isDefault: false })));
	}

	const provider = await pocketbaseAdmin.createRecord<ProviderRecord>('ai_providers', {
		owner: ownerId,
		label: valid.label,
		kind: 'openai_compatible',
		baseUrl: valid.baseUrl,
		models: valid.models,
		capabilities,
		enabled: true,
		isDefault,
	});
	await pocketbaseAdmin.createRecord('ai_provider_secrets', {
		owner: ownerId,
		provider: provider.id,
		ciphertext: encryptSecret(valid.apiKey),
		last4: secretLast4(valid.apiKey),
	});
	return {
		id: provider.id,
		label: provider.label,
		kind: provider.kind,
		baseUrl: provider.baseUrl,
		models: provider.models,
		capabilities,
		enabled: true,
		isDefault,
		keyMasked: maskSecret(secretLast4(valid.apiKey)),
	};
};

/** Deletes a provider, its secret and its preferences. Ownership is enforced. */
export const deleteProvider = async (ownerId: string, providerId: string): Promise<void> => {
	const provider = await pocketbaseAdmin.getRecord<ProviderRecord>('ai_providers', providerId);
	if (provider.owner !== ownerId) throw new Error('Provider bukan milik Anda.');
	const secrets = await pocketbaseAdmin.listRecords<{ id: string }>('ai_provider_secrets', {
		filter: `provider="${providerId}"`,
		perPage: 20,
	});
	await Promise.all(secrets.items.map((row) => pocketbaseAdmin.deleteRecord('ai_provider_secrets', row.id)));
	await pocketbaseAdmin.deleteRecord('ai_providers', providerId);
};

/** Sets (or replaces) the lecturer's model choice for one surface. */
export const setPreference = async (
	ownerId: string,
	surface: AiSurface,
	providerId: string,
	model: string,
): Promise<PreferenceRecord> => {
	const descriptor = surfaceOf(surface);
	const provider = await pocketbaseAdmin.getRecord<ProviderRecord>('ai_providers', providerId);
	if (provider.owner !== ownerId) throw new Error('Provider bukan milik Anda.');
	if (!provider.enabled) throw new Error('Provider sedang dinonaktifkan.');
	const selected = (model || '').trim();
	if (!selected || !(provider.models || []).includes(selected)) {
		throw new Error('Model tidak tersedia pada provider ini.');
	}
	assertCapabilities(provider.capabilities || {}, surface, provider.label);

	const existing = await pocketbaseAdmin.listRecords<PreferenceRecord>('ai_model_prefs', {
		filter: `owner="${ownerId}" && surface="${descriptor.id}"`,
		perPage: 1,
	});
	const row = existing.items[0];
	return row
		? pocketbaseAdmin.updateRecord<PreferenceRecord>('ai_model_prefs', row.id, { provider: providerId, model: selected })
		: pocketbaseAdmin.createRecord<PreferenceRecord>('ai_model_prefs', {
				owner: ownerId,
				surface: descriptor.id,
				provider: providerId,
				model: selected,
			});
};

/** The lecturer's current choices, one row per configured surface. */
export const listPreferences = async (ownerId: string): Promise<PreferenceRecord[]> => {
	const rows = await pocketbaseAdmin.listRecords<PreferenceRecord>('ai_model_prefs', {
		filter: `owner="${ownerId}"`,
		perPage: 20,
	});
	return rows.items;
};

/** A one-shot minimal completion used by the "Test connection" button. */
export const testProvider = async (
	ownerId: string,
	providerId: string,
	model?: string,
): Promise<{ model: string; latencyMs: number }> => {
	const provider = await pocketbaseAdmin.getRecord<ProviderRecord>('ai_providers', providerId);
	if (provider.owner !== ownerId) throw new Error('Provider bukan milik Anda.');
	const resolved = await toResolved(provider, model || provider.models[0] || '', 'practice', 'default');
	const { collectChatCompletion } = await import('./openai-compatible.server');
	const started = Date.now();
	const result = await collectChatCompletion(resolved, {
		prompt: 'Balas tepat satu kata: OK',
		timeoutMs: 20_000,
	});
	return { model: result.model, latencyMs: Date.now() - started };
};
