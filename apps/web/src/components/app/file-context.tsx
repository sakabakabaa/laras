import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
	ArrowLeft,
	BookOpenText,
	Check,
	CheckCircle2,
	Download,
	Eye,
	LoaderCircle,
	Plus,
	RefreshCw,
	Sparkles,
	Trash2,
	X,
	XCircle,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { invalidate } from '@/lib/local-cache';
import { dateLabel, errorMessage } from '@/lib/learning';
import type {
	ClassSession,
	ContextSectionRecord,
	ContextSectionStatus,
	ContextSuggestionKind,
	ContextSuggestionRecord,
	Course,
	Cpmk,
	FileContextRecord,
	FileExtractionRecord,
	FileLibraryRecord,
	SubCpmk,
} from '@/lib/learning';
import {
	ACCESS_LABELS,
	EXTRACTION_STATUS_LABELS,
	FILE_KIND_LABELS,
	fileKindFor,
	formatBytes,
	processLibraryFile,
	processingStateFor,
	type ProcessingState,
} from '@/lib/file-library';
import { LANGUAGE_LABELS } from '@/lib/file-metadata';
import { confirmDialog } from '@/components/confirm-dialog';
import {
	applyContextSuggestion,
	generateContextSuggestions,
	reviewContextSuggestion,
} from '@/lib/context-suggestions-client';

/** Languages a lecturer may confirm/correct for the file context. */
const CONTEXT_LANGUAGE_LABELS: Record<string, string> = {
	...LANGUAGE_LABELS,
	other: 'Lainnya',
};

type SectionDraft = {
	label: string;
	pageRef: string;
	status: ContextSectionStatus;
	note: string;
	cpmk: string;
	subCpmk: string;
	session: string;
};

/** Stable empty array so `sections` keeps one reference while loading. */
const EMPTY_SECTIONS: ContextSectionRecord[] = [];

const EMPTY_DRAFT: SectionDraft = {
	label: '',
	pageRef: '',
	// Safe default: a new section is NOT AI context until explicitly marked.
	status: 'unsuitable',
	note: '',
	cpmk: '',
	subCpmk: '',
	session: '',
};

const draftFrom = (row: ContextSectionRecord): SectionDraft => ({
	label: row.label,
	pageRef: row.pageRef || '',
	status: row.status,
	note: row.note || '',
	cpmk: row.cpmk || '',
	subCpmk: row.subCpmk || '',
	session: row.session || '',
});

/**
 * Phase 4 — lecturer-only context view for one managed library file.
 * Shows the exact active source/version and its extraction metadata, lets
 * the lecturer review the saved extracted text (with page references where
 * the parser produced them), confirm or correct the detected language, add
 * topics, and mark content sections as suitable/unsuitable for AI context —
 * each explicitly linked to existing authorized CPMK / Sub-CPMK / Sesi
 * records. Nothing is invented: with no context and no sections the view
 * clearly states "Konteks akademik belum ditentukan". Reads and writes go
 * through the owner-only `file_contexts` / `context_sections` rules, so
 * students and public participants can never reach this data.
 */
