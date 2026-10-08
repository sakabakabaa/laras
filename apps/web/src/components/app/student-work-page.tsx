import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { LoaderCircle } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { errorMessage } from '@/lib/learning';
import type { Course } from '@/lib/learning';
import { courseRouteId } from '@/lib/course-route';
import {
	activityTypeOf,
	type Assignment,
	type AssignmentSubmission,
} from '@/lib/assignments';
import { EnrolledAnswerSheet } from '@/components/app/enrolled-answer-sheet';
import { StudentResultView } from '@/components/app/student-result-view';
import { AppShell } from '@/components/app/app-shell';

type Loaded = {
	assignment: Assignment;
	course: Course;
	submission: AssignmentSubmission | null;
	parentSubmission: AssignmentSubmission | null;
	linkedPractice: Assignment | null;
};

/**
 * Full-screen student workspace for one Tugas or Latihan. The course sidebar
 * stays on the list; this page only keeps the answer flow and AI review.
 */
export function StudentWorkPage({ assignmentId }: { assignmentId: string }) {
	const navigate = useNavigate();
	const [data, setData] = useState<Loaded | null>(null);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(true);

	/**
	 * Loads the assignment, the student's own submission, the parent formal
	 * submission, and any linked practice. `initial` controls whether the
	 * full-screen loading/error state is shown — silent refreshes (after a
	 * save) only update the data so the workspace reflects the new submission
	 * status without a loading flash or remount.
	 */
	const reload = useCallback(
		async (initial: boolean) => {
			if (initial) {
				setLoading(true);
				setError('');
			}
			try {
				const me = pb.authStore.record?.id || '';
				// The own submission and linked-practice lookups only depend on the
				// assignment id, so they run in parallel with the assignment fetch.
				// Only the parent-submission lookup needs a value from the assignment
				// record, so it stays sequential after the parallel batch resolves.
				const loadWorkspace = () =>
					Promise.all([
						pb.collection('assignments').getOne<Assignment>(assignmentId, {
							expand: 'session,subCpmk,attachments,parentAssignment,course',
						}),
						pb.collection('assignment_submissions').getList<AssignmentSubmission>(1, 1, {
							filter: pb.filter('assignment = {:a} && owner = {:o}', { a: assignmentId, o: me }),
							sort: '-updated',
						}),
						pb.collection('assignments').getList<Assignment>(1, 1, {
							filter: pb.filter('parentAssignment = {:id} && status != "draft"', { id: assignmentId }),
						}),
					]);
				let assignment: Assignment;
				let mine: { items: AssignmentSubmission[] };
				let practiceRows: { items: Assignment[] };
				try {
					[assignment, mine, practiceRows] = await loadWorkspace();
				} catch (err) {
					// Preview proxy sometimes drops the first parallel batch (broken pipe).
					if (!/failed to fetch|network|abort/i.test(errorMessage(err))) throw err;
					await new Promise((resolve) => setTimeout(resolve, 350));
					[assignment, mine, practiceRows] = await loadWorkspace();
				}
				const course = (assignment.expand as { course?: Course } | undefined)?.course;
				if (!course) throw new Error('Mata kuliah tugas ini tidak ditemukan.');
				const parentId =
					assignment.expand?.parentAssignment?.id || assignment.parentAssignment || '';
				const parentRows = parentId
					? await pb.collection('assignment_submissions').getList<AssignmentSubmission>(1, 1, {
							filter: pb.filter('assignment = {:a} && owner = {:o}', { a: parentId, o: me }),
							sort: '-updated',
						})
					: null;
				setData({
					assignment,
					course,
					submission: mine.items[0] || null,
					parentSubmission: parentRows?.items[0] || null,
					linkedPractice: practiceRows.items[0] || null,
				});
			} catch (err) {
				if (initial) setError(errorMessage(err));
			} finally {
				if (initial) setLoading(false);
			}
		},
		[assignmentId],
	);

	useEffect(() => {
		let alive = true;
		void (async () => {
			await reload(true);
			if (!alive) return;
		})();
		return () => {
			alive = false;
		};
	}, [reload]);

	const backTo = data
		? `/app/courses/${courseRouteId(data.course)}/${activityTypeOf(data.assignment) === 'formative' ? 'latihan' : 'tugas'}`
		: '/app/student';

	// A finally-submitted formal task opens the separate, read-only result
	// page — it does not reuse the editable answer sheet / workspace. Drafts,
	// revisions, and formative practice keep the workspace so the student can
	// keep working.
	const showResult = Boolean(
		data &&
			activityTypeOf(data.assignment) === 'formal' &&
			data.submission &&
			data.submission.status !== 'draft' &&
			data.submission.status !== 'revision',
	);

	return (
		<AppShell variant="saas" hideSidebar hideHeading title="Lembar kerja" eyebrow="Lembar kerja">
			{loading && !data && (
				<div className="sws-loading">
					<LoaderCircle size={22} className="spin" />
					<div>
						<strong>Membuka lembar kerja…</strong>
						<span>Memuat tugas, materi, dan progres Anda.</span>
					</div>
				</div>
			)}
			{!loading && error && !data && (
				<div className="sws-error">
					<div className="sws-error-ico" aria-hidden="true">
						<LoaderCircle size={26} strokeWidth={1.5} />
					</div>
					<h2>Lembar kerja tidak dapat dibuka</h2>
					<p>
						Tugas ini mungkin sudah dihapus, belum diterbitkan, atau terjadi kendala
						jaringan. Coba muat ulang halaman, atau kembali ke dashboard dan buka tugas
						kembali.
					</p>
					<div className="sws-error-actions">
						<button type="button" className="ld-btn-primary" onClick={() => window.location.reload()}>
							Muat ulang
						</button>
						<button type="button" className="ld-outline-action" onClick={() => navigate('/app/student')}>
							Kembali ke dashboard
						</button>
					</div>
				</div>
			)}
			{data && showResult && data.submission && (
				<StudentResultView
					assignment={data.assignment}
					course={data.course}
					submission={data.submission}
					linkedPractice={data.linkedPractice}
					onBack={() => navigate(backTo)}
				/>
			)}
			{data && !showResult && (
				<EnrolledAnswerSheet
					fullscreen
					assignment={data.assignment}
					courseId={courseRouteId(data.course)}
					courseLabel={data.course.title || data.course.code || 'Mata kuliah'}
					submission={data.submission}
					parentSubmission={data.parentSubmission}
					linkedPractice={data.linkedPractice}
					onBack={() => navigate(backTo)}
					onSaved={() => void reload(false)}
				/>
			)}
		</AppShell>
	);
}
