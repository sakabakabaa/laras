import { Navigate, Outlet, useLocation, useParams } from 'react-router';
import type { Route } from './+types/course';
import { requireAuth } from '@/lib/require-auth';
import { AppShell } from '@/components/app/app-shell';
import { CourseDetail } from '@/components/app/course-detail';
import { CourseRail } from '@/components/app/course-rail';
import { useAuth } from '@/hooks/use-auth';
import { useCourseByRoute } from '@/hooks/use-course-route';
import pb from '@/lib/pocketbase-client';

export function clientLoader() {
	return { user: requireAuth() };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="route-loading">Membuka mata kuliah...</div>;
}

export default function CourseLayout() {
	const { courseId = '', sessionId = '' } = useParams();
	const location = useLocation();
	const isStudentProfile = /\/mahasiswa\/[^/]+\/?$/.test(location.pathname);
	const { user } = useAuth();
	const role = (user as { role?: string } | null)?.role || 'faculty';
	const isStudent = role === 'student';
	const isLiveSession = /\/pertemuan\/[^/]+\/terjadwal\/?$/.test(location.pathname);
	const focusSession = isLiveSession && (isStudent || new URLSearchParams(location.search).get('preview') === 'student');
	const courseQuery = useCourseByRoute(courseId);
	const course = courseQuery.data ?? null;
	const isOwner = !isStudent && course?.owner === pb.authStore.record?.id;
	if (isLiveSession && !isStudent) return <Navigate replace to={`/app/kelas-terjadwal/${courseId}/${sessionId}${location.search}`} />;

	return (
		<AppShell
			title={course?.title || 'Mata kuliah'}
			eyebrow="MATA KULIAH"
			variant="saas"
			hideHeading
			hideSidebar={focusSession}
			rail={
				!focusSession && <CourseRail
					course={course}
					routeId={courseId}
					isStudent={isStudent}
					isOwner={Boolean(isOwner)}
				/>
			}
		>
			{!isStudentProfile && !/\/pertemuan\/[^/]+\/(rencana|terjadwal)\/?$/.test(location.pathname) && <CourseDetail routeId={courseId} />}
			<Outlet />
		</AppShell>
	);
}
