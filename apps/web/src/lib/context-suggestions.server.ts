/**
 * Phase 7 — AI-generated academic-context suggestions for one library file.
 *
 * The model works ONLY from the file's extracted text plus the lecturer's own
 * authorized academic records (courses, sessions, CPMK, Sub-CPMK). It returns
 * structured suggestions (language, topics, content sections, and optional
 * course/session links) referencing codes/weeks — never record ids. The server
 * resolves those references to real record ids and drops anything that does
 * not match an authorized record, so the model can never invent a link.
 *
 * Every suggestion is stored as `pending` in `context_suggestions`. Nothing is
 * applied to the confirmed context stores until the lecturer explicitly
 * approves it — approval is a separate, client-driven step that writes to
 * `context_sections` / `file_contexts` / `file_library`, which are the stores
 * downstream AI grounding already reads.
 */
import { randomUUID } from 'node:crypto';
import { collectModel } from '@/lib/task-assist.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import type {
	ContextSuggestionKind,
	ContextSuggestionRecord,
	Course,
	ClassSession,
	Cpmk,
	FileExtractionRecord,
	FileLibraryRecord,
	SubCpmk,
} from '@/lib/learning';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

/** Cap on extracted text sent to the model — enough signal, bounded cost. */
const MAX_TEXT_CHARS = 12000;
/** Hard cap on suggestions stored from one generation run. */
const MAX_SUGGESTIONS = 20;

export type GenerateInput = {
	fileId: string;
	ownerId: string;
};

export type SuggestionDraft = {
	kind: ContextSuggestionKind;
	label: string;
	pageRef: string;
	note: string;
	cpmk: string;
	subCpmk: string;
	session: string;
	course: string;
};

export type GenerateResult = {
	ok: boolean;
	bundleId: string;
	suggestions: ContextSuggestionRecord[];
	reason: string;
};

/** Raw shape the model is asked to return. Codes/weeks only — never ids. */
type RawSuggestion = {
	kind?: string;
	label?: string;
	pageRef?: string;
	note?: string;
	cpmkCode?: string;
	subCpmkCode?: string;
	sessionWeek?: number | string;
};

type RawPayload = {
	language?: string;
	topics?: string[];
	sections?: RawSuggestion[];
	courseCode?: string;
	sessionWeek?: number | string;
};

const normalizeCode = (value: unknown): string =>
	String(value ?? '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');

const resolveCpmk = (code: unknown, cpmks: Cpmk[]): string => {
	const needle = normalizeCode(code);
	if (!needle) return '';
	const match = cpmks.find((c) => normalizeCode(c.code) === needle);
	return match?.id ?? '';
};

const resolveSubCpmk = (code: unknown, subCpmks: SubCpmk[]): string => {
	const needle = normalizeCode(code);
	if (!needle) return '';
	const match = subCpmks.find((c) => normalizeCode(c.code) === needle);
	return match?.id ?? '';
};

const resolveSession = (week: unknown, sessions: ClassSession[]): string => {
	const num = Number(week);
	if (!Number.isFinite(num) || num < 1) return '';
	const match = sessions.find((s) => s.week === num);
	return match?.id ?? '';
};

const resolveCourse = (code: unknown, courses: Course[]): string => {
	const needle = normalizeCode(code);
	if (needle.length < 4) return '';
	const matches = courses.filter((c) => normalizeCode(c.code) === needle);
	return matches.length === 1 ? matches[0].id : '';
};

const cleanLabel = (value: unknown, max: number): string =>
	String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, max);

/**
 * Generates AI suggestions for one library file, stores them as pending, and
 * returns them. Prior pending suggestions for the file are removed first so the
 * review queue always reflects the latest generation. Never throws on a model
 * failure — returns an empty result with an Indonesian reason instead.
 */
