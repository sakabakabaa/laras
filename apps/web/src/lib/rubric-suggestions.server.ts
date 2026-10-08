/**
 * Server-only generation of provisional rubric-criterion suggestions for a
 * writing or speaking task. Derives suggestions ONLY from the task's own
 * stored data (taskConfig.prompt, formatGuidance, language, minWords/maxWords,
 * durationMin, task shape, and the assignment's instructions). Never invents a
 * level, textbook, or assessment the task never mentions.
 *
 * This is a task-creation affordance only. It never writes records and never
 * returns anything that affects grading, the factors breakdown, the divergence
 * warning, transcript confidence, or any published score. The caller (the API
 * route) persists the result into the separate `suggestedCriteria` field.
 */
import { collectModel } from '@/lib/assignment-draft.server';
import logger from '@/lib/logger.server';
import { parseSpeakingConfig, parseWritingConfig, taskKindForShape } from '@/lib/task-types';
import type { Assignment } from '@/lib/assignments';
import {
	MAX_RUBRIC_SUGGESTIONS,
	MIN_PROMPT_CHARS,
	type SuggestedCriterion,
} from '@/lib/rubric-suggestions';

const KIND_LABEL = { writing: 'Menulis', speaking: 'Berbicara' } as const;

function clip(value: unknown, max: number): string {
	const text = (typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim();
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

function parseModelJson(raw: string): Record<string, unknown> | null {
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start < 0 || end <= start) return null;
	try {
		const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

/** The task data the model is allowed to see, derived from the stored config. */
export function deriveSuggestionInput(assignment: Assignment): {
	kind: 'writing' | 'speaking';
	prompt: string;
	formatGuidance: string;
	language: string;
	minWords: number;
	maxWords: number;
	durationMin: number;
	instructions: string;
} | null {
	const kind = taskKindForShape(assignment.shape);
	if (kind !== 'writing' && kind !== 'speaking') return null;
	if (kind === 'writing') {
		const config = parseWritingConfig(assignment.taskConfig);
		return {
			kind: 'writing',
			prompt: config.prompt,
			formatGuidance: config.formatGuidance,
			language: config.language,
			minWords: config.minWords,
			maxWords: config.maxWords,
			durationMin: 0,
			instructions: assignment.instructions || '',
		};
	}
	const config = parseSpeakingConfig(assignment.taskConfig);
	return {
		kind: 'speaking',
		prompt: config.prompt,
		formatGuidance: '',
		language: config.language,
		minWords: 0,
		maxWords: 0,
		durationMin: config.durationMin,
		instructions: assignment.instructions || '',
	};
}

function buildPrompt(input: ReturnType<typeof deriveSuggestionInput> & {}): string {
	const facts = [
		`Bentuk tugas: ${KIND_LABEL[input.kind]}`,
		`Prompt tugas: ${clip(input.prompt, 2000)}`,
		input.language ? `Bahasa: ${clip(input.language, 80)}` : 'Bahasa: tidak disebut',
		input.formatGuidance ? `Panduan format & gaya: ${clip(input.formatGuidance, 1000)}` : '',
		input.kind === 'writing' && (input.minWords > 0 || input.maxWords > 0)
			? `Panjang kata: min ${input.minWords || 0}, maks ${input.maxWords || 0}`
			: '',
		input.kind === 'speaking' && input.durationMin > 0
			? `Durasi saran: ${input.durationMin} menit`
			: '',
		input.instructions ? `Instruksi tugas: ${clip(input.instructions, 1500)}` : '',
	]
		.filter(Boolean)
		.join('\n');

	return [
		`Anda menyarankan kriteria rubrik untuk SATU tugas ${KIND_LABEL[input.kind]} dalam Bahasa Indonesia.`,
		'Gunakan HANYA data tugas berikut. Jangan menambah level (mis. A1/A2), buku teks, atau penilaian yang tidak disebut di data.',
		'Usulkan 3–5 kriteria rubrik yang SPESIFIK dan terukur untuk tugas ini — aspek yang benar-benar dapat dinilai dari jawaban mahasiswa pada tugas ini.',
		'Setiap kriteria: label singkat dan terukur (maks 80 karakter, gaya sama dengan label kriteria rubrik yang sudah ada mis. "Kelancaran", "Ketepatan tata bahasa"), bobot relatif 1–3, dan alasan singkat mengapa aspek itu relevan untuk tugas ini.',
		'DILARANG: mengarang kriteria yang menyiratkan level, buku, atau penilaian yang tidak disebut. Jangan menyalin komponen penilaian mata kuliah sebagai baris rubrik.',
		'Jika prompt terlalu singkat atau terlalu samar untuk menurunkan kriteria yang berarti, kembalikan criteria kosong dan isi reason dengan penjelasan singkat — jangan menebak.',
		'Data tugas:',
		facts,
		'Balas HANYA JSON: {"criteria":[{"label":"","weight":1,"rationale":""}],"reason":""}',
	].join('\n\n');
}

/** Sanitize the model reply into a capped, clipped suggestion list. */
function sanitizeCriteria(raw: Record<string, unknown>): SuggestedCriterion[] {
	const rows = Array.isArray(raw.criteria) ? (raw.criteria as Record<string, unknown>[]) : [];
	const seen = new Set<string>();
	const out: SuggestedCriterion[] = [];
	for (const row of rows) {
		const label = clip(row.label, 200);
		if (!label || label.length < 3) continue;
		const key = label.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		const weightRaw = Math.round(typeof row.weight === 'number' ? row.weight : 1);
		const weight = Math.max(1, Math.min(3, Number.isFinite(weightRaw) ? weightRaw : 1));
		out.push({
			id: `s${out.length + 1}-${Math.random().toString(36).slice(2, 8)}`,
			label,
			weight,
			rationale: clip(row.rationale, 500),
		});
		if (out.length >= MAX_RUBRIC_SUGGESTIONS) break;
	}
	return out;
}

/**
 * Build provisional suggestions for one assignment. Returns an empty pending
 * list with a reason when the prompt is too short/vague or the model is
 * unavailable — never guesses. Does NOT persist; the caller does that.
 */
export async function buildRubricSuggestions(assignment: Assignment): Promise<{
	pending: SuggestedCriterion[];
	generatedAt: string;
	reason: string;
}> {
	const input = deriveSuggestionInput(assignment);
	if (!input) {
		return { pending: [], generatedAt: '', reason: 'Saran rubrik hanya tersedia untuk tugas Menulis atau Berbicara.' };
	}
	if (input.prompt.trim().length < MIN_PROMPT_CHARS) {
		return { pending: [], generatedAt: '', reason: 'Prompt tugas terlalu singkat untuk menurunkan saran kriteria — lengkapi prompt terlebih dahulu.' };
	}

	try {
		const raw = await collectModel(buildPrompt(input));
		const parsed = parseModelJson(raw);
		if (!parsed) {
			return { pending: [], generatedAt: new Date().toISOString(), reason: 'Model tidak mengembalikan saran yang bisa dibaca. Tidak ada kriteria yang diarang — tambahkan manual.' };
		}
		const pending = sanitizeCriteria(parsed);
		const modelReason = typeof parsed.reason === 'string' ? clip(parsed.reason, 1000) : '';
		if (pending.length === 0) {
			return {
				pending: [],
				generatedAt: new Date().toISOString(),
				reason: modelReason || 'Prompt terlalu samar untuk menurunkan kriteria yang berarti — tambahkan manual.',
			};
		}
		return { pending, generatedAt: new Date().toISOString(), reason: '' };
	} catch (error) {
		logger.error('rubric suggestions model failed', error);
		return {
			pending: [],
			generatedAt: new Date().toISOString(),
			reason: 'Asisten AI tidak tersedia saat ini. Tidak ada kriteria yang diarang — tambahkan manual.',
		};
	}
}
