import type { Route } from './+types/app.tugas.$assignmentId';
import { redirect } from 'react-router';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { dashboardForRole } from '@/lib/learning';
import { AppShell } from '@/components/app/app-shell';
import { EvaluationWorkspace } from '@/components/app/evaluation-workspace';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Penilaian tugas | LARAS',
			description: 'Tinjau jawaban, riwayat Cek jawaban, dan simpan nilai resmi.',
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
	return <div className="route-loading">Memuat penilaian...</div>;
}

export default function TugasEvaluationPage({ params }: Route.ComponentProps) {
	return (
		<AppShell title="Penilaian" eyebrow="TUGAS" variant="saas" hideHeading back>
			<EvaluationWorkspace assignmentId={params.assignmentId || ''} />
		</AppShell>
	);
}
