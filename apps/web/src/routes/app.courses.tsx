import { redirect } from 'react-router';
import type { Route } from './+types/app.courses';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { CoursesPage } from '@/components/app/courses-page';
import { StudentCourses } from '@/components/app/student-courses';
import pb from '@/lib/pocketbase-client';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Mata Kuliah | LARAS',
			description: 'Buka mata kuliah yang Anda ikuti, atau kelola kelas yang Anda ampu beserta materi, sesi, dan tugas.',
		},
	);
}

export function clientLoader() {
	const user = requireAuth();
	// Same first-login gate as the student dashboard, so this list cannot
	// bypass the required password change.
	if (
		(user as { role?: string }).role === 'student' &&
		(user as { mustChangePassword?: boolean }).mustChangePassword
	) {
		throw redirect('/app/onboarding');
	}
	return { user };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="route-loading">Membuka mata kuliah...</div>;
}

export default function CoursesRoute({
	loaderData,
}: {
	loaderData?: { user?: { role?: string } };
}) {
	const role =
		loaderData?.user?.role || (pb.authStore.record as { role?: string } | null)?.role;
	if (role === 'student') return <StudentCourses />;
	return <CoursesPage />;
}
