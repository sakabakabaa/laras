/**
 * RPS completeness & consistency validation.
 *
 * Pure, client-safe functions that inspect a course's RPS data and surface
 * Indonesian, actionable warnings grouped by category:
 *
 *   - subcpmk   : missing Sub-CPMK mappings on normal teaching weeks
 *   - weekly    : incomplete weekly plans (missing indicator / material / methods / assessment)
 *   - assessment: invalid or inconsistent assessment weights (component sum ≠ 100, out-of-range)
 *   - workload  : workload inconsistencies (total ≠ sum of components, week count vs SKS)
 *
 * The validator NEVER invents values or alters data — it only reports what is
 * missing or inconsistent so the lecturer can review and fix it. Special weeks
 * (UTS/UAS/khusus) are treated separately from normal teaching weeks: they are
 * not expected to carry full teaching fields, so missing indicators/materials
 * there are not flagged.
 */
import type { RpsDraft, DraftSession, DraftAssessment } from '@/lib/rps-draft';
import type { ClassSession, Assessment } from '@/lib/learning';

export type ValidationCategory = 'subcpmk' | 'weekly' | 'assessment' | 'workload';

export type ValidationWarning = {
	category: ValidationCategory;
	/** Indonesian, actionable message. */
	message: string;
};

export type RpsValidationResult = {
	warnings: ValidationWarning[];
	counts: Record<ValidationCategory, number>;
	/** True when there are zero warnings. */
	complete: boolean;
};

export type ValidationSession = {
	week: number;
	title: string;
	specialWeekType?: 'normal' | 'uts' | 'uas' | 'khusus' | '';
	subCpmks?: string[];
	learningIndicator?: string;
	learningMaterial?: string;
	topic?: string;
	assessmentMethod?: string;
	assessmentWeight?: number | null;
	synchronousMethod?: string;
	asynchronousMethod?: string;
	duration?: string;
	references?: string;
};

export type ValidationAssessment = {
	code: string;
	description: string;
	weight: number | null;
};

export type RpsValidationInput = {
	credits?: number | null;
	workloadLecture?: number | null;
	workloadTutorial?: number | null;
	workloadPractice?: number | null;
	workloadIndependent?: number | null;
	workloadTotal?: number | null;
	sessions: ValidationSession[];
	assessments: ValidationAssessment[];
	cpmkCount: number;
	subCpmkCount: number;
};

const isEmpty = (v: string | null | undefined) => !v || !String(v).trim();
const isNormal = (s: ValidationSession) =>
	!s.specialWeekType || s.specialWeekType === 'normal';

