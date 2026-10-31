routerAdd(
	'POST',
	'/api/laras/builder',
	(e) => {
		if (!e.auth || e.auth.isSuperuser())
			throw new ForbiddenError('Gunakan akun dosen.');
		let result;
		try {
			e.app.runInTransaction((app) => {
				result = require(__hooks + '/builder-service.js').handle(
					app,
					e.auth,
					e.requestInfo().body,
				);
			});
		} catch (error) {
			e.app
				.logger()
				.error(
					'builder command failed',
					'action',
					String(e.requestInfo().body.action),
					'error',
					String(error),
				);
			throw error;
		}
		e.response.header().set('Cache-Control', 'no-store');
		return e.json(200, result);
	},
	$apis.requireAuth('users'),
	$apis.bodyLimit(3000000),
);
