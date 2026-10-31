import { redirect, useParams } from 'react-router';
import { requireAuth } from '@/lib/require-auth';
import { AppShell } from '@/components/app/app-shell';
import { BuilderWorkspace } from '@/components/app/builder/builder-workspace';
import '@/styles/builder-workspace.css';
export function meta() {
	return [{ title: 'Builder | LARAS' }];
}
export function clientLoader() {
	const user = requireAuth();
	if (user.role !== 'faculty') throw redirect('/app/student');
	return { user };
}
clientLoader.hydrate = true as const;
export function HydrateFallback() {
	return <div className="route-loading">Membuka draf…</div>;
}
export default function BuilderRoute() {
	const { documentId } = useParams();
	return (
		<AppShell title="Builder" eyebrow="BUILDER" variant="saas" hideHeading>
			<BuilderWorkspace key={documentId} id={documentId || ''} />
		</AppShell>
	);
}
