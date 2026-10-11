import { validatedRubric, rubricTotal } from './evaluation-rubric';
/**
 * Phase 1 (evaluasi dosen) — server-side AI evaluation drafts for Tugas formal.
 *
 * When a formal submission lands (enrolled or public), a DRAFT evaluation is
 * prepared in the background so it is ready when the lecturer opens the
 * evaluation page. The draft reviews the student's own answer against the
 * task requirements, the lecturer's rubric, and — only when available —
 * lecturer-approved course material retrieved through the existing
 * feature-scoped context retrieval (feature "material"). Every finding must
 * quote an exact substring of the student's text; anything the model invents
 * is dropped. When there is not enough verifiable evidence, the draft records
 * an explicit insufficient state — never a guess.
 *
 * Safety contract:
 * - Generation NEVER blocks or breaks the submission flow: `queueEvaluationDraft`
 *   only writes a fast `pending` row and kicks off the analysis in the
 *   background; every failure is caught and recorded as a `failed` row.
 * - The draft is a recommendation only: no grade, feedback, or status is ever
 *   written to the submission, and students/public participants can never
 *   read it (owner-only PocketBase rules).
 * - Latihan formatif is never evaluated — no final submission, no grade.
 */
import { createHash } from 'crypto';
import { isDeepStrictEqual } from 'node:util';
import { createResearchSnapshot } from '@/lib/evaluation-snapshot.server';
import logger from '@/lib/logger.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { collectModelWithProvenance, imageFilenames, storedFileUrl } from '@/lib/task-assist.server';
import {
	cpmkOfSubCpmk,
	retrieveContextBundle,
	type ContextBundle,
	type ContextCitation,
	type RetrievalScope,
} from '@/lib/context-retrieval.server';
import { activityTypeOf, type Assignment } from '@/lib/assignments';
import { languageLevelGuide } from '@/lib/cefr-level';
import {
	parseListeningConfig,
	parseQuizConfig,
	parseReadingConfig,
	parseSpeakingConfig,
	parseTaskAnswers,
	parseWritingConfig,
	taskKindForShape,
} from '@/lib/task-types';
import type { EvalFinding, EvalRubricRow } from '@/lib/ai-evaluation';
import { parseStructuredFindings } from '@/lib/ai-evaluation';

type SubmissionRow = {
	id: string;
	assignment: string;
	content: string;
	files: string[];
	link: string;
	status: string;
	taskAnswers: unknown;
	created: string;
	updated: string;
	/** Speaking-task Phase 2 — Whisper transcript of the audio evidence. */
	transcript?: string;
	transcriptStatus?: string;
	transcriptFile?: string;
};

type EvalRow = { id: string; status: string; generatedAt?: string | null; generationHistory?: Record<string, unknown>[]; [key: string]: unknown };

const MAX_IMAGES = 5;
const MAX_TEXT_CHARS = 12000;

/**
 * Phase 5 — research provenance version constants. Bump these when the prompt
 * or system prompt materially changes so old drafts stay reproducible against
 * the version that generated them.
 */
export const AI_EVALUATION_PROMPT_VERSION = 'german-gfl-feedback-v2';
export const AI_EVALUATION_SYSTEM_PROMPT_VERSION = 'german-gfl-feedback-v2';
export const RESEARCH_SCHEMA_VERSION = 2;

