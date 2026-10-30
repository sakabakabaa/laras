import type { Route } from './+types/home';
import { seo } from '@/lib/seo';
import '@/styles/landing.css';
import { LandingEffects } from '@/components/home/landing-effects';
import { Hero } from '@/components/home/hero';
import { WorkspacePreview } from '@/components/home/workspace-preview';
import { CompactWorkflow, ProgressAndTrust } from '@/components/home/compact-tour';
import { FinalCta } from '@/components/home/final-cta';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'LARAS | Belajar bahasa. Mengajar lebih cerdas.',
		description:
			'LARAS menyatukan pembelajaran bahasa, asisten AI, tugas, evaluasi, dan wawasan akademik dalam satu ruang kerja untuk mahasiswa dan dosen. AI membantu, dosen tetap memutuskan.',
	});
}

export default function HomePage() {
	return (
		<main className="lp-main lp-compact">
			<LandingEffects />
			<Hero />
			<WorkspacePreview />
			<CompactWorkflow />
			<ProgressAndTrust />
			<FinalCta />
		</main>
	);
}
