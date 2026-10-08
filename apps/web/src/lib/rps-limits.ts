/**
 * Character limits that PocketBase actually enforces on RPS saves.
 * Text fields with max 0 are capped at 5.000 unless a migration sets an
 * explicit max — `rps` and `syllabus` use the raised document cap.
 */
import type { DraftSession, RpsDraft } from '@/lib/rps-draft';
import { composeRpsText } from '@/lib/rps-draft';

export const LIMITS = {
	title: 200,
	code: 40,
	semester: 80,
	academicYear: 40,
	description: 2000,
	syllabus: 100000,
	rps: 100000,
	strategies: 5000,
	workloadNotes: 5000,
	assessmentNotes: 5000,
	prerequisites: 2000,
	courseGroup: 200,
	lecturerName: 200,
	reviewerName: 200,
	approverName: 200,
	demonstrableOutcomes: 5000,
	learningSteps: 10000,
	workloadSksMatch: 40,
	cpmkCriteria: 2000,
	collabMethod: 200,
	collabSubCpmkNote: 2000,
	collabSteps: 10000,
	collabOutputs: 5000,
	collabIndicators: 5000,
	collabNotes: 5000,
	itemCode: 40,
	itemDescription: 2000,
	sessionTitle: 200,
	sessionTopic: 2000,
	sessionNotes: 10000,
	learningIndicator: 2000,
	learningMaterial: 5000,
	assessmentMethod: 2000,
	syncMethod: 1000,
	duration: 200,
	sessionReferences: 5000,
	collabTitle: 300,
	collabDescription: 5000,
	collabObjectives: 3000,
	collabSchedule: 2000,
	collabGroup: 2000,
} as const;

export type LimitIssue = {
	step: number;
	focusId: string;
	expand?: { kind: 'cpmk' | 'session'; index: number };
	message: string;
};

export function runeCount(value: string) {
	return Array.from(value || '').length;
}

export function formatCount(n: number) {
	return n.toLocaleString('id-ID');
}

export function limitMessage(label: string, count: number, max: number, action: string) {
	return `${label} melebihi batas ${formatCount(max)} karakter (${formatCount(count)}/${formatCount(max)}). ${action} Teks yang sudah Anda ketik tidak dihapus.`;
}

function tooLong(
	value: string,
	max: number,
	label: string,
	step: number,
	focusId: string,
	action: string,
	expand?: LimitIssue['expand'],
): LimitIssue | null {
	const count = runeCount(value.trim());
	if (count <= max) return null;
	return { step, focusId, expand, message: limitMessage(label, count, max, action) };
}

function sessionNotes(s: DraftSession) {
	const parts: string[] = [];
	if (s.objectives?.trim()) parts.push(`Tujuan: ${s.objectives.trim()}`);
	if (s.activities?.trim()) parts.push(`Kegiatan: ${s.activities.trim()}`);
	if (s.duration?.trim()) parts.push(`Durasi: ${s.duration.trim()}`);
	if (s.assessment?.trim()) parts.push(`Penilaian: ${s.assessment.trim()}`);
	if (s.references?.trim()) parts.push(`Referensi: ${s.references.trim()}`);
	return parts.join('\n');
}

function longestComposedSection(d: RpsDraft) {
	const sections = [
		{
			label: 'CPL',
			step: 2,
			focusId: d.cplItems.length ? 'rps-cpl-0-desc' : 'rps-field-composed',
			text: d.cplItems.map((i) => `${i.code} ${i.description}`).join('\n'),
		},
		{
			label: 'CPMK / Sub-CPMK',
			step: 2,
			focusId: d.cpmkItems.length ? 'rps-cpmk-0-desc' : 'rps-field-composed',
			text: d.cpmkItems
				.map((i) => `${i.description}\n${i.subCpmk.map((s) => s.description).join('\n')}`)
				.join('\n'),
		},
		{ label: 'strategi pembelajaran', step: 2, focusId: 'rps-field-strategies', text: d.strategies },
		{
			label: 'catatan penilaian',
			step: 5,
			focusId: 'rps-field-assessment-notes',
			text: d.assessmentNotes,
		},
		{ label: 'catatan beban kerja', step: 4, focusId: 'rps-field-workload', text: d.workload },
		{ label: 'referensi', step: 2, focusId: 'rps-field-references', text: d.references },
	];
	return sections.reduce((best, section) =>
		runeCount(section.text) > runeCount(best.text) ? section : best,
	);
}

/**
 * Returns the first save-blocking length or range problem, without changing
 * the draft. Callers jump to the field and keep the typed text intact.
 */
