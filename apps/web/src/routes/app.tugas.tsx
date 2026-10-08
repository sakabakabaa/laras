import type { Route } from './+types/app.tugas';
import { redirect } from 'react-router';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { dashboardForRole } from '@/lib/learning';
import { AppShell } from '@/components/app/app-shell';
import { TugasBoard } from '@/components/app/tugas-board';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Tugas | LARAS',
			description: 'Penilaian tugas dosen: pengumpulan, riwayat pemeriksaan, dan nilai resmi.',
		},
	);
}

export function clientLoader() {
	const user = requireAuth();
	if ((user as { role?: string }).role === 'student') {
		throw redirect(dashboardForRole('student'));
	}
	return { user };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="route-loading">Memuat tugas...</div>;
}

export default function TugasPage() {
	return (
		<AppShell title="Tugas" eyebrow="PENILAIAN" variant="saas" hideHeading>
			<TugasBoard />
		</AppShell>
	);
}
