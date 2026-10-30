import { redirect } from 'react-router';
import type { Route } from './+types/app.kerja.$assignmentId';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { StudentWorkPage } from '@/components/app/student-work-page';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Lembar kerja | LARAS',
			description: 'Kerjakan tugas atau latihan formatif di lembar kerja penuh, lalu periksa saran AI.',
		},
	);
}

export function clientLoader({ params }: Route.ClientLoaderArgs) {
	const user = requireAuth();
	if ((user as { role?: string }).role !== 'student') {
		throw redirect(`/app/tugas/${params.assignmentId || ''}`);
	}
	return null;
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="route-loading">Membuka lembar kerja...</div>;
}

export default function StudentWorkRoute({ params }: Route.ComponentProps) {
	return <StudentWorkPage assignmentId={params.assignmentId || ''} />;
}
