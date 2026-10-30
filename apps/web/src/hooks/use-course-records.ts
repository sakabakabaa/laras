import { useMemo } from 'react';
import { useCachedQuery } from '@/hooks/use-cached-query';
import pb from '@/lib/pocketbase-client';
import type { StructuredItem, Cpmk, SubCpmk, Assessment } from '@/lib/learning';

export type CourseRecords = {
	cpl: StructuredItem[];
	cpmk: Cpmk[];
	subCpmk: SubCpmk[];
	topics: StructuredItem[];
	assessments: Assessment[];
	loading: boolean;
	error: string;
	reload: () => void;
};

/**
 * Loads all structured RPS records (CPL, CPMK, Sub-CPMK, topics, assessments)
 * for one course, sorted by their `order` field. Read access is open to every
 * signed-in user, so this works for both faculty owners and enrolled students.
 *
 * Every collection read goes through the local cache, so navigating between
 * course tabs/pages reuses the previous result (TTL + stale-while-revalidate)
 * instead of re-querying PocketBase on every render.
 */
export function useCourseRecords(courseId: string | undefined): CourseRecords {
	const key = courseId ? `course = ${courseId}` : null;
	const filter = useMemo(
		() => (courseId ? pb.filter('course = {:id}', { id: courseId }) : ''),
		[courseId],
	);

	const cpl = useCachedQuery<StructuredItem[]>(
		key && courseId ? `cpl:course=${courseId}` : null,
		() => pb.collection('cpl').getFullList<StructuredItem>({ filter, sort: 'order,created' }),
	);
	const cpmk = useCachedQuery<Cpmk[]>(
		key && courseId ? `cpmk:course=${courseId}` : null,
		() => pb.collection('cpmk').getFullList<Cpmk>({ filter, sort: 'order,created' }),
	);
	const subCpmk = useCachedQuery<SubCpmk[]>(
		key && courseId ? `sub_cpmk:course=${courseId}` : null,
		() => pb.collection('sub_cpmk').getFullList<SubCpmk>({ filter, sort: 'order,created' }),
	);
	const topics = useCachedQuery<StructuredItem[]>(
		key && courseId ? `topics:course=${courseId}` : null,
		() => pb.collection('topics').getFullList<StructuredItem>({ filter, sort: 'order,created' }),
	);
	const assessments = useCachedQuery<Assessment[]>(
		key && courseId ? `assessments:course=${courseId}` : null,
		() => pb.collection('assessments').getFullList<Assessment>({ filter, sort: 'order,created' }),
	);

	return useMemo(
		() => ({
			cpl: cpl.data ?? [],
			cpmk: cpmk.data ?? [],
			subCpmk: subCpmk.data ?? [],
			topics: topics.data ?? [],
			assessments: assessments.data ?? [],
			loading: cpl.loading || cpmk.loading || subCpmk.loading || topics.loading || assessments.loading,
			error: cpl.error || cpmk.error || subCpmk.error || topics.error || assessments.error,
			reload: () => {
				cpl.reload();
				cpmk.reload();
				subCpmk.reload();
				topics.reload();
				assessments.reload();
			},
		}),
		[cpl, cpmk, subCpmk, topics, assessments],
	);
}
