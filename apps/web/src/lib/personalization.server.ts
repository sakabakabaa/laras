/**
 * Phase 10 — adaptive feedback personalization (server-side).
 *
 * Decides a pedagogical strategy from the learner's validated profile and the
 * current error, and builds the model context that adapts the formative
 * feedback. Personalization is GUIDANCE ONLY — it never changes the
 * formative-only rules (no answers, no verdicts, no grades, no rewrites) and
 * never exposes private analytics to the student.
 *
 * Safety boundaries (enforced here and in the prompt):
 *  - Only validated/reliable learner history influences personalization.
 *  - Emerging patterns (below the threshold) are NOT used.
 *  - The student-facing output never mentions counts, internal confidence, or
 *    "your profile says you are weak at…". It uses supportive, natural language.
 */
import type { LearnerProfile, LearnerPattern, PatternStatus } from '@/lib/learner-profile';
import { relevantPatterns, categoryObservationCount } from '@/lib/learner-profile';

/** The adaptive scaffolding strategy selected for one feedback event. */
export type FeedbackStrategy =
	| 'generic'
	| 'reflection'
	| 'concept'
	| 'focused'
	| 'explicit'
	| 'reduce_scaffolding';

export const STRATEGY_LABEL: Record<FeedbackStrategy, string> = {
	generic: 'Generik',
	reflection: 'Refleksi',
	concept: 'Konsep',
	focused: 'Terarah',
	explicit: 'Eksplisit',
	reduce_scaffolding: 'Kurangi scaffolding',
};

/**
 * Select the adaptive strategy for the current error.
 *
 * The strategy considers the recurring-pattern status and the progressive
 * hint level already reached. It is adaptive scaffolding, not simply
 * increasingly explicit correction:
 *  - emerging / no validated pattern → reflection (Level 1 default);
 *  - recurring → conceptual explanation;
 *  - established / persistent → focused hint;
 *  - improving → gradually reduce scaffolding (back to reflection/concept).
 *
 * Explicit correction (Level 4) is never auto-selected — it stays
 * student-requested only, as in Phase 8.
 */
export function selectStrategy(input: {
	profile: LearnerProfile | null;
	currentCategory: string;
	hintLevel: number;
}): FeedbackStrategy {
	const { profile, currentCategory } = input;
	if (!profile) return 'generic';
	// Phase 10.2 — unknown current category → generic strategy (no profile bias).
	if (!currentCategory || !currentCategory.trim()) return 'generic';
	const relevant = relevantPatterns(profile, currentCategory);
	if (relevant.length === 0) return 'generic';

	const hasEstablished = relevant.some((p) => p.status === 'established');
	const hasRecurring = relevant.some((p) => p.status === 'recurring');
	const hasImproving = relevant.some((p) => p.status === 'improving');

	if (hasImproving && !hasEstablished) return 'reduce_scaffolding';
	if (hasEstablished) return 'focused';
	if (hasRecurring) return 'concept';
	return 'reflection';
}

/**
 * Build the validated learner-history context for the model. This is the ONLY
 * learner data the model sees — aggregated counts by category/subcategory,
 * never raw answers, never internal confidence, never "you made N mistakes".
 *
 * When `currentCategory` is empty (the current error is not known pre-model),
 * all non-emerging validated patterns are provided so the model can adapt to
 * whatever error it finds. Returns '' when there is no relevant validated
 * history (generic feedback).
 */