/** SHA-256 hex hash of a text, for reproducibility without storing the full input. */
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const SYSTEM_PROMPT = [
	'Anda asisten draf evaluasi dosen untuk tulisan Bahasa Jerman sebagai bahasa asing (GFL — German as a Foreign Language).',
	'Anda meninjau tulisan pembelajar Bahasa Jerman. Bedakan kesalahan pembelajar yang NYATA dari variasi gaya yang dapat diterima.',
	'Jangan menandai Bahasa Jerman yang dapat diterima hanya karena rumusan lain lebih disukai atau terdengar lebih alami.',
	'Jangan mengarang kesalahan. Jangan mengarang koreksi. Pertahankan makna yang dimaksud pembelajar.',
	'Jika ragu apakah suatu bentuk adalah kesalahan nyata, HILANGKAN temuan tersebut daripada menebak.',
	'Setiap koreksi harus benar secara tata bahasa dan semantik. Setiap penjelasan harus akurat secara linguistik.',
	'Bekerja HANYA dari teks kiriman peserta, jawaban terstruktur, ketentuan tugas, rubrik dosen, dan bila dikirim, materi konteks yang disetujui dosen.',
	'Bedakan dua tingkat temuan: "minor" untuk kata kurang jelas, redaksi, atau saran peningkatan; "major" untuk kesalahan berarti, ketentuan tugas yang hilang, atau jawaban yang salah.',
	'Setiap temuan wajib memuat "quote" berupa potongan PERSIS dari teks kiriman peserta (substring eksak — salin apa adanya, jangan parafrase) atau string kosong bila temuan bersifat umum untuk seluruh kiriman.',
	'"evidence" hanya menyebut bukti yang benar-benar ada: id bagian materi ([id=...]) atau ketentuan/rubrik tugas; kosongkan bila tidak ada.',
	'Jangan mengarang kriteria, materi, nilai, atau isi yang tidak dikirim.',
	'Draf ini belum disetujui dosen dan bukan nilai resmi. Klasifikasi kategori/subkategori adalah hasil AI, bukan kebenaran ahli.',
	'Tuliskan "note" yang ringkas, spesifik, dan langsung menunjuk masalah sebenarnya (mis. "Subjek jamak tidak cocok dengan kata kerja tunggal" atau "Tanda koma hilang sebelum anak kalimat") bukan "Bisa diperbaiki".',
	'Balas HANYA satu objek JSON valid, tanpa teks lain di luar objek.',
].join(' ');

/** Rubric criteria stored on the assignment (writing / speaking shapes). */
function rubricCriteriaOf(assignment: Assignment): { id: string; label: string; weight: number }[] {
	const kind = taskKindForShape(assignment.shape);
	if (kind === 'writing') {
		return parseWritingConfig(assignment.taskConfig).criteria.map((c) => ({
			id: c.id,
			label: c.label,
			weight: c.weight,
		}));
	}
	if (kind === 'speaking') {
		return parseSpeakingConfig(assignment.taskConfig).criteria.map((c) => ({
			id: c.id,
			label: c.label,
			weight: c.weight,
		}));
	}
	return [];
}

/** Compact, readable rendering of structured answers (kuis / membaca / menyimak). */
function renderStructuredAnswers(assignment: Assignment, taskAnswers: unknown): string {
	const kind = taskKindForShape(assignment.shape);
	if (kind !== 'quiz' && kind !== 'reading' && kind !== 'listening') return '';

	let answers: Record<string, unknown> = {};
	const parsed = parseTaskAnswers(taskAnswers);
	const quizAnswers = parsed?.quiz?.answers;
	if (quizAnswers && typeof quizAnswers === 'object' && !Array.isArray(quizAnswers)) {
		answers = quizAnswers as Record<string, unknown>;
	} else {
		const raw = (taskAnswers as { answers?: unknown } | null)?.answers;
		if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
			answers = raw as Record<string, unknown>;
		}
	}

	const config = assignment.taskConfig;
	const questions =
		kind === 'quiz'
			? parseQuizConfig(config).questions
			: kind === 'reading'
				? parseReadingConfig(config).questions
				: parseListeningConfig(config).questions;

	const lines: string[] = [];
	questions.slice(0, 30).forEach((question, index) => {
		const q = question as { id: string; text: string; options?: unknown };
		if (!q || typeof q.id !== 'string' || typeof q.text !== 'string') return;
		const value = answers[q.id];
		let answerText = '(tidak dijawab)';
		if (typeof value === 'number' && Array.isArray(q.options)) {
			const option = (q.options as unknown[])[value];
			answerText = option == null ? '(tidak dijawab)' : String(option);
		} else if (value != null) {
			answerText = String(value);
		}
		lines.push(`Soal ${index + 1}: ${q.text}\n  Jawaban peserta: ${answerText}`);
	});
	return lines.join('\n');
}

