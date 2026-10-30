import type { Route } from './+types/app.pengaturan';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { AppShell } from '@/components/app/app-shell';
import { SettingsPage } from '@/components/app/settings/settings-page';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Pengaturan | LARAS',
		description:
			'Kelola profil, kata sandi, email pemulihan, dan preferensi tampilan akun LARAS Anda.',
	});
}

export function clientLoader() {
	const user = requireAuth();
	return { user };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="route-loading">Memuat pengaturan...</div>;
}

export default function PengaturanPage() {
	return (
		<AppShell title="Pengaturan" eyebrow="Akun" variant="saas">
			<SettingsPage />
		</AppShell>
	);
}
