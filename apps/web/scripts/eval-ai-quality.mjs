#!/usr/bin/env node
/**
 * AI evaluation quality harness (Tugas).
 *
 * Re-runs the CURRENT evaluation pipeline in dry-run mode (nothing is written
 * to PocketBase) on "gold" submissions and compares the result with what the
 * lecturer actually decided. Gold = ai_evaluations rows with `reviewedAt` set
 * and lecturer decisions in `reviewFindings`, and/or a published grade
 * (`finalScore` + `publishedAt`).
 *
 * Reports (a short table, then the JSON report; use --json for JSON only):
 *   - finding precision: new AI findings matching a lecturer-approved finding /
 *     new AI findings matching an approved or rejected one (undecided ignored)
 *   - recall: lecturer-approved + lecturer-added findings matched by a new AI
 *     finding (quote overlap) / all of them
 *   - score MAE: |AI recommendedScore - published finalScore|
 *   - all of the above per error category
 *
 * Usage (from apps/web, with the app's env: POCKETBASE_URL, PB_SUPERUSER_EMAIL,
 * PB_SUPERUSER_PASSWORD and the HROUTER_* model settings):
 *   node --env-file-if-exists=.env scripts/eval-ai-quality.mjs [options]
 *
 * Options:
 *   --limit N         evaluate at most N gold submissions (default 20)
 *   --assignment ID   only this assignment
 *   --prompt v4|v5    v4 = single pass (same as AI_EVAL_TWO_PASS=0), v5 = two-pass (default)
 *   --json            print only the JSON report
 *   --help            show this text
 *
 * Cost: every submission costs 1 (v4) or 2 (v5) model calls. Secrets are never
 * printed. Run `--prompt v4` and `--prompt v5` on the same `--limit` to compare.
 */
import { createServer } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
	const args = { limit: 20, assignment: '', prompt: 'v5', json: false, help: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--help' || a === '-h') args.help = true;
		else if (a === '--json') args.json = true;
		else if (a === '--limit') args.limit = Number(argv[++i]);
		else if (a === '--assignment') args.assignment = argv[++i] ?? '';
		else if (a === '--prompt') args.prompt = argv[++i] ?? '';
		else throw new Error(`Opsi tidak dikenal: ${a}`);
	}
	if (!Number.isInteger(args.limit) || args.limit < 1) throw new Error('--limit harus bilangan bulat >= 1');
	if (args.prompt !== 'v4' && args.prompt !== 'v5') throw new Error('--prompt harus v4 atau v5');
	if (!/^[A-Za-z0-9]*$/.test(args.assignment)) throw new Error('--assignment tidak valid');
	return args;
}

