# Codex/ChatGPT OAuth as an AI provider

Status: implemented behind `CODEX_OAUTH_ENABLED` (default **off**).

This document is both the design record and the operator note for the
`codex_oauth` provider kind. It exists so that a future reader can tell which
parts are our contract, which parts belong to an external service we do not
control, and what breaks if that service changes.

## 1. Why this exists

A lecturer can already register an [OI]-compatible provider with an API key
(`ai_providers.kind = 'openai_compatible'`). Some lecturers instead have a
ChatGPT/Codex subscription and no API key. `codex_oauth` lets such a lecturer
connect their own ChatGPT account and use it as the model behind a chosen
surface, starting with formal Tugas evaluation.

The credential is **not** an API key. It is an OAuth grant that must be
refreshed, can be revoked, and identifies a specific ChatGPT account. It is
therefore stored, resolved and dispatched differently from an API key.

## 2. Why the device-code flow

Codex ships two login flows:

| Flow | Redirect | Works when the browser and the server are different machines |
|---|---|---|
| Browser PKCE | `http://127.0.0.1:<port>/auth/callback` | No — the callback lands on the lecturer's laptop, not the Laras host |
| Device code | none; the user types a short code on a web page | Yes |

Laras is served from a host the lecturer does not run locally, so a loopback
callback cannot complete. The device-code flow is the only one that works
unmodified, and it also avoids registering a redirect URI with the identity
provider.

The device flow in the Codex source is: request a user code, show it, poll until
the user approves, then exchange the returned authorization code (with the PKCE
verifier the service hands back) for tokens.

## 3. External contract

These values come from the open-source Codex implementation
(`openai/codex`, `codex-rs/login/src/`, `codex-rs/http-client/src/`). They are
**not** a published, versioned API contract. Treat every one of them as
potentially changing, and keep them in one module
([codex-oauth.server.ts](../../apps/web/src/lib/ai/codex-oauth.server.ts)) so a
future change is a one-file edit.

### Identity provider

| Constant | Value | Source |
|---|---|---|
| Issuer | `https://auth.openai.com` | `server.rs` `DEFAULT_ISSUER` |
| Client id | `app_EMoamEEZ73f0CkXaXp7hrann` | `auth/manager.rs` `CLIENT_ID` |
| Device user code | `POST {issuer}/api/accounts/deviceauth/usercode` | `device_code_auth.rs` |
| Device token poll | `POST {issuer}/api/accounts/deviceauth/token` | `device_code_auth.rs` |
| Verification page | `{issuer}/codex/device` | `device_code_auth.rs` |
| Token endpoint | `{issuer}/oauth/token` | `server.rs`, `auth/manager.rs` |
| Revoke endpoint | `{issuer}/oauth/revoke` | `auth/manager.rs` |

Request and response shapes:

```text
POST /api/accounts/deviceauth/usercode
  body    {"client_id": "<client id>"}
  ok 200  {"device_auth_id": "...", "user_code": "...", "interval": "5"}
          note: interval arrives as a STRING in the Codex source

POST /api/accounts/deviceauth/token
  body    {"device_auth_id": "...", "user_code": "..."}
  403/404 pending  -> keep polling
  ok 200  {"authorization_code": "...", "code_challenge": "...", "code_verifier": "..."}

POST /oauth/token            (form encoded)
  body    grant_type=authorization_code
          &client_id=<client id>
          &code=<authorization_code>
          &redirect_uri=https://auth.openai.com/deviceauth/callback
          &code_verifier=<code_verifier from the poll response>
  ok 200  {"id_token": "...", "access_token": "...", "refresh_token": "..."}

POST /oauth/token            (JSON)
  body    {"grant_type": "refresh_token", "client_id": "<client id>",
           "refresh_token": "...", "refresh_reason": "proactive_expiry"}
  ok 200  {"id_token"?, "access_token"?, "refresh_token"?}

POST /oauth/revoke           (JSON)
  body    {"token": "<refresh token>", "token_type_hint": "refresh_token",
           "client_id": "<client id>"}
```

Two behaviours we must honour because Codex does:

