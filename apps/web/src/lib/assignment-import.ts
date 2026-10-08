import type { AssignmentMode, AssignmentStage } from '@/lib/assignments';

/** Fields an import may fill. Empty strings mean "not found" — never invented. */
export type ImportedAssignment = {
	title: string;
	mode: AssignmentMode | '';
	instructions: string;
	requirements: string;
	groupInfo: string;
	/** Raw deadline text from the source, not a guessed date. */
	deadlineRaw: string;
	stages: AssignmentStage[];
	/** Resource titles copied from the source, matched later against real rows. */
	attachmentTitles: string[];
	reviewNotes: string[];
};

const EMPTY: ImportedAssignment = {
	title: '',
	mode: '',
	instructions: '',
	requirements: '',
	groupInfo: '',
	deadlineRaw: '',
	stages: [],
	attachmentTitles: [],
	reviewNotes: [],
};

const HEADER_MAP: Record<string, keyof ImportedAssignment | 'stages' | 'rubric' | 'attachments'> = {
	judul: 'title',
	title: 'title',
	jenis: 'mode',
	mode: 'mode',
	instruksi: 'instructions',
	instructions: 'instructions',
	ketentuan: 'requirements',
	requirements: 'requirements',
	rubrik: 'rubric',
	kelompok: 'groupInfo',
	group: 'groupInfo',
	batas_waktu: 'deadlineRaw',
	deadline: 'deadlineRaw',
	tahapan: 'stages',
	stages: 'stages',
	lampiran: 'attachments',
	attachments: 'attachments',
};

function normKey(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '_')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
}

/** Minimal CSV splitter that keeps quoted commas and newlines. */
function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					cell += '"';
					i++;
				} else quoted = false;
			} else cell += ch;
		} else if (ch === '"') {
			quoted = true;
		} else if (ch === ',') {
			row.push(cell.trim());
			cell = '';
		} else if (ch === '\n') {
			row.push(cell.trim());
			if (row.some(Boolean)) rows.push(row);
			row = [];
			cell = '';
		} else if (ch !== '\r') {
			cell += ch;
		}
	}
	row.push(cell.trim());
	if (row.some(Boolean)) rows.push(row);
	return rows;
}

function modeFrom(value: string): AssignmentMode | '' {
	const v = value.toLowerCase();
	if (/kolaboratif|collaborative|kelompok/.test(v)) return 'collaborative';
	if (/individual/.test(v)) return 'individual';
	return '';
}

function stagesFrom(value: string): AssignmentStage[] {
	return value
		.split(/\s*(?:\||;|\n)\s*/)
		.map((part) => part.replace(/^\d+[\.\)]\s*/, '').trim())
		.filter(Boolean)
		.slice(0, 20)
		.map((label) => ({ label: label.slice(0, 100) }));
}

function fromCsv(text: string): ImportedAssignment | null {
	const rows = parseCsv(text);
	if (rows.length < 2) return null;
	const headers = rows[0].map(normKey);
	if (!headers.some((h) => h in HEADER_MAP)) return null;
	const draft: ImportedAssignment = { ...EMPTY, reviewNotes: [], stages: [], attachmentTitles: [] };
	const notes: string[] = [];
	// One assignment per file: first data row. Extra rows are flagged, not merged.
	if (rows.length > 2) {
		notes.push(`${rows.length - 2} baris tambahan diabaikan — impor memakai baris pertama saja.`);
	}
	const cells = rows[1];
	headers.forEach((header, i) => {
		const key = HEADER_MAP[header];
		const value = cells[i] || '';
		if (!key || !value) return;
		if (key === 'title') draft.title = value.slice(0, 200);
		else if (key === 'instructions') draft.instructions = value.slice(0, 10000);
		else if (key === 'requirements') draft.requirements = value.slice(0, 5000);
		else if (key === 'groupInfo') draft.groupInfo = value.slice(0, 2000);
		else if (key === 'deadlineRaw') draft.deadlineRaw = value;
		else if (key === 'mode') {
			draft.mode = modeFrom(value);
			if (!draft.mode) notes.push(`Jenis “${value}” tidak dikenali — pilih manual.`);
		} else if (key === 'stages') draft.stages = stagesFrom(value);
		else if (key === 'rubric') {
			draft.requirements = [draft.requirements, `Rubrik (disalin, bobot tidak dihitung):\n${value}`]
				.filter(Boolean)
				.join('\n\n')
				.slice(0, 5000);
			notes.push('Rubrik disalin apa adanya. Bobot tidak diubah atau dihitung.');
		} else if (key === 'attachments') {
			draft.attachmentTitles = value
				.split(/\s*[|;]\s*/)
				.map((t) => t.trim())
				.filter(Boolean);
		}
	});
	draft.reviewNotes = notes;
	return draft;
}

const SECTION =
	/^(judul|title|jenis(?:\s+tugas)?|mode|instruksi|instructions|ketentuan(?:\s+pengumpulan)?|requirements|rubrik|penilaian|kelompok|group|batas\s*waktu|deadline|tahapan|stages|lampiran)\s*[:\-–]\s*/i;

