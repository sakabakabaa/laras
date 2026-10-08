import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, BookOpen, CalendarClock, CheckCircle2, Eye, FileText, GraduationCap, Info, ListChecks, Lock, MessageCircle, Mic, PencilLine, Sparkles, Users, LoaderCircle } from 'lucide-react';
import { AppShell } from '@/components/app/app-shell';
import pb from '@/lib/pocketbase-client';
import { errorMessage, type Course, type CourseResource } from '@/lib/learning';
import { ACTIVITY_TYPE_LABEL, activityTypeOf, deadlineLabel, MODE_LABEL, SHAPE_LABEL, type Assignment } from '@/lib/assignments';
import { LISTENING_TYPE_LABEL, parseListeningConfig, parseQuizConfig, parseReadingConfig, parseSpeakingConfig, parseWritingConfig, taskKindForShape, TASK_KIND_LABEL, type ListeningConfig, type QuizConfig, type ReadingConfig, type SpeakingConfig, type WritingConfig } from '@/lib/task-types';
import { parseStructuredContentFromConfig, structuredChecklist } from '@/lib/structured-assignment';
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
type Tab = 'workspace' | 'result';

/**
 * Lecturer-only, fully read-only preview of what a student sees for an
 * assignment: the working workspace (instructions, materials, task-specific
 * content, answer format) and the post-submission result page (status, grade,
 * feedback, recommendations). Previewing never loads, creates, or writes a
 * submission — it only reads the assignment record and renders its
 * student-facing content. No grade, status, or student record is touched.
 */
