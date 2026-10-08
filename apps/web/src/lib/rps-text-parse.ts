/**
 * Client-side, pure text normalizers for the per-section "Impor teks" controls
 * in the full-page RPS editor. These mirror the heuristic logic in
 * `rps-parser.server.ts` but carry no server-only imports, so the lecturer can
 * paste a single section's content (CPL list, weekly schedule, assessment
 * table, …) and have it mapped into structured fields without uploading a PDF.
 *
 * Never invents data: anything that cannot be recognized is left empty and
 * surfaced as a warning so the lecturer can fill it in manually.
 */
import type { RpsDraft, DraftItem, DraftCpmk, DraftAssessment, DraftSession, DraftCollab } from '@/lib/rps-draft';

export type SectionPatch = Partial<
	Pick<
		RpsDraft,
		| 'title'
		| 'code'
		| 'semester'
		| 'academicYear'
		| 'credits'
		| 'prerequisites'
		| 'courseGroup'
		| 'lecturerName'
		| 'reviewerName'
		| 'approverName'
		| 'demonstrableOutcomes'
		| 'learningSteps'
		| 'workloadIdealHours'
		| 'workloadSksMatch'
		| 'publishedAt'
		| 'description'
		| 'syllabus'
		| 'strategies'
		| 'references'
		| 'workload'
		| 'workloadLecture'
		| 'workloadTutorial'
		| 'workloadPractice'
		| 'workloadIndependent'
		| 'workloadTotal'
		| 'assessmentNotes'
		| 'cplItems'
		| 'cpmkItems'
		| 'topicItems'
		| 'assessmentItems'
		| 'sessions'
		| 'collaborativeTasks'
	>
>;

export type SectionParseResult = {
	patch: SectionPatch;
	warnings: string[];
	summary: string[];
};

const cleanLine = (value: string): string =>
	value
		.replace(/\s+/g, ' ')
		.replace(/^[\s:\-–|.]+/, '')
		.replace(/[\s:.]+$/, '')
		.trim();

const cleanBlock = (value: string): string =>
	value
		.split(/\r?\n/)
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter((line) => line.length > 0)
		.join('\n')
		.trim();

const clampWeek = (raw: string | number): number =>
	Math.min(Math.max(Math.trunc(Number(raw)) || 1, 1), 16);

/** Split a free-text block into ordered items (numbered / lettered / bulleted). */
export function splitItems(body: string): DraftItem[] {
	if (!body) return [];
	const lines = body.split(/\r?\n/);
	const items: DraftItem[] = [];
	let current: DraftItem | null = null;
	const itemRe =
		/^\s*(?:([A-Za-z]{1,8}[\-.\s]?\d+[A-Za-z0-9]*)|(\d{1,2}[.)])|([a-zA-Z][.)])|([•\u2022\-*]))\s+(.*)$/;
	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;
		const m = line.match(itemRe);
		if (m) {
			if (current) items.push(current);
			const code = (m[1] || m[2] || m[3] || '').replace(/[.)]\s*$/, '').trim();
			current = { code, description: (m[5] || '').trim() };
		} else if (current) {
			current.description += ` ${line}`;
		}
	}
	if (current) items.push(current);
	return items.filter((it) => it.description.length > 0).slice(0, 60);
}

/** Lift a trailing "20%" weight out of each assessment item. */
export function splitAssessments(body: string): DraftAssessment[] {
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

/** Split a CPMK block into CPMK items with nested Sub-CPMK. */
export function splitCpmk(body: string): DraftCpmk[] {
	if (!body) return [];
	const lines = body.split(/\r?\n/);
	const items: DraftCpmk[] = [];
	let current: DraftCpmk | null = null;
	const cpmkRe =
		/^\s*(?:([A-Za-z]{0,8}[\-.\s]?CPMK[\-.\s]?\d+[A-Za-z0-9]*)|(\d{1,2}[.)]))\s+(.*)$/i;
	const subRe = /^\s+(?:([a-zA-Z][.)])|([•\u2022\-*]))\s+(.*)$/;
	for (const raw of lines) {
		if (!raw.trim()) continue;
		const cpmkMatch = raw.match(cpmkRe);
		const subMatch = raw.match(subRe);
		if (cpmkMatch && !subMatch) {
			if (current) items.push(current);
			const code = (cpmkMatch[1] || cpmkMatch[2] || '').replace(/[.)]\s*$/, '').trim();
			current = { code, description: (cpmkMatch[3] || '').trim(), cplCode: '', subCpmk: [] };
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
	if (current) items.push(current);
	return items.filter((it) => it.description.length > 0).slice(0, 40);
}