export async function generateSuggestions(input: GenerateInput): Promise<GenerateResult> {
	const { fileId, ownerId } = input;
	if (!SAFE_ID.test(fileId)) {
		return { ok: false, bundleId: '', suggestions: [], reason: 'fileId tidak valid.' };
	}

	let file: FileLibraryRecord;
	try {
		file = await pocketbaseAdmin.getRecord<FileLibraryRecord>('file_library', fileId);
	} catch {
		return { ok: false, bundleId: '', suggestions: [], reason: 'Berkas tidak ditemukan.' };
	}
	if (file.owner !== ownerId) {
		return { ok: false, bundleId: '', suggestions: [], reason: 'Hanya pemilik berkas yang dapat membuat saran.' };
	}

	const extraction = await pocketbaseAdmin
		.listRecords<FileExtractionRecord>('file_extractions', {
			filter: `file = "${fileId}"`,
			perPage: 1,
		})
		.then((r) => r.items[0] ?? null);

	const text = (extraction?.extractedText || '').trim();
	if (!text) {
		return {
			ok: false,
			bundleId: '',
			suggestions: [],
			reason:
				extraction?.status === 'failed'
					? 'Teks otomatis tidak dapat diurai dari berkas ini, jadi tidak ada saran yang dapat dibuat. Anda tetap dapat menandai bagian konten secara manual.'
					: 'Berkas belum diproses — proses dokumen terlebih dahulu agar saran konteks dapat dibuat dari teks hasil penguraian.',
		};
	}

	// Lecturer's authorized academic records, scoped to the file's course when
	// one is linked. These are the ONLY records the model may reference.
	const courseId = file.course || '';
	const [courses, sessions, cpmks, subCpmks] = await Promise.all([
		pocketbaseAdmin
			.listRecords<Course>('courses', { filter: `owner = "${ownerId}"`, perPage: 200, sort: 'title' })
			.then((r) => r.items),
		courseId
			? pocketbaseAdmin
					.listRecords<ClassSession>('class_sessions', {
						filter: `course = "${courseId}"`,
						perPage: 200,
						sort: 'week',
					})
					.then((r) => r.items)
			: Promise.resolve([] as ClassSession[]),
		courseId
			? pocketbaseAdmin
					.listRecords<Cpmk>('cpmk', { filter: `course = "${courseId}"`, perPage: 200, sort: 'order' })
					.then((r) => r.items)
			: Promise.resolve([] as Cpmk[]),
		courseId
			? pocketbaseAdmin
					.listRecords<SubCpmk>('sub_cpmk', { filter: `course = "${courseId}"`, perPage: 200, sort: 'order' })
					.then((r) => r.items)
			: Promise.resolve([] as SubCpmk[]),
	]);

	const course = courses.find((c) => c.id === courseId) || null;

	const courseCatalog = courses
		.map((c) => `- kode ${c.code || '(tanpa kode)'}: ${c.title}`)
		.join('\n');
	const sessionCatalog = sessions
		.map((s) => `- Minggu ${s.week}: ${s.title}${s.topic ? ` — ${s.topic}` : ''}`)
		.join('\n');
	const cpmkCatalog = cpmks.map((c) => `- ${c.code || '(tanpa kode)'}: ${c.description}`).join('\n');
	const subCpmkCatalog = subCpmks.map((c) => `- ${c.code || '(tanpa kode)'}: ${c.description}`).join('\n');

	const prompt = [
		'Anda asisten dosen di LARAS. Tugas Anda membaca teks hasil penguraian sebuah berkas perkuliahan dan mengusulkan tag konteks akademik yang RELEVAN, HANYA berdasarkan teks tersebut.',
		'Balas HANYA berupa JSON valid (tanpa penjelasan, tanpa markdown) dengan bentuk:',
		'{"language":"de|id|en","topics":["..."],"sections":[{"kind":"section","label":"...","pageRef":"...","note":"...","cpmkCode":"...","subCpmkCode":"...","sessionWeek":3}],"courseCode":"...","sessionWeek":3}',
		'Aturan ketat:',
		'- Hanya usulkan bahasa bila teks jelas menunjukkannya; jika ragu, kirim string kosong.',
		'- topics: 3–8 frasa topik utama yang benar-benar muncul dalam teks. Jangan mengarang topik.',
		'- sections: bagian konten yang berguna untuk konteks AI (maks 6). label singkat, pageRef hanya jika teks menyiratkan halaman/bab, note berisi alasan singkat berbasis teks.',
		'- cpmkCode/subCpmkCode/sessionWeek: HANYA isi dengan kode/minggu yang persis ada di daftar di bawah. Jika tidak ada yang cocok, kirim string kosong / 0. Jangan mengarang kode.',
		'- courseCode: hanya jika teks menyebut kode mata kuliah yang persis ada di daftar. Jangan tebak.',
		'- sessionWeek (luar): hanya jika seluruh berkas jelas membahas satu pertemuan tertentu.',
		'- Jika teks terlalu sedikit atau tidak cukup bukti, kirim objek dengan array kosong.',
		`Mata kuliah dosen (kode): ${course ? `berkas ini ditautkan ke ${course.code || '(tanpa kode)'} — ${course.title}. ` : ''}Daftar: ${courseCatalog || '(belum ada mata kuliah)'}`,
		`Sesi pada mata kuliah ini: ${sessionCatalog || '(belum ada sesi)'}`,
		`CPMK: ${cpmkCatalog || '(belum ada CPMK)'}`,
		`Sub-CPMK: ${subCpmkCatalog || '(belum ada Sub-CPMK)'}`,
		`Bahasa terdeteksi otomatis: ${extraction?.language || '(tidak terdeteksi)'}`,
		`Teks hasil penguraian:\n"""\n${text.slice(0, MAX_TEXT_CHARS)}\n"""`,
	].join('\n\n');

	const bundleId = `sug-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
	const version = file.version || 1;

	let raw: RawPayload | null = null;
	try {
		const modelOutput = await collectModel(prompt, []);
		raw = parseModelJson(modelOutput);
	} catch {
		// Fall through to an empty result below.
	}

	if (!raw) {
		return {
			ok: false,
			bundleId: '',
			suggestions: [],
			reason:
				'Asisten AI tidak dapat membuat saran saat ini. Anda tetap dapat menandai bagian konten secara manual — tidak ada yang ditulis otomatis.',
		};
	}

	const drafts: SuggestionDraft[] = [];

	// Language suggestion.
	const lang = String(raw.language || '').trim().toLowerCase();
	if (lang === 'de' || lang === 'id' || lang === 'en') {
		drafts.push({
			kind: 'language',
			label: lang,
			pageRef: '',
			note: 'Bahasa utama teks terdeteksi dari isi berkas.',
			cpmk: '',
			subCpmk: '',
			session: '',
			course: '',
		});
	}

	// Topics suggestion (one row holding the joined list).
	if (Array.isArray(raw.topics)) {
		const topics = raw.topics
			.map((t) => cleanLabel(t, 120))
			.filter(Boolean)
			.slice(0, 8);
		if (topics.length > 0) {
			drafts.push({
				kind: 'topics',
				label: topics.join('\n'),
				pageRef: '',
				note: 'Topik utama yang muncul dalam teks hasil penguraian.',
				cpmk: '',
				subCpmk: '',
				session: '',
				course: '',
			});
		}
	}

	// Section suggestions with resolved links.
	if (Array.isArray(raw.sections)) {
		for (const item of raw.sections) {
			const label = cleanLabel(item.label, 200);
			if (!label) continue;
			const cpmkId = resolveCpmk(item.cpmkCode, cpmks);
			const subCpmkId = resolveSubCpmk(item.subCpmkCode, subCpmks);
			const sessionId = resolveSession(item.sessionWeek, sessions);
			drafts.push({
				kind: 'section',
				label,
				pageRef: cleanLabel(item.pageRef, 100),
				note: cleanLabel(item.note, 1000),
				cpmk: cpmkId,
				subCpmk: subCpmkId,
				session: sessionId,
				course: '',
			});
		}
	}

	// Optional course link suggestion (only when a unique course matches and
	// differs from the current link).
	const suggestedCourseId = resolveCourse(raw.courseCode, courses);
	if (suggestedCourseId && suggestedCourseId !== courseId) {
		const matched = courses.find((c) => c.id === suggestedCourseId);
		drafts.push({
			kind: 'course',
			label: matched ? `${matched.code || '(tanpa kode)'} — ${matched.title}` : suggestedCourseId,
			pageRef: '',
			note: 'Teks menyebut kode mata kuliah yang cocok dengan salah satu mata kuliah Anda.',
			cpmk: '',
			subCpmk: '',
			session: '',
			course: suggestedCourseId,
		});
	}

	// Optional whole-file session link suggestion.
	const suggestedSessionId = resolveSession(raw.sessionWeek, sessions);
	if (suggestedSessionId && suggestedSessionId !== file.session) {
		const matched = sessions.find((s) => s.id === suggestedSessionId);
		drafts.push({
			kind: 'session',
			label: matched ? `Minggu ${matched.week} — ${matched.title}` : suggestedSessionId,
			pageRef: '',
			note: 'Isi berkas secara keseluruhan membahas satu pertemuan tertentu.',
			cpmk: '',
			subCpmk: '',
			session: suggestedSessionId,
			course: '',
		});
	}

	if (drafts.length === 0) {
		return {
			ok: false,
			bundleId: '',
			suggestions: [],
			reason:
				'Teks hasil penguraian tidak memberikan cukup bukti untuk saran konteks otomatis. Tandai bagian konten secara manual di bawah.',
		};
	}

	// Replace any prior pending suggestions for this file so the review queue
	// always reflects the latest generation. Approved/rejected history is kept.
	const priorPending = await pocketbaseAdmin.listRecords<ContextSuggestionRecord>(
		'context_suggestions',
		{ filter: `file = "${fileId}" && review = "pending"`, perPage: 500 },
	);
	for (const row of priorPending.items) {
		await pocketbaseAdmin.deleteRecord('context_suggestions', row.id);
	}

	const limited = drafts.slice(0, MAX_SUGGESTIONS);
	await pocketbaseAdmin.createRecords(
		'context_suggestions',
		limited.map((draft) => ({
			file: fileId,
			owner: ownerId,
			version,
			kind: draft.kind,
			label: draft.label,
			pageRef: draft.pageRef,
			note: draft.note,
			cpmk: draft.cpmk,
			subCpmk: draft.subCpmk,
			session: draft.session,
			course: draft.course,
			review: 'pending',
			bundleId,
		})),
	);

	// createRecords returns void — re-fetch the freshly stored suggestions so
	// the UI can render them with their assigned ids and expanded links.
	const stored = await pocketbaseAdmin.listRecords<ContextSuggestionRecord>(
		'context_suggestions',
		{
			filter: `file = "${fileId}" && bundleId = "${bundleId}"`,
			perPage: 100,
			sort: 'created',
			expand: 'cpmk,subCpmk,session',
		},
	);

	return { ok: true, bundleId, suggestions: stored.items, reason: '' };
}

/** Extracts the JSON object from a model reply, tolerating surrounding prose. */
function parseModelJson(output: string): RawPayload | null {
	const trimmed = output.trim();
	const tryParse = (candidate: string): RawPayload | null => {
		try {
			const parsed = JSON.parse(candidate) as RawPayload;
			return parsed && typeof parsed === 'object' ? parsed : null;
		} catch {
			return null;
		}
	};

	const direct = tryParse(trimmed);
	if (direct) return direct;

	const start = trimmed.indexOf('{');
	const end = trimmed.lastIndexOf('}');
	if (start !== -1 && end > start) {
		const sliced = tryParse(trimmed.slice(start, end + 1));
		if (sliced) return sliced;
	}
	return null;
}
