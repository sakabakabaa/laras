/**
 * Integrated AI extractor for Indonesian RPS (Rencana Pembelajaran Semester)
 * text. Server-only — reads the platform model credentials (the same env vars
 * `integrated-ai.server.ts` uses) and asks the model to return a strict JSON
 * object matching the structured RPS schema.
 *
 * Pipeline: PDF text → model `/generate` (streamed, collected) → JSON →
 * normalized `ParsedRps` with missing-field warnings. Never invents data: any
 * field the model cannot locate comes back empty and is flagged by
 * `buildWarnings`, exactly like the heuristic parser.
 */
import logger from '@/lib/logger.server';
import { collectHostingerText } from '@/lib/hostinger-model.server';
import {
	buildWarnings,
	splitItems,
	splitAssessments,
	splitCpmk,
	deriveSessionsFromTopics,
	type ParsedRps,
	type ParsedSession,
	type ParsedItem,
	type ParsedCpmk,
	type ParsedAssessment,
	type ParsedCollabTask,
} from './rps-parser.server';


const SYSTEM_PROMPT = `Anda adalah asisten yang mengekstrak struktur dari teks RPS (Rencana Pembelajaran Semester) bahasa Indonesia.
Tugas Anda: baca teks RPS yang diberikan dan kembalikan HANYA satu objek JSON yang valid — tanpa markdown, tanpa pembungkus \`\`\`json, tanpa kalimat pembuka atau penutup.
Skema JSON (gunakan kunci persis seperti ini):
{
  "title": "nama mata kuliah",
  "code": "kode mata kuliah",
  "semester": "semester, mis. Ganjil / Genap / 1",
  "academicYear": "tahun akademik",
  "description": "deskripsi mata kuliah",
  "cpl": "teks lengkap bagian CPL",
  "cpmk": "teks lengkap bagian CPMK / sub-CPMK",
  "syllabus": "silabus / garis besar materi",
  "assessments": "teks lengkap komponen dan bobot penilaian",
  "strategies": "strategi / metode pembelajaran",
  "workload": "beban kerja mahasiswa",
  "references": "referensi / daftar pustaka",
  "credits": 3,
  "prerequisites": "mata kuliah prasyarat",
  "courseGroup": "kelompok / rumpun mata kuliah",
  "lecturerName": "nama dosen pengampu (Dibuat Oleh)",
  "reviewerName": "nama pemeriksa (Diperiksa Oleh TPK Program Studi)",
  "approverName": "nama penyetuju (Disetujui Oleh Ketua Program Studi)",
  "demonstrableOutcomes": "hasil belajar yang dapat diperagakan/ditunjukkan dengan bukti di akhir perkuliahan",
  "learningSteps": "langkah pembelajaran (prose naratif, berbeda dari strategi)",
  "workloadIdealHours": 180,
  "workloadSksMatch": "SESUAI",
  "publishedAt": "tanggal penetapan / publikasi RPS bila ada (YYYY-MM-DD)",
  "workloadLecture": 16,
  "workloadTutorial": 0,
  "workloadPractice": 0,
  "workloadIndependent": 32,
  "workloadTotal": 48,
  "sessions": [{ "week": 1, "title": "judul pertemuan", "topic": "topik / materi", "objectives": "tujuan / capaian pertemuan", "activities": "kegiatan / materi pembelajaran", "duration": "durasi / alokasi waktu", "assessment": "penilaian pertemuan", "references": "referensi pertemuan", "cplCodes": ["CPL-1"], "cpmkCodes": ["CPMK-1"], "subCpmkCodes": ["Sub-CPMK-1"], "topicCodes": ["T1"], "assessmentCodes": ["UTS"] }],
  "cplItems": [{ "code": "CPL-1", "description": "deskripsi satu capaian lulusan" }],
  "cpmkItems": [{ "code": "CPMK-1", "description": "deskripsi CPMK", "cplCode": "CPL-1", "taxonomy": 4, "weight": 10, "criteria": "kriteria pencapaian CPMK", "subCpmk": [{ "code": "Sub-CPMK-1", "description": "deskripsi sub-CPMK" }] }],
  "topicItems": [{ "code": "T1", "description": "deskripsi satu topik / materi" }],
  "assessmentItems": [{ "code": "UTS", "description": "deskripsi komponen penilaian", "weight": 30 }],
  "collaborativeTasks": [{ "title": "judul tugas kolaboratif", "description": "deskripsi", "objectives": "tujuan", "schedule": "jadwal", "groupInfo": "info kelompok", "method": "metode pembelajaran", "weight": 50, "subCpmkNote": "Sub-CPMK terkait", "steps": "langkah pengerjaan tugas", "outputs": "rincian luaran", "indicators": "indikator, kriteria, dan bobot penilai", "notes": "lain-lain", "cplCodes": [], "cpmkCodes": [], "subCpmkCodes": [], "assessmentCodes": [] }]
}
Aturan:
- Hanya gunakan informasi yang benar-benar ada di teks. Jika sebuah bagian tidak ada, isi string kosong (atau array kosong). DILARANG mengarang data.
- Pertahankan teks asli bahasa Indonesia pada setiap nilai; ringkas hanya jika terlalu panjang.
- Jika teks memuat blok [JADWAL PERTEMUAN TERSTRUKTUR], jadwal mingguan SUDAH dipetakan secara terstruktur — kosongkan array sessions ([]) dan fokus pada field lain (identitas, CPL, CPMK, deskripsi, strategi, penilaian, referensi, tugas kolaboratif). Jika blok itu tidak ada, isi sessions seperti biasa dari jadwal mingguan.
- topicItems HANYA untuk daftar topik / garis besar materi yang BUKAN terorganisir per minggu/pertemuan. Jika silabus berupa daftar pertemuan mingguan, itu masuk sessions, bukan topicItems. Dengan demikian sessions dan topicItems tetap berbeda dan tidak saling menimpa.
- sessions: week berupa angka 1–16, maksimal 16 entri, urutkan menurut minggu. title dan topic wajib diisi bila pertemuan tersebut ada; field objectives/activities/duration/assessment/references diisi HANYA jika teks pertemuan menyebutnya — kosongkan jika tidak ada. DILARANG mengarang data.
- Kode relasi pada sessions (cplCodes, cpmkCodes, subCpmkCodes, topicCodes, assessmentCodes) diisi HANYA jika teks pertemuan secara eksplisit menautkan kode yang sesuai (mis. "CPMK-1, Sub-CPMK-1"); kosongkan array jika tidak ada. Gunakan kode yang sama persis dengan yang muncul di cplItems/cpmkItems/topicItems/assessmentItems.
- cplItems, cpmkItems, topicItems, assessmentItems: pecah bagian yang bersangkutan menjadi item-item TERPISAH dan berurutan. Setiap item adalah satu capaian/topik/komponen tersendiri — JANGAN gabung beberapa poin menjadi satu deskripsi.
- code diisi dari label/nomor asli bila ada (mis. "CPL-1", "CPMK 2", "1", "UTS"); kosongkan jika tidak ada label.
- cpmkItems.cplCode diisi HANYA jika teks secara eksplisit menautkan CPMK tersebut ke suatu CPL (mis. "CPMK-1 menunjang CPL-2"); kosongkan jika hubungan tidak jelas.
- cpmkItems.taxonomy diisi angka TAKSONOMI Bloom (mis. 4, 5, 6) HANYA jika tabel "Kriteria Penilaian CPMK" menyebutnya; null jika tidak ada.
- cpmkItems.weight diisi angka Bobot (%) dari tabel "Kriteria Penilaian CPMK" HANYA jika ada; null jika tidak.
- cpmkItems.criteria diisi teks "Kriteria Pencapaian CPMK" dari tabel tersebut HANYA jika ada; kosongkan jika tidak.
- collaborativeTasks: isi SEMUA sub-bagian yang ada di sumber — method (Metode Pembelajaran), weight (Bobot Penilaian), subCpmkNote (Sub-CPMK deskriptif), steps (Langkah Pengerjaan Tugas), outputs (Rincian Luaran), indicators (Indikator/Kriteria/Bobot Penilai), notes (Lain-lain). Kosongkan sub-bagian yang tidak ada di sumber — DILARANG mengarang.
- demonstrableOutcomes diisi teks "Hasil belajar yang dapat diperagakan/ditunjukkan" HANYA jika bagian itu ada; kosongkan jika tidak.
- learningSteps diisi teks "Langkah Pembelajaran" (prose naratif) HANYA jika bagian itu ada; berbeda dari strategies (yang berupa daftar metode). Kosongkan jika tidak ada.
- reviewerName dan approverName diisi dari tabel identitas ("Diperiksa Oleh" / "Disetujui Oleh") HANYA jika ada; kosongkan jika tidak.
- cpmkItems.subCpmk berisi sub-CPMK yang termasuk dalam CPMK tersebut; kosongkan array jika tidak ada.
- assessmentItems.weight diisi angka persen (0–100) HANYA jika teks menyebut bobotnya; null jika tidak ada.
- Keluarkan JSON ringkas (tanpa indentasi/whitespace berlebih) agar ringkas dan bisa di-parse langsung. Jangan tambahkan komentar, koma tertinggal, atau teks di luar objek JSON.
- Jika output mendekati batas panjang, utamakan cplItems, cpmkItems, subCpmk, topicItems, assessmentItems, dan sessions; singkat deskripsi yang sangat panjang.`;

