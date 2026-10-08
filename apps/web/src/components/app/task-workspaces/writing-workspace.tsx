import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
	ArrowLeft,
	ArrowRight,
	Camera,
	CheckCircle2,
	FileUp,
	LoaderCircle,
	Pencil,
	Save,
	Send,
	Trash2,
	UploadCloud,
	X,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import { errorMessage } from '@/lib/learning';
import {
	isPastDeadline,
	submissionFileUrl,
	uploadSubmission,
	type Assignment,
	type AssignmentSubmission,
	type SubmissionStatus,
	type UploadProgress,
} from '@/lib/assignments';
import { ACCEPTED_MIME, validateFile } from '@/lib/resources';
import { requestEvaluationDraft } from '@/lib/ai-evaluation';
import { countWords, hasWritingQuestions, parseTaskAnswers, parseWritingConfig, type WritingConfig, type WritingQuestion } from '@/lib/task-types';
import { marksFromCheck } from '@/components/app/formative-answer-script';
import { CheckAnswerPanel } from '@/components/app/task-workspaces/check-answer-panel';
import { parseFeedbackPoints, shortenAdvice } from '@/components/app/task-workspaces/point-feedback';
import { confirmDialog } from '@/components/confirm-dialog';
import { WorksheetArt } from '@/components/app/worksheet-art';

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const isImageFile = (name: string) => IMAGE_EXT.test(name);

type NewFile = { file: File; url: string; isImage: boolean };

/**
 * Student writing workspace: direct text writing with live length guidance,
 * document upload, photo capture/upload for handwritten work with preview and
 * reordering, draft saving, and final submission.
 */
