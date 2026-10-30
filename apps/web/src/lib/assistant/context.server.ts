/**
 * Assistant runtime — context construction.
 *
 * Resolves the course a tool refers to (by record id, code, slug, or unique
 * title), derives the page context from the lecturer's current route, and
 * builds the system prompt. Page context is only a fallback when the requested
 * ref is empty or matches the open course's code/slug — a genuinely unknown
 * course is never substituted.
 */
import type PocketBase from 'pocketbase';
import { ASSISTANT_SYSTEM_PROMPT } from '@/constants/assistant.config';
import type { Course } from '@/lib/learning';
import { formatSessionContext } from './compaction';
import { featureDescriptor } from './features';
import { PB_ID_RE, slugifyCode } from './parsing';
import type { AssistantPageContext, SessionStructuredContext } from './types';

/** Loads the lecturer's owned courses, newest first. */
export const loadOwnedCourses = (pb: PocketBase, userId: string) =>
	pb.collection('courses').getFullList<Course>({
		filter: pb.filter('owner = {:id}', { id: userId }),
		sort: '-created',
	});

/** Match a lecturer-owned course by record id, code, slug, or unique title. */
export const matchOwnedCourse = (courses: Course[], ref: string): Course | 'ambiguous' | null => {
	const raw = ref.trim();
	if (!raw) return null;
	const lower = raw.toLowerCase();
	const slug = slugifyCode(raw).toLowerCase();
	if (PB_ID_RE.test(raw)) {
		const byId = courses.find((course) => course.id === raw);
		if (byId) return byId;
	}
	const byCode = courses.filter((course) => (course.code || '').trim().toLowerCase() === lower);
	if (byCode.length === 1) return byCode[0];
	if (byCode.length > 1) return 'ambiguous';
	if (slug) {
		const bySlug = courses.filter((course) => slugifyCode(course.code || '').toLowerCase() === slug);
		if (bySlug.length === 1) return bySlug[0];
		if (bySlug.length > 1) return 'ambiguous';
	}
	const byTitle = courses.filter((course) => course.title.trim().toLowerCase() === lower);
	if (byTitle.length === 1) return byTitle[0];
	if (byTitle.length > 1) return 'ambiguous';
	return null;
};

/** A readable label for a course: "CODE · Title" or just "Title". */
export const courseLabel = (course: Course): string =>
	course.code ? `${course.code} · ${course.title}` : course.title;

/** The message shown when a referenced course cannot be found. */
export const courseMissMessage = (ref: string, courses: Course[]): string => {
	const listed = courses
		.slice(0, 6)
		.map((course) => courseLabel(course))
		.join('; ');
	const asked = ref.trim() || 'yang diminta';
	return [
		`Mata kuliah “${asked}” tidak ditemukan di akun Anda.`,
		'Tidak ada tugas yang dibuat.',
		listed ? `Mata kuliah yang ada: ${listed}.` : 'Anda belum memiliki mata kuliah.',
		'Buka halaman mata kuliah yang dimaksud, atau sebutkan kode yang tepat, lalu minta asisten menyusun ulang drafnya.',
	].join(' ');
};

export type CourseResolution = { course: Course | null; courses: Course[]; ambiguous: boolean };

/**
 * Resolve the course a write/read tool refers to. Page context is only a
 * fallback when the requested ref is empty or is the open course's code/slug.
 */
export const resolveCourseRef = async (
	pb: PocketBase,
	userId: string,
	ref: string,
	courseRoute = '',
): Promise<CourseResolution> => {
	const courses = await loadOwnedCourses(pb, userId);
	const direct = matchOwnedCourse(courses, ref);
	if (direct === 'ambiguous') return { course: null, courses, ambiguous: true };
	if (direct) return { course: direct, courses, ambiguous: false };
	const page = courseRoute ? matchOwnedCourse(courses, decodeURIComponent(courseRoute)) : null;
	if (page && page !== 'ambiguous' && (!ref.trim() || matchOwnedCourse([page], ref))) {
		return { course: page, courses, ambiguous: false };
	}
	return { course: null, courses, ambiguous: false };
};

/** Derives the page context (resolved open course) from the route segment. */
export const buildPageContext = async (
	pb: PocketBase,
	userId: string,
	courseRoute: string,
): Promise<AssistantPageContext> => {
	const course = courseRoute ? (await resolveCourseRef(pb, userId, '', courseRoute)).course : null;
	return { route: '', feature: '', courseRoute, course };
};

/** Builds the system prompt, injecting semantic page context when available. */
export const buildSystemPrompt = (
	pageContext: AssistantPageContext,
	sessionContext?: { summary: string; structured: SessionStructuredContext | null },
): string => {
	const { course, feature, entity, state, availableActions } = pageContext;
	const lines: string[] = [ASSISTANT_SYSTEM_PROMPT];
	const contextLines: string[] = [];

	const descriptor = feature ? featureDescriptor(feature) : undefined;
	if (descriptor) {
		contextLines.push(`Fitur halaman: ${descriptor.label} — ${descriptor.description}`);
	}
	if (course) {
		contextLines.push(
			`Dosen sedang membuka mata kuliah "${course.title}" (kode: ${course.code || '—'}). courseId yang wajib dipakai untuk tool adalah persis "${course.id}". Jangan pernah memakai kode, slug, atau judul sebagai courseId.`,
		);
	}
	if (entity) {
		contextLines.push(`Entitas yang sedang dibuka: ${entity.type} (id: ${entity.id}).`);
	}
	if (state && Object.keys(state).length > 0) {
		const pairs = Object.entries(state)
			.map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
			.join('; ');
		contextLines.push(`Kondisi halaman: ${pairs}`);
	}
	if (availableActions && availableActions.length > 0) {
		contextLines.push(`Aksi yang tersedia di halaman ini: ${availableActions.join(', ')}.`);
	}

	if (contextLines.length > 0) {
		contextLines.push(
			'Saat dosen menyebut "ini", "yang ini", "tugas ini", "mata kuliah ini", "RPS ini", atau "pertemuan ini", anggap yang dimaksud adalah entitas/konteks halaman saat ini di atas. Untuk create_assignment, jika dosen tidak menyebut mata kuliah lain, gunakan courseId dari konteks halaman.',
		);
		lines.push('', 'KONTEKS HALAMAN SAAT INI:', ...contextLines.map((line) => `- ${line}`));
	}

	// Durable session context (compacted summary + structured state). Injected
	// only when compaction has produced one, so a fresh session sends nothing.
	if (sessionContext) {
		const block = formatSessionContext(sessionContext.summary, sessionContext.structured);
		if (block) lines.push('', block);
	}

	return lines.join('\n');
};