/** Parse weekly pertemuan/minggu entries into session rows. */
export function extractSessions(text: string): DraftSession[] {
	const lines = text.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').split('\n');
	const sessions: DraftSession[] = [];
	let current: DraftSession | null = null;
	const push = () => {
		if (current) {
			current.title = current.title.trim();
			current.topic = current.topic.trim();
			sessions.push(current);
		}
		current = null;
	};
	const explicitRe = /(?:pertemuan\s*(?:ke\-?\s*)?|minggu\s*)(\d{1,2})/i;
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
			if (!current.title) current.title = line;
			else if (!current.topic) current.topic = line;
			else if (line.length < 240) current.topic += `\n${line}`;
		}
	}
	push();
	const seen = new Set<number>();
	const unique = sessions.filter((s) => {
		if (seen.has(s.week)) return false;
		seen.add(s.week);
		return true;
	});
	// Detect special academic weeks (UTS/UAS) from the session text so they are
	// treated separately from normal teaching weeks without manual editing.
	for (const s of unique) {
		const hay = `${s.title} ${s.topic}`.toUpperCase();
		if (/\bUAS\b|\bUJIAN\s+AKIH?L\b/.test(hay)) s.specialWeekType = 'uas';
		else if (/\bUTS\b|\bUJIAN\s+TENGAH\b/.test(hay)) s.specialWeekType = 'uts';
		else s.specialWeekType = 'normal';
	}
	return unique.slice(0, 16);
}

export function deriveSessionsFromTopics(topics: DraftItem[]): DraftSession[] {
	if (topics.length < 3 || topics.length > 16) return [];
	return topics.slice(0, 16).map((topic, i) => ({
		week: i + 1,
		title: topic.description.trim() || `Pertemuan ${i + 1}`,
		topic: topic.description.trim(),
	}));
}

