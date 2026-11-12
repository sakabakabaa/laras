/// <reference path="../pb_data/types.d.ts" />

// Codex/ChatGPT OAuth provider — storage for one OAuth grant per provider.
//
// `ai_providers.kind` already allows `codex_oauth` (see
// 1791700000_ai_model_settings.js), but nothing stored the grant it needs.
//
// `ai_provider_codex_auth`
//   One row per connected provider. The token bundle is AES-256-GCM ciphertext
//   through lib/ai/secrets.server.ts. The remaining columns are deliberately
//   NOT secret: the provider list has to show connection state and expiry
//   without decrypting anything, and the account id is an opaque identifier
//   rather than a credential.
//
// `ai_codex_logins`
//   Short-lived device-login attempts. The flow is: start (creates a row) ->
//   poll (reads the row, calls upstream, deletes on success). Rows are owner
//   scoped and expire after 15 minutes, matching Codex's own timeout.
//
// Both collections have null create/update/delete rules: only the server
// routes in apps/web/src/routes/api.ai-providers-codex-*.ts may write them.
migrate((app) => {
	const users = app.findCollectionByNameOrId('users');

	let providers;
	try {
		providers = app.findCollectionByNameOrId('ai_providers');
	} catch (_) {
		providers = null;
	}

	let auth;
	try {
		app.findCollectionByNameOrId('ai_provider_codex_auth');
	} catch (_) {
		auth = new Collection({
			type: 'base',
			name: 'ai_provider_codex_auth',
			// The lecturer may read their own connection state; no client may write.
			listRule: "@request.auth.id != '' && owner = @request.auth.id",
			viewRule: "@request.auth.id != '' && owner = @request.auth.id",
			createRule: null,
			updateRule: null,
			deleteRule: null,
			fields: [
				{ name: 'owner', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
				{ name: 'provider', type: 'relation', required: true, maxSelect: 1, collectionId: providers.id, cascadeDelete: true },
				{ name: 'ciphertext', type: 'text', required: true, max: 8000, hidden: true },
				{ name: 'accountId', type: 'text', max: 120 },
				{ name: 'planType', type: 'text', max: 40 },
				{ name: 'expiresAt', type: 'text', max: 40 },
				{ name: 'lastRefresh', type: 'text', max: 40 },
				{
					name: 'status',
					type: 'select',
					required: true,
					maxSelect: 1,
					values: ['active', 'expired', 'revoked', 'error'],
				},
				{ name: 'lastError', type: 'text', max: 300 },
				{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_ai_codex_auth_provider ON ai_provider_codex_auth (provider)',
				'CREATE INDEX idx_ai_codex_auth_owner ON ai_provider_codex_auth (owner, created)',
			],
		});
		app.save(auth);
	}

	try {
		app.findCollectionByNameOrId('ai_codex_logins');
	} catch (_) {
		const logins = new Collection({
			type: 'base',
			name: 'ai_codex_logins',
			// Pending logins are private to the lecturer who started them.
			listRule: "@request.auth.id != '' && owner = @request.auth.id",
			viewRule: "@request.auth.id != '' && owner = @request.auth.id",
			createRule: null,
			updateRule: null,
			deleteRule: null,
			fields: [
				{ name: 'owner', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
				{ name: 'deviceAuthId', type: 'text', required: true, max: 300, hidden: true },
				{ name: 'userCode', type: 'text', required: true, max: 40 },
				{ name: 'verificationUrl', type: 'text', required: true, max: 300 },
				{ name: 'intervalSeconds', type: 'number', onlyInt: true },
				// Provider settings captured at start, so the poll endpoint creates
				// the provider from the same intent the lecturer submitted rather
				// than from a second client payload.
				{ name: 'providerLabel', type: 'text', max: 60 },
				{ name: 'models', type: 'json', maxSize: 2000 },
				{ name: 'isDefault', type: 'bool' },
				{ name: 'expiresAt', type: 'text', required: true, max: 40 },
				{
					name: 'status',
					type: 'select',
					required: true,
					maxSelect: 1,
					values: ['pending', 'connected', 'failed', 'expired'],
				},
				{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
			],
			indexes: ['CREATE INDEX idx_ai_codex_logins_owner ON ai_codex_logins (owner, created)'],
		});
		app.save(logins);
	}
});