export function findRpsLimitIssue(d: RpsDraft): LimitIssue | null {
	const identity: Array<[string, number, string, string, string]> = [
		[d.title, LIMITS.title, 'Nama mata kuliah', 'rps-field-title', 'Pendekkan nama mata kuliah.'],
		[d.code, LIMITS.code, 'Kode mata kuliah', 'rps-field-code', 'Pendekkan kode mata kuliah.'],
		[d.semester, LIMITS.semester, 'Semester', 'rps-field-semester', 'Pendekkan isian semester.'],
		[
			d.academicYear,
			LIMITS.academicYear,
			'Tahun akademik',
			'rps-field-year',
			'Pendekkan tahun akademik.',
		],
		[
			d.courseGroup,
			LIMITS.courseGroup,
			'Kelompok mata kuliah',
			'rps-field-group',
			'Pendekkan kelompok mata kuliah.',
		],
		[
			d.lecturerName,
			LIMITS.lecturerName,
			'Dosen pengampu',
			'rps-field-lecturer',
			'Pendekkan nama dosen.',
		],
		[
			d.reviewerName,
			LIMITS.reviewerName,
			'Pemeriksa',
			'rps-field-reviewer',
			'Pendekkan nama pemeriksa.',
		],
		[
			d.approverName,
			LIMITS.approverName,
			'Penyetuju',
			'rps-field-approver',
			'Pendekkan nama penyetuju.',
		],
		[
			d.prerequisites,
			LIMITS.prerequisites,
			'Prasyarat',
			'rps-field-prerequisites',
			'Pendekkan prasyarat.',
		],
	];
	for (const [value, max, label, focusId, action] of identity) {
		const issue = tooLong(value, max, label, 1, focusId, action);
		if (issue) return issue;
	}

	const outcomes: Array<[string, number, string, number, string, string]> = [
		[
			d.description,
			LIMITS.description,
			'Deskripsi mata kuliah',
			2,
			'rps-field-description',
			'Pendekkan deskripsi.',
		],
		[d.syllabus, LIMITS.syllabus, 'Silabus', 2, 'rps-field-syllabus', 'Pendekkan silabus.'],
		[
			d.strategies,
			LIMITS.strategies,
			'Strategi pembelajaran',
			2,
			'rps-field-strategies',
			'Pendekkan strategi pembelajaran.',
		],
		[d.references, 100000, 'Referensi', 2, 'rps-field-references', 'Pendekkan referensi.'],
		[
			d.demonstrableOutcomes,
			LIMITS.demonstrableOutcomes,
			'Hasil belajar yang dapat diperagakan',
			2,
			'rps-field-outcomes',
			'Pendekkan hasil belajar.',
		],
		[
			d.learningSteps,
			LIMITS.learningSteps,
			'Langkah pembelajaran',
			2,
			'rps-field-learning-steps',
			'Pendekkan langkah pembelajaran.',
		],
		[
			d.workload,
			LIMITS.workloadNotes,
			'Catatan beban kerja',
			4,
			'rps-field-workload',
			'Pendekkan catatan beban kerja.',
		],
		[
			d.assessmentNotes,
			LIMITS.assessmentNotes,
			'Catatan penilaian',
			5,
			'rps-field-assessment-notes',
			'Pendekkan catatan penilaian.',
		],
	];
	for (const [value, max, label, step, focusId, action] of outcomes) {
		const issue = tooLong(value, max, label, step, focusId, action);
		if (issue) return issue;
	}

	for (let i = 0; i < d.cplItems.length; i += 1) {
		const item = d.cplItems[i];
		const code = tooLong(
			item.code,
			LIMITS.itemCode,
			`Kode CPL ${item.code || i + 1}`,
			2,
			`rps-cpl-${i}-code`,
			'Pendekkan kode CPL.',
		);
		if (code) return code;
		const desc = tooLong(
			item.description,
			LIMITS.itemDescription,
			`Deskripsi ${item.code || `CPL ${i + 1}`}`,
			2,
			`rps-cpl-${i}-desc`,
			'Pendekkan deskripsi CPL ini, atau pecah menjadi beberapa butir.',
		);
		if (desc) return desc;
	}

	for (let i = 0; i < d.cpmkItems.length; i += 1) {
		const item = d.cpmkItems[i];
		const code = tooLong(
			item.code,
			LIMITS.itemCode,
			`Kode CPMK ${item.code || i + 1}`,
			2,
			`rps-cpmk-${i}-code`,
			'Pendekkan kode CPMK.',
		);
		if (code) return code;
		const desc = tooLong(
			item.description,
			LIMITS.itemDescription,
			`Deskripsi ${item.code || `CPMK ${i + 1}`}`,
			2,
			`rps-cpmk-${i}-desc`,
			'Pendekkan deskripsi CPMK ini, atau pecah menjadi beberapa butir.',
		);
		if (desc) return desc;
		if (item.criteria) {
			const criteria = tooLong(
				item.criteria,
				LIMITS.cpmkCriteria,
				`Kriteria pencapaian ${item.code || `CPMK ${i + 1}`}`,
				2,
				`rps-cpmk-${i}-criteria`,
				'Pendekkan kriteria pencapaian CPMK ini.',
			);
			if (criteria) return criteria;
		}
		for (let j = 0; j < item.subCpmk.length; j += 1) {
			const sub = item.subCpmk[j];
			const subCode = tooLong(
				sub.code,
				LIMITS.itemCode,
				`Kode Sub-CPMK ${sub.code || `${i + 1}.${j + 1}`}`,
				2,
				`rps-sub-${i}-${j}-code`,
				'Pendekkan kode Sub-CPMK.',
				{ kind: 'cpmk', index: i },
			);
			if (subCode) return subCode;
			const subDesc = tooLong(
				sub.description,
				LIMITS.itemDescription,
				`Deskripsi ${sub.code || `Sub-CPMK ${i + 1}.${j + 1}`}`,
				2,
				`rps-sub-${i}-${j}-desc`,
				'Pendekkan deskripsi Sub-CPMK ini.',
				{ kind: 'cpmk', index: i },
			);
			if (subDesc) return subDesc;
		}
	}

	for (let i = 0; i < d.topicItems.length; i += 1) {
		const item = d.topicItems[i];
		const desc = tooLong(
			item.description,
			LIMITS.itemDescription,
			`Deskripsi topik ${item.code || i + 1}`,
			2,
			`rps-topic-${i}-desc`,
			'Pendekkan deskripsi topik ini.',
		);
		if (desc) return desc;
		const code = tooLong(
			item.code,
			LIMITS.itemCode,
			`Kode topik ${item.code || i + 1}`,
			2,
			`rps-topic-${i}-code`,
			'Pendekkan kode topik.',
		);
		if (code) return code;
	}

	for (let i = 0; i < d.sessions.length; i += 1) {
		const s = d.sessions[i];
		if (!s.title.trim() && !s.topic.trim()) continue;
		const weekLabel = `Minggu ${s.week || i + 1}`;
		if (!s.week || s.week < 1 || s.week > 52) {
			return {
				step: 3,
				focusId: `rps-session-${i}-week`,
				message: `${weekLabel}: nomor minggu harus antara 1 dan 52. Isi pertemuan tidak dihapus.`,
			};
		}
		const fields: Array<[string, number, string, string, boolean]> = [
			[s.title, LIMITS.sessionTitle, 'Judul pertemuan', `rps-session-${i}-title`, false],
			[s.topic, LIMITS.sessionTopic, 'Topik pertemuan', `rps-session-${i}-topic`, false],
			[
				s.learningIndicator || '',
				LIMITS.learningIndicator,
				'Indikator pembelajaran',
				`rps-session-${i}-indicator`,
				true,
			],
			[
				s.learningMaterial || '',
				LIMITS.learningMaterial,
				'Materi pembelajaran',
				`rps-session-${i}-material`,
				true,
			],
			[
				s.synchronousMethod || '',
				LIMITS.syncMethod,
				'Metode sinkronus',
				`rps-session-${i}-sync`,
				true,
			],
			[
				s.asynchronousMethod || '',
				LIMITS.syncMethod,
				'Metode asinkronus',
				`rps-session-${i}-async`,
				true,
			],
			[
				s.assessmentMethod || '',
				LIMITS.assessmentMethod,
				'Metode penilaian pertemuan',
				`rps-session-${i}-assess-method`,
				true,
			],
			[s.duration || '', LIMITS.duration, 'Durasi pertemuan', `rps-session-${i}-duration`, true],
			[
				s.references || '',
				LIMITS.sessionReferences,
				'Referensi pertemuan',
				`rps-session-${i}-references`,
				true,
			],
			[sessionNotes(s), LIMITS.sessionNotes, 'Catatan pertemuan', `rps-session-${i}-objectives`, true],
		];
		for (const [value, max, label, focusId, expand] of fields) {
			const issue = tooLong(
				value,
				max,
				`${weekLabel} — ${label}`,
				3,
				focusId,
				'Pendekkan isian pertemuan ini.',
				expand ? { kind: 'session', index: i } : undefined,
			);
			if (issue) return issue;
		}
		if (s.assessmentWeight != null && (s.assessmentWeight < 0 || s.assessmentWeight > 100)) {
			return {
				step: 3,
				focusId: `rps-session-${i}-weight`,
				expand: { kind: 'session', index: i },
				message: `${weekLabel}: bobot penilaian sesi harus antara 0 dan 100. Nilai yang Anda isi tidak dihapus.`,
			};
		}
	}

	for (let i = 0; i < d.assessmentItems.length; i += 1) {
		const item = d.assessmentItems[i];
		const desc = tooLong(
			item.description,
			LIMITS.itemDescription,
			`Deskripsi komponen penilaian ${item.code || i + 1}`,
			5,
			`rps-assess-${i}-desc`,
			'Pendekkan deskripsi komponen ini.',
		);
		if (desc) return desc;
		const code = tooLong(
			item.code,
			LIMITS.itemCode,
			`Kode komponen penilaian ${item.code || i + 1}`,
			5,
			`rps-assess-${i}-code`,
			'Pendekkan kode komponen.',
		);
		if (code) return code;
		if (item.weight != null && (item.weight < 0 || item.weight > 100)) {
			return {
				step: 5,
				focusId: `rps-assess-${i}-weight`,
				message: `Bobot ${item.code || `komponen ${i + 1}`} harus antara 0 dan 100. Nilai yang Anda isi tidak dihapus.`,
			};
		}
	}

	for (let i = 0; i < d.collaborativeTasks.length; i += 1) {
		const t = d.collaborativeTasks[i];
		if (!t.title.trim() && !t.description.trim()) continue;
		const fields: Array<[string, number, string, string]> = [
			[t.title, LIMITS.collabTitle, 'Judul tugas kolaboratif', `rps-collab-${i}-title`],
			[t.description, LIMITS.collabDescription, 'Deskripsi tugas kolaboratif', `rps-collab-${i}-desc`],
			[t.objectives, LIMITS.collabObjectives, 'Tujuan tugas kolaboratif', `rps-collab-${i}-objectives`],
			[t.schedule, LIMITS.collabSchedule, 'Jadwal tugas kolaboratif', `rps-collab-${i}-schedule`],
			[t.groupInfo, LIMITS.collabGroup, 'Info kelompok', `rps-collab-${i}-group`],
			[t.method || '', LIMITS.collabMethod, 'Metode tugas kolaboratif', `rps-collab-${i}-method`],
			[t.subCpmkNote || '', LIMITS.collabSubCpmkNote, 'Sub-CPMK tugas kolaboratif', `rps-collab-${i}-subcpmk`],
			[t.steps || '', LIMITS.collabSteps, 'Langkah pengerjaan tugas', `rps-collab-${i}-steps`],
			[t.outputs || '', LIMITS.collabOutputs, 'Rincian luaran tugas', `rps-collab-${i}-outputs`],
			[t.indicators || '', LIMITS.collabIndicators, 'Indikator tugas', `rps-collab-${i}-indicators`],
			[t.notes || '', LIMITS.collabNotes, 'Catatan lain tugas', `rps-collab-${i}-notes`],
		];
		for (const [value, max, label, focusId] of fields) {
			const issue = tooLong(value, max, label, 6, focusId, 'Pendekkan isian tugas ini.');
			if (issue) return issue;
		}
	}

	const composed = composeRpsText(d);
	const composedCount = runeCount(composed);
	if (composedCount > LIMITS.rps) {
		const longest = longestComposedSection(d);
		return {
			step: longest.step,
			focusId: longest.focusId,
			message: limitMessage(
				'Teks RPS tersusun',
				composedCount,
				LIMITS.rps,
				`Bagian terpanjang saat ini: ${longest.label}. Pendekkan bagian itu.`,
			),
		};
	}

	return null;
}

