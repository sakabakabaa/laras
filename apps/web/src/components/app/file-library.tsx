import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
	BookOpenText,
	Download,
	Eye,
	File,
	FileAudio,
	FileImage,
	FileText,
	FileVideo,
	FolderOpen,
	History,
	LoaderCircle,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	Trash2,
	Upload,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { invalidate } from '@/lib/local-cache';
import { dateLabel, errorMessage } from '@/lib/learning';
import type {
	ClassSession,
	Course,
	Cpmk,
	FileExtractionRecord,
	FileLibraryRecord,
	SubCpmk,
} from '@/lib/learning';
import {
	ACCESS_LABELS,
	EXTRACTION_STATUS_LABELS,
	FILE_KIND_LABELS,
	STATUS_LABELS,
	fileKindFor,
	formatBytes,
	processingStateFor,
	processLibraryFile,
	type FileKind,
} from '@/lib/file-library';
import { LANGUAGE_LABELS, type DetectedLanguage } from '@/lib/file-metadata';
import { FileUploadDialog } from '@/components/app/file-upload-dialog';
import { FileVersionHistory } from '@/components/app/file-version-history';
import { confirmDialog } from '@/components/confirm-dialog';

const KIND_ICONS: Record<FileKind, typeof FileText> = {
	document: FileText,
	image: FileImage,
	audio: FileAudio,
	video: FileVideo,
	other: File,
};

type SortKey = 'newest' | 'oldest' | 'title' | 'largest';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
	{ value: 'newest', label: 'Terbaru diunggah' },
	{ value: 'oldest', label: 'Terlama diunggah' },
	{ value: 'title', label: 'Judul A–Z' },
	{ value: 'largest', label: 'Ukuran terbesar' },
];

/**
 * Lecturer-only file library (Phase 1): upload, search, filter, sort, and link
 * original files to existing academic entities. Reads and writes go through
 * the `file_library` collection rules, which enforce owner-only writes and
 * per-record access levels.
 */