export function WritingWorkspace({
	assignment,
	submission,
	onSaved,
	asideChecks,
	reviewing,
}: {
	assignment: Assignment;
	submission: AssignmentSubmission | null;
	onSaved: () => void;
	/** Move AI panels into the workspace side column. Existing results, no new check. */
	asideChecks?: boolean;
	/** Check step: numbered answer instead of the editor. */
	reviewing?: boolean;
}) {
	const config: WritingConfig = useMemo(() => parseWritingConfig(assignment.taskConfig), [assignment]);
	const saved = useMemo(() => parseTaskAnswers(submission?.taskAnswers), [submission]);
	const [text, setText] = useState(submission?.content || '');
	const [group, setGroup] = useState(submission?.group || '');
	const [link] = useState(submission?.link || '');
	// Kept filenames from a previous save: documents first, then images in the
	// student's chosen order (imageOrder).
	const [keptFiles, setKeptFiles] = useState<string[]>(() => {
		const files = submission?.files || [];
		const order = saved?.writing?.imageOrder || [];
		const images = order.filter((f) => files.includes(f));
		const rest = files.filter((f) => !images.includes(f));
		return [...rest, ...images];
	});
	const [newFiles, setNewFiles] = useState<NewFile[]>([]);
	const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
	const [error, setError] = useState('');
	const [fileError, setFileError] = useState('');
	const [progress, setProgress] = useState<UploadProgress | null>(null);
	const docRef = useRef<HTMLInputElement>(null);
	const photoRef = useRef<HTMLInputElement>(null);
	const areaRef = useRef<HTMLTextAreaElement>(null);
	const annotatedContentRef = useRef<HTMLDivElement>(null);
	const [latestFeedback, setLatestFeedback] = useState<{
		feedback: string;
		evidence: string;
		area: string;
		level?: number;
	} | null>(null);
	const [editing, setEditing] = useState(false);
	const annotations = useMemo(() => buildWritingAnnotations(latestFeedback), [latestFeedback]);
	const phraseMarks = useMemo(
		() => marksFromCheck(text, latestFeedback?.feedback || '', latestFeedback?.evidence || ''),
		[text, latestFeedback],
	);
	const hasInline = annotations.length > 0 || phraseMarks.length > 0;
	const handleLatestFeedback = useCallback(
		(fb: { feedback: string; evidence: string; area: string; level?: number } | null) => {
			setLatestFeedback(fb);
			if (fb) setEditing(false);
		},
		[],
	);

	// Multi-question writing: each block is answered separately and submitted
	// together as one assignment. The legacy single-block editor handles
	// assignments without configured question blocks.
	if (hasWritingQuestions(config)) {
		return (
			<MultiQuestionWriting
				assignment={assignment}
				submission={submission}
				onSaved={onSaved}
				asideChecks={asideChecks}
				reviewing={reviewing}
			/>
		);
	}
	const updateText = (v: string) => {
		setText(v);
		setLatestFeedback(null);
	};

	const revision = submission?.status === 'revision';
	const past = isPastDeadline(assignment.deadline);
	const submittedAlready = Boolean(submission && submission.status !== 'draft' && submission.status !== 'revision');
	const canWork = assignment.status === 'published' && (!past || revision) && !submittedAlready;

	const words = countWords(text);
	const lengthHint =
		config.minWords > 0 || config.maxWords > 0
			? `${words} kata${config.minWords > 0 ? ` · minimal ${config.minWords}` : ''}${config.maxWords > 0 ? ` · maksimal ${config.maxWords}` : ''}`
			: `${words} kata`;
	const lengthWarn =
		(config.minWords > 0 && words < config.minWords) ||
		(config.maxWords > 0 && words > config.maxWords);

	const keptImages = keptFiles.filter(isImageFile);
	const keptDocs = keptFiles.filter((f) => !isImageFile(f));
	const newImages = newFiles.filter((f) => f.isImage);
	const newDocs = newFiles.filter((f) => !f.isImage);

	const addFiles = (list: FileList | null, expectImage: boolean) => {
		setFileError('');
		if (!list || list.length === 0) return;
		const next: NewFile[] = [];
		for (const file of Array.from(list)) {
			const vErr = validateFile(file);
			if (vErr) {
				setFileError(vErr);
				return;
			}
			if (expectImage && !file.type.startsWith('image/')) {
				setFileError('Hanya berkas gambar yang dapat diunggah sebagai foto tulisan.');
				return;
			}
			next.push({ file, url: URL.createObjectURL(file), isImage: file.type.startsWith('image/') });
		}
		setNewFiles((prev) => [...prev, ...next].slice(0, 10));
	};

	const moveImage = (filename: string, dir: -1 | 1) => {
		setKeptFiles((prev) => {
			const images = prev.filter(isImageFile);
			const i = images.indexOf(filename);
			const j = i + dir;
			if (i < 0 || j < 0 || j >= images.length) return prev;
			[images[i], images[j]] = [images[j], images[i]];
			return [...prev.filter((f) => !isImageFile(f)), ...images];
		});
	};
	const moveNewImage = (index: number, dir: -1 | 1) => {
		setNewFiles((prev) => {
			const images = prev.filter((f) => f.isImage);
			const i = images.findIndex((f) => f.url === prev.filter((p) => p.isImage)[index]?.url);
			const j = i + dir;
			if (i < 0 || j < 0 || j >= images.length) return prev;
			[images[i], images[j]] = [images[j], images[i]];
			const docs = prev.filter((f) => !f.isImage);
			// Rebuild keeping relative positions: docs first, then images.
			return [...docs, ...images];
		});
	};

	const save = async (final: boolean) => {
		setError('');
		setFileError('');
		if (
			final &&
			!(await confirmDialog({
				title: 'Kumpulkan tugas?',
				message: 'Kumpulkan versi terakhir ini sebagai pengumpulan resmi? Setelah terkirim, Cek jawaban ditutup dan hasil menunggu penilaian dosen.',
				variant: 'default',
				confirmLabel: 'Kumpulkan',
			}))
		) {
			return;
		}
		const hasWork = text.trim() || newFiles.length > 0 || keptFiles.length > 0 || link.trim();
		if (!hasWork) {
			setError('Tulis teks, unggah dokumen/foto, atau tempel tautan sebelum menyimpan.');
			return;
		}
		if (final && config.allowText && !text.trim() && !keptDocs.length && !newDocs.length && !newImages.length && !keptImages.length && !link.trim()) {
			setError('Kumpulkan setidaknya satu hasil pekerjaan.');
			return;
		}
		if (link.trim() && !/^https?:\/\//i.test(link.trim())) {
			setError('Tautan harus dimulai dengan http:// atau https://');
			return;
		}
		setBusy(final ? 'submit' : 'save');
		try {
			const status: SubmissionStatus = final
				? isPastDeadline(assignment.deadline)
					? 'late'
					: 'submitted'
				: 'draft';
			const prevFiles = submission?.files || [];
			let record: AssignmentSubmission;

			if (newFiles.length > 0) {
				const fd = new FormData();
				fd.append('content', text.trim());
				fd.append('link', link.trim());
				fd.append('group', group.trim());
				fd.append('status', status);
				for (const f of keptFiles) fd.append('files', f);
				for (const f of newFiles) fd.append('files', f.file);
				if (submission) {
					record = await uploadSubmission(fd, { id: submission.id }, setProgress);
				} else {
					fd.append('assignment', assignment.id);
					fd.append('owner', pb.authStore.record?.id || '');
					record = await uploadSubmission(fd, {}, setProgress);
				}
			} else if (submission) {
				record = await pb.collection('assignment_submissions').update<AssignmentSubmission>(submission.id, {
					content: text.trim(),
					link: link.trim(),
					group: group.trim(),
					status,
					...(keptFiles.length !== prevFiles.length || keptFiles.join() !== prevFiles.join()
						? { files: keptFiles }
						: {}),
				});
			} else {
				record = await pb.collection('assignment_submissions').create<AssignmentSubmission>({
					assignment: assignment.id,
					owner: pb.authStore.record?.id,
					content: text.trim(),
					link: link.trim(),
					group: group.trim(),
					status,
				});
			}

			// Persist the image order (kept order + newly uploaded images, whose
			// final filenames only exist after the upload response).
			const finalFiles = record.files || [];
			const newFinals = finalFiles.filter((f) => !prevFiles.includes(f));
			const imageOrder = [
				...keptFiles.filter(isImageFile).filter((f) => finalFiles.includes(f)),
				...newFinals.filter(isImageFile),
			];
			await pb.collection('assignment_submissions').update(record.id, {
				taskAnswers: {
					...saved,
					writing: {
						imageOrder,
						savedAt: new Date().toISOString(),
						wordCount: words,
					},
				},
			});

			invalidate('assignment_submissions');
			setNewFiles([]);
			// Background AI evaluation draft for the lecturer (formal tasks only —
			// the endpoint skips Latihan formatif). The submission is already
			// stored, so a failed analysis never affects it.
			if (final) void requestEvaluationDraft(record.id);
			onSaved();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(null);
			setProgress(null);
		}
	};

	if (submittedAlready) {
		return (
			<div className="tws-done">
				<div className="tws-done-head">
					<CheckCircle2 size={16} />
					<strong>Pekerjaan sudah dikumpulkan</strong>
				</div>
				<p>
					{words > 0 && `${words} kata tersimpan. `}
					{keptImages.length > 0 && `${keptImages.length} foto tulisan tersimpan. `}
					{revision
						? 'Dosen meminta revisi — perbarui pekerjaan Anda lalu kumpulkan ulang.'
						: 'Menunggu penilaian dosen.'}
				</p>
			</div>
		);
	}
	if (!canWork) {
		return (
			<p className="asg-empty-line overdue">Batas waktu pengumpulan sudah terlewat. Pengumpulan tidak dapat diubah.</p>
		);
	}

	return (
		<div className={`tws-workspace tws-writing${reviewing ? ' reviewing' : ''}${asideChecks ? ' ws-compose' : ''}`}>
			{config.prompt && !asideChecks && <p className="tws-prompt">{config.prompt}</p>}
			<div className="tws-meta">
				{config.language && <span className="tws-chip">Bahasa: {config.language}</span>}
				<span className={`tws-chip${lengthWarn ? ' warn' : ''}`}>{lengthHint}</span>
			</div>
			{config.formatGuidance && !asideChecks && <p className="tws-guidance">{config.formatGuidance}</p>}

			{asideChecks && !reviewing && (
				<div className="ws-compose-head">
					<h2>
						<Pencil size={16} /> Tulisan Anda
					</h2>
					<div className="ws-compose-meta">
						{config.language && <span>Bahasa: {config.language}</span>}
						<span className={lengthWarn ? 'warn' : ''}>{words} kata</span>
					</div>
				</div>
			)}

			{assignment.mode === 'collaborative' && (
				<label className="tws-field">
					Nama kelompok
					<input
						maxLength={200}
						value={group}
						onChange={(e) => setGroup(e.target.value)}
						placeholder="mis. Kelompok 3"
					/>
				</label>
			)}

			{config.allowText && reviewing && !hasInline && <NumberedAnswer text={text} words={words} />}
			{config.allowText && hasInline && (reviewing || !editing) && (
				<AnnotatedAnswer
					text={text}
					feedback={latestFeedback?.feedback || ''}
					evidence={latestFeedback?.evidence || ''}
					annotations={annotations}
					onEdit={reviewing ? undefined : () => setEditing(true)}
					contentRef={annotatedContentRef}
				/>
			)}
			{config.allowText && !reviewing && (!hasInline || editing) && (
				<label className="tws-field">
					TULISAN ANDA
					<LinedTextarea value={text} onChange={updateText} textareaRef={areaRef} />
					<small>{lengthHint}</small>
					{hasInline && editing && (
						<button type="button" className="ld-text-btn" onClick={() => setEditing(false)}>
							Lihat dengan catatan AI
						</button>
					)}
				</label>
			)}

			{config.allowDocument && (
				<div className="tws-upload">
					<input
						ref={docRef}
						type="file"
						className="pdf-file-input"
						multiple
						accept={ACCEPTED_MIME}
						onChange={(e) => {
							addFiles(e.target.files, false);
							e.target.value = '';
						}}
					/>
					<button type="button" className="pdf-dropzone" onClick={() => docRef.current?.click()}>
						<span className="pdf-dropzone-icon">
							<UploadCloud size={24} />
						</span>
						<strong>Unggah dokumen (PDF/DOCX/dll.)</strong>
						<span className="pdf-dropzone-hint">Maks 10 berkas @ 100 MB</span>
					</button>
				</div>
			)}

			{config.allowPhotos && (
				<div className="tws-upload">
					<input
						ref={photoRef}
						type="file"
						className="pdf-file-input"
						multiple
						accept="image/*"
						capture="environment"
						onChange={(e) => {
							addFiles(e.target.files, true);
							e.target.value = '';
						}}
					/>
					<div className="tws-photo-actions">
						<button type="button" className="ld-outline-action sm" onClick={() => photoRef.current?.click()}>
							<Camera size={14} /> Foto / unggah tulisan tangan
						</button>
						<span className="tws-photo-hint">Foto dapat dipratinjau dan diurutkan.</span>
					</div>
				</div>
			)}

			{(keptDocs.length > 0 || newDocs.length > 0) && (
				<div className="tws-docs">
					{keptDocs.map((f) => (
						<span key={f} className="asg-file-chip">
							<FileUp size={11} /> {f}
							<button
								type="button"
								aria-label={`Hapus ${f}`}
								onClick={() => setKeptFiles((prev) => prev.filter((x) => x !== f))}
							>
								<X size={12} />
							</button>
						</span>
					))}
					{newDocs.map((nf, i) => (
						<span key={nf.url} className="asg-file-chip">
							<FileUp size={11} /> {nf.file.name}
							<button
								type="button"
								aria-label={`Hapus ${nf.file.name}`}
								onClick={() => setNewFiles((prev) => prev.filter((_, idx) => idx !== prev.findIndex((p) => p.url === nf.url)))}
							>
								<X size={12} />
							</button>
						</span>
					))}
				</div>
			)}

			{(keptImages.length > 0 || newImages.length > 0) && (
				<div className="tws-photos">
					<span className="tws-photos-label">Foto tulisan tangan ({keptImages.length + newImages.length})</span>
					<ol className="tws-photo-list">
						{keptImages.map((f, i) => (
							<li key={f} className="tws-photo">
								<img src={submissionFileUrl(submission!, f)} alt={`Foto tulisan ${i + 1}`} loading="lazy" />
								<div className="tws-photo-tools">
									<button type="button" aria-label={`Geser kiri foto ${i + 1}`} disabled={i === 0} onClick={() => moveImage(f, -1)}>
										<ArrowLeft size={13} />
									</button>
									<span>{i + 1}</span>
									<button
										type="button"
										aria-label={`Geser kanan foto ${i + 1}`}
										disabled={i === keptImages.length - 1 && newImages.length === 0}
										onClick={() => moveImage(f, 1)}
									>
										<ArrowRight size={13} />
									</button>
									<button type="button" aria-label={`Hapus foto ${i + 1}`} className="danger" onClick={() => setKeptFiles((prev) => prev.filter((x) => x !== f))}>
										<Trash2 size={13} />
									</button>
								</div>
							</li>
						))}
						{newImages.map((nf, i) => (
							<li key={nf.url} className="tws-photo">
								<img src={nf.url} alt={`Foto baru ${i + 1}`} />
								<div className="tws-photo-tools">
									<button
										type="button"
										aria-label={`Geser kiri foto baru ${i + 1}`}
										disabled={keptImages.length === 0 && i === 0}
										onClick={() => moveNewImage(i, -1)}
									>
										<ArrowLeft size={13} />
									</button>
									<span>{keptImages.length + i + 1}</span>
									<button
										type="button"
										aria-label={`Geser kanan foto baru ${i + 1}`}
										disabled={i === newImages.length - 1}
										onClick={() => moveNewImage(i, 1)}
									>
										<ArrowRight size={13} />
									</button>
									<button
										type="button"
										aria-label={`Hapus foto baru ${i + 1}`}
										className="danger"
										onClick={() => setNewFiles((prev) => prev.filter((p) => p.url !== nf.url))}
									>
										<Trash2 size={13} />
									</button>
								</div>
							</li>
						))}
					</ol>
				</div>
			)}

			{fileError && (
				<p className="form-error" role="alert">
					{fileError}
				</p>
			)}
			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
			{progress && (
				<div className="res-progress" aria-live="polite">
					<div className="res-progress-bar">
						<span style={{ width: `${progress.percent}%` }} />
					</div>
					<em>Mengunggah {progress.percent}%</em>
				</div>
			)}

			<div className="tws-actions">
				<button type="button" className="ld-outline-action sm" onClick={() => void save(false)} disabled={busy !== null}>
					{busy === 'save' ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />} {asideChecks ? 'Simpan sebagai draft' : 'Simpan draf'}
				</button>
				<button type="button" className="ld-btn-primary" onClick={() => void save(true)} disabled={busy !== null}>
					{busy === 'submit' ? (
						<>
							<LoaderCircle size={15} className="spin" /> Mengumpulkan...
						</>
					) : (
						<>
							<Send size={15} /> {asideChecks ? 'Kirim jawaban' : 'Kumpulkan pekerjaan'}
						</>
					)}
				</button>
			</div>
			{lengthWarn && (
				<p className="tws-hint">
					{config.minWords > 0 && words < config.minWords
						? `Tulisan belum mencapai panjang minimal ${config.minWords} kata.`
						: `Tulisan melebihi panjang maksimal ${config.maxWords} kata.`}
				</p>
			)}
			<ReviewSlot aside={asideChecks}>
				<CheckAnswerPanel
					assignment={assignment}
					channel="enrolled"
					buildResponse={() => ({
						kind: 'writing',
						content: text,
						link,
						wordCount: words,
					})}
					buildNumberedContent={() => {
						const el = areaRef.current || annotatedContentRef.current;
						if (!el) return '';
						const lines = splitVisualLines(el, text);
						if (lines.length === 0) return '';
						return lines.map((line, i) => `${i + 1}. ${line}`).join('\n');
					}}
					hideLineByLineFeedback
					onApplyOcrText={updateText}
					onLatestFeedback={handleLatestFeedback}
				/>
			</ReviewSlot>
		</div>
	);
}

