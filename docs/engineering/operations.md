# Development, checks and operations

## Local setup

Use Node 22 for parity with the Docker image, npm and Docker Compose. The bundled PocketBase executable is used by both direct scripts and the container; check its OS/architecture before trying to run it on a different host. Docker is the portable path for the checked-in Linux backend binary.

1. Clone the repo and run `npm ci` at its root.
2. Create a private root `.env` with `PB_ENCRYPTION_KEY`, `PB_SUPERUSER_EMAIL` and `PB_SUPERUSER_PASSWORD`. Use local-only values. Generate a strong encryption key appropriate to PocketBase; never reuse production credentials.
3. For optional AI features set the provider variables in [configuration](configuration.md). Missing provider keys should not prevent manual course/assessment workflows.
4. Run `docker compose -f docker-compose.local.yml up --build -d`.
5. Open `http://localhost:3000`; the local PocketBase port is bound to `127.0.0.1:8090`. The named local volume is separate from production.

For direct development, the root `npm run dev` starts both workspace scripts. The web script reads `apps/web/.env` when present; the PocketBase shell process requires environment variables in its process environment. Root `.env` is loaded by Compose, not automatically by every npm command. Verify PocketBase migrations and credentials are available before debugging frontend authorization failures.

The local Compose file explicitly notes a generated-file-URL issue: `WEBSITE_DOMAIN=localhost:3000` can produce HTTPS URLs while staging serves HTTP. Do not treat failed generated file links as an OCR/permission issue until checking the URL scheme.

## Verification

```sh
npm run typecheck
npm run lint
npm run test --prefix apps/web
npm run build
```

Typecheck includes React Router type generation. The web test suite uses Vitest. Prefer the domain tests relevant to a change, then run the required broader checks. Build does not replace authorization, migration or end-to-end verification. [Test index](tests.md) lists available suites; it does not claim they all passed on every release.

## Production topology

[docker-compose.yml](../../docker-compose.yml) builds the web and PocketBase targets from [Dockerfile](../../Dockerfile). Web serves on container port 3000, PocketBase on 8090. Traefik is external to this Compose stack and routes the configured domain. Both services use external `laras-app-net`. The external named PocketBase volume is `laras-horizon-pocketbase-data` mounted at `/data`.

The scripts target `/opt/laras-git`. Environment values are in that checkout's private `.env`. Database records and uploaded files persist in the PocketBase volume; replacing an image does not replace that data. Do not run `down -v` or remove the external volume during routine releases.

## Deployment and rollback

`deploy.sh` fetches `origin/main`, requires fast-forward progression, tags current images with a timestamp, rebuilds both images, starts containers and probes `/api/health`. It fails rather than auto-rolling back. Read the script before operating it; a docs-only GitHub publication does not require a VPS restart.

```sh
# On the authorized production host, after reviewing the release:
cd /opt/laras-git
bash deploy.sh
# Use the timestamp printed by that deploy if image rollback is needed:
bash rollback.sh <timestamp>
```

Rollback re-tags saved images and restarts services. It does not restore the database, revert migrated data or reset the checkout. Before schema-changing releases take a consistent PocketBase backup including records and storage; test restore in an isolated environment. An image rollback cannot undo destructive migrations.

## Troubleshooting paths

| Symptom | Inspect first |
|---|---|
| Login works but page denies access | client loader, auth-store role, PocketBase collection rules |
| API returns 401/403 | endpoint authentication and owner/enrollment checks before admin calls |
| Browser file links fail locally | URL scheme/domain, web proxy, protected-file token behavior |
| AI unavailable | provider env names, service error handling, usage policy and rate limits |
| AI ignores course material | file/course link, extraction/version match, suitable sections, retrieval scope and citations |
| AI score differs from official grade | draft/review/publish distinction; rubric weights; publication state |
| OCR transcript differs from file | original PDF/image preview, parser/status and source evidence |
| Empty/stale browser lists | local-cache invalidation and request cancellation behavior in root/client |
| Release fails | Compose logs, `/api/health`, image tags and migration logs |

Do not log API keys, superuser passwords, student transcripts or full model requests when adding diagnostics. Existing logger and audit services provide places for structured operational information.
