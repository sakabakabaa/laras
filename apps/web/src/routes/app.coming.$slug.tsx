import { Link } from 'react-router';
import type { Route } from './+types/app.coming.$slug';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { AppShell } from '@/components/app/app-shell';
import { Construction } from 'lucide-react';

const LABELS: Record<string, string> = {
	latihan: 'Latihan',
	tugas: 'Tugas',
	penilaian: 'Penilaian',
	presentasi: 'Presentasi',
	analitik: 'Analitik',
	pengaturan: 'Pengaturan',
};

export function meta({ matches, location, params }: Route.MetaArgs) {
	const label = LABELS[params.slug || ''] || 'Fitur';
	return seo(
		{ matches, location },
		{
			title: `${label} | LARAS`,
			description: `${label} segera hadir di LARAS.`,
		},
	);
}

export function clientLoader() {
	return { user: requireAuth() };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return <div className="route-loading">Memuat...</div>;
}

export default function ComingSoonPage({ params }: Route.ComponentProps) {
	const label = LABELS[params.slug || ''] || 'Fitur ini';
	return (
		<AppShell title={label} eyebrow="SEGERA HADIR" variant="saas">
			<div className="ld-coming-page">
				<div className="ld-coming-icon">
					<Construction size={32} strokeWidth={1.4} />
				</div>
				<h2>{label} segera hadir</h2>
				<p>
					Kami sedang menyiapkan modul {label.toLowerCase()} agar terintegrasi dengan mata kuliah
					dan sesi Anda. Sementara itu, kelola kelas dari dashboard dan detail mata kuliah.
				</p>
				<Link to="/app" className="ld-btn-primary">
					Kembali ke Dashboard
				</Link>
			</div>
		</AppShell>
	);
}
