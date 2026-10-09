import { useEffect, useMemo, useState } from 'react';
import {
	BookOpenText,
	Check,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	FileUp,
	LoaderCircle,
	RefreshCw,
	Sparkles,
	X,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import { errorMessage } from '@/lib/learning';
import type {
	ClassSession,
	ContextSuggestionKind,
	ContextSuggestionRecord,
	Course,
	Cpmk,
	FileAccess,
	FileContextRecord,
	FileExtractionRecord,
	FileLibraryRecord,
	SubCpmk,
} from '@/lib/learning';
import {
	ACCESS_HINTS,
	ACCESS_LABELS,
	EXTRACTION_STATUS_LABELS,
	FILE_KIND_LABELS,
	FILE_LIBRARY_MIME_TYPES,
	fileKindFor,
	formatBytes,
	processLibraryFile,
	snapshotLibraryFile,
	validateLibraryFile,
	type ProcessingState,
} from '@/lib/file-library';
import {
	LANGUAGE_LABELS,
	PARSE_MAX_SIZE,
	detectLanguage,
	isClientTextFile,
	matchCourseFromFilename,
} from '@/lib/file-metadata';
import { FormStepper } from '@/components/form-stepper';
import {
	applyContextSuggestion,
	fetchContextSuggestions,
	generateContextSuggestions,
	reviewContextSuggestion,
} from '@/lib/context-suggestions-client';
import { AppModal } from '@/components/app/app-modal';

const WIZARD_STEPS = [
	{ id: 1, short: 'Unggah', label: 'Unggah berkas' },
	{ id: 2, short: 'Mata kuliah', label: 'Pilih mata kuliah & detail' },
	{ id: 3, short: 'Penguraian AI', label: 'Penguraian AI' },
	{ id: 4, short: 'Konteks', label: 'Pilih konteks akademik' },
];

const SUGGESTION_KIND_LABELS: Record<ContextSuggestionKind, string> = {
	language: 'Bahasa',
	topics: 'Topik',
	section: 'Bagian konten',
	course: 'Tautan mata kuliah',
	session: 'Tautan sesi',
};

const CONTEXT_LANGUAGE_LABELS: Record<string, string> = {
	...LANGUAGE_LABELS,
	other: 'Lainnya',
};
const ACCESS_OPTIONS: FileAccess[] = ['faculty', 'student'];

/**
 * Lecturer-only step-by-step dialog to upload a new library file or edit an
 * existing one. Mirrors the RPS builder's visible progress: Unggah → Pilih
 * mata kuliah & detail → Penguraian AI → Pilih konteks.
 *
 * The record is persisted at the end of step 2 (so steps 3–4 have a real
 * `fileId` to process and ground suggestions in). Step 3 parses the document
 * once and stores the extracted text for reuse — an unchanged file is never
 * re-parsed. Step 4 generates evidence-grounded academic-context suggestions
 * from the extracted text and lets the lecturer approve/reject each; only
 * approved suggestions feed the confirmed context stores that downstream Tugas
 * AI references. Saves through the `file_library` collection rules, which
 * enforce owner-only writes, faculty-only creation, and a required mata kuliah.
 */
export function FileUploadDialog({
	record,
	courses,
	cpmks,
	subCpmks,
	sessions,
	onClose,
	onSaved,
}: {
	record?: FileLibraryRecord | null;
	courses: Course[];
	cpmks: Cpmk[];
	subCpmks: SubCpmk[];
	sessions: ClassSession[];
	onClose: () => void;
	onSaved: () => void;
}) {
	const editing = Boolean(record);
	const me = pb.authStore.record?.id || '';
	const [step, setStep] = useState(1);
	const [title, setTitle] = useState(record?.title ?? '');
	const [description, setDescription] = useState(record?.description ?? '');
	const [access, setAccess] = useState<FileAccess>(record?.access ?? 'faculty');
	const [courseId, setCourseId] = useState(record?.course ?? '');
	const [cpmkId, setCpmkId] = useState(record?.cpmk || subCpmks.find((item) => item.id === record?.subCpmk)?.cpmk || '');
	const [subCpmkId, setSubCpmkId] = useState(record?.subCpmk ?? '');
	const [sessionId, setSessionId] = useState(record?.session ?? '');
	const [file, setFile] = useState<File | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [parsing, setParsing] = useState(false);
	const [parseNote, setParseNote] = useState('');
	const [parseOk, setParseOk] = useState(false);

	// Persisted record id — set from the existing record or after step 2 save.
	const [savedId, setSavedId] = useState(record?.id ?? '');
	// True once a create/update actually wrote to PocketBase, so closing the
	// dialog afterwards refreshes the library list instead of dropping the row.
	const [saved, setSaved] = useState(false);
	// Step 3 — extraction state.
	const [extraction, setExtraction] = useState<FileExtractionRecord | null>(null);
	const [processing, setProcessing] = useState(false);
	const [processError, setProcessError] = useState('');
	// Step 4 — suggestion state.
	const [suggestions, setSuggestions] = useState<ContextSuggestionRecord[]>([]);
	const [context, setContext] = useState<FileContextRecord | null>(null);
	const [sectionsCount, setSectionsCount] = useState(0);
	const [generating, setGenerating] = useState(false);
	const [suggestError, setSuggestError] = useState('');
	const [suggestNote, setSuggestNote] = useState('');
	const [busyId, setBusyId] = useState('');

	const courseCpmks = useMemo(
		() => (courseId ? cpmks.filter((c) => c.course === courseId) : []),
		[cpmks, courseId],
	);
	const courseSubCpmks = useMemo(
		() => (courseId && cpmkId ? subCpmks.filter((c) => c.course === courseId && c.cpmk === cpmkId) : []),
		[subCpmks, courseId, cpmkId],
	);
	const courseSessions = useMemo(
		() => (courseId ? sessions.filter((s) => s.course === courseId).sort((a, b) => a.week - b.week || a.created.localeCompare(b.created)) : []),
		[sessions, courseId],
	);

	const pickCourse = (value: string) => {
		setCourseId(value);
		setError('');
		if (value && cpmkId && !cpmks.some((c) => c.id === cpmkId && c.course === value)) {
			setCpmkId('');
		}
		if (value && subCpmkId && !subCpmks.some((c) => c.id === subCpmkId && c.course === value)) {
			setSubCpmkId('');
		}
		if (value && sessionId && !sessions.some((s) => s.id === sessionId && s.course === value)) {
			setSessionId('');
		}
	};
	const pickCpmk = (value: string) => {
		setCpmkId(value);
		if (subCpmkId && subCpmks.find((item) => item.id === subCpmkId)?.cpmk !== value) {
			setSubCpmkId('');
		}
	};
	const pickSubCpmk = (value: string) => {
		setSubCpmkId(value);
		if (value) setCpmkId(subCpmks.find((item) => item.id === value)?.cpmk ?? '');
	};

	/** Best-effort metadata analysis after a file is picked (step 1). */
	const analyze = async (picked: File) => {
		setParsing(true);
		setParseNote('');
		setParseOk(false);
		try {
			const kind = fileKindFor(picked.name);
			let text = '';
			let pages = 0;

			if (picked.type === 'application/pdf' && picked.size <= PARSE_MAX_SIZE) {
				try {
					const fd = new FormData();
					fd.append('file', picked);
					const res = await fetch('/api/berkas-parse', { method: 'POST', body: fd });
					const data = (await res.json()) as { ok?: boolean; text?: string; pages?: number };
					if (res.ok && data.ok) {
						text = data.text || '';
						pages = data.pages || 0;
					}
				} catch {
					// Best-effort only — ignore and continue with filename metadata.
				}
			} else if (isClientTextFile(picked)) {
				try {
					text = (await picked.text()).slice(0, 20000);
				} catch {
					// Ignore — manual fill remains available.
				}
			}

			const language = detectLanguage(text);
			const notes: string[] = [FILE_KIND_LABELS[kind]];
			if (pages > 0) notes.push(`${pages} halaman`);
			if (language) notes.push(`Bahasa ${LANGUAGE_LABELS[language]}`);

			const matched = matchCourseFromFilename(picked.name, courses);
			if (matched) {
				setCourseId((current) => current || matched.id);
				notes.push(`Mata kuliah dikenali: ${matched.title}`);
			}

			setDescription((current) => current.trim() || `${notes.slice(0, 3).join(' · ')}.`);

			const hasText = Boolean(text.trim());
			setParseOk(hasText || Boolean(matched));
			setParseNote(
				hasText
					? `Metadata terisi otomatis: ${notes.join(' · ')}. Periksa dan lengkapi bila perlu.`
					: `Metadata dasar terisi (${FILE_KIND_LABELS[kind]}). Teks tidak dapat diurai dari berkas ini — lengkapi detail secara manual bila perlu.`,
			);
		} finally {
			setParsing(false);
		}
	};

	const pick = (picked: File | null) => {
		setError('');
		setParseNote('');
		setParseOk(false);
		if (!picked) return;
		const problem = validateLibraryFile(picked);
		if (problem) {
			setError(problem);
			return;
		}
		setFile(picked);
		setTitle((current) => current.trim() || picked.name.replace(/\.[^.]+$/, ''));
		void analyze(picked);
	};

	/** Step 2 → persists the file_library record (create/update) so steps 3–4
	 *  have a real fileId to process and ground suggestions in. */
	const persistRecord = async () => {
		if (!title.trim()) {
			setError('Judul wajib diisi.');
			return;
		}
		if (!courseId) {
			setError('Pilih mata kuliah untuk menautkan berkas.');
			return;
		}
		if (!editing && !file) {
			setError('Pilih berkas untuk diunggah pada langkah sebelumnya.');
			return;
		}
		setBusy(true);
		setError('');
		try {
			let id = record?.id ?? '';
			if (file) {
				const fd = new FormData();
				fd.append('title', title.trim());
				fd.append('description', description.trim());
				fd.append('access', access);
				fd.append('status', 'processing');
				fd.append('size', String(file.size));
				fd.append('course', courseId);
				fd.append('cpmk', cpmkId);
				fd.append('subCpmk', subCpmkId);
				fd.append('session', sessionId);
				fd.append('file', file);
				if (editing && record) {
					const newVersion = await snapshotLibraryFile(record.id);
					fd.append('version', String(newVersion));
					await pb.collection('file_library').update(record.id, fd);
					id = record.id;
					if (record.restoredFrom) {
						await pb.collection('file_library').update(record.id, { restoredFrom: null });
					}
				} else {
					fd.append('owner', me);
					// version is required (min 1). The first upload is always
					// version 1; later replacements snapshot first and pass the
					// next version explicitly (see the editing branch above).
					fd.append('version', '1');
					const created = (await pb
						.collection('file_library')
						.create(fd)) as FileLibraryRecord;
					id = created.id;
				}
			} else if (record) {
				await pb.collection('file_library').update(record.id, {
					title: title.trim(),
					description: description.trim(),
					access,
					course: courseId,
					cpmk: cpmkId,
					subCpmk: subCpmkId,
					session: sessionId,
				});
				id = record.id;
			}
			setSavedId(id);
			setSaved(true);
			invalidate('file_library');
			setBusy(false);
			setStep(3);
		} catch (err) {
			setError(errorMessage(err));
			setBusy(false);
		}
	};

	/** Step 3 — load the stored extraction (if any) for the saved record. */
	const loadExtraction = async (id: string) => {
		try {
			const rows = await pb
				.collection('file_extractions')
				.getFullList<FileExtractionRecord>({ filter: `file = "${id}"` });
			setExtraction(rows[0] ?? null);
		} catch {
			setExtraction(null);
		}
	};

	const runProcess = async (force: boolean) => {
		if (!savedId) return;
		setProcessing(true);
		setProcessError('');
		try {
			await processLibraryFile(savedId, force);
			invalidate('file_extractions');
			invalidate('file_library');
			await loadExtraction(savedId);
		} catch (err) {
			setProcessError(errorMessage(err));
		} finally {
			setProcessing(false);
		}
	};

	/** Step 4 — load existing suggestions, context, and section count. */
	const loadContextState = async (id: string) => {
		try {
			const [sugs, ctxRows, sectRows] = await Promise.all([
				fetchContextSuggestions(id),
				pb
					.collection('file_contexts')
					.getFullList<FileContextRecord>({ filter: `file = "${id}"` })
					.catch(() => [] as FileContextRecord[]),
				pb
					.collection('context_sections')
					.getFullList({ filter: `file = "${id}"` })
					.catch(() => [] as { id: string }[]),
			]);
			setSuggestions(sugs);
			setContext(ctxRows[0] ?? null);
			setSectionsCount(sectRows.length);
		} catch {
			setSuggestions([]);
		}
	};

	const runSuggest = async () => {
		if (!savedId) return;
		setGenerating(true);
		setSuggestError('');
		setSuggestNote('');
		try {
			const result = await generateContextSuggestions(savedId);
			if (!result.ok) {
				setSuggestError(result.reason);
			} else {
				const count = result.suggestions.length;
				setSuggestNote(
					count > 0
						? `${count} saran konteks dibuat dari teks hasil penguraian. Tinjau dan setujui masing-masing.`
						: 'Teks tidak memberikan cukup bukti untuk saran otomatis. Anda dapat mengelola konteks lengkap di halaman konteks berkas.',
				);
			}
			invalidate('context_suggestions');
			await loadContextState(savedId);
		} catch (err) {
			setSuggestError(errorMessage(err));
		} finally {
			setGenerating(false);
		}
	};

	const approveSuggestion = async (row: ContextSuggestionRecord) => {
		if (!savedId) return;
		setBusyId(`sug-${row.id}`);
		setSuggestError('');
		try {
			const result = await applyContextSuggestion(row, {
				fileId: savedId,
				ownerId: me,
				version: extraction?.version || record?.version || 1,
				context,
				sectionsCount,
			});
			if (result.changedContext) {
				setContext(result.context);
				invalidate('file_contexts');
			}
			if (result.changedSections) {
				setSectionsCount((n) => n + 1);
				invalidate('context_sections');
			}
			if (result.changedFile) {
				invalidate('file_library');
			}
			invalidate('context_suggestions');
			await loadContextState(savedId);
		} catch (err) {
			setSuggestError(errorMessage(err));
		} finally {
			setBusyId('');
		}
	};

	const rejectSuggestion = async (row: ContextSuggestionRecord) => {
		setBusyId(`sug-${row.id}`);
		setSuggestError('');
		try {
			await reviewContextSuggestion(row.id, 'rejected');
			invalidate('context_suggestions');
			await loadContextState(savedId);
		} catch (err) {
			setSuggestError(errorMessage(err));
		} finally {
			setBusyId('');
		}
	};

	// Load step-specific data when entering steps 3 and 4.
	useEffect(() => {
		if (step !== 3 || !savedId) return;
		let ignore = false;
		void (async () => {
			let existing: FileExtractionRecord | null = null;
			try {
				const rows = await pb
					.collection('file_extractions')
					.getFullList<FileExtractionRecord>({ filter: `file = "${savedId}"` });
				existing = rows[0] ?? null;
			} catch {
				existing = null;
			}
			if (ignore) return;
			setExtraction(existing);
			// Auto-process a freshly uploaded file with no extraction yet.
			if (!existing) await runProcess(false);
		})();
		return () => {
			ignore = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [step, savedId]);

	useEffect(() => {
		if (step === 4 && savedId) {
			void loadContextState(savedId);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [step, savedId]);

	const hasUsableText = Boolean(extraction?.extractedText?.trim());
	const pendingSuggestions = suggestions.filter((s) => s.review === 'pending');
	const reviewedSuggestions = suggestions.filter((s) => s.review !== 'pending');

	const canAdvance =
		step === 1
			? Boolean(file) || editing
			: step === 2
				? Boolean(title.trim() && courseId)
				: true;

	const goNext = () => {
		setError('');
		if (step === 2) {
			void persistRecord();
			return;
		}
		setStep((s) => Math.min(4, s + 1));
	};

	const goBack = () => {
		setError('');
		setStep((s) => Math.max(1, s - 1));
	};

	const finish = () => {
		onSaved();
	};

	const cancel = () => {
		// If a record was already persisted, refresh the list on close so the
		// new/edited file appears instead of leaving a stale view behind.
		if (saved) onSaved();
		else onClose();
	};

	const stepHint =
		step === 1
			? 'Pilih berkas untuk diunggah — dokumen, gambar, audio, atau video. Metadata dasar diisi otomatis setelah berkas dipilih.'
			: step === 2
				? 'Tautkan berkas ke mata kuliah (wajib) dan lengkapi detail. Berkas disimpan saat Anda melanjutkan ke penguraian AI.'
				: step === 3
					? 'Dokumen diurai satu kali dan teks tersimpan untuk landasan AI. Berkas yang tidak berubah tidak diurai ulang.'
					: 'AI mengusulkan tag konteks dari teks hasil penguraian. Setujui saran untuk menerapkannya ke konteks AI, atau tolak. Hanya saran yang disetujui yang dipakai.';

	return (
		<AppModal open onClose={cancel} title={editing ? 'Ubah berkas' : 'Unggah berkas baru'} className="flb-wizard">
			<div className="modal-top">
					<span>MANAJEMEN BERKAS / {editing ? 'UBAH' : 'UNGGAH'}</span>
					<button type="button" aria-label="Tutup" onClick={cancel} disabled={busy}>
						<X size={16} />
					</button>
				</div>
				<h2 id="flb-dialog-title">{editing ? 'Ubah berkas' : 'Unggah berkas baru'}</h2>

				<FormStepper
					ariaLabel="Langkah unggah berkas"
					current={step}
					steps={WIZARD_STEPS.map((s) => ({ id: s.id, label: s.short }))}
					canSelect={(id) => id < step}
					onSelect={setStep}
				/>
				<p className="flb-wizard-hint">{stepHint}</p>

				{error && (
					<div className="form-error" role="alert">
						{error}
					</div>
				)}

				<div className="flb-wizard-body">
					{step === 1 && (
						<div className="flb-form">
							<label>
								Pilih berkas {editing ? '(opsional untuk diganti)' : ''}
								<span className="flb-file-label">
									<FileUp size={16} />
									{file ? 'Ganti berkas' : editing ? 'Pilih berkas baru' : 'Pilih berkas'}
									<input
										type="file"
										accept={FILE_LIBRARY_MIME_TYPES.join(',')}
										onChange={(e) => pick(e.target.files?.[0] ?? null)}
										disabled={busy || parsing}
									/>
								</span>
								{file ? (
									<>
										<small className="flb-file-info">
											{file.name} · {formatBytes(file.size)}
										</small>
										{editing ? (
											<small className="flb-file-info">
												Mengganti berkas otomatis menyimpan versi lama ke riwayat versi —
												beserta metadata penguraiannya — dan dapat dipulihkan kapan saja.
											</small>
										) : null}
									</>
								) : editing && record?.file ? (
									<small className="flb-file-info">Berkas saat ini: {record.file}</small>
								) : (
									<small className="flb-file-info">
										Maks. 500 MB — dokumen, gambar, audio, atau video. Metadata diisi
										otomatis setelah berkas dipilih.
									</small>
								)}
							</label>

							{parsing ? (
								<div className="flb-parse-status" role="status">
									<LoaderCircle size={15} className="spin" />
									Menganalisis berkas dan mengisi metadata otomatis...
								</div>
							) : parseNote ? (
								<div className={`flb-parse-status${parseOk ? ' ok' : ''}`} role="status">
									{parseOk ? <CheckCircle2 size={15} /> : <Sparkles size={15} />}
									{parseNote}
								</div>
							) : null}
						</div>
					)}

					{step === 2 && (
						<div className="flb-form">
			<div className="flb-form-pair">
				<label>
					<span>Mata kuliah <span className="flb-required">*</span></span>
									<select
										value={courseId}
										onChange={(e) => pickCourse(e.target.value)}
										disabled={busy}
										aria-required="true"
									>
										<option value="">Pilih mata kuliah...</option>
										{courses.map((course) => (
											<option key={course.id} value={course.id}>
												{course.title}
												{course.code ? ` (${course.code})` : ''}
											</option>
										))}
									</select>
									<small className="flb-file-info">
										Wajib — berkas harus ditautkan ke mata kuliah Anda.
									</small>
								</label>
				<label>
					Sesi (opsional)
					<select
						value={sessionId}
						onChange={(e) => setSessionId(e.target.value)}
						disabled={busy || !courseId}
					>
						<option value="">{courseId ? 'Tidak ditautkan' : 'Pilih mata kuliah terlebih dahulu'}</option>
						{courseSessions.map((session) => (
											<option key={session.id} value={session.id}>
												Minggu {session.week} — {session.title}
						</option>
						))}
					</select>
					<small className="flb-file-info">Daftar mengikuti tab Pertemuan pada mata kuliah yang dipilih.</small>
				</label>
							</div>
							<label>
								Judul berkas
								<input
									type="text"
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									placeholder="Mis. Modul 1 — Pengantar Statistik"
									disabled={busy}
									maxLength={200}
								/>
							</label>
							<label>
								Deskripsi (opsional)
								<textarea
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder="Catatan singkat tentang isi berkas ini"
									disabled={busy}
									maxLength={2000}
									rows={3}
								/>
							</label>
							<div className="flb-form-pair">
								<label>
									CPMK (opsional)
					<select
						value={cpmkId}
						onChange={(e) => pickCpmk(e.target.value)}
						disabled={busy || !courseId}
									>
										<option value="">Tidak ditautkan</option>
										{courseCpmks.map((item) => (
											<option key={item.id} value={item.id}>
												{item.code || 'Tanpa kode'} — {item.description.slice(0, 60)}
											</option>
										))}
									</select>
								</label>
								<label>
									Sub-CPMK (opsional)
					<select
						value={subCpmkId}
						onChange={(e) => pickSubCpmk(e.target.value)}
						disabled={busy || !cpmkId}
					>
						<option value="">{cpmkId ? 'Tidak ditautkan' : 'Pilih CPMK terlebih dahulu'}</option>
										{courseSubCpmks.map((item) => (
											<option key={item.id} value={item.id}>
												{item.code || 'Tanpa kode'} — {item.description.slice(0, 60)}
											</option>
										))}
									</select>
								</label>
							</div>
							<label>
								Akses
								<select
									value={access}
									onChange={(e) => setAccess(e.target.value as FileAccess)}
									disabled={busy}
								>
									{ACCESS_OPTIONS.map((value) => (
										<option key={value} value={value}>
											{ACCESS_LABELS[value]}
										</option>
									))}
								</select>
								<small className="flb-file-info">{ACCESS_HINTS[access]}</small>
							</label>
						</div>
					)}

					{step === 3 && (
						<div className="flb-wizard-step">
							{processing ? (
								<div className="flb-parse-status" role="status">
									<LoaderCircle size={15} className="spin" />
									Memproses dokumen dan mengurai teks...
								</div>
							) : processError ? (
								<div className="form-error" role="alert">
									{processError}
								</div>
							) : null}

							{extraction ? (
								<div className="fcx-panel">
									<div className="fcx-panel-head">
										<h3>Hasil penguraian</h3>
										<span className={`flb-badge proc-${extraction.status}`}>
											{EXTRACTION_STATUS_LABELS[extraction.status as ProcessingState]}
										</span>
									</div>
									<div className="fcx-meta">
										{extraction.language ? (
											<span className="flb-chip">
												Bahasa {CONTEXT_LANGUAGE_LABELS[extraction.language] ?? extraction.language}
											</span>
										) : null}
										{extraction.pages ? (
											<span className="flb-chip">{extraction.pages} halaman</span>
										) : null}
										{extraction.chars ? (
											<span className="flb-chip">
												{extraction.chars.toLocaleString('id-ID')} karakter teks
											</span>
										) : null}
										{extraction.parserVersion ? (
											<span className="flb-chip">Parser {extraction.parserVersion}</span>
										) : null}
									</div>
									{extraction.failureReason ? (
										<p className={`fcx-note${extraction.status === 'failed' ? ' bad' : ''}`}>
											{extraction.failureReason}
										</p>
									) : null}
									{hasUsableText ? (
										<details className="fcx-text-fold">
											<summary>Tinjau teks hasil penguraian</summary>
											<div className="fcx-text-pages">
												<div className="fcx-text-page">
													<p>{extraction.extractedText.slice(0, 4000)}</p>
												</div>
											</div>
										</details>
									) : null}
									<div className="fcx-row-actions">
										<button
											type="button"
											className="ld-text-btn"
											onClick={() => void runProcess(true)}
											disabled={processing}
										>
											{processing ? (
												<LoaderCircle size={15} className="spin" />
											) : (
												<RefreshCw size={15} strokeWidth={1.75} />
											)}
											Proses ulang dokumen
										</button>
									</div>
								</div>
							) : !processing ? (
								<div className="fcx-panel">
									<p className="fcx-note">
										Berkas belum diproses. Klik proses untuk mengurai teks dokumen —
										teks tersimpan untuk landasan AI pada langkah berikutnya.
									</p>
									<div className="fcx-row-actions">
										<button
											type="button"
											className="ld-btn-primary"
											onClick={() => void runProcess(false)}
											disabled={processing}
										>
											{processing ? (
												<LoaderCircle size={16} className="spin" />
											) : (
												<Sparkles size={16} strokeWidth={1.75} />
											)}
											Proses dokumen
										</button>
									</div>
								</div>
							) : null}

							{!hasUsableText && extraction && !processing ? (
								<p className="fcx-note">
									Teks tidak dapat diurai dari berkas ini (mis. gambar/audio/video, atau PDF
									hasil pindaian). Anda tetap dapat melanjutkan — saran konteks otomatis
									tidak tersedia, tetapi berkas tersimpan dan dapat dikelola di halaman
									konteks berkas.
								</p>
							) : null}
						</div>
					)}

					{step === 4 && (
						<div className="flb-wizard-step">
							<div className="fcx-panel fcx-suggest">
								<div className="fcx-panel-head">
									<h3>
										<Sparkles size={15} strokeWidth={1.75} aria-hidden /> Saran konteks otomatis
									</h3>
									<span className="flb-chip">{pendingSuggestions.length} menunggu</span>
								</div>
								<p className="fcx-note">
									Asisten AI membaca teks hasil penguraian dan mengusulkan tag konteks
									akademik berdasarkan bukti pada teks. Setujui saran untuk menerapkannya ke
									konteks AI, atau tolak. Hanya saran yang disetujui yang dipakai untuk
									penautan akademik dan landasan AI Tugas.
								</p>
								{!hasUsableText ? (
									<p className="fcx-note">
										{extraction?.status === 'failed'
											? 'Teks otomatis tidak dapat diurai dari berkas ini, jadi saran otomatis tidak tersedia.'
											: 'Berkas belum memiliki teks hasil penguraian — proses dokumen pada langkah sebelumnya agar saran konteks dapat dibuat.'}
									</p>
								) : null}
								{suggestError ? (
									<p className="fcx-note bad" role="alert">
										{suggestError}
									</p>
								) : null}
								{suggestNote ? <p className="fcx-ok">{suggestNote}</p> : null}
								<div className="fcx-row-actions">
									<button
										type="button"
										className="ld-btn-primary"
										onClick={() => void runSuggest()}
										disabled={generating || !hasUsableText}
										title={
											!hasUsableText
												? 'Proses dokumen terlebih dahulu untuk menghasilkan saran.'
												: 'Buat saran konteks otomatis dari teks hasil penguraian.'
										}
									>
										{generating ? (
											<LoaderCircle size={16} className="spin" />
										) : (
											<Sparkles size={16} strokeWidth={1.75} />
										)}
										{generating ? 'Membuat saran...' : 'Buat saran otomatis'}
									</button>
								</div>

								{pendingSuggestions.length > 0 ? (
									<ul className="fcx-suggestions">
										{pendingSuggestions.map((row) => (
											<li key={row.id} className="fcx-suggestion">
												<div className="fcx-suggestion-head">
													<span className="fcx-sug-kind">
														{SUGGESTION_KIND_LABELS[row.kind]}
													</span>
													{row.pageRef ? <span className="flb-chip">{row.pageRef}</span> : null}
												</div>
												<p className="fcx-sug-label">{row.label}</p>
												{row.note ? <p className="fcx-sug-note">{row.note}</p> : null}
												<div className="fcx-suggestion-actions">
													<button
														type="button"
														className="fcx-approve"
														onClick={() => void approveSuggestion(row)}
														disabled={busyId === `sug-${row.id}`}
													>
														<Check size={15} strokeWidth={1.75} /> Setujui &amp; terapkan
													</button>
													<button
														type="button"
														className="fcx-reject"
														onClick={() => void rejectSuggestion(row)}
														disabled={busyId === `sug-${row.id}`}
													>
														<X size={15} strokeWidth={1.75} /> Tolak
													</button>
												</div>
											</li>
										))}
									</ul>
								) : (
									<p className="fcx-note">
										{hasUsableText
											? 'Belum ada saran menunggu. Klik “Buat saran otomatis” untuk menghasilkannya dari teks.'
											: ''}
									</p>
								)}

								{reviewedSuggestions.length > 0 ? (
									<details className="fcx-reviewed-fold">
										<summary>{reviewedSuggestions.length} saran sudah ditinjau</summary>
										<ul className="fcx-suggestions fcx-reviewed">
											{reviewedSuggestions.map((row) => (
												<li key={row.id} className="fcx-suggestion compact">
													<div className="fcx-suggestion-head">
														<span className="fcx-sug-kind">
															{SUGGESTION_KIND_LABELS[row.kind]}
														</span>
														<span
															className={`fcx-sug-review ${row.review === 'approved' ? 'ok' : 'no'}`}
														>
															{row.review === 'approved' ? (
																<>
																	<Check size={12} strokeWidth={2} /> Disetujui
																</>
															) : (
																<>
																	<X size={12} strokeWidth={2} /> Ditolak
																</>
															)}
														</span>
													</div>
													<p className="fcx-sug-label">{row.label}</p>
												</li>
											))}
										</ul>
									</details>
								) : null}
							</div>

							<p className="fcx-note">
								<BookOpenText size={13} strokeWidth={1.75} aria-hidden /> Anda dapat mengelola
								konteks lengkap (bahasa, topik, bagian manual) kapan saja di halaman{' '}
								<strong>Atur konteks akademik</strong> berkas ini.
							</p>
						</div>
					)}
				</div>

				<div className="modal-actions flb-wizard-actions">
					<button type="button" className="ld-text-btn" onClick={cancel} disabled={busy}>
						Batal
					</button>
					<div className="flb-wizard-nav">
						{step > 1 && (
							<button
								type="button"
								className="ld-outline-action"
								onClick={goBack}
								disabled={busy}
							>
								<ChevronLeft size={16} /> Kembali
							</button>
						)}
						{step < 4 ? (
							<button
								type="button"
								className="ld-btn-primary"
								onClick={goNext}
								disabled={busy || parsing || !canAdvance}
							>
								{busy ? <LoaderCircle size={16} className="spin" /> : null}
								Lanjutkan <ChevronRight size={16} />
							</button>
						) : (
							<button
								type="button"
								className="ld-btn-primary"
								onClick={finish}
								disabled={busy}
							>
								<Check size={16} /> Selesai
							</button>
						)}
					</div>
				</div>
			</AppModal>
	);
}
