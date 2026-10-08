import type { Route } from './+types/app.rps.$courseId';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { redirect } from 'react-router';
import { dashboardForRole } from '@/lib/learning';
import { RpsEditorPage } from '@/components/app/rps-editor-page';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Editor RPS | LARAS',
			description:
				'Susun Rencana Pembelajaran Semester langkah demi langkah: identitas, capaian, rencana pertemuan, workload, penilaian, dan tugas kolaboratif.',
		},
	);
}

export function clientLoader({ params }: { params: { courseId: string } }) {
	const user = requireAuth();
	if ((user as { role?: string }).role === 'student') {
		throw redirect(dashboardForRole('student'));
	}
	return { user, courseId: params.courseId };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="route-loading">Membuka editor RPS...</div>;
}

export default function RpsEditorRoute({
	loaderData,
	params,
}: {
	loaderData?: { courseId?: string };
	params: { courseId: string };
}) {
	const raw = loaderData?.courseId || params.courseId;
	const courseId = raw === 'new' ? null : raw;
	return <RpsEditorPage courseId={courseId} />;
}