/**
 * Split the textarea's value into its rendered visual lines (including
 * auto-wrapped lines), mirroring the editor's `white-space: pre-wrap` layout.
 * Uses an off-screen probe matching the editor's font and content width so the segments match
 * what the student sees numbered in the gutter. Used only to build a
 * line-numbered copy for AI analysis — the original answer text is untouched.
 */
function splitVisualLines(area: HTMLElement, value: string): string[] {
	const style = getComputedStyle(area);
	const lineHeight = parseFloat(style.lineHeight) || 22.95;
	const width = Math.max(
		0,
		area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
	);
	const hardLines = value.split('\n');
	if (!width) return hardLines;
	const probe = document.createElement('div');
	probe.setAttribute('aria-hidden', 'true');
	probe.style.cssText = [
		'position:absolute',
		'visibility:hidden',
		'pointer-events:none',
		'left:0',
		'top:0',
		'padding:0',
		'margin:0',
		'border:0',
		'box-sizing:content-box',
		`width:${width}px`,
		`font:${style.font}`,
		`line-height:${style.lineHeight}`,
		`letter-spacing:${style.letterSpacing}`,
		`word-spacing:${style.wordSpacing}`,
		`tab-size:${style.tabSize}`,
		'white-space:pre-wrap',
		'overflow-wrap:break-word',
		'word-break:break-word',
	].join(';');
	document.body.appendChild(probe);
	const linesOf = (text: string) => {
		probe.textContent = text.length ? text : '\u00a0';
		return Math.max(1, Math.round(probe.offsetHeight / lineHeight));
	};
	const out: string[] = [];
	for (const hard of hardLines) {
		if (!hard) {
			out.push('');
			continue;
		}
		const total = linesOf(hard);
		if (total <= 1) {
			out.push(hard);
			continue;
		}
		// Greedy word wrap; tokens longer than the line fall back to char-level
		// splitting (binary search for the largest prefix that fits one line).
		const tokens = hard.split(/(\s+)/).filter((t) => t.length > 0);
		const visual: string[] = [];
		let cur = '';
		for (const tok of tokens) {
			const next = cur + tok;
			if (linesOf(next) > 1 && cur.trim()) {
				visual.push(cur.replace(/\s+$/, ''));
				cur = tok.replace(/^\s+/, '');
			} else {
				cur = next;
			}
			// A single token wider than the line: split char by char.
			while (cur && linesOf(cur) > 1) {
				let lo = 0;
				let hi = cur.length;
				while (lo < hi) {
					const mid = (lo + hi + 1) >> 1;
					if (linesOf(cur.slice(0, mid)) <= 1) lo = mid;
					else hi = mid - 1;
				}
				if (lo === 0) lo = 1; // force progress on a single over-tall char
				visual.push(cur.slice(0, lo));
				cur = cur.slice(lo).replace(/^\s+/, '');
			}
		}
		if (cur.replace(/\s+$/, '')) visual.push(cur.replace(/\s+$/, ''));
		out.push(...(visual.length ? visual : [hard]));
	}
	probe.remove();
	return out;
}