export function FileLibrary() {
	const me = pb.authStore.record?.id || '';
	const [query, setQuery] = useState('');
	const [courseFilter, setCourseFilter] = useState('all');
	const [accessFilter, setAccessFilter] = useState('all');
	const [kindFilter, setKindFilter] = useState('all');
	const [sort, setSort] = useState<SortKey>('newest');
	const [dialog, setDialog] = useState<
		{ mode: 'create' } | { mode: 'edit'; record: FileLibraryRecord } | null
	>(null);
	const [historyFor, setHistoryFor] = useState<FileLibraryRecord | null>(null);
	const [deleting, setDeleting] = useState('');
	const [processingId, setProcessingId] = useState('');
	const [actionError, setActionError] = useState('');

	const filesQuery = useCachedQuery<FileLibraryRecord[]>('file_library:all:-created', () =>
		pb.collection('file_library').getFullList<FileLibraryRecord>({
			sort: '-created',
			expand: 'owner,course,cpmk,subCpmk,session',
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
	const extractionsQuery = useCachedQuery<FileExtractionRecord[]>('file_extractions:all:-created', () =>
		pb.collection('file_extractions').getFullList<FileExtractionRecord>({ sort: '-created' }),
	);

	const courses = useMemo(
		() => (coursesQuery.data ?? []).filter((c) => c.owner === me),
		[coursesQuery.data, me],
	);
	const cpmks = useMemo(
		() => (cpmksQuery.data ?? []).filter((c) => c.owner === me),
		[cpmksQuery.data, me],
	);
	const subCpmks = useMemo(
		() => (subCpmksQuery.data ?? []).filter((c) => c.owner === me),
		[subCpmksQuery.data, me],
	);
	const sessions = useMemo(
		() => (sessionsQuery.data ?? []).filter((s) => s.owner === me),
		[sessionsQuery.data, me],
	);

	const loading =
		filesQuery.loading ||
		coursesQuery.loading ||
		cpmksQuery.loading ||
		subCpmksQuery.loading ||
		sessionsQuery.loading ||
		extractionsQuery.loading;
	const error =
		filesQuery.error || coursesQuery.error || cpmksQuery.error || subCpmksQuery.error || sessionsQuery.error || extractionsQuery.error;
	const load = useCallback(() => {
		filesQuery.reload();
		coursesQuery.reload();
		cpmksQuery.reload();
		subCpmksQuery.reload();
		sessionsQuery.reload();
		extractionsQuery.reload();
	}, [filesQuery, coursesQuery, cpmksQuery, subCpmksQuery, sessionsQuery, extractionsQuery]);

	const files = filesQuery.data ?? [];
	const extractions = extractionsQuery.data ?? [];
	const extractionByFile = useMemo(
		() => new Map(extractions.map((item) => [item.file, item])),
		[extractions],
	);

	const filtered = useMemo(() => {
		let rows = files;
		const q = query.trim().toLowerCase();
		if (q) {
			rows = rows.filter(
				(f) =>
					f.title.toLowerCase().includes(q) ||
					(f.description || '').toLowerCase().includes(q) ||
					(f.file || '').toLowerCase().includes(q),
			);
		}
		if (courseFilter !== 'all') rows = rows.filter((f) => f.course === courseFilter);
		if (accessFilter !== 'all') rows = rows.filter((f) => f.access === accessFilter);
		if (kindFilter !== 'all') rows = rows.filter((f) => fileKindFor(f.file) === kindFilter);
		const sorted = [...rows];
		if (sort === 'newest') sorted.sort((a, b) => b.created.localeCompare(a.created));
		else if (sort === 'oldest') sorted.sort((a, b) => a.created.localeCompare(b.created));
		else if (sort === 'title')
			sorted.sort((a, b) => a.title.localeCompare(b.title, 'id'));
		else sorted.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
		return sorted;
	}, [files, query, courseFilter, accessFilter, kindFilter, sort]);

	const remove = async (record: FileLibraryRecord) => {
		if (
			!(await confirmDialog({
				title: 'Hapus berkas',
				message: `Hapus berkas “${record.title}”? Tindakan ini tidak dapat dibatalkan.`,
				variant: 'danger',
				confirmLabel: 'Hapus',
			}))
		)
			return;
		setDeleting(record.id);
		setActionError('');
		try {
			await pb.collection('file_library').delete(record.id);
			invalidate('file_library');
		} catch (err) {
			setActionError(errorMessage(err));
		} finally {
			setDeleting('');
		}
	};

	/**
	 * Phase 2: (re)process a document on the lecturer's explicit request. The
	 * route reuses the stored extraction when the file is unchanged and only
	 * re-parses when forced — never creating duplicate extraction records.
	 */
	const reprocess = async (record: FileLibraryRecord) => {
		setProcessingId(record.id);
		setActionError('');
		try {
			await processLibraryFile(record.id, true);
			invalidate('file_extractions');
			invalidate('file_library');
			filesQuery.reload();
			extractionsQuery.reload();
		} catch (err) {
			setActionError(errorMessage(err));
		} finally {
			setProcessingId('');
		}
	};

	return (
		<div className="flb-page">
			{(error || actionError) && (
				<div className="ld-alert" role="alert">
					{actionError || error}{' '}
					{error ? (
						<button type="button" onClick={() => void load()}>
							Coba lagi
						</button>
					) : null}
				</div>
			)}

			<div className="ld-page-head">
				<span className="ld-eyebrow">Ruang Kerja</span>
				<h1>Manajemen Berkas</h1>
			</div>
			<p className="flb-intro">
				Pustaka berkas pribadi dosen. Unggah dokumen, gambar, audio, atau video, lalu tautkan
				ke mata kuliah, CPMK, Sub-CPMK, atau sesi. Berkas asli disimpan utuh — pratinjau dan
				unduhan selalu mengambil berkas aslinya.
			</p>

			<div className="ld-courses-toolbar">
				<label className="ld-search-bar">
					<Search size={16} strokeWidth={1.75} aria-hidden />
					<input
						type="search"
						placeholder="Cari berkas berdasarkan judul, deskripsi, atau nama file..."
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						aria-label="Cari berkas"
					/>
				</label>
				<div className="ld-courses-actions">
					<button
						type="button"
						className="ld-btn-primary"
						onClick={() => setDialog({ mode: 'create' })}
					>
						<Upload size={16} /> Unggah berkas
					</button>
				</div>
			</div>

			<div className="flb-filters">
				<label className="flb-select">
					Mata kuliah
					<select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
						<option value="all">Semua mata kuliah</option>
						{courses.map((course) => (
							<option key={course.id} value={course.id}>
								{course.title}
							</option>
						))}
					</select>
				</label>
				<label className="flb-select">
					Jenis
					<select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
						<option value="all">Semua jenis</option>
						{(Object.keys(FILE_KIND_LABELS) as FileKind[]).map((kind) => (
							<option key={kind} value={kind}>
								{FILE_KIND_LABELS[kind]}
							</option>
						))}
					</select>
				</label>
				<label className="flb-select">
					Akses
					<select value={accessFilter} onChange={(e) => setAccessFilter(e.target.value)}>
						<option value="all">Semua akses</option>
						<option value="faculty">Dosen saja</option>
						<option value="student">Dosen & mahasiswa</option>
					</select>
				</label>
				<label className="flb-select">
					Urutan
					<select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
						{SORT_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				<span className="ld-chip">{filtered.length} berkas</span>
			</div>

			{loading ? (
				<div className="ld-loading">
					<LoaderCircle size={24} className="spin" /> Memuat berkas...
				</div>
			) : filtered.length === 0 ? (
				<div className="ld-empty ld-empty-lg">
					<div className="ld-empty-icon">
						<FolderOpen size={28} strokeWidth={1.4} />
					</div>
					<h3>
						{query.trim() || courseFilter !== 'all' || accessFilter !== 'all' || kindFilter !== 'all'
							? 'Tidak ada berkas yang cocok'
							: 'Pustaka berkas masih kosong'}
					</h3>
					<p>
						{query.trim() || courseFilter !== 'all' || accessFilter !== 'all' || kindFilter !== 'all'
							? 'Coba kata kunci lain atau ubah filter.'
							: 'Unggah berkas pertama Anda — dokumen materi, gambar, audio, atau video — dan tautkan ke mata kuliah, CPMK, Sub-CPMK, atau sesi.'}
					</p>
					{!query.trim() &&
						courseFilter === 'all' &&
						accessFilter === 'all' &&
						kindFilter === 'all' && (
							<div className="ld-empty-actions">
								<button
									type="button"
									className="ld-btn-primary"
									onClick={() => setDialog({ mode: 'create' })}
								>
									<Plus size={16} /> Unggah berkas pertama
								</button>
							</div>
						)}
				</div>
			) : (
				<section className="ld-panel">
					<ul className="flb-list">
						{filtered.map((record) => {
							const kind = fileKindFor(record.file);
							const Icon = KIND_ICONS[kind];
							const url = record.file ? pb.files.getURL(record, record.file) : '';
							const courseName =
								record.expand?.course?.title ||
								courses.find((c) => c.id === record.course)?.title;
							const cpmkCode =
								record.expand?.cpmk?.code || cpmks.find((c) => c.id === record.cpmk)?.code;
							const subCpmkCode =
								record.expand?.subCpmk?.code ||
								subCpmks.find((c) => c.id === record.subCpmk)?.code;
							const sessionTitle =
								record.expand?.session?.title ||
								sessions.find((s) => s.id === record.session)?.title;
							const sessionWeek =
								record.expand?.session?.week ||
								sessions.find((s) => s.id === record.session)?.week;
							const uploader =
								record.owner === me
									? (record.expand?.owner?.name || 'Anda')
									: 'Dosen lain';
							const links: { label: string; value: string }[] = [];
							if (courseName) links.push({ label: 'Mata kuliah', value: courseName });
							if (cpmkCode) links.push({ label: 'CPMK', value: cpmkCode });
							if (subCpmkCode) links.push({ label: 'Sub-CPMK', value: subCpmkCode });
							if (sessionTitle)
								links.push({
									label: 'Sesi',
									value: sessionWeek ? `Minggu ${sessionWeek} — ${sessionTitle}` : sessionTitle,
								});
							const mine = record.owner === me;
							const extraction = extractionByFile.get(record.id);
							const procState = processingStateFor(record, extraction);
							const procBusy = processingId === record.id || procState === 'processing';

							return (
								<li key={record.id} className="flb-row">
									<div className="flb-icon" data-kind={kind}>
										{kind === 'image' && url ? (
											<img src={url} alt="" loading="lazy" />
										) : (
											<Icon size={22} strokeWidth={1.75} aria-hidden />
										)}
									</div>
									<div className="flb-main">
										<div className="flb-title-row">
											<strong>{record.title}</strong>
											{mine ? (
												<span className={`flb-badge proc-${procState}`}>
													{EXTRACTION_STATUS_LABELS[procState]}
												</span>
											) : (
												<span className={`flb-badge status-${record.status}`}>
													{STATUS_LABELS[record.status]}
												</span>
											)}
											<span className={`flb-badge access-${record.access}`}>
												{ACCESS_LABELS[record.access]}
											</span>
										</div>
										<small className="flb-filename">{record.file || 'Tanpa berkas'}</small>
										{record.description ? (
											<p className="flb-desc">{record.description}</p>
										) : null}
										<div className="flb-meta">
											<span className="flb-chip">{FILE_KIND_LABELS[kind]}</span>
											<span className="flb-chip">Versi {record.version || 1}</span>
											{record.restoredFrom ? (
												<span className="flb-chip">Dipulihkan dari versi {record.restoredFrom}</span>
											) : null}
											<span className="flb-chip">{formatBytes(record.size)}</span>
											<span className="flb-chip">Diunggah oleh {uploader}</span>
											<span className="flb-chip">{dateLabel(record.created)}</span>
										</div>
										{mine &&
										extraction &&
										(extraction.status === 'ready' || extraction.status === 'review') ? (
											<div className="flb-meta">
												{extraction.language ? (
													<span className="flb-chip">
														Bahasa{' '}
														{LANGUAGE_LABELS[extraction.language as DetectedLanguage] ??
															extraction.language}
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
											</div>
										) : null}
										{mine &&
										extraction &&
										(extraction.status === 'failed' || extraction.status === 'review') &&
										extraction.failureReason ? (
											<p
												className={`flb-extract-note${extraction.status === 'failed' ? ' failed' : ''}`}
											>
												{extraction.failureReason}
											</p>
										) : null}
										{links.length > 0 ? (
											<div className="flb-links">
												{links.map((link) => (
													<span key={link.label} className="flb-link">
														<small>{link.label}</small>
														{link.value}
													</span>
												))}
											</div>
										) : (
											<p className="flb-unlinked">Belum ditautkan ke entitas akademik.</p>
										)}
									</div>
									<div className="flb-actions">
										{url ? (
											<>
												<a
													className="ld-icon-action"
													href={url}
													target="_blank"
													rel="noreferrer"
													aria-label={`Pratinjau ${record.title}`}
													title="Pratinjau berkas asli"
												>
													<Eye size={16} strokeWidth={1.75} />
												</a>
												<a
													className="ld-icon-action"
													href={url}
													download
													aria-label={`Unduh ${record.title}`}
													title="Unduh berkas asli"
												>
													<Download size={16} strokeWidth={1.75} />
												</a>
											</>
										) : null}
										{mine ? (
											<>
												<Link
													className="ld-icon-action"
													to={`/app/berkas/${record.id}`}
													aria-label={`Konteks ${record.title}`}
													title="Atur konteks akademik"
												>
													<BookOpenText size={16} strokeWidth={1.75} />
												</Link>
												<button
													type="button"
													className="ld-icon-action"
													onClick={() => setHistoryFor(record)}
													aria-label={`Riwayat versi ${record.title}`}
													title="Riwayat versi"
												>
													<History size={16} strokeWidth={1.75} />
												</button>
												<button
													type="button"
													className="ld-icon-action"
													onClick={() => setDialog({ mode: 'edit', record })}
													aria-label={`Ubah ${record.title}`}
													title="Ubah berkas"
												>
													<Pencil size={16} strokeWidth={1.75} />
												</button>
												<button
													type="button"
													className="ld-icon-action danger"
													onClick={() => void remove(record)}
													disabled={deleting === record.id}
													aria-label={`Hapus ${record.title}`}
													title="Hapus berkas"
												>
													{deleting === record.id ? (
														<LoaderCircle size={16} className="spin" />
													) : (
														<Trash2 size={16} strokeWidth={1.75} />
													)}
												</button>
												<button
													type="button"
													className="ld-icon-action"
													onClick={() => void reprocess(record)}
													disabled={procBusy}
													aria-label={`${procState === 'waiting' ? 'Proses' : 'Proses ulang'} ${record.title}`}
													title={procState === 'waiting' ? 'Proses dokumen' : 'Proses ulang dokumen'}
												>
													{processingId === record.id ? (
														<LoaderCircle size={16} className="spin" />
													) : (
														<RefreshCw size={16} strokeWidth={1.75} />
													)}
												</button>
											</>
										) : null}
									</div>
								</li>
							);
						})}
					</ul>
				</section>
			)}

			{dialog && (
				<FileUploadDialog
					record={dialog.mode === 'edit' ? dialog.record : null}
					courses={courses}
					cpmks={cpmks}
					subCpmks={subCpmks}
					sessions={sessions}
					onClose={() => setDialog(null)}
					onSaved={() => {
						setDialog(null);
						filesQuery.reload();
						extractionsQuery.reload();
					}}
				/>
			)}

			{historyFor && (
				<FileVersionHistory
					record={historyFor}
					onClose={() => setHistoryFor(null)}
					onRestored={() => {
						setHistoryFor(null);
						filesQuery.reload();
						extractionsQuery.reload();
					}}
				/>
			)}
		</div>
	);
}
