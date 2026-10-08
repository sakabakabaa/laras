/**
 * Heuristic parser for Indonesian RPS (Rencana Pembelajaran Semester) PDF text.
 *
 * Server-only. Reads the raw text extracted from a PDF and maps it into the
 * structured fields the lecturer can review before saving. It never invents
 * data: anything it cannot locate is returned empty and flagged in `warnings`
 * so the review UI can prompt the lecturer to fill it in manually.
 */

export type ParsedItem = {
	code: string;
	description: string;
};

export type ParsedCpmk = ParsedItem & {
	cplCode: string;
	subCpmk: ParsedItem[];
	/** "TAKSONOMI" Bloom level (UPI Kriteria Penilaian CPMK). */
	taxonomy?: number | null;
	/** "Bobot" assessment weight % (UPI Kriteria Penilaian CPMK). */
	weight?: number | null;
	/** "Kriteria Pencapaian CPMK" text. */
	criteria?: string;
};

export type ParsedAssessment = ParsedItem & {
	weight: number | null;
};

export type ParsedSession = {
	week: number;
	title: string;
	topic: string;
	/** Richer per-meeting fields the AI may recover from a weekly schedule table. */
	objectives?: string;
	activities?: string;
	duration?: string;
	assessment?: string;
	references?: string;
	/** Codes that link this meeting to structured records (resolved to ids on save). */
	cplCodes?: string[];
	cpmkCodes?: string[];
	subCpmkCodes?: string[];
	topicCodes?: string[];
	assessmentCodes?: string[];
	/** Extended weekly-schedule fields recovered by the deterministic table parser. */
	learningIndicator?: string;
	learningMaterial?: string;
	assessmentMethod?: string;
	assessmentWeight?: number | null;
	synchronousMethod?: string;
	asynchronousMethod?: string;
	accessDateTime?: string;
	specialWeekType?: 'normal' | 'uts' | 'uas' | 'khusus' | '';
};

export type ParsedCollabTask = {
	title: string;
	description: string;
	objectives: string;
	schedule: string;
	groupInfo: string;
	method?: string;
	weight?: number | null;
	subCpmkNote?: string;
	steps?: string;
	outputs?: string;
	indicators?: string;
	notes?: string;
	cplCodes?: string[];
	cpmkCodes?: string[];
	subCpmkCodes?: string[];
	assessmentCodes?: string[];
};

export type ParsedRps = {
	title: string;
	code: string;
	semester: string;
	academicYear: string;
	description: string;
	cpl: string;
	cpmk: string;
	syllabus: string;
	assessments: string;
	strategies: string;
	workload: string;
	references: string;
	credits: number | null;
	prerequisites: string;
	courseGroup: string;
	lecturerName: string;
	publishedAt: string;
	workloadLecture: number | null;
	workloadTutorial: number | null;
	workloadPractice: number | null;
	workloadIndependent: number | null;
	workloadTotal: number | null;
	/** "Diperiksa Oleh TPK Program Studi". */
	reviewerName: string;
	/** "Disetujui Oleh Ketua Program Studi". */
	approverName: string;
	/** "Hasil belajar yang dapat diperagakan". */
	demonstrableOutcomes: string;
	/** "Langkah Pembelajaran" prose. */
	learningSteps: string;
	/** Full workload breakdown table (JSON-serializable). */
	workloadBreakdown: unknown;
	/** "Jumlah Jam Ideal". */
	workloadIdealHours: number | null;
	/** "Kesesuaian dengan jumlah SKS". */
	workloadSksMatch: string;
	sessions: ParsedSession[];
	/** Structured, ordered items extracted from the free-text fields above. */
	cplItems: ParsedItem[];
	cpmkItems: ParsedCpmk[];
	topicItems: ParsedItem[];
	assessmentItems: ParsedAssessment[];
	collaborativeTasks: ParsedCollabTask[];
	rawText: string;
	warnings: string[];
};

type SectionDef = {
	field:
		| 'description'
		| 'cpl'
		| 'cpmk'
		| 'syllabus'
		| 'assessments'
		| 'strategies'
		| 'workload'
		| 'references'
		| 'learningSteps'
		| 'demonstrableOutcomes';
	patterns: RegExp[];
};

