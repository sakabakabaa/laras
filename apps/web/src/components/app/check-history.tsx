import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import type { Assignment } from '@/lib/assignments';

export type CheckAttemptRow = {
	id: string;
	assignment: string;
	submission: string;
	owner: string;
	channel: string;
	attempt: number;
	participantName: string;
	identityKey: string;
	responseSnapshot: unknown;
	feedback: string;
	area: string;
	evidence: string;
	focus: string;
	created: string;
};

/**
 * Lecturer-facing history of one participant's formative "Cek jawaban"
 * attempts (numbered checks with AI recommendations, evidence, and focus).
 * Formative only — the official grade stays in the grade panel.
 */
export function CheckHistory({
	assignmentId,
	identityKey,
	title = 'Riwayat Cek jawaban',
}: {
	assignmentId: string;
	identityKey: string;
	title?: string;
}) {
	const [rows, setRows] = useState<CheckAttemptRow[]>([]);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		let alive = true;
		void pb
			.collection('check_attempts')
			.getFullList<CheckAttemptRow>({
				filter: `assignment="${assignmentId}" && identityKey="${identityKey}"`,
				sort: 'created',
			})
			.then((list) => {
				if (alive) setRows(list);
			})
			.catch(() => {
				if (alive) setRows([]);
			})
			.finally(() => {
				if (alive) setLoaded(true);
			});
		return () => {
			alive = false;
		};
	}, [assignmentId, identityKey]);

	if (loaded && rows.length === 0) return null;

	return (
		<div className="tsr-block">
			<div className="tsr-block-head">
				<h4>
					<ClipboardCheck size={13} /> {title}
					{rows.length > 0 && ` (${rows.length})`}
				</h4>
				<span className="asg-tag">Formatif — bukan nilai resmi</span>
			</div>
			{!loaded ? (
				<p className="tsr-note">Memuat riwayat pemeriksaan…</p>
			) : (
				<ol className="tsr-fb-list">
					{rows.map((row) => (
						<li key={row.id} className="tsr-fb-item">
							<div className="tsr-fb-head">
								<strong>Pemeriksaan {row.attempt}</strong>
								<span className="tsr-fb-chips">
									{row.area && <span className="asg-tag">{row.area}</span>}
									{row.channel === 'public' && <span className="asg-tag">Peserta publik</span>}
								</span>
							</div>
							{row.focus && <p className="tsr-fb-evidence">Fokus mahasiswa: {row.focus}</p>}
							<p className="tsr-text">{row.feedback}</p>
							{row.evidence && <p className="tsr-fb-evidence">Rujukan pada jawaban: {row.evidence}</p>}
						</li>
					))}
				</ol>
			)}
		</div>
	);
}