/** Numbered writing field. Numbers follow wrapped visual lines, not only Enter. */
function LinedTextarea({
	value,
	onChange,
	textareaRef,
}: {
	value: string;
	onChange: (value: string) => void;
	textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
	const areaRef = useRef<HTMLTextAreaElement>(null);
	const gutterRef = useRef<HTMLDivElement>(null);
	const [count, setCount] = useState(() => Math.max(value.split('\n').length, 1));

	useLayoutEffect(() => {
		const area = areaRef.current;
		if (!area) return;
		const measure = () => {
			const style = getComputedStyle(area);
			const lineHeight = parseFloat(style.lineHeight) || 22.95;
			const padTop = parseFloat(style.paddingTop) || 0;
			const padBottom = parseFloat(style.paddingBottom) || 0;
			// Collapse the field so scrollHeight reflects the full content (not a
			// min-height floor), then expand to fit so the writer never clips.
			const prevHeight = area.style.height;
			const prevMin = area.style.minHeight;
			area.style.minHeight = '0px';
			area.style.height = '0px';
			const scrollH = area.scrollHeight;
			area.style.height = prevHeight;
			area.style.minHeight = prevMin;
			const contentHeight = Math.max(0, scrollH - padTop - padBottom);
			const lines = Math.max(1, Math.ceil(contentHeight / lineHeight - 0.08));
			area.style.height = `${scrollH}px`;
			setCount((prev) => (prev === lines ? prev : lines));
		};
		measure();
		let lastWidth = area.clientWidth;
		let raf = 0;
		const observer = new ResizeObserver(() => {
			const w = area.clientWidth;
			if (w === lastWidth) return;
			lastWidth = w;
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(measure);
		});
		observer.observe(area);
		let cancelled = false;
		if (typeof document !== 'undefined' && document.fonts && 'ready' in document.fonts) {
			document.fonts.ready.then(() => {
				if (!cancelled) measure();
			});
		}
		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
			observer.disconnect();
		};
	}, [value]);

	const setArea = (el: HTMLTextAreaElement | null) => {
		areaRef.current = el;
		if (textareaRef) {
			(textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
		}
	};
	return (
		<div className="lined-box">
			<div
				className="lined-gutter"
				ref={gutterRef}
				aria-hidden
			>
				{Array.from({ length: count }, (_, i) => (
					<span key={i}>{i + 1}</span>
				))}
			</div>
			<textarea
				ref={setArea}
				rows={count}
				maxLength={100000}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onScroll={() => {
					if (gutterRef.current && areaRef.current) {
						gutterRef.current.scrollTop = areaRef.current.scrollTop;
					}
				}}
				placeholder="Tulis pekerjaan Anda di sini…"
				aria-label="Tulisan Anda, bernomor per baris yang terlihat"
			/>
		</div>
	);
}

/** Puts existing AI panels in the side column when the workspace portal exists. */
function ReviewSlot({ aside, children }: { aside?: boolean; children: ReactNode }) {
	const [node, setNode] = useState<HTMLElement | null>(null);
	useEffect(() => {
		if (!aside) return;
		setNode(document.getElementById('sas-review-portal'));
	}, [aside]);
	if (aside && node) return createPortal(children, node);
	return <div className="tws-checks">{children}</div>;
}

/** Read-only numbered answer for the check step. Does not invent line grades. */
function NumberedAnswer({ text, words }: { text: string; words: number }) {
	const probeRef = useRef<HTMLOListElement>(null);
	const [lines, setLines] = useState<string[]>(() => text.split('\n'));

	useLayoutEffect(() => {
		const el = probeRef.current;
		if (!el) return;
		const apply = () => {
			const visual = splitVisualLines(el, text);
			const next = coversText(visual, text) ? visual : text.split('\n');
			setLines((prev) =>
				prev.length === next.length && prev.every((line, i) => line === next[i]) ? prev : next,
			);
		};
		apply();
		if (typeof ResizeObserver === 'undefined') return;
		const obs = new ResizeObserver(apply);
		obs.observe(el);
		return () => obs.disconnect();
	}, [text]);

	const visible = lines.filter((line) => line.trim());
	return (
		<div className="ans-sheet">
			<div className="ans-sheet-head">
				<strong>Jawaban kamu</strong>
				<span>{words} kata</span>
			</div>
			{visible.length === 0 ? (
				<div className="ws-empty">
					<WorksheetArt name="empty" size="md" />
					<p className="fbp-empty">Belum ada tulisan. Kembali ke langkah Jawaban untuk mengisi.</p>
				</div>
			) : (
				<ol className="ans-lines" ref={probeRef}>
					{lines.map((line, index) => (
						<li key={index}>
							<span>{index + 1}</span>
							<p>{line || '\u00a0'}</p>
						</li>
					))}
				</ol>
			)}
		</div>
	);
}

/** True when a visual split still contains the full answer, not a clipped prefix. */
function coversText(lines: string[], text: string) {
	if (!text.trim()) return true;
	const flat = (value: string) => value.replace(/\s+/g, '');
	return flat(lines.join('')) === flat(text);
}

// ── AI annotations drawn over the answer ─────────────────────

type LineAnnotation = {
	line: number;
	color: 'red' | 'yellow';
	title: string;
	detail: string;
};

/**
 * Parse Indonesian line references ("baris 4", "baris 4-6", "baris 4, 5 dan 7")
 * into a sorted, de-duplicated list of 1-based line numbers. Returns an empty
 * list when no reference is found — callers fall back to the existing feedback
 * list for any point that cannot be aligned.
 */
function extractLineRefs(text: string): number[] {
	if (!text) return [];
	const out = new Set<number>();
	const re = /baris\s+(?:ke-)?([0-9\s,.\-–—dan&serta]+)/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text))) {
		const seg = m[1];
		const rangeRe = /(\d+)\s*[-–—]\s*(\d+)/g;
		let rm: RegExpExecArray | null;
		while ((rm = rangeRe.exec(seg))) {
			const a = parseInt(rm[1], 10);
			const b = parseInt(rm[2], 10);
			const lo = Math.min(a, b);
			const hi = Math.max(a, b);
			for (let i = lo; i <= hi && i <= 500; i++) out.add(i);
		}
		const numRe = /\d+/g;
		let nm: RegExpExecArray | null;
		while ((nm = numRe.exec(seg))) {
			const n = parseInt(nm[0], 10);
			if (n >= 1 && n <= 500) out.add(n);
		}
	}
	return [...out].sort((a, b) => a - b);
}

function quotesOf(text: string): string[] {
	return [...text.matchAll(/["“«']([^"”»']{4,90})["”»']/g)].map((m) =>
		m[1].toLocaleLowerCase('de-DE').replace(/…|\.{2,}/g, '').replace(/\s+/g, ' ').trim(),
	);
}

/** True when a quoted phrase in the advice actually appears in that line's citation. */
function sharesSignal(point: string, segment: string): boolean {
	const seg = segment.toLocaleLowerCase('de-DE');
	for (const quote of quotesOf(point)) {
		const probe = quote.length >= 8 ? quote.slice(0, 18) : quote;
		if (probe.length >= 4 && seg.includes(probe)) return true;
	}
	return false;
}

