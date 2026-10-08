import type { Route } from './+types/course.index';
import { seo } from '@/lib/seo';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo(
		{ matches, location },
		{
			title: 'Ringkasan | LARAS',
			description: 'Ringkasan kelengkapan RPS, sesi, dan tugas mata kuliah.',
		},
	);
}

export default function CourseIndexRoute() {
	return null;
}