/** Core validator. Returns categorized Indonesian warnings; never throws. */
export function validateRps(input: RpsValidationInput): RpsValidationResult {
	const warnings: ValidationWarning[] = [];
	const sessions = [...(input.sessions || [])].sort((a, b) => a.week - b.week);
	const assessments = input.assessments || [];

	// ── 1. Sub-CPMK mappings ────────────────────────────────────
	if (input.subCpmkCount > 0) {
		const missingSub = sessions.filter(
			(s) => isNormal(s) && (!s.subCpmks || s.subCpmks.length === 0),
		);
		if (missingSub.length > 0) {
			const weeks = missingSub.map((s) => s.week).join(', ');
			warnings.push({
				category: 'subcpmk',
				message: `${missingSub.length} pertemuan normal belum menautkan Sub-CPMK (minggu ${weeks}). Buka tab Rencana dan pilih Sub-CPMK pada setiap pertemuan yang belum dipetakan.`,
			});
		}
	} else if (sessions.some((s) => isNormal(s))) {
		warnings.push({
			category: 'subcpmk',
			message:
				'Belum ada Sub-CPMK pada mata kuliah ini, sehingga pertemuan tidak dapat dipetakan ke capaian. Tambahkan Sub-CPMK di langkah Deskripsi & Capaian sebelum menautkannya ke pertemuan.',
		});
	}

	// ── 2. Incomplete weekly plans (normal weeks only) ──────────
	const normalSessions = sessions.filter((s) => isNormal(s));
	for (const s of normalSessions) {
		const missing: string[] = [];
		if (isEmpty(s.title) && isEmpty(s.topic))
			missing.push('judul/topik');
		if (isEmpty(s.learningIndicator)) missing.push('indikator pembelajaran');
		if (isEmpty(s.learningMaterial) && isEmpty(s.topic)) missing.push('materi pembelajaran');
		if (isEmpty(s.synchronousMethod) && isEmpty(s.asynchronousMethod))
			missing.push('metode sinkronus/asinkronus');
		if (isEmpty(s.assessmentMethod)) missing.push('aspek penilaian');
		if (missing.length > 0) {
			warnings.push({
				category: 'weekly',
				message: `Pertemuan minggu ${s.week} belum lengkap: ${missing.join(', ')}. Lengkapi di langkah Rencana Pembelajaran.`,
			});
		}
	}

	// ── 3. Assessment weights ───────────────────────────────────
	const weighted = assessments.filter(
		(a) => a.weight != null && !Number.isNaN(a.weight),
	);
	if (assessments.length > 0) {
		if (weighted.length === 0) {
			warnings.push({
				category: 'assessment',
				message:
					'Komponen penilaian belum memiliki bobot. Isi bobot (persentase) pada setiap komponen di langkah Kriteria Penilaian agar total dapat diverifikasi.',
			});
		} else if (weighted.length < assessments.length) {
			const unweighted = assessments.length - weighted.length;
			warnings.push({
				category: 'assessment',
				message: `${unweighted} komponen penilaian belum berbobot. Lengkapi bobotnya agar total bobot dapat dihitung secara konsisten.`,
			});
		} else {
			const sum = weighted.reduce((n, a) => n + (a.weight as number), 0);
			if (sum !== 100) {
				warnings.push({
					category: 'assessment',
					message: `Total bobot seluruh komponen penilaian ${sum}% — seharusnya 100%. Sesuaikan bobot di langkah Kriteria Penilaian.`,
				});
			}
		}
	}
	// Per-session assessment weight range
	for (const s of sessions) {
		if (s.assessmentWeight != null) {
			const w = Number(s.assessmentWeight);
			if (!Number.isNaN(w) && (w < 0 || w > 100)) {
				warnings.push({
					category: 'assessment',
					message: `Bobot penilaian pertemuan minggu ${s.week} (${w}%) di luar rentang 0–100%. Perbaiki nilainya di langkah Rencana Pembelajaran.`,
				});
			}
		}
	}

	// ── 4. Workload inconsistencies ─────────────────────────────
	const lecture = numOrZero(input.workloadLecture);
	const tutorial = numOrZero(input.workloadTutorial);
	const practice = numOrZero(input.workloadPractice);
	const independent = numOrZero(input.workloadIndependent);
	const total = input.workloadTotal;
	const componentSum = lecture + tutorial + practice + independent;
	if (total != null && componentSum > 0 && total !== componentSum) {
		warnings.push({
			category: 'workload',
			message: `Total beban kerja (${total} jam) tidak sama dengan jumlah komponen (${componentSum} jam: kuliah ${lecture}, tutorial ${tutorial}, praktik ${practice}, mandiri ${independent}). Samakan nilai total di langkah Workload.`,
		});
	}
	// Expected ~16 teaching weeks for a standard semester.
	const expectedWeeks = 16;
	if (sessions.length > 0 && sessions.length < expectedWeeks) {
		warnings.push({
			category: 'workload',
			message: `Baru ${sessions.length} pertemuan terencana dari ${expectedWeeks} minggu semester. Lengkapi pertemuan yang masih kosong di langkah Rencana Pembelajaran.`,
		});
	}
	// Duplicate weeks
	const weekCounts = new Map<number, number>();
	for (const s of sessions) weekCounts.set(s.week, (weekCounts.get(s.week) || 0) + 1);
	const dups = [...weekCounts.entries()].filter(([, n]) => n > 1);
	if (dups.length > 0) {
		warnings.push({
			category: 'workload',
			message: `Terdapat minggu ganda: ${dups.map(([w]) => `minggu ${w}`).join(', ')}. Hapus sesi ganda di langkah Rencana Pembelajaran.`,
		});
	}
	// SKS vs workload sanity (rough: 1 SKS ≈ 16 jam total/semester)
	const credits = input.credits;
	if (credits != null && total != null && credits > 0 && total > 0) {
		const expected = credits * 16;
		if (total < expected * 0.5 || total > expected * 2) {
			warnings.push({
				category: 'workload',
				message: `Total beban kerja (${total} jam) jauh dari perkiraan ${expected} jam untuk ${credits} SKS. Periksa kembali alokasi jam di langkah Workload.`,
			});
		}
	}

	// ── Special-week hints (info, not blocking) ─────────────────
	// Kept as warnings but gentle: suggest marking week 8 / 16 if not done.
	const hasUts = sessions.some((s) => s.specialWeekType === 'uts');
	const hasUas = sessions.some((s) => s.specialWeekType === 'uas');
	const week8 = sessions.find((s) => s.week === 8);
	const week16 = sessions.find((s) => s.week === 16);
	if (week8 && isNormal(week8) && !hasUts) {
		warnings.push({
			category: 'weekly',
			message:
				'Pertemuan minggu 8 belum ditandai sebagai UTS. Buka langkah Rencana dan atur tipe minggu khusus ke UTS bila sesuai jadwal.',
		});
	}
	if (week16 && isNormal(week16) && !hasUas) {
		warnings.push({
			category: 'weekly',
			message:
				'Pertemuan minggu 16 belum ditandai sebagai UAS. Buka langkah Rencana dan atur tipe minggu khusus ke UAS bila sesuai jadwal.',
		});
	}

	const counts: Record<ValidationCategory, number> = {
		subcpmk: 0,
		weekly: 0,
		assessment: 0,
		workload: 0,
	};
	for (const w of warnings) counts[w.category] += 1;

	return { warnings, counts, complete: warnings.length === 0 };
}