function evidenceSegments(evidence: string): { lo: number; hi: number; text: string }[] {
	const text = evidence.replace(/\s+/g, ' ').trim();
	if (!text) return [];
	const re = /baris\s+(?:ke-)?(\d+)(?:\s*[-–—]\s*(\d+))?/gi;
	const hits: { index: number; lo: number; hi: number }[] = [];
	let match: RegExpExecArray | null;
	while ((match = re.exec(text))) {
		const a = parseInt(match[1], 10);
		const b = match[2] ? parseInt(match[2], 10) : a;
		hits.push({ index: match.index, lo: Math.min(a, b), hi: Math.max(a, b) });
	}
	return hits
		.map((hit, index) => {
			const raw = text.slice(hit.index, hits[index + 1]?.index ?? text.length);
			// Stop before the next suggestion so later quotes are not blamed on this line.
			const cut = raw.search(
				/\s(?:\[(?:sesuai|baik|ok|cukup|perbaiki|bisa|saran|perlu|kurang|penting|tips|tip)\]|\b(?:periksa|rapikan|perbaiki|perhatikan|pastikan|tambahkan|sesuaikan)\b)/i,
			);
			return {
				lo: hit.lo,
				hi: hit.hi,
				text: (cut > 12 ? raw.slice(0, cut) : raw).trim(),
			};
		})
		.filter((segment) => segment.hi - segment.lo <= 4 && segment.lo >= 1);
}