const SECTION_DEFS: SectionDef[] = [
	{ field: 'description', patterns: [/deskripsi\s*(mata\s*kuliah)?/i, /deskripsi\s+mata\s+/i] },
	{ field: 'cpl', patterns: [/capaian\s*pembelajaran\s*lulusan/i, /\bcpl\b/i, /capaian\s*lulusan/i] },
	{
		field: 'cpmk',
		patterns: [/capaian\s*pembelajaran\s*mata\s*kuliah/i, /\bcpmk\b/i, /sub\s*-?\s*cpmk/i],
	},
	{ field: 'syllabus', patterns: [/silabus/i, /garis\s*besar\s*(materi|isi)?/i, /materi\s*perkuliahan/i, /materi\s*kuliah/i] },
	{
		field: 'strategies',
		patterns: [/strategi\s*pembelajaran/i, /metode\s*pembelajaran/i, /metode\s*pengajaran/i, /pendekatan\s*pembelajaran/i],
	},
	{
		field: 'learningSteps',
		patterns: [/langkah\s*pembelajaran/i],
	},
	{
		field: 'demonstrableOutcomes',
		patterns: [/hasil\s*belajar\s*yang\s*dapat\s*diperagakan/i, /hasil\s*belajar\s*yang\s*dapat\s*ditunjukkan/i],
	},
	{
		field: 'assessments',
		patterns: [/komponen\s*penilaian/i, /bobot\s*penilaian/i, /penilaian\s*(akademik)?/i, /asesmen/i, /evaluasi/i],
	},
	{ field: 'workload', patterns: [/beban\s*kerja/i, /workload/i, /estimasi\s*beban/i] },
	{
		field: 'references',
		patterns: [/daftar\s*pustaka/i, /\breferensi\b/i, /bahan\s*ajar/i],
	},
];

const IDENTITY_PATTERNS: { field: keyof Pick<ParsedRps, 'title' | 'code' | 'semester' | 'academicYear'>; patterns: RegExp[] }[] = [
	{
		field: 'title',
		patterns: [/nama\s*mata\s*kuliah\s*[:\-]?\s*(.+)/i, /mata\s*kuliah\s*[:\-]\s*(.+)/i],
	},
	{
		field: 'code',
		patterns: [/kode\s*(mata\s*kuliah)?\s*[:\-]?\s*([A-Za-z]{2,}\s?[0-9]{2,}[A-Za-z0-9 ]*)/i, /kode\s*[:\-]\s*(.+)/i],
	},
	{
		field: 'semester',
		patterns: [/semester\s*[:\-]?\s*(ganjil|genap|[ivxlc]+|\d{1,2})/i, /semester\s*[:\-]\s*(.+)/i],
	},
	{
		field: 'academicYear',
		patterns: [/tahun\s*(akademik|ajaran)\s*[:\-]?\s*(.+)/i],
	},
];

function cleanLine(value: string): string {
	return value
		.replace(/\s+/g, ' ')
		.replace(/^[\s:\-–|.]+/, '')
		.replace(/[\s:.]+$/, '')
		.trim();
}

function cleanBlock(value: string): string {
	return value
		.split(/\r?\n/)
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter((line) => line.length > 0)
		.filter((line) => !/--\s*\d+\s+of\s+\d+\s*--/i.test(line))
		.join('\n')
		.trim();
}

/** Find the first matching line for a regex and return the last populated capture group. */
function scanLine(lines: string[], patterns: RegExp[]): string {
	for (const pattern of patterns) {
		for (const line of lines) {
			const match = line.match(pattern);
			if (!match) continue;
			// Use the last defined capture group so patterns like
			// `kode (mata kuliah)? : (VALUE)` return VALUE, not the optional label.
			let value = '';
			for (let i = match.length - 1; i >= 1; i -= 1) {
				if (match[i]) {
					value = match[i];
					break;
				}
			}
			value = cleanLine(value);
			if (value) return value;
		}
	}
	return '';
}

