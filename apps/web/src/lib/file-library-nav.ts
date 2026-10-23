/**
 * Pure navigation helpers for the file library.
 *
 * Kept free of React and PocketBase so the tab predicates, the server filter
 * string and the grouping can be unit-tested. The component only renders what
 * these return.
 */
import type { FileLibraryRecord } from '@/lib/learning';

export type LibraryTab = 'all' | 'action' | 'unlinked' | 'duplicates' | 'recent';

export type LibraryFilters = {
	tab: LibraryTab;
	search: string;
	courseId: string;
	kind: string;
	access: string;
	status: string;
	ownerId: string;
};

export const LIBRARY_TABS: { id: LibraryTab; label: string }[] = [
	{ id: 'all', label: 'Semua berkas' },
	{ id: 'action', label: 'Perlu tindakan' },
	{ id: 'unlinked', label: 'Belum ditautkan' },
	{ id: 'duplicates', label: 'Duplikat & versi' },
	{ id: 'recent', label: 'Terbaru' },
];

const DAY = 24 * 60 * 60 * 1000;

/** A file needs action when parsing failed or produced no usable text. */
export const needsAction = (record: FileLibraryRecord): boolean =>
	record.parseStatus === 'failed' ||
	(record.parseStatus === 'review' && !(record.parsedChars ?? 0));

/** No academic context attached — the file cannot be found from a course page. */
export const isUnlinked = (record: FileLibraryRecord): boolean =>
	(record.course?.length ?? 0) === 0 &&
	(record.session?.length ?? 0) === 0 &&
	(record.cpmk?.length ?? 0) === 0 &&
	(record.subCpmk?.length ?? 0) === 0;

/** Uploaded within the last `days` days. */
export const isRecent = (record: FileLibraryRecord, now = Date.now(), days = 7): boolean => {
	const created = Date.parse(record.created || '');
	return Number.isFinite(created) && now - created <= days * DAY;
};

/** Rows that share a content hash (same bytes uploaded twice) or a version family. */
export const duplicateKeys = (records: FileLibraryRecord[]): Set<string> => {
	const byHash = new Map<string, number>();
	for (const record of records) {
		const hash = (record.contentHash || '').trim();
		if (!hash) continue;
		byHash.set(hash, (byHash.get(hash) ?? 0) + 1);
	}
	return new Set([...byHash.entries()].filter(([, count]) => count > 1).map(([hash]) => hash));
};

export const matchesTab = (
	record: FileLibraryRecord,
	tab: LibraryTab,
	duplicates: Set<string>,
	now = Date.now(),
): boolean => {
	if (tab === 'action') return needsAction(record);
	if (tab === 'unlinked') return isUnlinked(record);
	if (tab === 'duplicates') return Boolean(record.contentHash) && duplicates.has(record.contentHash || '');
	if (tab === 'recent') return isRecent(record, now);
	return true;
};

/** Escapes a value for a PocketBase filter string. */
const quote = (value: string): string => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * Builds the PocketBase filter for the server-side list.
 *
 * `duplicates` and `recent` cannot be expressed server-side without a hash
 * sub-query / date arithmetic, so they are returned as `all` here and narrowed
 * in the browser by {@link matchesTab}.
 */
export const buildFilter = (filters: LibraryFilters): string => {
	const parts: string[] = [];
	if (filters.ownerId) parts.push(`owner=${quote(filters.ownerId)}`);
	if (filters.courseId && filters.courseId !== 'all') parts.push(`course~${quote(filters.courseId)}`);
	if (filters.kind && filters.kind !== 'all') parts.push(`kind=${quote(filters.kind)}`);
	if (filters.access && filters.access !== 'all') parts.push(`access=${quote(filters.access)}`);
	if (filters.status && filters.status !== 'all') parts.push(`parseStatus=${quote(filters.status)}`);

	if (filters.tab === 'action') {
		parts.push('(parseStatus="failed" || (parseStatus="review" && parsedChars=0))');
	}
	if (filters.tab === 'unlinked') {
		// Multi-relation fields are JSON arrays; `=""` never matches them, the
		// length modifier does.
		parts.push('course:length=0 && session:length=0 && cpmk:length=0 && subCpmk:length=0');
	}

	const search = filters.search.trim();
	if (search) {
		const like = quote(search);
		parts.push(`(title~${like} || file~${like})`);
	}
	return parts.join(' && ');
};

export type SortKey = 'newest' | 'oldest' | 'title' | 'largest';

export const SORT_FIELD: Record<SortKey, string> = {
	newest: '-created',
	oldest: 'created',
	title: 'title',
	largest: '-size',
};

export type FileGroup = { key: string; label: string; files: FileLibraryRecord[] };

/**
 * Groups files by course, then by meeting inside each course. Files with no
 * course land in a final "Tanpa mata kuliah" group so they stay visible.
 */
export const groupByCourse = (
	records: FileLibraryRecord[],
	courseLabels: Map<string, string>,
	sessionLabels: Map<string, string>,
): FileGroup[] => {
	const courses = new Map<string, { label: string; files: FileLibraryRecord[] }>();
	for (const record of records) {
		const key = record.course?.[0] || '__none__';
		if (!courses.has(key)) {
			courses.set(key, {
				label: key === '__none__' ? 'Tanpa mata kuliah' : courseLabels.get(key) || 'Mata kuliah',
				files: [],
			});
		}
		courses.get(key)!.files.push(record);
	}

	return [...courses.entries()]
		.sort(([a], [b]) => (a === '__none__' ? 1 : b === '__none__' ? -1 : courses.get(a)!.label.localeCompare(courses.get(b)!.label)))
		.map(([key, group]) => {
			const bySession = new Map<string, FileLibraryRecord[]>();
			for (const file of group.files) {
				const sessionKey = file.session?.[0] || '';
				if (!bySession.has(sessionKey)) bySession.set(sessionKey, []);
				bySession.get(sessionKey)!.push(file);
			}
			const ordered = [...bySession.entries()].sort(([a], [b]) => {
				if (!a) return 1;
				if (!b) return -1;
				return (sessionLabels.get(a) || a).localeCompare(sessionLabels.get(b) || b);
			});
			return {
				key,
				label: group.label,
				files: ordered.flatMap(([, files]) => files),
			};
		});
};