function citationPoint(segment: string): string {
	const quote = segment.match(/["“«']([^"”»']{8,70})/);
	const raw = quote ? quote[1].replace(/\s+/g, ' ').trim() : '';
	const short = raw.length > 42 ? `${raw.slice(0, 40).replace(/\s+\S*$/, '')}…` : raw;
	return short ? `Periksa bentuk pada “${short}”.` : 'Periksa lagi bentuk pada baris ini.';
}

/**
 * Build line annotations from the latest formative check. Each fix/improve
 * point is a short sentence on the lines it names (red for "perlu", yellow
 * for "perbaiki"). Points without their own line number attach only to the
 * evidence segment that cites the same words — never the whole essay on
 * every line. Unaligned points stay in the Cek jawaban list.
 */
function buildWritingAnnotations(
	fb: { feedback: string; evidence: string; area: string } | null,
): LineAnnotation[] {
	if (!fb || !fb.feedback) return [];
	const points = parseFeedbackPoints([fb.feedback, fb.evidence].filter(Boolean).join('\n'));
	const advice = points.filter((p) => p.status === 'fix' || p.status === 'improve');
	if (advice.length === 0) return [];
	const segments = evidenceSegments([fb.evidence, fb.feedback].filter(Boolean).join(' '));
	const byLine = new Map<number, { color: 'red' | 'yellow'; titles: string[] }>();
	const add = (line: number, color: 'red' | 'yellow', title: string) => {
		if (line < 1 || line > 500 || !title) return;
		const row = byLine.get(line) || { color, titles: [] };
		if (color === 'red') row.color = 'red';
		if (!row.titles.includes(title) && row.titles.length < 4) row.titles.push(title);
		byLine.set(line, row);
	};

	for (const point of advice) {
		const blob = `${point.title} ${point.detail}`.trim();
		const title = shortenAdvice(blob);
		if (!title) continue;
		const color: 'red' | 'yellow' = point.status === 'fix' ? 'red' : 'yellow';
		const refs = extractLineRefs(blob);
		if (refs.length > 0 && refs.length <= 5) {
			for (const line of refs) add(line, color, title);
			continue;
		}
		for (const segment of segments) {
			if (!sharesSignal(blob, segment.text)) continue;
			for (let line = segment.lo; line <= segment.hi; line++) add(line, color, title);
		}
	}

	for (const segment of segments) {
		const missing: number[] = [];
		for (let line = segment.lo; line <= segment.hi; line++) {
			if (!byLine.has(line)) missing.push(line);
		}
		if (missing.length === 0) continue;
		const title = citationPoint(segment.text);
		const color: 'red' | 'yellow' = advice.some((p) => p.status === 'fix') ? 'red' : 'yellow';
		for (const line of missing) add(line, color, title);
	}

	const out: LineAnnotation[] = [];
	for (const [line, row] of byLine) {
		for (const title of row.titles) out.push({ line, color: row.color, title, detail: '' });
	}
	return out;
}

/** One gutter number per rendered visual line, including a row that still wraps. */
function gutterNumbers(lineCount: number, rowLines: number[]): number[] {
	const out: number[] = [];
	let n = 1;
	for (let i = 0; i < lineCount; i++) {
		const span = Math.max(1, rowLines[i] || 1);
		for (let k = 0; k < span; k++) out.push(n++);
	}
	return out;
}

type PhraseSeg = { text: string; key?: string; color?: 'yellow' | 'red'; note?: string };

function phraseSegments(line: string, from: number, to: number, marks: ReturnType<typeof marksFromCheck>): PhraseSeg[] {
	const local = marks
		.map((mark) => ({
			start: Math.max(mark.start, from) - from,
			end: Math.min(mark.end, to) - from,
			color: mark.color,
			note: mark.note,
			key: `${mark.start}-${mark.end}`,
		}))
		.filter((mark) => mark.end > mark.start)
		.sort((a, b) => a.start - b.start || b.end - a.end);
	const parts: PhraseSeg[] = [];
	let cursor = 0;
	for (const mark of local) {
		if (mark.start > cursor) parts.push({ text: line.slice(cursor, mark.start) });
		parts.push({
			text: line.slice(mark.start, mark.end),
			color: mark.color,
			note: mark.note,
			key: mark.key,
		});
		cursor = mark.end;
	}
	if (cursor < line.length) parts.push({ text: line.slice(cursor) });
	if (parts.length === 0) parts.push({ text: line });
	return parts;
}

/**
 * Read-only answer with phrase-level yellow/red marks (not whole lines).
 * Clicking a phrase still opens the same Perlu diperbaiki card. The answer
 * text itself is not changed.
 */
function AnnotatedAnswer({
	text,
	feedback,
	evidence,
	annotations,
	onEdit,
	contentRef,
}: {
	text: string;
	feedback: string;
	evidence: string;
	annotations: LineAnnotation[];
	onEdit?: () => void;
	contentRef?: React.RefObject<HTMLDivElement | null>;
}) {
	const innerRef = useRef<HTMLDivElement>(null);
	const hardLines = text.split('\n');
	const [rowLines, setRowLines] = useState<number[]>(() => hardLines.map(() => 1));
	const [selected, setSelected] = useState<string | null>(null);
	const marks = useMemo(() => marksFromCheck(text, feedback, evidence), [text, feedback, evidence]);
	const usePhrases = marks.length > 0;

	useLayoutEffect(() => {
		const el = innerRef.current;
		if (!el) return;
		const apply = () => {
			const lh = parseFloat(getComputedStyle(el).lineHeight) || 22.95;
			const counts = Array.from(el.querySelectorAll<HTMLElement>(':scope > .lined-row')).map((row) =>
				Math.max(1, Math.round(row.getBoundingClientRect().height / lh)),
			);
			setRowLines((prev) =>
				prev.length === counts.length && prev.every((n, i) => n === counts[i]) ? prev : counts,
			);
		};
		apply();
		if (typeof ResizeObserver === 'undefined') return;
		const obs = new ResizeObserver(apply);
		obs.observe(el);
		let cancelled = false;
		if (typeof document !== 'undefined' && document.fonts && 'ready' in document.fonts) {
			document.fonts.ready.then(() => {
				if (!cancelled) apply();
			});
		}
		return () => {
			cancelled = true;
			obs.disconnect();
		};
	}, [text, marks, usePhrases]);

	const byLine = useMemo(() => {
		const m = new Map<number, LineAnnotation[]>();
		if (usePhrases) return m;
		const visual = text.split('\n');
		for (const a of annotations) {
			if (a.line < 1 || a.line > visual.length) continue;
			const arr = m.get(a.line) || [];
			arr.push(a);
			m.set(a.line, arr);
		}
		return m;
	}, [annotations, text, usePhrases]);

	const setEl = (el: HTMLDivElement | null) => {
		innerRef.current = el;
		if (contentRef) {
			(contentRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
		}
	};

	const selectedMark = marks.find((mark) => `${mark.start}-${mark.end}` === selected);
	const selectedLine = selectedMark ? text.slice(0, selectedMark.start).split('\n').length : null;
	const notePoints = selectedMark
		? [shortenAdvice(selectedMark.note) || selectedMark.note].filter(Boolean).slice(0, 4)
		: [];
	const noteColor = selectedMark?.color || 'yellow';
	const lineCount = usePhrases ? hardLines.length : text.split('\n').length;

	let offset = 0;
	return (
		<div className="tws-field tws-annotated">
			<div className="tws-annotated-head">
				<span>TULISAN ANDA — dengan catatan AI</span>
				{onEdit && (
					<button type="button" className="ld-outline-action sm" onClick={onEdit}>
						<Pencil size={13} /> Edit tulisan
					</button>
				)}
			</div>
			<div className="lined-box annotated">
				<div className="lined-gutter" aria-hidden>
					{gutterNumbers(lineCount, rowLines).map((n, i) => (
						<span key={`${n}-${i}`}>{n}</span>
					))}
				</div>
				<div className="lined-content" ref={setEl}>
					{(usePhrases ? hardLines : text.split('\n')).map((line, i) => {
						const start = offset;
						offset += line.length + 1;
						if (!usePhrases) {
							const num = i + 1;
							const anns = byLine.get(num);
							const marked = Boolean(anns && anns.length > 0);
							const color = anns?.some((a) => a.color === 'red') ? 'red' : 'yellow';
							return (
								<div key={i} className={`lined-row${marked ? ` marked ${color}` : ''}`}>
									{line || '\u00a0'}
								</div>
							);
						}
						const parts = phraseSegments(line, start, start + line.length, marks);
						return (
							<div key={i} className="lined-row phrase-row">
								{parts.map((part, partIndex) =>
									part.color && part.key ? (
										<mark
											key={part.key + partIndex}
											className={`lined-phrase ${part.color}${selected === part.key ? ' open' : ''}`}
											tabIndex={0}
											onClick={() => setSelected(selected === part.key ? null : part.key || null)}
											onKeyDown={(event) => {
												if (event.key === 'Enter' || event.key === ' ') {
													event.preventDefault();
													setSelected(selected === part.key ? null : part.key || null);
												}
											}}
										>
											{part.text}
										</mark>
									) : (
										<span key={partIndex}>{part.text}</span>
									),
								)}
								{line.length === 0 ? '\u00a0' : null}
							</div>
						);
					})}
				</div>
			</div>
			{notePoints.length > 0 && (
				<div className="tws-annot-detail">
					<div className={`tws-annot-card ${noteColor}`}>
						<div className="tws-annot-tag">
							<em>{noteColor === 'red' ? 'Perlu diperbaiki' : 'Bisa diperbaiki'}</em>
							{selectedLine ? <span>Baris {selectedLine}</span> : null}
						</div>
						<ol className="guide-points">
							{notePoints.map((point, index) => (
								<li key={`${index}-${point}`}>
									<span>{index + 1}</span>
									{point}
								</li>
							))}
						</ol>
					</div>
				</div>
			)}
			<small>
				{usePhrases
					? 'Klik frasa yang ditandai untuk membaca catatan AI.'
					: 'Klik baris yang ditandai untuk membaca catatan AI.'}{' '}
				{onEdit ? 'Pilih Edit tulisan untuk memperbaiki.' : ''}
			</small>
		</div>
	);
}

// ── Multi-question writing ──────────────────────────────────

/** Build a single combined content string for backward-compat consumers
 *  (AI evaluation, Cek jawaban) from per-question answers. Each block is
 *  prefixed with its prompt so the model/lecturer can still reference it. */
function combineQuestionAnswers(
	questions: WritingQuestion[],
	answers: Record<string, string>,
): string {
	const parts: string[] = [];
	questions.forEach((q, i) => {
		const text = (answers[q.id] || '').trim();
		parts.push(`[${i + 1}] ${q.prompt.trim()}\n${text || '(belum dijawab)'}`);
	});
	return parts.join('\n\n');
}

/** Total word count across all question blocks. */
function totalQuestionWords(questions: WritingQuestion[], answers: Record<string, string>): number {
	return questions.reduce((sum, q) => sum + countWords(answers[q.id] || ''), 0);
}

/**
 * Multi-question writing workspace: each configured question block gets its
 * own numbered answer area, with per-block word limits and guidance. Answers
 * are saved together in one submission (`taskAnswers.writing.answers`) and a
 * combined `content` is stored so existing evaluation/feedback flows keep
 * working unchanged. Shared document/photo uploads remain assignment-level.
 */
function MultiQuestionWriting({
	assignment,
	submission,
	onSaved,
	asideChecks,
	reviewing,
}: {
	assignment: Assignment;
	submission: AssignmentSubmission | null;
	onSaved: () => void;
	asideChecks?: boolean;
	reviewing?: boolean;
}) {
	const config = useMemo(() => parseWritingConfig(assignment.taskConfig), [assignment]);
	const saved = useMemo(() => parseTaskAnswers(submission?.taskAnswers), [submission]);
	const questions = config.questions;

	const [answers, setAnswers] = useState<Record<string, string>>(() => {
		const stored = saved?.writing?.answers || {};
		const init: Record<string, string> = {};
		for (const q of questions) init[q.id] = stored[q.id]?.content || '';
		return init;
	});
	const [group, setGroup] = useState(submission?.group || '');
	const [link, setLink] = useState(submission?.link || '');
	const [keptFiles, setKeptFiles] = useState<string[]>(() => {
		const files = submission?.files || [];
		const order = saved?.writing?.imageOrder || [];
		const images = order.filter((f) => files.includes(f));
		const rest = files.filter((f) => !images.includes(f));
		return [...rest, ...images];
	});
	const [newFiles, setNewFiles] = useState<NewFile[]>([]);
	const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
	const [error, setError] = useState('');
	const [fileError, setFileError] = useState('');
	const [progress, setProgress] = useState<UploadProgress | null>(null);
	const docRef = useRef<HTMLInputElement>(null);
	const photoRef = useRef<HTMLInputElement>(null);

	const revision = submission?.status === 'revision';
	const past = isPastDeadline(assignment.deadline);
	const submittedAlready = Boolean(submission && submission.status !== 'draft' && submission.status !== 'revision');
	const canWork = assignment.status === 'published' && (!past || revision) && !submittedAlready;

	const words = totalQuestionWords(questions, answers);
	const combined = combineQuestionAnswers(questions, answers);

	const keptImages = keptFiles.filter(isImageFile);
	const keptDocs = keptFiles.filter((f) => !isImageFile(f));
	const newImages = newFiles.filter((f) => f.isImage);
	const newDocs = newFiles.filter((f) => !f.isImage);

	const setAnswer = (id: string, value: string) => {
		setAnswers((prev) => ({ ...prev, [id]: value }));
	};

	const addFiles = (list: FileList | null, expectImage: boolean) => {
		setFileError('');
		if (!list || list.length === 0) return;
		const next: NewFile[] = [];
		for (const file of Array.from(list)) {
			const vErr = validateFile(file);
			if (vErr) {
				setFileError(vErr);
				return;
			}
			if (expectImage && !file.type.startsWith('image/')) {
				setFileError('Hanya berkas gambar yang dapat diunggah sebagai foto tulisan.');
				return;
			}
			next.push({ file, url: URL.createObjectURL(file), isImage: file.type.startsWith('image/') });
		}
		setNewFiles((prev) => [...prev, ...next].slice(0, 10));
	};

	const moveImage = (filename: string, dir: -1 | 1) => {
		setKeptFiles((prev) => {
			const images = prev.filter(isImageFile);
			const i = images.indexOf(filename);
			const j = i + dir;
			if (i < 0 || j < 0 || j >= images.length) return prev;
			[images[i], images[j]] = [images[j], images[i]];
			return [...prev.filter((f) => !isImageFile(f)), ...images];
		});
	};
	const moveNewImage = (index: number, dir: -1 | 1) => {
		setNewFiles((prev) => {
			const images = prev.filter((f) => f.isImage);
			const i = images.findIndex((f) => f.url === prev.filter((p) => p.isImage)[index]?.url);
			const j = i + dir;
			if (i < 0 || j < 0 || j >= images.length) return prev;
			[images[i], images[j]] = [images[j], images[i]];
			const docs = prev.filter((f) => !f.isImage);
			return [...docs, ...images];
		});
	};

	const save = async (final: boolean) => {
		setError('');
		setFileError('');
		if (
			final &&
			!(await confirmDialog({
				title: 'Kumpulkan tugas?',
				message: 'Kumpulkan seluruh jawaban blok sebagai pengumpulan resmi? Setelah terkirim, Cek jawaban ditutup dan hasil menunggu penilaian dosen.',
				variant: 'default',
				confirmLabel: 'Kumpulkan',
			}))
		) {
			return;
		}
		const hasText = questions.some((q) => answers[q.id]?.trim());
		const hasWork = hasText || newFiles.length > 0 || keptFiles.length > 0 || link.trim();
		if (!hasWork) {
			setError('Isi minimal satu blok jawaban, unggah dokumen/foto, atau tempel tautan sebelum menyimpan.');
			return;
		}
		if (link.trim() && !/^https?:\/\//i.test(link.trim())) {
			setError('Tautan harus dimulai dengan http:// atau https://');
			return;
		}
		setBusy(final ? 'submit' : 'save');
		try {
			const status: SubmissionStatus = final
				? isPastDeadline(assignment.deadline)
					? 'late'
					: 'submitted'
				: 'draft';
			const prevFiles = submission?.files || [];
			const content = combineQuestionAnswers(questions, answers);
			const answerMap: Record<string, { content: string; wordCount: number }> = {};
			for (const q of questions) {
				answerMap[q.id] = { content: (answers[q.id] || '').trim(), wordCount: countWords(answers[q.id] || '') };
			}
			const taskAnswers = {
				...saved,
				writing: {
					imageOrder: keptFiles.filter(isImageFile),
					savedAt: new Date().toISOString(),
					wordCount: words,
					answers: answerMap,
				},
			};
			let record: AssignmentSubmission;

			if (newFiles.length > 0) {
				const fd = new FormData();
				fd.append('content', content);
				fd.append('link', link.trim());
				fd.append('group', group.trim());
				fd.append('status', status);
				fd.append('taskAnswers', JSON.stringify(taskAnswers));
				for (const f of keptFiles) fd.append('files', f);
				for (const f of newFiles) fd.append('files', f.file);
				if (submission) {
					record = await uploadSubmission(fd, { id: submission.id }, setProgress);
				} else {
					fd.append('assignment', assignment.id);
					fd.append('owner', pb.authStore.record?.id || '');
					record = await uploadSubmission(fd, {}, setProgress);
				}
			} else if (submission) {
				record = await pb.collection('assignment_submissions').update<AssignmentSubmission>(submission.id, {
					content,
					link: link.trim(),
					group: group.trim(),
					status,
					taskAnswers,
					...(keptFiles.length !== prevFiles.length || keptFiles.join() !== prevFiles.join()
						? { files: keptFiles }
						: {}),
				});
			} else {
				record = await pb.collection('assignment_submissions').create<AssignmentSubmission>({
					assignment: assignment.id,
					owner: pb.authStore.record?.id,
					content,
					link: link.trim(),
					group: group.trim(),
					status,
					taskAnswers,
				});
			}

			// Persist the final image order once uploaded filenames are known.
			const finalFiles = record.files || [];
			const newFinals = finalFiles.filter((f) => !prevFiles.includes(f));
			const imageOrder = [
				...keptFiles.filter(isImageFile).filter((f) => finalFiles.includes(f)),
				...newFinals.filter(isImageFile),
			];
			if (imageOrder.length > 0 || newFiles.length > 0) {
				await pb.collection('assignment_submissions').update(record.id, {
					taskAnswers: {
						...taskAnswers,
						writing: { ...taskAnswers.writing!, imageOrder },
					},
				});
			}

			invalidate('assignment_submissions');
			setNewFiles([]);
			if (final) void requestEvaluationDraft(record.id);
			onSaved();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(null);
			setProgress(null);
		}
	};

	if (submittedAlready) {
		return (
			<div className="tws-done">
				<div className="tws-done-head">
					<CheckCircle2 size={16} />
					<strong>Pekerjaan sudah dikumpulkan</strong>
				</div>
				<p>
					{words > 0 && `${words} kata tersimpan. `}
					{revision
						? 'Dosen meminta revisi — perbarui jawaban Anda lalu kumpulkan ulang.'
						: 'Menunggu penilaian dosen.'}
				</p>
			</div>
		);
	}
	if (!canWork) {
		return (
			<p className="asg-empty-line overdue">Batas waktu pengumpulan sudah terlewat. Pengumpulan tidak dapat diubah.</p>
		);
	}

	return (
		<div className={`tws-workspace tws-writing tws-writing-multi${reviewing ? ' reviewing' : ''}${asideChecks ? ' ws-compose' : ''}`}>
			{config.prompt && !asideChecks && <p className="tws-prompt">{config.prompt}</p>}
			<div className="tws-meta">
				{config.language && <span className="tws-chip">Bahasa: {config.language}</span>}
				<span className="tws-chip">{words} kata total</span>
			</div>
			{config.formatGuidance && !asideChecks && <p className="tws-guidance">{config.formatGuidance}</p>}

			{asideChecks && !reviewing && (
				<div className="ws-compose-head">
					<h2>
						<Pencil size={16} /> Tulisan Anda
					</h2>
					<div className="ws-compose-meta">
						{config.language && <span>Bahasa: {config.language}</span>}
						<span>{words} kata</span>
					</div>
				</div>
			)}

			{assignment.mode === 'collaborative' && (
				<label className="tws-field">
					Nama kelompok
					<input
						maxLength={200}
						value={group}
						onChange={(e) => setGroup(e.target.value)}
						placeholder="mis. Kelompok 3"
					/>
				</label>
			)}

			<ol className="tws-qblocks">
				{questions.map((q, i) => {
					const value = answers[q.id] || '';
					const w = countWords(value);
					const minW = q.minWords || config.minWords;
					const maxW = q.maxWords || config.maxWords;
					const hint =
						minW > 0 || maxW > 0
							? `${w} kata${minW > 0 ? ` · minimal ${minW}` : ''}${maxW > 0 ? ` · maksimal ${maxW}` : ''}`
							: `${w} kata`;
					const warn =
						(minW > 0 && w < minW) || (maxW > 0 && w > maxW);
					return (
						<li key={q.id} className="tws-qblock">
							<div className="tws-qblock-head">
								<span className="tws-qblock-num">{i + 1}</span>
								<div>
									<strong>{q.prompt}</strong>
									{q.guidance && <small>{q.guidance}</small>}
								</div>
							</div>
							{config.allowText && !reviewing && (
								<label className="tws-field">
									JAWABAN ANDA — BLOK {i + 1}
									<textarea
										rows={6}
										maxLength={100000}
										value={value}
										onChange={(e) => setAnswer(q.id, e.target.value)}
										placeholder={`Tulis jawaban untuk pertanyaan ${i + 1} di sini…`}
										aria-label={`Jawaban pertanyaan ${i + 1}`}
									/>
									<small className={warn ? 'warn' : ''}>{hint}</small>
								</label>
							)}
							{config.allowText && reviewing && (
								<div className="tws-qblock-readout">
									{value.trim() ? (
										<p className="tsr-text">{value}</p>
									) : (
										<p className="asg-empty-line">Belum dijawab.</p>
									)}
									<small>{hint}</small>
								</div>
							)}
						</li>
					);
				})}
			</ol>

			{config.allowDocument && (
				<div className="tws-upload">
					<input
						ref={docRef}
						type="file"
						className="pdf-file-input"
						multiple
						accept={ACCEPTED_MIME}
						onChange={(e) => {
							addFiles(e.target.files, false);
							e.target.value = '';
						}}
					/>
					<button type="button" className="pdf-dropzone" onClick={() => docRef.current?.click()}>
						<span className="pdf-dropzone-icon">
							<UploadCloud size={24} />
						</span>
						<strong>Unggah dokumen (PDF/DOCX/dll.)</strong>
						<span className="pdf-dropzone-hint">Maks 10 berkas @ 100 MB</span>
					</button>
				</div>
			)}

			{config.allowPhotos && (
				<div className="tws-upload">
					<input
						ref={photoRef}
						type="file"
						className="pdf-file-input"
						multiple
						accept="image/*"
						capture="environment"
						onChange={(e) => {
							addFiles(e.target.files, true);
							e.target.value = '';
						}}
					/>
					<div className="tws-photo-actions">
						<button type="button" className="ld-outline-action sm" onClick={() => photoRef.current?.click()}>
							<Camera size={14} /> Foto / unggah tulisan tangan
						</button>
						<span className="tws-photo-hint">Foto dapat dipratinjau dan diurutkan.</span>
					</div>
				</div>
			)}

			{(keptDocs.length > 0 || newDocs.length > 0) && (
				<div className="tws-docs">
					{keptDocs.map((f) => (
						<span key={f} className="asg-file-chip">
							<FileUp size={11} /> {f}
							<button
								type="button"
								aria-label={`Hapus ${f}`}
								onClick={() => setKeptFiles((prev) => prev.filter((x) => x !== f))}
							>
								<X size={12} />
							</button>
						</span>
					))}
					{newDocs.map((nf) => (
						<span key={nf.url} className="asg-file-chip">
							<FileUp size={11} /> {nf.file.name}
							<button
								type="button"
								aria-label={`Hapus ${nf.file.name}`}
								onClick={() => setNewFiles((prev) => prev.filter((p) => p.url !== nf.url))}
							>
								<X size={12} />
							</button>
						</span>
					))}
				</div>
			)}

			{(keptImages.length > 0 || newImages.length > 0) && (
				<div className="tws-photos">
					<span className="tws-photos-label">Foto tulisan tangan ({keptImages.length + newImages.length})</span>
					<ol className="tws-photo-list">
						{keptImages.map((f, i) => (
							<li key={f} className="tws-photo">
								<img src={submissionFileUrl(submission!, f)} alt={`Foto tulisan ${i + 1}`} loading="lazy" />
								<div className="tws-photo-tools">
									<button type="button" aria-label={`Geser kiri foto ${i + 1}`} disabled={i === 0} onClick={() => moveImage(f, -1)}>
										<ArrowLeft size={13} />
									</button>
									<span>{i + 1}</span>
									<button
										type="button"
										aria-label={`Geser kanan foto ${i + 1}`}
										disabled={i === keptImages.length - 1 && newImages.length === 0}
										onClick={() => moveImage(f, 1)}
									>
										<ArrowRight size={13} />
									</button>
									<button type="button" aria-label={`Hapus foto ${i + 1}`} className="danger" onClick={() => setKeptFiles((prev) => prev.filter((x) => x !== f))}>
										<Trash2 size={13} />
									</button>
								</div>
							</li>
						))}
						{newImages.map((nf, i) => (
							<li key={nf.url} className="tws-photo">
								<img src={nf.url} alt={`Foto baru ${i + 1}`} />
								<div className="tws-photo-tools">
									<button
										type="button"
										aria-label={`Geser kiri foto baru ${i + 1}`}
										disabled={keptImages.length === 0 && i === 0}
										onClick={() => moveNewImage(i, -1)}
									>
										<ArrowLeft size={13} />
									</button>
									<span>{keptImages.length + i + 1}</span>
									<button
										type="button"
										aria-label={`Geser kanan foto baru ${i + 1}`}
										disabled={i === newImages.length - 1}
										onClick={() => moveNewImage(i, 1)}
									>
										<ArrowRight size={13} />
									</button>
									<button
										type="button"
										aria-label={`Hapus foto baru ${i + 1}`}
										className="danger"
										onClick={() => setNewFiles((prev) => prev.filter((p) => p.url !== nf.url))}
									>
										<Trash2 size={13} />
									</button>
								</div>
							</li>
						))}
					</ol>
				</div>
			)}

			{fileError && (
				<p className="form-error" role="alert">
					{fileError}
				</p>
			)}
			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
			{progress && (
				<div className="res-progress" aria-live="polite">
					<div className="res-progress-bar">
						<span style={{ width: `${progress.percent}%` }} />
					</div>
					<em>Mengunggah {progress.percent}%</em>
				</div>
			)}

			<div className="tws-actions">
				<button type="button" className="ld-outline-action sm" onClick={() => void save(false)} disabled={busy !== null}>
					{busy === 'save' ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />} {asideChecks ? 'Simpan sebagai draft' : 'Simpan draf'}
				</button>
				<button type="button" className="ld-btn-primary" onClick={() => void save(true)} disabled={busy !== null}>
					{busy === 'submit' ? (
						<>
							<LoaderCircle size={15} className="spin" /> Mengumpulkan...
						</>
					) : (
						<>
							<Send size={15} /> {asideChecks ? 'Kirim jawaban' : 'Kumpulkan pekerjaan'}
						</>
					)}
				</button>
			</div>
			<ReviewSlot aside={asideChecks}>
				<CheckAnswerPanel
					assignment={assignment}
					channel="enrolled"
					buildResponse={() => ({
						kind: 'writing',
						content: combined,
						link,
						wordCount: words,
					})}
					buildNumberedContent={() => ''}
					onApplyOcrText={() => {
						/* OCR applies to a single text block; multi-question uses per-block editors */
					}}
					onLatestFeedback={() => {
						/* inline annotations are single-block only */
					}}
				/>
			</ReviewSlot>
		</div>
	);
}
