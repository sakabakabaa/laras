import type { ScheduledLesson } from './scheduled-lesson';
import pb from './pocketbase-client';

export type RichText = {
	type: 'doc';
	content: { type: 'paragraph'; content: { type: 'text'; text: string }[] }[];
};
export const rich = (value: string): RichText => ({
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
});
export const plain = (value?: RichText) =>
	value?.content.map((p) => p.content.map((t) => t.text).join('')).join('\n') ||
	'';
export type BuilderKind = 'kelas' | 'tugas';
export type BlockType =
	| 'instructions'
	| 'image'
	| 'audio'
	| 'video'
	| 'reference'
	| 'question_group'
	| 'matching'
	| 'gap_passage'
	| 'writing'
	| 'reflection'
	| 'acknowledgement'
	| 'lesson';
export type QuestionKind =
	'single_choice' | 'short_answer' | 'matching' | 'long_writing' | 'reflection';
export type BuilderQuestion = {
	id: string;
	kind: QuestionKind;
	prompt: RichText;
	required: boolean;
	points: number;
	options?: { id: string; label: string }[];
	maxCharacters?: number;
	rubric?: { criteria: { id: string; label: string; maxPoints: number }[] };
};
export type BuilderBlock = {
	id: string;
	type: BlockType;
	body?: RichText;
	label?: string;
	url?: string;
	alt?: string;
	questionIds?: string[];
	questionId?: string;
	destinations?: { id: string; label: string; title: string; url?: string }[];
	sections?: {
		id: string;
		segments: (
			{ type: 'text'; text: string } | { type: 'gap'; questionId: string }
		)[];
	}[];
	lesson?: ScheduledLesson;
};
export type BuilderActivity = {
	id: string;
	title: string;
	required: boolean;
	plannedMinutes: number;
	blocks: BuilderBlock[];
};
export type BuilderDocument = {
	schemaVersion: 1;
	kind: BuilderKind;
	context: { courseId: string; meetingId: string; sectionIds: string[] };
	title: string;
	instructions: RichText;
	activities: BuilderActivity[];
	questionsById: Record<string, BuilderQuestion>;
	delivery: {
		kind: BuilderKind;
		progression: 'scheduled' | 'guided' | 'free';
		timeZone: 'Asia/Jakarta';
		startsAt: string;
		endsAt: string;
		checkInClosesAt: string;
		lateAfterMinutes: number;
		availableAt: string;
		dueAt: string;
		hardCloseAt: string;
		allowLate: boolean;
		timeLimitMinutes: number;
	};
	scoring: { mode: 'points' };
	results: { release: 'manual' };
};
export type BuilderKey = {
	strategy:
		'single_choice' | 'exact_text' | 'matching' | 'rubric' | 'feedback_only';
	correctOptionId?: string;
	correctDestinationId?: string;
	accepted?: string[];
	comparison?: { ignoreCase: boolean; ignorePunctuation: boolean };
	modelAnswer?: RichText;
	privateGuidance?: RichText;
	explanation?: RichText;
};
export type BuilderEnvelope = {
	document: BuilderDocument;
	privateKeys: {
		schemaVersion: 1;
		answersByQuestionId: Record<string, BuilderKey>;
	};
};
export type BuilderRecord = BuilderEnvelope & {
	id: string;
	revision: number;
	updated: string;
	title: string;
	kind: BuilderKind;
};
export type BuilderListItem = {
	id: string;
	title: string;
	kind: BuilderKind;
	revision: number;
	updated: string;
	activityCount: number;
	courseTitle: string;
};
export type BuilderIssue = {
	activityId?: string;
	blockId?: string;
	questionId?: string;
	message: string;
};
export const uid = () => crypto.randomUUID();
export const BLOCK_LABELS: Record<BlockType, string> = {
	instructions: 'Teks & instruksi',
	image: 'Gambar',
	audio: 'Audio',
	video: 'Video',
	reference: 'Tautan & referensi',
	question_group: 'Pilihan ganda / jawaban singkat',
	matching: 'Mencocokkan',
	gap_passage: 'Isian dalam teks',
	writing: 'Menulis panjang',
	reflection: 'Refleksi',
	acknowledgement: 'Konfirmasi membaca',
	lesson: 'Penjelasan interaktif',
};
export function newActivity(title = 'Kegiatan baru'): BuilderActivity {
	return { id: uid(), title, required: true, plannedMinutes: 15, blocks: [] };
}
export function blankBuilder(
	kind: BuilderKind,
	courseId: string,
	meetingId = '',
	sectionIds: string[] = [],
): BuilderEnvelope {
	return {
		document: {
			schemaVersion: 1,
			kind,
			context: { courseId, meetingId, sectionIds },
			title: kind === 'kelas' ? 'Kelas baru' : 'Tugas baru',
			instructions: rich(''),
			activities: [newActivity('Pengantar')],
			questionsById: {},
			delivery: {
				kind,
				progression: 'scheduled',
				timeZone: 'Asia/Jakarta',
				startsAt: '',
				endsAt: '',
				checkInClosesAt: '',
				lateAfterMinutes: 10,
				availableAt: '',
				dueAt: '',
				hardCloseAt: '',
				allowLate: false,
				timeLimitMinutes: 0,
			},
			scoring: { mode: 'points' },
			results: { release: 'manual' },
		},
		privateKeys: { schemaVersion: 1, answersByQuestionId: {} },
	};
}
export function questionIds(block: BuilderBlock): string[] {
	return [
		...(block.questionIds || []),
		...(block.questionId ? [block.questionId] : []),
		...(block.sections || []).flatMap((s) =>
			s.segments.flatMap((t) => (t.type === 'gap' ? [t.questionId] : [])),
		),
	];
}
export function appendQuestion(
	draft: BuilderEnvelope,
	kind: QuestionKind,
): string {
	const id = uid(),
		options =
			kind === 'single_choice'
				? [
						{ id: uid(), label: '' },
						{ id: uid(), label: '' },
					]
				: undefined;
	draft.document.questionsById[id] = {
		id,
		kind,
		prompt: rich(''),
		required: true,
		points: kind === 'reflection' ? 0 : 1,
		...(options ? { options } : {}),
		...(['long_writing', 'reflection'].includes(kind)
			? { maxCharacters: 10000 }
			: {}),
	};
	draft.privateKeys.answersByQuestionId[id] =
		kind === 'single_choice'
			? { strategy: 'single_choice', correctOptionId: '' }
			: kind === 'matching'
				? { strategy: 'matching', correctDestinationId: '' }
				: kind === 'short_answer'
					? {
							strategy: 'exact_text',
							accepted: [],
							comparison: { ignoreCase: true, ignorePunctuation: false },
						}
					: {
							strategy: kind === 'reflection' ? 'feedback_only' : 'rubric',
							modelAnswer: rich(''),
							privateGuidance: rich(''),
						};
	return id;
}
export function appendBlock(
	draft: BuilderEnvelope,
	activityId: string,
	type: BlockType,
): string {
	const b: BuilderBlock = { id: uid(), type };
	if (type === 'instructions') b.body = rich('');
	if (['image', 'audio', 'video', 'reference'].includes(type)) {
		b.url = '';
		b.label = '';
		b.alt = '';
	}
	if (type === 'question_group')
		b.questionIds = [appendQuestion(draft, 'single_choice')];
	if (type === 'writing') b.questionId = appendQuestion(draft, 'long_writing');
	if (type === 'reflection')
		b.questionIds = [appendQuestion(draft, 'reflection')];
	if (type === 'matching') {
		b.questionIds = [appendQuestion(draft, 'matching')];
		b.destinations = [
			{ id: uid(), label: 'A', title: 'Kelompok A' },
			{ id: uid(), label: 'B', title: 'Kelompok B' },
		];
	}
	if (type === 'gap_passage') {
		const id = appendQuestion(draft, 'short_answer');
		b.sections = [
			{
				id: uid(),
				segments: [
					{ type: 'text', text: 'Tulis kalimat sebelum isian ' },
					{ type: 'gap', questionId: id },
					{ type: 'text', text: '.' },
				],
			},
		];
	}
	if (type === 'acknowledgement')
		b.body = rich('Saya sudah membaca dan memahami materi.');
	if (type === 'lesson')
		b.lesson = { goal: { de: '', id: '' }, steps: [], scenes: [] };
	draft.document.activities.find((a) => a.id === activityId)!.blocks.push(b);
	return b.id;
}
export function removeBlock(
	draft: BuilderEnvelope,
	activityId: string,
	blockId: string,
) {
	const a = draft.document.activities.find((a) => a.id === activityId)!;
	const b = a.blocks.find((b) => b.id === blockId);
	if (!b) return;
	for (const id of questionIds(b)) {
		delete draft.document.questionsById[id];
		delete draft.privateKeys.answersByQuestionId[id];
	}
	a.blocks = a.blocks.filter((b) => b.id !== blockId);
}
export function duplicateActivity(draft: BuilderEnvelope, activityId: string) {
	const original = draft.document.activities.find((a) => a.id === activityId)!;
	const copy = structuredClone(original),
		ids = new Map<string, string>();
	const collect = (o: unknown) => {
		if (!o || typeof o !== 'object') return;
		if (Array.isArray(o)) {
			o.forEach(collect);
			return;
		}
		const r = o as Record<string, unknown>;
		if (typeof r.id === 'string' && !('de' in r)) ids.set(r.id, uid());
		Object.values(r).forEach(collect);
	};
	collect(copy);
	for (const b of original.blocks)
		for (const qid of questionIds(b)) {
			collect(draft.document.questionsById[qid]);
		}
	const remap = (o: unknown, field = ''): any =>
		typeof o === 'string'
			? [
					'id',
					'questionId',
					'questionIds',
					'criterionIds',
					'correctOptionId',
					'correctDestinationId',
				].includes(field)
				? ids.get(o) || o
				: o
			: Array.isArray(o)
				? o.map((v) => remap(v, field))
				: o && typeof o === 'object'
					? Object.fromEntries(
							Object.entries(o).map(([k, v]) => [
								k,
								remap(v, 'de' in o && k === 'id' ? 'translation' : k),
							]),
						)
					: o;
	const next = remap(copy) as BuilderActivity;
	next.title = (next.title + ' (salinan)').slice(0, 200);
	for (const b of original.blocks)
		for (const qid of questionIds(b)) {
			const id = ids.get(qid)!;
			draft.document.questionsById[id] = remap(
				draft.document.questionsById[qid],
			);
			draft.privateKeys.answersByQuestionId[id] = remap(
				draft.privateKeys.answersByQuestionId[qid],
			);
		}
	draft.document.activities.splice(
		draft.document.activities.indexOf(original) + 1,
		0,
		next,
	);
	return next.id;
}
export function builderIssues({
	document: d,
	privateKeys,
}: BuilderEnvelope): BuilderIssue[] {
	const issues: BuilderIssue[] = [];
	const add = (
		message: string,
		activityId?: string,
		blockId?: string,
		questionId?: string,
	) => issues.push({ message, activityId, blockId, questionId });
	if (!d.title.trim()) add('Isi judul dokumen.');
	if (!d.activities.length) add('Tambahkan kegiatan.');
	for (const a of d.activities) {
		if (!a.title.trim()) add('Isi judul kegiatan.', a.id);
		if (!a.blocks.length) add('Tambahkan elemen pada kegiatan.', a.id);
		if (d.kind === 'kelas' && a.plannedMinutes < 1)
			add('Durasi kegiatan minimal 1 menit.', a.id);
		for (const b of a.blocks) {
			if (
				[
					'question_group',
					'matching',
					'gap_passage',
					'writing',
					'reflection',
				].includes(b.type) &&
				!questionIds(b).length
			)
				add('Tambahkan pertanyaan pada elemen ini.', a.id, b.id);
			if (b.type === 'instructions' && !plain(b.body).trim())
				add('Isi teks instruksi.', a.id, b.id);
			if (['image', 'audio', 'video', 'reference'].includes(b.type) && !b.url)
				add('Pilih tautan media.', a.id, b.id);
			if (b.type === 'image' && !b.alt?.trim())
				add('Isi teks alternatif gambar.', a.id, b.id);
			if (b.type === 'lesson' && !b.lesson?.scenes.length)
				add('Tambahkan penjelasan interaktif.', a.id, b.id);
			for (const id of questionIds(b)) {
				const q = d.questionsById[id],
					key = privateKeys.answersByQuestionId[id];
				if (!q || !key) {
					add(
						'Butir atau pengaturan penilaian tidak ditemukan.',
						a.id,
						b.id,
						id,
					);
					continue;
				}
				if (!plain(q.prompt).trim()) add('Isi pertanyaan.', a.id, b.id, id);
				if (q.options?.some((o) => !o.label.trim()))
					add('Lengkapi setiap pilihan jawaban.', a.id, b.id, id);
				if (key.strategy === 'single_choice' && !key.correctOptionId)
					add('Pilih kunci jawaban.', a.id, b.id, id);
				if (
					key.strategy === 'exact_text' &&
					!key.accepted?.some((v) => v.trim())
				)
					add('Isi jawaban yang diterima.', a.id, b.id, id);
				if (key.strategy === 'matching' && !key.correctDestinationId)
					add('Pilih pasangan yang benar.', a.id, b.id, id);
			}
		}
	}
	if (d.kind === 'kelas') {
		if (!d.context.meetingId) add('Pilih pertemuan untuk kelas.');
		if (!d.delivery.checkInClosesAt) add('Isi batas check-in.');
		else if (
			d.delivery.startsAt &&
			d.delivery.endsAt &&
			(Date.parse(d.delivery.checkInClosesAt) <
				Date.parse(d.delivery.startsAt) ||
				Date.parse(d.delivery.checkInClosesAt) > Date.parse(d.delivery.endsAt))
		)
			add('Batas check-in harus berada dalam waktu kelas.');
		if (!d.delivery.startsAt || !d.delivery.endsAt)
			add('Isi waktu mulai dan selesai.');
		else if (Date.parse(d.delivery.endsAt) <= Date.parse(d.delivery.startsAt))
			add('Waktu selesai harus setelah mulai.');
		else if (
			d.delivery.progression === 'scheduled' &&
			Math.round(
				(Date.parse(d.delivery.endsAt) - Date.parse(d.delivery.startsAt)) /
					60000,
			) !== d.activities.reduce((s, a) => s + a.plannedMinutes, 0)
		)
			add('Total durasi kegiatan harus sesuai dengan jadwal kelas.');
	} else {
		if (!d.delivery.dueAt) add('Isi batas pengumpulan tugas.');
		if (
			d.delivery.availableAt &&
			d.delivery.dueAt &&
			Date.parse(d.delivery.availableAt) >= Date.parse(d.delivery.dueAt)
		)
			add('Waktu tersedia harus sebelum batas pengumpulan.');
		if (
			d.delivery.hardCloseAt &&
			d.delivery.dueAt &&
			Date.parse(d.delivery.hardCloseAt) < Date.parse(d.delivery.dueAt)
		)
			add(
				'Tutup pengumpulan harus setelah atau sama dengan batas pengumpulan.',
			);
	}
	return issues;
}
export function applyTemplate(
	draft: BuilderEnvelope,
	template: 'blank' | 'listening' | 'writing' | 'reflection',
) {
	if (template === 'blank') return;
	const a = draft.document.activities[0];
	a.title =
		template === 'listening'
			? 'Mendengarkan & latihan'
			: template === 'writing'
				? 'Menulis'
				: 'Refleksi akhir';
	appendBlock(draft, a.id, 'instructions');
	appendBlock(
		draft,
		a.id,
		template === 'listening'
			? 'audio'
			: template === 'writing'
				? 'writing'
				: 'reflection',
	);
	if (template === 'listening') appendBlock(draft, a.id, 'matching');
}
export async function builderRequest<T>(
	action: string,
	body: Record<string, unknown> = {},
): Promise<T> {
	try {
		return await pb.send<T>('/api/laras/builder', {
			method: 'POST',
			body: { action, ...body },
			requestKey: null,
			signal: AbortSignal.timeout(20000),
		});
	} catch (e) {
		const error = e as { response?: { message?: string }; message?: string };
		throw new Error(
			error.response?.message ||
				error.message ||
				'Builder belum dapat dihubungi. Coba lagi.',
		);
	}
}
export function copyBuilder(
	source: BuilderEnvelope,
	kind: BuilderKind,
	context: BuilderDocument['context'],
): BuilderEnvelope {
	const ids = new Map<string, string>();
	const collect = (o: unknown) => {
		if (Array.isArray(o)) o.forEach(collect);
		else if (o && typeof o === 'object') {
			const v = o as Record<string, unknown>;
			if (typeof v.id === 'string' && !('de' in v)) ids.set(v.id, uid());
			Object.values(v).forEach(collect);
		}
	};
	collect(source.document);
	const remap = (o: unknown, field = ''): any =>
		typeof o === 'string'
			? [
					'id',
					'questionId',
					'questionIds',
					'criterionIds',
					'correctOptionId',
					'correctDestinationId',
				].includes(field)
				? ids.get(o) || o
				: o
			: Array.isArray(o)
				? o.map((v) => remap(v, field))
				: o && typeof o === 'object'
					? Object.fromEntries(
							Object.entries(o).map(([k, v]) => [
								['questionsById', 'answersByQuestionId'].includes(field)
									? ids.get(k) || k
									: k,
								remap(v, 'de' in o && k === 'id' ? 'translation' : k),
							]),
						)
					: o;
	const next = remap(source) as BuilderEnvelope;
	next.document.kind = kind;
	next.document.context = context;
	next.document.title = (source.document.title + ' (salinan)').slice(0, 200);
	next.document.delivery = blankBuilder(
		kind,
		context.courseId,
	).document.delivery;
	return next;
}
/** Copies authored content only. Attempts, participants, grading and schedule are never copied. */
export function copyScheduledToBuilder(
	state: import('./scheduled-classes').ScheduledClassState,
	context: BuilderDocument['context'],
	origin: string,
): BuilderEnvelope {
	const next = blankBuilder(
		'kelas',
		context.courseId,
		context.meetingId,
		context.sectionIds,
	);
	next.document.context = context;
	next.document.title = (
		(state.class?.title || state.session.title) + ' (salinan)'
	).slice(0, 200);
	next.document.instructions = rich(state.class?.instructions || '');
	next.document.activities = [];
	for (const source of state.activities) {
		const activity = newActivity(source.title);
		activity.required = source.required;
		activity.plannedMinutes = source.minutes;
		next.document.activities.push(activity);
		if (source.content) {
			const id = appendBlock(next, activity.id, 'instructions');
			activity.blocks.find((b) => b.id === id)!.body = rich(source.content);
		}
		if (source.lesson) {
			const id = appendBlock(next, activity.id, 'lesson');
			activity.blocks.find((b) => b.id === id)!.lesson = structuredClone({
				goal: source.lesson.goal,
				steps: source.lesson.steps,
				scenes: source.lesson.scenes,
			});
			for (const video of source.lesson.videos || []) {
				const bid = appendBlock(next, activity.id, 'video'),
					b = activity.blocks.find((b) => b.id === bid)!;
				b.url = new URL(video.src, origin).href;
				b.label = video.title.de;
			}
		}
		if (source.url && source.url.startsWith('https://')) {
			const bid = appendBlock(next, activity.id, 'reference'),
				b = activity.blocks.find((b) => b.id === bid)!;
			b.url = source.url;
			b.label = 'Materi kegiatan';
		}
		const questions = source.kind === 'quiz' ? source.questions || [] : [];
		for (const item of questions) {
			const id = appendQuestion(next, 'single_choice'),
				q = next.document.questionsById[id];
			q.prompt = rich(item.text);
			q.points = item.points;
			q.options = item.options.map((label) => ({ id: uid(), label }));
			next.privateKeys.answersByQuestionId[id] = {
				strategy: 'single_choice',
				correctOptionId: q.options[item.correctIndex]?.id || '',
				explanation: rich(item.explanation || ''),
			};
			activity.blocks.push({
				id: uid(),
				type: 'question_group',
				questionIds: [id],
			});
		}
		for (const item of source.worksheet?.items || []) {
			const key = source.worksheet?.answerKey?.items[item.id],
				kind: QuestionKind =
					item.type === 'select'
						? 'single_choice'
						: key?.mode === 'exact'
							? 'short_answer'
							: source.kind === 'exit_ticket'
								? 'reflection'
								: 'long_writing';
			const id = appendQuestion(next, kind),
				q = next.document.questionsById[id];
			q.prompt = rich(
				[item.prompt, item.translation].filter(Boolean).join('\n'),
			);
			if (item.type === 'select')
				q.options = item.options!.map((label) => ({ id: uid(), label }));
			if (key?.mode === 'exact') {
				q.points = key.points;
				next.privateKeys.answersByQuestionId[id] =
					item.type === 'select'
						? {
								strategy: 'single_choice',
								correctOptionId:
									q.options?.find((o) => key.accepted.includes(o.label))?.id ||
									'',
							}
						: {
								strategy: 'exact_text',
								accepted: [...key.accepted],
								comparison: { ignoreCase: true, ignorePunctuation: true },
							};
			}
			if (key?.mode === 'reference')
				next.privateKeys.answersByQuestionId[id] = {
					strategy: 'rubric',
					modelAnswer: rich(key.modelAnswer || ''),
					privateGuidance: rich(key.rubric || ''),
				};
			activity.blocks.push({
				id: uid(),
				type:
					kind === 'long_writing'
						? 'writing'
						: kind === 'reflection'
							? 'reflection'
							: 'question_group',
				...(kind === 'long_writing'
					? { questionId: id }
					: { questionIds: [id] }),
			});
		}
		if (!activity.blocks.length)
			appendBlock(next, activity.id, 'acknowledgement');
	}
	return next;
}

/** Stable draft comparison: field order is irrelevant; activity/element order is meaningful. */
export function encodeBuilderDraft(envelope: BuilderEnvelope): string {
	return JSON.stringify(envelope, (_key, value) =>
		value && typeof value === 'object' && !Array.isArray(value)
			? Object.fromEntries(
					Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')),
				)
			: value,
	);
}