/** Academic scope of one assignment, mirroring the insights/material routes. */
async function scopeOfAssignment(assignment: Assignment): Promise<RetrievalScope> {
	return {
		course: assignment.course,
		session: assignment.session || '',
		subCpmk: assignment.subCpmk || '',
		cpmk: await cpmkOfSubCpmk(assignment.subCpmk || ''),
		assignment: assignment.id,
	};
}

type ValidatedDraft = {
	findings: EvalFinding[];
	recommendedScore: number | null;
	rubricBreakdown: EvalRubricRow[];
	summary: string;
};

const validScore = (value: unknown): number | null =>
	typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
		? Math.round(value)
		: null;

/**
 * Parses and validates the model's JSON against the only ground truth there
 * is: the student's own text and the assignment's stored rubric. Findings
 * whose quote is not an exact substring of the student text are dropped
 * (never kept as a guess); invented rubric criteria are dropped the same way.
 */
function validateDraft(
	raw: string,
	studentText: string,
	criteria: { id?: string; label: string; weight: number }[],
): ValidatedDraft | null {
	const cleaned = raw.replace(/```json|```/g, '').trim();
	const start = cleaned.indexOf('{');
	const end = cleaned.lastIndexOf('}');
	if (start === -1 || end === -1 || end <= start) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(cleaned.slice(start, end + 1));
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
	const row = parsed as Record<string, unknown>;

	// Phase 2 — structured German L2 feedback. Invalid quotes are PRESERVED as
	// invalid-anchor findings (anchorValid: false) rather than silently turned
	// empty or dropped, exact offsets are stored for unambiguous matches, and
	// repeated quotes are marked ambiguous. category/subcategory are sanitized
	// to the controlled taxonomy. The raw model output is preserved separately
	// on the evaluation row for research reproducibility.
	const findings = parseStructuredFindings(row.findings, studentText, criteria);

	let recommendedScore = validScore(row.recommendedScore);
	const rubricBreakdown: EvalRubricRow[] = criteria.length ? validatedRubric(row.rubricBreakdown, criteria) : [];
	// Stored rubric governs the total; missing criteria cannot become zero or a partial total.
	recommendedScore = rubricTotal(rubricBreakdown, criteria);

	const summary = typeof row.summary === 'string' ? row.summary.trim().slice(0, 1500) : '';
	if (findings.length === 0 && !summary && recommendedScore == null) {
		return { findings, recommendedScore: null, rubricBreakdown: [], summary: '' };
	}
	return { findings, recommendedScore, rubricBreakdown, summary };
}

