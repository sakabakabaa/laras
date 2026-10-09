import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, BookOpenCheck, CalendarCheck, ChartNoAxesColumnIncreasing, CircleAlert, GraduationCap, LoaderCircle, UserRound } from 'lucide-react';
import { useCourseByRoute } from '@/hooks/use-course-route';
import { useAuth } from '@/hooks/use-auth';
import pb from '@/lib/pocketbase-client';
import { errorMessage, dateLabel } from '@/lib/learning';
import type { StudentProgress } from '@/lib/student-progress';

type Detail = {
	profile: { name: string; nim: string; linked: boolean; learner?: null | { goals: string; currentGoal: string; priorExperience: string; confidence: string; explanationLanguage: string; supportPreference: string; updated: string } };
	attendance: null | { present: number; late: number; absent: number; excused: number; total: number; presentRate: number | null };
	academic: null | { assignmentCount: number; submittedCount: number; gradedCount: number; averageGrade: number | null; recent: { title: string; status: string; grade: number | null; feedback: string; updated: string }[] };
	learning: StudentProgress | null;
};

const confidenceLabel: Record<string, string> = { low: 'Masih membangun dasar', medium: 'Cukup percaya diri', high: 'Percaya diri' };
const languageLabel: Record<string, string> = { id: 'Bahasa Indonesia', en: 'English', de: 'Deutsch' };
const supportLabel: Record<string, string> = { examples: 'Contoh konkret', steps: 'Langkah demi langkah', concise: 'Penjelasan ringkas' };
const skillLabel: Record<string, string> = { building: 'Data masih terbatas', focus: 'Perlu perhatian', steady: 'Konsisten', improving: 'Meningkat' };

