/**
 * Student-facing evaluation text. Numeric scores stay on the grade field and
 * in lecturer views; students only see a letter plus the lecturer's published
 * recommendations.
 */

export type StudentRecommendation = {
	severity: 'minor' | 'major';
	note: string;
	quote: string;
};

const SCORE_LINE = /\b\d{1,3}\s*\/\s*100\b/;

/** Drops final scores and rubric totals from already-published feedback text. */
export function studentRecommendationText(raw: string): string {
	if (!raw.trim()) return '';
	const out: string[] = [];
	let inRubric = false;
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) {
			if (!inRubric && out.length > 0 && out[out.length - 1] !== '') out.push('');
			continue;
		}
		if (/^nilai akhir\s*:/i.test(trimmed)) continue;
		if (/^rincian rubrik\s*:/i.test(trimmed)) {
			inRubric = true;
			continue;
		}
		if (inRubric) {
			if (/^-\s/.test(trimmed) && SCORE_LINE.test(trimmed)) continue;
			inRubric = false;
		}
		if (SCORE_LINE.test(trimmed)) continue;
		if (/^dinilai dan dipublikasikan/i.test(trimmed)) continue;
		if (/^catatan penilaian\s*:/i.test(trimmed)) {
			out.push('Saran perbaikan:');
			continue;
		}
		if (/^catatan dosen\s*:/i.test(trimmed)) {
			const note = trimmed.replace(/^catatan dosen\s*:\s*/i, '').trim();
			if (note) out.push(note);
			continue;
		}
		out.push(trimmed.replace(/\(\s*disesuaikan dosen\s*\)/gi, '').trim());
	}
	return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Extracts the lecturer's free-text note from published feedback, leaving
 * out the rubric breakdown and the per-finding recommendation lines (which
 * are rendered separately as inline marks and a recommendation list). Used
 * for the "Catatan dosen" block so it never duplicates the findings below.
 */
export function studentGeneralNote(raw: string): string {
	if (!raw.trim()) return '';
	const out: string[] = [];
	let inRubric = false;
	let inFindings = false;
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) {
			if (!inRubric && !inFindings && out.length > 0 && out[out.length - 1] !== '') out.push('');
			continue;
		}
		if (/^nilai akhir\s*:/i.test(trimmed)) continue;
		if (/^rincian rubrik\s*:/i.test(trimmed)) {
			inRubric = true;
			continue;
		}
		if (inRubric) {
			if (/^-\s/.test(trimmed) && SCORE_LINE.test(trimmed)) continue;
			inRubric = false;
		}
		if (SCORE_LINE.test(trimmed)) continue;
		if (/^catatan penilaian\s*:/i.test(trimmed) || /^saran perbaikan\s*:/i.test(trimmed)) {
			inFindings = true;
			continue;
		}
		if (inFindings) {
			if (/^-\s/.test(trimmed)) continue;
			inFindings = false;
		}
		if (/^catatan dosen\s*:/i.test(trimmed)) {
			const note = trimmed.replace(/^catatan dosen\s*:\s*/i, '').trim();
			if (note) out.push(note);
			continue;
		}
		if (/^dinilai dan dipublikasikan/i.test(trimmed)) continue;
		out.push(trimmed.replace(/\(\s*disesuaikan dosen\s*\)/gi, '').trim());
	}
	return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const SEVERITY_BRACKET = /^\[(Kesalahan berarti|Perlu perbaikan)\]\s*(.*)$/;
const SEVERITY_COLON = /^(Kesalahan berarti|Perlu perbaikan)\s*:\s*(.*)$/;
const TRAILING_QUOTE = /\s+[—–]\s+"([^"]+)"\.?\s*$/;
const TEKS_QUOTE = /\s*Pada teks:\s*"([^"]+)"\.?\s*$/i;

/**
 * Parses structured recommendations (each with its quoted passage) from the
 * published feedback text. Used as a fallback when the evaluation-result API
 * is unavailable, so inline corrections still anchor to the student's answer.
 *
 * Handles both renderings the publish flow has produced: the current
 * "Saran perbaikan:" list (`- Kesalahan berarti: note Pada teks: "quote".`)
 * and the older "Catatan penilaian:" list (`- [Kesalahan berarti] note — "quote"`).
 */
export function parseStudentRecommendations(raw: string): StudentRecommendation[] {
	if (!raw || !raw.trim()) return [];
	const out: StudentRecommendation[] = [];
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed.startsWith('- ')) continue;
		const body = trimmed.slice(2);
		let severity: 'major' | 'minor' | null = null;
		let rest = body;
		const bracket = body.match(SEVERITY_BRACKET);
		if (bracket) {
			severity = bracket[1] === 'Kesalahan berarti' ? 'major' : 'minor';
			rest = bracket[2];
		} else {
			const colon = body.match(SEVERITY_COLON);
			if (colon) {
				severity = colon[1] === 'Kesalahan berarti' ? 'major' : 'minor';
				rest = colon[2];
			}
		}
		if (!severity) continue;
		let quote = '';
		let note = rest.trim();
		const dash = rest.match(TRAILING_QUOTE);
		if (dash) {
			quote = dash[1].trim();
			note = rest.slice(0, dash.index).trim();
		} else {
			const teks = rest.match(TEKS_QUOTE);
			if (teks) {
				quote = teks[1].trim();
				note = rest.slice(0, teks.index).trim();
			}
		}
		if (!note) continue;
		out.push({ severity, note, quote });
	}
	return out;
}
