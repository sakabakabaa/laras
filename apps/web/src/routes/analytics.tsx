import type { Route } from './+types/analytics';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { AppShell } from '@/components/app/app-shell';
import { AnalyticsIndex } from '@/components/app/analytics-index';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Analitik | LARAS',
			description: 'Daftar mata kuliah dan tautan ke analitik pengumpulan, penilaian, dan capaian tiap kelas.',
		},
	);
}

export function clientLoader() {
	return { user: requireAuth() };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="route-loading">Membuka analitik...</div>;
}

export default function AnalyticsRoute() {
	return (
		<AppShell title="Analitik" eyebrow="ANALITIK" variant="saas" hideHeading>
			<AnalyticsIndex />
		</AppShell>
	);
}
