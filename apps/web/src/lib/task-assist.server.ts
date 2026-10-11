/**
 * Server-side AI assistance for graded student work (Menulis and other
 * specialized tasks). The model may ONLY work from the actual student
 * submission (text + image URLs) and the lecturer's stored rubric — nothing is
 * invented, and every suggestion is returned for lecturer confirmation before
 * anything is saved.
 */
import logger from '@/lib/logger.server';
import { collectHostingerText } from '@/lib/hostinger-model.server';

const requireEnv = (name: string) => {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
};

/** Public origin for stored files: PocketBase is only reachable through the site's proxy. */
const filesOrigin = () => `https://${requireEnv('WEBSITE_DOMAIN')}/hcgi/platform`;

export type AssistKind = 'feedback' | 'summary' | 'transcription';

/**
 * Model metadata captured from the provider's own response. `model` is the
 * identifier the provider reported it actually used (e.g. `gpt-6-luna`);
 * `modelVersion` is the provider's own revision reference — for Hostinger AI Router the
 * model identifier is that reference, so a real run never records `unknown`
 * here. Only a provider that reports no identifier at all yields `unknown`,
 * and never an invented value. `durationMs` is the wall-clock generation time.
 */
export type ModelProvenance = {
	content: string;
	model: string;
	modelVersion: string;
	provider?: 'hostinger';
	durationMs: number | null;
};

export const ASSIST_KIND_LABEL: Record<AssistKind, string> = {
	feedback: 'Saran umpan balik',
	summary: 'Ringkasan',
	transcription: 'Transkripsi',
};

const MAX_IMAGES = 5;

/**
 * Ask the platform model. `images` are public same-site file URLs the model
 * service can fetch (submission photos). Returns plain text. An optional
 * `systemPrompt` overrides the default grading persona (used by the staged
 * feedback workflow).
 *
 * This wraps `collectModelWithProvenance` and returns only the content, so the
 * many existing callers are unchanged. Callers that need research provenance
 * (model id/version, duration) use `collectModelWithProvenance` directly.
 */
export async function collectModel(
	prompt: string,
	images: string[],
	systemPrompt?: string,
): Promise<string> {
	return (await collectModelWithProvenance(prompt, images, systemPrompt)).content;
}

/**
 * Same as `collectModel` but also returns research provenance: the model
 * identifier and version actually used (or "unknown" when the platform API
 * does not expose them — never invented), and the wall-clock generation
 * duration in milliseconds. Used by the formal-evaluation pipeline to record
 * reproducibility metadata.
 */
export async function collectModelWithProvenance(
	prompt: string,
	images: string[],
	systemPrompt?: string,
): Promise<ModelProvenance> {
	const startedAt = Date.now();
	const result = await collectHostingerText({
		prompt,
		images: images.slice(0, MAX_IMAGES),
		systemPrompt:
			systemPrompt ||
			'Anda asisten penilaian dosen dalam Bahasa Indonesia. Bekerja HANYA dari materi yang benar-benar dikirim: teks dan gambar kiriman mahasiswa serta rubrik dosen. Jangan mengarang nilai, kriteria, fakta, atau isi yang tidak ada. Jangan mengarang angka nilai. Balas teks ringkas dan siap tinjau dosen.',
	});
	return {
		content: result.content.trim(),
		model: result.model,
		// Hostinger AI Router reports the model identifier it actually used (e.g.
		// `gpt-6-luna`); that identifier IS the provider's revision
		// reference. Recording 'unknown' here would discard real
		// provenance the provider handed us.
		modelVersion: result.model,
		durationMs: Date.now() - startedAt,
	};
}

export type AssistInput = {
	kind: AssistKind;
	/** The student's actual written text (may be empty for photo-only work). */
	studentText: string;
	/** Public URLs of the student's uploaded images (handwritten work photos). */
	imageUrls: string[];
	/** The lecturer's stored rubric criteria (label + relative weight). */
	criteria: { label: string; weight: number }[];
	/** The assignment's own prompt / requirements, for context. */
	assignmentPrompt: string;
	requirements: string;
};

/** Build the grounded prompt, call the model, and return a reviewable suggestion. */
export async function buildTaskAssist(input: AssistInput): Promise<{ suggestion: string }> {
	const criteriaLines = input.criteria
		.map((c) => `- ${c.label}${c.weight ? ` (bobot relatif ${c.weight})` : ''}`)
		.join('\n');
	const imageNote =
		input.imageUrls.length > 0
			? `Kiriman mahasiswa memuat ${input.imageUrls.length} gambar (terlampir).`
			: 'Kiriman mahasiswa tidak memuat gambar.';

	const prompts: Record<AssistKind, string> = {
		feedback: [
			'Susun draf umpan balik untuk kiriman mahasiswa ini. Gunakan HANYA teks/gambar kiriman dan rubrik di bawah.',
			'Sertakan kekuatan, kekurangan, dan saran perbaikan per kriteria rubrik. Jangan memberi angka nilai.',
			'Format: poin-poin ringkas per kriteria, maksimal 250 kata, siap disunting dosen.',
		].join(' '),
		summary: [
			'Ringkas kiriman mahasiswa ini dalam 3–5 poin. Gunakan HANYA isi kiriman; jika teks kosong dan tidak ada gambar, nyatakan itu saja.',
			'Jangan menilai, hanya meringkas.',
		].join(' '),
		transcription: [
			'Transkripsikan tulisan mahasiswa dari gambar terlampir seakurat mungkin, pertahankan bahasa aslinya.',
			'Bagian yang tidak terbaca tulis sebagai [tidak terbaca]. Jika tidak ada gambar, nyatakan bahwa tidak ada gambar untuk ditranskripsi.',
		].join(' '),
	};

	const prompt = [
		prompts[input.kind],
		`Tugas dosen: ${input.assignmentPrompt || '(tidak ada prompt tersimpan)'}`,
		`Ketentuan: ${input.requirements || '(tidak ada)'}`,
		`Rubrik dosen:\n${criteriaLines || '(belum ada kriteria rubrik)'}`,
		imageNote,
		input.studentText
			? `Teks kiriman mahasiswa:\n"""\n${input.studentText.slice(0, 12000)}\n"""`
			: 'Teks kiriman mahasiswa: (kosong)',
	].join('\n\n');

	try {
		const suggestion = await collectModel(prompt, input.imageUrls);
		if (!suggestion) {
			return {
				suggestion:
					'Asisten AI tidak menghasilkan saran. Tulis umpan balik manual — tidak ada saran yang diarang.',
			};
		}
		return { suggestion: suggestion.slice(0, 6000) };
	} catch (error) {
		logger.error('task assist model failed', error);
		return {
			suggestion:
				'Asisten AI tidak tersedia saat ini. Tulis umpan balik manual — tidak ada saran yang diarang.',
		};
	}
}

/** Public URL for one uploaded submission image (same-site files origin). */
export function submissionImageUrl(submissionId: string, filename: string) {
	return `${filesOrigin()}/api/files/assignment_submissions/${submissionId}/${encodeURIComponent(filename)}`;
}

/** Public URL for one stored file the model service can fetch (OCR / visual read). */
export function storedFileUrl(collection: string, recordId: string, filename: string) {
	return `${filesOrigin()}/api/files/${collection}/${recordId}/${encodeURIComponent(filename)}`;
}

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/** Filenames in a submission that look like images. */
export function imageFilenames(files: string[] | undefined | null): string[] {
	return (files || []).filter((f) => IMAGE_EXT.test(f));
}