/** Extract identity fields (title/code/semester/academicYear) from the first ~40 lines. */
function extractIdentity(lines: string[]): Pick<ParsedRps, 'title' | 'code' | 'semester' | 'academicYear'> {
	const head = lines.slice(0, 40);
	const result = { title: '', code: '', semester: '', academicYear: '' };
	for (const { field, patterns } of IDENTITY_PATTERNS) {
		const value = scanLine(head, patterns);
		if (value) (result as Record<string, string>)[field] = value;
	}
	return result;
}

/** Slice the document into named sections by their header lines. */
function extractSections(lines: string[]): Partial<Record<SectionDef['field'], string>> {
	const marks: { field: SectionDef['field']; line: number; pattern: RegExp }[] = [];
	// A section keyword must appear near the start of the line (within the first
	// 80 chars) to count as a header. This stops keywords buried deep inside a
	// long item description from prematurely slicing a section — e.g. the word
	// "preferensi" inside a Sub-CPMK description must not be mistaken for the
	// "Referensi" / daftar-pustaka header.
	const HEADER_MATCH_LIMIT = 80;
	lines.forEach((line, i) => {
		for (const def of SECTION_DEFS) {
			if (marks.some((m) => m.field === def.field)) continue;
			for (const pattern of def.patterns) {
				const match = line.match(pattern);
				if (match && (match.index ?? 0) < HEADER_MATCH_LIMIT) {
					marks.push({ field: def.field, line: i, pattern });
					break;
				}
			}
		}
	});
	marks.sort((a, b) => a.line - b.line);

	const out: Partial<Record<SectionDef['field'], string>> = {};
	marks.forEach((mark, idx) => {
		const end = idx + 1 < marks.length ? marks[idx + 1].line : lines.length;
		const headerRemainder = lines[mark.line].replace(mark.pattern, '').trim();
		const body = [headerRemainder, ...lines.slice(mark.line + 1, end)].join('\n');
		const cleaned = cleanBlock(body);
		if (cleaned) out[mark.field] = cleaned;
	});
	return out;
}

const clampWeek = (raw: string | number): number =>
	Math.min(Math.max(Math.trunc(Number(raw)) || 1, 1), 16);

/** Parse weekly pertemuan/minggu entries into session rows. */
function extractSessions(lines: string[]): ParsedSession[] {
	const sessions: ParsedSession[] = [];
	let current: ParsedSession | null = null;
	const push = () => {
		if (current) {
			current.title = current.title.trim();
			current.topic = current.topic.trim();
			sessions.push(current);
		}
		current = null;
	};
	// Explicit "Pertemuan ke-1" / "Minggu 1" markers.
	const explicitRe = /(?:pertemuan\s*(?:ke\-?\s*)?|minggu\s*)(\d{1,2})/i;
	// Bare numbered row inside a schedule: "1. Pengantar ..." (week 1–16 only).
	const bareRe = /^\s*(\d{1,2})[.\):]\s+(.+)$/;
	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;
		const explicit = line.match(explicitRe);
		const bare = !explicit && line.match(bareRe);
		if (explicit) {
			push();
			const week = clampWeek(explicit[1]);
			const rest = cleanLine(line.replace(explicit[0], ''));
			current = { week, title: rest || `Pertemuan ${week}`, topic: '' };
		} else if (bare && Number(bare[1]) >= 1 && Number(bare[1]) <= 16) {
			push();
			current = { week: clampWeek(bare[1]), title: cleanLine(bare[2]), topic: '' };
		} else if (current) {
			if (!current.title) {
				current.title = line;
			} else if (!current.topic) {
				current.topic = line;
			} else if (line.length < 240) {
				current.topic += `\n${line}`;
			}
		}
	}
	push();

	// Deduplicate by week, keep first occurrence, cap at 16.
	const seen = new Set<number>();
	const unique = sessions.filter((s) => {
		if (seen.has(s.week)) return false;
		seen.add(s.week);
		return true;
	});
	return unique.slice(0, 16);
}

/**
 * Fallback used when no explicit weekly schedule was found but the silabus /
 * topic list reads like a week-by-week plan (7–16 ordered items). Each topic
 * becomes a session whose week is its position; the original topic records are
 * preserved separately so topics and sessions stay distinct.
 */
