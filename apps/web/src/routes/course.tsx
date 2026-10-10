import { Outlet, useLocation, useParams } from 'react-router';
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
	const { courseId = '' } = useParams();
	const location = useLocation();
	const isStudentProfile = /\/mahasiswa\/[^/]+\/?$/.test(location.pathname);
	const { user } = useAuth();
	const role = (user as { role?: string } | null)?.role || 'faculty';
	const isStudent = role === 'student';
	const courseQuery = useCourseByRoute(courseId);
	const course = courseQuery.data ?? null;
	const isOwner = !isStudent && course?.owner === pb.authStore.record?.id;

	return (
		<AppShell
			title={course?.title || 'Mata kuliah'}
			eyebrow="MATA KULIAH"
			variant="saas"
			hideHeading
			rail={
				<CourseRail
					course={course}
					routeId={courseId}
					isStudent={isStudent}
					isOwner={Boolean(isOwner)}
				/>
			}
		>
			{!isStudentProfile && !/\/pertemuan\/[^/]+\/rencana\/?$/.test(location.pathname) && <CourseDetail routeId={courseId} />}
			<Outlet />
		</AppShell>
	);
}
