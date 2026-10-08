import { redirect } from 'react-router';
import type { Route } from './+types/app.penilaian';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { dashboardForRole } from '@/lib/learning';
import { AppShell } from '@/components/app/app-shell';
import { PenilaianIndex } from '@/components/app/penilaian-index';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Penilaian | LARAS',
			description: 'Kelola nilai seluruh mahasiswa terdaftar di setiap mata kuliah.',
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
	return <div className="route-loading">Membuka penilaian...</div>;
}

export default function PenilaianRoute() {
	return (
		<AppShell title="Penilaian" eyebrow="PENILAIAN" variant="saas" hideHeading>
			<PenilaianIndex />
		</AppShell>
	);
}
