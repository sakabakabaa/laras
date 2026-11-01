// Owner-only downloads preserve private source documents in the library
// without exposing them through public file URLs or scheduled-class attachments.
onFileDownloadRequest((e) => {
	if (!e.record || !e.record.getBool('restrictDownload')) return e.next();

	let auth = e.auth;
	if (!auth) {
		try {
			const info = e.requestInfo();
			auth = info.auth;
			if (!auth && info.query && info.query.token) {
				try {
					auth = e.app.findAuthRecordByToken(info.query.token, 'file');
				} catch (_) {
					/* Invalid or expired file token. */
				}
			}
			if (!auth) {
				const raw = info.headers['cookie'] || '';
				const match = /(?:^|;\s*)pb_auth=([^;]+)/.exec(raw);
				if (match) {
					const parsed = JSON.parse(decodeURIComponent(match[1]));
					if (parsed && parsed.token)
						auth = e.app.findAuthRecordByToken(parsed.token, 'auth');
				}
			}
		} catch (_) {
			auth = null;
		}
	}

	const superuser = Boolean(auth && auth.isSuperuser && auth.isSuperuser());
	const owner = Boolean(
		auth &&
		auth.id === e.record.getString('owner') &&
		auth.getString('role') === 'faculty',
	);
	if (!superuser && !owner) {
		throw new ForbiddenError(
			'Dokumen sumber ini hanya tersedia untuk dosen pemilik.',
		);
	}
	return e.next();
}, 'file_library');
