import { useT } from '@/lib/i18n';
import { ConversationPractice } from '@/components/app/conversation-practice';
import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, BookOpenCheck, ChevronLeft, GraduationCap, Languages, LoaderCircle, MessageCircle } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { AppShell } from '@/components/app/app-shell';
import { PersonalPractice } from '@/components/app/personal-practice';
import { useCachedQuery } from '@/hooks/use-cached-query';
import pb from '@/lib/pocketbase-client';
import type { Course, Enrollment } from '@/lib/learning';

type PracticeEnrollment = Enrollment & { expand?: { course?: Course } };
const courseIcons = [Languages, BookOpenCheck, MessageCircle, GraduationCap];

export function StudentPractice() {
	const t = useT();
	const [params] = useSearchParams();
	const [practiceMode, setPracticeMode] = useState<'questions'|'conversation'>('questions');
	const [selectedCourse, setSelectedCourse] = useState(() => params.get('course') || '');
	const enrollmentQuery = useCachedQuery<PracticeEnrollment[]>('enrollments:mine', () =>
		pb.collection('enrollments').getFullList<PracticeEnrollment>({
			filter: pb.filter('owner = {:me}', { me: pb.authStore.record?.id }),
			expand: 'course',
			sort: '-created',
		}),
	);
	const courses = useMemo(() => {
		const seen = new Set<string>();
		return (enrollmentQuery.data ?? []).flatMap((enrollment) => {
			const course = enrollment.expand?.course;
			if (!course || seen.has(course.id)) return [];
			seen.add(course.id);
			return [course];
		});
	}, [enrollmentQuery.data]);
	const activeCourse = courses.find((course) => course.id === selectedCourse);

	return <AppShell title={t('practice.title')} eyebrow={t('practice.title')} variant="saas" hideHeading>
		<div className="ld-student pp-practice-home">
			{activeCourse ? <div className="pp-practice-course-view">
				<div className="pp-practice-course-heading">
					<button type="button" className="pp-back" onClick={() => setSelectedCourse('')}><ChevronLeft size={16} /> {t('practice.choose')}</button>
					<div><span className="pp-eyebrow">{activeCourse.code || 'MATA KULIAH'}</span><strong>{activeCourse.title}</strong></div>
				</div>
				<div className="cp-mode-picker" aria-label={t('practice.kind')}><button type="button" aria-pressed={practiceMode === 'questions'} onClick={() => setPracticeMode('questions')}><BookOpenCheck size={17} /> {t('practice.questions')}</button><button type="button" aria-pressed={practiceMode === 'conversation'} onClick={() => setPracticeMode('conversation')}><MessageCircle size={17} /> {t('practice.conversation')}</button></div>
                {practiceMode === 'conversation' ? <ConversationPractice key={activeCourse.id} courseId={activeCourse.id} /> : <PersonalPractice key={activeCourse.id} courseId={activeCourse.id} />}
			</div> : <>
				<header className="pp-practice-home-heading">
					<div><span className="pp-eyebrow">{t('practice.eyebrow')}</span><h1>{t('practice.heading')}</h1><p>{t('practice.description')}</p></div>
					<span className="pp-badge">{t('practice.ungraded')}</span>
				</header>

				{enrollmentQuery.loading ? <div className="ld-loading"><LoaderCircle size={22} className="spin" /> {t('student.courses.loading')}</div> : enrollmentQuery.error ? <div className="ld-alert" role="alert">{enrollmentQuery.error} <button type="button" onClick={enrollmentQuery.reload}>{t('student.common.retry')}</button></div> : courses.length === 0 ? <section className="ld-panel pp-practice-empty"><BookOpen size={25} /><h2>{t('student.courses.emptyTitle')}</h2><p>{t('student.courses.emptyBody')}</p></section> : <>
					<div className="pp-practice-section-heading"><h2>{t('practice.courses')}</h2><span>{courses.length} {courses.length === 1 ? 'mata kuliah' : 'mata kuliah'}</span></div>
					<nav className="pp-practice-courses" aria-label="Pilih mata kuliah untuk latihan">
						{courses.map((course, index) => { const CourseIcon = courseIcons[index % courseIcons.length]; return <button key={course.id} type="button" className="pp-practice-course" onClick={() => setSelectedCourse(course.id)}>
							<span className="pp-practice-course-icon" aria-hidden="true"><CourseIcon size={21} strokeWidth={1.8} /></span>
							<span className="pp-practice-course-copy"><small>{course.code || 'Mata kuliah'}{course.semester ? ` · ${course.semester}` : ''}</small><strong>{course.title}</strong><span>{t('practice.start')} <ArrowRight size={15} /></span></span>
						</button>; })}
					</nav>
				</>}
			</>}
		</div>
	</AppShell>;
}
