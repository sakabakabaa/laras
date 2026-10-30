import type { Route } from './+types/app.tugas.$assignmentId.pratinjau';
import { redirect } from 'react-router';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { dashboardForRole } from '@/lib/learning';
import { LecturerAssignmentPreview } from '@/components/app/lecturer-assignment-preview';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Pratinjau mahasiswa | LARAS',
			description:
				'Pratinjau hanya-tampilan lembar kerja dan halaman hasil yang dilihat mahasiswa untuk tugas ini.',
		},
	);
}

export function clientLoader({ params }: Route.ClientLoaderArgs) {
	const user = requireAuth();
	if ((user as { role?: string }).role === 'student') {
		throw redirect(dashboardForRole('student'));
	}
	return null;
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="route-loading">Membuka pratinjau...</div>;
}

export default function TugasPratinjauPage({ params }: Route.ComponentProps) {
	return <LecturerAssignmentPreview assignmentId={params.assignmentId || ''} />;
}