export function deriveSessionsFromTopics(topics: ParsedItem[]): ParsedSession[] {
	if (topics.length < 7 || topics.length > 16) return [];
	return topics.slice(0, 16).map((topic, i) => ({
		week: i + 1,
		title: topic.description.trim() || `Pertemuan ${i + 1}`,
		topic: topic.description.trim(),
	}));
}

/**
 * True when a block of text is weekly-schedule table content rather than a
 * genuine topic list. The RPS schedule table repeats column headers like
 * "Sub-CPMK", "Asesmen", "Bobot Penilaian", "Waktu Akses", "Indikator" across
 * pages; a real topic list does not. Two or more of those markers means the
 * "silabus" keyword matched inside the schedule, and splitting it would only
 * produce garbage topic rows.
 */
function looksLikeScheduleTable(body: string): boolean {
	if (!body) return false;
	const markers = [
		/Sub-?CPMK/i,
		/\bAsesmen\b/i,
		/Bobot\s*Penilaian/i,
		/Waktu\s*Akses/i,
		/Indikator/i,
		/Bentuk\s*(dan\s*)?metode\s*pembelajaran/i,
		/Minggu\s*ke/i,
		/Nomor\s*Referensi/i,
	];
	return markers.filter((re) => re.test(body)).length >= 2;
}

export function parseRpsText(rawText: string): ParsedRps {
	const text = rawText.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ');
	const lines = text.split('\n');
	const identity = extractIdentity(lines);
	const sections = extractSections(lines);

	// Sessions: prefer the syllabus/rencana section, fall back to whole text.
	const syllabusBody = sections.syllabus || '';
	const sessionSource = syllabusBody
		? syllabusBody.split('\n')
		: lines;
	let sessions = extractSessions(sessionSource);
	if (sessions.length === 0) sessions = extractSessions(lines);

	// Structured items: split the free-text sections into ordered records.
	const cplItems = splitItems(sections.cpl || '');
	const assessmentItems = splitAssessments(sections.assessments || '');
	// The "silabus" keyword often lands inside a weekly-schedule table (e.g.
	// "Mahasiswa memahami silabus …" is a session indicator, not a topic list).
	// Splitting that table produces garbage topic rows, so skip topicItems when
	// the section looks like schedule-table content — the deterministic table
	// parser already recovers those sessions.
	const topicItems = looksLikeScheduleTable(syllabusBody) ? [] : splitItems(syllabusBody);
	const cpmkItems = splitCpmk(sections.cpmk || '');

	// Last-resort fallback: if no weekly schedule was found but the silabus
	// reads like a week-by-week plan, derive sessions from the topic list. The
	// topic records are kept separately so topics and sessions stay distinct.
	let derivedFromTopics = false;
	if (sessions.length === 0) {
		const derived = deriveSessionsFromTopics(topicItems);
		if (derived.length > 0) {
			sessions = derived;
			derivedFromTopics = true;
		}
	}

	const parsed: ParsedRps = {
		...identity,
		description: sections.description || '',
		cpl: sections.cpl || '',
		cpmk: sections.cpmk || '',
		syllabus: sections.syllabus || '',
		assessments: sections.assessments || '',
		strategies: sections.strategies || '',
		workload: sections.workload || '',
		references: sections.references || '',
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
		demonstrableOutcomes: sections.demonstrableOutcomes || '',
		learningSteps: sections.learningSteps || '',
		workloadBreakdown: null,
		workloadIdealHours: null,
		workloadSksMatch: '',
		sessions,
		cplItems,
		cpmkItems,
		topicItems,
		assessmentItems,
		collaborativeTasks: [],
		rawText: text,
		warnings: [],
	};

	parsed.warnings = buildWarnings(parsed, sessions.length);
	if (derivedFromTopics) {
		parsed.warnings = [
			'Sesi mingguan diturunkan dari daftar topik karena RPS tidak memiliki bagian pertemuan terpisah — periksa urutan minggu dan judul sesi.',
			...parsed.warnings,
		];
	}

	return parsed;
}

/**
 * Splits a free-text block into ordered items. Recognizes numbered, lettered,
 * and bulleted markers and preserves a leading code (e.g. "CPL-1", "1") when
 * present. Continuation lines fold into the current item. Non-itemized prose is
 * ignored — only clearly itemized lines become records, so ambiguous text stays
 * in the original field for manual review.
 */