export default function StudentProfileRoute() {
	const { courseId = '', rosterId = '' } = useParams();
	const { user } = useAuth();
	const isFaculty = (user as { role?: string } | null)?.role === 'faculty';
	const courseQuery = useCourseByRoute(courseId);
	const course = courseQuery.data;
	const [detail, setDetail] = useState<Detail | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	useEffect(() => {
		if (!course?.id) return;
		let active = true;
		setLoading(true);
		setError('');
		fetch('/api/student-profile', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pb.authStore.token}` },
			body: JSON.stringify({ mode: 'lecturer', courseId: course.id, rosterId }),
		})
			.then(async (response) => {
				const data = await response.json().catch(() => null) as Detail | { error?: string } | null;
				if (!response.ok) throw new Error(data && 'error' in data ? data.error || 'Profil mahasiswa gagal dimuat.' : 'Profil mahasiswa gagal dimuat.');
				if (active) setDetail(data as Detail);
			})
			.catch((err) => { if (active) setError(errorMessage(err)); })
			.finally(() => { if (active) setLoading(false); });
		return () => { active = false; };
	}, [course?.id, rosterId]);

	if (!isFaculty) return <section className="ld-panel sp-denied">Halaman ini hanya dapat dibuka dosen.</section>;
	if (loading || courseQuery.loading) return <section className="ld-panel sp-loading"><LoaderCircle className="spin" size={19} /> Memuat profil mahasiswa…</section>;
	if (error || !detail) return <section className="ld-panel sp-error"><CircleAlert size={18} /> {error || 'Profil mahasiswa tidak tersedia.'}</section>;

	const back = `/app/courses/${courseId}/mahasiswa`;
	const { profile, attendance, academic, learning } = detail;
	return (
		<div className="sp-page">
			<Link className="sp-back" to={back}><ArrowLeft size={16} /> Kembali ke daftar mahasiswa</Link>
			<header className="sp-header ld-panel">
				<div className="sp-avatar"><UserRound size={23} /></div>
				<div className="sp-header-main">
					<span className="ld-eyebrow">PROFIL MAHASISWA · {course?.code || course?.title}</span>
					<h1>{profile.name}</h1>
					<p>NIM {profile.nim}{!profile.linked && ' · Akun mahasiswa belum terhubung'}</p>
				</div>
			</header>
			{!profile.linked ? <section className="ld-panel sp-empty"><CircleAlert size={20} /><div><strong>Belum ada akun mahasiswa</strong><p>Data aktivitas akan muncul setelah akun mahasiswa diaktifkan dan terdaftar di mata kuliah ini.</p></div></section> : <>
				<div className="sp-metrics">
					<Metric icon={<CalendarCheck size={18} />} label="Kehadiran tercatat" value={attendance?.total ? `${attendance.presentRate}%` : '—'} detail={attendance?.total ? `${attendance.present + attendance.late} dari ${attendance.total} pertemuan` : 'Belum ada data'} />
					<Metric icon={<BookOpenCheck size={18} />} label="Tugas terkumpul" value={`${academic?.submittedCount ?? 0}/${academic?.assignmentCount ?? 0}`} detail={`${academic?.gradedCount ?? 0} sudah dinilai`} />
					<Metric icon={<GraduationCap size={18} />} label="Rerata nilai" value={academic?.averageGrade == null ? '—' : `${academic.averageGrade}`} detail="Dari tugas formal yang dinilai" />
					<Metric icon={<ChartNoAxesColumnIncreasing size={18} />} label="Jawaban latihan" value={`${learning?.practiceAnswers ?? 0}`} detail={`${learning?.scoredTasks ?? 0} tugas formal dinilai`} />
				</div>
				<div className="sp-grid">
					<section className="ld-panel sp-panel">
						<div className="sp-title"><div><span className="ld-eyebrow">AKTIVITAS KELAS</span><h2>Kehadiran</h2></div></div>
						{attendance?.total ? <><div className="sp-attendance-track"><span style={{ width: `${attendance.presentRate ?? 0}%` }} /></div><div className="sp-attendance-legend"><span><i className="present" />Hadir {attendance.present}</span><span><i className="late" />Terlambat {attendance.late}</span><span><i className="absent" />Absen {attendance.absent}</span><span><i className="excused" />Izin {attendance.excused}</span></div></> : <p className="sp-muted">Belum ada catatan kehadiran untuk mahasiswa ini.</p>}
					</section>
					<section className="ld-panel sp-panel">
						<div className="sp-title"><div><span className="ld-eyebrow">LATIHAN & CAPAIAN</span><h2>Kemajuan belajar</h2></div></div>
						{learning?.skills.length ? <div className="sp-skills">{learning.skills.map((skill) => <div className="sp-skill" key={skill.id}><div><strong>{skill.label}</strong><span>{skillLabel[skill.status] || skill.status}</span></div><div className="sp-skill-track"><i style={{ width: `${Math.round((skill.recentCorrect / Math.max(skill.recentTotal, 1)) * 100)}%` }} /></div><small>{skill.recentCorrect}/{skill.recentTotal} benar pada jawaban terbaru · {skill.total} jawaban</small></div>)}</div> : <p className="sp-muted">Belum cukup data latihan untuk menunjukkan pola keterampilan.</p>}
						<div className="sp-outcomes"><strong>Progres Sub-CPMK dari latihan</strong>{learning?.outcomes.length ? <>{learning.outcomes.map((outcome) => { const followup = learning.miniLessons.byOutcome.find(item => item.id === outcome.id); return <div key={outcome.id}><span><b>{outcome.code || 'Sub-CPMK'}</b> · {outcome.description}</span><small>{outcome.recentCorrect}/{outcome.recentTotal} benar terbaru · {outcome.total} jawaban · {skillLabel[outcome.status] || outcome.status}{followup?.checks ? ` · cek pelajaran ${followup.correct}/${followup.checks} tepat` : ''}</small></div>; })}<p className="sp-muted">Petunjuk dari latihan terkait, bukan nilai atau sertifikasi penguasaan.</p></> : <p className="sp-outcome-empty">Belum ada jawaban latihan yang terhubung ke Sub-CPMK. Progres akan muncul saat mahasiswa mengerjakan latihan dari materi atau sesi yang tertaut.</p>}</div>
						{learning?.miniLessons.opened ? <p className="sp-muted">Pelajaran singkat dibuka {learning.miniLessons.opened} kali; cek pemahaman {learning.miniLessons.correct}/{learning.miniLessons.checks} tepat.</p> : <p className="sp-muted sp-followup-empty">Belum ada pelajaran singkat yang dibuka dari umpan balik latihan.</p>}
						{learning?.confirmed.length ? <div className="sp-confirmed"><strong>Pola yang sudah dikonfirmasi</strong><p>{learning.confirmed.map((item) => `${item.label} (${item.count})`).join(' · ')}</p></div> : null}
					</section>
				</div>
				<section className="ld-panel sp-panel">
					<div className="sp-title"><div><span className="ld-eyebrow">PENILAIAN</span><h2>Tugas terbaru</h2></div></div>
						{academic?.recent.length ? <div className="sp-task-list">{academic.recent.map((item, index) => <article className="sp-task" key={`${item.title}-${index}`}><div><strong>{item.title}</strong><small>{dateLabel(item.updated)} · {item.status === 'graded' ? 'Dinilai' : item.status === 'submitted' ? 'Terkumpul' : item.status === 'late' ? 'Terlambat' : item.status === 'revision' ? 'Perlu revisi' : item.status}</small>{item.feedback && <p>{item.feedback}</p>}</div><b>{item.status !== 'graded' || item.grade == null ? '—' : `${item.grade}`}</b></article>)}</div> : <p className="sp-muted">Belum ada pengumpulan tugas formal.</p>}
				</section>
				<section className="ld-panel sp-panel">
					<div className="sp-title"><div><span className="ld-eyebrow">DARI MAHASISWA</span><h2>Tujuan dan preferensi belajar</h2></div><span className="sp-consent">Dibagikan oleh mahasiswa</span></div>
					{profile.learner ? <div className="sp-learner-grid"><LearnerValue label="Tujuan belajar" value={profile.learner.goals} /><LearnerValue label="Fokus belajar saat ini" value={profile.learner.currentGoal} /><LearnerValue label="Pengalaman sebelumnya" value={profile.learner.priorExperience} /><LearnerValue label="Kepercayaan diri" value={confidenceLabel[profile.learner.confidence] || ''} /><LearnerValue label="Bahasa penjelasan" value={languageLabel[profile.learner.explanationLanguage] || ''} /><LearnerValue label="Gaya bantuan" value={supportLabel[profile.learner.supportPreference] || ''} /><small>Preferensi mahasiswa · diperbarui {dateLabel(profile.learner.updated)}</small></div> : <p className="sp-muted">Mahasiswa belum memilih untuk membagikan preferensi belajar kepada dosen.</p>}
				</section>
				<p className="sp-footnote">Ringkasan ini memakai catatan kehadiran, pengumpulan, nilai, dan jawaban latihan. Pola keterampilan berasal dari jawaban tercatat; data kosong tidak dianggap nilai nol.</p>
			</>}
		</div>
	);
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
	return <section className="ld-panel sp-metric"><div className="sp-metric-icon">{icon}</div><span>{label}</span><strong>{value}</strong><small>{detail}</small></section>;
}
function LearnerValue({ label, value }: { label: string; value: string }) {
	return value ? <div className="sp-learner-value"><small>{label}</small><p>{value}</p></div> : null;
}
