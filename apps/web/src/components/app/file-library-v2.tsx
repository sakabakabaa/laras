import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	Download,
	File,
	FileAudio,
	FileImage,
	FileText,
	FileVideo,
	History,
	AlignJustify,
	MoreHorizontal,
	List as ListIcon,
	LoaderCircle,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	Trash2,
	Upload,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { useAuth } from '@/hooks/use-auth';
import { dateLabel, errorMessage, linkIds } from '@/lib/learning';
import type { ClassSession, Course, Cpmk, FileLibraryRecord, SubCpmk } from '@/lib/learning';
import {
	ACCESS_LABELS,
	EXTRACTION_STATUS_LABELS,
	FILE_KIND_LABELS,
	formatBytes,
	processingStateFor,
	reprocessLibraryFiles,
	type FileKind,
} from '@/lib/file-library';
import {
	buildFilter,
	duplicateKeys,
	groupByCourse,
	LIBRARY_TABS,
	matchesTab,
	SORT_FIELD,
	type LibraryTab,
	type SortKey,
} from '@/lib/file-library-nav';
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

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
	{ value: 'newest', label: 'Terbaru diunggah' },
	{ value: 'oldest', label: 'Terlama diunggah' },
	{ value: 'title', label: 'Judul A–Z' },
	{ value: 'largest', label: 'Ukuran terbesar' },
];

const STATUS_OPTIONS = [
	{ value: 'all', label: 'Semua status' },
	{ value: 'ready', label: 'Siap dipakai' },
	{ value: 'review', label: 'Perlu ditinjau' },
	{ value: 'failed', label: 'Gagal diproses' },
	{ value: 'pending', label: 'Belum diproses' },
];

/**
 * Lecturer file library (Phase 1 + 2).
 *
 * Navigation first: tabs for the questions lecturers actually ask ("what needs
 * action?", "what is not linked to a course?"), a course → meeting grouping,
 * and a sticky filter bar. Phase 2 moved filtering and paging to PocketBase —
 * the page no longer downloads the whole library — and added bulk actions.
 *
 * Grouped mode is capped at 300 rows on purpose: grouping needs the full set in
 * memory, so it is offered for triage rather than as the default browsing mode.
 */
