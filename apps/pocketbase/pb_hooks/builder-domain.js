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
			const content = [];
			for (const t of list(p.content, 100)) {
				obj(t);
				if (t.type !== 'text') fail('Teks tidak valid.');
				const marks = Array.isArray(t.marks)
					? [...new Set(t.marks.filter((mark) => mark === 'bold' || mark === 'italic'))].sort()
					: [];
				const prior = content[content.length - 1];
				const text = str(t.text, 20000);
				if (prior && JSON.stringify(prior.marks || []) === JSON.stringify(marks)) prior.text += text;
				else content.push({ type: 'text', text, ...(marks.length ? { marks } : {}) });
			}
			return {
				type: 'paragraph',
				content,
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
function asset(value) {
	const a = obj(value);
	if (!/^[a-z0-9]{15}$/.test(a.fileId)) fail('ID berkas tidak valid.');
	return {
		fileId: a.fileId,
		filename: str(a.filename, 500),
		version: num(a.version, 1000000),
		name: str(a.name, 200),
	};
}
function appearance(value) {
	const source = obj(value),
		out = {};
	const options = {
		size: ['sm', 'base', 'lg', 'xl'],
		weight: ['regular', 'medium', 'bold'],
		leading: ['compact', 'normal', 'relaxed'],
		align: ['start', 'center', 'end'],
		color: ['ink', 'muted', 'accent'],
		background: ['none', 'muted', 'accent'],
		padding: ['none', 'sm', 'md', 'lg'],
		border: ['none', 'subtle', 'accent'],
		radius: ['none', 'sm', 'md', 'lg'],
		shadow: ['none', 'sm', 'md'],
	};
	for (const key of Object.keys(options)) {
		if (source[key] === undefined) continue;
		if (!options[key].includes(source[key]))
			fail('Pengaturan tampilan tidak valid: ' + key);
		out[key] = source[key];
	}
	return out;
}
function layoutBackground(value) {
	const source = obj(value), tokens = ['surface', 'surface-2', 'action'];
	if (source.mode === 'image') {
		if (!source.asset) fail('Pilih berkas gambar untuk latar.');
		if (source.fit !== undefined && !['cover', 'contain'].includes(source.fit)) fail('Tampilan gambar latar tidak valid.');
		for (const key of ['positionX', 'positionY']) if (source[key] !== undefined && (!Number.isInteger(source[key]) || source[key] < 0 || source[key] > 100)) fail('Posisi gambar latar harus 0–100.');
		if (source.overlay !== undefined && !tokens.includes(source.overlay)) fail('Lapisan latar tidak valid.');
		if (source.opacity !== undefined && (!Number.isInteger(source.opacity) || source.opacity < 0 || source.opacity > 60)) fail('Opasitas latar harus 0–60 persen.');
		if ((source.overlay === undefined) !== (source.opacity === undefined)) fail('Lapisan latar dan opasitas harus diatur bersama.');
		return { mode: 'image', asset: asset(source.asset), fit: source.fit || 'cover', positionX: source.positionX === undefined ? 50 : source.positionX, positionY: source.positionY === undefined ? 50 : source.positionY, ...(source.overlay !== undefined ? { overlay: source.overlay, opacity: source.opacity } : {}) };
	}
	if (source.mode === 'solid') {
		if (!tokens.includes(source.token)) fail('Warna latar bagian tidak valid.');
		return { mode: 'solid', token: source.token };
	}
	if (source.mode !== 'gradient') fail('Jenis latar bagian tidak valid.');
	if (!tokens.includes(source.from) || !tokens.includes(source.to)) fail('Warna gradien bagian tidak valid.');
	if (!Number.isInteger(source.angle) || source.angle < 0 || source.angle > 360) fail('Arah gradien harus 0–360 derajat.');
	if (source.overlay !== undefined && !tokens.includes(source.overlay)) fail('Lapisan latar tidak valid.');
	if (source.opacity !== undefined && (!Number.isInteger(source.opacity) || source.opacity < 0 || source.opacity > 60)) fail('Opasitas latar harus 0–60 persen.');
	if ((source.overlay === undefined) !== (source.opacity === undefined)) fail('Lapisan latar dan opasitas harus diatur bersama.');
	return { mode: 'gradient', from: source.from, to: source.to, angle: source.angle, ...(source.overlay !== undefined ? { overlay: source.overlay, opacity: source.opacity } : {}) };
}
function documentAssets(document) {
	const assets = [];
	for (const activity of document.activities || []) {
		for (const block of activity.blocks || []) {
			if (block.asset) assets.push({ asset: block.asset, kind: block.type });
			for (const image of block.images || []) if (image.asset) assets.push({ asset: image.asset, kind: 'image' });
		}
		const visit = (nodes) => { for (const node of nodes || []) { if (node.background && node.background.mode === 'image' && node.background.asset) assets.push({ asset: node.background.asset, kind: 'image' }); visit(node.children); } };
		visit(activity.layout && activity.layout.nodes);
	}
	return assets;
}
function layout(value, blockIds, unique) {
	const source = obj(value);
	if (source.schemaVersion !== 1) fail('Versi tata letak tidak didukung.');
	const refs = new Set();
	let groups = 0,
		nodes = 0;
	const node = (value, depth) => {
		obj(value);
		if (++nodes > 600) fail('Jumlah simpul tata letak melewati batas.');
		if (value.kind === 'block') {
			const blockId = id(value.blockId);
			if (!blockIds.has(blockId) || refs.has(blockId))
				fail('Referensi elemen tata letak tidak valid.');
			refs.add(blockId);
			return { kind: 'block', blockId };
		}
		if (!['section', 'container'].includes(value.kind))
			fail('Jenis bagian tata letak tidak didukung.');
		if (depth > 3 || ++groups > 40)
			fail('Kedalaman atau jumlah bagian tata letak melewati batas.');
		const columns = num(value.columns, 3);
		if (![1, 2, 3].includes(columns) || !Number.isInteger(columns))
			fail('Jumlah kolom bagian harus 1–3.');
		const gap = value.gap === undefined ? 'md' : value.gap;
		const padding = value.padding === undefined ? 'none' : value.padding;
		const surface = value.surface === undefined ? 'none' : value.surface;
		const width = value.width === undefined ? 'full' : value.width;
		if (!['full', 'contained'].includes(width)) fail('Lebar bagian tidak valid.');
		if (value.maxWidth !== undefined && (!Number.isFinite(value.maxWidth) || !Number.isInteger(value.maxWidth) || value.maxWidth < 320 || value.maxWidth > 1920)) fail('Lebar maksimum bagian tidak valid.');
		const weights = value.columnWeights;
		if (weights !== undefined && (!Array.isArray(weights) || weights.length !== columns || weights.some(weight => !Number.isFinite(weight) || weight < 1 || weight > 10))) fail('Rasio kolom tidak valid.');
		for (const [key, values] of [['direction', ['grid', 'row', 'column']], ['align', ['start', 'center', 'end', 'stretch']], ['distribute', ['start', 'center', 'end', 'between']]]) if (value[key] !== undefined && !values.includes(value[key])) fail('Arah atau perataan bagian tidak valid.');
		if (value.wrap !== undefined && typeof value.wrap !== 'boolean') fail('Pembungkusan bagian tidak valid.');
		if (!['none', 'sm', 'md', 'lg'].includes(gap))
			fail('Jarak bagian tidak valid.');
		if (!['none', 'sm', 'md'].includes(padding))
			fail('Padding bagian tidak valid.');
		if (!['none', 'muted', 'accent'].includes(surface))
			fail('Latar bagian tidak valid.');
		const responsive = {};
		const sides = (input, label) => {
			if (input === undefined) return undefined;
			const source = obj(input), clean = {};
			if (Object.keys(source).some(key => !['top', 'right', 'bottom', 'left'].includes(key))) fail(`${label} tidak valid.`);
			for (const side of ['top', 'right', 'bottom', 'left']) if (source[side] !== undefined) {
				if (!Number.isInteger(source[side]) || source[side] < 0 || source[side] > 120) fail(`${label} tidak valid.`);
				clean[side] = source[side];
			}
			return clean;
		};
		const spacing = (input, label) => {
			const source = obj(input), clean = {};
			if (Object.keys(source).some(key => !['columns', 'direction', 'align', 'distribute', 'wrap', 'gap', 'padding', 'paddingSides', 'paddingLinked', 'margin', 'marginLinked', 'rowGap', 'columnGap'].includes(key))) fail(`${label} tidak valid.`);
			for (const [key, values] of [['direction', ['grid', 'row', 'column']], ['align', ['start', 'center', 'end', 'stretch']], ['distribute', ['start', 'center', 'end', 'between']]]) if (source[key] !== undefined) {
				if (!values.includes(source[key])) fail(`${label} tidak valid.`);
				clean[key] = source[key];
			}
			if (source.wrap !== undefined) { if (typeof source.wrap !== 'boolean') fail(`${label} tidak valid.`); clean.wrap = source.wrap; }
			if (source.paddingSides !== undefined) clean.paddingSides = sides(source.paddingSides, label);
			if (source.margin !== undefined) clean.margin = sides(source.margin, label);
			for (const key of ['paddingLinked', 'marginLinked']) if (source[key] !== undefined) {
				if (typeof source[key] !== 'boolean') fail(`${label} tidak valid.`);
				clean[key] = source[key];
			}
			for (const key of ['rowGap', 'columnGap']) if (source[key] !== undefined) {
				if (!Number.isInteger(source[key]) || source[key] < 0 || source[key] > 80) fail(`${label} tidak valid.`);
				clean[key] = source[key];
			}
			return clean;
		};
		if (value.responsive !== undefined) {
			const input = obj(value.responsive);
			if (Object.keys(input).some((key) => !['tablet', 'mobile'].includes(key))) fail('Pengaturan perangkat tidak valid.');
			for (const device of ['tablet', 'mobile']) {
				if (input[device] === undefined) continue;
				const override = obj(input[device]), clean = {};
				if (Object.keys(override).some((key) => !['columns', 'direction', 'align', 'distribute', 'wrap', 'gap', 'padding', 'paddingSides', 'paddingLinked', 'margin', 'marginLinked', 'rowGap', 'columnGap'].includes(key))) fail('Pengaturan perangkat tidak valid.');
				if (override.columns !== undefined) {
					if (![1, 2, 3].includes(override.columns) || !Number.isInteger(override.columns)) fail('Kolom responsif tidak valid.');
					clean.columns = override.columns;
				}
				if (override.gap !== undefined) {
					if (!['none', 'sm', 'md', 'lg'].includes(override.gap)) fail('Jarak responsif tidak valid.');
					clean.gap = override.gap;
				}
				if (override.padding !== undefined) {
					if (!['none', 'sm', 'md'].includes(override.padding)) fail('Padding responsif tidak valid.');
					clean.padding = override.padding;
				}
				Object.assign(clean, spacing(override, 'Jarak perangkat'));
				responsive[device] = clean;
			}
		}
		return {
			kind: value.kind,
			id: unique(value.id),
			title: value.title === undefined ? '' : str(value.title, 200),
			columns,
			gap,
			padding,
			surface,
			...(value.background !== undefined ? { background: layoutBackground(value.background) } : {}),
			...(value.appearance !== undefined ? { appearance: appearance(value.appearance) } : {}),
			...(value.width !== undefined ? { width } : {}),
			...(value.maxWidth !== undefined ? { maxWidth: value.maxWidth } : {}),
			...(weights !== undefined ? { columnWeights: weights } : {}),
			...(value.direction !== undefined ? { direction: value.direction } : {}),
			...(value.align !== undefined ? { align: value.align } : {}),
			...(value.distribute !== undefined ? { distribute: value.distribute } : {}),
			...(value.wrap !== undefined ? { wrap: value.wrap } : {}),
			...(value.paddingSides !== undefined ? { paddingSides: sides(value.paddingSides, 'Padding') } : {}),
			...(value.paddingLinked !== undefined ? { paddingLinked: typeof value.paddingLinked === 'boolean' ? value.paddingLinked : fail('Padding tertaut tidak valid.') } : {}),
			...(value.margin !== undefined ? { margin: sides(value.margin, 'Margin') } : {}),
			...(value.marginLinked !== undefined ? { marginLinked: typeof value.marginLinked === 'boolean' ? value.marginLinked : fail('Margin tertaut tidak valid.') } : {}),
			...(value.rowGap !== undefined ? { rowGap: spacing({ rowGap: value.rowGap }, 'Jarak baris').rowGap } : {}),
			...(value.columnGap !== undefined ? { columnGap: spacing({ columnGap: value.columnGap }, 'Jarak kolom').columnGap } : {}),
			...(value.responsive !== undefined ? { responsive } : {}),
			children: list(value.children, 600).map((child) =>
				node(child, depth + 1),
			),
		};
	};
	return {
		schemaVersion: 1,
		nodes: list(source.nodes, 600).map((item) => node(item, 1)),
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
	const activities = list(d.activities, 50).map((a) => {
		const blockIds = new Set();
		const blocks = list(a.blocks, 500).map((b) => {
			if (++blockCount > 500 || !types.includes(b.type))
				fail('Jenis/jumlah elemen tidak didukung.');
			const out = { id: unique(b.id), type: b.type };
			if (b.appearance !== undefined) out.appearance = appearance(b.appearance);
			blockIds.add(out.id);
			if (b.body !== undefined) out.body = rich(b.body);
			if (b.label !== undefined) out.label = str(b.label, 500);
			if (b.url !== undefined) out.url = url(b.url);
			if (b.alt !== undefined) out.alt = str(b.alt, 1000);
			if (b.asset) {
				if (!['image', 'audio', 'video'].includes(b.type))
					fail('Berkas tidak cocok dengan elemen.');
				out.asset = asset(b.asset);
			}
			if (b.images) {
				if (b.type !== 'image') fail('Galeri hanya untuk gambar.');
				out.images = list(b.images, 4).map((image) => ({
					id: unique(image.id),
					...(image.asset ? { asset: asset(image.asset) } : {}),
					...(image.url ? { url: url(image.url) } : {}),
					alt: str(image.alt, 1000),
					caption: str(image.caption, 500),
				}));
			}
			if (b.columns !== undefined) {
				if (b.type !== 'image') fail('Kolom hanya untuk gambar.');
				out.columns = num(b.columns, 4);
				if (!Number.isInteger(out.columns) || out.columns < 1)
					fail('Kolom gambar harus 1–4.');
			}
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
		});
		const activity = {
			id: unique(a.id),
			title: str(a.title, 200),
			required: Boolean(a.required),
			plannedMinutes: num(a.plannedMinutes, 600),
			blocks,
		};
		if (a.layout !== undefined)
			activity.layout = layout(a.layout, blockIds, unique);
		return activity;
	});
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
		if (k.review !== undefined) {
			if (!k.review || !['printed', 'inferred', 'unknown'].includes(k.review.source) || typeof k.review.confirmed !== 'boolean')
				fail('Status tinjauan kunci tidak valid.');
			out.review = { source: k.review.source, confirmed: k.review.confirmed };
		}
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
module.exports = { normalize, documentAssets };
