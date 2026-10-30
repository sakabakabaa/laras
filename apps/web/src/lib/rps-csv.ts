/**
 * CSV support for the per-section "Impor teks" controls in the full-page RPS
 * editor. Each editable step ships:
 *
 *  - a downloadable example CSV template (clearly marked sample content, never
 *    real course data) with the expected headers and a couple of sample rows;
 *  - a tolerant CSV parser that normalizes the pasted/uploaded CSV into the same
 *    `SectionPatch` shape the free-text parsers produce, so merge/replace and
 *    the editable review step work unchanged.
 *
 * The parser never invents data: unrecognized columns/values are surfaced as
 * Indonesian warnings and skipped, so the lecturer can fix the file and re-map.
 */
import type {
	DraftAssessment,
	DraftCollab,
	DraftCpmk,
	DraftItem,
	DraftSession,
} from '@/lib/rps-draft';
import type { SectionPatch, SectionParseResult } from '@/lib/rps-text-parse';

export type CsvRow = string[];

/** Minimal RFC-4180-ish CSV parser: handles quoted fields, doubled quotes,
 *  embedded commas and newlines. Returns rows with at least one non-empty cell. */
export function parseCsv(text: string): CsvRow[] {
	const t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const rows: CsvRow[] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	let i = 0;
	while (i < t.length) {
		const ch = t[i];
		if (inQuotes) {
			if (ch === '"') {
				if (t[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i += 1;
				continue;
			}
			field += ch;
			i += 1;
			continue;
		}
		if (ch === '"') {
			inQuotes = true;
			i += 1;
			continue;
		}
		if (ch === ',') {
			row.push(field);
			field = '';
			i += 1;
			continue;
		}
		if (ch === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			i += 1;
			continue;
		}
		field += ch;
		i += 1;
	}
	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function headerMap(header: CsvRow): Map<string, number> {
	const m = new Map<string, number>();
	header.forEach((h, idx) => {
		const key = h.trim().toLowerCase();
		if (!m.has(key)) m.set(key, idx);
	});
	return m;
}

const splitCodes = (v: string): string[] =>
	v ? v.split(/[;|,]/).map((c) => c.trim()).filter(Boolean) : [];

/** Example CSV templates for each editable RPS step. Content is clearly marked
 *  sample data — never real course records. */
export const CSV_TEMPLATES: Record<
	number,
	{ filename: string; hint: string; content: string }
> = {
	1: {
		filename: 'contoh-identitas-rps.csv',
		hint: 'Header wajib: field,value. Label yang dikenali pada kolom field: Nama Mata Kuliah, Kode, SKS, Semester, Tahun Akademik, Kelompok MK, Dosen Pengampu, Prasyarat, Tanggal Penetapan. Tanggal pakai format YYYY-MM-DD. Kosongkan nilai bila tidak relevan.',
		content:
			'field,value\n' +
			'Nama Mata Kuliah,Contoh Mata Kuliah\n' +
			'Kode,XXX000\n' +
			'SKS,3\n' +
			'Semester,Ganjil\n' +
			'Tahun Akademik,2025/2026\n' +
			'Kelompok MK,MK Wajib\n' +
			'Dosen Pengampu,Nama Dosen Contoh\n' +
			'Prasyarat,\n' +
			'Tanggal Penetapan,2025-09-01\n',
	},
	2: {
		filename: 'contoh-capaian-rps.csv',
		hint: 'Header wajib: tipe,kode,kode_induk,deskripsi. Kolom tipe bernilai CPL, CPMK, SUB-CPMK, atau TOPIK. kode_induk diisi kode CPL untuk CPMK, kode CPMK untuk SUB-CPMK, dan dikosongkan untuk CPL/TOPIK. Letakkan CPMK sebelum Sub-CPMK miliknya agar relasi terbentuk.',
		content:
			'tipe,kode,kode_induk,deskripsi\n' +
			'CPL,CPL-1,,Contoh capaian pembelajaran lulusan pertama\n' +
			'CPL,CPL-2,,Contoh capaian pembelajaran lulusan kedua\n' +
			'CPMK,CPMK-1,CPL-1,Contoh capaian pembelajaran mata kuliah\n' +
			'SUB-CPMK,Sub-CPMK-1.1,CPMK-1,Contoh sub capaian pembelajaran\n' +
			'TOPIK,T1,,Contoh topik materi pertama\n',
	},
	3: {
		filename: 'contoh-pertemuan-rps.csv',
		hint: 'Header wajib: minggu,judul. Kolom opsional: tipe_minggu (normal/uts/uas/khusus), topik, indikator, materi, metode_sinkron, metode_asinkron, penilaian_metode, bobot_penilaian, durasi, referensi, akses, tujuan, kegiatan, penilaian, kode_cpl, kode_cpmk, kode_sub, kode_topik, kode_penilaian. Pisahkan beberapa kode dengan koma atau titik koma. Minggu 1-16.',
		content:
			'minggu,judul,tipe_minggu,topik,indikator,materi,metode_sinkron,metode_asinkron,penilaian_metode,bobot_penilaian,durasi,referensi,akses,kode_cpl,kode_cpmk,kode_sub,kode_topik,kode_penilaian\n' +
			'1,Contoh Pengenalan,normal,Kontrak belajar,Memahami kontrak perkuliahan,Kontrak & silabus,Kuliah tatap muka,Diskusi LMS,Kehadiran,,100 menit,Bab 1,2025-09-01T08:00,CPL-1,CPMK-1,Sub-CPMK-1.1,T1,Tugas\n' +
			'8,UTS,uts,Ujian Tengah Semester,,,,,,100,120 menit,,,CPL-1,CPMK-1,,,\n' +
			'16,UAS,uas,Ujian Akhir Semester,,,,,,100,120 menit,,,CPL-1,CPMK-1,,,\n',
	},
	4: {
		filename: 'contoh-beban-kerja-rps.csv',
		hint: 'Header wajib: komponen,jam. Kolom opsional: catatan. Komponen yang dikenali: Kuliah, Tutorial, Praktik/Praktikum/Responsi, Belajar mandiri, Total. Isi kolom catatan untuk mengisi catatan beban kerja mahasiswa.',
		content:
			'komponen,jam,catatan\n' +
			'Kuliah,16,Contoh beban kerja mahasiswa per semester\n' +
			'Tutorial,0,\n' +
			'Praktik,0,\n' +
			'Belajar mandiri,32,\n' +
			'Total,48,\n',
	},
	5: {
		filename: 'contoh-penilaian-rps.csv',
		hint: 'Header wajib: deskripsi. Kolom opsional: kode dan bobot (angka 0-100, boleh disertai tanda %).',
		content:
			'kode,deskripsi,bobot\n' +
			'UTS,Contoh ujian tengah semester,30\n' +
			'UAS,Contoh ujian akhir semester,40\n' +
			'Tugas,Contoh tugas harian,30\n',
	},
	6: {
		filename: 'contoh-tugas-kolaboratif-rps.csv',
		hint: 'Header wajib: judul. Kolom opsional: deskripsi,tujuan,jadwal,info_kelompok,kode_cpl,kode_cpmk,kode_sub,kode_penilaian. Pisahkan beberapa kode dengan koma atau titik koma.',
		content:
			'judul,deskripsi,tujuan,jadwal,info_kelompok,kode_cpl,kode_cpmk,kode_sub,kode_penilaian\n' +
			'Contoh Proyek Mini,Mahasiswa membuat poster per kelompok,Melatih kerja sama tim,Minggu 5-8,Kelompok 4-5 orang,CPL-1,CPMK-1,Sub-CPMK-1.1,Tugas\n' +
			'Contoh Presentasi,Presentasi hasil kelompok di kelas,Melatih komunikasi,Minggu 10,Kelompok 4-5 orang,CPL-1,CPMK-1,,UTS\n',
	},
};

/** Trigger a client-side download of the example CSV for a step. No-op on the
 *  server (SSR) where `document` is undefined. */
export function downloadCsvTemplate(step: number) {
	const tpl = CSV_TEMPLATES[step];
	if (!tpl || typeof document === 'undefined') return;
	const blob = new Blob(['\uFEFF' + tpl.content], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = tpl.filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

function parseIdentityCsv(text: string): SectionParseResult {
	const rows = parseCsv(text);
	const warnings: string[] = [];
	const summary: string[] = [];
	const patch: SectionPatch = {};
	if (rows.length < 2) {
		return {
			patch,
			warnings: ['CSV identitas butuh baris header "field,value" dan minimal satu baris data.'],
			summary,
		};
	}
	const header = headerMap(rows[0]);
	if (!header.has('field') || !header.has('value')) {
		return {
			patch,
			warnings: ['Header CSV identitas harus berisi kolom "field" dan "value".'],
			summary,
		};
	}
	const fi = header.get('field')!;
	const vi = header.get('value')!;
	const map: Record<string, keyof SectionPatch> = {
		'nama mata kuliah': 'title',
		'kode': 'code',
		'sks': 'credits',
		'semester': 'semester',
		'tahun akademik': 'academicYear',
		'kelompok mk': 'courseGroup',
		'dosen pengampu': 'lecturerName',
		'prasyarat': 'prerequisites',
		'tanggal penetapan': 'publishedAt',
	};
	let recognized = 0;
	for (const row of rows.slice(1)) {
		const label = (row[fi] || '').trim();
		const field = label.toLowerCase();
		const value = (row[vi] || '').trim();
		if (!field) continue;
		const key = map[field];
		if (!key) {
			warnings.push(
				`Baris "${label}" tidak dikenali — diabaikan. Gunakan label seperti Nama Mata Kuliah, Kode, SKS, Semester, dst.`,
			);
			continue;
		}
		if (!value) {
			warnings.push(`Nilai untuk "${label}" kosong — diabaikan.`);
			continue;
		}
		if (key === 'credits') {
			const n = Number(value.replace(',', '.'));
			if (Number.isNaN(n) || n < 0) {
				warnings.push(`SKS "${value}" bukan angka yang valid — diabaikan.`);
				continue;
			}
			patch.credits = n;
		} else {
			(patch as Record<string, unknown>)[key] = value;
		}
		recognized += 1;
		summary.push(`${label}: ${value}`);
	}
	if (recognized === 0) warnings.push('Tidak ada baris identitas yang dikenali.');
	return { patch, warnings, summary };
}

function parseOutcomesCsv(text: string): SectionParseResult {
	const rows = parseCsv(text);
	const warnings: string[] = [];
	const summary: string[] = [];
	const patch: SectionPatch = {};
	if (rows.length < 2) {
		return {
			patch,
			warnings: [
				'CSV capaian butuh baris header "tipe,kode,kode_induk,deskripsi" dan minimal satu baris data.',
			],
			summary,
		};
	}
	const header = headerMap(rows[0]);
	const missing = ['tipe', 'kode', 'deskripsi'].filter((h) => !header.has(h));
	if (missing.length) {
		return {
			patch,
			warnings: [
				`Header CSV capaian kurang kolom: ${missing.join(', ')}. Header yang diharapkan: tipe,kode,kode_induk,deskripsi.`,
			],
			summary,
		};
	}
	const ti = header.get('tipe')!;
	const ki = header.get('kode')!;
	const ii = header.get('kode_induk') ?? -1;
	const di = header.get('deskripsi')!;
	const cplItems: DraftItem[] = [];
	const cpmkItems: DraftCpmk[] = [];
	const topicItems: DraftItem[] = [];
	const cpmkByCode = new Map<string, DraftCpmk>();
	for (const row of rows.slice(1)) {
		const tipe = (row[ti] || '').trim().toUpperCase().replace(/\s+/g, '-');
		const kode = (row[ki] || '').trim();
		const induk = ii >= 0 ? (row[ii] || '').trim() : '';
		const desk = (row[di] || '').trim();
		if (!tipe) {
			warnings.push('Baris tanpa kolom "tipe" diabaikan.');
			continue;
		}
		if (!desk) {
			warnings.push(`Baris ${tipe} "${kode}" tanpa deskripsi diabaikan.`);
			continue;
		}
		if (tipe === 'CPL') {
			cplItems.push({ code: kode, description: desk });
		} else if (tipe === 'CPMK') {
			const c: DraftCpmk = { code: kode, description: desk, cplCode: induk, subCpmk: [] };
			cpmkItems.push(c);
			if (kode) cpmkByCode.set(kode.toLowerCase(), c);
		} else if (tipe === 'SUB-CPMK') {
			const parent = induk ? cpmkByCode.get(induk.toLowerCase()) : undefined;
			if (!parent) {
				warnings.push(
					`Sub-CPMK "${kode}" merujuk CPMK "${induk}" yang belum ada di CSV — diabaikan. Pastikan CPMK ditulis sebelum Sub-CPMK-nya.`,
				);
				continue;
			}
			parent.subCpmk.push({ code: kode, description: desk });
		} else if (tipe === 'TOPIK') {
			topicItems.push({ code: kode, description: desk });
		} else {
			warnings.push(`Tipe "${tipe}" tidak dikenali — gunakan CPL, CPMK, SUB-CPMK, atau TOPIK.`);
		}
	}
	if (cplItems.length) {
		patch.cplItems = cplItems;
		summary.push(`${cplItems.length} CPL`);
	}
	if (cpmkItems.length) {
		patch.cpmkItems = cpmkItems;
		const sub = cpmkItems.reduce((n, c) => n + c.subCpmk.length, 0);
		summary.push(`${cpmkItems.length} CPMK${sub ? ` / ${sub} Sub` : ''}`);
	}
	if (topicItems.length) {
		patch.topicItems = topicItems;
		summary.push(`${topicItems.length} topik`);
	}
	if (summary.length === 0) warnings.push('Tidak ada baris CPL/CPMK/Sub-CPMK/Topik yang valid.');
	return { patch, warnings, summary };
}

function parseSessionsCsv(text: string): SectionParseResult {
	const rows = parseCsv(text);
	const warnings: string[] = [];
	const summary: string[] = [];
	const patch: SectionPatch = {};
	if (rows.length < 2) {
		return {
			patch,
			warnings: ['CSV pertemuan butuh baris header dan minimal satu baris data.'],
			summary,
		};
	}
	const header = headerMap(rows[0]);
	if (!header.has('minggu') || !header.has('judul')) {
		return {
			patch,
			warnings: ['Header CSV pertemuan harus berisi kolom "minggu" dan "judul".'],
			summary,
		};
	}
	const get = (name: string, row: CsvRow): string => {
		const idx = header.get(name);
		return idx == null ? '' : (row[idx] || '').trim();
	};
	const sessions: DraftSession[] = [];
	const seen = new Set<number>();
	const validWeekTypes = new Set(['normal', 'uts', 'uas', 'khusus']);
	for (const row of rows.slice(1)) {
		const weekRaw = get('minggu', row);
		const week = Math.min(Math.max(Math.trunc(Number(weekRaw)) || 1, 1), 16);
		const title = get('judul', row);
		const topic = get('topik', row);
		if (!title && !topic) {
			warnings.push(`Baris minggu ${weekRaw || '?'} tanpa judul/topik diabaikan.`);
			continue;
		}
		if (seen.has(week)) {
			warnings.push(`Minggu ${week} muncul lebih dari sekali — hanya baris pertama yang dipakai.`);
			continue;
		}
		seen.add(week);
		const rawType = get('tipe_minggu', row).toLowerCase();
		const specialWeekType = validWeekTypes.has(rawType) ? (rawType as DraftSession['specialWeekType']) : 'normal';
		if (rawType && !validWeekTypes.has(rawType)) {
			warnings.push(`Tipe minggu "${rawType}" tidak dikenali (pakai normal/uts/uas/khusus) — diatur ke normal.`);
		}
		const weightRaw = get('bobot_penilaian', row).replace('%', '').replace(',', '.');
		let assessmentWeight: number | null = null;
		if (weightRaw) {
			const w = Number(weightRaw);
			if (!Number.isNaN(w) && w >= 0 && w <= 100) assessmentWeight = w;
			else warnings.push(`Bobot penilaian "${weightRaw}" tidak valid (0-100) pada minggu ${week} — diabaikan.`);
		}
		sessions.push({
			week,
			title: title || `Pertemuan ${week}`,
			topic,
			objectives: get('tujuan', row),
			activities: get('kegiatan', row),
			duration: get('durasi', row),
			assessment: get('penilaian', row),
			references: get('referensi', row),
			cplCodes: splitCodes(get('kode_cpl', row)),
			cpmkCodes: splitCodes(get('kode_cpmk', row)),
			subCpmkCodes: splitCodes(get('kode_sub', row)),
			topicCodes: splitCodes(get('kode_topik', row)),
			assessmentCodes: splitCodes(get('kode_penilaian', row)),
			specialWeekType,
			learningIndicator: get('indikator', row),
			learningMaterial: get('materi', row),
			assessmentMethod: get('penilaian_metode', row),
			assessmentWeight,
			synchronousMethod: get('metode_sinkron', row),
			asynchronousMethod: get('metode_asinkron', row),
			accessDateTime: get('akses', row),
		});
	}
	if (sessions.length) {
		patch.sessions = sessions;
		summary.push(`${sessions.length} sesi`);
	} else {
		warnings.push('Tidak ada sesi pertemuan yang valid.');
	}
	return { patch, warnings, summary };
}

function parseWorkloadCsv(text: string): SectionParseResult {
	const rows = parseCsv(text);
	const warnings: string[] = [];
	const summary: string[] = [];
	const patch: SectionPatch = {};
	if (rows.length < 2) {
		return {
			patch,
			warnings: ['CSV beban kerja butuh baris header "komponen,jam" dan minimal satu baris data.'],
			summary,
		};
	}
	const header = headerMap(rows[0]);
	if (!header.has('komponen') || !header.has('jam')) {
		return {
			patch,
			warnings: ['Header CSV beban kerja harus berisi kolom "komponen" dan "jam".'],
			summary,
		};
	}
	const ci = header.get('komponen')!;
	const ji = header.get('jam')!;
	const ni = header.get('catatan');
	const map: Record<string, keyof SectionPatch> = {
		kuliah: 'workloadLecture',
		teori: 'workloadLecture',
		tutorial: 'workloadTutorial',
		praktik: 'workloadPractice',
		praktikum: 'workloadPractice',
		responsi: 'workloadPractice',
		'belajar mandiri': 'workloadIndependent',
		mandiri: 'workloadIndependent',
		total: 'workloadTotal',
	};
	const notes: string[] = [];
	let recognized = 0;
	for (const row of rows.slice(1)) {
		const label = (row[ci] || '').trim();
		const comp = label.toLowerCase();
		const jamRaw = (row[ji] || '').trim();
		const note = ni != null ? (row[ni] || '').trim() : '';
		if (!comp) continue;
		if (note) notes.push(note);
		if (!jamRaw) {
			warnings.push(`Jam untuk "${label}" kosong — diabaikan.`);
			continue;
		}
		const n = Number(jamRaw.replace(',', '.'));
		if (Number.isNaN(n) || n < 0) {
			warnings.push(`Jam "${jamRaw}" bukan angka yang valid — diabaikan.`);
			continue;
		}
		const key = map[comp];
		if (!key) {
			warnings.push(`Komponen "${label}" tidak dikenali — diabaikan.`);
			continue;
		}
		(patch as Record<string, unknown>)[key] = n;
		recognized += 1;
		summary.push(`${label} ${n}`);
	}
	if (notes.length) {
		patch.workload = notes.join('\n');
		summary.push('Catatan beban kerja');
	}
	if (recognized === 0) warnings.push('Tidak ada komponen beban kerja yang dikenali.');
	return { patch, warnings, summary };
}

function parseAssessmentCsv(text: string): SectionParseResult {
	const rows = parseCsv(text);
	const warnings: string[] = [];
	const summary: string[] = [];
	const patch: SectionPatch = {};
	if (rows.length < 2) {
		return {
			patch,
			warnings: ['CSV penilaian butuh baris header dan minimal satu baris data.'],
			summary,
		};
	}
	const header = headerMap(rows[0]);
	if (!header.has('deskripsi')) {
		return {
			patch,
			warnings: ['Header CSV penilaian harus berisi kolom "deskripsi" (boleh juga "kode" dan "bobot").'],
			summary,
		};
	}
	const ki = header.get('kode');
	const di = header.get('deskripsi')!;
	const wi = header.get('bobot');
	const items: DraftAssessment[] = [];
	for (const row of rows.slice(1)) {
		const desk = (row[di] || '').trim();
		if (!desk) {
			warnings.push('Baris tanpa deskripsi diabaikan.');
			continue;
		}
		const code = ki != null ? (row[ki] || '').trim() : '';
		let weight: number | null = null;
		if (wi != null) {
			const wRaw = (row[wi] || '').trim().replace('%', '').replace(',', '.');
			if (wRaw) {
				const w = Number(wRaw);
				if (Number.isNaN(w) || w < 0 || w > 100) {
					warnings.push(`Bobot "${row[wi]}" tidak valid (0-100) — diabaikan.`);
				} else {
					weight = w;
				}
			}
		}
		items.push({ code, description: desk, weight });
	}
	if (items.length) {
		patch.assessmentItems = items;
		const withW = items.filter((i) => i.weight != null).length;
		summary.push(`${items.length} komponen${withW ? ` (${withW} berbobot)` : ''}`);
	} else {
		warnings.push('Tidak ada komponen penilaian yang valid.');
	}
	return { patch, warnings, summary };
}

function parseCollabCsv(text: string): SectionParseResult {
	const rows = parseCsv(text);
	const warnings: string[] = [];
	const summary: string[] = [];
	const patch: SectionPatch = {};
	if (rows.length < 2) {
		return {
			patch,
			warnings: ['CSV tugas kolaboratif butuh baris header dan minimal satu baris data.'],
			summary,
		};
	}
	const header = headerMap(rows[0]);
	if (!header.has('judul')) {
		return {
			patch,
			warnings: ['Header CSV tugas kolaboratif harus berisi kolom "judul".'],
			summary,
		};
	}
	const get = (name: string, row: CsvRow): string => {
		const idx = header.get(name);
		return idx == null ? '' : (row[idx] || '').trim();
	};
	const tasks: DraftCollab[] = [];
	for (const row of rows.slice(1)) {
		const title = get('judul', row);
		const desc = get('deskripsi', row);
		if (!title && !desc) {
			warnings.push('Baris tanpa judul/deskripsi diabaikan.');
			continue;
		}
		tasks.push({
			title: title || desc.slice(0, 80),
			description: desc,
			objectives: get('tujuan', row),
			schedule: get('jadwal', row),
			groupInfo: get('info_kelompok', row),
			cplCodes: splitCodes(get('kode_cpl', row)),
			cpmkCodes: splitCodes(get('kode_cpmk', row)),
			subCpmkCodes: splitCodes(get('kode_sub', row)),
			assessmentCodes: splitCodes(get('kode_penilaian', row)),
		});
	}
	if (tasks.length) {
		patch.collaborativeTasks = tasks;
		summary.push(`${tasks.length} tugas`);
	} else {
		warnings.push('Tidak ada tugas kolaboratif yang valid.');
	}
	return { patch, warnings, summary };
}

const SECTION_CSV_PARSERS: Record<number, (text: string) => SectionParseResult> = {
	1: parseIdentityCsv,
	2: parseOutcomesCsv,
	3: parseSessionsCsv,
	4: parseWorkloadCsv,
	5: parseAssessmentCsv,
	6: parseCollabCsv,
};

/** Parse a pasted CSV for a given RPS step into the shared `SectionPatch`
 *  shape. Falls back to a generic warning when the step has no CSV parser. */
export function parseSectionCsv(step: number, text: string): SectionParseResult {
	const parser = SECTION_CSV_PARSERS[step];
	if (!parser) {
		return {
			patch: {},
			warnings: ['CSV belum didukung untuk langkah ini.'],
			summary: [],
		};
	}
	return parser(text);
}
