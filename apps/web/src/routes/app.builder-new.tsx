import { redirect } from 'react-router';
import { requireAuth } from '@/lib/require-auth';
import { AppShell } from '@/components/app/app-shell';
import { BuilderNew } from '@/components/app/builder/builder-entry';
import '@/styles/builder-workspace.css';
export function meta() {
	return [{ title: 'Buat kelas atau tugas | LARAS' }];
}
export function clientLoader() {
	const user = requireAuth();
	if (user.role !== 'faculty') throw redirect('/app/student');
	return { user };
}
clientLoader.hydrate = true as const;
export function HydrateFallback() {
	return <div className="route-loading">Membuka builder…</div>;
}
export default function NewBuilderRoute() {
	return (
		<AppShell
			title="Buat kelas atau tugas"
			eyebrow="BUILDER"
			variant="saas"
			hideHeading
		>
			<BuilderNew />
		</AppShell>
	);
}
