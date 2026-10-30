/**
 * Safe RPS fix proposals. Every change is derived from records that already
 * exist — this module never creates CPL, CPMK, Sub-CPMK, sessions, assessments,
 * or workload numbers, and never rewrites extracted text.
 */
import type { ValidationWarning } from '@/lib/rps-validation';

export type FixChange = {
	label: string;
	before: string;
	after: string;
};

export type FixOp = {
	collection: 'class_sessions' | 'courses' | 'assessments';
	id: string;
	patch: Record<string, unknown>;
	before: Record<string, unknown>;
};

export type RpsFixProposal = {
	canApply: boolean;
	title: string;
	explanation: string;
	reviewNote: string;
	changes: FixChange[];
	ops: FixOp[];
};

export type FixSession = {
	id: string;
	week: number;
	title: string;
	topic: string;
	notes?: string;
	specialWeekType?: string;
	subCpmks?: string[];
	topics?: string[];
	assessments?: string[];
	learningIndicator?: string;
	learningMaterial?: string;
	assessmentMethod?: string;
	synchronousMethod?: string;
	asynchronousMethod?: string;
};

export type FixItem = { id: string; code: string; description: string };
export type FixAssessment = FixItem & { weight: number | null };

export type FixContext = {
	courseId: string;
	workloadLecture?: number | null;
	workloadTutorial?: number | null;
	workloadPractice?: number | null;
	workloadIndependent?: number | null;
	workloadTotal?: number | null;
	sessions: FixSession[];
	subCpmk: FixItem[];
	topics: FixItem[];
	assessments: FixAssessment[];
};

const STOP = new Set([
	'yang', 'untuk', 'dengan', 'pada', 'dari', 'dalam', 'serta', 'atau', 'dan',
	'ini', 'itu', 'adalah', 'sebagai', 'mahasiswa', 'mampu', 'dapat', 'akan',
	'mata', 'kuliah', 'pembelajaran', 'level',
]);

const empty = (v: string | null | undefined) => !v || !String(v).trim();

function tokens(value: string) {
	return new Set(
		value
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.split(/[^a-z0-9]+/)
			.filter((t) => t.length >= 4 && !STOP.has(t)),
	);
}

function weekOf(message: string) {
	const match = message.match(/minggu\s+(\d+)/i);
	return match ? Number(match[1]) : null;
}

function weeksOf(message: string) {
	const match = message.match(/minggu\s+([\d,\s]+)/i);
	if (!match) return [];
	return match[1]
		.split(/[,\s]+/)
		.map((n) => Number(n))
		.filter((n) => Number.isFinite(n) && n > 0);
}

function labelItem(item: FixItem) {
	return item.code ? `${item.code} — ${item.description}` : item.description;
}

function show(value: string | number | null | undefined) {
	if (value == null || value === '') return '—';
	return String(value);
}

/** Sub-CPMK ids already in the catalog that the session text clearly refers to. */
export function candidateSubCpmks(session: FixSession, items: FixItem[]) {
	const blob = [session.title, session.topic, session.notes, session.learningMaterial, session.learningIndicator]
		.filter(Boolean)
		.join(' \n ');
	const blobLower = blob.toLowerCase();
	const blobTokens = tokens(blob);
	const hits: { id: string; reason: 'code' | 'overlap' }[] = [];
	for (const item of items) {
		const code = item.code.trim();
		if (code && blobLower.includes(code.toLowerCase())) {
			hits.push({ id: item.id, reason: 'code' });
			continue;
		}
		const itemTokens = tokens(`${item.code} ${item.description}`);
		let shared = 0;
		for (const token of itemTokens) {
			if (blobTokens.has(token)) shared += 1;
		}
		if (shared >= 2) hits.push({ id: item.id, reason: 'overlap' });
	}
	return hits.slice(0, 5);
}

function num(v: number | null | undefined) {
	return v == null || Number.isNaN(v) ? 0 : v;
}

/** Integer rescale of existing weights so they sum to 100. Returns null if any weight is missing. */
export function rescaleWeights(weights: Array<number | null>) {
	if (weights.some((w) => w == null || Number.isNaN(w))) return null;
	const values = weights as number[];
	const sum = values.reduce((n, w) => n + w, 0);
	if (sum <= 0 || sum === 100) return null;
	const raw = values.map((w) => (w / sum) * 100);
	const floored = raw.map((w) => Math.floor(w));
	const remainder = 100 - floored.reduce((n, w) => n + w, 0);
	const order = raw
		.map((w, i) => ({ i, frac: w - Math.floor(w) }))
		.sort((a, b) => b.frac - a.frac);
	for (let i = 0; i < remainder; i += 1) floored[order[i % order.length].i] += 1;
	return floored;
}

