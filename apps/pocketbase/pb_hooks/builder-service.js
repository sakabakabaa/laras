const domain = require(__hooks + '/builder-domain.js');

// Enhanced (layout + appearance) authoring capability. Server-owned: read from
// deployment env exactly like the web route /api/builder-capability, because
// the PocketBase and web containers can read the same environment. Unset means
// enabled (today's behaviour); only an explicit off disables it.
const ENHANCED_AUTHORING_OFF = ['off', '0', 'false', 'no', 'disabled'];
function enhancedAuthoring() {
	const raw = (
		typeof process !== 'undefined' && process.env
			? process.env.BUILDER_ENHANCED_AUTHORING
			: ''
	);
	const mode =
		raw && ENHANCED_AUTHORING_OFF.includes(String(raw).trim().toLowerCase())
			? 'off'
			: 'on';
	return { mode, allowlist: parseAllowlist() };
}
function parseAllowlist() {
	const raw =
		typeof process !== 'undefined' && process.env
			? process.env.BUILDER_ENHANCED_AUTHORING_ALLOWLIST
			: '';
	if (!raw) return [];
	return Array.from(
		new Set(
			String(raw)
				.split(',')
				.map((id) => id.trim())
				.filter((id) => id.length > 0),
		),
	);
}
function authoringAllowed(user, capability) {
	if (capability.mode === 'on') return true;
	return capability.allowlist.includes(user.id);
}
// A document is "enhanced" when any activity carries layout or any block carries
// appearance/mixed sections. Never inferred from a merely missing layout.
function enhancedDocument(d) {
	if (!d || !Array.isArray(d.activities)) return false;
	return d.activities.some(
		(a) =>
			!!a &&
			(a.layout !== undefined ||
				(Array.isArray(a.blocks) &&
					a.blocks.some(
						(b) =>
							!!b &&
							(b.layoutLocked !== undefined || b.appearance !== undefined || Array.isArray(b.sections) || b.transcript !== undefined || b.captions !== undefined || b.playback !== undefined || (b.body && Array.isArray(b.body.content) && b.body.content.some((node) => node && (node.type === 'heading' || node.type === 'list_item')))),
					))),
	);
}
const ENHANCED_DENIED =
	'ENHANCED_AUTHORING_DENIED: Penyunting visual lanjutan sedang dinonaktifkan untuk akun ini. Draf memakai tata letak atau tampilan lanjutan, sehingga tidak dapat diubah tanpa menghilangkan data. Unduh salinan, atau minta admin mengaktifkan kembali penyunting lanjutan.';