function fromLabeledText(text: string): ImportedAssignment | null {
	const lines = text.split(/\r?\n/);
	const buckets = new Map<string, string[]>();
	let current = '';
	let any = false;
	for (const line of lines) {
		const match = line.match(SECTION);
		if (match) {
			any = true;
			current = normKey(match[1].replace(/\s+tugas|\s+pengumpulan/g, ''));
			if (current.startsWith('batas')) current = 'batas_waktu';
			if (current === 'penilaian') current = 'rubrik';
			const rest = line.slice(match[0].length).trim();
			buckets.set(current, rest ? [rest] : []);
		} else if (current) {
			buckets.get(current)?.push(line);
		}
	}
	if (!any) return null;
	const take = (key: string) => (buckets.get(key) || []).join('\n').trim();
	const draft: ImportedAssignment = { ...EMPTY, reviewNotes: [], stages: [], attachmentTitles: [] };
	draft.title = take('judul') || take('title');
	draft.instructions = (take('instruksi') || take('instructions')).slice(0, 10000);
	draft.requirements = (take('ketentuan') || take('requirements')).slice(0, 5000);
	draft.groupInfo = (take('kelompok') || take('group')).slice(0, 2000);
	draft.deadlineRaw = take('batas_waktu') || take('deadline');
	draft.mode = modeFrom(take('jenis') || take('mode'));
	draft.stages = stagesFrom(take('tahapan') || take('stages'));
	const rubric = take('rubrik');
	if (rubric) {
		draft.requirements = [draft.requirements, `Rubrik (disalin, bobot tidak dihitung):\n${rubric}`]
			.filter(Boolean)
			.join('\n\n')
			.slice(0, 5000);
		draft.reviewNotes.push('Rubrik disalin apa adanya. Bobot tidak diubah atau dihitung.');
	}
	draft.attachmentTitles = (take('lampiran') || '')
		.split(/\s*[|;,\n]\s*/)
		.map((t) => t.trim())
		.filter(Boolean);
	if ((take('jenis') || take('mode')) && !draft.mode) {
		draft.reviewNotes.push('Jenis tugas tidak dikenali — pilih manual.');
	}
	return draft;
}

/**
 * Parse pasted text or a CSV into assignment fields.
 * Unlabeled prose is NOT turned into a title or instructions automatically
 * beyond a review flag — the lecturer confirms every filled field.
 */
export function parseAssignmentImport(raw: string): ImportedAssignment {
	const text = raw.replace(/^\uFEFF/, '').trim();
	if (!text) {
		return { ...EMPTY, reviewNotes: ['Tidak ada teks untuk diimpor.'] };
	}
	const csv = fromCsv(text);
	const labeled = csv || fromLabeledText(text);
	if (!labeled) {
		const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
		return {
			...EMPTY,
			instructions: text.slice(0, 10000),
			reviewNotes: [
				'Teks tidak berlabel (Judul:, Instruksi:, Tahapan:, …) dan bukan CSV.',
				first.length <= 120
					? 'Isi diletakkan di instruksi agar bisa ditinjau — judul tidak ditebak.'
					: 'Isi diletakkan di instruksi. Lengkapi judul secara manual.',
			],
		};
	}
	const notes = [...labeled.reviewNotes];
	if (!labeled.title) notes.push('Judul tidak ditemukan — isi manual.');
	if (!labeled.instructions) notes.push('Instruksi tidak ditemukan.');
	if (!labeled.deadlineRaw) notes.push('Batas waktu tidak ditemukan — tidak ditebak.');
	else if (Number.isNaN(new Date(labeled.deadlineRaw).getTime()) && !/^\d{4}-\d{2}-\d{2}/.test(labeled.deadlineRaw)) {
		notes.push(`Batas waktu “${labeled.deadlineRaw.slice(0, 80)}” tidak bisa dibaca sebagai tanggal — isi manual.`);
		labeled.deadlineRaw = '';
	}
	if (labeled.stages.length === 0) notes.push('Tahapan tidak ditemukan — tambahkan atau pakai tahapan bawaan.');
	labeled.reviewNotes = notes;
	labeled.title = labeled.title.slice(0, 200);
	return labeled;
}

/** Read a lecturer-supplied .txt / .csv / .md file. Binary documents are rejected. */
export async function readAssignmentSourceFile(file: File): Promise<string> {
	const name = file.name.toLowerCase();
	const textLike = /\.(txt|csv|md|tsv)$/.test(name) || file.type.startsWith('text/');
	if (!textLike) {
		throw new Error('Berkas ini bukan teks atau CSV. Salin isinya ke kotak impor, atau unggah .txt / .csv / .md.');
	}
	if (file.size > 1_500_000) {
		throw new Error('Berkas terlalu besar untuk impor teks (maks. 1,5 MB).');
	}
	return file.text();
}
