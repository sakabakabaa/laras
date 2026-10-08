import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { LoaderCircle } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { useAuth } from '@/hooks/use-auth';
import { DifficultyInsights } from '@/components/app/difficulty-insights';
import { LecturerRecommendations } from '@/components/app/lecturer-recommendations';
import type { Assignment } from '@/lib/assignments';
import type { Course } from '@/lib/learning';

/**
 * Detailed Wawasan kesulitan page under the existing Tugas area: loads the
 * lecturer's own assignments (authorized scope) and renders the full
 * difficulty-insights breakdown — filters, charts, per-assignment summaries.
 * Students never land here; the route guard redirects them.
 */
export function TugasInsights() {
	const { user } = useAuth();
	const me = user?.id || '';
	const [assignments, setAssignments] = useState<Assignment[]>([]);
	const [courses, setCourses] = useState<Course[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		if (!me) return;
		let alive = true;
		setLoading(true);
		setError('');
		void (async () => {
			try {
				const [courseRows, assignmentRows] = await Promise.all([
					pb.collection('courses').getFullList<Course>({ sort: 'title' }),
					pb.collection('assignments').getFullList<Assignment>({
						filter: pb.filter('owner = {:id}', { id: me }),
						sort: '-created',
						expand: 'session,subCpmk',
					}),
				]);
				if (!alive) return;
				setCourses(courseRows.filter((c) => c.owner === me));
				setAssignments(assignmentRows);
			} catch {
				if (alive) setError('Wawasan kesulitan gagal dimuat. Muat ulang halaman.');
			} finally {
				if (alive) setLoading(false);
			}
		})();
		return () => {
			alive = false;
		};
	}, [me]);

	return (
		<div className="eval-page">
			<nav className="eval-crumb" aria-label="Jejak">
				<Link to="/app/tugas">Tugas</Link>
				<span>/</span>
				<em>Wawasan kesulitan</em>
			</nav>

			<header className="eval-head">
				<div>
					<h1>Wawasan kesulitan</h1>
					<div className="asg-tags">
						<span className="asg-tag">Formatif — bukan nilai resmi</span>
						{!loading && !error && (
							<span className="asg-tag">
								{assignments.length} tugas · {courses.length} mata kuliah
							</span>
						)}
					</div>
				</div>
				<div className="eval-head-actions">
					<Link to="/app/tugas" className="ld-outline-action sm">
						← Kembali ke Tugas
					</Link>
				</div>
			</header>

			<p className="eval-note">
				Rincian agregat sinyal dari riwayat Cek jawaban pada tugas Anda: area yang paling sering
				perlu ditinjau, tingkat panduan terpakai, jumlah pemeriksaan per peserta, dan ringkasan
				per tugas. Murni formatif — tidak memengaruhi nilai resmi dan tidak menampilkan nama,
				jawaban, lampiran, umpan balik, maupun teks OCR peserta.
			</p>

			{loading ? (
				<div className="ld-loading">
					<LoaderCircle size={22} className="spin" /> Memuat wawasan kesulitan...
				</div>
			) : error ? (
				<div className="ld-alert" role="alert">
					{error}
				</div>
			) : (
				<>
					<DifficultyInsights assignments={assignments} courses={courses} />
					<LecturerRecommendations assignments={assignments} courses={courses} />
				</>
			)}
		</div>
	);
}
