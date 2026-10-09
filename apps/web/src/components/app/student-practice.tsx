import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, BookOpenCheck, ChevronLeft, Gamepad2, GraduationCap, Languages, LoaderCircle, MessageCircle, Sparkles } from 'lucide-react';
import { AppShell } from '@/components/app/app-shell';
import { PersonalPractice } from '@/components/app/personal-practice';
import { PracticeMascot } from '@/components/app/practice-mascot';
import { useCachedQuery } from '@/hooks/use-cached-query';
import pb from '@/lib/pocketbase-client';
import type { Course, Enrollment } from '@/lib/learning';

type PracticeEnrollment = Enrollment & { expand?: { course?: Course } };
const courseIcons = [Languages, BookOpenCheck, MessageCircle, GraduationCap];

export function StudentPractice() {
	const [selectedCourse, setSelectedCourse] = useState('');
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

	return <AppShell title="Latihan" eyebrow="Latihan" variant="saas" hideHeading>
		<div className="ld-student pp-game-hub">
			{!activeCourse ? <>
			<header className="pp-game-hero">
				<div className="pp-game-hero-art"><span className="pp-game-art-spark">✦</span><span className="pp-game-art-dot" /><PracticeMascot size={106} /></div>
				<div>
					<span className="pp-eyebrow"><Gamepad2 size={13} /> ARENA LATIHAN</span>
					<h1>Pilih petualanganmu.</h1>
					<p>Pilih mata kuliah. Selesaikan tantangan dari materi kelas dan kumpulkan XP.</p>
				</div>
				<div className="pp-game-hero-stats"><span><Sparkles size={15} /> XP latihan</span><strong>Tanpa nilai resmi</strong></div>
			</header>

			{enrollmentQuery.loading ? <div className="ld-loading"><LoaderCircle size={22} className="spin" /> Memuat mata kuliah…</div> : enrollmentQuery.error ? <div className="ld-alert" role="alert">{enrollmentQuery.error} <button type="button" onClick={enrollmentQuery.reload}>Coba lagi</button></div> : courses.length === 0 ? <section className="ld-panel pp-game-empty"><BookOpen size={25} /><h2>Belum ada mata kuliah</h2><p>Setelah Anda terdaftar di kelas, latihan dari materi kelas akan muncul di sini.</p></section> : <>
				<nav className="pp-game-courses" aria-label="Pilih mata kuliah untuk latihan">
					{courses.map((course, index) => { const CourseIcon = courseIcons[index % courseIcons.length]; return <button key={course.id} type="button" className={`pp-game-course pp-world-${index % 4}`} onClick={() => setSelectedCourse(course.id)} aria-label={`Mulai latihan ${course.title}`}>
						<span className="pp-course-art" aria-hidden="true"><span className="pp-course-art-sun" /><span className="pp-course-art-hill" /><span className="pp-course-art-path" /><span className="pp-course-art-symbol"><CourseIcon size={31} strokeWidth={1.7} /></span><span className="pp-course-art-level">DUNIA {String(index + 1).padStart(2, '0')}</span><span className="pp-course-art-star">✦</span></span>
						<span className="pp-game-course-copy"><small>{course.code || 'Mata kuliah'}{course.semester ? ` · ${course.semester}` : ''}</small><strong>{course.title}</strong><span className="pp-course-cta">Mulai petualangan <ArrowRight size={15} /></span></span>
					</button>; })}
				</nav>
			</>}
			</> : <div className="pp-game-flow">
				<div className="pp-game-flow-heading"><button type="button" className="pp-back" onClick={() => setSelectedCourse('')}><ChevronLeft size={16} /> Pilih mata kuliah</button><span className="pp-game-flow-course"><span className="pp-eyebrow">MATA KULIAH</span><strong>{activeCourse.title}</strong></span></div>
				<PersonalPractice key={activeCourse.id} courseId={activeCourse.id} gameMode />
			</div>}
		</div>
	</AppShell>;
}
