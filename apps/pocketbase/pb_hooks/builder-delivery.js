const domain = require(__hooks + '/builder-domain.js');
const rows = (app, name, filter, params = {}, limit = 1000) =>
	app.findRecordsByFilter(name, filter, '', limit, 0, params);
const find = (app, name, filter, params) =>
	rows(app, name, filter, params, 1)[0];
const data = (r, field, fallback = {}) => {
	try {
		return JSON.parse(r.getString(field) || JSON.stringify(fallback));
	} catch (_) {
		return fallback;
	}
};
const plain = (r) =>
	(r?.content || [])
		.map((p) => (p.content || []).map((t) => t.text || '').join(''))
		.join('\n');
const ids = (b) => [
	...(b.questionIds || []),
	...(b.questionId ? [b.questionId] : []),
	...(b.sections || []).flatMap((s) =>
		s.segments.flatMap((t) => (t.type === 'gap' ? [t.questionId] : [])),
	),
];
function ownedDraft(app, user, id) {
	const r = app.findRecordById('builder_documents', String(id || ''));
	if (user.getString('role') !== 'faculty' || r.getString('owner') !== user.id)
		throw new ForbiddenError('Draf tidak tersedia.');
	const d = data(r, 'document');
	if (
		app.findRecordById('courses', d.context.courseId).getString('owner') !==
		user.id
	)
		throw new ForbiddenError('Mata kuliah tidak tersedia.');
	return r;
}
function member(app, user, d) {
	if (
		user.getString('role') !== 'student' ||
		!find(app, 'enrollments', 'course={:c} && owner={:u}', {
			c: d.context.courseId,
			u: user.id,
		})
	)
		return false;
	if (!d.context.sectionIds.length) return true;
	const nim = require(__hooks + '/section-membership.js').studentNim(user);
	const roster = nim
		? rows(app, 'course_roster', 'course={:c} && nim={:n}', {
				c: d.context.courseId,
				n: nim,
			})
		: [];
	return (
		roster.length === 1 &&
		d.context.sectionIds.includes(roster[0].getString('section'))
	);
}
function context(app, user, runId) {
	const run = app.findRecordById('builder_runs', String(runId || '')),
		version = app.findRecordById('builder_versions', run.getString('version')),
		d = data(version, 'content');
	const owner =
		user.getString('role') === 'faculty' &&
		run.getString('owner') === user.id &&
		app
			.findRecordById('courses', run.getString('course'))
			.getString('owner') === user.id;
	if (!owner && !member(app, user, d))
		throw new ForbiddenError('Kegiatan tidak tersedia untuk akun ini.');
	const key = find(app, 'builder_version_keys', 'version={:v}', {
		v: version.id,
	});
	return {
		run,
		version,
		d,
		owner,
		keys: data(key, 'keys').answersByQuestionId || {},
	};
}
function publishIssues(d, keys) {
	const errors = [];
	const add = (m) => errors.push(m);
	if (!d.title.trim() || !d.activities.length)
		add('Lengkapi judul dan kegiatan.');
	for (const a of d.activities) {
		if (!a.title.trim() || !a.blocks.length)
			add('Lengkapi kegiatan ' + a.title);
		if (d.kind === 'kelas' && a.plannedMinutes < 1)
			add('Durasi kegiatan minimal 1 menit.');
		for (const b of a.blocks) {
			if (b.type === 'instructions' && !plain(b.body).trim())
				add('Isi instruksi.');
			if (
				['image', 'audio', 'video', 'reference'].includes(b.type) &&
				!b.url &&
				!b.asset &&
				!b.images?.length
			)
				add('Pilih media.');
			if (
				b.type === 'image' &&
				(b.images?.length
					? b.images.some((i) => !i.alt.trim() || (!i.asset && !i.url))
					: !b.alt?.trim())
			)
				add('Lengkapi gambar dan teks alternatif.');
			if (b.type === 'lesson' && !b.lesson?.scenes?.length)
				add('Lengkapi penjelasan interaktif.');
			if (
				[
					'question_group',
					'matching',
					'gap_passage',
					'writing',
					'reflection',
				].includes(b.type) &&
				!ids(b).length
			)
				add('Tambahkan pertanyaan.');
			for (const id of ids(b)) {
				const q = d.questionsById[id],
					k = keys[id];
				if (!plain(q.prompt).trim()) add('Isi pertanyaan.');
				if (q.options?.some((o) => !o.label.trim())) add('Lengkapi pilihan.');
				if (
					(k.strategy === 'single_choice' && !k.correctOptionId) ||
					(k.strategy === 'exact_text' && !k.accepted?.some((v) => v.trim())) ||
					(k.strategy === 'matching' && !k.correctDestinationId)
				)
					add('Lengkapi kunci jawaban.');
				if (q.rubric?.criteria.some((c) => !c.label.trim()))
					add('Lengkapi nama kriteria rubrik.');
				if (
					q.rubric?.criteria.length &&
					Math.abs(
						q.rubric.criteria.reduce((sum, c) => sum + c.maxPoints, 0) -
							q.points,
					) > 0.00001
				)
					add('Poin rubrik tidak sesuai.');
			}
		}
	}
	const t = d.delivery;
	if (d.kind === 'kelas') {
		if (!d.context.meetingId || !t.startsAt || !t.endsAt || !t.checkInClosesAt)
			add('Lengkapi pertemuan, waktu kelas, dan batas check-in.');
		if (Date.parse(t.endsAt) <= Date.parse(t.startsAt))
			add('Waktu selesai harus setelah mulai.');
		if (
			Date.parse(t.checkInClosesAt) < Date.parse(t.startsAt) ||
			Date.parse(t.checkInClosesAt) > Date.parse(t.endsAt)
		)
			add('Batas check-in harus dalam waktu kelas.');
		if (Date.parse(t.endsAt) <= Date.now()) add('Jadwal kelas sudah berakhir.');
	} else {
		if (!t.dueAt) add('Isi batas pengumpulan.');
		if (t.availableAt && Date.parse(t.availableAt) >= Date.parse(t.dueAt))
			add('Waktu tersedia harus sebelum batas pengumpulan.');
		if (t.hardCloseAt && Date.parse(t.hardCloseAt) < Date.parse(t.dueAt))
			add('Tutup pengumpulan harus setelah batas pengumpulan.');
		if (Date.parse(t.hardCloseAt || t.dueAt) <= Date.now())
			add('Jadwal tugas sudah berakhir.');
	}
	return Array.from(new Set(errors));
}
function available(d, now) {
	return (
		now >=
		Date.parse(
			d.kind === 'kelas'
				? d.delivery.startsAt
				: d.delivery.availableAt || '1970-01-01',
		)
	);
}
function endTime(ctx, response) {
	const t = ctx.d.delivery;
	let end =
		ctx.d.kind === 'kelas'
			? Date.parse(t.endsAt)
			: t.allowLate
				? Date.parse(t.hardCloseAt || '9999-01-01')
				: Date.parse(t.dueAt);
	if (ctx.d.kind !== 'kelas' && t.timeLimitMinutes > 0 && response?.getString('startedAt'))
		end = Math.min(
			end,
			Date.parse(response.getString('startedAt')) + t.timeLimitMinutes * 60000,
		);
	return end;
}
function openActivity(ctx, index, now, response) {
	if (
		ctx.run.getBool('closed') ||
		!response ||
		!available(ctx.d, now) ||
		now >= endTime(ctx, response)
	)
		return false;
	// Activities share the session deadline; planned minutes are guidance only.
	return true;
}
function finalize(app, ctx, response, now) {
	if (!response || response.getString('submittedAt')) return;
	if (now >= endTime(ctx, response) || ctx.run.getBool('closed')) {
		response.set('submittedAt', new Date(now).toISOString());
		response.set(
			'submittedActivities',
			ctx.d.activities.map((a) => a.id),
		);
		response.set('revision', response.getInt('revision') + 1);
		app.save(response);
	}
}
function normalizedText(value, comparison) {
	let text = String(value).trim().replace(/\s+/g, ' ');
	if (comparison?.ignoreCase) text = text.toLowerCase();
	if (comparison?.ignorePunctuation)
		text = text.replace(/[.,!?;:"'()\[\]{}–—-]/g, '');
	return text.replace(/\s+/g, ' ').trim();
}
function scoring(ctx, response) {
	const answers = data(response, 'answers'),
		manual = data(response, 'manual'),
		items = {};
	let earned = 0,
		total = 0,
		pending = 0;
	for (const [id, q] of Object.entries(ctx.d.questionsById)) {
		const key = ctx.keys[id],
			answer = answers[id] || '';
		let score = 0,
			needsReview = false;
		if (key.strategy === 'rubric') {
			needsReview = Boolean(answer.trim()) && q.points > 0;
		} else if (key.strategy === 'single_choice')
			score = answer && answer === key.correctOptionId ? q.points : 0;
		else if (key.strategy === 'matching')
			score = answer && answer === key.correctDestinationId ? q.points : 0;
		else if (key.strategy === 'exact_text')
			score =
				answer &&
				(key.accepted || []).some(
					(a) =>
						normalizedText(a, key.comparison) ===
						normalizedText(answer, key.comparison),
				)
					? q.points
					: 0;
		if (manual[id]) {
			score = manual[id].score;
			needsReview = false;
		}
		if (needsReview) pending++;
		total += q.points;
		earned += score;
		items[id] = {
			score,
			max: q.points,
			pending: needsReview,
			feedback: manual[id]?.feedback || '',
			overridden: Boolean(manual[id]),
			...(manual[id]?.criteria ? { criteria: manual[id].criteria } : {}),
		};
	}
	return {
		earned,
		total,
		score: total ? Math.round((earned / total) * 10000) / 100 : 0,
		pending,
		items,
	};
}
function publicResponse(ctx, response) {
	return response
		? {
				id: response.id,
				revision: response.getInt('revision'),
				answers: data(response, 'answers'),
				submittedActivities: data(response, 'submittedActivities', []),
				startedAt: response.getString('startedAt'),
				submittedAt: response.getString('submittedAt'),
				deadline: new Date(endTime(ctx, response)).toISOString(),
				released: data(response, 'released', null),
			}
		: null;
}
function publicState(app, ctx, user) {
	const now = Date.now(),
		response = find(app, 'builder_responses', 'run={:r} && student={:s}', {
			r: ctx.run.id,
			s: user.id,
		});
	finalize(app, ctx, response, now);
	return {
		id: ctx.run.id,
		title: ctx.run.getString('title'),
		kind: ctx.d.kind,
		owner: ctx.owner,
		serverNow: new Date(now).toISOString(),
		closed: ctx.run.getBool('closed'),
		revision: ctx.version.getInt('revision'),
		available: available(ctx.d, now),
		document: ctx.owner || available(ctx.d, now) ? ctx.d : null,
		delivery: ctx.d.delivery,
		response: publicResponse(ctx, response),
		openActivityIds: ctx.d.activities
			.filter((_, i) => openActivity(ctx, i, now, response))
			.map((a) => a.id),
		activeIndex: ctx.run.getInt('activeIndex'),
	};
}
function handle(app, user, body) {
	if (body.action === 'publish') {
		const source = ownedDraft(app, user, body.id);
		if (!/^[a-zA-Z0-9_-]{1,80}$/.test(String(body.commandId || '')))
			throw new BadRequestError('Identitas penerbitan tidak valid.');
		const existing = find(
			app,
			'builder_versions',
			'owner={:u} && commandId={:c}',
			{ u: user.id, c: body.commandId },
		);
		if (existing) {
			const run = find(app, 'builder_runs', 'version={:v}', { v: existing.id });
			return { runId: run.id };
		}
		if (body.baseRevision !== source.getInt('revision'))
			throw new BadRequestError('Draf berubah. Simpan lalu tinjau ulang.');
		const key = find(app, 'builder_private_keys', 'document={:d}', {
				d: source.id,
			}),
			normalized = domain.normalize({
				document: data(source, 'document'),
				privateKeys: data(key, 'keys'),
			});
		require(__hooks + '/builder-service.js').authorizeContext(
			app,
			user,
			normalized.document,
		);
		require(__hooks + '/builder-service.js').authorizeAssets(
			app,
			user,
			normalized.document,
		);
		const issues = publishIssues(
			normalized.document,
			normalized.privateKeys.answersByQuestionId,
		);
		if (issues.length) throw new BadRequestError(issues.join(' '));
		const version = new Record(
			app.findCollectionByNameOrId('builder_versions'),
		);
		version.load({
			document: source.id,
			owner: user.id,
			course: source.getString('course'),
			revision: source.getInt('revision'),
			commandId: body.commandId,
			content: normalized.document,
		});
		app.save(version);
		const privateKeys = new Record(
			app.findCollectionByNameOrId('builder_version_keys'),
		);
		privateKeys.load({ version: version.id, keys: normalized.privateKeys });
		app.save(privateKeys);
		const run = new Record(app.findCollectionByNameOrId('builder_runs'));
		run.load({
			version: version.id,
			owner: user.id,
			course: source.getString('course'),
			title: source.getString('title'),
			kind: source.getString('kind'),
			activeIndex: 0,
		});
		app.save(run);
		return { runId: run.id };
	}
	if (body.action === 'list') {
		const params = { u: user.id, c: String(body.courseId || '') };
		let filter;
		if (user.getString('role') === 'faculty') filter = 'owner={:u}';
		else {
			const enrollments = rows(app, 'enrollments', 'owner={:u}', {
				u: user.id,
			});
			if (!enrollments.length) return { items: [] };
			filter =
				'(' +
				enrollments
					.map((enrollment, index) => {
						params['course' + index] = enrollment.getString('course');
						return 'course={:course' + index + '}';
					})
					.join(' || ') +
				')';
		}
		if (body.courseId) filter += ' && course={:c}';
		const runs = app.findRecordsByFilter(
			'builder_runs',
			filter,
			'-created',
			500,
			0,
			params,
		);
		return {
			items: runs.flatMap((run) => {
				if (body.kind && run.getString('kind') !== body.kind) return [];
				try {
					const ctx = context(app, user, run.id);
					if (
						body.documentId &&
						ctx.version.getString('document') !== body.documentId
					)
						return [];
                    const studentResponse = ctx.owner ? null : find(app, 'builder_responses', 'run={:r} && student={:s}', {r:run.id,s:user.id});
					return [
						{
							id: run.id,
							title: run.getString('title'),
							kind: ctx.d.kind,
							closed: run.getBool('closed'),
							revision: ctx.version.getInt('revision'),
							startsAt: ctx.d.delivery.startsAt || ctx.d.delivery.availableAt,
							dueAt: ctx.d.delivery.dueAt || ctx.d.delivery.endsAt,
                            checkInClosesAt: ctx.d.delivery.checkInClosesAt || '',
                            closesAt: new Date(endTime(ctx, studentResponse)).toISOString(),
                            startedAt: studentResponse?.getString('startedAt') || '',
                            submittedAt: studentResponse?.getString('submittedAt') || '',
                            feedbackReady: Boolean(studentResponse && Object.keys(data(studentResponse,'released',null) || {}).length),
							courseTitle: app
								.findRecordById('courses', run.getString('course'))
								.getString('title'),
						},
					];
				} catch (_) {
					return [];
				}
			}),
		};
	}
	const ctx = context(app, user, body.runId),
		now = Date.now();
	if (body.action === 'state') return publicState(app, ctx, user);
	if (body.action === 'media') {
		if (!ctx.owner && !available(ctx.d, now))
			throw new ForbiddenError('Kegiatan belum tersedia.');
		const assets = ctx.d.activities.flatMap((a) =>
			a.blocks.flatMap((b) =>
				[b.asset, ...(b.images || []).map((i) => i.asset)].filter(Boolean),
			),
		);
		const asset = assets.find(
			(a) =>
				a.fileId === body.fileId &&
				a.filename === body.filename &&
				a.version === body.version,
		);
		if (!asset) throw new ForbiddenError('Media tidak termasuk versi ini.');
		const file = app.findRecordById('file_library', asset.fileId);
		if (file.getString('owner') !== ctx.run.getString('owner'))
			throw new ForbiddenError('Media tidak tersedia.');
		if (
			file.getString('file') !== asset.filename ||
			(file.getInt('version') || 1) !== asset.version
		) {
			const prior = find(app, 'file_versions', 'file={:f} && version={:v}', {
				f: file.id,
				v: asset.version,
			});
			if (
				!prior ||
				prior.getString('filename') !== asset.filename ||
				!prior.getString('fileData')
			)
				throw new BadRequestError('Versi media tidak tersedia.');
		}
		return { asset };
	}
	if (
		['advance', 'close', 'review', 'grade', 'release'].includes(body.action)
	) {
		if (!ctx.owner)
			throw new ForbiddenError('Tindakan ini hanya untuk dosen pemilik.');
		if (body.action === 'advance') {
			if (ctx.d.kind !== 'kelas' || ctx.d.delivery.progression !== 'guided')
				throw new BadRequestError('Hanya untuk kelas dipandu dosen.');
			const index = Number(body.index);
			if (
				!Number.isInteger(index) ||
				index < 0 ||
				index >= ctx.d.activities.length
			)
				throw new BadRequestError('Pilih kegiatan yang valid.');
			ctx.run.set('activeIndex', index);
			app.save(ctx.run);
			return publicState(app, ctx, user);
		}
		if (body.action === 'close') {
			ctx.run.set('closed', true);
			app.save(ctx.run);
			for (const response of rows(app, 'builder_responses', 'run={:r}', {
				r: ctx.run.id,
			}))
				finalize(app, ctx, response, now);
			return publicState(app, ctx, user);
		}
		if (body.action === 'review')
			return {
				document: ctx.d,
				privateKeys: ctx.keys,
				participants: rows(
					app,
					'builder_responses',
					'run={:r}',
					{ r: ctx.run.id },
					10000,
				).map((response) => {
					finalize(app, ctx, response, now);
					const student = app.findRecordById(
						'users',
						response.getString('student'),
					);
					return {
						studentId: student.id,
						name: student.getString('name'),
						...publicResponse(ctx, response),
						assessment: scoring(ctx, response),
					};
				}),
			};
		const response = find(
			app,
			'builder_responses',
			'run={:r} && student={:s}',
			{ r: ctx.run.id, s: String(body.studentId || '') },
		);
		if (!response) throw new BadRequestError('Jawaban tidak ditemukan.');
		finalize(app, ctx, response, now);
		if (response.getInt('revision') !== body.baseRevision)
			throw new BadRequestError('Jawaban berubah. Muat ulang penilaian.');
		if (body.action === 'grade') {
			const q = ctx.d.questionsById[body.questionId];
			if (!q) throw new BadRequestError('Pertanyaan tidak valid.');
			const score = Number(body.score),
				feedback = String(body.feedback || '');
			if (
				!Number.isFinite(score) ||
				score < 0 ||
				score > q.points ||
				feedback.length > 10000
			)
				throw new BadRequestError('Nilai atau umpan balik tidak valid.');
			const activity = ctx.d.activities.find((a) =>
				a.blocks.some((b) => ids(b).includes(body.questionId)),
			);
			if (
				!response.getString('submittedAt') &&
				!data(response, 'submittedActivities', []).includes(activity.id)
			)
				throw new BadRequestError(
					'Tunggu kegiatan dikumpulkan sebelum menilai.',
				);
			let criteria;
			if (body.criteria !== undefined && body.reset !== true) {
				if (
					!q.rubric?.criteria.length ||
					!body.criteria ||
					typeof body.criteria !== 'object' ||
					Array.isArray(body.criteria)
				)
					throw new BadRequestError('Rubrik tidak valid.');
				criteria = {};
				let total = 0;
				if (Object.keys(body.criteria).length !== q.rubric.criteria.length)
					throw new BadRequestError('Lengkapi setiap kriteria rubrik.');
				for (const criterion of q.rubric.criteria) {
					const value = body.criteria[criterion.id];
					if (
						typeof value !== 'number' ||
						!Number.isFinite(value) ||
						value < 0 ||
						value > criterion.maxPoints
					)
						throw new BadRequestError('Nilai kriteria tidak valid.');
					criteria[criterion.id] = value;
					total += value;
				}
				if (Math.abs(total - score) > 0.00001)
					throw new BadRequestError(
						'Jumlah poin kriteria harus sama dengan nilai.',
					);
			}
			const manual = data(response, 'manual');
			if (body.reset === true) delete manual[body.questionId];
			else
				manual[body.questionId] = {
					score,
					feedback,
					...(criteria ? { criteria } : {}),
					by: user.id,
					at: new Date(now).toISOString(),
				};
			response.set('manual', manual);
		} else {
			if (!response.getString('submittedAt'))
				throw new BadRequestError('Pengumpulan belum selesai.');
			const result = scoring(ctx, response);
			if (result.pending)
				throw new BadRequestError(
					'Selesaikan penilaian jawaban terbuka sebelum menerbitkan hasil.',
				);
			response.set('released', { ...result, at: new Date(now).toISOString() });
		}
		response.set('revision', response.getInt('revision') + 1);
		app.save(response);
		return {
			response: publicResponse(ctx, response),
			assessment: scoring(ctx, response),
		};
	}
	if (ctx.owner)
		throw new BadRequestError(
			'Gunakan pratinjau untuk mencoba sebagai mahasiswa.',
		);
	let response = find(app, 'builder_responses', 'run={:r} && student={:s}', {
		r: ctx.run.id,
		s: user.id,
	});
	if (body.action === 'begin') {
		if (response) return publicState(app, ctx, user);
		if (
			ctx.run.getBool('closed') ||
			!available(ctx.d, now) ||
			now >= endTime(ctx, null) ||
			(ctx.d.kind === 'kelas' &&
				now > Date.parse(ctx.d.delivery.checkInClosesAt))
		)
			throw new BadRequestError(
				'Waktu mulai/check-in sudah ditutup atau belum dibuka.',
			);
		response = new Record(app.findCollectionByNameOrId('builder_responses'));
		response.load({
			run: ctx.run.id,
			student: user.id,
			startedAt: new Date(now).toISOString(),
			revision: 1,
			answers: {},
			submittedActivities: [],
			manual: {},
		});
		app.save(response);
		return publicState(app, ctx, user);
	}
	if (!response) throw new BadRequestError('Mulai kegiatan terlebih dahulu.');
	finalize(app, ctx, response, now);
	if (!['save', 'submit'].includes(body.action))
		throw new BadRequestError('Perintah tidak didukung.');
	if (response.getString('submittedAt')) return publicState(app, ctx, user);
	if (body.baseRevision !== response.getInt('revision'))
		throw new BadRequestError(
			'REVISION_CONFLICT: Jawaban berubah di tempat lain. Salin jawaban Anda dan muat ulang.',
		);
	const submitted = data(response, 'submittedActivities', []),
		answers = data(response, 'answers'),
		incoming = body.answers;
	if (
		!incoming ||
		typeof incoming !== 'object' ||
		Array.isArray(incoming) ||
		JSON.stringify(incoming).length > 800000
	)
		throw new BadRequestError('Jawaban tidak valid.');
	const activityFor = {};
	for (const [index, a] of ctx.d.activities.entries())
		for (const b of a.blocks)
			for (const id of [
				...ids(b),
				...(b.type === 'acknowledgement' ? [b.id] : []),
			])
				activityFor[id] = { a, index, b };
	for (const [id, value] of Object.entries(incoming)) {
		const loc = activityFor[id];
		if (
			!loc ||
			typeof value !== 'string' ||
			value.length > (ctx.d.questionsById[id]?.maxCharacters || 100000)
		)
			throw new BadRequestError('Butir atau panjang jawaban tidak valid.');
		if (
			submitted.includes(loc.a.id) ||
			!openActivity(ctx, loc.index, now, response)
		) {
			if (value !== String(answers[id] || ''))
				throw new BadRequestError('Kegiatan sudah terkunci.');
			continue;
		}
		const q = ctx.d.questionsById[id];
		if (
			(q?.kind === 'single_choice' &&
				value &&
				!q.options.some((o) => o.id === value)) ||
			(q?.kind === 'matching' &&
				value &&
				!loc.b.destinations.some((t) => t.id === value)) ||
			(loc.b.type === 'acknowledgement' && !['', 'yes'].includes(value))
		)
			throw new BadRequestError('Pilihan jawaban tidak valid.');
		answers[id] = value;
	}
	if (body.action === 'submit') {
		const targets =
			ctx.d.kind === 'tugas'
				? ctx.d.activities
				: ctx.d.activities.filter((a) => a.id === body.activityId);
		if (!targets.length) throw new BadRequestError('Pilih kegiatan.');
		for (const a of targets) {
			const index = ctx.d.activities.indexOf(a);
			if (!openActivity(ctx, index, now, response))
				throw new BadRequestError('Kegiatan belum dibuka atau waktunya habis.');
			for (const b of a.blocks) {
				for (const id of ids(b)) {
					if (
						ctx.d.questionsById[id].required &&
						!String(answers[id] || '').trim()
					)
						throw new BadRequestError('Lengkapi semua jawaban wajib.');
				}
				if (
					a.required &&
					b.type === 'acknowledgement' &&
					answers[b.id] !== 'yes'
				)
					throw new BadRequestError(
						'Konfirmasi membaca materi terlebih dahulu.',
					);
			}
			if (!submitted.includes(a.id)) submitted.push(a.id);
		}
		if (
			ctx.d.kind === 'tugas' ||
			ctx.d.activities.every((a) => submitted.includes(a.id))
		)
			response.set('submittedAt', new Date(now).toISOString());
	}
	response.set('answers', answers);
	response.set('submittedActivities', submitted);
	response.set('revision', response.getInt('revision') + 1);
	app.save(response);
	return publicState(app, ctx, user);
}
module.exports = { handle, publishIssues };