1. **Refresh tokens rotate.** The error `refresh_token_reused` means a previous
   refresh already consumed the token. Persist the new refresh token in the same
   write that records the new access token, or the grant is lost. Every refresh
   response field is optional: an absent `refresh_token` means "keep the current
   one", and an absent `id_token` means "keep the current one".
2. **The account id lives in the ID token**, under the namespaced claim
   `https://api.openai.com/auth` → `chatgpt_account_id`. It is required by the
   backend header below. `chatgpt_plan_type` sits beside it and is display only.

### Inference backend

| Constant | Value | Source |
|---|---|---|
| Backend base | `https://chatgpt.com/backend-api/codex` | `model-provider-info/src/lib.rs` `CHATGPT_CODEX_BASE_URL` |
| Responses path | `/responses` (so the full URL ends `/backend-api/codex/responses`) | `codex-api/src/endpoint/responses.rs` |
| Account header | `chatgpt-account-id` | `http-client/src/openai_headers.rs` |
| Originator header | `originator: codex_cli_rs` | `login/src/auth/default_client.rs` |
| Authorization | `Bearer <access token>` | `model-provider/src/bearer_auth_provider.rs` |

Do **not** confuse `.../backend-api/codex` with the plain
`https://chatgpt.com/backend-api`, which is Codex's routing-context base and
serves different endpoints. Using the wrong one yields a 404.

The request body is the Responses API shape, not Chat Completions. Two details
that are easy to get wrong:

- There is **no top-level `instructions` field**. Base instructions are the
  first item of `input`; the user turn follows. Laras sends its system prompt
  that way.
- The `[OI]-Beta` header is **WebSocket-handshake only**. The HTTP POST must not
  send it. Laras sends `Accept: text/event-stream` and parses the SSE stream.

This is why `codex_oauth` cannot reuse the existing `collectChatCompletion` path.

## 4. Data model

Two new PocketBase collections, created by
[`1791700300_ai_codex_oauth.js`](../../apps/pocketbase/pb_migrations/1791700300_ai_codex_oauth.js):

### `ai_provider_codex_auth`

One row per connected provider. Owner-scoped reads; **all** write rules null so
only the server can mutate it.

| Field | Purpose |
|---|---|
| `owner` | relation to `users`, cascade delete |
| `provider` | relation to `ai_providers`, unique, cascade delete |
| `ciphertext` | AES-256-GCM blob holding `access_token`, `refresh_token`, `id_token` |
| `accountId` | `chatgpt_account_id` — an opaque account identifier, not a credential |
| `planType` | plan reported by the grant, for display only |
| `expiresAt` | access-token expiry, ISO 8601 |
| `lastRefresh` | when the grant was last refreshed |
| `status` | `active` \| `expired` \| `revoked` \| `error` |
| `lastError` | short, credential-free reason when `status = error` |

Reusing `ai_provider_secrets` was rejected: that collection is unique per
provider and holds exactly one opaque secret, but Codex needs the token bundle
*plus* queryable metadata (expiry, account, status) that the provider list must
read without decrypting anything.

### `ai_codex_logins`

Short-lived pending device logins, so the poll endpoint can resume an attempt
across requests.

| Field | Purpose |
|---|---|
| `owner` | relation to `users` |
| `deviceAuthId` | upstream handle for the poll |
| `userCode` | the code shown to the lecturer |
| `verificationUrl` | `https://auth.openai.com/codex/device` |
| `intervalSeconds` | poll cadence requested by the service |
| `expiresAt` | 15 minutes after creation, matching Codex's own timeout |
| `status` | `pending` \| `connected` \| `failed` \| `expired` |

Rows are deleted on success and on explicit cancel.

## 5. Token lifecycle

```text
pending login  --poll-->  tokens  --persist-->  active
                                               |
                              (expiry within 5 min, or older than 8 days)
                                               v
                                            refresh  --> active
                                               |
                                     permanent failure
                                               v
                                        expired / revoked
```

- Refresh window: 5 minutes before expiry, matching
  `CHATGPT_ACCESS_TOKEN_REFRESH_WINDOW_MINUTES` in the Codex source.
