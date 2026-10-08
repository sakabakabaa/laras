import { useCallback, useEffect, useState } from 'react';
import pb from '@/lib/pocketbase-client';
import type { ClassSession } from '@/lib/learning';

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';

export type AttendanceRecord = {
	id: string;
	session: string;
	roster: string;
	section?: string;
	owner: string;
	student?: string;
	status: AttendanceStatus;
	note?: string;
	created: string;
	updated: string;
};

export type AttendanceMap = Map<string, AttendanceRecord>;

/**
 * Loads all attendance records for one class meeting (session). Lecturer-only
 * in practice — the listRule allows the course owner. Returns a map keyed by
 * roster entry id for quick lookup while marking.
 */
export function useSessionAttendance(sessionId: string | undefined) {
	const [map, setMap] = useState<AttendanceMap>(new Map());
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	const load = useCallback(async () => {
		if (!sessionId) {
			setMap(new Map());
			return;
		}
		setLoading(true);
		setError('');
		try {
			const rows = await pb.collection('attendance').getFullList<AttendanceRecord>({
				filter: pb.filter('session = {:id}', { id: sessionId }),
			});
			const next = new Map<string, AttendanceRecord>();
			for (const row of rows) next.set(row.roster, row);
			setMap(next);
		} catch (err) {
			setError(String((err as { message?: string })?.message ?? err));
		} finally {
			setLoading(false);
		}
	}, [sessionId]);

	useEffect(() => {
		void load();
	}, [load]);

	return { map, loading, error, reload: load };
}

/**
 * Loads the signed-in student's own attendance for one mata kuliah. The
 * listRule allows `student = @request.auth.id`; we expand the session so we can
 * scope to this course and read week/title/date.
 */
export function useMyAttendance(courseId: string | undefined) {
	const [rows, setRows] = useState<(AttendanceRecord & { expand?: { session?: ClassSession } })[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	const load = useCallback(async () => {
		const me = pb.authStore.record?.id;
		if (!me || !courseId) {
			setRows([]);
			return;
		}
		setLoading(true);
		setError('');
		try {
			const all = await pb.collection('attendance').getFullList<
				AttendanceRecord & { expand?: { session?: ClassSession } }
			>({
				filter: pb.filter('student = {:me}', { me }),
				expand: 'session',
				sort: '-created',
			});
			setRows(all.filter((r) => r.expand?.session?.course === courseId));
		} catch (err) {
			setError(String((err as { message?: string })?.message ?? err));
		} finally {
			setLoading(false);
		}
	}, [courseId]);

	useEffect(() => {
		void load();
	}, [load]);

	return { rows, loading, error, reload: load };
}