function blocked(title: string, explanation: string): RpsFixProposal {
	return {
		canApply: false,
		title,
		explanation,
		reviewNote: 'Tidak ada perubahan yang diterapkan. Lengkapi data secara manual di Editor RPS.',
		changes: [],
		ops: [],
	};
}

function proposeSubCpmk(ctx: FixContext, warning: ValidationWarning): RpsFixProposal {
	if (ctx.subCpmk.length === 0) {
		return blocked(
			'Tidak dapat dipetakan',
			'Belum ada Sub-CPMK tersimpan. Asisten tidak membuat capaian baru. Tambahkan Sub-CPMK yang memang ada di RPS pada langkah Deskripsi & Capaian, lalu petakan pertemuan secara manual atau minta usulan lagi.',
		);
	}
	const weeks = weeksOf(warning.message);
	const targets = ctx.sessions.filter(
		(s) =>
			(!s.specialWeekType || s.specialWeekType === 'normal') &&
			(!s.subCpmks || s.subCpmks.length === 0) &&
			(weeks.length === 0 || weeks.includes(s.week)),
	);
	const ops: FixOp[] = [];
	const changes: FixChange[] = [];
	const unmatched: number[] = [];
	for (const session of targets) {
		const hits = candidateSubCpmks(session, ctx.subCpmk);
		if (hits.length === 0) {
			unmatched.push(session.week);
			continue;
		}
		const ids = hits.map((h) => h.id);
		const labels = ids
			.map((id) => ctx.subCpmk.find((item) => item.id === id))
			.filter((item): item is FixItem => Boolean(item))
			.map(labelItem)
			.join('; ');
		ops.push({
			collection: 'class_sessions',
			id: session.id,
			patch: { subCpmks: ids },
			before: { subCpmks: session.subCpmks || [] },
		});
		changes.push({
			label: `Minggu ${session.week} · Sub-CPMK`,
			before: 'Belum ditautkan',
			after: labels,
		});
	}
	if (ops.length === 0) {
		return blocked(
			'Tidak ada padanan yang aman',
			`Sub-CPMK yang sudah ada tidak disebut secara jelas pada pertemuan ${unmatched.join(', ') || 'yang kosong'}. Asisten tidak menebak pemetaan. Tautkan secara manual di langkah Rencana Pembelajaran.`,
		);
	}
	const leftover =
		unmatched.length > 0
			? ` Pertemuan minggu ${unmatched.join(', ')} tidak diubah karena teksnya tidak menyebut Sub-CPMK yang ada.`
			: '';
	return {
		canApply: true,
		title: 'Petakan Sub-CPMK yang sudah ada',
		explanation: `Usulan ini hanya menautkan Sub-CPMK yang kodenya atau kata kuncinya sudah muncul pada pertemuan. Tidak ada capaian baru.${leftover}`,
		reviewNote: 'Periksa setiap tautan sebelum diterapkan. Pemetaan yang meragukan sebaiknya dikosongkan.',
		changes,
		ops,
	};
}

