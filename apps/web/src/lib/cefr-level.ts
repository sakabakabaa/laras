/**
 * CEFR proficiency level derived from a language-skills course code.
 *
 * Many language course codes carry the target CEFR level as their first token,
 * e.g. "A1 JR241" or "A1-JR241" means level A1. This module extracts that
 * level from the code (the source of truth — no course record or schema change)
 * and renders a short Indonesian calibration guide for AI evaluation prompts.
 *
 * The guide is intended ONLY for language-skills evaluation. Callers gate it on
 * a language-skills task type (`taskKindForShape`), so it never leaks into
 * unrelated courses or task types. Codes without a recognizable CEFR level
 * fall back to an empty guide, leaving existing evaluation behavior unchanged.
 */
import { taskKindForShape } from '@/lib/task-types';
import type { Assignment } from '@/lib/assignments';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/**
 * Matches a standalone CEFR level token (A1–C2) anywhere in the code. The
 * trailing `\b` requires a word boundary after the digit, so "A1-JR241",
 * "A1 JR241", and "JR241 A1" all resolve to "A1", while "A11" or "A1B" do not
 * falsely match.
 */
const CEFR_RE = /\b([ABC][12])\b/;

/** Extract a CEFR level (A1–C2) from a course code, e.g. "A1 JR241" → "A1". */
export function extractCefrLevel(courseCode: string): string | null {
	const code = (courseCode || '').toUpperCase();
	const match = CEFR_RE.exec(code);
	if (!match) return null;
	const level = match[1];
	return (CEFR_LEVELS as readonly string[]).includes(level) ? level : null;
}

const CEFR_DESCRIPTION: Record<CefrLevel, string> = {
	A1: 'A1 (Pemula) — kosakata dan kalimat sangat sederhana; ekspresi sehari-hari dasar dan frasa pendek.',
	A2: 'A2 (Dasar) — kalimat sederhana dan rutin pada topik familiar sehari-hari; deskripsi langsung dan singkat.',
	B1: 'B1 (Menengah) — gagasan sederhana pada situasi familiar; mampu menghubungkan kalimat dan menjelaskan rencana serta pengalaman.',
	B2: 'B2 (Menengah atas) — gagasan abstrak dan teknis pada beragam topik; alur argumen yang jelas dan terperinci.',
	C1: 'C1 (Mahir) — bahasa fleksibel dan terstruktur untuk topik kompleks; penggunaan kata penghubung dan nuansa yang baik.',
	C2: 'C2 (Mahir tinggi) — penguasaan bahasa yang sangat tinggi; presisi, nuansa, dan kefasihan mendekati penutur asli.',
};

/**
 * Indonesian level-calibration guide for AI evaluation prompts. Returns '' when
 * the level is unrecognized, so callers can append it safely without branching.
 */
export function cefrLevelGuide(level: string | null): string {
	if (!level) return '';
	const desc = CEFR_DESCRIPTION[level.toUpperCase() as CefrLevel];
	if (!desc) return '';
	return (
		`Tingkat kompetensi mata kuliah (CEFR): ${desc} ` +
		'Sesuaikan ekspektasi umpan balik dengan tingkat ini — jangan menuntut standar di atas atau di bawah tingkat yang tertera pada kode mata kuliah.'
	);
}

/**
 * The CEFR level guide for one assignment, applied ONLY to language-skills task
 * types. Returns '' for non-language tasks or codes without a CEFR level, so
 * the guide never leaks into unrelated evaluation.
 */
export function languageLevelGuide(assignment: Assignment, courseCode: string): string {
	if (!taskKindForShape(assignment.shape)) return '';
	return cefrLevelGuide(extractCefrLevel(courseCode));
}
