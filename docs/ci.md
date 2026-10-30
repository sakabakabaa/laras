# Continuous integration

GitHub Actions runs `.github/workflows/ci.yml` for every pull request, every push to `main`, and manual runs from the Actions tab. No production credentials are used.

The `Web checks` job installs the lockfile with Node 22, lints changed TypeScript files, checks types, runs the complete unit/render suite, and builds the production app. Changed-file lint uses the pull request's merge base or the previous main revision. A manual run checks the last commit. Existing lint warnings are not promoted to errors.

The `PocketBase integration` job starts the checked-in Linux binary against a fresh local database with synthetic accounts. It tests migrations, authorization, class schedules, attendance, submissions, grading, publication, and restart recovery. Its HTTP target is restricted to loopback; it never connects to the VPS.

The final `CI` check fails unless both jobs succeed, including when a prerequisite fails or is cancelled. Configure `main` to require **CI** in the repository's branch rules after the first successful run. Keep that check name stable. Workflow triggers have no path filters, so required checks also run for documentation-only changes.

## Run locally

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run lint:changed -- <base-commit-sha>
npm run typecheck --workspace web
npm test --workspace web
npm run build --workspace web
```

The backend integration check requires Linux (or a Linux container):

```sh
chmod +x apps/pocketbase/pocketbase
PB_TEST_BINARY="$PWD/apps/pocketbase/pocketbase" node apps/web/scripts/test-scheduled-classes.mjs
```

CI does not deploy. Production releases remain manually initiated and use the existing VPS backup, pinned-image deployment, and health-check process.
