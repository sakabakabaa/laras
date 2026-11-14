import { useEffect, useState } from 'react';
import pb from '@/lib/pocketbase-client';
import type { Assignment } from '@/lib/assignments';

export type DifficultyAttempt = {
	id: string;
	assignment: string;
	channel: string;
	attempt: number;
	level?: number;
	area: string;
	identityKey: string;
	created: string;
};

type SubRow = { id: string; assignment: string; owner: string; status: string };

/**
 * Loads the lecturer's formative Cek jawaban aggregate: check attempts scoped
 * to the given (already authorized) assignments, plus the submission status
 * per participant identity. Formative signals only — no grades or verdicts
 * are derived here, and nothing exposes names, answers, or OCR text.
 */
export function useDifficultyData(assignments: Assignment[]) {
	const [attempts, setAttempts] = useState<DifficultyAttempt[] | null>(null);
	const [statusByKey, setStatusByKey] = useState<Map<string, string>>(new Map());
	const [error, setError] = useState('');

	useEffect(() => {
		if (!assignments.length) {
			setAttempts([]);
			setStatusByKey(new Map());
			return;
		}
		let alive = true;
		setError('');
		setAttempts(null);
		void (async () => {
			try {
				const [attemptRows, subRows] = await Promise.all([
					pb.collection('check_attempts').getFullList<DifficultyAttempt>({
						fields: 'id,assignment,channel,attempt,level,area,identityKey,created',
						sort: 'created',
					}),
					pb.collection('assignment_submissions').getFullList<SubRow>({
						fields: 'id,assignment,owner,status',
					}),
				]);
				if (!alive) return;
				const ids = new Set(assignments.map((a) => a.id));
				// Only signed-in students' checks count (identity keys `u:<userId>`).
				setAttempts(attemptRows.filter((a) => ids.has(a.assignment) && a.identityKey.startsWith('u:')));
				const map = new Map<string, string>();
				for (const s of subRows) map.set(`u:${s.owner}`, s.status || 'draft');
				setStatusByKey(map);
			} catch {
				if (alive) {
					setAttempts([]);
					setError('Wawasan kesulitan gagal dimuat. Coba muat ulang halaman.');
				}
			}
		})();
		return () => {
			alive = false;
		};
	}, [assignments]);

	return { attempts, statusByKey, error };
}
