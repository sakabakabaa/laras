import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { LoaderCircle } from 'lucide-react';
import { AppShell } from '@/components/app/app-shell';
import { useAssistantPageContext } from '@/components/app/assistant-page-context-provider';
import { AssignmentForm } from '@/components/app/assignment-form';
import { PracticeAutofillForm } from '@/components/app/practice-autofill-form';
import pb from '@/lib/pocketbase-client';
import { errorMessage } from '@/lib/learning';
import { clearPracticeIntent, peekPracticeIntent, type Assignment } from '@/lib/assignments';
import type { Course } from '@/lib/learning';

type ExpandedAssignment = Assignment & {
	expand?: {
		session?: unknown;
		subCpmk?: unknown;
		parentAssignment?: Assignment;
	};
};

/**
 * Dedicated full-page Tugas creator/editor, modeled on the RPS builder page.
 * Replaces the modal popup for creation launched from /tugas and from a course
 * page. Reuses the existing AssignmentForm (variant="page") — the four-section
 * creator, validation, autosave/draft continuity, preview/publish, and
 * formal/practice separation are all preserved.
 *
 * Query params:
 *  - ?course=<id>  preselect a course (launch from a course page)
 *  - ?edit=<id>    edit an existing assignment
 *  - ?practice=<id> create a Latihan persiapan from a formal parent task
 */
export function AssignmentEditorPage() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const editId = (searchParams.get('edit') || '').trim();
	// The formal-task id to build a Latihan persiapan from. The `?practice=`
	// query param is authoritative; when it is missing (the in-iframe preview
	// can re-navigate to the param-less canonical URL, stripping the query
	// string), fall back to a one-shot sessionStorage intent stashed by the
	// "Buat latihan persiapan" action right before navigating here.
	const [practiceId] = useState(() => {
		const fromParam = (searchParams.get('practice') || '').trim();
		if (fromParam) {
			clearPracticeIntent();
			return fromParam;
		}
		return peekPracticeIntent();
	});
	const courseParam = (searchParams.get('course') || '').trim();

	const [assignment, setAssignment] = useState<Assignment | null>(null);
	const [parent, setParent] = useState<Assignment | null>(null);
	const [courses, setCourses] = useState<Course[] | null>(null);
	const [loading, setLoading] = useState(Boolean(editId || practiceId));
	const [error, setError] = useState('');

	useEffect(() => {
		const me = pb.authStore.record?.id || '';
		if (!me) return;
		let alive = true;
		setLoading(Boolean(editId || practiceId));
		setError('');
		void (async () => {
			try {
				const tasks: Promise<void>[] = [];
				// Pass the lecturer's own courses so the form does not refetch them.
				tasks.push(
					pb.collection('courses')
						.getFullList<Course>({ sort: 'title' })
						.then((rows) => {
							if (alive) setCourses(rows.filter((c) => c.owner === me));
						}),
				);
				if (editId) {
					tasks.push(
						pb.collection('assignments')
							.getOne<ExpandedAssignment>(editId, {
								expand: 'session,subCpmk,parentAssignment',
							})
							.then((rec) => {
								if (!alive) return;
								setAssignment(rec);
								const p = rec.expand?.parentAssignment;
								if (p) setParent(p);
							}),
					);
				}
				if (practiceId) {
					tasks.push(
						pb.collection('assignments')
							.getOne<Assignment>(practiceId)
							.then((rec) => {
								if (!alive) return;
								setParent(rec);
								// The practice intent has served its purpose — drop it so a
								// later visit to the regular creator does not reopen the form.
								clearPracticeIntent();
								navigate(`/app/courses/${rec.course}/latihan`, { replace: true });
							}),
					);
				}
				await Promise.all(tasks);
			} catch (err) {
				if (alive) setError(errorMessage(err));
			} finally {
				if (alive) setLoading(false);
			}
		})();
		return () => {
			alive = false;
		};
	}, [editId, practiceId, navigate]);

	const location = useLocation();
	const { setContext: setAssistantPageContext } = useAssistantPageContext();
	// Publish semantic page context for the assistant: the Tugas editor, the
	// assignment being edited (if any), and the editing/practice state.
	useEffect(() => {
		setAssistantPageContext({
			route: location.pathname,
			feature: 'assignments',
			...(editId ? { entity: { type: 'assignment', id: editId } } : {}),
			state: {
				editing: Boolean(editId),
				practice: Boolean(practiceId),
				courseId: courseParam || assignment?.course || parent?.course || '',
			},
			availableActions: ['create_assignment', 'save_draft', 'publish'],
		});
		return () => setAssistantPageContext(null);
	}, [editId, practiceId, courseParam, assignment, parent, location.pathname, setAssistantPageContext]);

	if (loading) {
		return (
			<AppShell title="Editor Tugas" eyebrow="Tugas" back variant="saas" hideHeading>
				<div className="ld-loading">
					<LoaderCircle size={24} className="spin" /> Memuat editor tugas...
				</div>
			</AppShell>
		);
	}

	if (error) {
		return (
			<AppShell title="Editor Tugas" eyebrow="Tugas" back variant="saas" hideHeading>
				<div className="ld-alert" role="alert">
					{error}{' '}
					<button type="button" onClick={() => navigate('/app/tugas')}>
						Kembali ke Tugas
					</button>
				</div>
			</AppShell>
		);
	}

	const title = assignment
		? 'Edit tugas'
		: parent
			? 'Buat latihan persiapan'
			: 'Buat tugas baru';

	// Creating a Latihan persiapan from a formal task uses the lightweight
	// autofill flow: the main task is the source of truth, inherited fields are
	// read-only, and only formative-practice settings are editable. Editing an
	// existing practice keeps the full 10-step creator (with its explicit
	// update-from-main-task action).
	const isPracticeCreation = Boolean(parent) && !assignment;

	return (
		<AppShell title={title} eyebrow="Tugas" back variant="saas" hideHeading>
			{isPracticeCreation && parent ? (
				<PracticeAutofillForm
					parent={parent}
					onClose={() => navigate('/app/tugas')}
					onSaved={() => navigate('/app/tugas')}
				/>
			) : (
				<AssignmentForm
					variant="page"
					courseId={courseParam || assignment?.course || parent?.course || undefined}
					courses={courses || undefined}
					assignment={assignment || undefined}
					practiceFrom={parent || undefined}
					onClose={() => navigate('/app/tugas')}
					onSaved={(assignmentId) => navigate(`/app/tugas/${assignmentId}`)}
				/>
			)}
		</AppShell>
	);
}
