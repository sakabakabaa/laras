import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	BookOpen,
	Calendar,
	CheckCircle2,
	ChevronDown,
	CircleAlert,
	ClipboardList,
	ExternalLink,
	Eye,
	FileText,
	GraduationCap,
	Info,
	Link2,
	MessageCircle,
	Repeat,
	Sparkles,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import {
	activityTypeOf,
	deadlineLabel,
	studentGradeLabel,
	SUBMISSION_STATUS_LABEL,
	submissionFileUrl,
	studentWorkPath,
	type Assignment,
	type AssignmentSubmission,
	type SubmissionStatus,
} from '@/lib/assignments';
import type { Course, CourseResource } from '@/lib/learning';
import { instructionLines } from '@/components/app/student-answer-sheet';
import { buildMarkedSegments, type EvalSeverity } from '@/lib/ai-evaluation';
import {
	parseStudentRecommendations,
	studentGeneralNote,
	type StudentRecommendation,
} from '@/lib/student-feedback';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function formatStamp(iso?: string) {
	if (!iso) return '';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	const hh = String(date.getHours()).padStart(2, '0');
	const mm = String(date.getMinutes()).padStart(2, '0');
	return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${hh}.${mm}`;
}

function wordCount(text: string) {
	const words = text.trim().split(/\s+/).filter(Boolean);
	return words.length;
}

/**
 * Separate, read-only student result page for a finally-submitted Tugas
 * formal. Letter grade only — never a numeric score. Lecturer notes and
 * published inline recommendations are shown on top of the original answer.
 */
export function StudentResultView({
	assignment,
	course,
	submission,
	linkedPractice,
	onBack,
}: {
	assignment: Assignment;
	course: Course;
	submission: AssignmentSubmission;
	linkedPractice?: Assignment | null;
	onBack: () => void;
}) {
	const formative = activityTypeOf(assignment) === 'formative';
	const status = (submission.status || 'submitted') as SubmissionStatus;
	const graded = status === 'graded';
	const letter = graded && submission.grade != null ? studentGradeLabel(submission.grade) : '';
	const week = assignment.expand?.session?.week;
	const courseBadge = (course.code || course.title || 'Mata kuliah').toUpperCase();
	const answer = submission.content || '';
	const collected = formatStamp(submission.updated);
	const gradedAt = formatStamp(submission.gradedAt || submission.updated);
	const deadline = assignment.deadline ? formatStamp(assignment.deadline) || deadlineLabel(assignment.deadline) : '';
	const note = studentGeneralNote(submission.feedback || '');
	const instructions = instructionLines(
		assignment.requirements || assignment.instructions,
		'Ikuti instruksi tugas dari dosen.',
	);
	const formatLabel = assignment.mode === 'collaborative' ? 'Kelompok' : 'Individual';

	const [apiRecs, setApiRecs] = useState<StudentRecommendation[] | null>(null);
	const [instructionsOpen, setInstructionsOpen] = useState(false);
	const [recsOpen, setRecsOpen] = useState(true);
	const [openRec, setOpenRec] = useState<number | null>(null);
	const [activeQuote, setActiveQuote] = useState('');

	useEffect(() => {
		const token = pb.authStore.token;
		if (!token) return;
		let alive = true;
		void fetch('/api/evaluation-result', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ submissionId: submission.id }),
		})
			.then(async (response) => {
				if (!response.ok) return null;
				return (await response.json()) as { recommendations?: StudentRecommendation[] };
			})
			.then((data) => {
				if (alive) setApiRecs(data?.recommendations ?? null);
			})
			.catch(() => {
				/* fall back to the stored feedback */
			});
		return () => {
			alive = false;
		};
	}, [submission.id]);

	const recommendations = useMemo(
		() =>
			apiRecs && apiRecs.length > 0
				? apiRecs
				: parseStudentRecommendations(submission.feedback || ''),
		[apiRecs, submission.feedback],
	);
	const anchored = recommendations.filter((item) => item.quote && answer.includes(item.quote));
	const majorCount = recommendations.filter((item) => item.severity === 'major').length;
	const minorCount = recommendations.filter((item) => item.severity === 'minor').length;
	const segments = useMemo(
		() =>
			buildMarkedSegments(
				answer,
				anchored.map((item) => ({
					severity: item.severity,
					quote: item.quote,
					note: item.note,
					evidence: '',
				})),
			),
		[answer, anchored],
	);
	const lines = answer.split('\n');
	const words = wordCount(answer);

	const materials: { title: string; href?: string; kind: 'file' | 'link' }[] = (
		assignment.expand?.attachments || []
	).map((file) => ({
		title: (file as CourseResource).title || (file as CourseResource).file || 'Materi',
		href: (file as CourseResource).file
			? pb.files.getURL(file, (file as CourseResource).file as string)
			: undefined,
		kind: 'file',
	}));
	const practicePath = linkedPractice ? studentWorkPath(linkedPractice.id) : '';

	function focusRecommendations(quote?: string) {
		if (quote) setActiveQuote(quote);
		setRecsOpen(true);
		document.getElementById('srs-recs')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}

	return (
		<section className="srs" aria-label="Hasil tugas">
			<button type="button" className="srs-back" onClick={onBack}>
				<ArrowLeft size={15} /> Kembali ke daftar tugas
			</button>

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
					{instructions.length > 0 && (
						<article className="srs-card srs-instructions">
							<button
								type="button"
								className="srs-collapse"
								aria-expanded={instructionsOpen}
								onClick={() => setInstructionsOpen((open) => !open)}
							>
								<FileText size={16} />
								<span>Instruksi tugas</span>
								<ChevronDown size={16} className={instructionsOpen ? 'open' : ''} />
							</button>
							{instructionsOpen ? (
								<ol>
									{instructions.map((line, index) => (
										<li key={line}>
											<span>{index + 1}</span>
											{line}
										</li>
									))}
								</ol>
							) : null}
						</article>
					)}

					{(answer || submission.link || submission.files?.length) && (
						<article className="srs-card">
							<div className="srs-answer-head">
								<h2>
									<FileText size={16} /> Jawaban yang dikumpulkan
								</h2>
								<div className="srs-answer-meta">
									{answer ? (
										<span>
											{words} kata{collected ? ` · Dikumpulkan ${collected}` : ''}
										</span>
									) : null}
								</div>
							</div>

							{answer ? (
								<div className="srs-script">
									{lines.map((line, index) => (
										<div className="srs-line" key={`${index}-${line.slice(0, 12)}`}>
											<span>{index + 1}</span>
											<p>
												<MarkedLine
													segments={segmentsForLine(answer, line, index, segments)}
													activeQuote={activeQuote}
													notes={anchored}
													onPick={(quote) => focusRecommendations(quote)}
												/>
											</p>
										</div>
									))}
								</div>
							) : null}

							{submission.link ? (
								<a className="srs-link" href={submission.link} target="_blank" rel="noreferrer">
									<ExternalLink size={14} /> {submission.link}
								</a>
							) : null}
							{submission.files && submission.files.length > 0 ? (
								<ul className="srs-files">
									{submission.files.map((file) => (
										<li key={file}>
							<a href={submissionFileUrl(submission, file)} target="_blank" rel="noreferrer" title={`Lihat ${file} di tab baru`}>
								<Eye size={14} aria-hidden="true" />
								<span className="srs-file-name">{file}</span>
								<span className="srs-file-view">Lihat</span>
							</a>
										</li>
									))}
								</ul>
							) : null}

							{(majorCount > 0 || minorCount > 0) && (
								<div className="srs-answer-foot">
									<div>
										{majorCount > 0 ? (
											<span className="major">
												<CircleAlert size={13} /> {majorCount} perlu diperbaiki
											</span>
										) : null}
										{minorCount > 0 ? (
											<span className="minor">
												<AlertTriangle size={13} /> {minorCount} saran
											</span>
										) : null}
									</div>
									<button type="button" onClick={() => focusRecommendations()}>
										<Info size={13} /> Lihat rekomendasi AI terkait teks
									</button>
								</div>
							)}
						</article>
					)}

					{recommendations.length > 0 ? (
						<article className="srs-card srs-rec-card" id="srs-recs">
							<button
								type="button"
								className="srs-collapse"
								aria-expanded={recsOpen}
								onClick={() => setRecsOpen((open) => !open)}
							>
								<Sparkles size={16} />
								<span>Rekomendasi AI</span>
								<Info size={14} className="srs-info" />
								<span className="srs-rec-counts">
									{majorCount > 0 ? (
										<em className="major">
											<CircleAlert size={12} /> {majorCount} perlu diperbaiki
										</em>
									) : null}
									{minorCount > 0 ? (
										<em className="minor">
											<AlertTriangle size={12} /> {minorCount} saran
										</em>
									) : null}
								</span>
								<ChevronDown size={16} className={recsOpen ? 'open' : ''} />
							</button>
							{recsOpen ? (
								<ul className="srs-recs">
									{recommendations.map((item, index) => {
										const open = openRec === index || (activeQuote && item.quote === activeQuote);
										return (
											<li
												key={`${item.note}-${index}`}
												className={`${item.severity}${activeQuote && item.quote === activeQuote ? ' active' : ''}`}
											>
												<button
													type="button"
													className="srs-rec-row"
													aria-expanded={Boolean(open)}
													onClick={() => {
														setOpenRec(open ? null : index);
														if (item.quote) setActiveQuote(item.quote);
													}}
												>
													{item.severity === 'major' ? (
														<CircleAlert size={16} />
													) : (
														<AlertTriangle size={16} />
													)}
													<span>{item.note}</span>
													<ChevronDown size={16} className={open ? 'open' : ''} />
												</button>
												{open && item.quote ? <blockquote>“{item.quote}”</blockquote> : null}
											</li>
										);
									})}
								</ul>
							) : null}
						</article>
					) : null}

					{materials.length > 0 && (
						<article className="srs-card">
							<h2>
								<ClipboardList size={16} /> Materi pendukung
							</h2>
							<ul className="srs-materials">
								{materials.map((item) => (
									<li key={item.title}>
										<span>{item.kind === 'link' ? <Link2 size={15} /> : <FileText size={15} />}</span>
										<strong>{item.title}</strong>
										{item.href ? (
											<a href={item.href} target="_blank" rel="noreferrer">
												Buka
											</a>
										) : null}
									</li>
								))}
							</ul>
						</article>
					)}

					{practicePath ? (
						<Link to={practicePath} className="srs-practice srs-next-action" onClick={onBack}>
							<Repeat size={16} />
							<span>
								<strong>Langkah berikutnya</strong>
								<em>Latihan persiapan tersedia untuk tugas ini.</em>
							</span>
							<ArrowRight size={16} />
						</Link>
					) : graded ? (
						<div className="srs-practice srs-next-action done">
							<CheckCircle2 size={16} />
							<span>
								<strong>Tugas selesai</strong>
								<em>Umpan balik dosen sudah diterbitkan. Kerjakan tugas lain atau latihan formatif.</em>
							</span>
						</div>
					) : null}
				</div>

				<aside className="srs-side">
					<article className="srs-card srs-status-card">
						<h2>Status dan informasi</h2>
						<span className={`srs-status ${graded ? 'graded' : 'pending'}`}>
							{graded ? <CheckCircle2 size={15} /> : <Info size={15} />}
							{graded ? 'Dinilai' : SUBMISSION_STATUS_LABEL[status]}
						</span>
						<dl>
							<div>
								<dt>
									<Calendar size={14} /> Dikumpulkan
								</dt>
								<dd>{collected || '—'}</dd>
							</div>
							<div>
								<dt>
									<Calendar size={14} /> Batas pengumpulan
								</dt>
								<dd>{deadline || 'Tidak ada batas'}</dd>
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
								{letter ? <em>{letter}</em> : <p className="srs-wait">Menunggu penilaian</p>}
							</div>
						</div>
						{graded ? (
							<div className="srs-grade-side">
								<Calendar size={15} />
								<div>
									<strong>Penilaian selesai</strong>
									<span>{gradedAt || 'Sudah dinilai'}</span>
								</div>
							</div>
						) : (
							<div className="srs-grade-side pending">
								<Info size={15} />
								<div>
									<strong>Menunggu penilaian</strong>
									<span>Umpan balik dosen belum dipublikasikan.</span>
								</div>
							</div>
						)}
					</article>

					<article className="srs-card">
						<h2>
							<MessageCircle size={16} /> Catatan dosen
						</h2>
						<div className="srs-note">
							{note ? (
								<p>{note}</p>
							) : recommendations.length > 0 ? (
								<p className="empty">
									Tidak ada catatan tambahan — saran perbaikan tersedia pada jawaban di samping.
								</p>
							) : (
								<p className="empty">Dosen belum menuliskan catatan perbaikan.</p>
							)}
						</div>
					</article>
				</aside>
			</div>
		</section>
	);
}

type Segment = { text: string; severity?: EvalSeverity; findingIndex?: number };

function segmentsForLine(full: string, line: string, lineIndex: number, segments: Segment[]): Segment[] {
	const start = lineStart(full, lineIndex);
	const end = start + line.length;
	const out: Segment[] = [];
	let cursor = 0;
	for (const segment of segments) {
		const segStart = cursor;
		const segEnd = cursor + segment.text.length;
		cursor = segEnd;
		const from = Math.max(segStart, start);
		const to = Math.min(segEnd, end);
		if (to <= from) continue;
		out.push({
			text: full.slice(from, to),
			severity: segment.severity,
			findingIndex: segment.findingIndex,
		});
	}
	if (out.length === 0) out.push({ text: line || ' ' });
	return out;
}

function lineStart(full: string, lineIndex: number) {
	let index = 0;
	let seen = 0;
	while (seen < lineIndex && index < full.length) {
		if (full[index] === '\n') seen += 1;
		index += 1;
	}
	return index;
}

function MarkedLine({
	segments,
	activeQuote,
	notes,
	onPick,
}: {
	segments: Segment[];
	activeQuote: string;
	notes: StudentRecommendation[];
	onPick: (quote: string) => void;
}) {
	return (
		<>
			{segments.map((segment, index) => {
				if (!segment.severity || segment.findingIndex == null) {
					return <span key={index}>{segment.text}</span>;
				}
				const note = notes[segment.findingIndex];
				const quote = note?.quote || segment.text;
				return (
					<button
						key={index}
						type="button"
						className={`srs-mark ${segment.severity}${activeQuote === quote ? ' on' : ''}`}
						onClick={() => onPick(quote)}
					>
						{segment.text}
						{note ? <span className="srs-tip">{note.note}</span> : null}
					</button>
				);
			})}
		</>
	);
}