function proposeWeekly(ctx: FixContext, warning: ValidationWarning): RpsFixProposal {
	const week = weekOf(warning.message);
	if (warning.message.includes('belum ditandai sebagai UTS') || warning.message.includes('belum ditandai sebagai UAS')) {
		const kind = warning.message.includes('UTS') ? 'uts' : 'uas';
		const session = ctx.sessions.find((s) => s.week === (kind === 'uts' ? 8 : 16));
		if (!session) {
			return blocked(
				'Tidak dapat menandai minggu khusus',
				'Pertemuan tersebut tidak ada di data tersimpan. Asisten tidak membuat sesi baru.',
			);
		}
		const blob = `${session.title} ${session.topic}`;
		const keyword = kind === 'uts' ? /\buts\b|ujian tengah/i : /\buas\b|ujian akhir/i;
		if (!keyword.test(blob)) {
			return blocked(
				'Perlu konfirmasi dosen',
				`Judul dan topik minggu ${session.week} tidak menyebut ${kind.toUpperCase()}. Menandai minggu khusus tanpa bukti di data yang ada akan mengarang jadwal. Tandai manual bila memang sesuai kalender.`,
			);
		}
		return {
			canApply: true,
			title: `Tandai minggu ${session.week} sebagai ${kind.toUpperCase()}`,
			explanation: `Teks pertemuan sudah menyebut ${kind.toUpperCase()}. Usulan hanya mengubah tipe minggu, tanpa menambah atau mengubah materi.`,
			reviewNote: 'Pastikan minggu ini memang ujian, bukan pertemuan biasa yang kebetulan menyebut ujian.',
			changes: [
				{
					label: `Minggu ${session.week} · Tipe minggu`,
					before: session.specialWeekType || 'normal',
					after: kind.toUpperCase(),
				},
			],
			ops: [
				{
					collection: 'class_sessions',
					id: session.id,
					patch: { specialWeekType: kind },
					before: { specialWeekType: session.specialWeekType || 'normal' },
				},
			],
		};
	}

	const session = ctx.sessions.find((s) => s.week === week);
	if (!session || week == null) {
		return blocked(
			'Tidak dapat dilengkapi',
			'Pertemuan pada catatan ini tidak ditemukan. Tidak ada field yang diisi.',
		);
	}
	const patch: Record<string, string> = {};
	const before: Record<string, string> = {};
	const changes: FixChange[] = [];
	const topicItems = ctx.topics.filter((t) => (session.topics || []).includes(t.id));
	const linkedAssess = ctx.assessments.filter((a) => (session.assessments || []).includes(a.id));
	const linkedSub = ctx.subCpmk.filter((s) => (session.subCpmks || []).includes(s.id));
	const copies: Array<{ field: string; label: string; value: string }> = [];
	if (empty(session.title) && !empty(session.topic)) {
		copies.push({ field: 'title', label: 'Judul', value: session.topic.trim() });
	}
	if (empty(session.learningMaterial)) {
		const fromTopic = !empty(session.topic) ? session.topic.trim() : '';
		const fromItems = topicItems.map((t) => t.description.trim()).filter(Boolean).join('\n');
		const value = fromTopic || fromItems;
		if (value) copies.push({ field: 'learningMaterial', label: 'Materi pembelajaran', value });
	}
	if (empty(session.learningIndicator) && linkedSub.length > 0) {
		copies.push({
			field: 'learningIndicator',
			label: 'Indikator pembelajaran',
			value: linkedSub.map(labelItem).join('\n'),
		});
	}
	if (empty(session.assessmentMethod) && linkedAssess.length > 0) {
		copies.push({
			field: 'assessmentMethod',
			label: 'Aspek penilaian',
			value: linkedAssess.map(labelItem).join('\n'),
		});
	}
	for (const copy of copies) {
		patch[copy.field] = copy.value;
		before[copy.field] = '';
		changes.push({ label: `Minggu ${session.week} · ${copy.label}`, before: 'Kosong', after: copy.value });
	}
	const still: string[] = [];
	if (empty(session.synchronousMethod) && empty(session.asynchronousMethod) && !patch.synchronousMethod) {
		still.push('metode sinkronus/asinkronus');
	}
	if (empty(session.learningIndicator) && !patch.learningIndicator) still.push('indikator pembelajaran');
	if (empty(session.assessmentMethod) && !patch.assessmentMethod) still.push('aspek penilaian');
	if (copies.length === 0) {
		return blocked(
			'Tidak ada isian yang bisa diturunkan',
			`Pertemuan minggu ${session.week} masih kosong pada ${still.join(', ') || 'beberapa field'}, tetapi data pertemuan, topik, dan capaian yang tertaut tidak memuat teks yang bisa disalin. Asisten tidak mengarang indikator atau metode. Lengkapi manual di langkah Rencana Pembelajaran.`,
		);
	}
	const leftover = still.length
		? ` Yang tetap kosong (karena tidak ada sumbernya): ${still.join(', ')}.`
		: '';
	return {
		canApply: true,
		title: `Lengkapi minggu ${session.week} dari data yang ada`,
		explanation: `Field kosong diisi hanya dengan menyalin topik, materi, capaian, atau komponen penilaian yang sudah tersimpan pada pertemuan ini. Tidak ada kalimat baru.${leftover}`,
		reviewNote: 'Teks yang disalin tidak diubah. Sunting lagi di editor bila rumusannya perlu lebih spesifik.',
		changes,
		ops: [{ collection: 'class_sessions', id: session.id, patch, before }],
	};
}

