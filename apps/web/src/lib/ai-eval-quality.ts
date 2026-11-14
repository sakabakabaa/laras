/**
 * Pure metrics for the AI evaluation quality harness (scripts/eval-ai-quality.mjs).
 *
 * The "gold" signal is the lecturer's own review of an AI draft: findings they
 * approved/edited (positives), findings they rejected (negatives), findings
 * they added themselves (positives the AI should have found), and the final
 * published score. A fresh AI run is compared with that signal by quote
 * overlap. Nothing here touches the network or the database.
 */
export type GoldFinding = {
	source?: string;
	status?: string;
	quote?: string;
	category?: string;
};

export type RunFinding = { quote?: string; category?: string };

export type CategoryCounts = { tp: number; fp: number; recallHit: number; recallTotal: number };

export type RunMetrics = {
	/** New AI findings that matched a finding the lecturer approved / rejected / never decided. */
	tp: number;
	fp: number;
	undecided: number;
	/** Lecturer-approved + lecturer-added findings (with a quote) and how many the new run matched. */
	recallHit: number;
	recallTotal: number;
	byCategory: Record<string, CategoryCounts>;
	scoreError: number | null;
};

const OCR_MARKS = /[⟦⟧]/g;
const normalize = (value: string): string =>
	value.replace(OCR_MARKS, '').toLowerCase().replace(/\s+/g, ' ').trim();
const tokens = (value: string): string[] => normalize(value).split(/[^\p{L}\p{N}ß]+/u).filter(Boolean);

/** True when two quotes cover the same words: one contains the other, or most tokens are shared. */
export function quotesOverlap(a: string, b: string): boolean {
	const na = normalize(a);
	const nb = normalize(b);
	if (!na || !nb) return false;
	if (na.includes(nb) || nb.includes(na)) return true;
	const ta = new Set(tokens(a));
	const tb = new Set(tokens(b));
	if (ta.size === 0 || tb.size === 0) return false;
	let shared = 0;
	for (const token of ta) if (tb.has(token)) shared++;
	return shared / Math.min(ta.size, tb.size) >= 0.6;
}

const categoryOf = (value: string | undefined): string => value || 'Lainnya';

export function splitGold(reviewFindings: GoldFinding[]): { positives: GoldFinding[]; negatives: GoldFinding[] } {
	const positives: GoldFinding[] = [];
	const negatives: GoldFinding[] = [];
	for (const f of reviewFindings) {
		if (!f.quote?.trim()) continue; // general findings cannot be matched by quote
		if (f.source === 'lecturer') positives.push(f);
		else if (f.source === 'ai' && (f.status === 'approved' || f.status === 'edited')) positives.push(f);
		else if (f.source === 'ai' && f.status === 'rejected') negatives.push(f);
	}
	return { positives, negatives };
}

export function scoreRun(input: {
	reviewFindings: GoldFinding[];
	aiFindings: RunFinding[];
	recommendedScore?: number | null;
	finalScore?: number | null;
}): RunMetrics {
	const { positives, negatives } = splitGold(input.reviewFindings);
	const byCategory: Record<string, CategoryCounts> = {};
	const cat = (name: string) => (byCategory[name] ??= { tp: 0, fp: 0, recallHit: 0, recallTotal: 0 });
	let tp = 0;
	let fp = 0;
	let undecided = 0;
	for (const finding of input.aiFindings) {
		const quote = finding.quote?.trim();
		if (!quote) continue;
		const counts = cat(categoryOf(finding.category));
		if (positives.some((p) => quotesOverlap(quote, p.quote ?? ''))) {
			tp++;
			counts.tp++;
		} else if (negatives.some((n) => quotesOverlap(quote, n.quote ?? ''))) {
			fp++;
			counts.fp++;
		} else undecided++;
	}
	let recallHit = 0;
	for (const positive of positives) {
		const counts = cat(categoryOf(positive.category));
		counts.recallTotal++;
		if (input.aiFindings.some((f) => f.quote?.trim() && quotesOverlap(f.quote, positive.quote ?? ''))) {
			recallHit++;
			counts.recallHit++;
		}
	}
	const scoreError =
		typeof input.recommendedScore === 'number' && typeof input.finalScore === 'number'
			? Math.abs(input.recommendedScore - input.finalScore)
			: null;
	return { tp, fp, undecided, recallHit, recallTotal: positives.length, byCategory, scoreError };
}

const ratio = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 1000) / 1000 : null);

export type AggregateMetrics = {
	submissions: number;
	precision: number | null;
	recall: number | null;
	scoreMae: number | null;
	scoreCount: number;
	findingsPerSubmission: number | null;
	byCategory: Record<string, { precision: number | null; recall: number | null; tp: number; fp: number; recallHit: number; recallTotal: number }>;
};

/** Micro-averaged precision/recall over all runs, MAE over runs that have both scores. */
export function aggregateRuns(runs: RunMetrics[]): AggregateMetrics {
	const totals: Record<string, CategoryCounts> = {};
	let tp = 0;
	let fp = 0;
	let undecided = 0;
	let hit = 0;
	let total = 0;
	const errors: number[] = [];
	for (const run of runs) {
		tp += run.tp;
		fp += run.fp;
		undecided += run.undecided;
		hit += run.recallHit;
		total += run.recallTotal;
		if (run.scoreError != null) errors.push(run.scoreError);
		for (const [name, c] of Object.entries(run.byCategory)) {
			const t = (totals[name] ??= { tp: 0, fp: 0, recallHit: 0, recallTotal: 0 });
			t.tp += c.tp;
			t.fp += c.fp;
			t.recallHit += c.recallHit;
			t.recallTotal += c.recallTotal;
		}
	}
	return {
		submissions: runs.length,
		precision: ratio(tp, tp + fp),
		recall: ratio(hit, total),
		scoreMae: errors.length ? Math.round((errors.reduce((a, b) => a + b, 0) / errors.length) * 100) / 100 : null,
		scoreCount: errors.length,
		findingsPerSubmission: runs.length ? Math.round(((tp + fp + undecided) / runs.length) * 100) / 100 : null,
		byCategory: Object.fromEntries(
			Object.entries(totals).map(([name, c]) => [
				name,
				{ ...c, precision: ratio(c.tp, c.tp + c.fp), recall: ratio(c.recallHit, c.recallTotal) },
			]),
		),
	};
}

/** Precision of the ORIGINAL stored draft: approved / (approved + rejected), for reference. */
export function storedPrecision(reviewFindings: GoldFinding[]): { approved: number; rejected: number } {
	let approved = 0;
	let rejected = 0;
	for (const f of reviewFindings) {
		if (f.source !== 'ai') continue;
		if (f.status === 'approved' || f.status === 'edited') approved++;
		else if (f.status === 'rejected') rejected++;
	}
	return { approved, rejected };
}
