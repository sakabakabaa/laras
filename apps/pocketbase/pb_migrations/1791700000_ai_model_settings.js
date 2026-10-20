/// <reference path="../pb_data/types.d.ts" />

// Phase 1 (Model AI settings) — per-lecturer model providers.
//
// `ai_providers`      one row per provider a lecturer configures (label, base
//                     URL, model list, capability flags).
// `ai_provider_secrets` AES-256-GCM ciphertext + last4. No client access at all
//                     (all rules null) — only the server decrypts, and only for
//                     the owning lecturer's own provider.
// `ai_model_prefs`    which provider+model serves which surface, per lecturer.
//
// Writes happen exclusively through the server routes, so create/update/delete
// rules are null everywhere. Reads are owner-only so one lecturer can never see
// another's providers or preferences.
migrate((app) => {
	const users = app.findCollectionByNameOrId('users');

	let providers;
	try {
		providers = app.findCollectionByNameOrId('ai_providers');
	} catch (_) {
		providers = new Collection({
			type: 'base',
			name: 'ai_providers',
			listRule: "@request.auth.id != '' && owner = @request.auth.id",
			viewRule: "@request.auth.id != '' && owner = @request.auth.id",
			createRule: null,
			updateRule: null,
			deleteRule: null,
			fields: [
				{ name: 'owner', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
				{ name: 'label', type: 'text', required: true, max: 60 },
				{ name: 'kind', type: 'select', required: true, maxSelect: 1, values: ['openai_compatible', 'codex_oauth'] },
				{ name: 'baseUrl', type: 'text', required: true, max: 300 },
				{ name: 'models', type: 'json', maxSize: 5000 },
				{ name: 'capabilities', type: 'json', maxSize: 2000 },
				{ name: 'enabled', type: 'bool' },
				{ name: 'isDefault', type: 'bool' },
				{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
			],
			indexes: [
				'CREATE INDEX idx_ai_providers_owner ON ai_providers (owner, created)',
				'CREATE UNIQUE INDEX idx_ai_providers_one_default ON ai_providers (owner) WHERE isDefault = true',
			],
		});
		app.save(providers);
	}

	try {
		app.findCollectionByNameOrId('ai_provider_secrets');
	} catch (_) {
		const secrets = new Collection({
			type: 'base',
			name: 'ai_provider_secrets',
			// No client may ever read a ciphertext.
			listRule: null,
			viewRule: null,
			createRule: null,
			updateRule: null,
			deleteRule: null,
			fields: [
				{ name: 'owner', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
				{ name: 'provider', type: 'relation', required: true, maxSelect: 1, collectionId: providers.id, cascadeDelete: true },
				{ name: 'ciphertext', type: 'text', required: true, max: 4000, hidden: true },
				{ name: 'last4', type: 'text', max: 8 },
				{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
			],
			indexes: ['CREATE UNIQUE INDEX idx_ai_provider_secrets_provider ON ai_provider_secrets (provider)'],
		});
		app.save(secrets);
	}

	try {
		app.findCollectionByNameOrId('ai_model_prefs');
	} catch (_) {
		const prefs = new Collection({
			type: 'base',
			name: 'ai_model_prefs',
			listRule: "@request.auth.id != '' && owner = @request.auth.id",
			viewRule: "@request.auth.id != '' && owner = @request.auth.id",
			createRule: null,
			updateRule: null,
			deleteRule: null,
			fields: [
				{ name: 'owner', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
				{ name: 'surface', type: 'select', required: true, maxSelect: 1, values: ['assistant', 'evaluation', 'lesson_plan', 'practice', 'rps_import'] },
				{ name: 'provider', type: 'relation', required: true, maxSelect: 1, collectionId: providers.id, cascadeDelete: true },
				{ name: 'model', type: 'text', required: true, max: 120 },
				{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
			],
			indexes: ['CREATE UNIQUE INDEX idx_ai_model_prefs_owner_surface ON ai_model_prefs (owner, surface)'],
		});
		app.save(prefs);
	}
});