export function LecturerAssignmentPreview({
  assignmentId
}: {
  assignmentId: string;
}) {
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('workspace');
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const rec = await pb.collection('assignments').getOne<Assignment>(assignmentId, {
          expand: 'session,subCpmk,attachments,parentAssignment,course'
        });
        if (!alive) return;
        setAssignment(rec);
        const c = (rec.expand as {
          course?: Course;
        } | undefined)?.course;
        if (c) setCourse(c);
      } catch (err) {
        if (alive) setError(errorMessage(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [assignmentId]);
  if (loading) {
    return <AppShell title="Pratinjau mahasiswa" eyebrow="Tugas" variant="saas" hideHeading>
				<div className="ld-loading">
					<LoaderCircle size={24} className="spin" /> Memuat pratinjau...
				</div>
			</AppShell>;
  }
  if (error || !assignment) {
    return <AppShell title="Pratinjau mahasiswa" eyebrow="Tugas" variant="saas" hideHeading>
				<div className="ld-alert" role="alert">
					{error || 'Tugas tidak ditemukan.'}{' '}
					<button type="button" onClick={() => navigate(`/app/tugas/${assignmentId}`)}>
						Kembali ke penilaian
					</button>
				</div>
			</AppShell>;
  }
  const formative = activityTypeOf(assignment) === 'formative';
  const backHref = `/app/tugas/${assignment.id}`;
  return <AppShell title="Pratinjau mahasiswa" eyebrow="Tugas" variant="saas" hideHeading>
			<div className="lap-wrap">
				<Link to={backHref} className="ld-back">
					<ArrowLeft size={15} /> Kembali ke penilaian
				</Link>

				<div className="lap-head">
					<div>
						<span className="ld-eyebrow">Pratinjau tampilan mahasiswa</span>
						<h1>{assignment.title}</h1>
						<p className="lap-sub"></p>
					</div>
					<div className="lap-head-tags">
						{course?.code && <span className="asg-tag">{course.code}</span>}
						{assignment.expand?.session?.week && <span className="asg-tag">Minggu {assignment.expand.session.week}</span>}
						{assignment.shape && <span className="asg-tag">{SHAPE_LABEL[assignment.shape]}</span>}
						<span className="asg-tag">{MODE_LABEL[assignment.mode]}</span>
						<span className={`asg-tag ${formative ? 'formative' : ''}`}>
							{ACTIVITY_TYPE_LABEL[formative ? 'formative' : 'formal']}
						</span>
					</div>
				</div>

				<div className="lap-banner" role="status">
					<Eye size={15} />
					<span>
						Mode pratinjau dosen. Konten di bawah meniru tampilan mahasiswa secara hanya-baca.
					</span>
				</div>

				<div className="lap-tabs" role="tablist" aria-label="Pratinjau">
					<button type="button" role="tab" aria-selected={tab === 'workspace'} className={tab === 'workspace' ? 'active' : ''} onClick={() => setTab('workspace')}>
						<PencilLine size={15} /> Lembar kerja mahasiswa
					</button>
					<button type="button" role="tab" aria-selected={tab === 'result'} className={tab === 'result' ? 'active' : ''} onClick={() => setTab('result')}>
						<GraduationCap size={15} /> Halaman hasil
					</button>
				</div>

				{tab === 'workspace' ? <WorkspacePreview assignment={assignment} course={course} /> : <ResultPreview assignment={assignment} course={course} />}
			</div>
		</AppShell>;
}

// ── Workspace preview ────────────────────────────────────────

function WorkspacePreview({
  assignment,
  course
}: {
  assignment: Assignment;
  course: Course | null;
}) {
  const formative = activityTypeOf(assignment) === 'formative';
  const kind = taskKindForShape(assignment.shape);
  const week = assignment.expand?.session?.week;
  const courseLabel = course?.title || course?.code || 'Mata kuliah';
  const materials: CourseResource[] = assignment.expand?.attachments || [];
  return <section className="lap-workspace" aria-label="Pratinjau lembar kerja mahasiswa">
			<div className="lap-ws-badges">
				<span className="asg-tag">{courseLabel}</span>
				{week ? <span className="asg-tag">Minggu {week}</span> : null}
				<span className={`asg-tag ${formative ? 'formative' : ''}`}>
					{ACTIVITY_TYPE_LABEL[formative ? 'formative' : 'formal']}
				</span>
				{assignment.shape && <span className="asg-tag">{SHAPE_LABEL[assignment.shape]}</span>}
				<span className="asg-tag">{MODE_LABEL[assignment.mode]}</span>
				<span className="asg-tag">Batas {deadlineLabel(assignment.deadline)}</span>
			</div>

			<div className="lap-card">
				<h2>{assignment.title}</h2>
				{assignment.instructions?.trim() && <div className="lap-block">
						<h3>
							<FileText size={15} /> Instruksi
						</h3>
						<p className="lap-text">{assignment.instructions}</p>
					</div>}
				{assignment.requirements?.trim() && <div className="lap-block">
						<h3>
							<ListChecks size={15} /> Ketentuan &amp; rubrik
						</h3>
						<p className="lap-text">{assignment.requirements}</p>
					</div>}
				{assignment.groupInfo?.trim() && <div className="lap-block">
						<h3>
							<Users size={15} /> Ketentuan kelompok
						</h3>
						<p className="lap-text">{assignment.groupInfo}</p>
					</div>}
			</div>

			{materials.length > 0 && <div className="lap-card">
					<h3>
						<BookOpen size={15} /> Materi pendukung
					</h3>
					<ul className="lap-materials">
						{materials.map(file => <li key={file.id}>
								<FileText size={14} />
								<span>{file.title || file.file || 'Materi'}</span>
							</li>)}
					</ul>
				</div>}

			{kind && <div className="lap-card">
					<h3>
						<Sparkles size={15} /> Konfigurasi {TASK_KIND_LABEL[kind]}
					</h3>
					{kind === 'writing' && <WritingPreview assignment={assignment} />}
					{kind === 'quiz' && <QuizPreview assignment={assignment} />}
					{kind === 'listening' && <ListeningPreview assignment={assignment} />}
					{kind === 'reading' && <ReadingPreview assignment={assignment} />}
					{kind === 'speaking' && <SpeakingPreview assignment={assignment} />}
				</div>}

			<div className="lap-card lap-answer-format">
				<h3>
					<PencilLine size={15} /> Format jawaban mahasiswa
				</h3>
				<AnswerFormatNote assignment={assignment} kind={kind} formative={formative} />
			</div>

			<div className="lap-note">
				<Lock size={14} />
				<span>
					Pratinjau hanya-tampilan. Tombol Simpan draf, Cek jawaban, dan Kumpulkan tidak aktif
					di pratinjau ini — tidak ada pengumpulan yang dibuat.
				</span>
			</div>
		</section>;
}
function AnswerFormatNote({
  assignment,
  kind,
  formative
}: {
  assignment: Assignment;
  kind: ReturnType<typeof taskKindForShape>;
  formative: boolean;
}) {
  let text: string;
  if (kind === 'speaking') {
    text = 'Mahasiswa merekam audio/video atau menempelkan tautan unjuk bicara.';
  } else if (kind === 'quiz') {
    text = 'Mahasiswa memilih satu jawaban per soal, lalu mengumpulkan.';
  } else if (kind === 'listening') {
    text = 'Mahasiswa menyimak materi, lalu menjawab pertanyaan sesuai jenis (pilihan ganda, jawaban singkat, mencocokkan, transkripsi).';
  } else if (kind === 'reading') {
    text = 'Mahasiswa membaca teks, lalu menjawab soal pilihan ganda.';
  } else if (kind === 'writing') {
    text = '';
  } else if (formative) {
    text = 'Mahasiswa mengerjakan latihan formatif berulang dengan Cek jawaban.';
  } else {
    text = 'Mahasiswa menulis jawaban teks, menempel tautan, atau mengunggah berkas.';
  }
  return <div className="lap-format">
			{text && <p>{text}</p>}
			{!formative && <p className="lap-format-meta">
					<CalendarClock size={13} /> Batas waktu: {deadlineLabel(assignment.deadline)}
				</p>}
		</div>;
}

// ── Per-kind content previews (read-only, no answer keys) ───

function WritingPreview({
  assignment
}: {
  assignment: Assignment;
}) {
  const config = useMemo<WritingConfig>(() => parseWritingConfig(assignment.taskConfig), [assignment]);
  const structured = useMemo(() => parseStructuredContentFromConfig(assignment.taskConfig), [assignment]);
  const multi = config.questions.length > 0;
  return <div className="lap-kind">
			{structured && <StructuredContentPreview structured={structured} />}
			{config.prompt && <div className="lap-block">
					<small>PROMPT</small>
					<p className="lap-text">{config.prompt}</p>
				</div>}
			{config.formatGuidance && <div className="lap-block">
					<small>PANDUAN FORMAT</small>
					<p className="lap-text">{config.formatGuidance}</p>
				</div>}
			<div className="lap-meta-row">
				{config.language && <span className="asg-tag">Bahasa: {config.language}</span>}
				{config.minWords > 0 && <span className="asg-tag">Minimal {config.minWords} kata</span>}
				{config.maxWords > 0 && <span className="asg-tag">Maksimal {config.maxWords} kata</span>}
				<span className="asg-tag">
					{config.allowText ? 'Teks' : ''}
					{config.allowDocument ? ' · Dokumen' : ''}
					{config.allowPhotos ? ' · Foto' : ''}
				</span>
			</div>
			{multi && <ol className="lap-qblocks">
					{config.questions.map((q, i) => <li key={q.id}>
							<span className="lap-qnum">{i + 1}</span>
							<div>
								<strong>{q.prompt}</strong>
								{q.guidance && <small>{q.guidance}</small>}
								{(q.minWords > 0 || q.maxWords > 0) && <em>
										{q.minWords > 0 ? `min ${q.minWords} kata` : ''}
										{q.minWords > 0 && q.maxWords > 0 ? ' · ' : ''}
										{q.maxWords > 0 ? `maks ${q.maxWords} kata` : ''}
									</em>}
							</div>
						</li>)}
				</ol>}
			{config.criteria.length > 0 && <div className="lap-block">
					<small>RUBRIK</small>
					<ul className="lap-criteria">
						{config.criteria.map(c => <li key={c.id}>
								<span>{c.label}</span>
								<em>bobot {c.weight}</em>
							</li>)}
					</ul>
				</div>}
		</div>;
}
function QuizPreview({
  assignment
}: {
  assignment: Assignment;
}) {
  const config = useMemo<QuizConfig>(() => parseQuizConfig(assignment.taskConfig), [assignment]);
  if (config.questions.length === 0) {
    return <p className="lap-empty">Belum ada soal kuis.</p>;
  }
  return <div className="lap-kind">
			<div className="lap-meta-row">
				{config.attempts > 0 && <span className="asg-tag">Maks {config.attempts} percobaan</span>}
				{config.timeLimitMin > 0 && <span className="asg-tag">Batas {config.timeLimitMin} menit</span>}
				{config.shuffleQuestions && <span className="asg-tag">Acak soal</span>}
				{config.shuffleOptions && <span className="asg-tag">Acak pilihan</span>}
			</div>
			<ol className="lap-questions">
				{config.questions.map((q, i) => <li key={q.id}>
						<div className="lap-q-head">
							<strong>Soal {i + 1}</strong>
							<em>{q.points} poin</em>
						</div>
						<p className="lap-text">{q.text}</p>
						<ul className="lap-options">
							{q.options.map((opt, oi) => <li key={oi}>
									<span className="lap-opt-letter">{LETTERS[oi]}</span>
									{opt}
								</li>)}
						</ul>
					</li>)}
			</ol>
			<p className="lap-note-inline">
				<Lock size={12} /> Kunci jawaban hanya terlihat oleh dosen — tidak ditampilkan ke mahasiswa.
			</p>
		</div>;
}
function ListeningPreview({
  assignment
}: {
  assignment: Assignment;
}) {
  const config = useMemo<ListeningConfig>(() => parseListeningConfig(assignment.taskConfig), [assignment]);
  const m = config.media;
  return <div className="lap-kind">
			{m.kind !== 'none' && <div className="lap-block">
					<small>MATERI MEDIA</small>
					<p className="lap-text">
						{m.kind === 'resource' ? 'Sumber daya mata kuliah' : 'Tautan eksternal'}
						{m.title ? ` — ${m.title}` : ''}
					</p>
				</div>}
			{config.questions.length === 0 ? <p className="lap-empty">Belum ada pertanyaan menyimak.</p> : <ol className="lap-questions">
					{config.questions.map((q, i) => <li key={q.id}>
							<div className="lap-q-head">
								<strong>Pertanyaan {i + 1}</strong>
								<em>{LISTENING_TYPE_LABEL[q.type]} · {q.points} poin</em>
							</div>
							<p className="lap-text">{q.text}</p>
							{q.type === 'mc' && <ul className="lap-options">
									{q.options.map((opt, oi) => <li key={oi}>
											<span className="lap-opt-letter">{LETTERS[oi]}</span>
											{opt}
										</li>)}
								</ul>}
							{q.type === 'matching' && q.pairs.length > 0 && <ul className="lap-pairs">
									{q.pairs.map((p, pi) => <li key={pi}>
											<span>{p.left}</span> → <span>{p.right}</span>
										</li>)}
								</ul>}
						</li>)}
				</ol>}
		</div>;
}
function ReadingPreview({
  assignment
}: {
  assignment: Assignment;
}) {
  const config = useMemo<ReadingConfig>(() => parseReadingConfig(assignment.taskConfig), [assignment]);
  return <div className="lap-kind">
			{config.passage.trim() ? <div className="lap-block">
					<small>TEKS BACAAN</small>
					<pre className="lap-passage">{config.passage}</pre>
				</div> : <p className="lap-empty">Teks bacaan belum diisi.</p>}
			{config.questions.length > 0 && <ol className="lap-questions">
					{config.questions.map((q, i) => <li key={q.id}>
							<div className="lap-q-head">
								<strong>Soal {i + 1}</strong>
								<em>{q.points} poin</em>
							</div>
							<p className="lap-text">{q.text}</p>
							<ul className="lap-options">
								{q.options.map((opt, oi) => <li key={oi}>
										<span className="lap-opt-letter">{LETTERS[oi]}</span>
										{opt}
									</li>)}
							</ul>
						</li>)}
				</ol>}
		</div>;
}
function SpeakingPreview({
  assignment
}: {
  assignment: Assignment;
}) {
  const config = useMemo<SpeakingConfig>(() => parseSpeakingConfig(assignment.taskConfig), [assignment]);
  const structured = useMemo(() => parseStructuredContentFromConfig(assignment.taskConfig), [assignment]);
  return <div className="lap-kind">
			{structured && <StructuredContentPreview structured={structured} />}
			{config.prompt && <div className="lap-block">
					<small>PROMPT</small>
					<p className="lap-text">{config.prompt}</p>
				</div>}
			<div className="lap-meta-row">
				{config.language && <span className="asg-tag">Bahasa: {config.language}</span>}
				{config.durationMin > 0 && <span className="asg-tag">Durasi {config.durationMin} menit</span>}
				<span className="asg-tag">
					{config.allowAudio ? 'Audio' : ''}
					{config.allowVideo ? ' · Video' : ''}
					{config.allowLink ? ' · Tautan' : ''}
				</span>
			</div>
			{config.criteria.length > 0 && <div className="lap-block">
					<small>RUBRIK</small>
					<ul className="lap-criteria">
						{config.criteria.map(c => <li key={c.id}>
								<span>{c.label}</span>
								<em>bobot {c.weight}</em>
							</li>)}
					</ul>
				</div>}
			<p className="lap-note-inline">
				<Mic size={12} /> Mahasiswa merekam jawaban lisan; transkrip otomatis muncul setelah diproses.
			</p>
		</div>;
}

// ── Structured content preview (shared with student worksheet) ──

/**
 * Renders the SAME structured assignment representation the Student Worksheet
 * uses — "Tugas kamu" (summary) and "Yang harus ada" (deterministic
 * checklist) — so the lecturer preview stays consistent with what students
 * see. Read-only; never re-analyzes the assignment with an AI model.
 */
function StructuredContentPreview({
  structured
}: {
  structured: NonNullable<ReturnType<typeof parseStructuredContentFromConfig>>;
}) {
  const chips = structuredChecklist(structured);
  return <div className="lap-structured">
			<div className="lap-block lap-structured-summary">
				<small>TUGAS KAMU</small>
				<p className="lap-text">{structured.summary}</p>
				{(structured.language || structured.level || structured.duration) && <div className="lap-meta-row">
						{structured.language && <span className="asg-tag">Bahasa: {structured.language}</span>}
						{structured.level && <span className="asg-tag">Level: {structured.level}</span>}
						{structured.duration ? <span className="asg-tag">Durasi {structured.duration} menit</span> : null}
					</div>}
			</div>
			{chips.length > 0 && <div className="lap-block lap-structured-check">
				<small>YANG HARUS ADA</small>
				<ul className="lap-checklist">
					{chips.map(chip => <li key={chip.id}>
							<span className="lap-check-ico" aria-hidden="true">
								<CheckCircle2 size={13} />
							</span>
							<strong>{chip.quantity ? `${chip.quantity} ` : ''}{chip.label}</strong>
						</li>)}
				</ul>
			</div>}
			{structured.sections.length > 0 && <div className="lap-block">
				<small>BAGIAN TUGAS</small>
				<ol className="lap-structured-sections">
					{structured.sections.map(section => <li key={section.id}>
							<strong>{section.title}</strong>
							{section.description && <p className="lap-text">{section.description}</p>}
							{section.requirements.length > 0 && <ul className="lap-checklist sub">
									{section.requirements.map(req => <li key={req.id}>
											<span className="lap-check-ico" aria-hidden="true">
												<CheckCircle2 size={12} />
											</span>
											<strong>{req.quantity ? `${req.quantity} ` : ''}{req.text}</strong>
										</li>)}
								</ul>}
						</li>)}
				</ol>
			</div>}
		</div>;
}

// ── Result page preview ──────────────────────────────────────

function ResultPreview({
  assignment,
  course
}: {
  assignment: Assignment;
  course: Course | null;
}) {
  const formative = activityTypeOf(assignment) === 'formative';
  const week = assignment.expand?.session?.week;
  const courseBadge = (course?.code || course?.title || 'Mata kuliah').toUpperCase();
  const formatLabel = assignment.mode === 'collaborative' ? 'Kelompok' : 'Individual';
  return <section className="lap-result" aria-label="Pratinjau halaman hasil mahasiswa">
			<header className="srs-head">
				<h1>{assignment.title}</h1>
				<div className="srs-badges">
					<span>{courseBadge}</span>
					{week ? <span>Minggu {week}</span> : null}
					<span className="blue">{formative ? 'Latihan formatif' : 'Tugas formal'}</span>
				</div>
			</header>

			<div className="srs-layout">
				<div className="srs-main">
					<div className="lap-card lap-placeholder">
						<FileText size={18} />
						<strong>Jawaban yang dikumpulkan</strong>
						<p>
							Setelah mahasiswa mengumpulkan, jawaban mereka ditampilkan di sini beserta
							penanda rekomendasi AI pada teks.
						</p>
					</div>

					<div className="lap-card lap-placeholder">
						<Sparkles size={18} />
						<strong>Rekomendasi AI</strong>
						<p>
							Umpan balik dan rekomendasi perbaikan dari AI muncul di sini setelah pengumpulan
							dinilai. Mahasiswa hanya melihat huruf nilai dan umpan balik — bukan angka rubrik.
						</p>
					</div>

					{(assignment.expand?.attachments || []).length > 0 && <div className="lap-card lap-placeholder">
							<BookOpen size={18} />
							<strong>Materi pendukung</strong>
							<p>Materi tugas ditampilkan kepada mahasiswa di halaman hasil.</p>
						</div>}
				</div>

				<aside className="srs-side">
					<article className="srs-card srs-status-card">
						<h2>Status dan informasi</h2>
						<span className="srs-status pending">
							<Info size={15} /> Menunggu penilaian
						</span>
						<dl>
							<div>
								<dt>
									<CalendarClock size={14} /> Batas pengumpulan
								</dt>
								<dd>{deadlineLabel(assignment.deadline)}</dd>
							</div>
							<div>
								<dt>
									<FileText size={14} /> Jenis tugas
								</dt>
								<dd>{formative ? 'Latihan formatif' : 'Tugas formal'}</dd>
							</div>
							<div>
								<dt>
									<BookOpen size={14} /> Format kerja
								</dt>
								<dd>{formatLabel}</dd>
							</div>
						</dl>
					</article>

					<article className="srs-card srs-grade">
						<h2>Hasil penilaian dosen</h2>
						<div className="srs-grade-main">
							<span className="srs-grade-ico" aria-hidden="true">
								<GraduationCap size={26} />
							</span>
							<div>
								<small>Nilai</small>
								<p className="srs-wait">Menunggu penilaian</p>
							</div>
						</div>
						<div className="srs-grade-side pending">
							<Info size={15} />
							<div>
								<strong>Menunggu penilaian</strong>
								<span>Umpan balik dosen belum dipublikasikan.</span>
							</div>
						</div>
					</article>

					<article className="srs-card">
						<h2>
							<MessageCircle size={16} /> Catatan dosen
						</h2>
						<div className="srs-note">
							<p className="empty">
								Catatan dan umpan balik dosen akan muncul di sini setelah dinilai.
							</p>
						</div>
					</article>
				</aside>
			</div>

			<div className="lap-note">
				<CheckCircle2 size={14} />
				<span>
					Pratinjau hanya-tampilan. Halaman hasil asli menampilkan jawaban, nilai huruf, dan
					umpan balik mahasiswa setelah pengumpulan dinilai.
				</span>
			</div>
		</section>;
}