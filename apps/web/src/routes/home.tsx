import type { Route } from './+types/home';
import { seo } from '@/lib/seo';
import '@/styles/landing.css';
import { LandingEffects } from '@/components/home/landing-effects';
import { Hero } from '@/components/home/hero';
import { WorkspacePreview } from '@/components/home/workspace-preview';
import { Capabilities } from '@/components/home/capabilities';
import { StudentJourney } from '@/components/home/student-journey';
import { Lecturer } from '@/components/home/lecturer';
import { AiContext } from '@/components/home/ai-context';
import { Workflow } from '@/components/home/workflow';
import { Analytics } from '@/components/home/analytics';
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
		<main className="lp-main">
			<LandingEffects />
			<Hero />
			<WorkspacePreview />
			<Capabilities />
			<StudentJourney />
			<Lecturer />
			<AiContext />
			<Workflow />
			<Analytics />
			<FinalCta />
		</main>
	);
}
