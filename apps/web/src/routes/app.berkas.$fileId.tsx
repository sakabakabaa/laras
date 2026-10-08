import type { Route } from './+types/app.berkas.$fileId';
import { redirect } from 'react-router';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { dashboardForRole } from '@/lib/learning';
import { AppShell } from '@/components/app/app-shell';
import { FileContextView } from '@/components/app/file-context';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Konteks Berkas | LARAS',
			description:
				'Tinjau teks hasil penguraian, konfirmasi bahasa, dan tautkan bagian konten ke CPMK, Sub-CPMK, dan sesi — khusus dosen pemilik berkas.',
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
	return <div className="route-loading">Memuat konteks berkas...</div>;
}

export default function BerkasContextPage({ params }: Route.ComponentProps) {
	return (
		<AppShell title="Konteks Berkas" eyebrow="PUSTAKA BERKAS" variant="saas" hideHeading>
			<FileContextView fileId={params.fileId} />
		</AppShell>
	);
}