type RawItem = { code?: unknown; description?: unknown };
type RawSubCpmk = RawItem;
type RawCpmkItem = RawItem & { cplCode?: unknown; taxonomy?: unknown; weight?: unknown; criteria?: unknown; subCpmk?: unknown };
type RawAssessmentItem = RawItem & { weight?: unknown };

type RawSession = {
	week?: unknown;
	title?: unknown;
	topic?: unknown;
	objectives?: unknown;
	activities?: unknown;
	duration?: unknown;
	assessment?: unknown;
	references?: unknown;
	cplCodes?: unknown;
	cpmkCodes?: unknown;
	subCpmkCodes?: unknown;
	topicCodes?: unknown;
	assessmentCodes?: unknown;
};

type RawRps = Partial<Record<keyof Omit<ParsedRps, 'rawText' | 'warnings'>, unknown>> & {
	sessions?: unknown;
	cplItems?: unknown;
	cpmkItems?: unknown;
	topicItems?: unknown;
	assessmentItems?: unknown;
};

const TEXT_FIELDS: (keyof Omit<
	ParsedRps,
	| 'sessions'
	| 'cplItems'
	| 'cpmkItems'
	| 'topicItems'
	| 'assessmentItems'
	| 'collaborativeTasks'
	| 'credits'
	| 'workloadLecture'
	| 'workloadTutorial'
	| 'workloadPractice'
	| 'workloadIndependent'
	| 'workloadTotal'
	| 'workloadIdealHours'
	| 'workloadBreakdown'
	| 'rawText'
	| 'warnings'
>)[] = [
	'title',
	'code',
	'semester',
	'academicYear',
	'description',
	'cpl',
	'cpmk',
	'syllabus',
	'assessments',
	'strategies',
	'workload',
	'references',
	'prerequisites',
	'courseGroup',
	'lecturerName',
	'reviewerName',
	'approverName',
	'demonstrableOutcomes',
	'learningSteps',
	'workloadSksMatch',
	'publishedAt',
];

