import type { Route } from './+types/app.riset';
import { redirect } from 'react-router';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { AppShell } from '@/components/app/app-shell';
import { ResearchAnalyticsView } from '@/components/app/research-analytics';
import { ResearchExport } from '@/components/app/research-export';
import { FeedbackUptakeReview } from '@/components/app/feedback-uptake-review';
import { PersonalizationAnalytics } from '@/components/app/personalization-analytics';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Riset | LARAS',
			description:
				'Analitik dan ekspor data anotasi riset umpan balik AI untuk tugas formal — khusus dosen pemilik atau peneliti yang diotorisasi.',
		},
	);
}

export function clientLoader() {
	const user = requireAuth();
	if ((user as { role?: string }).role === 'student') {
		throw redirect('/app/student');
	}
	return { user };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="route-loading">Memuat riset…</div>;
}

function scrollToSection(id: string) {
	document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function RisetPage() {
	return (
		<AppShell title="Riset" eyebrow="RISET" variant="saas" hideHeading>
			<div className="riset-page">
				<section id="analitik" className="riset-section">
					<ResearchAnalyticsView onExport={() => scrollToSection('ekspor')} />
				</section>

				<section id="personalisasi" className="riset-section">
					<PersonalizationAnalytics />
				</section>

				<section id="uptake" className="riset-section">
					<FeedbackUptakeReview />
				</section>

				<section id="ekspor" className="riset-section">
					<ResearchExport />
				</section>
			</div>
		</AppShell>
	);
}