const PB_COURSE_FIELDS: Record<string, { step: number; focusId: string; label: string }> = {
	rps: { step: 2, focusId: 'rps-field-composed', label: 'Teks RPS tersusun' },
	syllabus: { step: 2, focusId: 'rps-field-syllabus', label: 'Silabus' },
	description: { step: 2, focusId: 'rps-field-description', label: 'Deskripsi mata kuliah' },
	strategies: { step: 2, focusId: 'rps-field-strategies', label: 'Strategi pembelajaran' },
	workloadNotes: { step: 4, focusId: 'rps-field-workload', label: 'Catatan beban kerja' },
	assessmentNotes: { step: 5, focusId: 'rps-field-assessment-notes', label: 'Catatan penilaian' },
	prerequisites: { step: 1, focusId: 'rps-field-prerequisites', label: 'Prasyarat' },
	title: { step: 1, focusId: 'rps-field-title', label: 'Nama mata kuliah' },
	code: { step: 1, focusId: 'rps-field-code', label: 'Kode mata kuliah' },
	semester: { step: 1, focusId: 'rps-field-semester', label: 'Semester' },
	academicYear: { step: 1, focusId: 'rps-field-year', label: 'Tahun akademik' },
	courseGroup: { step: 1, focusId: 'rps-field-group', label: 'Kelompok mata kuliah' },
	lecturerName: { step: 1, focusId: 'rps-field-lecturer', label: 'Dosen pengampu' },
	reviewerName: { step: 1, focusId: 'rps-field-reviewer', label: 'Pemeriksa' },
	approverName: { step: 1, focusId: 'rps-field-approver', label: 'Penyetuju' },
	demonstrableOutcomes: { step: 2, focusId: 'rps-field-outcomes', label: 'Hasil belajar yang dapat diperagakan' },
	learningSteps: { step: 2, focusId: 'rps-field-learning-steps', label: 'Langkah pembelajaran' },
	workloadSksMatch: { step: 4, focusId: 'rps-field-sks-match', label: 'Kesesuaian SKS' },
};