function proposeAssessment(ctx: FixContext, warning: ValidationWarning): RpsFixProposal {
	if (warning.message.includes('di luar rentang')) {
		return blocked(
			'Bobot sesi tidak dikoreksi otomatis',
			'Nilai di luar 0–100 tidak bisa ditebak maksudnya (salah ketik atau satuan lain). Perbaiki angkanya secara manual agar tidak mengubah makna penilaian.',
		);
	}
	if (warning.message.includes('belum memiliki bobot') || warning.message.includes('belum berbobot')) {
		return blocked(
			'Bobot tidak bisa diisi otomatis',
			'Komponen tanpa bobot tidak boleh diberi persentase baru — itu mengarang komposisi nilai. Isi bobot yang tercantum di RPS pada langkah Kriteria Penilaian.',
		);
	}
	const scaled = rescaleWeights(ctx.assessments.map((a) => a.weight));
	if (!scaled) {
		return blocked(
			'Tidak ada penyesuaian bobot yang aman',
			'Total bobot tidak dapat dinormalkan dari angka yang ada (bobot hilang atau jumlahnya nol). Tidak ada persentase baru yang dibuat.',
		);
	}
	const ops: FixOp[] = [];
	const changes: FixChange[] = [];
	ctx.assessments.forEach((item, i) => {
		if (item.weight === scaled[i]) return;
		ops.push({
			collection: 'assessments',
			id: item.id,
			patch: { weight: scaled[i] },
			before: { weight: item.weight },
		});
		changes.push({
			label: item.code || item.description.slice(0, 42),
			before: `${item.weight}%`,
			after: `${scaled[i]}%`,
		});
	});
	if (ops.length === 0) {
		return blocked('Bobot sudah 100%', 'Tidak ada perubahan.');
	}
	return {
		canApply: true,
		title: 'Normalkan bobot yang sudah ada menjadi 100%',
		explanation:
			'Setiap bobot diskalakan proporsional dari angka yang sudah tersimpan supaya jumlahnya 100%. Tidak ada komponen baru dan tidak ada bobot yang sebelumnya kosong.',
		reviewNote: 'Ini mengubah angka penilaian. Tolak usulan jika RPS memang belum menjumlah 100% dan harus diperbaiki manual.',
		changes,
		ops,
	};
}

function proposeWorkload(ctx: FixContext, warning: ValidationWarning): RpsFixProposal {
	if (warning.message.includes('minggu ganda') || warning.message.includes('perkiraan') || warning.message.includes('pertemuan terencana')) {
		return blocked(
			'Tidak diubah otomatis',
			warning.message.includes('minggu ganda')
				? 'Sesi ganda tidak dihapus oleh asisten agar tidak menghilangkan catatan yang mungkin berbeda. Gunakan pembersihan sesi ganda di langkah Rencana Pembelajaran, yang mempertahankan satu sesi per minggu.'
				: warning.message.includes('pertemuan terencana')
					? 'Pertemuan yang belum ada tidak dibuat. Asisten tidak mengarang jadwal 16 minggu. Tambahkan hanya pertemuan yang tercantum di RPS.'
					: 'Jam beban kerja tidak diubah agar sesuai perkiraan SKS, karena itu akan mengarang alokasi jam. Samakan angka dengan RPS secara manual di langkah Workload.',
		);
	}
	const sum =
		num(ctx.workloadLecture) +
		num(ctx.workloadTutorial) +
		num(ctx.workloadPractice) +
		num(ctx.workloadIndependent);
	if (sum <= 0 || ctx.workloadTotal == null || ctx.workloadTotal === sum) {
		return blocked(
			'Tidak ada total yang bisa diturunkan',
			'Total beban kerja hanya disamakan dengan jumlah komponen yang sudah diisi. Komponen kosong tidak dilengkapi.',
		);
	}
	return {
		canApply: true,
		title: 'Samakan total beban kerja dengan jumlah komponen',
		explanation: `Total ${ctx.workloadTotal} jam tidak sama dengan jumlah komponen yang sudah tersimpan (${sum} jam). Usulan hanya mengubah angka total, bukan jam kuliah, tutorial, praktik, atau mandiri.`,
		reviewNote: 'Tolak jika total di RPS memang berbeda dan komponennya yang perlu diperbaiki.',
		changes: [
			{
				label: 'Total beban kerja',
				before: `${ctx.workloadTotal} jam`,
				after: `${sum} jam`,
			},
		],
		ops: [
			{
				collection: 'courses',
				id: ctx.courseId,
				patch: { workloadTotal: sum },
				before: { workloadTotal: ctx.workloadTotal },
			},
		],
	};
}

/** Local, non-destructive proposal for one validation warning. */
export function buildFixProposal(ctx: FixContext, warning: ValidationWarning): RpsFixProposal {
	if (warning.category === 'subcpmk') return proposeSubCpmk(ctx, warning);
	if (warning.category === 'weekly') return proposeWeekly(ctx, warning);
	if (warning.category === 'assessment') return proposeAssessment(ctx, warning);
	return proposeWorkload(ctx, warning);
}