export function buildPersonalizationContext(input: {
	profile: LearnerProfile;
	currentCategory: string;
}): string {
	const { profile, currentCategory } = input;
	// Phase 10.2 — when the current error category is unknown pre-model, do NOT
	// provide the entire learner profile. Use generic feedback context instead.
	// Only provide learner-history context when the current validated/current
	// error category matches an established learner pattern. This prevents
	// unrelated learner history from biasing interpretation of a new error.
	if (!currentCategory || !currentCategory.trim()) return '';
	const relevant = relevantPatterns(profile, currentCategory);
	if (relevant.length === 0) return '';

	const lines: string[] = [
		'Riwayat pembelajaran tervalidasi yang relevan (hanya data yang sudah divalidasi dosen; jangan sebutkan angka atau statistik kepada mahasiswa):',
	];
	if (currentCategory) {
		const totalForCategory = categoryObservationCount(profile, currentCategory);
		lines.push(`- Kategori "${currentCategory}": ${totalForCategory} observasi tervalidasi.`);
	}
	for (const p of relevant.slice(0, 5)) {
		const sub = p.subcategory ? ` › ${p.subcategory}` : '';
		lines.push(`- ${p.category}${sub}: ${p.count} observasi (status: ${p.status}).`);
	}
	lines.push(
		'Gunakan riwayat ini untuk menyesuaikan strategi pedagogis — bukan untuk menyebutkan jumlah kesalahan kepada mahasiswa. Bahasa tetap suportif dan natural (mis. "Mari kita latih pola ini sekali lagi" atau "Coba pikirkan perbedaan antara gerak dan lokasi").',
	);
	return lines.join('\n');
}

/**
 * Optionally suggest a short, level-appropriate targeted practice activity
 * when a validated recurring pattern is detected. Returns null when no
 * relevant recurring pattern exists or the pattern is still emerging.
 *
 * The activity is a SUGGESTION to the model/system only — it is never
 * automatically created in bulk, and never auto-assigned to the student.
 */
export type PracticeSuggestion = {
	category: string;
	subcategory: string;
	activityType: string;
	prompt: string;
};

const PRACTICE_BY_CATEGORY: Record<string, { type: string; prompt: string }> = {
	Morphology: {
		type: 'Pilihan ganda kontekstual',
		prompt: 'Pilih artikel/kasus yang benar untuk melengkapi frasa benda dalam kalimat pendek.',
	},
	Syntax: {
		type: 'Penyusunan ulang kalimat',
		prompt: 'Susun ulang kata-kata menjadi kalimat bahasa target dengan urutan yang benar.',
	},
	Preposition: {
		type: 'Pilihan preposisi kontekstual',
		prompt: 'Pilih preposisi yang tepat, perhatikan kontras gerak vs lokasi.',
	},
	Lexicon: {
		type: 'Melengkapi frasa',
		prompt: 'Lengkapi kolokasi/frasa benda yang tepat dari pilihan yang diberikan.',
	},
	Orthography: {
		type: 'Koreksi ejaan',
		prompt: 'Tandai dan perbaiki kesalahan ejaan/umlaut pada kalimat pendek.',
	},
};

export function suggestPractice(input: {
	profile: LearnerProfile;
	currentCategory: string;
}): PracticeSuggestion | null {
	// Phase 10.2 — no practice suggestion when the current category is unknown.
	if (!input.currentCategory || !input.currentCategory.trim()) return null;
	const relevant = relevantPatterns(input.profile, input.currentCategory);
	if (relevant.length === 0) return null;
	// Only suggest practice for recurring/established patterns, never emerging.
	const pattern = relevant.find((p) => p.status === 'established') || relevant[0];
	const recipe = PRACTICE_BY_CATEGORY[pattern.category] || {
		type: 'Latihan singkat',
		prompt: 'Latihan singkat yang berfokus pada pola kesalahan yang berulang ini.',
	};
	return {
		category: pattern.category,
		subcategory: pattern.subcategory,
		activityType: recipe.type,
		prompt: recipe.prompt,
	};
}

/** A compact summary of the personalization decision for provenance logging. */
export type PersonalizationDecision = {
	enabled: boolean;
	strategy: FeedbackStrategy;
	relevantCategories: string[];
	historicalObservationCount: number;
	profileVersion: string;
};

export function summarizeDecision(input: {
	profile: LearnerProfile | null;
	currentCategory: string;
	strategy: FeedbackStrategy;
}): PersonalizationDecision {
	const profile = input.profile;
	// Phase 10.2 — only provide relevant history when the current category
	// matches an established validated pattern.
	const relevant = profile && input.currentCategory
		? relevantPatterns(profile, input.currentCategory)
		: [];
	return {
		enabled: input.strategy !== 'generic',
		strategy: input.strategy,
		relevantCategories: relevant.map((p) => p.category),
		historicalObservationCount: relevant.reduce((sum, p) => sum + p.count, 0),
		profileVersion: profile?.version || '',
	};
}