/** The background analysis itself. Every failure becomes a recorded row. */
async function runEvaluation(input: {
	assignment: Assignment;
	channel: 'enrolled' | 'public';
	recordId: string;
	evalId: string;
}): Promise<void> {
	const { assignment, channel, recordId, evalId } = input;
	const collection = channel === 'enrolled' ? 'assignment_submissions' : 'public_submissions';
	const now = () => new Date().toISOString();

	try {
		const submission = await pocketbaseAdmin.getRecord<SubmissionRow>(collection, recordId);
		const kind = taskKindForShape(assignment.shape);
		const isSpeaking = kind === 'speaking';
		// Phase 4 — for speaking tasks the approved Whisper transcript is the
		// evidence text the model reviews and the lecturer annotates. Written
		// content, structured answers, and photos are not the speaking evidence.
		const transcriptText = isSpeaking
			? (submission.transcript || '').slice(0, MAX_TEXT_CHARS)
			: '';
		const studentText = isSpeaking
			? transcriptText
			: (submission.content || '').slice(0, MAX_TEXT_CHARS);
		const images = isSpeaking
			? []
			: imageFilenames(submission.files)
					.slice(0, MAX_IMAGES)
					.map((filename) => storedFileUrl(collection, recordId, filename));
		const structured = isSpeaking ? '' : renderStructuredAnswers(assignment, submission.taskAnswers);

		if (isSpeaking) {
			// No transcript yet (still processing, failed, or never requested):
			// record an explicit insufficient state — never a guess. The
			// lecturer can request the draft again once the transcript is ready.
			if (submission.transcriptStatus !== 'ready' || !transcriptText) {
				await pocketbaseAdmin.updateRecord('ai_evaluations', evalId, {
					status: 'ready',
					result: 'insufficient',
					reason:
						'Transkripsi audio belum siap atau belum tersedia. Draf evaluasi tidak dapat disusun tanpa transkripsi — tunggu hingga transkripsi selesai, lalu minta draf ulang dari panel penilaian.',
					generatedAt: now(),
				});
				return;
			}
		} else if (!studentText && images.length === 0 && !structured && !submission.link) {
			await pocketbaseAdmin.updateRecord('ai_evaluations', evalId, {
				status: 'ready',
				result: 'insufficient',
				reason:
					'Kiriman tidak memuat teks, jawaban terstruktur, gambar, atau tautan yang dapat ditinjau. Tidak ada rekomendasi yang dibuat.',
				generatedAt: now(),
			});
			return;
		}

		// ── Optional grounding: lecturer-approved course material only ──
		let bundle: ContextBundle | null = null;
		try {
			bundle = await retrieveContextBundle({
				feature: 'material',
				scope: await scopeOfAssignment(assignment),
				requester: { id: assignment.owner, role: 'faculty', label: `faculty:${assignment.owner}` },
				ownerLecturerId: assignment.owner,
			});
		} catch (error) {
			logger.error('evaluation context retrieval failed', error);
		}
		const material = bundle && bundle.result === 'sufficient' ? bundle : null;

		const criteria = rubricCriteriaOf(assignment);
		let levelGuide = '';
		try {
			const course = await pocketbaseAdmin.getRecord<{ code?: string }>('courses', assignment.course);
			levelGuide = languageLevelGuide(assignment, course.code || '');
		} catch {
			/* no course code — safe fallback, existing behavior unchanged */
		}
		const materialLines = material
			? material.sources
					.map((source) => {
						const sections = source.sections
							.map(
								(section) =>
									`  - Bagian "${section.label}"${section.pageRef ? ` (hal. ${section.pageRef})` : ''} [id=${section.sectionId}]`,
							)
							.join('\n');
						return [
							`Sumber: "${source.title}" (versi ${source.version}, berkas ${source.filename})`,
							sections || '  (tanpa penanda bagian)',
							`  Kutipan teks:\n"""\n${source.text.slice(0, 1600)}\n"""`,
						].join('\n');
					})
					.join('\n\n')
			: '(Tidak ada materi konteks yang disetujui untuk mata kuliah ini — jangan mengarang materi; "evidence" hanya boleh merujuk ketentuan tugas atau rubrik.)';

		const prompt = [
			'Susun draf evaluasi kiriman tugas formal ini, HANYA berdasarkan data di bawah ini.',
			`Tugas: "${assignment.title}"`,
			`Instruksi dosen: ${assignment.instructions || '(tidak ada instruksi tersimpan)'}`,
			`Ketentuan: ${assignment.requirements || '(tidak ada)'}`,
			assignment.groupInfo ? `Ketentuan kelompok: ${assignment.groupInfo}` : '',
			levelGuide,
			criteria.length > 0
				? `Rubrik dosen (nilai per kriteria 0–100):\n${criteria.map((c) => `- [criterionId=${c.id}] ${c.label}${c.weight ? ` (bobot relatif ${c.weight})` : ''}`).join('\n')}`
				: 'Rubrik dosen: (belum ada kriteria tersimpan — jika memberi rincian, gunakan aspek yang jelas berbasis ketentuan tugas, maksimal 5 aspek)',
			'',
			'MATERI KONTEKS YANG DISETUJUI DOSEN:',
			materialLines,
			'',
			'KIRIMAN PESERTA:',
			isSpeaking
				? `Transkripsi audio peserta (hasil pengenalan otomatis, mungkin memuat kesalahan):\n"""\n${studentText}\n"""`
				: studentText
					? `Teks kiriman:\n"""\n${studentText}\n"""`
					: 'Teks kiriman: (kosong)',
			structured ? `Jawaban terstruktur:\n${structured}` : '',
			submission.link ? `Tautan kiriman: ${submission.link}` : '',
			images.length > 0
				? `Gambar kiriman: ${images.length} gambar terlampir (foto pekerjaan).`
				: '',
			isSpeaking
				? 'Catatan: bukti utama adalah transkripsi audio. Setiap temuan wajib mengutip substring PERSIS dari transkripsi di atas.'
				: '',
			'',
			'Klasifikasi kesalahan GFL (wajib untuk setiap temuan): pilih TEPAT SATU pasangan category/subcategory dari taksonomi berikut, dan hanya dari taksonomi ini:',
			'- Morphology: article, gender, case, adjective_declension, verb_conjugation, tense, modal, pronoun, plural, agreement',
			'- Syntax: word_order, V2, subordinate_clause, verb_final, inversion, clause_structure, agreement',
			'- Lexicon: word_choice, collocation, semantic_choice, false_friend',
			'- Preposition: wrong_preposition, case_government, omission, unnecessary_preposition',
			'- Orthography: spelling, capitalization, umlaut, ß, punctuation',
			'- Discourse: cohesion, coherence, connector, reference, paragraph_structure',
			'- Register/pragmatics: formality, politeness, appropriateness',
			'- Task: missing_information, irrelevant_content, task_misunderstanding, incomplete_response',
			'',
			'Ketentuan temuan:',
			'- Maksimal 12 temuan; setiap temuan wajib memuat "quote" berupa substring PERSIS dari teks kiriman (salin apa adanya), atau string kosong bila temuan bersifat umum.',
			'- "severity" hanya "minor" (perbaikan redaksi / kata kurang jelas / saran peningkatan) atau "major" (kesalahan berarti / ketentuan hilang / jawaban salah).',
			'- "category" dan "subcategory" wajib diisi dengan TEPAT satu pasangan dari taksonomi di atas; gunakan nilai lain hanya jika tidak ada yang cocok (kosongkan keduanya).',
			'- "errorDescription": deskripsi singkat kesalahan dalam Bahasa Indonesia (mis. "Artikel tertentu salah gender").',
			'- "correction": bentuk Jerman yang dikoreksi (teks Jerman, bukan terjemahan); kosongkan bila tidak ada koreksi tunggal yang tepat.',
			'- "explanation": penjelasan linguistik singkat dalam Bahasa Indonesia mengapa ini kesalahan dan mengapa koreksi benar.',
			'- "note" ringkas, spesifik, dan langsung menyebut masalah (mis. subjek-kata kerja tidak cocok, salah tanda baca, kata tidak tepat) — jangan gunakan komentar samar seperti "Bisa diperbaiki"; "evidence" menyebut rujukan bukti bila ada.',
			'- "criterion" berisi label kriteria rubrik yang paling terdampak oleh temuan ini (salin persis salah satu label rubrik di atas), atau string kosong bila temuan bersifat umum untuk seluruh kiriman.',
			'- "confidence" 0.0–1.0: keyakinan AI bahwa ini benar-benar kesalahan pembelajar (bukan variasi gaya).',
			'- Berikan tepat satu rubricBreakdown untuk SETIAP criterionId, salin ID dan label persis. Note wajib menyebut bukti pencapaian dalam kiriman. "recommendedScore" adalah rata-rata tertimbang skor kriteria, bukan perkiraan terpisah; "rubricBreakdown" per kriteria rubrik di atas.',
			'- Jika bukti tidak cukup untuk temuan atau skor yang bertanggung jawab, kembalikan temuan kosong dan "recommendedScore" null.',
			'- Jangan menandai Bahasa Jerman yang dapat diterima sebagai kesalahan hanya karena rumusan lain lebih disukai. Jika ragu, hilangkan temuan.',
			'Summary: jelaskan kekuatan yang terbukti, 1–3 prioritas perbaikan, lalu satu latihan konkret berikutnya. Jangan mengklaim semua teks sudah benar hanya karena tidak ada temuan.',
			'Balas HANYA satu objek JSON dengan bentuk:',
			'{"findings":[{"severity":"minor"|"major","quote":"...","category":"Morphology","subcategory":"article","errorDescription":"...","correction":"...","explanation":"...","note":"...","evidence":"...","criterion":"...","confidence":0.0-1.0}],"recommendedScore":0-100,"rubricBreakdown":[{"criterionId":"...","criterion":"...","score":0-100,"note":"..."}],"summary":"..."}',
		]
			.filter(Boolean)
			.join('\n');

		const researchSnapshot = createResearchSnapshot({
			studentText, structuredAnswers: structured,
			task: { id: assignment.id, title: assignment.title, shape: assignment.shape,
				instructions: assignment.instructions || '', requirements: assignment.requirements || '',
				groupInfo: assignment.groupInfo || '', taskConfig: assignment.taskConfig, levelGuide },
			rubric: criteria, userPrompt: prompt, systemPrompt: SYSTEM_PROMPT, images,
			link: submission.link || '', promptVersion: AI_EVALUATION_PROMPT_VERSION,
			systemPromptVersion: AI_EVALUATION_SYSTEM_PROMPT_VERSION,
			providerConfig: { provider: 'hostinger', model: process.env.HROUTER_MODEL || 'gpt-6-luna', modelVersion: 'unknown' },
			buildId: process.env.APP_BUILD_ID || process.env.BUILD_ID || 'unknown',
		});
		// Persist before provider invocation; failure to persist must prevent an unaudited call.
		await pocketbaseAdmin.updateRecord('ai_evaluations', evalId, { researchSnapshot });
		const persisted = await pocketbaseAdmin.getRecord<EvalRow>('ai_evaluations', evalId);
		if (!isDeepStrictEqual(persisted.researchSnapshot, researchSnapshot)) {
			throw new Error('Generation evidence snapshot persistence verification failed');
		}

		// Phase 5 — research provenance: which input sources this run consumed.
		// Recorded honestly from the actual inputs; never invented.
		const usedStudentText = !!studentText;
		const usedImages = images.length > 0;
		const usedCourseMaterial = !!material;
		const usedRubric = criteria.length > 0;
		const usedCefr = !!levelGuide;
		const inputTextHash = sha256(studentText || '');
		const provenanceBase = {
			model: 'unknown',
			modelVersion: 'unknown',
			promptVersion: AI_EVALUATION_PROMPT_VERSION,
			systemPromptVersion: AI_EVALUATION_SYSTEM_PROMPT_VERSION,
			inputTextHash,
			researchSchemaVersion: RESEARCH_SCHEMA_VERSION,
			usedStudentText,
			usedImages,
			usedCourseMaterial,
			usedRubric,
			usedCefr,
		};

		let raw = '';
		let model = 'unknown';
		let modelVersion = 'unknown';
		let durationMs: number | null = null;
		try {
			const result = await collectModelWithProvenance(prompt, images, SYSTEM_PROMPT);
			raw = result.content;
			model = result.model;
			modelVersion = result.modelVersion;
			durationMs = result.durationMs;
		} catch (error) {
			logger.error('evaluation model failed', error);
			await pocketbaseAdmin.updateRecord('ai_evaluations', evalId, {
				status: 'failed',
				reason:
					'Asisten AI tidak tersedia saat ini. Draf evaluasi tidak dibuat — tidak ada yang dikarang. Penilaian manual di panel Penilaian resmi tetap dapat dilakukan.',
				...provenanceBase,
				outputHash: sha256(''),
				generationDurationMs: durationMs,
				generatedAt: now(),
			});
			return;
		}

		const draft = raw ? validateDraft(raw, studentText, criteria) : null;
		const rawOutput = raw.slice(0, 100000);
		const provenance = {
			...provenanceBase,
			model,
			modelVersion,
			outputHash: sha256(rawOutput),
			generationDurationMs: durationMs,
		};
		if (!draft) {
			await pocketbaseAdmin.updateRecord('ai_evaluations', evalId, {
				status: 'failed',
				rawOutput,
				reason:
					'Asisten AI tidak menghasilkan draf yang dapat dibaca. Draf evaluasi tidak dibuat — tidak ada yang dikarang. Penilaian manual di panel Penilaian resmi tetap dapat dilakukan.',
				...provenance,
				generatedAt: now(),
			});
			return;
		}
		if (draft.findings.length === 0 && !draft.summary && draft.recommendedScore == null) {
			await pocketbaseAdmin.updateRecord('ai_evaluations', evalId, {
				status: 'ready',
				result: 'insufficient',
				rawOutput,
				reason:
					'Bukti pada kiriman belum cukup untuk temuan atau skor yang dapat diverifikasi. Tidak ada rekomendasi yang dibuat.',
				...provenance,
				generatedAt: now(),
			});
			return;
		}

		const citations: ContextCitation[] = material ? material.citations : [];
		await pocketbaseAdmin.updateRecord('ai_evaluations', evalId, {
			status: 'ready',
			result: 'sufficient',
			rawOutput,
			findings: draft.findings,
			recommendedScore: draft.recommendedScore,
			rubricBreakdown: draft.rubricBreakdown,
			summary: draft.summary,
			bundleId: material ? material.bundleId : '',
			citations,
			contextNote: material
				? `Konteks materi disetujui: ${material.sources.length} sumber, ${material.sectionCount} bagian (bundel ${material.bundleId}).`
				: `Tidak ada materi konteks yang disetujui untuk mata kuliah ini — temuan hanya berbasis ketentuan tugas dan rubrik. ${bundle?.reason || ''}`.slice(
						0,
						500,
					),
			...provenance,
			generatedAt: now(),
		});
	} catch (error) {
		logger.error('evaluation generation failed', error);
		try {
			await pocketbaseAdmin.updateRecord('ai_evaluations', evalId, {
				status: 'failed',
				reason:
					'Draf evaluasi gagal disusun. Penilaian manual di panel Penilaian resmi tetap dapat dilakukan.',
				generatedAt: new Date().toISOString(),
			});
		} catch {
			/* the draft row is already in its safest state — nothing more to do */
		}
	}
}

