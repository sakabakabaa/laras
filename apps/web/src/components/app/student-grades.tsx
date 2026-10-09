import { useStudentHomeText } from '@/lib/student-home-copy';
import { PracticeMascot } from './practice-mascot';
import { useEffect, useState, useMemo } from 'react';
import pb from '@/lib/pocketbase-client';
import { Link } from 'react-router';
import { ArrowRight, GraduationCap, LoaderCircle } from 'lucide-react';
import type { Course } from '@/lib/learning';
import {
	activityTypeOf,
	studentGradeLabel,
	studentWorkPath,
	type Assignment,
	type AssignmentSubmission,
} from '@/lib/assignments';
import { useCourseAssignments, useMySubmissions } from '@/hooks/use-course-assignments';
import { StudentPublishedFeedback } from '@/components/app/student-published-feedback';
import { useLanguage, useT } from '@/lib/i18n';

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
	const t = useT();
	const label = useStudentHomeText();
const language = useLanguage();
	const dateLabel = (date?: string) => date ? new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : language === 'en' ? 'en-GB' : 'id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : t('student.grades.noDeadline');
	const { assignments, loading } = useCourseAssignments(course.id);
	const studentVisible = useMemo(
		() => assignments.filter((a) => a.status !== 'draft' && activityTypeOf(a) === 'formal'),
		[assignments],
	);
	const mySubmissions = useMySubmissions(studentVisible);
	const submissions = mySubmissions.data ?? [];
    const [summary, setSummary] = useState<{ published: boolean; final: {value:number|null;letter:string|null}|null; components: {name:string;weight:number;bonus:boolean;score:number|null;detail:string}[] } | null>(null);
    useEffect(() => {
        let alive = true;
        fetch('/api/course-grade-summary',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+pb.authStore.token},body:JSON.stringify({courseId:course.id})})
            .then(async r => {if(r.ok && alive) setSummary(await r.json());}).catch(()=>{});
        return () => {alive=false;};
    },[course.id, mySubmissions.data]);


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
				<LoaderCircle size={24} className="spin" /> {t('student.grades.loading')}
			</div>
		);
	}

	return (
		<div className="sgr-wrap">
			<div className="res-head student-page-banner">
				<div>
					<span className="ld-eyebrow">{t('student.grades.eyebrow')}</span>
					<h2 className="res-title">{t('student.grades.title')}</h2>
					<p className="res-sub">
						{t('student.grades.description')}
					</p>
				</div>
                <span className="student-banner-mascot" aria-hidden="true"><PracticeMascot size={85} /></span>
			</div>

			{summary && <section className="ld-panel" style={{padding:20,marginBottom:20}}>
    <h3>{label("Komponen nilai mata kuliah")}</h3>
    <div className="pp-profile-skills">{summary.components.map(c => <article className="pp-profile-skill" key={c.name}><strong>{c.name}</strong><p>{c.score == null ? '—' : (c.bonus ? '+' : '') + c.score}{!c.bonus && ' / 100'}</p><small>{c.bonus ? label("Bonus di luar bobot") : label("Bobot {weight}%", {weight:String(c.weight)})}</small><details className="student-grade-detail"><summary>{label("Rincian")}</summary><p>{c.detail}</p></details></article>)}</div>
    <p><strong>{label("Nilai akhir")}: {summary.published && summary.final?.value != null ? summary.final.value + ' · ' + summary.final.letter : label("Belum diterbitkan / belum lengkap")}</strong></p>
</section>}
<div className="sgr-summary">
				<div className="sgr-summary-card">
					<strong>{avg != null ? studentGradeLabel(avg) : '—'}</strong>
					<span>{t('student.grades.average')}</span>
				</div>
				<div className="sgr-summary-card">
					<strong>{graded.length}</strong>
					<span>{t('student.grades.gradedCount')}</span>
				</div>
				<div className="sgr-summary-card">
					<strong>{pending.length}</strong>
					<span>{t('student.grades.pendingCount')}</span>
				</div>
			</div>

			{graded.length === 0 && pending.length === 0 ? (
				<div className="ld-empty">
					<div className="ld-empty-icon">
						<GraduationCap size={26} strokeWidth={1.4} />
					</div>
					<h3>{t('student.grades.emptyTitle')}</h3>
					<p>{t('student.grades.emptyDescription')}</p>
				</div>
			) : (
				<>
					{graded.length > 0 && (
						<section className="ld-panel sgr-panel">
							<div className="ld-card-head">
								<h2>{t('student.grades.completed')}</h2>
								<span className="ld-chip">{graded.length}</span>
							</div>
							<ul className="sgr-list">
								{graded.map(({ assignment, submission }) => (
									<li key={assignment.id} className="sgr-row graded">
										<div className="sgr-row-main">
											<strong>{assignment.title}</strong>
											<small>{t('student.grades.deadline')} {dateLabel(assignment.deadline)}</small>
											<StudentPublishedFeedback
												submissionId={submission?.id}
												feedback={submission?.feedback}
											/>
										</div>
										<div className="sgr-row-side">
											<span className="sgr-grade">{studentGradeLabel(submission?.grade)}</span>
											<Link to={studentWorkPath(assignment.id)} className="ld-text-btn">
												{t('student.grades.view')} <ArrowRight size={13} />
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
										<h2>{t('student.grades.pending')}</h2>
								<span className="ld-chip">{pending.length}</span>
							</div>
							<ul className="sgr-list">
								{pending.map(({ assignment, submission }) => {
									const status = submission?.status;
									return (
										<li key={assignment.id} className="sgr-row">
											<div className="sgr-row-main">
												<strong>{assignment.title}</strong>
												<small>{t('student.grades.deadline')} {dateLabel(assignment.deadline)}</small>
												<span className={`asg-tag${status ? ` sub-${status}` : ' sub-missing'}`}>
									{!status ? t('worksheet.notSubmitted') : t(`worksheet.status.${status === 'draft' ? 'draft' : status === 'revision' ? 'revision' : status === 'late' ? 'late' : 'submitted'}`)}
												</span>
											</div>
											<div className="sgr-row-side">
												<Link to={studentWorkPath(assignment.id)} className="ld-text-btn">
									{submission ? t('sd.cta.draft') : t('sd.cta.assigned')} <ArrowRight size={13} />
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
