import type { Route } from './+types/app.asisten';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { redirect } from 'react-router';
import { dashboardForRole } from '@/lib/learning';
import { AppShell } from '@/components/app/app-shell';
import { AssistantPanel } from '@/components/app/assistant-panel';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Asisten Dosen | LARAS',
			description:
				'Asisten AI untuk dosen: tanya dalam bahasa Indonesia, buat mata kuliah dan tugas, dan ringkas wawasan akademik Anda — dengan konfirmasi sebelum data dibuat.',
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
	return <div className="route-loading">Membuka asisten dosen...</div>;
}

export default function AsistenPage() {
	return (
		<AppShell title="Asisten Dosen" eyebrow="Asisten" variant="saas" hideHeading>
			<AssistantPanel />
		</AppShell>
	);
}