function translateConstraint(message: string, max?: number) {
	const charMax = message.match(/no more than (\d+) character/);
	if (charMax || (max && /character/i.test(message))) {
		const n = charMax ? Number(charMax[1]) : max;
		return `Tidak boleh lebih dari ${formatCount(n || 0)} karakter.`;
	}
	const charMin = message.match(/at least (\d+) character/);
	if (charMin) return `Minimal ${formatCount(Number(charMin[1]))} karakter.`;
	if (/cannot be blank|missing required/i.test(message)) return 'Wajib diisi.';
	if (/failed to (update|create) record/i.test(message)) return 'Gagal menyimpan data.';
	const numMax = message.match(/no more than (\d+)/i);
	if (numMax) return `Nilai tidak boleh lebih dari ${numMax[1]}.`;
	const numMin = message.match(/no less than (\d+)|at least (\d+)/i);
	if (numMin) return `Nilai minimal ${numMin[1] || numMin[2]}.`;
	return message;
}

type PbError = {
	url?: string;
	response?: {
		message?: string;
		data?: Record<string, { message?: string; code?: string; params?: { max?: number } }>;
	};
};

/** Map a PocketBase 400 onto the editor step/field, in Indonesian. */
export function issueFromPocketBase(error: unknown, draft?: RpsDraft): LimitIssue | null {
	if (!error || typeof error !== 'object' || !('response' in error)) return null;
	const pbErr = error as PbError;
	const data = pbErr.response?.data;
	if (!data) return null;
	const entry = Object.entries(data).find(([, info]) => info?.message || info?.code);
	if (!entry) return null;
	const [field, info] = entry;
	const max = info.params?.max;
	const translated = translateConstraint(info.message || '', max);
	const courseField = PB_COURSE_FIELDS[field];
	const url = pbErr.url || '';
	const collection = url.match(/collections\/([^/]+)/)?.[1] || 'courses';

	if (collection === 'courses' && courseField) {
		const counted =
			draft && field === 'rps'
				? runeCount(composeRpsText(draft))
				: draft && field === 'description'
					? runeCount(draft.description)
					: draft && field === 'syllabus'
						? runeCount(draft.syllabus)
						: draft && field === 'strategies'
							? runeCount(draft.strategies)
							: draft && field === 'workloadNotes'
								? runeCount(draft.workload)
								: draft && field === 'assessmentNotes'
									? runeCount(draft.assessmentNotes)
									: undefined;
		const detail =
			counted != null && max
				? limitMessage(
						courseField.label,
						counted,
						max,
						field === 'rps'
							? 'Pendekkan CPL, CPMK, strategi, penilaian, beban kerja, atau referensi.'
							: 'Pendekkan isian ini.',
					)
				: `${courseField.label}: ${translated} Isi Anda tidak dihapus.`;
		return { step: courseField.step, focusId: courseField.focusId, message: detail };
	}

	if (draft) {
		const fromDraft = findRpsLimitIssue(draft);
		if (fromDraft) return fromDraft;
	}

	const step =
		collection === 'class_sessions'
			? 3
			: collection === 'collaborative_tasks'
				? 6
				: collection === 'assessments'
					? 5
					: 2;
	return {
		step,
		focusId: courseField?.focusId || 'rps-field-composed',
		message: `${translated} Periksa isian yang ditandai. Teks yang sudah Anda ketik tidak dihapus.`,
	};
}