export function splitItems(body: string): ParsedItem[] {
	if (!body) return [];
	const lines = body.split(/\r?\n/);
	const items: ParsedItem[] = [];
	let current: ParsedItem | null = null;
	// Capture groups: 1=code (CPL-1), 2=number+period (1.), 3=bare number before
	// an uppercase letter (1 Menguasai…), 4=letter+period (a.), 5=bullet, 6=desc.
	// The bare-number branch needs an uppercase lookahead so it does not swallow
	// dates ("1 2026-08-24") or mid-prose numbers; many RPS PDFs number items as
	// "1 Menguasai…" with no trailing period.
	const itemRe =
		/^\s*(?:([A-Za-z]{1,8}[\-.\s]?\d+[A-Za-z0-9]*)|(\d{1,2})[.)]|(\d{1,2})\s+(?=[A-ZÄÖÜ])|([a-zA-Z])[.)]|([•\u2022\-*]))\s*(.*)$/;
	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;
		const m = line.match(itemRe);
		if (m) {
			if (current) items.push(current);
			const code = (m[1] || m[2] || m[3] || m[4] || '').replace(/[.)]\s*$/, '').trim();
			current = { code, description: (m[6] || '').trim() };
		} else if (current) {
			current.description += ` ${line}`;
		}
	}
	if (current) items.push(current);
	return items.filter((it) => it.description.length > 0).slice(0, 60);
}

/** Splits an assessment block and lifts a trailing "20%" weight out of each item. */
export function splitAssessments(body: string): ParsedAssessment[] {
	return splitItems(body).map((item) => {
		const m = item.description.match(/(\d{1,3})\s*%/);
		let weight: number | null = null;
		if (m) {
			const w = parseInt(m[1], 10);
			if (!Number.isNaN(w) && w >= 0 && w <= 100) weight = w;
		}
		return { ...item, weight };
	});
}

/**
 * Splits a CPMK block into CPMK items, detecting nested Sub-CPMK lines by
 * deeper indentation or sub-markers (a., b., •, -). Each CPMK keeps an optional
 * `cplCode` for linking to a parent CPL when the source labels it explicitly.
 */
/**
 * Splits a CPMK block into CPMK items with their Sub-CPMK children.
 *
 * Handles two layouts found in real RPS PDFs:
 *  1. Nested — Sub-CPMK lines indented under their parent CPMK.
 *  2. Flat list — each line carries both links, e.g.
 *     "3 CPMK - 2 Sub-CPMK 2.1: Mahasiswa mampu …". The Sub-CPMK lines are
 *     pulled out first (with their wrapped continuation lines), then the
 *     remaining CPMK items are split, and each Sub-CPMK is attached to its
 *     parent CPMK by the number in "CPMK - N".
 */