const scanLine = (lines: string[], patterns: RegExp[]): string => {
	for (const pattern of patterns) {
		for (const line of lines) {
			const match = line.match(pattern);
			if (!match) continue;
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
};

const parseNum = (raw: string): number | null => {
	if (!raw) return null;
	const n = Number(raw.replace(/[^\d.,]/g, '').replace(',', '.'));
	return Number.isNaN(n) || n < 0 ? null : n;
};

/** Step 1 — Identitas: pull identity scalars from pasted header text. */
export function parseIdentitySection(text: string): SectionParseResult {
	const lines = text.split(/\r?\n/);
	const patch: SectionPatch = {};
	const warnings: string[] = [];
	const summary: string[] = [];

	const title = scanLine(lines, [/nama\s*mata\s*kuliah\s*[:\-]?\s*(.+)/i, /mata\s*kuliah\s*[:\-]\s*(.+)/i]);
	if (title) {
		patch.title = title;
		summary.push(`Nama: ${title}`);
	}
	const code = scanLine(lines, [
		/kode\s*(mata\s*kuliah)?\s*[:\-]?\s*([A-Za-z]{2,}\s?[0-9]{2,}[A-Za-z0-9 ]*)/i,
		/kode\s*[:\-]\s*(.+)/i,
	]);
	if (code) {
		patch.code = code;
		summary.push(`Kode: ${code}`);
	}
	const semester = scanLine(lines, [/semester\s*[:\-]?\s*(ganjil|genap|[ivxlc]+|\d{1,2})/i, /semester\s*[:\-]\s*(.+)/i]);
	if (semester) {
		patch.semester = semester;
		summary.push(`Semester: ${semester}`);
	}
	const academicYear = scanLine(lines, [/tahun\s*(akademik|ajaran)\s*[:\-]?\s*(.+)/i]);
	if (academicYear) {
		patch.academicYear = academicYear;
		summary.push(`Tahun: ${academicYear}`);
	}
	const credits = parseNum(scanLine(lines, [/\bsks\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i, /kredit\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i]));
	if (credits != null) {
		patch.credits = credits;
		summary.push(`SKS: ${credits}`);
	}
	const lecturer = scanLine(lines, [/dosen\s*(pengampu)?\s*[:\-]\s*(.+)/i, /pengampu\s*[:\-]\s*(.+)/i]);
	if (lecturer) {
		patch.lecturerName = lecturer;
		summary.push(`Dosen: ${lecturer}`);
	}
	const prerequisites = scanLine(lines, [/prasyarat\s*[:\-]\s*(.+)/i, /prerequisite\s*[:\-]\s*(.+)/i]);
	if (prerequisites) patch.prerequisites = prerequisites;
	const group = scanLine(lines, [/kelompok\s*(mata\s*kuliah)?\s*[:\-]\s*(.+)/i, /rumpun\s*[:\-]\s*(.+)/i]);
	if (group) patch.courseGroup = group;
	const published = scanLine(lines, [/tanggal\s*(penetapan|publikasi)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i]);
	if (published) {
		const iso = normalizeDate(published);
		if (iso) {
			patch.publishedAt = iso;
			summary.push(`Penetapan: ${iso}`);
		}
	}

	if (summary.length === 0) {
		warnings.push('Tidak ada field identitas yang dikenali. Pastikan setiap baris memakai label seperti "Nama Mata Kuliah:" atau "Kode:".');
	}
	return { patch, warnings, summary };
};

function normalizeDate(raw: string): string | null {
	const m = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
	if (m) {
		const [, d, mo, y] = m;
		const year = y.length === 2 ? `20${y}` : y;
		return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
	}
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	return null;
}

type SectionField =
	| 'description'
	| 'cpl'
	| 'cpmk'
	| 'syllabus'
	| 'strategies'
	| 'assessments'
	| 'workload'
	| 'references';

const SECTION_DEFS: { field: SectionField; patterns: RegExp[] }[] = [
	{ field: 'description', patterns: [/deskripsi\s*(mata\s*kuliah)?/i] },
	{ field: 'cpl', patterns: [/capaian\s*pembelajaran\s*lulusan/i, /\bcpl\b/i] },
	{ field: 'cpmk', patterns: [/capaian\s*pembelajaran\s*mata\s*kuliah/i, /\bcpmk\b/i, /sub\s*-?\s*cpmk/i] },
	{ field: 'syllabus', patterns: [/silabus/i, /garis\s*besar/i, /materi\s*perkuliahan/i, /materi\s*kuliah/i] },
	{ field: 'strategies', patterns: [/strategi\s*pembelajaran/i, /metode\s*pembelajaran/i, /metode\s*pengajaran/i] },
	{ field: 'assessments', patterns: [/komponen\s*penilaian/i, /bobot\s*penilaian/i, /asesmen/i, /evaluasi/i] },
	{ field: 'workload', patterns: [/beban\s*kerja/i, /workload/i] },
	{ field: 'references', patterns: [/daftar\s*pustaka/i, /referensi/i, /bahan\s*ajar/i] },
];

function extractSections(lines: string[]): Partial<Record<SectionField, string>> {
	const marks: { field: SectionField; line: number; pattern: RegExp }[] = [];
	lines.forEach((line, i) => {
		for (const def of SECTION_DEFS) {
			if (marks.some((m) => m.field === def.field)) continue;
			for (const pattern of def.patterns) {
				if (pattern.test(line)) {
					marks.push({ field: def.field, line: i, pattern });
					break;
				}
			}
		}
	});
	marks.sort((a, b) => a.line - b.line);
	const out: Partial<Record<SectionField, string>> = {};
	marks.forEach((mark, idx) => {
		const end = idx + 1 < marks.length ? marks[idx + 1].line : lines.length;
		const headerRemainder = lines[mark.line].replace(mark.pattern, '').trim();
		const body = [headerRemainder, ...lines.slice(mark.line + 1, end)].join('\n');
		const cleaned = cleanBlock(body);
		if (cleaned) out[mark.field] = cleaned;
	});
	return out;
}

/** Step 2 — Deskripsi & Capaian: split pasted text into CPL/CPMK/topics + prose. */
export function parseOutcomesSection(text: string): SectionParseResult {
	const lines = text.replace(/\r\n/g, '\n').split('\n');
	const sections = extractSections(lines);
	const patch: SectionPatch = {};
	const warnings: string[] = [];
	const summary: string[] = [];

	if (sections.description) {
		patch.description = sections.description;
		summary.push('Deskripsi');
	}
	if (sections.syllabus) {
		patch.syllabus = sections.syllabus;
		summary.push('Silabus');
	}
	if (sections.strategies) {
		patch.strategies = sections.strategies;
		summary.push('Strategi');
	}
	if (sections.references) {
		patch.references = sections.references;
		summary.push('Referensi');
	}
	const cplItems = splitItems(sections.cpl || '');
	if (cplItems.length) {
		patch.cplItems = cplItems;
		summary.push(`${cplItems.length} CPL`);
	}
	const cpmkItems = splitCpmk(sections.cpmk || '');
	if (cpmkItems.length) {
		patch.cpmkItems = cpmkItems;
		const subCount = cpmkItems.reduce((n, c) => n + c.subCpmk.length, 0);
		summary.push(`${cpmkItems.length} CPMK${subCount ? ` / ${subCount} Sub` : ''}`);
	}
	const topicItems = splitItems(sections.syllabus || '');
	if (topicItems.length && !cpmkItems.length) {
		patch.topicItems = topicItems;
		summary.push(`${topicItems.length} topik`);
	}

	// No section headers found: treat the whole paste as a CPL/CPMK list heuristically.
	if (summary.length === 0) {
		const items = splitItems(text);
		if (items.length) {
			patch.cplItems = items;
			summary.push(`${items.length} item (sebagai CPL)`);
			warnings.push('Tidak ada judul bagian (CPL/CPMK/Silabus) yang dikenali — item dipetakan sebagai CPL. Tambahkan label bagian untuk hasil lebih akurat.');
		} else {
			warnings.push('Teks tidak dikenali sebagai daftar CPL/CPMK. Gunakan penomoran atau bullet, atau pisahkan dengan judul bagian seperti "CPL:", "CPMK:".');
		}
	}
	return { patch, warnings, summary };
}

/** Step 3 — Rencana Pembelajaran: parse a weekly schedule into sessions. */
export function parsePlanSection(text: string): SectionParseResult {
	const sessions = extractSessions(text);
	const warnings: string[] = [];
	const summary: string[] = [];
	if (sessions.length === 0) {
		const topics = splitItems(text);
		const derived = deriveSessionsFromTopics(topics);
		if (derived.length) {
			warnings.push('Pertemuan mingguan tidak dikenali — sesi diturunkan dari daftar topik. Periksa urutan minggu dan judul.');
			return { patch: { sessions: derived }, warnings, summary: [`${derived.length} sesi (dari topik)`] };
		}
		warnings.push('Tidak ada jadwal pertemuan mingguan yang dikenali. Gunakan penanda "Pertemuan ke-1" / "Minggu 1" atau baris bernomor 1–16.');
		return { patch: {}, warnings, summary };
	}
	summary.push(`${sessions.length} sesi`);
	return { patch: { sessions }, warnings, summary };
}

/** Step 4 — Workload: pull hour allocations + notes from pasted text. */
export function parseWorkloadSection(text: string): SectionParseResult {
	const patch: SectionPatch = {};
	const warnings: string[] = [];
	const summary: string[] = [];
	const lines = text.split(/\r?\n/);
	const pick = (patterns: RegExp[]): number | null => {
		for (const p of patterns) {
			for (const line of lines) {
				const m = line.match(p);
				if (m) return parseNum(m[1]);
			}
		}
		return null;
	};
	const lecture = pick([/kuliah\s*[:\-]?\s*(\d+)/i, /teori\s*[:\-]?\s*(\d+)/i]);
	const tutorial = pick([/tutorial\s*[:\-]?\s*(\d+)/i]);
	const practice = pick([/praktik\s*[:\-]?\s*(\d+)/i, /praktikum\s*[:\-]?\s*(\d+)/i, /responsi\s*[:\-]?\s*(\d+)/i]);
	const independent = pick([/mandiri\s*[:\-]?\s*(\d+)/i, /belajar\s*mandiri\s*[:\-]?\s*(\d+)/i]);
	const total = pick([/total\s*[:\-]?\s*(\d+)/i]);
	if (lecture != null) { patch.workloadLecture = lecture; summary.push(`Kuliah ${lecture}`); }
	if (tutorial != null) { patch.workloadTutorial = tutorial; summary.push(`Tutorial ${tutorial}`); }
	if (practice != null) { patch.workloadPractice = practice; summary.push(`Praktik ${practice}`); }
	if (independent != null) { patch.workloadIndependent = independent; summary.push(`Mandiri ${independent}`); }
	if (total != null) { patch.workloadTotal = total; summary.push(`Total ${total}`); }
	patch.workload = cleanBlock(text);
	if (summary.length === 0) {
		warnings.push('Alokasi jam tidak dikenali. Gunakan label seperti "Kuliah: 16", "Belajar mandiri: 32", "Total: 48". Teks asli tetap disimpan di catatan beban kerja.');
	} else {
		summary.push('Catatan beban kerja disimpan');
	}
	return { patch, warnings, summary };
}

/** Step 5 — Penilaian: parse assessment components + notes. */
export function parseAssessmentSection(text: string): SectionParseResult {
	const items = splitAssessments(text);
	const warnings: string[] = [];
	const summary: string[] = [];
	const patch: SectionPatch = { assessmentNotes: cleanBlock(text) };
	if (items.length) {
		patch.assessmentItems = items;
		const withWeight = items.filter((i) => i.weight != null).length;
		summary.push(`${items.length} komponen${withWeight ? ` (${withWeight} berbobot)` : ''}`);
	} else {
		warnings.push('Tidak ada komponen penilaian yang dikenali. Gunakan penomoran/bullet dan sertakan bobot seperti "UTS 30%" bila ada. Teks asli disimpan di catatan penilaian.');
	}
	return { patch, warnings, summary };
}

/** Step 6 — Tugas Kolaboratif: split pasted text into collaborative tasks. */
export function parseCollabSection(text: string): SectionParseResult {
	const lines = text.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
	const warnings: string[] = [];
	const summary: string[] = [];
	const tasks: DraftCollab[] = [];
	const itemRe = /^\s*(?:(\d{1,2}[.)])|([a-zA-Z][.)])|([•\u2022\-*]))\s+(.*)$/;
	let current: DraftCollab | null = null;
	const push = () => {
		if (current && (current.title || current.description)) tasks.push(current);
		current = null;
	};
	for (const line of lines) {
		const m = line.match(itemRe);
		if (m) {
			push();
			const body = (m[4] || '').trim();
			current = { title: body.slice(0, 80), description: body, objectives: '', schedule: '', groupInfo: '' };
		} else if (current) {
			current.description += `\n${line}`;
		} else {
			current = { title: line.slice(0, 80), description: line, objectives: '', schedule: '', groupInfo: '' };
		}
	}
	push();
	const patch: SectionPatch = tasks.length ? { collaborativeTasks: tasks.slice(0, 20) } : {};
	if (tasks.length) {
		summary.push(`${tasks.length} tugas`);
	} else {
		warnings.push('Tidak ada tugas yang dikenali. Pisahkan setiap tugas dengan penomoran atau bullet.');
	}
	return { patch, warnings, summary };
}