function numOrZero(v: number | null | undefined) {
	return v == null || Number.isNaN(v) ? 0 : v;
}

/** Adapter: build validation input from an RPS draft. */
export function validationFromDraft(d: RpsDraft): RpsValidationInput {
	const subCpmkCount = d.cpmkItems.reduce((n, c) => n + c.subCpmk.length, 0);
	return {
		credits: d.credits,
		workloadLecture: d.workloadLecture,
		workloadTutorial: d.workloadTutorial,
		workloadPractice: d.workloadPractice,
		workloadIndependent: d.workloadIndependent,
		workloadTotal: d.workloadTotal,
		sessions: d.sessions.map(sessionFromDraft),
		assessments: d.assessmentItems.map(assessmentFromDraft),
		cpmkCount: d.cpmkItems.length,
		subCpmkCount,
	};
}

function sessionFromDraft(s: DraftSession): ValidationSession {
	return {
		week: s.week,
		title: s.title,
		specialWeekType: s.specialWeekType || '',
		subCpmks: s.subCpmks || s.subCpmkCodes || [],
		learningIndicator: s.learningIndicator,
		learningMaterial: s.learningMaterial,
		topic: s.topic,
		assessmentMethod: s.assessmentMethod,
		assessmentWeight: s.assessmentWeight,
		synchronousMethod: s.synchronousMethod,
		asynchronousMethod: s.asynchronousMethod,
		duration: s.duration,
		references: s.references,
	};
}

function assessmentFromDraft(a: DraftAssessment): ValidationAssessment {
	return { code: a.code, description: a.description, weight: a.weight };
}

/** Adapter: build validation input from stored course records (course overview). */
export function validationFromRecords(args: {
	credits?: number | null;
	workloadLecture?: number | null;
	workloadTutorial?: number | null;
	workloadPractice?: number | null;
	workloadIndependent?: number | null;
	workloadTotal?: number | null;
	sessions: ClassSession[];
	assessments: Assessment[];
	cpmkCount: number;
	subCpmkCount: number;
}): RpsValidationInput {
	return {
		credits: args.credits,
		workloadLecture: args.workloadLecture,
		workloadTutorial: args.workloadTutorial,
		workloadPractice: args.workloadPractice,
		workloadIndependent: args.workloadIndependent,
		workloadTotal: args.workloadTotal,
		sessions: args.sessions.map((s) => ({
			week: s.week,
			title: s.title,
			specialWeekType: s.specialWeekType || '',
			subCpmks: s.subCpmks || [],
			learningIndicator: s.learningIndicator,
			learningMaterial: s.learningMaterial,
			topic: s.topic,
			assessmentMethod: s.assessmentMethod,
			assessmentWeight: s.assessmentWeight,
			synchronousMethod: s.synchronousMethod,
			asynchronousMethod: s.asynchronousMethod,
			duration: s.duration,
			references: s.references,
		})),
		assessments: args.assessments.map((a: Assessment) => ({
			code: a.code,
			description: a.description,
			weight: a.weight,
		})),
		cpmkCount: args.cpmkCount,
		subCpmkCount: args.subCpmkCount,
	};
}

export const VALIDATION_CATEGORY_LABELS: Record<ValidationCategory, string> = {
	subcpmk: 'Pemetaan Sub-CPMK',
	weekly: 'Rencana Mingguan',
	assessment: 'Bobot Penilaian',
	workload: 'Beban Kerja',
};