export function FileLibraryV2() {
	const { user } = useAuth();
	const me = user?.id || '';

	const [tab, setTab] = useState<LibraryTab>('all');
	const [query, setQuery] = useState('');
	const [courseFilter, setCourseFilter] = useState('all');
	const [kindFilter, setKindFilter] = useState('all');
	const [accessFilter, setAccessFilter] = useState('all');
	const [statusFilter, setStatusFilter] = useState('all');
	const [sort, setSort] = useState<SortKey>('newest');
	const [grouped, setGrouped] = useState(false);
	const [view, setView] = useState<'list' | 'detail'>('list');
	const [menuFor, setMenuFor] = useState<{ id: string; top: number; left: number } | null>(null);
	const [page, setPage] = useState(1);
	const [reloadKey, setReloadKey] = useState(0);

	const [items, setItems] = useState<FileLibraryRecord[]>([]);
	const [total, setTotal] = useState(0);
	const [counts, setCounts] = useState<{ action: number; unlinked: number }>({ action: 0, unlinked: 0 });
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	const [courses, setCourses] = useState<Course[]>([]);
	const [cpmks, setCpmks] = useState<Cpmk[]>([]);
	const [subCpmks, setSubCpmks] = useState<SubCpmk[]>([]);
	const [sessions, setSessions] = useState<ClassSession[]>([]);

	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
	const [busy, setBusy] = useState('');
	const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit'; record: FileLibraryRecord } | null>(null);
	const [historyFor, setHistoryFor] = useState<FileLibraryRecord | null>(null);

	const perPage = view === 'list' ? 40 : 24;
	const reload = useCallback(() => setReloadKey((key) => key + 1), []);

	// The row menu closes on any outside click or Escape; opening it stops
	// propagation so the same click cannot close it again.
	useEffect(() => {
		if (!menuFor) return;
		const close = () => setMenuFor(null);
		document.addEventListener('click', close);
		document.addEventListener('keydown', close);
		return () => {
			document.removeEventListener('click', close);
			document.removeEventListener('keydown', close);
		};
	}, [menuFor]);

	// Reference data for filters and labels (small collections).
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [c, cp, sc, se] = await Promise.all([
					pb.collection('courses').getFullList<Course>({ sort: '-created' }),
					pb.collection('cpmk').getFullList<Cpmk>({ sort: 'order' }),
					pb.collection('sub_cpmk').getFullList<SubCpmk>({ sort: 'order' }),
					pb.collection('class_sessions').getFullList<ClassSession>({ sort: 'date' }),
				]);
				if (cancelled) return;
				setCourses(c.filter((row) => row.owner === me));
				setCpmks(cp.filter((row) => row.owner === me));
				setSubCpmks(sc.filter((row) => row.owner === me));
				setSessions(se.filter((row) => row.owner === me));
			} catch {
				/* filters degrade to "all" if reference data fails */
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [me]);

	// Counts for the tabs that need attention — cheap: one row each.
	useEffect(() => {
		if (!me) return;
		let cancelled = false;
		void (async () => {
			try {
				const [action, unlinked] = await Promise.all([
					pb.collection('file_library').getList(1, 1, {
						filter: `owner="${me}" && (parseStatus="failed" || (parseStatus="review" && parsedChars=0))`,
					}),
					pb.collection('file_library').getList(1, 1, {
						filter: `owner="${me}" && course:length=0 && session:length=0 && cpmk:length=0 && subCpmk:length=0`,
					}),
				]);
				if (!cancelled) setCounts({ action: action.totalItems, unlinked: unlinked.totalItems });
			} catch {
				/* counts are advisory */
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [me, reloadKey]);

	const filter = useMemo(
		() =>
			buildFilter({
				tab,
				search: query,
				courseId: courseFilter,
				kind: kindFilter,
				access: accessFilter,
				status: statusFilter,
				ownerId: me,
			}),
		[tab, query, courseFilter, kindFilter, accessFilter, statusFilter, me],
	);

	// Server-side list. Grouped mode pulls a bounded window and groups in memory.
	useEffect(() => {
		if (!me) return;
		let cancelled = false;
		void (async () => {
			setLoading(true);
			setError('');
			try {
				const result = await pb.collection('file_library').getList<FileLibraryRecord>(
					grouped ? 1 : page,
					grouped ? 300 : perPage,
					{ filter, sort: SORT_FIELD[sort], expand: 'owner,course,cpmk,subCpmk,session' },
				);
				if (cancelled) return;
				setItems(result.items);
				setTotal(result.totalItems);
			} catch (err) {
				if (!cancelled) setError(errorMessage(err));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [me, filter, sort, page, perPage, grouped, reloadKey]);

	const duplicates = useMemo(() => duplicateKeys(items), [items]);
	const visible = useMemo(() => {
		const now = Date.now();
		return items.filter((record) => matchesTab(record, tab, duplicates, now));
	}, [items, tab, duplicates]);

	const courseLabels = useMemo(() => new Map(courses.map((c) => [c.id, c.title])), [courses]);
	const sessionLabels = useMemo(
		() => new Map(sessions.map((s) => [s.id, s.title || `Pertemuan ${s.week ?? ''}`.trim()])),
		[sessions],
	);
	const groups = useMemo(
		() => (grouped ? groupByCourse(visible, courseLabels, sessionLabels) : []),
		[grouped, visible, courseLabels, sessionLabels],
	);

	const pages = Math.max(1, Math.ceil(total / perPage));
	const hasFilters =
		Boolean(query.trim()) || courseFilter !== 'all' || kindFilter !== 'all' || accessFilter !== 'all' || statusFilter !== 'all';

	const clearFilters = () => {
		setQuery('');
		setCourseFilter('all');
		setKindFilter('all');
		setAccessFilter('all');
		setStatusFilter('all');
		setPage(1);
	};

	const toggleSelected = (id: string) => {
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const selectAllVisible = () => {
		setSelected((current) => {
			const allSelected = visible.every((record) => current.has(record.id));
			const next = new Set(current);
			for (const record of visible) {
				if (allSelected) next.delete(record.id);
				else next.add(record.id);
			}
			return next;
		});
	};

	const bulkReprocess = async () => {
		const ids = [...selected];
		if (ids.length === 0) return;
		setBulkProgress({ done: 0, total: ids.length });
		try {
			const result = await reprocessLibraryFiles(ids, (done, total) => setBulkProgress({ done, total }));
			setSelected(new Set());
			if (result.failed.length > 0) {
				setError(`${result.ok} berhasil diproses, ${result.failed.length} gagal: ${result.failed[0].message}`);
			}
			reload();
		} finally {
			setBulkProgress(null);
		}
	};

	const bulkDelete = async () => {
		const ids = [...selected];
		if (ids.length === 0) return;
		const ok = await confirmDialog({
			title: `Hapus ${ids.length} berkas?`,
			message: 'Berkas asli, riwayat versi, dan hasil penguraian ikut dihapus. Tindakan ini tidak dapat dibatalkan.',
			confirmLabel: 'Hapus',
			variant: 'danger',
		});
		if (!ok) return;
		setBusy('bulk-delete');
		try {
			for (const id of ids) await pb.collection('file_library').delete(id);
			setSelected(new Set());
			reload();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy('');
		}
	};

	const remove = async (record: FileLibraryRecord) => {
		const ok = await confirmDialog({
			title: `Hapus "${record.title}"?`,
			message: 'Berkas asli, riwayat versi, dan hasil penguraian ikut dihapus.',
			confirmLabel: 'Hapus',
			variant: 'danger',
		});
		if (!ok) return;
		setBusy(record.id);
		try {
			await pb.collection('file_library').delete(record.id);
			reload();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy('');
		}
	};

	const reprocess = async (record: FileLibraryRecord) => {
		setBusy(`proc-${record.id}`);
		try {
			await reprocessLibraryFiles([record.id]);
			reload();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy('');
		}
	};

	const fileUrl = (record: FileLibraryRecord) =>
		record.file
			? `${pb.baseURL}/api/files/file_library/${record.id}/${encodeURIComponent(record.file)}?token=${pb.authStore.token}`
			: '';

	const courseName = (record: FileLibraryRecord) => {
		const id = record.course?.[0];
		return id ? courseLabels.get(id) || 'Mata kuliah' : '—';
	};

	const statusBadge = (procState: string) => (
		<span className={`flb-badge proc-${procState}`}>
			{EXTRACTION_STATUS_LABELS[procState as keyof typeof EXTRACTION_STATUS_LABELS] || procState}
		</span>
	);

	const rowMenu = (record: FileLibraryRecord) => (
		<div className="flb-menu-wrap">
			<button
				type="button"
				className="flb-kebab"
				aria-label={`Aksi untuk ${record.title}`}
				aria-haspopup="menu"
				aria-expanded={menuFor?.id === record.id}
				onClick={(event) => {
					event.stopPropagation();
					// The list scrolls inside a clipped container, so the menu is
					// positioned fixed and flipped up when it would fall off-screen.
					const rect = event.currentTarget.getBoundingClientRect();
					const width = 188;
					const height = 190;
					const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
					const top = rect.bottom + height > window.innerHeight - 8 ? rect.top - height - 4 : rect.bottom + 4;
					setMenuFor((current) => (current?.id === record.id ? null : { id: record.id, top, left }));
				}}
			>
				<MoreHorizontal size={17} strokeWidth={2} />
			</button>
			{menuFor?.id === record.id ? (
				<div className="flb-menu" role="menu" style={{ top: menuFor.top, left: menuFor.left }}>
					<button type="button" role="menuitem" onClick={() => { setMenuFor(null); setDialog({ mode: 'edit', record }); }}>
						<Pencil size={14} strokeWidth={1.75} /> Ubah berkas
					</button>
					<button type="button" role="menuitem" onClick={() => { setMenuFor(null); setHistoryFor(record); }}>
						<History size={14} strokeWidth={1.75} /> Riwayat versi
					</button>
					<button
						type="button"
						role="menuitem"
						disabled={busy === `proc-${record.id}`}
						onClick={() => { setMenuFor(null); void reprocess(record); }}
					>
						<RefreshCw size={14} strokeWidth={1.75} /> Proses ulang
					</button>
					{record.file ? (
						<a role="menuitem" href={fileUrl(record)} target="_blank" rel="noreferrer" onClick={() => setMenuFor(null)}>
							<Download size={14} strokeWidth={1.75} /> Unduh
						</a>
					) : null}
					<span className="flb-menu-sep" />
					<button type="button" role="menuitem" className="danger" onClick={() => { setMenuFor(null); void remove(record); }}>
						<Trash2 size={14} strokeWidth={1.75} /> Hapus
					</button>
				</div>
			) : null}
		</div>
	);

	const renderRow = (record: FileLibraryRecord) => {
		const kind = (record.kind as FileKind) || 'document';
		const Icon = KIND_ICONS[kind] || File;
		const state = processingStateFor(record, null);
		const procState = record.parseStatus || (state === 'processing' ? 'processing' : 'waiting');
		const linkCount =
			linkIds(record.course).length + linkIds(record.session).length + linkIds(record.cpmk).length + linkIds(record.subCpmk).length;

		if (view === 'list') {
			return (
				<li key={record.id} className="flb-item" data-view="list">
					<label className="flb-check">
						<input
							type="checkbox"
							checked={selected.has(record.id)}
							onChange={() => toggleSelected(record.id)}
							aria-label={`Pilih ${record.title}`}
						/>
					</label>
					<div className="flb-icon sm" data-kind={kind}>
						{kind === 'image' && record.file ? <img src={fileUrl(record)} alt="" loading="lazy" /> : <Icon size={18} strokeWidth={1.75} aria-hidden />}
					</div>
					<div className="flb-name">
						<strong title={record.title}>{record.title}</strong>
						<small>{record.file || 'Tanpa berkas'}</small>
					</div>
					{statusBadge(procState)}
					<span className="flb-col course" title={courseName(record)}>{courseName(record)}</span>
					<span className="flb-col size">{formatBytes(record.size)}</span>
					<span className="flb-col date">{dateLabel(record.created)}</span>
					{rowMenu(record)}
				</li>
			);
		}

		return (
			<li key={record.id} className="flb-row">
				<label className="flb-check">
					<input
						type="checkbox"
						checked={selected.has(record.id)}
						onChange={() => toggleSelected(record.id)}
						aria-label={`Pilih ${record.title}`}
					/>
				</label>
				<div className="flb-icon" data-kind={kind}>
					{kind === 'image' && record.file ? <img src={fileUrl(record)} alt="" loading="lazy" /> : <Icon size={22} strokeWidth={1.75} aria-hidden />}
				</div>
				<div className="flb-main">
					<div className="flb-title-row">
						<strong>{record.title}</strong>
						{statusBadge(procState)}
						<span className={`flb-badge access-${record.access}`}>{ACCESS_LABELS[record.access]}</span>
					</div>
					<small className="flb-filename">{record.file || 'Tanpa berkas'}</small>
					<div className="flb-meta">
						<span className="flb-chip">{FILE_KIND_LABELS[kind]}</span>
						<span className="flb-chip">{formatBytes(record.size)}</span>
						<span className="flb-chip">{dateLabel(record.created)}</span>
						<span className="flb-chip">{linkCount > 0 ? `${linkCount} tautan` : 'Belum ditautkan'}</span>
					</div>
					<details className="flb-detail">
						<summary>Detail</summary>
						<div className="flb-meta">
							{record.parsedChars ? <span className="flb-chip">{record.parsedChars.toLocaleString('id-ID')} karakter teks</span> : null}
							{record.parsedAt ? <span className="flb-chip">Diurai {dateLabel(record.parsedAt)}</span> : null}
							{record.description ? <span className="flb-chip">{record.description}</span> : null}
							<span className="flb-chip">Versi {record.version || 1}</span>
						</div>
					</details>
				</div>
				{rowMenu(record)}
			</li>
		);
	};

	return (
		<div className="flb-page">
			<div className="flb-head">
				<div>
					<span className="ld-eyebrow">Pustaka berkas</span>
					<h1>Manajemen Berkas</h1>
					<p className="flb-intro">
						Unggah dokumen, gambar, audio, atau video, lalu tautkan ke mata kuliah, CPMK, Sub-CPMK, atau sesi.
					</p>
				</div>
				<button type="button" className="ld-btn-primary" onClick={() => setDialog({ mode: 'create' })}>
					<Upload size={15} /> Unggah berkas
				</button>
			</div>

			<nav className="flb-tabs" aria-label="Tampilan pustaka">
				{LIBRARY_TABS.map((entry) => {
					const badge = entry.id === 'action' ? counts.action : entry.id === 'unlinked' ? counts.unlinked : 0;
					return (
						<button
							key={entry.id}
							type="button"
							className={`flb-tab${tab === entry.id ? ' active' : ''}`}
							onClick={() => {
								setTab(entry.id);
								setPage(1);
								setSelected(new Set());
							}}
						>
							{entry.label}
							{badge > 0 ? <span className="flb-tab-count">{badge}</span> : null}
						</button>
					);
				})}
			</nav>

			<div className="flb-filters">
				<label className="flb-search">
					<Search size={15} />
					<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Cari judul atau nama berkas…" />
				</label>
				<label className="flb-select">
					<span>Mata kuliah</span>
					<select value={courseFilter} onChange={(event) => { setCourseFilter(event.target.value); setPage(1); }}>
						<option value="all">Semua mata kuliah</option>
						{courses.map((course) => (
							<option key={course.id} value={course.id}>{course.title}</option>
						))}
					</select>
				</label>
				<label className="flb-select">
					<span>Jenis</span>
					<select value={kindFilter} onChange={(event) => { setKindFilter(event.target.value); setPage(1); }}>
						<option value="all">Semua jenis</option>
						{Object.entries(FILE_KIND_LABELS).map(([value, label]) => (
							<option key={value} value={value}>{label}</option>
						))}
					</select>
				</label>
				<label className="flb-select">
					<span>Akses</span>
					<select value={accessFilter} onChange={(event) => { setAccessFilter(event.target.value); setPage(1); }}>
						<option value="all">Semua akses</option>
						{Object.entries(ACCESS_LABELS).map(([value, label]) => (
							<option key={value} value={value}>{label}</option>
						))}
					</select>
				</label>
				<label className="flb-select">
					<span>Status urai</span>
					<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
						{STATUS_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>{option.label}</option>
						))}
					</select>
				</label>
				<label className="flb-select">
					<span>Urutan</span>
					<select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
						{SORT_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>{option.label}</option>
						))}
					</select>
				</label>
				<div className="flb-view-toggles">
					<button type="button" className={`flb-toggle${grouped ? ' active' : ''}`} onClick={() => setGrouped((value) => !value)} aria-pressed={grouped}>
						Kelompokkan per mata kuliah
					</button>
					<div className="flb-seg" role="group" aria-label="Tampilan daftar">
						<button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-pressed={view === 'list'}>
							<ListIcon size={14} strokeWidth={1.75} /> Daftar
						</button>
						<button type="button" className={view === 'detail' ? 'active' : ''} onClick={() => setView('detail')} aria-pressed={view === 'detail'}>
							<AlignJustify size={14} strokeWidth={1.75} /> Detail
						</button>
					</div>
				</div>
			</div>

			<div className="flb-summary">
				<span>
					{loading ? 'Memuat…' : `${total.toLocaleString('id-ID')} berkas`}
					{hasFilters ? ' (difilter)' : ''}
				</span>
				{hasFilters ? (
					<button type="button" className="flb-clear" onClick={clearFilters}>Hapus filter</button>
				) : null}
				{selected.size > 0 ? (
					<div className="flb-bulkbar">
						<span>{selected.size} dipilih</span>
						<button type="button" className="ld-outline-action sm" onClick={selectAllVisible}>
							{visible.every((record) => selected.has(record.id)) ? 'Batalkan semua' : 'Pilih semua di halaman'}
						</button>
						<button type="button" className="ld-outline-action sm" onClick={() => void bulkReprocess()} disabled={Boolean(bulkProgress)}>
							{bulkProgress ? `${bulkProgress.done}/${bulkProgress.total}` : 'Proses ulang'}
						</button>
						<button type="button" className="ld-outline-action sm danger" onClick={() => void bulkDelete()} disabled={busy === 'bulk-delete'}>
							Hapus
						</button>
					</div>
				) : null}
			</div>

			{error ? (
				<p className="form-error" role="alert">
					{error} <button type="button" onClick={reload}>Coba lagi</button>
				</p>
			) : null}

			{loading ? (
				<p className="ld-settings-note"><LoaderCircle size={14} className="spin" /> Memuat berkas…</p>
			) : visible.length === 0 ? (
				<div className="flb-empty">
					<File size={28} strokeWidth={1.5} />
					<strong>{hasFilters || tab !== 'all' ? 'Tidak ada berkas yang cocok' : 'Pustaka berkas masih kosong'}</strong>
					<p>
						{hasFilters || tab !== 'all'
							? 'Ubah filter atau pilih tab lain.'
							: 'Unggah dokumen materi, gambar, audio, atau video, lalu tautkan ke mata kuliah.'}
					</p>
					<button type="button" className="ld-btn-primary" onClick={() => setDialog({ mode: 'create' })}>
						<Plus size={15} /> Unggah berkas pertama
					</button>
				</div>
			) : grouped ? (
				<>
					{view === 'list' ? (
						<div className="flb-thead">
							<label className="flb-check">
								<input
									type="checkbox"
									checked={visible.length > 0 && visible.every((record) => selected.has(record.id))}
									onChange={selectAllVisible}
									aria-label="Pilih semua berkas di halaman ini"
								/>
							</label>
							<span />
							<span>Nama</span>
							<span>Status</span>
							<span>Mata kuliah</span>
							<span>Ukuran</span>
							<span>Diunggah</span>
							<span />
						</div>
					) : null}
					{groups.map((group) => (
						<section key={group.key} className="flb-group">
							<header className="flb-group-head">
								<strong>{group.label}</strong>
								<span>{group.files.length} berkas</span>
							</header>
							<ul className="flb-list">{group.files.map(renderRow)}</ul>
						</section>
					))}
					{total > 300 ? <p className="ld-settings-note">Menampilkan 300 berkas pertama dari {total.toLocaleString('id-ID')}. Persempit filter untuk melihat sisanya.</p> : null}
				</>
			) : (
				<>
					{view === 'list' ? (
						<div className="flb-thead">
							<label className="flb-check">
								<input
									type="checkbox"
									checked={visible.length > 0 && visible.every((record) => selected.has(record.id))}
									onChange={selectAllVisible}
									aria-label="Pilih semua berkas di halaman ini"
								/>
							</label>
							<span />
							<span>Nama</span>
							<span>Status</span>
							<span>Mata kuliah</span>
							<span>Ukuran</span>
							<span>Diunggah</span>
							<span />
						</div>
					) : null}
					<ul className="flb-list">{visible.map(renderRow)}</ul>
					{pages > 1 ? (
						<nav className="flb-pagination" aria-label="Halaman berkas">
							<button type="button" className="ld-outline-action sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
								Sebelumnya
							</button>
							<span>Halaman {page} dari {pages}</span>
							<button type="button" className="ld-outline-action sm" disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>
								Berikutnya
							</button>
						</nav>
					) : null}
				</>
			)}

			{dialog ? (
				<FileUploadDialog
					record={dialog.mode === 'edit' ? dialog.record : null}
					courses={courses}
					cpmks={cpmks}
					subCpmks={subCpmks}
					sessions={sessions}
					onClose={() => setDialog(null)}
					onSaved={() => {
						setDialog(null);
						reload();
					}}
				/>
			) : null}

			{historyFor ? (
				<FileVersionHistory
					record={historyFor}
					onClose={() => setHistoryFor(null)}
					onRestored={() => {
						setHistoryFor(null);
						reload();
					}}
				/>
			) : null}
		</div>
	);
}