/**
 * Prepares (idempotently) and kicks off a background AI evaluation draft for
 * one formal submission. Fast and never throws: the analysis itself runs in
 * the background, so the calling submission flow is never blocked or broken.
 */
// Serializes queue decisions in this server process; PocketBase pending rows guard later requests.
// Multi-instance deployments require a database-backed compare-and-set/lease.
const queueLocks = new Set<string>();
export async function queueEvaluationDraft(input: {
	assignment: Assignment;
	submissionId?: string;
	publicSubmissionId?: string;
    force?: boolean;
}): Promise<{ queued: boolean; status: string; reason?: string }> {
	const key = input.submissionId ? `enrolled:${input.submissionId}` : `public:${input.publicSubmissionId || ''}`;
	if (queueLocks.has(key)) return { queued: false, status: 'pending', reason: 'Draf evaluasi sedang disiapkan.' };
	queueLocks.add(key);
	try { return await prepareEvaluationDraft(input); }
	finally { queueLocks.delete(key); }
}

async function prepareEvaluationDraft(input: {
	assignment: Assignment;
	submissionId?: string;
	publicSubmissionId?: string;
    force?: boolean;
}): Promise<{ queued: boolean; status: string; reason?: string }> {
	try {
		// Latihan formatif has no official evaluation — never analyzed.
		if (activityTypeOf(input.assignment) === 'formative') {
			return { queued: false, status: 'skipped', reason: 'Latihan formatif tidak dinilai.' };
		}
		const channel: 'enrolled' | 'public' | null = input.submissionId
			? 'enrolled'
			: input.publicSubmissionId
				? 'public'
				: null;
		if (!channel) return { queued: false, status: 'skipped', reason: 'Kiriman tidak dikenal.' };

		const collection = channel === 'enrolled' ? 'assignment_submissions' : 'public_submissions';
		const recordId = channel === 'enrolled' ? input.submissionId : input.publicSubmissionId;
		if (!recordId) return { queued: false, status: 'skipped', reason: 'Kiriman tidak dikenal.' };

		let submission: SubmissionRow;
		try {
			submission = await pocketbaseAdmin.getRecord<SubmissionRow>(collection, recordId);
		} catch {
			return { queued: false, status: 'skipped', reason: 'Kiriman tidak ditemukan.' };
		}
		if (submission.assignment !== input.assignment.id) {
			return { queued: false, status: 'skipped', reason: 'Kiriman tidak cocok dengan tugas.' };
		}
		// Drafts are prepared for final submissions only (submitted / late).
		if (submission.status !== 'submitted' && submission.status !== 'late' && !(input.force && submission.status === 'graded')) {
			return {
				queued: false,
				status: 'skipped',
				reason: 'Draf evaluasi hanya disiapkan untuk pengumpulan final.',
			};
		}

		const relationField = channel === 'enrolled' ? 'submission' : 'publicSubmission';
		const existing = (
			await pocketbaseAdmin.listRecords<EvalRow>('ai_evaluations', {
				perPage: 1,
				filter: `${relationField}="${recordId}"`,
				sort: '-created',
			})
		).items[0];

		if (existing) {
			if (existing.status === 'pending') {
				return { queued: false, status: 'pending', reason: 'Draf evaluasi sedang disiapkan.' };
			}
			const generatedAt = existing.generatedAt ? Date.parse(existing.generatedAt) : NaN;
			const submittedAt = Date.parse(submission.updated || submission.created);
			if (
				!input.force && existing.status === 'ready' &&
				Number.isFinite(generatedAt) &&
				Number.isFinite(submittedAt) &&
				generatedAt >= submittedAt
			) {
				return { queued: false, status: 'ready', reason: 'Draf evaluasi sudah tersedia.' };
			}
		}

		// The archive and reset are one record update: never overwrite without preserving.
		const generationHistory = Array.isArray(existing?.generationHistory) ? [...existing.generationHistory] : [];
		if (existing) {
			const { generationHistory: _history, expand: _expand, ...previous } = existing;
			generationHistory.push({ ...previous, archivedAt: new Date().toISOString() });
		}
		const payload = {
			generationHistory, researchSnapshot: null,
			result: '', reason: '', rawOutput: '', findings: [], recommendedScore: null,
			rubricBreakdown: [], summary: '', bundleId: '', citations: [], contextNote: '', generatedAt: '',
			...(input.force && existing ? {} : { reviewFindings: [], reviewCriterionScores: {}, reviewedAt: '', rubricScores: null, finalScore: null, scoreAdjusted: false, publishedAt: '' }),
			model: 'unknown', modelVersion: 'unknown', promptVersion: '', systemPromptVersion: '',
			inputTextHash: '', outputHash: '', generationDurationMs: null, researchSchemaVersion: null,
			usedStudentText: false, usedImages: false, usedCourseMaterial: false, usedRubric: false, usedCefr: false,
			assignment: input.assignment.id,
			owner: input.assignment.owner,
			status: 'pending',
			...(channel === 'enrolled'
				? { submission: recordId, publicSubmission: '' }
				: { submission: '', publicSubmission: recordId }),
		};
		const row = existing
			? await pocketbaseAdmin.updateRecord<EvalRow>('ai_evaluations', existing.id, payload)
			: await pocketbaseAdmin.createRecord<EvalRow>('ai_evaluations', payload);

		void runEvaluation({ assignment: input.assignment, channel, recordId, evalId: row.id });
		return { queued: true, status: 'pending' };
	} catch (error) {
		logger.error('evaluation queue failed', error);
		return { queued: false, status: 'error', reason: 'Draf evaluasi gagal dijadwalkan.' };
	}
}
