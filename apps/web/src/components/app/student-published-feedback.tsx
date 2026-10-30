import { useEffect, useState } from 'react';
import pb from '@/lib/pocketbase-client';
import {
	studentRecommendationText,
	type StudentRecommendation,
} from '@/lib/student-feedback';

/**
 * Student-only feedback: letter grade is rendered by the parent. This block
 * shows the lecturer's published inline recommendations, never numeric scores.
 */
export function StudentPublishedFeedback({
	submissionId,
	feedback,
}: {
	submissionId?: string;
	feedback?: string;
}) {
	const [recommendations, setRecommendations] = useState<StudentRecommendation[] | null>(null);

	useEffect(() => {
		if (!submissionId) return;
		const token = pb.authStore.token;
		if (!token) return;
		let alive = true;
		void fetch('/api/evaluation-result', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ submissionId }),
		})
			.then(async (response) => {
				if (!response.ok) return null;
				return (await response.json()) as { recommendations?: StudentRecommendation[] };
			})
			.then((data) => {
				if (alive && data?.recommendations) setRecommendations(data.recommendations);
			})
			.catch(() => {
				/* fall back to the stored feedback text */
			});
		return () => {
			alive = false;
		};
	}, [submissionId]);

	const stored = studentRecommendationText(feedback || '');
	const items = recommendations ?? [];

	return (
		<div className="sas-result-feedback">
			<small>Umpan balik dosen</small>
			{items.length > 0 ? (
				<ul className="sas-result-recs">
					{items.map((item, index) => (
						<li key={`${item.note}-${index}`} className={item.severity}>
							<em>{item.severity === 'major' ? 'Perlu diperbaiki' : 'Saran'}</em>
							<p>{item.note}</p>
							{item.quote ? <blockquote>“{item.quote}”</blockquote> : null}
						</li>
					))}
				</ul>
			) : stored ? (
				<p>{stored}</p>
			) : (
				<p className="sas-result-pending">Dosen belum menuliskan catatan perbaikan.</p>
			)}
		</div>
	);
}
