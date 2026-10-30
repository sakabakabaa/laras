import pb from '@/lib/pocketbase-client';

/** Gradient fallbacks shown while a course has no uploaded thumbnail. */
export const COURSE_COVERS = [
	'linear-gradient(135deg,#7F1D16 0%,#B3261E 55%,#f0d5d0 100%)',
	'linear-gradient(135deg,#1e3a5f 0%,#4a7ab0 55%,#d6e6f5 100%)',
	'linear-gradient(135deg,#2d4a22 0%,#6a9a4e 55%,#dce8d4 100%)',
	'linear-gradient(135deg,#5c3d1e 0%,#c49a5a 55%,#f3e6d0 100%)',
];

/** Stable gradient per course id, so the same course looks the same everywhere. */
export function courseCoverFor(course: { id: string }): string {
	let hash = 0;
	for (const ch of course.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
	return COURSE_COVERS[hash % COURSE_COVERS.length];
}

/** Public file URL for a course thumbnail, or null when none is uploaded. */
export function courseThumbUrl(course: {
	id: string;
	thumbnail?: string | null;
}): string | null {
	if (!course.thumbnail) return null;
	const record = {
		id: course.id,
		collectionName: 'courses',
	} as unknown as Parameters<typeof pb.files.getURL>[0];
	return pb.files.getURL(record, course.thumbnail);
}