export function FileContextView({ fileId }: { fileId: string }) {
	const me = pb.authStore.record?.id || '';
	const [language, setLanguage] = useState('');
	const [topics, setTopics] = useState('');
	const [drafts, setDrafts] = useState<Record<string, SectionDraft>>({});
	const [newSection, setNewSection] = useState<SectionDraft>(EMPTY_DRAFT);
	const [busyId, setBusyId] = useState('');
	const [processing, setProcessing] = useState(false);
	const [actionError, setActionError] = useState('');
	const [savedNote, setSavedNote] = useState('');
	const [generating, setGenerating] = useState(false);
	const [suggestError, setSuggestError] = useState('');
	const [suggestNote, setSuggestNote] = useState('');

	const fileQuery = useCachedQuery<FileLibraryRecord | null>(
		`file_library:one:${fileId}`,
		async () => {
			try {
				return await pb.collection('file_library').getOne<FileLibraryRecord>(fileId, {
					expand: 'owner,course,cpmk,subCpmk,session',
				});
			} catch {
				return null;
			}
		},
	);
	const extractionQuery = useCachedQuery<FileExtractionRecord | null>(
		`file_extractions:one:${fileId}`,
		async () => {
			const rows = await pb
				.collection('file_extractions')
				.getFullList<FileExtractionRecord>({ filter: `file = "${fileId}"` });
			return rows[0] ?? null;
		},
	);
	const contextQuery = useCachedQuery<FileContextRecord | null>(
		`file_contexts:one:${fileId}`,
		async () => {
			const rows = await pb
				.collection('file_contexts')
				.getFullList<FileContextRecord>({ filter: `file = "${fileId}"` });
			return rows[0] ?? null;
		},
	);
	const sectionsQuery = useCachedQuery<ContextSectionRecord[]>(
		`context_sections:file:${fileId}`,
		() =>
			pb.collection('context_sections').getFullList<ContextSectionRecord>({
				filter: `file = "${fileId}"`,
				sort: 'created',
				expand: 'cpmk,subCpmk,session',
			}),
	);
	const coursesQuery = useCachedQuery<Course[]>('courses:all:-created', () =>
		pb.collection('courses').getFullList<Course>({ sort: '-created' }),
	);
	const cpmksQuery = useCachedQuery<Cpmk[]>('cpmk:all:order', () =>
		pb.collection('cpmk').getFullList<Cpmk>({ sort: 'order' }),
	);
	const subCpmksQuery = useCachedQuery<SubCpmk[]>('sub_cpmk:all:order', () =>
		pb.collection('sub_cpmk').getFullList<SubCpmk>({ sort: 'order' }),
	);
	const sessionsQuery = useCachedQuery<ClassSession[]>('class_sessions:all:date', () =>
		pb.collection('class_sessions').getFullList<ClassSession>({ sort: 'date' }),
	);
	const suggestionsQuery = useCachedQuery<ContextSuggestionRecord[]>(
		`context_suggestions:file:${fileId}`,
		() =>
			pb.collection('context_suggestions').getFullList<ContextSuggestionRecord>({
				filter: `file = "${fileId}"`,
				sort: 'created',
				expand: 'cpmk,subCpmk,session,course',
			}),
	);

	const file = fileQuery.data ?? null;
	const extraction = extractionQuery.data ?? null;
	const context = contextQuery.data ?? null;
	const sections = sectionsQuery.data ?? EMPTY_SECTIONS;
	const loading =
		fileQuery.loading ||
		extractionQuery.loading ||
		contextQuery.loading ||
		sectionsQuery.loading ||
		coursesQuery.loading ||
		cpmksQuery.loading ||
		subCpmksQuery.loading ||
		sessionsQuery.loading ||
		suggestionsQuery.loading;
	const loadError =
		fileQuery.error ||
		extractionQuery.error ||
		contextQuery.error ||
		sectionsQuery.error ||
		coursesQuery.error ||
		cpmksQuery.error ||
		subCpmksQuery.error ||
		sessionsQuery.error ||
		suggestionsQuery.error;

	const reloadAll = () => {
		fileQuery.reload();
		extractionQuery.reload();
		contextQuery.reload();
		sectionsQuery.reload();
		suggestionsQuery.reload();
	};

	// Prefill the language/topics form from the stored context record.
	useEffect(() => {
		if (context) {
			setLanguage(context.language || '');
			setTopics(context.topics || '');
		}
	}, [context]);

	// Local editable copies of each saved section, reset after every reload.
	useEffect(() => {
		const next: Record<string, SectionDraft> = {};
		for (const row of sections) next[row.id] = draftFrom(row);
		setDrafts(next);
	}, [sections]);

	const activeVersion = file?.version || 1;
	const extractionStale = Boolean(
		extraction && (extraction.version || 1) !== activeVersion,
	);
	const contextStale = Boolean(context && (context.version || 1) !== activeVersion);
	const hasContext = Boolean(context) || sections.length > 0;

	const courseCpmks = useMemo(
		() =>
			(cpmksQuery.data ?? [])
				.filter((c) => c.owner === me && (!file?.course || c.course === file.course))
				.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
		[cpmksQuery.data, me, file?.course],
	);
	const courseSubCpmks = useMemo(
		() =>
			(subCpmksQuery.data ?? [])
				.filter((c) => c.owner === me && (!file?.course || c.course === file.course))
				.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
		[subCpmksQuery.data, me, file?.course],
	);
	const courseSessions = useMemo(
		() =>
			(sessionsQuery.data ?? [])
				.filter((s) => s.owner === me && (!file?.course || s.course === file.course))
				.sort((a, b) => a.week - b.week),
		[sessionsQuery.data, me, file?.course],
	);
	const courseName =
		file?.expand?.course?.title ||
		(coursesQuery.data ?? []).find((c) => c.id === file?.course)?.title ||
		'';
	const fileSession =
		file?.expand?.session ||
		(sessionsQuery.data ?? []).find((s) => s.id === file?.session) ||
		null;

	// Page references where the parser produced page breaks (form feeds).
	const textPages = useMemo(() => {
		const text = extraction?.extractedText || '';
		if (!text.trim()) return [] as string[];
		const parts = text
			.split('\f')
			.map((part) => part.trim())
			.filter(Boolean);
		return parts.length > 1 ? parts : [text];
	}, [extraction]);

	const runProcess = async () => {
		setProcessing(true);
		setActionError('');
		try {
			await processLibraryFile(fileId, true);
			invalidate('file_extractions');
			invalidate('file_library');
			extractionQuery.reload();
			fileQuery.reload();
		} catch (err) {
			setActionError(errorMessage(err));
		} finally {
			setProcessing(false);
		}
	};

	const saveContext = async (nextStatus?: 'draft' | 'confirmed') => {
		if (!file) return;
		const status = nextStatus ?? context?.status ?? 'draft';
		if (status === 'confirmed' && sections.length === 0) {
			setActionError('Tambahkan minimal satu bagian konten sebelum mengonfirmasi konteks.');
			return;
		}
		setBusyId('context');
		setActionError('');
		setSavedNote('');
		try {
			if (context) {
				await pb.collection('file_contexts').update(context.id, {
					version: activeVersion,
					language,
					topics: topics.trim(),
					status,
				});
			} else {
				await pb.collection('file_contexts').create({
					file: fileId,
					owner: me,
					version: activeVersion,
					language,
					topics: topics.trim(),
					status,
				});
			}
			invalidate('file_contexts');
			contextQuery.reload();
			setSavedNote(
				status === 'confirmed'
					? 'Konteks dikonfirmasi untuk versi aktif.'
					: 'Bahasa & topik tersimpan untuk versi aktif.',
			);
		} catch (err) {
			setActionError(errorMessage(err));
		} finally {
			setBusyId('');
		}
	};

	const patchDraft = (id: string, patch: Partial<SectionDraft>) => {
		setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
	};

	const addSection = async () => {
		if (!newSection.label.trim()) {
			setActionError('Nama bagian wajib diisi.');
			return;
		}
		setBusyId('add');
		setActionError('');
		try {
			await pb.collection('context_sections').create({
				file: fileId,
				owner: me,
				version: activeVersion,
				label: newSection.label.trim(),
				pageRef: newSection.pageRef.trim(),
				status: newSection.status,
				note: newSection.note.trim(),
				cpmk: newSection.cpmk,
				subCpmk: newSection.subCpmk,
				session: newSection.session,
				order: sections.length,
			});
			setNewSection(EMPTY_DRAFT);
			invalidate('context_sections');
			sectionsQuery.reload();
		} catch (err) {
			setActionError(errorMessage(err));
		} finally {
			setBusyId('');
		}
	};

	const saveSection = async (row: ContextSectionRecord) => {
		const draft = drafts[row.id];
		if (!draft?.label.trim()) {
			setActionError('Nama bagian wajib diisi.');
			return;
		}
		setBusyId(row.id);
		setActionError('');
		try {
			await pb.collection('context_sections').update(row.id, {
				version: activeVersion,
				label: draft.label.trim(),
				pageRef: draft.pageRef.trim(),
				status: draft.status,
				note: draft.note.trim(),
				cpmk: draft.cpmk,
				subCpmk: draft.subCpmk,
				session: draft.session,
			});
			invalidate('context_sections');
			sectionsQuery.reload();
		} catch (err) {
			setActionError(errorMessage(err));
		} finally {
			setBusyId('');
		}
	};

	const removeSection = async (row: ContextSectionRecord) => {
		if (
			!(await confirmDialog({
				title: 'Hapus bagian',
				message: `Hapus bagian “${row.label}”? Tindakan ini tidak dapat dibatalkan.`,
				variant: 'danger',
				confirmLabel: 'Hapus',
			}))
		)
			return;
		setBusyId(row.id);
		setActionError('');
		try {
			await pb.collection('context_sections').delete(row.id);
			invalidate('context_sections');
			sectionsQuery.reload();
		} catch (err) {
			setActionError(errorMessage(err));
		} finally {
			setBusyId('');
		}
	};

	const sectionLinkLabels = (row: ContextSectionRecord): string[] => {
		const labels: string[] = [];
		const cpmkCode =
			row.expand?.cpmk?.code || courseCpmks.find((c) => c.id === row.cpmk)?.code;
		const subCpmkCode =
			row.expand?.subCpmk?.code || courseSubCpmks.find((c) => c.id === row.subCpmk)?.code;
		const session = courseSessions.find((s) => s.id === row.session);
		if (cpmkCode) labels.push(`CPMK ${cpmkCode}`);
		if (subCpmkCode) labels.push(`Sub-CPMK ${subCpmkCode}`);
		if (session) labels.push(`Minggu ${session.week}`);
		return labels;
	};

	// ── Phase 7: AI-generated suggestions with an approve/reject flow ──
	const suggestions = suggestionsQuery.data ?? [];
	const pendingSuggestions = suggestions.filter((s) => s.review === 'pending');
	const reviewedSuggestions = suggestions.filter((s) => s.review !== 'pending');
	const hasUsableText = Boolean(extraction?.extractedText?.trim());

	const SUGGESTION_KIND_LABELS: Record<ContextSuggestionKind, string> = {
		language: 'Bahasa',
		topics: 'Topik',
		section: 'Bagian konten',
		course: 'Tautan mata kuliah',
		session: 'Tautan sesi',
	};

	const suggestionLinkLabels = (row: ContextSuggestionRecord): string[] => {
		const labels: string[] = [];
		const cpmkCode =
			row.expand?.cpmk?.code || courseCpmks.find((c) => c.id === row.cpmk)?.code;
		const subCpmkCode =
			row.expand?.subCpmk?.code || courseSubCpmks.find((c) => c.id === row.subCpmk)?.code;
		const session = courseSessions.find((s) => s.id === row.session);
		const course =
			row.expand?.course ||
			(coursesQuery.data ?? []).find((c) => c.id === row.course);
		if (course) labels.push(course.code ? `MK ${course.code}` : course.title);
		if (cpmkCode) labels.push(`CPMK ${cpmkCode}`);
		if (subCpmkCode) labels.push(`Sub-CPMK ${subCpmkCode}`);
		if (session) labels.push(`Minggu ${session.week}`);
		return labels;
	};

	const runSuggest = async () => {
		if (!file) return;
		setGenerating(true);
		setSuggestError('');
		setSuggestNote('');
		setActionError('');
		try {
			const result = await generateContextSuggestions(fileId);
			if (!result.ok) {
				setSuggestError(result.reason);
			} else {
				const count = result.suggestions.length;
				setSuggestNote(
					count > 0
						? `${count} saran konteks dibuat dari teks hasil penguraian. Tinjau dan setujui masing-masing.`
						: 'Teks tidak memberikan cukup bukti untuk saran otomatis. Anda dapat menandai bagian konten secara manual.',
				);
			}
			invalidate('context_suggestions');
			suggestionsQuery.reload();
		} catch (err) {
			setSuggestError(errorMessage(err));
		} finally {
			setGenerating(false);
		}
	};

	/** Marks a suggestion approved/rejected and stamps the review time. */
	const setSuggestionReview = async (
		row: ContextSuggestionRecord,
		review: 'approved' | 'rejected',
	) => {
		setBusyId(`sug-${row.id}`);
		setActionError('');
		try {
			await reviewContextSuggestion(row.id, review);
			invalidate('context_suggestions');
			suggestionsQuery.reload();
		} catch (err) {
			setActionError(errorMessage(err));
		} finally {
			setBusyId('');
		}
	};

	/**
	 * Approves a suggestion AND applies it to the confirmed context stores that
	 * downstream AI grounding reads. Only approved suggestions take effect — a
	 * rejected suggestion is simply marked and never applied.
	 */
	const approveSuggestion = async (row: ContextSuggestionRecord) => {
		if (!file) return;
		setBusyId(`sug-${row.id}`);
		setActionError('');
		try {
			const result = await applyContextSuggestion(row, {
				fileId,
				ownerId: me,
				version: activeVersion,
				context,
				sectionsCount: sections.length,
			});
			if (result.changedContext) {
				if (result.language !== null) setLanguage(result.language);
				if (result.topics !== null) setTopics(result.topics);
				invalidate('file_contexts');
				contextQuery.reload();
			}
			if (result.changedSections) {
				invalidate('context_sections');
				sectionsQuery.reload();
			}
			if (result.changedFile) {
				invalidate('file_library');
				fileQuery.reload();
			}
			invalidate('context_suggestions');
			suggestionsQuery.reload();
		} catch (err) {
			setActionError(errorMessage(err));
		} finally {
			setBusyId('');
		}
	};

	if (loading && !file) {
		return (
			<div className="fcx-page">
				<div className="ld-loading">
					<LoaderCircle size={24} className="spin" /> Memuat konteks berkas...
				</div>
			</div>
		);
	}

	if (loadError) {
		return (
			<div className="fcx-page">
				<Link className="fcx-back" to="/app/berkas">
					<ArrowLeft size={15} strokeWidth={1.75} /> Kembali ke Manajemen berkas
				</Link>
				<div className="ld-alert" role="alert">
					{loadError}{' '}
					<button type="button" onClick={reloadAll}>
						Coba lagi
					</button>
				</div>
			</div>
		);
	}

	if (!file) {
		return (
			<div className="fcx-page">
				<Link className="fcx-back" to="/app/berkas">
					<ArrowLeft size={15} strokeWidth={1.75} /> Kembali ke Manajemen berkas
				</Link>
				<div className="ld-alert" role="alert">
					Berkas tidak ditemukan atau Anda tidak memiliki akses.
				</div>
			</div>
		);
	}

	// Only the owner may organize context; the collection rules enforce the
	// same server-side, this keeps the UI honest for other faculty viewers.
	if (file.owner !== me) {
		return (
			<div className="fcx-page">
				<Link className="fcx-back" to="/app/berkas">
					<ArrowLeft size={15} strokeWidth={1.75} /> Kembali ke Manajemen berkas
				</Link>
				<div className="ld-alert" role="alert">
					Hanya pemilik berkas yang dapat mengatur konteks akademik berkas ini.
				</div>
			</div>
		);
	}

	const kind = fileKindFor(file.file);
	const url = file.file ? pb.files.getURL(file, file.file) : '';
	const procState = processingStateFor(file, extraction);

	return (
		<div className="fcx-page">
			<Link className="fcx-back" to="/app/berkas">
				<ArrowLeft size={15} strokeWidth={1.75} /> Kembali ke Manajemen berkas
			</Link>

			<div className="fcx-head">
				<div>
					<span className="ld-eyebrow">Konteks Berkas</span>
					<h1>{file.title}</h1>
					<div className="fcx-badges">
						<span className="flb-chip">{FILE_KIND_LABELS[kind]}</span>
						<span className={`flb-badge access-${file.access}`}>{ACCESS_LABELS[file.access]}</span>
						<span className={`flb-badge proc-${procState}`}>
							{EXTRACTION_STATUS_LABELS[procState as ProcessingState]}
						</span>
						<span className="flb-chip">Versi aktif {activeVersion}</span>
						{file.restoredFrom ? (
							<span className="flb-chip">Dipulihkan dari versi {file.restoredFrom}</span>
						) : null}
						<span className="flb-chip">{formatBytes(file.size)}</span>
						{courseName ? <span className="flb-chip">{courseName}</span> : null}
					</div>
				</div>
				<div className="fcx-head-actions">
					{url ? (
						<>
							<a
								className="ld-icon-action"
								href={url}
								target="_blank"
								rel="noreferrer"
								aria-label={`Pratinjau ${file.title}`}
								title="Pratinjau berkas asli"
							>
								<Eye size={16} strokeWidth={1.75} />
							</a>
							<a
								className="ld-icon-action"
								href={url}
								download
								aria-label={`Unduh ${file.title}`}
								title="Unduh berkas asli"
							>
								<Download size={16} strokeWidth={1.75} />
							</a>
						</>
					) : null}
				</div>
			</div>

			{(actionError || savedNote) && (
				<div className={actionError ? 'ld-alert' : 'fcx-ok'} role={actionError ? 'alert' : 'status'}>
					{actionError || savedNote}
				</div>
			)}

			{/* Exact active source & extraction metadata (traceability). */}
			<section className="fcx-panel">
				<div className="fcx-panel-head">
					<h3>Sumber &amp; versi aktif</h3>
					{extraction ? (
						<span className="flb-chip">Ekstraksi untuk versi {extraction.version || 1}</span>
					) : null}
				</div>
				<small className="fcx-source">{file.file || 'Tanpa berkas'}</small>
				<div className="fcx-meta">
					{extraction ? (
						<>
							<span className={`flb-badge proc-${extraction.status}`}>
								{EXTRACTION_STATUS_LABELS[extraction.status]}
							</span>
							{extraction.language ? (
								<span className="flb-chip">
									Bahasa terdeteksi{' '}
									{CONTEXT_LANGUAGE_LABELS[extraction.language] ?? extraction.language}
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
							{extraction.extractedAt ? (
								<span className="flb-chip">Diurai {dateLabel(extraction.extractedAt)}</span>
							) : null}
							{extraction.parserVersion ? (
								<span className="flb-chip">Parser {extraction.parserVersion}</span>
							) : null}
						</>
					) : (
						<span className="flb-chip">Belum ada teks penguraian</span>
					)}
				</div>
				{extractionStale ? (
					<p className="fcx-warn">
						Teks penguraian berasal dari versi {extraction?.version || 1}, sedangkan berkas
						aktif kini versi {activeVersion}. Proses ulang dokumen agar teks mengikuti versi
						aktif.
					</p>
				) : null}
				{extraction?.failureReason ? (
					<p className={`fcx-note${extraction.status === 'failed' ? ' bad' : ''}`}>
						{extraction.failureReason}
					</p>
				) : null}
				{(!extraction || extraction.status === 'failed') && (
					<div className="fcx-row-actions">
						<button
							type="button"
							className="ld-text-btn"
							onClick={() => void runProcess()}
							disabled={processing}
						>
							{processing ? (
								<LoaderCircle size={15} className="spin" />
							) : (
								<RefreshCw size={15} strokeWidth={1.75} />
							)}
							{extraction ? 'Proses ulang dokumen' : 'Proses dokumen'}
						</button>
					</div>
				)}
			</section>

			{/* Review of the saved extracted text, with page references where available. */}
			{extraction && extraction.extractedText?.trim() ? (
				<section className="fcx-panel">
					<div className="fcx-panel-head">
						<h3>Teks hasil penguraian</h3>
						<span className="flb-chip">
							{textPages.length > 1 ? `${textPages.length} bagian halaman` : '1 bagian'}
						</span>
					</div>
					<details className="fcx-text-fold">
						<summary>Tinjau teks tersimpan</summary>
						<div className="fcx-text-pages">
							{textPages.map((page, index) => (
								<div key={index} className="fcx-text-page">
									{textPages.length > 1 ? (
										<strong>
											{textPages.length === extraction.pages && extraction.pages
												? `Halaman ${index + 1}`
												: `Bagian ${index + 1}`}
										</strong>
									) : null}
									<p>{page}</p>
								</div>
							))}
						</div>
					</details>
					<p className="fcx-note">
						Teks tersimpan apa adanya dari penguraian otomatis — tanpa suntingan. Gunakan
						referensi halaman/bagian di bawah saat menandai bagian konten.
					</p>
				</section>
			) : null}

			{!hasContext ? (
				<div className="fcx-empty fcx-empty-context">
					<BookOpenText size={20} strokeWidth={1.75} aria-hidden />
					<div>
						<strong>Konteks akademik belum ditentukan</strong>
						<p>
							{hasUsableText
								? 'Teks berkas berhasil diurai. Buat saran konteks otomatis di bawah — asisten AI akan mengusulkan bahasa, topik, dan bagian konten dari teks, lalu Anda menyetujui atau menolak masing-masing sebelum dipakai.'
								: extraction?.status === 'failed'
									? 'Teks otomatis tidak dapat diurai, jadi saran otomatis tidak tersedia. Anda tetap dapat menandai bagian konten secara manual dengan referensi halaman di bawah.'
									: 'Berkas belum diproses — proses dokumen untuk mengurai teks, lalu buat saran konteks otomatis, atau tandai bagian konten secara manual di bawah.'}
						</p>
						<p className="fcx-empty-links">
							{courseName ? (
								<>
									Berkas sudah ditautkan ke mata kuliah <strong>{courseName}</strong>.
								</>
							) : (
								<>Berkas belum ditautkan ke mata kuliah — ubah di Manajemen berkas.</>
							)}
							{fileSession ? (
								<>
									{' '}
									Sesi <strong>Minggu {fileSession.week} — {fileSession.title}</strong>.
								</>
							) : null}{' '}
							Hanya saran yang Anda setujui yang menjadi konteks AI.
						</p>
					</div>
				</div>
			) : null}

			{/* Phase 7 — AI-generated suggestions with an approve/reject flow. */}
			<section className="fcx-panel fcx-suggest">
				<div className="fcx-panel-head">
					<h3>
						<Sparkles size={15} strokeWidth={1.75} aria-hidden /> Saran konteks otomatis
					</h3>
					<span className="flb-chip">{pendingSuggestions.length} menunggu</span>
				</div>
				<p className="fcx-note">
					Asisten AI membaca teks hasil penguraian dan mengusulkan tag konteks akademik
					(bahasa, topik, bagian, tautan mata kuliah/sesi) berdasarkan bukti pada teks.
					Setujui saran untuk menerapkannya ke konteks AI, atau tolak. Hanya saran yang
					disetujui yang dipakai untuk penautan akademik dan landasan AI.
				</p>
				{!hasUsableText ? (
					<p className="fcx-note">
						{extraction?.status === 'failed'
							? 'Teks otomatis tidak dapat diurai dari berkas ini, jadi saran otomatis tidak tersedia. Anda tetap dapat menandai bagian konten secara manual di bawah.'
							: 'Berkas belum diproses — proses dokumen terlebih dahulu agar saran konteks dapat dibuat dari teks hasil penguraian.'}
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
						{pendingSuggestions.map((row) => {
							const links = suggestionLinkLabels(row);
							return (
								<li key={row.id} className="fcx-suggestion">
									<div className="fcx-suggestion-head">
										<span className="fcx-sug-kind">
											{SUGGESTION_KIND_LABELS[row.kind]}
										</span>
										{row.pageRef ? (
											<span className="flb-chip">{row.pageRef}</span>
										) : null}
									</div>
									<p className="fcx-sug-label">{row.label}</p>
									{row.note ? <p className="fcx-sug-note">{row.note}</p> : null}
									{links.length > 0 ? (
										<div className="fcx-meta">
											{links.map((label) => (
												<span key={label} className="flb-link">
													{label}
												</span>
											))}
										</div>
									) : null}
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
											onClick={() => void setSuggestionReview(row, 'rejected')}
											disabled={busyId === `sug-${row.id}`}
										>
											<X size={15} strokeWidth={1.75} /> Tolak
										</button>
									</div>
								</li>
							);
						})}
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
						<summary>
							{reviewedSuggestions.length} saran sudah ditinjau
						</summary>
						<ul className="fcx-suggestions fcx-reviewed">
							{reviewedSuggestions.map((row) => {
								const links = suggestionLinkLabels(row);
								return (
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
										{links.length > 0 ? (
											<div className="fcx-meta">
												{links.map((label) => (
													<span key={label} className="flb-link">
														{label}
													</span>
												))}
											</div>
										) : null}
										{row.review === 'rejected' ? (
											<button
												type="button"
												className="ld-text-btn"
												onClick={() => void setSuggestionReview(row, 'approved')}
												disabled={busyId === `sug-${row.id}`}
											>
												Batalkan penolakan
											</button>
										) : null}
									</li>
								);
							})}
						</ul>
					</details>
				) : null}
			</section>

			{/* Language confirmation/correction + topics. */}
			<section className="fcx-panel">
				<div className="fcx-panel-head">
					<h3>Bahasa &amp; topik</h3>
					{context ? (
						<span
							className={`flb-badge ${context.status === 'confirmed' ? 'proc-ready' : 'proc-waiting'}`}
						>
							{context.status === 'confirmed' ? 'Konteks dikonfirmasi' : 'Draf konteks'}
						</span>
					) : null}
				</div>
				{contextStale ? (
					<p className="fcx-warn">
						Konteks terakhir ditinjau untuk versi {context?.version || 1}, sedangkan berkas
						aktif kini versi {activeVersion}. Simpan ulang untuk memperbarui penelusuran versi.
					</p>
				) : null}
				<div className="fcx-grid2">
					<label>
						Bahasa konten
						<select value={language} onChange={(e) => setLanguage(e.target.value)}>
							<option value="">Belum dikonfirmasi</option>
							{Object.entries(CONTEXT_LANGUAGE_LABELS).map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
						<small className="flb-file-info">
							{extraction?.language
								? `Terdeteksi otomatis: ${CONTEXT_LANGUAGE_LABELS[extraction.language] ?? extraction.language}. Konfirmasi atau koreksi.`
								: 'Belum ada deteksi otomatis — pilih bahasa konten.'}
						</small>
					</label>
					<label>
						Topik (opsional)
						<textarea
							value={topics}
							onChange={(e) => setTopics(e.target.value)}
							placeholder="Satu topik per baris, mis. Kosakata B1 — Familie"
							rows={3}
							maxLength={2000}
						/>
					</label>
				</div>
				<div className="fcx-row-actions">
					<button
						type="button"
						className="ld-btn-primary"
						onClick={() => void saveContext()}
						disabled={busyId === 'context'}
					>
						{busyId === 'context' ? <LoaderCircle size={16} className="spin" /> : null}
						Simpan bahasa &amp; topik
					</button>
					{context?.status === 'confirmed' ? (
						<button
							type="button"
							className="ld-text-btn"
							onClick={() => void saveContext('draft')}
							disabled={busyId === 'context'}
						>
							Batalkan konfirmasi
						</button>
					) : (
						<button
							type="button"
							className="ld-text-btn"
							onClick={() => void saveContext('confirmed')}
							disabled={busyId === 'context' || sections.length === 0}
							title={
								sections.length === 0
									? 'Tambahkan minimal satu bagian konten untuk mengonfirmasi.'
									: 'Tandai konteks sebagai dikonfirmasi untuk versi aktif.'
							}
						>
							<CheckCircle2 size={15} strokeWidth={1.75} />
							Konfirmasi konteks
						</button>
					)}
				</div>
			</section>

			{/* Content sections: explicit marks + links to existing academic records. */}
			<section className="fcx-panel">
				<div className="fcx-panel-head">
					<h3>Bagian konten</h3>
					<span className="flb-chip">{sections.length} bagian</span>
				</div>
				<p className="fcx-note">
					Tandai bagian dokumen sebagai cocok atau tidak cocok untuk konteks AI, lalu tautkan
					secara eksplisit ke CPMK, Sub-CPMK, atau sesi yang sudah ada. Bagian baru default
					<b> tidak cocok</b> — tidak ada yang menjadi konteks AI tanpa tanda eksplisit Anda.
				</p>

				<div className="fcx-add">
					<strong>Tambah bagian baru</strong>
					<div className="fcx-grid2">
						<label>
							Nama bagian <span className="flb-required">*</span>
							<input
								type="text"
								value={newSection.label}
								onChange={(e) => setNewSection((d) => ({ ...d, label: e.target.value }))}
								placeholder="Mis. Wortschatz — Familie"
								maxLength={200}
							/>
						</label>
						<label>
							Referensi halaman/bagian
							<input
								type="text"
								value={newSection.pageRef}
								onChange={(e) => setNewSection((d) => ({ ...d, pageRef: e.target.value }))}
								placeholder="Mis. hlm. 3–5 / Bab 2"
								maxLength={100}
							/>
						</label>
					</div>
					<div className="fcx-toggle" role="group" aria-label="Tanda konteks AI">
						<button
							type="button"
							className={newSection.status === 'suitable' ? 'active' : ''}
							onClick={() => setNewSection((d) => ({ ...d, status: 'suitable' }))}
						>
							<CheckCircle2 size={15} strokeWidth={1.75} /> Cocok untuk konteks AI
						</button>
						<button
							type="button"
							className={newSection.status === 'unsuitable' ? 'active' : ''}
							onClick={() => setNewSection((d) => ({ ...d, status: 'unsuitable' }))}
						>
							<XCircle size={15} strokeWidth={1.75} /> Tidak cocok
						</button>
					</div>
					<div className="fcx-grid3">
						<label>
							CPMK
							<select
								value={newSection.cpmk}
								onChange={(e) => setNewSection((d) => ({ ...d, cpmk: e.target.value }))}
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
							Sub-CPMK
							<select
								value={newSection.subCpmk}
								onChange={(e) => setNewSection((d) => ({ ...d, subCpmk: e.target.value }))}
							>
								<option value="">Tidak ditautkan</option>
								{courseSubCpmks.map((item) => (
									<option key={item.id} value={item.id}>
										{item.code || 'Tanpa kode'} — {item.description.slice(0, 60)}
									</option>
								))}
							</select>
						</label>
						<label>
							Sesi
							<select
								value={newSection.session}
								onChange={(e) => setNewSection((d) => ({ ...d, session: e.target.value }))}
							>
								<option value="">Tidak ditautkan</option>
								{courseSessions.map((item) => (
									<option key={item.id} value={item.id}>
										Minggu {item.week} — {item.title}
									</option>
								))}
							</select>
						</label>
					</div>
					<label>
						Catatan (opsional)
						<textarea
							value={newSection.note}
							onChange={(e) => setNewSection((d) => ({ ...d, note: e.target.value }))}
							placeholder="Mis. Daftar kosakata inti untuk latihan mandiri"
							rows={2}
							maxLength={500}
						/>
					</label>
					<div className="fcx-row-actions">
						<button
							type="button"
							className="ld-btn-primary"
							onClick={() => void addSection()}
							disabled={busyId === 'add'}
						>
							{busyId === 'add' ? (
								<LoaderCircle size={16} className="spin" />
							) : (
								<Plus size={16} strokeWidth={1.75} />
							)}
							Tambah bagian
						</button>
					</div>
				</div>

				{sections.length === 0 ? (
					<p className="fcx-note">Belum ada bagian konten yang ditandai untuk berkas ini.</p>
				) : (
					<ul className="fcx-sections">
						{sections.map((row) => {
							const draft = drafts[row.id] ?? draftFrom(row);
							const links = sectionLinkLabels(row);
							return (
								<li key={row.id} className="fcx-section">
									<div className="fcx-section-head">
										<span className={`fcx-mark ${draft.status}`}>
											{draft.status === 'suitable' ? (
												<CheckCircle2 size={14} strokeWidth={1.75} aria-hidden />
											) : (
												<XCircle size={14} strokeWidth={1.75} aria-hidden />
											)}
											{draft.status === 'suitable'
												? 'Cocok untuk konteks AI'
												: 'Tidak cocok untuk konteks AI'}
										</span>
										<span className="flb-chip">Versi {row.version || 1}</span>
										<span className="flb-chip">Dibuat {dateLabel(row.created)}</span>
										<span className="flb-chip">Diubah {dateLabel(row.updated)}</span>
									</div>
									<div className="fcx-grid2">
										<label>
											Nama bagian <span className="flb-required">*</span>
											<input
												type="text"
												value={draft.label}
												onChange={(e) => patchDraft(row.id, { label: e.target.value })}
												maxLength={200}
											/>
										</label>
										<label>
											Referensi halaman/bagian
											<input
												type="text"
												value={draft.pageRef}
												onChange={(e) => patchDraft(row.id, { pageRef: e.target.value })}
												placeholder="Mis. hlm. 3–5 / Bab 2"
												maxLength={100}
											/>
										</label>
									</div>
									<div className="fcx-toggle" role="group" aria-label="Tanda konteks AI">
										<button
											type="button"
											className={draft.status === 'suitable' ? 'active' : ''}
											onClick={() => patchDraft(row.id, { status: 'suitable' })}
										>
											<CheckCircle2 size={15} strokeWidth={1.75} /> Cocok untuk konteks AI
										</button>
										<button
											type="button"
											className={draft.status === 'unsuitable' ? 'active' : ''}
											onClick={() => patchDraft(row.id, { status: 'unsuitable' })}
										>
											<XCircle size={15} strokeWidth={1.75} /> Tidak cocok
										</button>
									</div>
									<div className="fcx-grid3">
										<label>
											CPMK
											<select
												value={draft.cpmk}
												onChange={(e) => patchDraft(row.id, { cpmk: e.target.value })}
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
											Sub-CPMK
											<select
												value={draft.subCpmk}
												onChange={(e) => patchDraft(row.id, { subCpmk: e.target.value })}
											>
												<option value="">Tidak ditautkan</option>
												{courseSubCpmks.map((item) => (
													<option key={item.id} value={item.id}>
														{item.code || 'Tanpa kode'} — {item.description.slice(0, 60)}
													</option>
												))}
											</select>
										</label>
										<label>
											Sesi
											<select
												value={draft.session}
												onChange={(e) => patchDraft(row.id, { session: e.target.value })}
											>
												<option value="">Tidak ditautkan</option>
												{courseSessions.map((item) => (
													<option key={item.id} value={item.id}>
														Minggu {item.week} — {item.title}
													</option>
												))}
											</select>
										</label>
									</div>
									<label>
										Catatan (opsional)
										<textarea
											value={draft.note}
											onChange={(e) => patchDraft(row.id, { note: e.target.value })}
											rows={2}
											maxLength={500}
										/>
									</label>
									{links.length > 0 ? (
										<div className="fcx-meta">
											{links.map((label) => (
												<span key={label} className="flb-link">
													{label}
												</span>
											))}
										</div>
									) : (
										<p className="fcx-note">Bagian ini belum ditautkan ke relasi akademik.</p>
									)}
									<div className="fcx-row-actions">
										<button
											type="button"
											className="ld-text-btn"
											onClick={() => void saveSection(row)}
											disabled={busyId === row.id}
										>
											{busyId === row.id ? (
												<LoaderCircle size={15} className="spin" />
											) : (
												<CheckCircle2 size={15} strokeWidth={1.75} />
											)}
											Simpan bagian
										</button>
										<button
											type="button"
											className="ld-text-btn danger"
											onClick={() => void removeSection(row)}
											disabled={busyId === row.id}
										>
											<Trash2 size={15} strokeWidth={1.75} />
											Hapus
										</button>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</section>
		</div>
	);
}
