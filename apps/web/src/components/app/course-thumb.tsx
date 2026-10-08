import { courseCoverFor, courseThumbUrl } from '@/lib/course-thumb';
import type { Course } from '@/lib/learning';

/**
 * Course thumbnail square: the uploaded image when one exists, otherwise the
 * stable gradient fallback. Used on every course row and assignment card so
 * the same course is recognizable across the app.
 */
export function CourseThumb({
	course,
	cover,
	className,
}: {
	course: Pick<Course, 'id' | 'thumbnail'>;
	cover?: string;
	className?: string;
}) {
	const url = courseThumbUrl(course);
	const background = cover ?? courseCoverFor(course);
	return (
		<div
			className={`ld-course-thumb${className ? ` ${className}` : ''}`}
			style={url ? undefined : { background }}
		>
			{url ? <img src={url} alt="" loading="lazy" /> : null}
		</div>
	);
}
