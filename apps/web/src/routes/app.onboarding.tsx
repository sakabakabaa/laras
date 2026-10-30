import { redirect } from 'react-router';
import type { Route } from './+types/app.onboarding';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { AppShell } from '@/components/app/app-shell';
import { StudentOnboarding } from '@/components/app/student-onboarding';
import { dashboardForRole } from '@/lib/learning';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Amankan akun | LARAS',
		description: 'Ubah kata sandi default dan tambahkan email pemulihan untuk akun mahasiswa Anda.',
	});
}

export function clientLoader() {
	const user = requireAuth();
	// Students complete onboarding here; faculty are sent to their own dashboard.
	if ((user as { role?: string }).role !== 'student') {
		throw redirect(dashboardForRole('faculty'));
	}
	return { user };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="route-loading">Membuka pengaturan akun...</div>;
}

export default function OnboardingPage() {
	return (
		<AppShell title="Amankan akun" eyebrow="Pengaturan akun" variant="saas" hideHeading>
			<StudentOnboarding />
		</AppShell>
	);
}
