import { useMemo } from 'react';
import { Link } from 'react-router';
import { ArrowRight, GraduationCap, LoaderCircle } from 'lucide-react';
import type { Course } from '@/lib/learning';
import {
	activityTypeOf,
	deadlineLabel,
	studentGradeLabel,
	studentWorkPath,
	submissionStatusLabel,
	type Assignment,
	type AssignmentSubmission,
} from '@/lib/assignments';
import { useCourseAssignments, useMySubmissions } from '@/hooks/use-course-assignments';
import { StudentPublishedFeedback } from '@/components/app/student-published-feedback';

type Props = {
	course: Course;
	routeId: string;
};

/**
 * Student-facing Nilai section: completed formal work, scores, lecturer
 * feedback, and what still needs attention. Formative practice is excluded —
 * it carries no official grade. Reads only; no grades are mutated here.
 */
export function StudentGrades({ course }: Props) {
	const { assignments, loading } = useCourseAssignments(course.id);
	const studentVisible = useMemo(
		() => assignments.filter((a) => a.status !== 'draft' && activityTypeOf(a) === 'formal'),
		[assignments],
	);
	const mySubmissions = useMySubmissions(studentVisible);
	const submissions = mySubmissions.data ?? [];

	const subByAssignment = useMemo(() => {
		const map = new Map<string, AssignmentSubmission>();
		for (const s of submissions) map.set(s.assignment, s);
		return map;
	}, [submissions]);

	const graded = studentVisible
		.map((a) => ({ assignment: a, submission: subByAssignment.get(a.id) ?? null }))
		.filter((row) => row.submission && row.submission.status === 'graded');

	const pending = studentVisible
		.map((a) => ({ assignment: a, submission: subByAssignment.get(a.id) ?? null }))
		.filter((row) => {
			const s = row.submission;
			if (!s) return true;
			return s.status !== 'graded';
		});

	const gradeValues = graded
		.map((row) => row.submission?.grade)
		.filter((g): g is number => g != null && !Number.isNaN(g));
	const avg =
		gradeValues.length > 0
			? Math.round(gradeValues.reduce((n, g) => n + g, 0) / gradeValues.length)
			: null;

	if (loading || mySubmissions.loading) {
		return (
			<div className="ld-loading">
				<LoaderCircle size={24} className="spin" /> Memuat nilai...
			</div>
		);
	}

	return (
		<div className="sgr-wrap">
			<div className="res-head">
				<div>
					<span className="ld-eyebrow">Nilai & umpan balik</span>
					<h2 className="res-title">Nilai mata kuliah</h2>
					<p className="res-sub">
						Pantau nilai tugas formal, umpan balik dosen, dan tugas yang masih perlu
						perhatian. Latihan formatif tidak membawa nilai resmi.
					</p>
				</div>
			</div>

			<div className="sgr-summary">
				<div className="sgr-summary-card">
					<strong>{avg != null ? studentGradeLabel(avg) : '—'}</strong>
					<span>Rata-rata nilai</span>
				</div>
				<div className="sgr-summary-card">
					<strong>{graded.length}</strong>
					<span>Tugas dinilai</span>
				</div>
				<div className="sgr-summary-card">
					<strong>{pending.length}</strong>
					<span>Perlu perhatian</span>
				</div>
			</div>

			{graded.length === 0 && pending.length === 0 ? (
				<div className="ld-empty">
					<div className="ld-empty-icon">
						<GraduationCap size={26} strokeWidth={1.4} />
					</div>
					<h3>Belum ada nilai</h3>
					<p>Dosen belum menerbitkan tugas formal untuk mata kuliah ini.</p>
				</div>
			) : (
				<>
					{graded.length > 0 && (
						<section className="ld-panel sgr-panel">
							<div className="ld-card-head">
								<h2>Sudah dinilai</h2>
								<span className="ld-chip">{graded.length}</span>
							</div>
							<ul className="sgr-list">
								{graded.map(({ assignment, submission }) => (
									<li key={assignment.id} className="sgr-row graded">
										<div className="sgr-row-main">
											<strong>{assignment.title}</strong>
											<small>Batas waktu {deadlineLabel(assignment.deadline)}</small>
											<StudentPublishedFeedback
												submissionId={submission?.id}
												feedback={submission?.feedback}
											/>
										</div>
										<div className="sgr-row-side">
											<span className="sgr-grade">{studentGradeLabel(submission?.grade)}</span>
											<Link to={studentWorkPath(assignment.id)} className="ld-text-btn">
												Lihat <ArrowRight size={13} />
											</Link>
										</div>
									</li>
								))}
							</ul>
						</section>
					)}

					{pending.length > 0 && (
						<section className="ld-panel sgr-panel">
							<div className="ld-card-head">
								<h2>Perlu perhatian</h2>
								<span className="ld-chip">{pending.length}</span>
							</div>
							<ul className="sgr-list">
								{pending.map(({ assignment, submission }) => {
									const status = submission?.status;
									return (
										<li key={assignment.id} className="sgr-row">
											<div className="sgr-row-main">
												<strong>{assignment.title}</strong>
												<small>Batas waktu {deadlineLabel(assignment.deadline)}</small>
												<span className={`asg-tag${status ? ` sub-${status}` : ' sub-missing'}`}>
													{submissionStatusLabel(submission)}
												</span>
											</div>
											<div className="sgr-row-side">
												<Link to={studentWorkPath(assignment.id)} className="ld-text-btn">
													{submission ? 'Lanjutkan' : 'Mulai'} <ArrowRight size={13} />
												</Link>
											</div>
										</li>
									);
								})}
							</ul>
						</section>
					)}
				</>
			)}
		</div>
	);
}
