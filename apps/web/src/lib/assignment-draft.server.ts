/**
 * Builds a reviewable assignment draft from stored course rows.
 * The model may only rephrase text that already exists in the context pack.
 * Relation ids, weights, and dates are applied here — never taken on trust
 * from the model.
 */
import logger from '@/lib/logger.server';
import { collectHostingerText } from '@/lib/hostinger-model.server';
import {
	SHAPE_OPTIONS,
	STAGE_PRESETS,
	defaultStagesForShape,
	type AssignmentMode,
	type AssignmentShape,
	type AssignmentStage,
} from '@/lib/assignments';
import type { Assessment, ClassSession, Course, Cpmk, StructuredItem, SubCpmk } from '@/lib/learning';

export type DraftResource = { id: string; title: string };

export type AssignmentDraftContext = {
	course: Course;
	sessions: ClassSession[];
	subCpmks: SubCpmk[];
	cpmks: Cpmk[];
	cpls: StructuredItem[];
	assessments: Assessment[];
	resources: DraftResource[];
	sessionId: string;
	subCpmkId: string;
	shape: AssignmentShape;
	instruction: string;
	sourceText: string;
};

export type AssignmentDraftResult = {
	title: string;
	mode: AssignmentMode;
	instructions: string;
	requirements: string;
	groupInfo: string;
	deadline: string;
	stages: AssignmentStage[];
	sessionId: string;
	subCpmkId: string;
	attachmentIds: string[];
	reviewNotes: string[];
	source: 'ai' | 'data';
};

const requireEnv = (name: string) => {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
};

function clip(value: string | undefined | null, max: number) {
	const text = (value || '').replace(/\s+/g, ' ').trim();
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

export async function collectModel(prompt: string): Promise<string> {
	return (await collectHostingerText({
		prompt,
		systemPrompt:
			'Anda menyusun draf tugas kuliah dalam Bahasa Indonesia. Balas HANYA JSON valid tanpa markdown. Jangan mengarang CPL, CPMK, Sub-CPMK, bobot, tanggal, sumber, atau fakta yang tidak ada di konteks. Anda hanya boleh merangkai ulang teks yang sudah diberikan. Jika data tidak ada, kosongkan field dan tulis catatan di reviewNotes.',
		timeoutMs: 45_000,
	})).content;
}

type ModelDraft = {
	title?: string;
	mode?: string;
	instructions?: string;
	requirements?: string;
	groupInfo?: string;
	reviewNotes?: string[];
};

function parseModel(raw: string): ModelDraft | null {
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start < 0 || end <= start) return null;
	try {
		return JSON.parse(raw.slice(start, end + 1)) as ModelDraft;
	} catch {
		return null;
	}
}

function packLines(label: string, value: string | number | null | undefined) {
	const text = value == null ? '' : String(value).trim();
	return text ? `${label}: ${clip(text, 500)}` : '';
}