- Scheduled refresh: 8 days, matching `TOKEN_REFRESH_INTERVAL`.
- A permanent refresh failure (401, `invalid_grant`, `refresh_token_reused`)
  marks the credential `expired`/`revoked` and the lecturer must reconnect.
  A transient failure (network, 5xx) leaves the credential `active` and the
  request fails explicitly.
- **No silent fallback.** A failed Codex call never re-routes to the deployment
  env provider, because that would spend a different party's quota without the
  lecturer's consent.

## 6. Capability gating

`codex_oauth` providers advertise:

| Capability | Value | Reason |
|---|---|---|
| `vision` | true | the backend accepts image inputs |
| `json` | true | Responses supports a JSON response format |
| `tools` | false | Laras does not run the Codex agent loop; only text/JSON drafting is supported |
| `streaming` | true | SSE is parsed |

`assertCapabilities` therefore rejects `codex_oauth` for the `assistant` surface
(which requires `tools`) and accepts it for `evaluation`, `lesson_plan`,
`practice`, `rps_import` and `student_help`. The UI shows the same constraint
before a preference is saved.

## 7. Security and privacy

- Tokens are encrypted with `AI_SETTINGS_KEY` through the existing
  [secrets.server.ts](../../apps/web/src/lib/ai/secrets.server.ts) envelope.
  No API response ever returns a token, an ID token, or an account email; the
  UI sees `accountId`, `planType`, `status` and a masked hint only.
- Only `faculty` accounts may start, poll or disconnect a login, and only for
  their own providers.
- Logs never include token material, the authorization code, or the PKCE
  verifier. Error text is mapped to fixed strings before it reaches the client.
- Disconnect revokes upstream where possible, then deletes local ciphertext.
  A failed revoke still deletes local ciphertext and records why.
- The grant belongs to the lecturer who connected it. It is never shared across
  lecturers and never used for a course whose owner did not connect it.

## 8. Risks and limits

1. **Unsupported integration.** The endpoints above are the Codex client's
   internals, not a published API for third-party applications. Using a
   subscription this way may fall outside [OI]'s terms for API access, and may
   change or stop working without notice. This is why the feature is behind an
   operator flag that defaults to off, and why API-key providers remain the
   supported production path.
2. **Entitlement.** A ChatGPT account may not include Codex access. The service
   can refuse at login time with `missing_codex_entitlement`; we surface that as
   a plain "akun ini belum punya akses" message rather than a generic failure.
3. **Brittleness.** Any header, path or body change on the backend breaks this
   adapter. The adapter is isolated in two files so the blast radius is bounded.
4. **Quota.** The lecturer's own account and plan are consumed. The UI states
   this before the login starts.
5. **Not a multi-tenant secret store.** One grant per lecturer; there is no
   organisation-level Codex connection.

## 9. Rollout

1. Apply the migration.
2. Set `CODEX_OAUTH_ENABLED=true` on the web service.
3. A lecturer opens Pengaturan → Model AI, chooses **Hubungkan akun Codex**,
   opens the verification URL, enters the code, and returns.
4. The lecturer picks the provider for **Evaluasi kiriman** and runs **Uji**.

With the flag unset, the provider kind is rejected by the API and the UI section
is hidden. Nothing about existing providers changes.

## 10. Out of scope

- Running the Codex agent loop (shell, filesystem, MCP tools) from Laras.
- Streaming partial evaluation drafts to the browser.
- Organisation/workspace-level Codex connections.
- Migrating the legacy `hostinger-model.server.ts` stack. `ai-evaluation.server.ts`
  still resolves through `collectModelWithProvenance`, so wiring evaluation onto
  the registry is a separate change; see §11.

## 11. Known gap carried by this change

`ai-evaluation.server.ts` calls `collectModelWithProvenance(prompt, images,
systemPrompt)` with no resolved provider, so the Tugas evaluation surface still
uses the deployment environment even after a lecturer saves a preference. This
change adds the `codex_oauth` provider kind, the dispatcher
([model-client.server.ts](../../apps/web/src/lib/ai/model-client.server.ts)) and
the settings flow; it does **not** silently change which model the evaluation
pipeline calls. Routing evaluation through `resolveModel(owner, 'evaluation')`
is the follow-up, and it needs its own tests because it changes grading input.
