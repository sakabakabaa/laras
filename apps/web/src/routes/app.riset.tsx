import { useState } from 'react';
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

type Tab = 'analitik' | 'personalisasi' | 'uptake' | 'ekspor';

export default function RisetPage() {
	const [tab, setTab] = useState<Tab>('analitik');
	return (
		<AppShell title="Riset" eyebrow="RISET" variant="saas" hideHeading>
			<div className="ra-tabs" role="tablist" aria-label="Bagian riset">
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'analitik'}
					className={tab === 'analitik' ? 'active' : ''}
					onClick={() => setTab('analitik')}
				>
					Analitik
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'personalisasi'}
					className={tab === 'personalisasi' ? 'active' : ''}
					onClick={() => setTab('personalisasi')}
				>
					Personalisasi
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'uptake'}
					className={tab === 'uptake' ? 'active' : ''}
					onClick={() => setTab('uptake')}
				>
					Uptake & revisi
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'ekspor'}
					className={tab === 'ekspor' ? 'active' : ''}
					onClick={() => setTab('ekspor')}
				>
					Ekspor data
				</button>
			</div>
			{tab === 'analitik' ? (
				<ResearchAnalyticsView onExport={() => setTab('ekspor')} />
			) : tab === 'personalisasi' ? (
				<PersonalizationAnalytics />
			) : tab === 'uptake' ? (
				<FeedbackUptakeReview />
			) : (
				<ResearchExport />
			)}
		</AppShell>
	);
}
