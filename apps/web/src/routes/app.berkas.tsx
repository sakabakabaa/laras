import type { Route } from './+types/app.berkas';
import { redirect } from 'react-router';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { dashboardForRole } from '@/lib/learning';
import { AppShell } from '@/components/app/app-shell';
import { FileLibraryV2 } from '@/components/app/file-library-v2';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Manajemen Berkas | LARAS',
			description:
				'Pustaka berkas dosen: unggah, cari, dan tautkan berkas ke mata kuliah, CPMK, Sub-CPMK, dan sesi.',
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
	return <div className="route-loading">Memuat manajemen berkas...</div>;
}

export default function BerkasPage() {
	return (
		<AppShell title="Manajemen Berkas" eyebrow="PUSTAKA BERKAS" variant="saas" hideHeading>
			<FileLibraryV2 />
		</AppShell>
	);
}