export type SectionParser = (text: string) => SectionParseResult;

export const SECTION_PARSERS: Record<number, SectionParser> = {
	1: parseIdentitySection,
	2: parseOutcomesSection,
	3: parsePlanSection,
	4: parseWorkloadSection,
	5: parseAssessmentSection,
	6: parseCollabSection,
};

const ARRAY_KEYS: (keyof SectionPatch)[] = [
	'cplItems',
	'cpmkItems',
	'topicItems',
	'assessmentItems',
	'sessions',
	'collaborativeTasks',
];

const itemKey = (item: { code: string; description: string }) =>
	(item.code || item.description || '').trim().toLowerCase();

/** Merge a parsed patch into the current draft. Arrays append + dedupe; scalars
 *  fill only empty fields. Used when the user does NOT tick "Ganti". */
export function mergePatch(draft: RpsDraft, patch: SectionPatch): RpsDraft {
	const next = { ...draft };
	for (const [key, value] of Object.entries(patch) as [keyof SectionPatch, unknown][]) {
		if (value == null) continue;
		if (ARRAY_KEYS.includes(key) && Array.isArray(value)) {
			const existing = (next[key as keyof RpsDraft] as unknown[]) ?? [];
			const seen = new Set(
				existing.map((it) => itemKey(it as { code: string; description: string })),
			);
			const merged = [...existing];
			for (const item of value) {
				const k = itemKey(item as { code: string; description: string });
				if (k && seen.has(k)) continue;
				seen.add(k);
				merged.push(item);
			}
			(next as Record<string, unknown>)[key] = merged;
		} else if (typeof value === 'string') {
			const cur = next[key as keyof RpsDraft] as string;
			if (!cur || !cur.trim()) (next as Record<string, unknown>)[key] = value;
		} else if (typeof value === 'number') {
			const cur = next[key as keyof RpsDraft] as number | null;
			if (cur == null) (next as Record<string, unknown>)[key] = value;
		}
	}
	return next;
}

/** Replace the section's fields with the parsed patch. Arrays overwrite when the
 *  patch provides them; scalars overwrite when the patch is non-empty. */
export function replacePatch(draft: RpsDraft, patch: SectionPatch): RpsDraft {
	const next = { ...draft };
	for (const [key, value] of Object.entries(patch) as [keyof SectionPatch, unknown][]) {
		if (value == null) continue;
		if (ARRAY_KEYS.includes(key) && Array.isArray(value)) {
			if (value.length) (next as Record<string, unknown>)[key] = value;
		} else if (typeof value === 'string') {
			if (value.trim()) (next as Record<string, unknown>)[key] = value;
		} else if (typeof value === 'number') {
			(next as Record<string, unknown>)[key] = value;
		}
	}
	return next;
}
