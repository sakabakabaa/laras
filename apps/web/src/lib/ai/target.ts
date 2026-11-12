/**
 * Shared model-target types.
 *
 * These live in their own leaf module so that the dispatcher
 * ([model-client.server.ts](./model-client.server.ts)) and the grant layer can
 * refer to a resolved provider without importing the registry that produces it.
 * The registry re-exports them, so callers keep importing from
 * `providers.server`.
 *
 * There is nothing executable here on purpose: this module must never import
 * another `lib/ai` module, or the cycle it exists to prevent comes back.
 */

/** What a surface needs from a model. A mismatch fails loudly, not mid-run. */
export type Capabilities = { tools: boolean; vision: boolean; json: boolean; streaming: boolean };

export type ProviderKind = 'openai_compatible' | 'codex_oauth';

/**
 * A provider resolved for one surface.
 *
 * The two kinds are structurally different on purpose. An API-key provider
 * carries its `apiKey`. A Codex provider carries no credential at all: its
 * OAuth grant is loaded and refreshed at call time by `codexCredentialsFor`, so
 * nothing secret ever reaches this object.
 *
 * `collectModel` in `model-client.server.ts` is the only place that should
 * branch on `kind`; every other caller treats the result as a model target.
 */
export type ResolvedModel =
	| {
			kind: 'openai_compatible';
			providerId: string;
			providerLabel: string;
			baseUrl: string;
			apiKey: string;
			model: string;
			source: 'preference' | 'default' | 'env';
			capabilities: Capabilities;
			configVersion: string;
	  }
	| {
			kind: 'codex_oauth';
			providerId: string;
			providerLabel: string;
			baseUrl: string;
			model: string;
			source: 'preference' | 'default';
			capabilities: Capabilities;
			configVersion: string;
	  };
