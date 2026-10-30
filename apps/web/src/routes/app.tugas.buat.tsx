import type { Route } from './+types/app.tugas.buat';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { redirect } from 'react-router';
import { dashboardForRole } from '@/lib/learning';
import { AssignmentEditorPage } from '@/components/app/assignment-editor-page';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Buat Tugas | LARAS',
			description:
				'Susun tugas langkah demi langkah: konteks mata kuliah, jenis tugas, instruksi, format jawaban, kriteria, materi, bantuan AI, waktu, latihan persiapan, dan terbitkan.',
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
	return <div className="route-loading">Membuka editor tugas...</div>;
}

export default function TugasBuatPage() {
	return <AssignmentEditorPage />;
}
