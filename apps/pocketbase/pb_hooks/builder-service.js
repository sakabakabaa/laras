const domain = require(__hooks + '/builder-domain.js');
function json(r, f) {
	return JSON.parse(r.getString(f) || '{}');
}
function find(app, name, filter, params) {
	return app.findRecordsByFilter(name, filter, '', 1, 0, params)[0];
}
function authorizeContext(app, user, d) {
	const course = app.findRecordById('courses', d.context.courseId);
	if (course.getString('owner') !== user.id)
		throw new ForbiddenError('Mata kuliah tidak tersedia untuk akun ini.');
	if (d.context.meetingId) {
		const meeting = app.findRecordById('class_sessions', d.context.meetingId);
		if (meeting.getString('course') !== course.id)
			throw new BadRequestError('Pertemuan berasal dari mata kuliah lain.');
		if (
			meeting.getString('section') &&
			(d.context.sectionIds.length !== 1 ||
				d.context.sectionIds[0] !== meeting.getString('section'))
		)
			throw new BadRequestError('Rombel harus sesuai dengan pertemuan.');
	}
	for (const sid of d.context.sectionIds) {
		const section = app.findRecordById('course_sections', sid);
		if (section.getString('course') !== course.id)
			throw new BadRequestError('Rombel berasal dari mata kuliah lain.');
	}
}
function view(app, r) {
	const k = find(app, 'builder_private_keys', 'document={:d}', { d: r.id });
	if (!k)
		throw new BadRequestError('Pengaturan penilaian draf tidak ditemukan.');
	return {
		id: r.id,
		title: r.getString('title'),
		kind: r.getString('kind'),
		revision: r.getInt('revision'),
		updated: r.getString('updated'),
		document: json(r, 'document'),
		privateKeys: json(k, 'keys'),
	};
}
function handle(app, user, body) {
	if (user.getString('role') !== 'faculty')
		throw new ForbiddenError('Builder hanya tersedia untuk dosen.');
	if (body.action === 'list')
		return {
			items: app
				.findRecordsByFilter(
					'builder_documents',
					'owner={:u}' + (body.kind ? ' && kind={:k}' : ''),
					'-updated',
					100,
					0,
					{ u: user.id, k: body.kind || '' },
				)
				.map((r) => ({
					id: r.id,
					title: r.getString('title'),
					kind: r.getString('kind'),
					revision: r.getInt('revision'),
					updated: r.getString('updated'),
					activityCount: (json(r, 'document').activities || []).length,
					courseTitle: app
						.findRecordById('courses', r.getString('course'))
						.getString('title'),
				})),
		};
	let record;
	if (body.action === 'get' || body.action === 'save') {
		if (typeof body.id !== 'string' || !/^[a-z0-9]{15}$/.test(body.id))
			throw new BadRequestError('ID draf tidak valid.');
		record = app.findRecordById('builder_documents', body.id);
		if (record.getString('owner') !== user.id)
			throw new ForbiddenError('Draf tidak tersedia untuk akun ini.');
		authorizeContext(app, user, json(record, 'document'));
		if (body.action === 'get') return view(app, record);
	}
	if (!['create', 'save'].includes(body.action))
		throw new BadRequestError('Perintah builder tidak didukung.');
	if (
		typeof body.commandId !== 'string' ||
		!/^[a-zA-Z0-9_-]{1,80}$/.test(body.commandId)
	)
		throw new BadRequestError('Identitas penyimpanan tidak valid.');
	if (body.action === 'create') {
		record = find(app, 'builder_documents', 'owner={:u} && creationKey={:k}', {
			u: user.id,
			k: body.commandId,
		});
		if (record) {
			authorizeContext(app, user, json(record, 'document'));
			return view(app, record);
		}
	}
	if (
		body.action === 'save' &&
		record.getString('lastSaveId') === body.commandId
	)
		return view(app, record);
	if (
		body.action === 'save' &&
		(!Number.isInteger(body.baseRevision) ||
			body.baseRevision !== record.getInt('revision'))
	)
		throw new BadRequestError(
			'REVISION_CONFLICT: Draf berubah di tempat lain. Perubahan Anda tetap tersedia di perangkat.',
		);
	let normalized;
	try {
		normalized = domain.normalize(body);
	} catch (e) {
		throw new BadRequestError(String(e.message || e));
	}
	authorizeContext(app, user, normalized.document);
	if (record && normalized.document.kind !== record.getString('kind'))
		throw new BadRequestError(
			'Jenis draf tidak dapat diubah. Duplikat untuk membuat jenis baru.',
		);
	if (!record) {
		record = new Record(app.findCollectionByNameOrId('builder_documents'));
		record.set('owner', user.id);
		record.set('creationKey', body.commandId);
	}
	record.load({
		course: normalized.document.context.courseId,
		title:
			normalized.document.title ||
			(normalized.document.kind === 'kelas'
				? 'Kelas tanpa judul'
				: 'Tugas tanpa judul'),
		kind: normalized.document.kind,
		revision: record.getInt('revision') + 1,
		document: normalized.document,
		lastSaveId: body.commandId,
	});
	app.save(record);
	let key = find(app, 'builder_private_keys', 'document={:d}', {
		d: record.id,
	});
	if (!key)
		key = new Record(app.findCollectionByNameOrId('builder_private_keys'));
	key.load({ document: record.id, keys: normalized.privateKeys });
	app.save(key);
	return view(app, record);
}
module.exports = { handle };
