/**
 * Setup check for AI scoring. Pure and client-safe.
 *
 * A Tugas must be complete enough for the AI to judge it. Two gaps made
 * production drafts score 0: a Textkorrektur task without its source text (the
 * AI cannot judge corrections of a text it never saw) and a task without a
 * weighted rubric. In both cases no numeric score is produced.
 *
 * Heuristic for Textkorrektur: there is an explicit `requiresSourceText` flag on
 * the writing config; when it is off (older tasks), a writing task whose title
 * or instructions mention "Textkorrektur"/"Korrektur" is treated as one too.
 * Either way the task needs a non-empty `sourceText`.
 */
import { rubricCriteriaOf } from '@/lib/evaluation-scoring';
import { parseWritingConfig, taskKindForShape } from '@/lib/task-types';

type SetupAssignment = {
	shape?: string | null;
	title?: string;
	instructions?: string;
	requirements?: string;
	taskConfig?: unknown;
};

const CORRECTION_RE = /textkorrektur|korrektur/i;

export function isCorrectionTask(assignment: SetupAssignment): boolean {
	if (taskKindForShape((assignment.shape || '') as Parameters<typeof taskKindForShape>[0]) !== 'writing') return false;
	const config = parseWritingConfig(assignment.taskConfig);
	if (config.requiresSourceText) return true;
	return CORRECTION_RE.test(`${assignment.title || ''}\n${assignment.instructions || ''}\n${config.prompt || ''}`);
}

export const MISSING_SOURCE_REASON = 'tugas Textkorrektur belum memiliki teks sumber';

/** Why the AI score cannot be computed ('' when the task is set up). Source text is checked first. */
export function scoreSetupProblem(assignment: SetupAssignment): string {
	if (isCorrectionTask(assignment) && !(parseWritingConfig(assignment.taskConfig).sourceText || '').trim()) {
		return 'tugas Textkorrektur belum memiliki teks sumber';
	}
	if (!rubricCriteriaOf(assignment).some((c) => c.weight > 0)) return 'tugas belum memiliki rubrik berbobot';
	return '';
}

/** Summary texts of old drafts that scored 0 because the source text was missing. */
const MISSING_SOURCE_SUMMARY = /teks sumber|source text|teks asli|teks yang (harus )?dikoreksi|tidak (dapat|bisa) (menilai|menjudge|mengevaluasi)[^.]*koreksi/i;

export type AiScoreNotice = { kind: 'setup'; reason: string } | { kind: 'zero' } | null;

/**
 * What to show instead of an AI score. `setup`: the task is incomplete, so
 * there is no real score ("Skor AI tidak dihitung"). `zero`: a stored AI score
 * of 0 on a draft the lecturer has not reviewed; the safe reading is "needs a
 * check", never a real 0 (production 0s came from missing source text).
 */
export function aiScoreNotice(input: {
	assignment: SetupAssignment;
	recommendedScore: number | null | undefined;
	summary?: string;
	reviewed?: boolean;
}): AiScoreNotice {
	const problem = scoreSetupProblem(input.assignment);
	if (input.recommendedScore == null) return problem ? { kind: 'setup', reason: problem } : null;
	if (input.recommendedScore === 0 && !input.reviewed) {
		if (isCorrectionTask(input.assignment) && (problem || MISSING_SOURCE_SUMMARY.test(input.summary || ''))) {
			return { kind: 'setup', reason: problem || MISSING_SOURCE_REASON };
		}
		return { kind: 'zero' };
	}
	return null;
}

export const SETUP_NOTICE_TEXT = (reason: string) => `Skor AI tidak dihitung: ${reason}. Lengkapi tugas dulu.`;