const NUMBER_FIELDS = [
	'credits',
	'workloadLecture',
	'workloadTutorial',
	'workloadPractice',
	'workloadIndependent',
	'workloadTotal',
	'workloadIdealHours',
] as const;

const asNumberOrNull = (value: unknown): number | null => {
	if (value === null || value === undefined || value === '') return null;
	const n = Number(value);
	if (Number.isNaN(n) || n < 0) return null;
	return n;
};

/** Pulls the first balanced JSON object out of a model response that may wrap it in prose or code fences. */
function extractJsonObject(text: string): string | null {
	const cleaned = text.replace(/```json/gi, '```').trim();

	// Fast path: the whole response is already JSON.
	if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
		return cleaned;
	}

	const fenceMatch = cleaned.match(/```[\s\S]*?```/);
	if (fenceMatch) {
		const inner = fenceMatch[0].replace(/```/g, '').trim();
		if (inner.startsWith('{')) return inner;
	}

	const start = cleaned.indexOf('{');
	const end = cleaned.lastIndexOf('}');
	if (start !== -1 && end > start) {
		return cleaned.slice(start, end + 1);
	}
	// Truncated output: there is an opening brace but no closing one. Hand the
	// tail to the repair step so a cut-off response can still yield partial data.
	if (start !== -1) {
		return cleaned.slice(start);
	}
	return null;
}

/**
 * Repairs common model-output defects so a near-valid response still parses:
 * trailing commas before `}`/`]`, and truncation (unclosed strings, arrays,
 * and objects). Returns the repaired string, or the input unchanged if no
 * structural repair applies. JSON.parse is the caller's job.
 */
function repairJson(input: string): string {
	const out = input.replace(/,\s*([}\]])/g, '$1');

	// Already valid — nothing to repair.
	try {
		JSON.parse(out);
		return out;
	} catch {
		/* fall through to structural repair */
	}

	let inString = false;
	let escape = false;
	const stack: ('{' | '[' | '"')[] = [];
	for (let i = 0; i < out.length; i += 1) {
		const ch = out[i];
		if (inString) {
			if (escape) {
				escape = false;
			} else if (ch === '\\') {
				escape = true;
			} else if (ch === '"') {
				inString = false;
				stack.pop();
			}
			continue;
		}
		if (ch === '"') {
			inString = true;
			stack.push('"');
		} else if (ch === '{') {
			stack.push('{');
		} else if (ch === '[') {
			stack.push('[');
		} else if (ch === '}') {
			// Pop back to the matching '{', tolerating a stray '"' on top.
			while (stack.length && stack[stack.length - 1] === '"') stack.pop();
			if (stack.length && stack[stack.length - 1] === '{') stack.pop();
		} else if (ch === ']') {
			while (stack.length && stack[stack.length - 1] === '"') stack.pop();
			if (stack.length && stack[stack.length - 1] === '[') stack.pop();
		}
	}

	const suffix: string[] = [];
	if (inString) suffix.push('"');
	for (let i = stack.length - 1; i >= 0; i -= 1) {
		const top = stack[i];
		if (top === '"') suffix.push('"');
		else if (top === '{') suffix.push('}');
		else if (top === '[') suffix.push(']');
	}
	if (suffix.length === 0) return out;
	return out + suffix.join('');
}

/**
 * Best-effort parse of a model response into a raw RPS object. Tries the
 * extracted JSON as-is, then with trailing-comma cleanup, then with full
 * truncation repair — so a response cut off mid-output still yields the
 * structured items that did complete. The second element of the result is
 * true when the raw response was malformed/truncated and repair was required.
 */
function parseRawRps(content: string): [RawRps | null, boolean] {
	const candidate = extractJsonObject(content);
	if (!candidate) return [null, false];
	try {
		return [JSON.parse(candidate) as RawRps, false];
	} catch {
		/* fall through to repair */
	}
	try {
		return [JSON.parse(repairJson(candidate)) as RawRps, true];
	} catch {
		return [null, true];
	}
}

const asString = (value: unknown): string => {
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (Array.isArray(value)) {
		return value
			.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
			.join('\n')
			.trim();
	}
	return '';
};

const asStringArray = (value: unknown): string[] => {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => (typeof item === 'string' ? item.trim() : asString(item)))
		.filter((item) => item.length > 0);
};

const normalizeSessions = (raw: unknown): ParsedSession[] => {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<number>();
	const sessions: ParsedSession[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== 'object') continue;
		const row = entry as RawSession;
		const week = Math.min(Math.max(Math.trunc(Number(row.week)) || 1, 1), 16);
		const title = asString(row.title);
		const topic = asString(row.topic);
		if (seen.has(week)) continue;
		seen.add(week);
		sessions.push({
			week,
			title,
			topic,
			objectives: asString(row.objectives) || undefined,
			activities: asString(row.activities) || undefined,
			duration: asString(row.duration) || undefined,
			assessment: asString(row.assessment) || undefined,
			references: asString(row.references) || undefined,
			cplCodes: asStringArray(row.cplCodes),
			cpmkCodes: asStringArray(row.cpmkCodes),
			subCpmkCodes: asStringArray(row.subCpmkCodes),
			topicCodes: asStringArray(row.topicCodes),
			assessmentCodes: asStringArray(row.assessmentCodes),
		});
	}
	return sessions.slice(0, 16);
};

const normalizeItems = (raw: unknown): ParsedItem[] => {
	if (!Array.isArray(raw)) return [];
	const items: ParsedItem[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== 'object') continue;
		const row = entry as RawItem;
		const description = asString(row.description);
		if (!description) continue;
		items.push({ code: asString(row.code), description });
	}
	return items.slice(0, 60);
};

const normalizeCpmkItems = (raw: unknown): ParsedCpmk[] => {
	if (!Array.isArray(raw)) return [];
	const items: ParsedCpmk[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== 'object') continue;
		const row = entry as RawCpmkItem;
		const description = asString(row.description);
		if (!description) continue;
		items.push({
			code: asString(row.code),
			description,
			cplCode: asString(row.cplCode),
			taxonomy: asNumberOrNull(row.taxonomy),
			weight: asNumberOrNull(row.weight),
			criteria: asString(row.criteria),
			subCpmk: normalizeItems(row.subCpmk),
		});
	}
	return items.slice(0, 40);
};

const normalizeAssessmentItems = (raw: unknown): ParsedAssessment[] => {
	if (!Array.isArray(raw)) return [];
	const items: ParsedAssessment[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== 'object') continue;
		const row = entry as RawAssessmentItem;
		const description = asString(row.description);
		if (!description) continue;
		let weight: number | null = null;
		const numeric = Number(row.weight);
		if (!Number.isNaN(numeric) && numeric >= 0 && numeric <= 100) weight = Math.trunc(numeric);
		items.push({ code: asString(row.code), description, weight });
	}
	return items.slice(0, 40);
};

/** Maps the model's JSON into a validated `ParsedRps`, flagging anything missing. */
const normalizeCollabTasks = (raw: unknown): ParsedCollabTask[] => {
	if (!Array.isArray(raw)) return [];
	const items: ParsedCollabTask[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== 'object') continue;
		const row = entry as Record<string, unknown>;
		const title = asString(row.title);
		if (!title && !asString(row.description)) continue;
		items.push({
			title: title || 'Tugas kolaboratif',
			description: asString(row.description),
			objectives: asString(row.objectives),
			schedule: asString(row.schedule),
			groupInfo: asString(row.groupInfo),
			method: asString(row.method),
			weight: asNumberOrNull(row.weight),
			subCpmkNote: asString(row.subCpmkNote),
			steps: asString(row.steps),
			outputs: asString(row.outputs),
			indicators: asString(row.indicators),
			notes: asString(row.notes),
			cplCodes: asStringArray(row.cplCodes),
			cpmkCodes: asStringArray(row.cpmkCodes),
			subCpmkCodes: asStringArray(row.subCpmkCodes),
			assessmentCodes: asStringArray(row.assessmentCodes),
		});
	}
	return items.slice(0, 20);
};

export function normalizeAiParsed(raw: RawRps, rawText: string): ParsedRps {
	const parsed: ParsedRps = {
		title: '',
		code: '',
		semester: '',
		academicYear: '',
		description: '',
		cpl: '',
		cpmk: '',
		syllabus: '',
		assessments: '',
		strategies: '',
		workload: '',
		references: '',
		credits: null,
		prerequisites: '',
		courseGroup: '',
		lecturerName: '',
		publishedAt: '',
		workloadLecture: null,
		workloadTutorial: null,
		workloadPractice: null,
		workloadIndependent: null,
		workloadTotal: null,
		reviewerName: '',
		approverName: '',
		demonstrableOutcomes: '',
		learningSteps: '',
		workloadBreakdown: null,
		workloadIdealHours: null,
		workloadSksMatch: '',
		sessions: normalizeSessions(raw.sessions),
		cplItems: normalizeItems(raw.cplItems),
		cpmkItems: normalizeCpmkItems(raw.cpmkItems),
		topicItems: normalizeItems(raw.topicItems),
		assessmentItems: normalizeAssessmentItems(raw.assessmentItems),
		collaborativeTasks: normalizeCollabTasks(raw.collaborativeTasks),
		rawText,
		warnings: [],
	};
	for (const field of TEXT_FIELDS) {
		parsed[field] = asString(raw[field]);
	}
	for (const field of NUMBER_FIELDS) {
		parsed[field] = asNumberOrNull(raw[field]);
	}
	// workloadBreakdown is a JSON object/array the model may return for the
	// detailed UPI workload table. Pass it through only when it is a real
	// object/array; otherwise leave null so the editor shows the text notes.
	const wb = (raw as Record<string, unknown>).workloadBreakdown;
	parsed.workloadBreakdown = wb && typeof wb === 'object' ? wb : null;
	// If the model returned free text but no structured items, split the text
	// heuristically so the review step still shows editable item rows.
	if (parsed.cplItems.length === 0 && parsed.cpl) {
		parsed.cplItems = splitItems(parsed.cpl);
	}
	if (parsed.assessmentItems.length === 0 && parsed.assessments) {
		parsed.assessmentItems = splitAssessments(parsed.assessments);
	}
	if (parsed.topicItems.length === 0 && parsed.syllabus) {
		parsed.topicItems = splitItems(parsed.syllabus);
	}
	if (parsed.cpmkItems.length === 0 && parsed.cpmk) {
		parsed.cpmkItems = splitCpmk(parsed.cpmk);
	}
	// Fallback: if the model did not return a weekly schedule but the topic
	// list reads like a week-by-week plan, derive sessions from it. Topic
	// records are preserved so topics and sessions stay distinct.
	let derivedFromTopics = false;
	if (parsed.sessions.length === 0) {
		const derived = deriveSessionsFromTopics(parsed.topicItems);
		if (derived.length > 0) {
			parsed.sessions = derived;
			derivedFromTopics = true;
		}
	}
	parsed.warnings = buildWarnings(parsed);
	if (derivedFromTopics) {
		parsed.warnings = [
			'Sesi mingguan diturunkan dari daftar topik karena RPS tidak memiliki bagian pertemuan terpisah — periksa urutan minggu dan judul sesi.',
			...parsed.warnings,
		];
	}
	return parsed;
}

export type AiStageDiagnostics = {
	/** Whether the model returned a usable, normalized ParsedRps. */
	ok: boolean;
	/** Number of attempt(s) made (retries on transport/parse failure). */
	attempts: number;
	/** Characters of source text sent to the model (after capping). */
	inputChars: number;
	/** Characters of raw model output collected from the stream. */
	outputChars: number;
	/** True when the JSON had to be repaired (trailing commas / truncation). */
	repaired: boolean;
	/** Human-readable Indonesian reason when `ok` is false. */
	error?: string;
};

export type AiExtractionResult = {
	parsed: ParsedRps | null;
	diagnostics: AiStageDiagnostics;
};

/**
 * Sends the extracted PDF text to the Integrated AI model and resolves with a
 * normalized `ParsedRps` plus stage diagnostics. Never throws: a model /
 * transport / JSON failure is reported through `diagnostics.ok = false` and
 * `parsed = null` so the caller can fall back to the heuristic parser while
 * still surfacing what went wrong. One retry is attempted on a transient
 * failure (network, 5xx, empty stream, unparseable JSON).
 */
export async function extractRpsWithAi(rawText: string): Promise<AiExtractionResult> {
	// Cap the text sent to the model so a long RPS does not blow past the
	// context window or stall the request. The head of the document carries the
	// identity fields and the structured sections; a truncated tail still leaves
	// the review step with the bulk of the data.
	const MAX_INPUT_CHARS = 20000;
	const cappedText =
		rawText.length > MAX_INPUT_CHARS
			? `${rawText.slice(0, MAX_INPUT_CHARS)}\n\n[...teks dipotong karena terlalu panjang...]`
			: rawText;

	const baseDiagnostics: AiStageDiagnostics = {
		ok: false,
		attempts: 0,
		inputChars: cappedText.length,
		outputChars: 0,
		repaired: false,
	};

	let lastError = '';
	for (let attempt = 1; attempt <= 2; attempt += 1) {
		baseDiagnostics.attempts = attempt;
		const outcome = await runAiStream(cappedText);
		baseDiagnostics.outputChars = outcome.outputChars;
		baseDiagnostics.repaired = outcome.repaired;
		if (outcome.error) {
			lastError = outcome.error;
			logger.error(`AI RPS extraction attempt ${attempt} failed: ${outcome.error}`);
			// Retry once on transient failures; give up immediately on auth/config
			// errors that will not resolve by retrying.
			if (outcome.fatal) break;
			continue;
		}
		const parsed = normalizeAiParsed(outcome.raw!, rawText);
		if (outcome.repaired) {
			parsed.warnings = [
				'Output AI terpotong atau tidak lengkap — beberapa item mungkin belum terekam. Periksa dan tambahkan yang kurang secara manual.',
				...parsed.warnings,
			];
		}
		baseDiagnostics.ok = true;
		return { parsed, diagnostics: baseDiagnostics };
	}

	baseDiagnostics.error =
		lastError || 'Pemetaan AI gagal tanpa detail. Menggunakan parser heuristik sebagai cadangan.';
	return { parsed: null, diagnostics: baseDiagnostics };
}

type StreamOutcome = {
	raw: RawRps | null;
	outputChars: number;
	repaired: boolean;
	error?: string;
	/** True when retrying cannot help (missing credentials, 4xx auth). */
	fatal?: boolean;
};

/** Single model round-trip: POST → stream → collect → parse. */
async function runAiStream(cappedText: string): Promise<StreamOutcome> {
	let content: string;
	try {
		({ content } = await collectHostingerText({ prompt: cappedText, systemPrompt: SYSTEM_PROMPT, timeoutMs: 90_000 }));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const status = message.match(/HTTP (\d{3})/)?.[1];
		const fatal = Boolean(status && Number(status) >= 400 && Number(status) < 500);
		return {
			raw: null,
			outputChars: 0,
			repaired: false,
			fatal,
			error: message.includes('AbortError') ? 'Model request timed out after 90s.' : `Hostinger AI Router request failed: ${message}`,
		};
	}

	if (!content.trim()) {
		return { raw: null, outputChars: 0, repaired: false, error: 'Hostinger AI Router returned an empty response.' };
	}

	const [raw, repaired] = parseRawRps(content);
	if (!raw) {
		logger.error(
			`AI RPS extractor: no parseable JSON object found in model response (len=${content.length})`,
		);
		return {
			raw: null,
			outputChars: content.length,
			repaired,
			error: 'Respons model tidak berisi objek JSON yang bisa di-parse.',
		};
	}

	return { raw, outputChars: content.length, repaired };
}
