import type { Route } from './+types/kalender';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { AppShell } from '@/components/app/app-shell';
import { AcademicCalendar } from '@/components/app/academic-calendar';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Kalender Akademik | LARAS',
			description:
				'Kalender akademik UPI Tahun Akademik 2026/2027 beserta hari libur nasional dan cuti bersama 2026, lengkap dengan sumber resmi.',
		},
	);
}

export function clientLoader() {
	return { user: requireAuth() };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="route-loading">Membuka kalender akademik...</div>;
}

export default function KalenderRoute() {
	return (
		<AppShell title="Kalender Akademik" eyebrow="KALENDER" variant="saas" hideHeading>
			<AcademicCalendar />
		</AppShell>
	);
}