// Returns true when the caller has no enhanced capability but the target
// document already uses enhanced fields. Legacy flat documents stay writable.
function authoringDenied(allowed, documents) {
	if (allowed) return false;
	for (const d of documents) if (enhancedDocument(d)) return true;
	return false;
}
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
function authorizeAssets(app, user, d) {
	for (const entry of require(__hooks + '/builder-domain.js').documentAssets(d)) {
		const { asset, kind } = entry;
				const file = app.findRecordById('file_library', asset.fileId);
				if (
					file.getString('owner') !== user.id ||
					!Array.from(file.getStringSlice('course')).includes(
						d.context.courseId,
					)
				)
					throw new ForbiddenError(
						'Berkas harus milik Anda pada mata kuliah ini.',
					);
				if (
					file.getString('file') !== asset.filename ||
					(file.getInt('version') || 1) !== asset.version
				) {
					const prior = find(
						app,
						'file_versions',
						'file={:f} && version={:v}',
						{ f: file.id, v: asset.version },
					);
					if (
						!prior ||
						prior.getString('filename') !== asset.filename ||
						!prior.getString('fileData')
					)
						throw new BadRequestError(
							'Versi berkas tidak tersedia. Pilih ulang berkas.',
						);
				}
				const ext = asset.filename.split('.').pop().toLowerCase();
				const allowed =
					kind === 'image'
						? ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg']
						: kind === 'audio'
							? ['mp3', 'wav', 'ogg', 'aac', 'm4a']
							: ['mp4', 'webm', 'mov'];
				if (!allowed.includes(ext))
					throw new BadRequestError('Jenis berkas tidak cocok dengan elemen.');
	}
}
function view(app, r) {
	const k = find(app, 'builder_private_keys', 'document={:d}', { d: r.id });
	if (!k)
		throw new BadRequestError('Pengaturan penilaian draf tidak ditemukan.');
	return {
		id: r.id,
		layoutLocks: true,
		customColors: true,
		detailedBorderRadius: true,
		responsiveBorderRadius: true,
		mediaCaptions: true,
		mediaPlayback: true,
		nestedRichText: true,
		documentAnchors: true,
		presentationVisibility: true,
		themePalette: true,
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
	const responsiveVersioned = /^responsiveStyles:(create|save|saveSnapshot|saveTemplate)$/.test(body.action);
	const themePaletteVersioned = /^themePalette:(create|save|saveSnapshot|saveTemplate)$/.test(body.action);
	const captionVersioned = /^mediaCaptions:(create|save|saveSnapshot|saveTemplate)$/.test(body.action);
	const playbackVersioned = /^mediaPlayback:(create|save|saveSnapshot|saveTemplate)$/.test(body.action);
	const nestedListVersioned = /^nestedLists:(create|save|saveSnapshot|saveTemplate)$/.test(body.action);
	const anchorVersioned = /^documentAnchors:(create|save|saveSnapshot|saveTemplate)$/.test(body.action);
	const visibilityVersioned = /^presentationVisibility:(create|save|saveSnapshot|saveTemplate)$/.test(body.action);
	const containsThemePalette = value => !value || typeof value !== 'object' ? false : Object.hasOwn(value, 'theme') || Object.values(value).some(containsThemePalette);
	const containsAnchors = (value) => !value || typeof value !== 'object' ? false : Object.hasOwn(value, 'anchor') || Object.values(value).some(containsAnchors);
	const containsVisibility = (value) => !value || typeof value !== 'object' ? false : Object.hasOwn(value, 'presentation') || Object.values(value).some(containsVisibility);
	if (anchorVersioned && body.documentAnchors !== true) throw new BadRequestError('Perintah tautan bagian tidak valid.');
	if (visibilityVersioned && body.presentationVisibility !== true) throw new BadRequestError('Perintah visibilitas presentasi tidak valid.');
	if (themePaletteVersioned && body.themePalette !== true) throw new BadRequestError('Perintah palet tema dokumen tidak valid.');
	if (containsThemePalette(body.document) && !themePaletteVersioned) throw new BadRequestError('Palet tema dokumen memerlukan perintah versi khusus.');
	if (containsVisibility(body.document) && !visibilityVersioned && !(themePaletteVersioned && body.presentationVisibility === true)) throw new BadRequestError('Visibilitas presentasi memerlukan perintah versi khusus.');
	if (containsAnchors(body.document) && !anchorVersioned && !(visibilityVersioned && body.documentAnchors === true) && !(themePaletteVersioned && body.documentAnchors === true)) throw new BadRequestError('Tautan bagian memerlukan perintah versi jangkar.');
	const containsNestedLists = (value) => {
		if (!value || typeof value !== 'object') return false;
		if (Array.isArray(value)) return value.some(containsNestedLists);
		if (value.type === 'list_item' && typeof value.depth === 'number' && value.depth > 0) return true;
		return Object.values(value).some(containsNestedLists);
	};
	const containsPlayback = (value) => {
		if (!value || typeof value !== 'object') return false;
		if (Array.isArray(value)) return value.some(containsPlayback);
		if (value.playback && ['start', 'end', 'rate'].some((key) => Object.hasOwn(value.playback, key))) return true;
		return Object.values(value).some(containsPlayback);
	};
	if (nestedListVersioned && body.nestedRichText !== true) throw new BadRequestError('Perintah daftar bertingkat tidak valid.');
	if (!(nestedListVersioned || anchorVersioned || visibilityVersioned && body.nestedRichText === true || (playbackVersioned || captionVersioned || responsiveVersioned || themePaletteVersioned) && body.nestedRichText === true) && containsNestedLists(body.document)) throw new BadRequestError('Daftar bertingkat memerlukan perintah versi daftar.');
	const containsCaptions = (value) => {
		if (!value || typeof value !== 'object') return false;
		if (Object.hasOwn(value, 'captions')) return true;
		return Object.values(value).some(containsCaptions);
	};
	if (captionVersioned && body.mediaCaptions !== true) throw new BadRequestError('Perintah keterangan media tidak valid.');
	if (playbackVersioned && body.mediaPlayback !== true) throw new BadRequestError('Perintah pemutaran media tidak valid.');
	if (!(playbackVersioned || anchorVersioned || visibilityVersioned && body.mediaPlayback === true || themePaletteVersioned && body.mediaPlayback === true) && containsPlayback(body.document)) throw new BadRequestError('Rentang dan kecepatan memerlukan perintah versi pemutaran.');
	if (!(captionVersioned || anchorVersioned || visibilityVersioned && body.mediaCaptions === true || (playbackVersioned || nestedListVersioned || responsiveVersioned || themePaletteVersioned) && body.mediaCaptions === true) && containsCaptions(body.document)) throw new BadRequestError('Keterangan media memerlukan perintah versi captions.');
	const containsResponsiveDetails = (value) => {
		if (!value || typeof value !== 'object') return false;
		if (value.responsive && typeof value.responsive === 'object' && Object.values(value.responsive).some((device) => device && typeof device === 'object' && (Object.hasOwn(device, 'borderDetail') || Object.hasOwn(device, 'corners')))) return true;
		return Object.values(value).some(containsResponsiveDetails);
	};
	if (responsiveVersioned && body.responsiveBorderRadius !== true)
		throw new BadRequestError('Perintah gaya responsif tidak valid.');
	// The caption command is also a schema-version fence for mixed documents:
	// this server normalizes the full current document, including responsive
	// appearance, before accepting the write.
	if (!(responsiveVersioned || anchorVersioned || visibilityVersioned && body.responsiveBorderRadius === true || (playbackVersioned || captionVersioned || nestedListVersioned || themePaletteVersioned) && body.responsiveBorderRadius === true) && containsResponsiveDetails(body.document))
		throw new BadRequestError('Gaya responsif memerlukan perintah versi responsif.');
	if (/^(layoutLocks|themeColors|themePalette|detailedStyles|responsiveStyles|mediaCaptions|mediaPlayback|nestedLists|documentAnchors|presentationVisibility):(create|save|saveSnapshot|saveTemplate)$/.test(body.action))
		body = { ...body, action: body.action.slice(body.action.indexOf(':') + 1) };
	// Reads (list/get/saved) always work so recovery and export stay reachable.
	const capability = enhancedAuthoring(),
		allowed = authoringAllowed(user, capability);
	if (body.action === 'list')
		return {
			items: app
				.findRecordsByFilter(
					'builder_documents',
					'owner={:u} && deleted=false' + (body.kind ? ' && kind={:k}' : ''),
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
	if (
		['savedList', 'savedGet', 'saveSnapshot', 'saveTemplate'].includes(
			body.action,
		)
	) {
		if (body.action === 'savedGet') {
			const item = app.findRecordById(
				'builder_saved_items',
				String(body.itemId || ''),
			);
			if (item.getString('owner') !== user.id)
				throw new ForbiddenError('Salinan tidak tersedia.');
			const saved = json(item, 'envelope');
			authorizeContext(app, user, saved.document);
			if (item.getString('kind') === 'template') authorizeAssets(app, user, saved.document);
			let normalizedSaved = saved;
			if (containsVisibility(saved.document) || containsThemePalette(saved.document)) {
				normalizedSaved = domain.normalize(saved);
				if (saved.scope !== undefined) normalizedSaved.scope = saved.scope === 'group' ? 'group' : 'activity';
			}
			return {
				id: item.id,
				title: item.getString('title'),
				kind: item.getString('kind'),
				documentId: item.getString('document'),
				envelope: normalizedSaved,
			};
		}
		const source = app.findRecordById(
			'builder_documents',
			String(body.id || ''),
		);
		if (source.getString('owner') !== user.id)
			throw new ForbiddenError('Draf tidak tersedia.');
		if (source.getBool('deleted'))
			throw new BadRequestError('Draf telah dihapus.');
		const envelope = view(app, source);
		if (containsThemePalette(envelope.document) && body.themePalette !== true) throw new BadRequestError('Palet tema dokumen memerlukan perintah versi khusus.');
		if (containsVisibility(envelope.document) && body.presentationVisibility !== true) throw new BadRequestError('Visibilitas presentasi memerlukan perintah versi khusus.');
		if (containsAnchors(envelope.document) && body.documentAnchors !== true) throw new BadRequestError('Tautan bagian memerlukan perintah versi jangkar.');
		if (containsNestedLists(envelope.document) && body.nestedRichText !== true) throw new BadRequestError('Daftar bertingkat memerlukan perintah versi daftar.');
		if (containsCaptions(envelope.document) && body.mediaCaptions !== true) throw new BadRequestError('Keterangan media memerlukan perintah versi captions.');
		if (containsPlayback(envelope.document) && body.mediaPlayback !== true) throw new BadRequestError('Rentang dan kecepatan memerlukan perintah versi pemutaran.');
		if (containsResponsiveDetails(envelope.document) && body.responsiveBorderRadius !== true) throw new BadRequestError('Gaya responsif memerlukan perintah versi responsif.');
		authorizeContext(app, user, envelope.document);
		if (body.action === 'savedList')
			return {
				items: app
					.findRecordsByFilter(
						'builder_saved_items',
						'owner={:u} && ((kind="snapshot" && document={:d}) || (kind="template" && course={:c}))',
						'-created',
						200,
						0,
						{ u: user.id, d: source.id, c: source.getString('course') },
					)
					.map((r) => ({
						id: r.id,
						title: r.getString('title'),
						kind: r.getString('kind'),
						revision: r.getInt('revision'),
						created: r.getString('created'),
						scope: json(r, 'envelope').scope || 'activity',
					})),
			};
		if (!/^[a-zA-Z0-9_-]{1,80}$/.test(String(body.commandId || '')))
			throw new BadRequestError('Identitas penyimpanan tidak valid.');
		const existing = find(
			app,
			'builder_saved_items',
			'owner={:u} && commandId={:k}',
			{ u: user.id, k: body.commandId },
		);
		if (existing) return { id: existing.id };
		if (
			authoringDenied(allowed, [envelope.document]) ||
			(body.action === 'saveTemplate' && !responsiveVersioned && !captionVersioned && !nestedListVersioned && !playbackVersioned && !visibilityVersioned && !anchorVersioned && !themePaletteVersioned && body.scope !== 'group' &&
				enhancedDocument({
					activities: envelope.document.activities.filter(
						(a) => a.id === body.activityId,
					),
				}))
		)
			throw new ForbiddenError(ENHANCED_DENIED);
		if (body.baseRevision !== source.getInt('revision'))
			throw new BadRequestError('Draf berubah. Simpan dan coba lagi.');
		const title = String(body.title || '').trim();
		if (!title || title.length > 200)
			throw new BadRequestError('Isi nama salinan (maksimal 200 karakter).');
		let stored = {
			document: envelope.document,
			privateKeys: envelope.privateKeys,
		};
		if (body.action === 'saveTemplate') {
			const activity = stored.document.activities.find((a) => a.id === body.activityId);
			if (!activity) throw new BadRequestError('Kegiatan tidak ditemukan.');
			const scope = body.scope === 'group' ? 'group' : 'activity';
			if (scope === 'group') {
				stored = domain.extractGroupTemplate(stored, body.activityId, body.groupId);
			} else {
				stored.document.activities = [activity];
				stored.scope = 'activity';
			}
			authorizeAssets(app, user, stored.document);
			const references = new Set();
			for (const b of activity.blocks) {
				for (const q of b.questionIds || []) references.add(q);
				if (b.questionId) references.add(b.questionId);
				for (const section of b.sections || [])
					for (const segment of section.segments)
						if (segment.type === 'gap') references.add(segment.questionId);
			}
			stored.document.questionsById = Object.fromEntries(
				Object.entries(stored.document.questionsById).filter(([key]) =>
					references.has(key),
				),
			);
			stored.privateKeys.answersByQuestionId = Object.fromEntries(
				Object.entries(stored.privateKeys.answersByQuestionId).filter(([key]) =>
					references.has(key),
				),
			);
		}
		const templateScope = stored.scope;
		stored = domain.normalize(stored);
		if (templateScope) stored.scope = templateScope;
		const item = new Record(
			app.findCollectionByNameOrId('builder_saved_items'),
		);
		item.load({
			owner: user.id,
			course: source.getString('course'),
			document: source.id,
			kind: body.action === 'saveTemplate' ? 'template' : 'snapshot',
			title,
			revision: source.getInt('revision'),
			envelope: stored,
			commandId: body.commandId,
		});
		app.save(item);
		return { id: item.id };
	}
	let record;
	if (['get', 'save', 'delete'].includes(body.action)) {
		if (typeof body.id !== 'string' || !/^[a-z0-9]{15}$/.test(body.id))
			throw new BadRequestError('ID draf tidak valid.');
		record = app.findRecordById('builder_documents', body.id);
		if (record.getString('owner') !== user.id)
			throw new ForbiddenError('Draf tidak tersedia untuk akun ini.');
		authorizeContext(app, user, json(record, 'document'));
		if (record.getBool('deleted')) {
			if (body.action === 'delete') return { id: record.id, deleted: true };
			throw new BadRequestError('Draf telah dihapus.');
		}
		if (body.action === 'delete') {
			if (!Number.isInteger(body.baseRevision) || body.baseRevision !== record.getInt('revision'))
				throw new BadRequestError('REVISION_CONFLICT: Draf berubah di tempat lain. Muat ulang daftar sebelum menghapus.');
			record.set('deleted', true);
			app.save(record);
			return { id: record.id, deleted: true };
		}
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
			if (record.getBool('deleted'))
				throw new BadRequestError('Draf telah dihapus.');
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
	// Check both sides: the stored draft (existing document) and the submitted
	// document. A denied lecturer can never overwrite an advanced draft, and can
	// never introduce enhanced fields that the legacy editor would then drop.
	if (
		authoringDenied(allowed, [
			normalized.document,
			...(record ? [json(record, 'document')] : []),
		])
	)
		throw new ForbiddenError(ENHANCED_DENIED);
	authorizeContext(app, user, normalized.document);
	authorizeAssets(app, user, normalized.document);
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
module.exports = {
	handle,
	authorizeAssets,
	authorizeContext,
	enhancedDocument,
	authoringAllowed,
	enhancedAuthoring,
	ENHANCED_DENIED,
};
