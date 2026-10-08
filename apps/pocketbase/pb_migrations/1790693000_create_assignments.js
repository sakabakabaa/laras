/// <reference path="../pb_data/types.d.ts" />

/**
 * Assignments & student submissions.
 *
 * `assignments` — lecturer-created tasks (individual or collaborative),
 * optionally linked to a weekly session and a Sub-CPMK. Carries title,
 * instructions, staged workflow (JSON), deadline, submission requirements,
 * group details, status (draft/published/closed/archived), and attachments
 * (relations to course_resources).
 *
 * `assignment_submissions` — one submission row per student per assignment:
 * notes, uploaded files and/or an external link, group label, status
 * (submitted/late/revision/graded), plus lecturer-only grade/feedback fields.
 *
 * Access:
 * - Assignments: every signed-in user sees non-draft assignments; only the
 *   faculty owner sees their own drafts and may create/update/delete.
 * - Submissions: a student sees and edits only their own row (grading fields
 *   locked via `:changed`/`:isset`); the assignment's faculty owner sees,
 *   grades, and manages every submission for their assignment.
 */
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const courses = app.findCollectionByNameOrId('courses');
		const sessions = app.findCollectionByNameOrId('class_sessions');
		const subCpmk = app.findCollectionByNameOrId('sub_cpmk');
		const resources = app.findCollectionByNameOrId('course_resources');

		let assignments;
		try {
			assignments = app.findCollectionByNameOrId('assignments');
		} catch (_) {
			assignments = new Collection({
				type: 'base',
				name: 'assignments',
				// Non-draft assignments are visible to every signed-in user
				// (students included); drafts stay visible to their owner only.
				listRule:
					"@request.auth.id != '' && (status != 'draft' || owner = @request.auth.id)",
				viewRule:
					"@request.auth.id != '' && (status != 'draft' || owner = @request.auth.id)",
				createRule:
					"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty'",
				updateRule:
					"@request.auth.id != '' && owner = @request.auth.id && @request.body.owner:changed = false && @request.body.course:changed = false",
				deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
				fields: [
					{
						name: 'owner',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: users.id,
						cascadeDelete: true,
					},
					{
						name: 'course',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: courses.id,
						cascadeDelete: true,
					},
					{
						name: 'session',
						type: 'relation',
						required: false,
						maxSelect: 1,
						collectionId: sessions.id,
						cascadeDelete: false,
					},
					{
						name: 'subCpmk',
						type: 'relation',
						required: false,
						maxSelect: 1,
						collectionId: subCpmk.id,
						cascadeDelete: false,
					},
					{ name: 'title', type: 'text', required: true, max: 200 },
					{ name: 'instructions', type: 'text', max: 10000 },
					{ name: 'requirements', type: 'text', max: 5000 },
					// Staged workflow: JSON array of { label, note? }.
					{ name: 'stages', type: 'json', maxSize: 100000 },
					{ name: 'deadline', type: 'date' },
					{
						name: 'mode',
						type: 'select',
						required: true,
						maxSelect: 1,
						values: ['individual', 'collaborative'],
					},
					{ name: 'groupInfo', type: 'text', max: 2000 },
					{
						name: 'status',
						type: 'select',
						required: true,
						maxSelect: 1,
						values: ['draft', 'published', 'closed', 'archived'],
					},
					{
						name: 'attachments',
						type: 'relation',
						required: false,
						maxSelect: 20,
						collectionId: resources.id,
						cascadeDelete: false,
					},
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: ['CREATE INDEX idx_assignments_course ON assignments (course)'],
			});
			app.save(assignments);
		}

		try {
			app.findCollectionByNameOrId('assignment_submissions');
		} catch (_) {
			const submissions = new Collection({
				type: 'base',
				name: 'assignment_submissions',
				// A student sees only their own submission; the assignment's
				// faculty owner sees every submission for their assignment.
				listRule:
					"@request.auth.id != '' && (owner = @request.auth.id || assignment.owner = @request.auth.id)",
				viewRule:
					"@request.auth.id != '' && (owner = @request.auth.id || assignment.owner = @request.auth.id)",
				// Students create their own row; grading fields must stay unset.
				createRule:
					"@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.body.grade:isset = false && @request.body.feedback:isset = false && @request.body.gradedBy:isset = false && @request.body.gradedAt:isset = false",
				// Students may update their own row but never the grading fields;
				// the assignment owner may grade / request revision on any row.
				updateRule:
					"@request.auth.id != '' && ((owner = @request.auth.id && @request.body.grade:changed = false && @request.body.feedback:changed = false && @request.body.gradedBy:changed = false && @request.body.gradedAt:changed = false) || assignment.owner = @request.auth.id)",
				deleteRule:
					"@request.auth.id != '' && (owner = @request.auth.id || assignment.owner = @request.auth.id)",
				fields: [
					{
						name: 'owner',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: users.id,
						cascadeDelete: true,
					},
					{
						name: 'assignment',
						type: 'relation',
						required: true,
						maxSelect: 1,
						collectionId: assignments.id,
						cascadeDelete: true,
					},
					{ name: 'group', type: 'text', max: 200 },
					{ name: 'content', type: 'text', max: 10000 },
					{
						name: 'files',
						type: 'file',
						required: false,
						maxSelect: 10,
						maxSize: 100 * 1024 * 1024,
						mimeTypes: [
							'application/pdf',
							'application/vnd.openxmlformats-officedocument.presentationml.presentation',
							'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
							'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
							'application/vnd.ms-powerpoint',
							'application/msword',
							'application/vnd.ms-excel',
							'image/jpeg',
							'image/png',
							'image/webp',
							'image/gif',
							'audio/mpeg',
							'audio/wav',
							'audio/ogg',
							'audio/aac',
							'audio/x-m4a',
							'video/mp4',
							'video/webm',
							'video/ogg',
							'video/quicktime',
						],
					},
					{ name: 'link', type: 'url', required: false },
					{
						name: 'status',
						type: 'select',
						required: false,
						maxSelect: 1,
						values: ['submitted', 'late', 'revision', 'graded'],
					},
					{ name: 'grade', type: 'number', min: 0, max: 100 },
					{ name: 'feedback', type: 'text', max: 5000 },
					{
						name: 'gradedBy',
						type: 'relation',
						required: false,
						maxSelect: 1,
						collectionId: users.id,
						cascadeDelete: false,
					},
					{ name: 'gradedAt', type: 'date' },
					{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
				],
				indexes: [
					'CREATE INDEX idx_submissions_assignment ON assignment_submissions (assignment)',
					'CREATE INDEX idx_submissions_owner ON assignment_submissions (owner)',
				],
			});
			app.save(submissions);
		}
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('assignment_submissions'));
		} catch (_) {
			/* already absent */
		}
		try {
			app.delete(app.findCollectionByNameOrId('assignments'));
		} catch (_) {
			/* already absent */
		}
	},
);