export function splitCpmk(body: string): ParsedCpmk[] {
	if (!body) return [];
	const lines = body.split(/\r?\n/);

	// Flat Sub-CPMK line: "… CPMK - N Sub-CPMK X.Y: description".
	const subLineRe = /CPMK\s*[-–]\s*(\d+)\s+Sub-?CPMK\s*([\d.]+)\s*[:\-]?\s*(.*)/i;

	const cpmkLines: string[] = [];
	const subEntries: { cpmkNum: number; code: string; description: string }[] = [];
	let pendingSub: { cpmkNum: number; code: string; description: string } | null = null;

	for (const raw of lines) {
		if (!raw.trim()) continue;
		const subMatch = raw.match(subLineRe);
		if (subMatch) {
			if (pendingSub) subEntries.push(pendingSub);
			pendingSub = {
				cpmkNum: parseInt(subMatch[1], 10),
				code: `Sub-CPMK ${subMatch[2]}`,
				description: subMatch[3].trim(),
			};
		} else if (pendingSub) {
			// Wrapped continuation of the current Sub-CPMK description.
			pendingSub.description += ` ${raw.trim()}`;
		} else {
			cpmkLines.push(raw);
		}
	}
	if (pendingSub) subEntries.push(pendingSub);

	// Nested Sub-CPMK lines (indented a./b./• under a CPMK) are handled here.
	const cpmkItems: ParsedCpmk[] = [];
	let current: ParsedCpmk | null = null;
	const cpmkRe =
		/^\s*(?:([A-Za-z]{0,8}[\-.\s]?CPMK[\-.\s]?\d+[A-Za-z0-9]*)|(\d{1,2})[.)]|(\d{1,2})\s+(?=[A-ZÄÖÜ]))\s*(.*)$/i;
	const subRe = /^\s+(?:([a-zA-Z])[.)]|([•\u2022\-*]))\s+(.*)$/;
	for (const raw of cpmkLines) {
		if (!raw.trim()) continue;
		const cpmkMatch = raw.match(cpmkRe);
		const subMatch = raw.match(subRe);
		if (cpmkMatch && !subMatch) {
			if (current) cpmkItems.push(current);
			const rawCode = (cpmkMatch[1] || cpmkMatch[2] || cpmkMatch[3] || '').replace(/[.)]\s*$/, '').trim();
			const code = rawCode && /^\d+$/.test(rawCode) ? `CPMK-${rawCode}` : rawCode;
			current = { code, description: (cpmkMatch[4] || '').trim(), cplCode: '', subCpmk: [] };
		} else if (subMatch && current) {
			const subCode = (subMatch[1] || '').replace(/[.)]\s*$/, '').trim();
			current.subCpmk.push({ code: subCode, description: (subMatch[3] || '').trim() });
		} else if (current) {
			if (current.subCpmk.length > 0) {
				current.subCpmk[current.subCpmk.length - 1].description += ` ${raw.trim()}`;
			} else {
				current.description += ` ${raw.trim()}`;
			}
		}
	}
	if (current) cpmkItems.push(current);

	// Attach flat-list Sub-CPMK entries to their parent CPMK by number (1-based).
	for (const sub of subEntries) {
		const parent = cpmkItems[sub.cpmkNum - 1];
		if (parent) {
			parent.subCpmk.push({ code: sub.code, description: sub.description });
		}
	}

	return cpmkItems.filter((it) => it.description.length > 0).slice(0, 40);
}

/** Human labels for every structured field, used to warn about missing data. */
export const PARSED_LABELS: { field: keyof ParsedRps; label: string }[] = [
	{ field: 'title', label: 'Nama mata kuliah' },
	{ field: 'code', label: 'Kode mata kuliah' },
	{ field: 'semester', label: 'Semester' },
	{ field: 'academicYear', label: 'Tahun akademik' },
	{ field: 'description', label: 'Deskripsi mata kuliah' },
	{ field: 'cpl', label: 'CPL (Capaian Pembelajaran Lulusan)' },
	{ field: 'cpmk', label: 'CPMK / Sub-CPMK' },
	{ field: 'syllabus', label: 'Silabus / garis besar' },
	{ field: 'assessments', label: 'Komponen penilaian' },
	{ field: 'strategies', label: 'Strategi pembelajaran' },
	{ field: 'workload', label: 'Beban kerja' },
	{ field: 'references', label: 'Referensi / daftar pustaka' },
	{ field: 'credits', label: 'SKS / kredit' },
	{ field: 'lecturerName', label: 'Dosen pengampu' },
];

/**
 * Builds the missing-field warning list for a parsed RPS. Shared by the
 * heuristic parser and the AI extractor so both surface the same guidance when
 * a section could not be recovered from the source text.
 */
export function buildWarnings(parsed: ParsedRps, sessionCount = parsed.sessions.length): string[] {
	const warnings: string[] = [];
	for (const { field, label } of PARSED_LABELS) {
		const value = parsed[field];
		if (typeof value === 'string' && !value) {
			warnings.push(`${label} tidak ditemukan di PDF — silakan isi manual.`);
		} else if (
			(field === 'credits' || field === 'workloadTotal') &&
			(value === null || value === undefined)
		) {
			warnings.push(`${label} tidak ditemukan di PDF — silakan isi manual.`);
		}
	}
	if (sessionCount === 0) {
		warnings.push('Rencana pertemuan mingguan tidak terbaca — tambahkan sesi secara manual.');
	}
	return warnings;
}
