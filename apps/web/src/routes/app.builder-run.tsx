import { useParams } from 'react-router';
import { requireAuth } from '@/lib/require-auth';
import { AppShell } from '@/components/app/app-shell';
import { BuilderRun } from '@/components/app/builder/builder-run';
import '@/styles/builder-workspace.css';
export function meta() {
	return [{ title: 'Kegiatan | LARAS' }];
}
export function clientLoader() {
	return { user: requireAuth() };
}
clientLoader.hydrate = true as const;
export function HydrateFallback() {
	return <div className="route-loading">Membuka kegiatan…</div>;
}
export default function BuilderRunRoute() {
	const { runId } = useParams();
	return (
		<AppShell title="Kegiatan" eyebrow="KEGIATAN" variant="saas" hideHeading>
			<BuilderRun key={runId} id={runId || ''} />
		</AppShell>
	);
}
