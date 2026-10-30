import type { Route } from './+types/app.tugas.insights';
import { redirect } from 'react-router';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { dashboardForRole } from '@/lib/learning';
import { AppShell } from '@/components/app/app-shell';
import { TugasInsights } from '@/components/app/tugas-insights';
import { LecturerRecommendations } from '@/components/app/lecturer-recommendations';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Wawasan kesulitan | LARAS',
			description:
				'Rincian agregat riwayat Cek jawaban: area kesulitan, tingkat panduan, dan pemeriksaan per peserta — formatif, bukan nilai resmi.',
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
	return <div className="route-loading">Memuat wawasan kesulitan...</div>;
}

export default function TugasInsightsPage() {
	return (
		<AppShell title="Wawasan kesulitan" eyebrow="TUGAS" variant="saas" hideHeading>
			<TugasInsights />
		</AppShell>
	);
}
