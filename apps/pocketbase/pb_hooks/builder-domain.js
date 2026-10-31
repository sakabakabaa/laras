// Pure authoring contract. No student endpoints consume this private envelope.
const types = [
	'instructions',
	'image',
	'audio',
	'video',
	'reference',
	'question_group',
	'matching',
	'gap_passage',
	'writing',
	'reflection',
	'acknowledgement',
	'lesson',
];
function fail(message) {
	throw new Error(message);
}
function obj(v) {
	if (!v || typeof v !== 'object' || Array.isArray(v))
		fail('Struktur draf tidak valid.');
	return v;
}
function list(v, max) {
	if (!Array.isArray(v) || v.length > max)
		fail('Jumlah elemen draf melewati batas.');
	return v;
}
function str(v, max = 10000) {
	if (typeof v !== 'string' || v.length > max)
		fail('Teks draf tidak valid atau terlalu panjang.');
	return v;
}
function id(v) {
	const s = str(v, 80);
	if (
		!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(s) ||
		['__proto__', 'prototype', 'constructor'].includes(s)
	)
		fail('ID elemen tidak valid.');
	return s;
}
function num(v, max = 100000) {
	if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max)
		fail('Nilai angka draf tidak valid.');
	return v;
}
function rich(v) {
	obj(v);
	if (v.type !== 'doc') fail('Format teks tidak didukung.');
	return {
		type: 'doc',
		content: list(v.content, 100).map((p) => {
			obj(p);
			if (p.type !== 'paragraph') fail('Paragraf tidak valid.');
			return {
				type: 'paragraph',
				content: list(p.content, 100).map((t) => {
					obj(t);
					if (t.type !== 'text') fail('Teks tidak valid.');
					return { type: 'text', text: str(t.text, 20000) };
				}),
			};
		}),
	};
}
function url(v) {
	const s = str(v || '', 2000);
	if (s && !/^https:\/\/[^\s<>"']+$/i.test(s))
		fail('Gunakan tautan HTTPS yang valid.');
	return s;
}
function pair(v) {
	obj(v);
	return { de: str(v.de, 10000), id: str(v.id, 10000) };
}
function lesson(v) {
	obj(v);
	return {
		goal: pair(v.goal),
		steps: list(v.steps, 30).map(pair),
		scenes: list(v.scenes, 30).map((s) => {
			obj(s);
			if (
				![
					'context',
					'comparison',
					'sentence',
					'conjugation',
					'dialogue',
				].includes(s.kind)
			)
				fail('Jenis penjelasan tidak didukung.');
			const out = { kind: s.kind, title: pair(s.title), intro: pair(s.intro) };
			if (s.cards)
				out.cards = list(s.cards, 20).map((c) => {
					if (!['neutral', 'must', 'may', 'stop'].includes(c.tone))
						fail('Gaya kartu tidak valid.');
					return { label: str(c.label, 200), text: pair(c.text), tone: c.tone };
				});
			if (s.sentence) {
				out.sentence = {
					words: list(s.sentence.words, 30).map((w) => str(w, 200)),
					roles: list(s.sentence.roles, 30).map((w) => str(w, 200)),
					translation: str(s.sentence.translation, 2000),
				};
				if (out.sentence.words.length !== out.sentence.roles.length)
					fail('Kalimat penjelasan tidak valid.');
			}
			if (s.turns)
				out.turns = list(s.turns, 30).map((t) => {
					if (!['doctor', 'patient'].includes(t.role))
						fail('Peran dialog tidak valid.');
					return { role: t.role, text: pair(t.text) };
				});
			if (
				(s.kind === 'sentence' && !out.sentence) ||
				(s.kind === 'dialogue' && !out.turns)
			)
				fail('Lengkapi penjelasan interaktif.');
			return out;
		}),
	};
}
function normalize(body) {
	const d = obj(body.document),
		priv = obj(body.privateKeys);
	if (d.schemaVersion !== 1 || priv.schemaVersion !== 1)
		fail('Versi draf tidak didukung.');
	if (!['kelas', 'tugas'].includes(d.kind)) fail('Jenis dokumen tidak valid.');
	const context = obj(d.context),
		delivery = obj(d.delivery),
		questions = obj(d.questionsById),
		keys = obj(priv.answersByQuestionId);
	if (Object.keys(questions).length > 500 || Object.keys(keys).length > 500)
		fail('Maksimum 500 butir per dokumen.');
	const seen = new Set(),
		locations = {};
	const unique = (v) => {
		const value = id(v);
		if (seen.has(value)) fail('ID elemen ganda.');
		seen.add(value);
		return value;
	};
	const questionsById = {};
	for (const qid of Object.keys(questions)) {
		const q = obj(questions[qid]);
		if (
			qid !== q.id ||
			![
				'single_choice',
				'short_answer',
				'matching',
				'long_writing',
				'reflection',
			].includes(q.kind)
		)
			fail('Jenis atau identitas pertanyaan tidak valid.');
		const out = {
			id: unique(qid),
			kind: q.kind,
			prompt: rich(q.prompt),
			required: Boolean(q.required),
			points: num(q.points),
		};
		if (q.kind === 'single_choice')
			out.options = list(q.options, 100).map((o) => ({
				id: unique(o.id),
				label: str(o.label, 2000),
			}));
		if (q.maxCharacters !== undefined)
			out.maxCharacters = num(q.maxCharacters, 100000);
		if (q.rubric)
			out.rubric = {
				criteria: list(q.rubric.criteria, 30).map((c) => ({
					id: unique(c.id),
					label: str(c.label, 1000),
					maxPoints: num(c.maxPoints),
				})),
			};
		questionsById[qid] = out;
	}
	let blockCount = 0;
	const reference = (q) => {
		const value = id(q);
		if (!questionsById[value]) fail('Butir yang dirujuk tidak ditemukan.');
		locations[value] = (locations[value] || 0) + 1;
		return value;
	};
	const activities = list(d.activities, 50).map((a) => ({
		id: unique(a.id),
		title: str(a.title, 200),
		required: Boolean(a.required),
		plannedMinutes: num(a.plannedMinutes, 600),
		blocks: list(a.blocks, 500).map((b) => {
			if (++blockCount > 500 || !types.includes(b.type))
				fail('Jenis/jumlah elemen tidak didukung.');
			const out = { id: unique(b.id), type: b.type };
			if (b.body !== undefined) out.body = rich(b.body);
			if (b.label !== undefined) out.label = str(b.label, 500);
			if (b.url !== undefined) out.url = url(b.url);
			if (b.alt !== undefined) out.alt = str(b.alt, 1000);
			if (b.questionIds)
				out.questionIds = list(b.questionIds, 500).map(reference);
			if (b.questionId) out.questionId = reference(b.questionId);
			if (b.destinations)
				out.destinations = list(b.destinations, 100).map((t) => ({
					id: unique(t.id),
					label: str(t.label, 100),
					title: str(t.title, 1000),
					...(t.url ? { url: url(t.url) } : {}),
				}));
			if (b.sections)
				out.sections = list(b.sections, 100).map((s) => ({
					id: unique(s.id),
					segments: list(s.segments, 1000).map((t) => {
						if (t.type === 'text')
							return { type: 'text', text: str(t.text, 20000) };
						if (t.type === 'gap')
							return { type: 'gap', questionId: reference(t.questionId) };
						fail('Bagian isian tidak valid.');
					}),
				}));
			if (b.lesson) out.lesson = lesson(b.lesson);
			return out;
		}),
	}));
	const answersByQuestionId = {};
	for (const qid of Object.keys(keys)) {
		if (!questionsById[qid]) fail('Kunci merujuk pertanyaan yang tidak ada.');
		const k = obj(keys[qid]);
		if (
			![
				'single_choice',
				'exact_text',
				'matching',
				'rubric',
				'feedback_only',
			].includes(k.strategy)
		)
			fail('Strategi penilaian tidak valid.');
		const out = { strategy: k.strategy };
		if (k.correctOptionId !== undefined) {
			out.correctOptionId = k.correctOptionId ? id(k.correctOptionId) : '';
			if (
				out.correctOptionId &&
				!questionsById[qid].options?.some((o) => o.id === out.correctOptionId)
			)
				fail('Kunci pilihan tidak ditemukan.');
		}
		if (k.correctDestinationId !== undefined) {
			out.correctDestinationId = k.correctDestinationId
				? id(k.correctDestinationId)
				: '';
			if (
				out.correctDestinationId &&
				!activities.some((a) =>
					a.blocks.some(
						(b) =>
							b.questionIds?.includes(qid) &&
							b.destinations?.some((t) => t.id === out.correctDestinationId),
					),
				)
			)
				fail('Kunci pasangan tidak ditemukan.');
		}
		if (k.accepted)
			out.accepted = list(k.accepted, 100).map((v) => str(v, 2000));
		if (k.comparison)
			out.comparison = {
				ignoreCase: Boolean(k.comparison.ignoreCase),
				ignorePunctuation: Boolean(k.comparison.ignorePunctuation),
			};
		for (const field of ['modelAnswer', 'privateGuidance', 'explanation'])
			if (k[field] !== undefined) out[field] = rich(k[field]);
		answersByQuestionId[qid] = out;
	}
	for (const qid of Object.keys(questionsById))
		if (locations[qid] !== 1 || !answersByQuestionId[qid])
			fail(
				'Setiap butir harus memiliki satu tempat menjawab dan pengaturan penilaian.',
			);
	for (const qid of Object.keys(questionsById)) {
		const q = questionsById[qid],
			k = answersByQuestionId[qid],
			allowed = {
				single_choice: ['single_choice'],
				short_answer: ['exact_text'],
				matching: ['matching'],
				long_writing: ['rubric'],
				reflection: ['feedback_only', 'rubric'],
			};
		if (!allowed[q.kind].includes(k.strategy))
			fail('Strategi penilaian tidak sesuai jenis pertanyaan.');
		if (k.strategy === 'feedback_only' && q.points !== 0)
			fail('Butir tanpa nilai harus bernilai 0 poin.');
	}
	for (const a of activities)
		for (const b of a.blocks) {
			const ids = [
				...(b.questionIds || []),
				...(b.questionId ? [b.questionId] : []),
				...(b.sections || []).flatMap((s) =>
					s.segments.filter((t) => t.type === 'gap').map((t) => t.questionId),
				),
			];
			const allowed =
				{
					question_group: ['single_choice', 'short_answer'],
					matching: ['matching'],
					gap_passage: ['short_answer'],
					writing: ['long_writing'],
					reflection: ['reflection'],
				}[b.type] || [];
			for (const qid of ids)
				if (!allowed.includes(questionsById[qid].kind))
					fail('Pertanyaan tidak sesuai dengan jenis elemen.');
		}
	if (
		delivery.kind !== d.kind ||
		!['scheduled', 'guided', 'free'].includes(delivery.progression) ||
		delivery.timeZone !== 'Asia/Jakarta'
	)
		fail('Pengaturan pelaksanaan tidak valid.');
	const deliveryOut = {
		kind: d.kind,
		progression: delivery.progression,
		timeZone: 'Asia/Jakarta',
		lateAfterMinutes: num(delivery.lateAfterMinutes, 1440),
		allowLate: Boolean(delivery.allowLate),
		timeLimitMinutes: num(delivery.timeLimitMinutes, 1440),
	};
	for (const field of [
		'startsAt',
		'endsAt',
		'checkInClosesAt',
		'availableAt',
		'dueAt',
		'hardCloseAt',
	]) {
		deliveryOut[field] = str(delivery[field] || '', 80);
		if (deliveryOut[field] && !Number.isFinite(Date.parse(deliveryOut[field])))
			fail('Waktu tidak valid.');
	}
	return {
		document: {
			schemaVersion: 1,
			kind: d.kind,
			context: {
				courseId: id(context.courseId),
				meetingId: context.meetingId ? id(context.meetingId) : '',
				sectionIds: list(context.sectionIds, 30).map(id),
			},
			title: str(d.title, 200),
			instructions: rich(d.instructions),
			activities,
			questionsById,
			delivery: deliveryOut,
			scoring: { mode: 'points' },
			results: { release: 'manual' },
		},
		privateKeys: { schemaVersion: 1, answersByQuestionId },
	};
}
module.exports = { normalize };