const pct = (v) => (v == null ? '  n/a' : `${(v * 100).toFixed(0).padStart(4)}%`);

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log('Lihat komentar di bagian atas scripts/eval-ai-quality.mjs untuk cara pakai.');
		return;
	}
	const vite = await createServer({
		root,
		configFile: false,
		logLevel: 'error',
		appType: 'custom',
		server: { middlewareMode: true, hmr: false, watch: null },
		optimizeDeps: { noDiscovery: true },
		resolve: { alias: { '@': resolve(root, 'src') } },
	});
	try {
		const { pocketbaseAdmin } = await vite.ssrLoadModule('/src/lib/pocketbase-client.server.ts');
		const { dryRunEvaluation } = await vite.ssrLoadModule('/src/lib/ai-evaluation.server.ts');
		const { parseFindings, parseReviewFindings } = await vite.ssrLoadModule('/src/lib/ai-evaluation.ts');
		const { scoreRun, aggregateRuns, storedPrecision } = await vite.ssrLoadModule('/src/lib/ai-eval-quality.ts');

		const filters = ['reviewedAt != ""'];
		if (args.assignment) filters.push(`assignment="${args.assignment}"`);
		const gold = await pocketbaseAdmin.listRecords('ai_evaluations', {
			perPage: Math.min(args.limit * 3, 200),
			sort: '-reviewedAt',
			filter: filters.join(' && '),
		});

		const assignments = new Map();
		const runs = [];
		const perSubmission = [];
		const stored = { approved: 0, rejected: 0 };
		for (const row of gold.items) {
			if (runs.length >= args.limit) break;
			const reviewFindings = parseReviewFindings(row.reviewFindings);
			const finalScore = typeof row.finalScore === 'number' && row.publishedAt ? row.finalScore : null;
			// Needs lecturer decisions and/or a published score to be gold.
			if (reviewFindings.length === 0 && finalScore == null) continue;
			if (!row.submission || !row.assignment) continue;
			try {
				if (!assignments.has(row.assignment)) {
					assignments.set(row.assignment, await pocketbaseAdmin.getRecord('assignments', row.assignment));
				}
				const outcome = await dryRunEvaluation({
					assignment: assignments.get(row.assignment),
					submissionId: row.submission,
					twoPass: args.prompt === 'v5',
				});
				if (outcome.status !== 'ready' || outcome.result === 'insufficient') {
					perSubmission.push({ submission: row.submission, skipped: outcome.reason || outcome.status });
					continue;
				}
				const aiFindings = parseFindings(outcome.findings);
				const metrics = scoreRun({
					reviewFindings,
					aiFindings,
					recommendedScore: typeof outcome.recommendedScore === 'number' ? outcome.recommendedScore : null,
					finalScore,
				});
				runs.push(metrics);
				const sp = storedPrecision(reviewFindings);
				stored.approved += sp.approved;
				stored.rejected += sp.rejected;
				perSubmission.push({
					submission: row.submission,
					assignment: row.assignment,
					findings: aiFindings.length,
					recommendedScore: outcome.recommendedScore ?? null,
					finalScore,
					tp: metrics.tp,
					fp: metrics.fp,
					recallHit: metrics.recallHit,
					recallTotal: metrics.recallTotal,
				});
			} catch (error) {
				perSubmission.push({ submission: row.submission, error: error instanceof Error ? error.message : 'gagal' });
			}
		}

		const aggregate = aggregateRuns(runs);
		const total = stored.approved + stored.rejected;
		const report = {
			prompt: args.prompt === 'v5' ? 'german-gfl-feedback-v5-two-pass' : 'german-gfl-feedback-v4-ocr',
			evaluated: runs.length,
			goldCandidates: gold.items.length,
			...aggregate,
			storedDraftPrecision: total ? Math.round((stored.approved / total) * 1000) / 1000 : null,
			submissionsDetail: perSubmission,
		};
		if (!args.json) {
			console.log(`Prompt ${report.prompt} · ${report.evaluated} kiriman gold (dari ${report.goldCandidates} kandidat)`);
			console.log(`Presisi ${pct(report.precision)} · Recall ${pct(report.recall)} · MAE skor ${report.scoreMae ?? 'n/a'} (n=${report.scoreCount}) · temuan/kiriman ${report.findingsPerSubmission ?? 'n/a'}`);
			console.log(`Presisi draf lama (disetujui/(disetujui+ditolak)): ${pct(report.storedDraftPrecision)}`);
			console.log('\nKategori'.padEnd(26) + 'Presisi'.padStart(9) + 'Recall'.padStart(9) + '   TP  FP  Hit/Total');
			for (const [name, c] of Object.entries(report.byCategory).sort()) {
				console.log(`${name.padEnd(25)}${pct(c.precision).padStart(9)}${pct(c.recall).padStart(9)}  ${String(c.tp).padStart(3)} ${String(c.fp).padStart(3)}  ${c.recallHit}/${c.recallTotal}`);
			}
			console.log('');
		}
		console.log(JSON.stringify(report, null, 2));
	} finally {
		await vite.close();
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : 'Gagal menjalankan harness.');
	process.exit(1);
});