export async function buildAssignmentDraft(ctx: AssignmentDraftContext): Promise<AssignmentDraftResult> {
	const notes: string[] = [];
	const session = ctx.sessionId ? ctx.sessions.find((s) => s.id === ctx.sessionId) : undefined;
	const sub = ctx.subCpmkId ? ctx.subCpmks.find((s) => s.id === ctx.subCpmkId) : undefined;
	if (ctx.sessionId && !session) notes.push('Pertemuan yang dipilih tidak ada di mata kuliah ini — tautan dikosongkan.');
	if (ctx.subCpmkId && !sub) notes.push('Sub-CPMK yang dipilih tidak ada di mata kuliah ini — tautan dikosongkan.');

	const cpmk = sub?.cpmk ? ctx.cpmks.find((c) => c.id === sub.cpmk) : undefined;
	const cpl = cpmk?.cpl ? ctx.cpls.find((c) => c.id === cpmk.cpl) : undefined;

	const factLines = [
		packLines('Mata kuliah', ctx.course.title),
		packLines('Kode', ctx.course.code),
		session ? packLines('Pertemuan', `Minggu ${session.week || '—'} — ${session.title}`) : 'Pertemuan: tidak dipilih',
		session ? packLines('Topik pertemuan', session.topic) : '',
		session ? packLines('Indikator', session.learningIndicator) : '',
		session ? packLines('Materi', session.learningMaterial) : '',
		session ? packLines('Metode penilaian sesi', session.assessmentMethod) : '',
		session && session.assessmentWeight != null ? packLines('Bobot sesi (data RPS, jangan diubah)', session.assessmentWeight) : '',
		session ? packLines('Metode sinkron', session.synchronousMethod) : '',
		session ? packLines('Metode asinkron', session.asynchronousMethod) : '',
		session ? packLines('Durasi', session.duration) : '',
		session ? packLines('Referensi pertemuan', session.references) : '',
		sub ? packLines('Sub-CPMK', `${sub.code || ''} ${sub.description}`.trim()) : 'Sub-CPMK: tidak dipilih',
		cpmk ? packLines('CPMK terkait', `${cpmk.code || ''} ${cpmk.description}`.trim()) : '',
		cpl ? packLines('CPL terkait', `${cpl.code || ''} ${cpl.description}`.trim()) : '',
		ctx.assessments.length
			? `Komponen penilaian yang ada: ${ctx.assessments
					.map((a) => `${a.code || a.description}${a.weight != null ? ` (${a.weight})` : ''}`)
					.join('; ')}`
			: 'Komponen penilaian: tidak ada',
		ctx.resources.length
			? `Sumber daya yang ada: ${ctx.resources.map((r) => r.title).join('; ')}`
			: 'Sumber daya: tidak ada',
	].filter(Boolean);

	const shapeDef = SHAPE_OPTIONS.find((s) => s.value === ctx.shape);
	const mode: AssignmentMode = /kelompok|kolaboratif/i.test(ctx.instruction)
		? 'collaborative'
		: 'individual';
	if (/kelompok|kolaboratif/i.test(ctx.instruction)) {
		notes.push('Jenis diatur ke kolaboratif karena arahan dosen menyebut kelompok. Ubah jika tidak sesuai.');
	} else {
		notes.push(
			'Format kerja tetap Individu. Jenis tugas dan format kerja dipilih terpisah — ubah manual bila perlu.',
		);
	}

	const deadline = session?.accessDateTime || session?.date || '';
	if (deadline) {
		notes.push('Batas waktu diisi dari tanggal akses/tanggal pertemuan yang tersimpan — tinjau sebelum menerbitkan.');
	} else {
		notes.push('Tidak ada tanggal pertemuan tersimpan. Batas waktu dikosongkan, tidak ditebak.');
	}

	const shapeStages = defaultStagesForShape(ctx.shape);
	const stages = shapeStages.length > 0 ? shapeStages : STAGE_PRESETS[mode].map((label) => ({ label }));
	notes.push(
		`Tahapan memakai pola bawaan bentuk ${shapeDef?.label ?? 'tugas'}. Tidak ada tahapan baru yang dikarang dari data.`,
	);

	const attachmentIds: string[] = [];
	notes.push(
		ctx.resources.length
			? 'Lampiran tidak dipilih otomatis — centang sumber daya yang memang untuk tugas ini.'
			: 'Belum ada sumber daya mata kuliah untuk dilampirkan.',
	);
	if (!session) notes.push('Pertemuan belum dipilih. Draf tidak memuat indikator atau materi mingguan.');
	if (!sub) notes.push('Sub-CPMK belum dipilih. Pemetaan capaian tidak diisi.');
	if (session && !session.learningIndicator && !session.learningMaterial) {
		notes.push('Pertemuan ini belum punya indikator atau materi. Instruksi tidak dilengkapi dengan fakta yang tidak ada.');
	}

	const grounded = factLines.join('\n');
	let title = session ? `Tugas — ${session.title}`.slice(0, 200) : '';
	let instructions = grounded;
	let requirements = [
		session?.assessmentMethod ? `Aspek penilaian menurut RPS: ${session.assessmentMethod}` : '',
		session?.assessmentWeight != null ? `Bobot sesi menurut RPS: ${session.assessmentWeight}` : '',
	]
		.filter(Boolean)
		.join('\n');
	let groupInfo = '';
	let source: AssignmentDraftResult['source'] = 'data';

	const prompt = [
		'Susun draf tugas HANYA dari fakta berikut. Jangan menambah sumber, bobot, tanggal, atau capaian.',
		`Bentuk tugas: ${shapeDef?.label ?? ctx.shape}${shapeDef ? ` — ${shapeDef.description}` : ''}. Tahapan bawaan: ${(shapeDef?.stages ?? []).join(' → ')}.`,
		ctx.instruction ? `Arahan dosen (boleh membentuk penekanan, bukan fakta baru): ${clip(ctx.instruction, 800)}` : 'Arahan dosen: tidak ada.',
		ctx.sourceText ? `Teks sumber dosen:\n${clip(ctx.sourceText, 6000)}` : 'Teks sumber: tidak ada.',
		'Fakta tersimpan:',
		grounded,
		'Balas JSON: {"title":"","mode":"individual|collaborative","instructions":"","requirements":"","groupInfo":"","reviewNotes":[]}',
		'instructions dan requirements hanya merangkai fakta di atas. reviewNotes menyebut apa yang tidak ada.',
	].join('\n\n');

	try {
		const raw = await collectModel(prompt);
		const parsed = parseModel(raw);
		if (!parsed) {
			notes.push('Model tidak mengembalikan draf yang bisa dibaca. Isian di bawah disalin dari data tersimpan.');
		} else {
			source = 'ai';
			if (parsed.title?.trim()) title = parsed.title.trim().slice(0, 200);
			if (parsed.instructions?.trim()) instructions = parsed.instructions.trim().slice(0, 10000);
			if (parsed.requirements?.trim()) requirements = parsed.requirements.trim().slice(0, 5000);
			if (parsed.groupInfo?.trim() && mode === 'collaborative') groupInfo = parsed.groupInfo.trim().slice(0, 2000);
			if (Array.isArray(parsed.reviewNotes)) {
				for (const note of parsed.reviewNotes) {
					if (typeof note === 'string' && note.trim()) notes.push(note.trim().slice(0, 240));
				}
			}
			notes.push('Teks AI hanya merangkai data tersimpan. Tinjau sebelum menyimpan. Status tetap draf.');
		}
	} catch (error) {
		logger.error('assignment draft model failed', error);
		notes.push('Asisten AI tidak tersedia saat ini. Draf diisi dari data pertemuan yang ada, tanpa teks tambahan.');
	}

	if (!title) {
		notes.push('Judul tidak dapat diturunkan — pertemuan belum dipilih. Isi judul manual.');
	}

	return {
		title,
		mode,
		instructions,
		requirements,
		groupInfo,
		deadline,
		stages,
		sessionId: session?.id || '',
		subCpmkId: sub?.id || '',
		attachmentIds,
		reviewNotes: notes.slice(0, 12),
		source,
	};
}
