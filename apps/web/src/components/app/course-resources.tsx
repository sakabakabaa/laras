import { PracticeMascot } from './practice-mascot';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
	BookOpenText,
	Download,
	ExternalLink,
	FileAudio,
	FileImage,
	FileSpreadsheet,
	FileText,
	FileVideo,
	File as FileIcon,
	LoaderCircle,
	Pencil,
	Plus,
	Trash2,
	X,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import { useCachedQuery } from '@/hooks/use-cached-query';
import type {
	CourseResource,
	ClassSession,
	FileAccess,
	FileLibraryRecord,
} from '@/lib/learning';
import { dateLabel, errorMessage } from '@/lib/learning';
import { useCourseResources } from '@/hooks/use-course-resources';
import { ResourceForm } from '@/components/app/resource-form';
import { confirmDialog } from '@/components/confirm-dialog';
import { AppModal } from '@/components/app/app-modal';
import { useT } from '@/lib/i18n';
import {
	CATEGORY_LABEL,
	canPreview,
	fileCategory,
	formatBytes,
	resourceFileUrl,
	type FileCategory,
} from '@/lib/resources';

const CATEGORY_ICON: Record<FileCategory, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
	pdf: FileText,
	slides: FileText,
	document: FileText,
	spreadsheet: FileSpreadsheet,
	image: FileImage,
	audio: FileAudio,
	video: FileVideo,
	file: FileIcon,
};

/**
 * A resource row in the course Berkas section. Native rows come from
 * `course_resources` (fully editable here); library rows are auto-linked from
 * the lecturer's `file_library` and are managed from the Berkas menu — they
 * appear here as preview/download-only entries so a file added in Berkas and
 * associated with this mata kuliah also shows up here without a duplicate
 * upload.
 */
type ResourceItem = CourseResource & {
	source: 'native' | 'library';
	access?: FileAccess;
};

/**
 * Map a file_library record into a resource row. The original record is
 * spread so `pb.files.getURL` can read `collectionId`/`collectionName` and
 * build the correct download URL for the library file.
 */
function libraryFileToItem(record: FileLibraryRecord): ResourceItem {
	return {
		...record,
		kind: 'file',
		url: '',
		session: record.session || '',
		description: record.description || '',
		source: 'library',
		access: record.access,
	} as ResourceItem;
}

const ACCESS_LABEL: Record<FileAccess, string> = {
	faculty: 'Dosen saja',
	student: 'Dosen & mahasiswa',
};

type Props = {
	courseId: string;
	canEdit: boolean;
	/** Student view hides management actions and uses quieter copy. */
	isStudent: boolean;
};

export function CourseResources({ courseId, canEdit, isStudent }: Props) {
	const t = useT();
	const {
		resources: nativeResources,
		sessions,
		loading: nativeLoading,
		error: nativeError,
		reload: nativeReload,
	} = useCourseResources(courseId);

	// Auto-link: library files associated with this course also appear here.
	// PocketBase access rules enforce visibility — students see course-linked
	// files shared with them, while faculty sees their own files.
	const libraryQuery = useCachedQuery<FileLibraryRecord[]>(
		courseId ? `file_library:course=${courseId}:-created` : null,
		() =>
			pb.collection('file_library').getFullList<FileLibraryRecord>({
				filter: pb.filter('course = {:id}', { id: courseId }),
				sort: '-created',
			}),
	);

	const loading = nativeLoading || libraryQuery.loading;
	const error = nativeError || libraryQuery.error;
	const reload = useCallback(() => {
		nativeReload();
		libraryQuery.reload();
	}, [nativeReload, libraryQuery]);

	// Merge native course_resources with auto-linked library files. Both lists
	// stay independent — no record is duplicated, they simply render together.
	const allResources = useMemo<ResourceItem[]>(() => {
		const native: ResourceItem[] = nativeResources.map((r) => ({
			...r,
			source: 'native' as const,
		}));
		const library: ResourceItem[] = (libraryQuery.data ?? []).map(libraryFileToItem);
		return [...native, ...library].sort((a, b) => b.created.localeCompare(a.created));
	}, [nativeResources, libraryQuery.data]);

	const [editing, setEditing] = useState<CourseResource | 'new' | null>(null);
	const [preview, setPreview] = useState<ResourceItem | null>(null);
	const [sizes, setSizes] = useState<Record<string, number>>({});
	const [busyId, setBusyId] = useState<string | null>(null);
	const [actionError, setActionError] = useState('');

	// Fetch file sizes via HEAD for file resources (PocketBase doesn't store size).
	useEffect(() => {
		let ignore = false;
		const fileResources = allResources.filter((r) => r.kind === 'file' && r.file);
		if (fileResources.length === 0) return;
		void Promise.all(
			fileResources.map(async (r) => {
				try {
					const res = await fetch(resourceFileUrl(r), { method: 'HEAD' });
					const len = Number(res.headers.get('content-length') || 0);
					return [r.id, len] as const;
				} catch {
					return [r.id, 0] as const;
				}
			}),
		).then((entries) => {
			if (ignore) return;
			const map: Record<string, number> = {};
			for (const [id, len] of entries) if (len > 0) map[id] = len;
			setSizes(map);
		});
		return () => {
			ignore = true;
		};
	}, [allResources]);

	const sessionMap = useMemo(() => {
		const map = new Map<string, ClassSession>();
		for (const s of sessions) map.set(s.id, s);
		return map;
	}, [sessions]);

	// Group resources: pertemuan-linked first (by week), then "Umum".
	const groups = useMemo(() => {
		const bySession = new Map<string, ResourceItem[]>();
		const general: ResourceItem[] = [];
		for (const r of allResources) {
			if (r.session && sessionMap.has(r.session)) {
				const arr = bySession.get(r.session) || [];
				arr.push(r);
				bySession.set(r.session, arr);
			} else {
				general.push(r);
			}
		}
		const sessionGroups = sessions
			.map((s) => ({ session: s, items: bySession.get(s.id) || [] }))
			.filter((g) => g.items.length > 0)
			.sort((a, b) => a.session.week - b.session.week);
		return { sessionGroups, general };
	}, [allResources, sessions, sessionMap]);

	const remove = async (resource: ResourceItem) => {
		if (
			!(await confirmDialog({
				title: 'Hapus sumber daya',
				message: `Hapus sumber daya “${resource.title}”?`,
				variant: 'danger',
				confirmLabel: 'Hapus',
			}))
		)
			return;
		setBusyId(resource.id);
		setActionError('');
		try {
			await pb.collection('course_resources').delete(resource.id);
			invalidate('course_resources');
			reload();
		} catch (err) {
			setActionError(errorMessage(err));
		} finally {
			setBusyId(null);
		}
	};

	if (loading) {
		return (
			<div className="ld-loading">
				<LoaderCircle size={24} className="spin" /> {isStudent ? t('student.resources.loading') : 'Memuat sumber daya...'}
			</div>
		);
	}

	return (
		<div className="res-area">
			<div className={`res-head${isStudent ? ' student-page-banner' : ''}`}>
				<div>
					<span className="ld-eyebrow">{isStudent ? t('student.resources.eyebrow') : 'Sumber Daya Mata Kuliah'}</span>
					<h2 className="res-title">
						{isStudent ? t('student.resources.title') : 'Kelola sumber daya'}
					</h2>
					<p className="res-sub">
						{isStudent
							? t('student.resources.description')
							: 'Unggah slide, dokumen, media, atau tautan. Berkas dari menu Berkas yang ditautkan ke mata kuliah ini juga tampil otomatis.'}
					</p>
				</div>
                {isStudent && <span className="student-banner-mascot" aria-hidden="true"><PracticeMascot size={85} /></span>}
				{canEdit && (
					<button type="button" className="ld-btn-primary" onClick={() => setEditing('new')}>
						<Plus size={17} /> Tambah sumber daya
					</button>
				)}
			</div>

			{error && (
				<div className="ld-alert" role="alert">
					{error}{' '}
					<button type="button" onClick={() => reload()}>
						Coba lagi
					</button>
				</div>
			)}
			{actionError && (
				<div className="ld-alert" role="alert">
					{actionError}{' '}
					<button type="button" onClick={() => setActionError('')}>
						Tutup
					</button>
				</div>
			)}

			{allResources.length === 0 ? (
				<div className="ld-empty res-empty">
					<div className="ld-empty-icon">
						<FileIcon size={26} strokeWidth={1.4} />
					</div>
					<h3>{isStudent ? t('student.resources.emptyTitle') : 'Belum ada sumber daya'}</h3>
					<p>
						{isStudent
							? t('student.resources.emptyDescription')
							: 'Tambahkan slide, dokumen, media, atau tautan, atau tautkan berkas dari menu Berkas ke mata kuliah ini.'}
					</p>
					{canEdit && (
						<button
							type="button"
							className="ld-btn-primary"
							onClick={() => setEditing('new')}
						>
							<Plus size={17} /> Tambah sumber daya pertama
						</button>
					)}
				</div>
			) : (
				<div className="res-groups">
					{groups.sessionGroups.map(({ session, items }) => (
						<section className="res-group" key={session.id}>
							<div className="res-group-head">
								<span className="res-week">
									{isStudent ? t('worksheet.week', { week: String(session.week || '—').padStart(2, '0') }) : `Minggu ${String(session.week || '—').padStart(2, '0')}`}
								</span>
								<h3>{session.title}</h3>
								<span className="ld-chip">{items.length}</span>
							</div>
							<ul className="res-list">
								{items.map((r) => (
									<ResourceRow
										key={`${r.source}:${r.id}`}
										resource={r}
										size={sizes[r.id]}
										canEdit={canEdit}
										isStudent={isStudent}
										busy={busyId === r.id}
										onPreview={() => setPreview(r)}
										onEdit={() => setEditing(r)}
										onRemove={() => void remove(r)}
									/>
								))}
							</ul>
						</section>
					))}

					{groups.general.length > 0 && (
						<section className="res-group">
							<div className="res-group-head">
								<h3>{isStudent ? t('student.resources.general') : 'Umum'}</h3>
								<span className="ld-chip">{groups.general.length}</span>
							</div>
							<ul className="res-list">
								{groups.general.map((r) => (
									<ResourceRow
										key={`${r.source}:${r.id}`}
										resource={r}
										size={sizes[r.id]}
										canEdit={canEdit}
										isStudent={isStudent}
										busy={busyId === r.id}
										onPreview={() => setPreview(r)}
										onEdit={() => setEditing(r)}
										onRemove={() => void remove(r)}
									/>
								))}
							</ul>
						</section>
					)}
				</div>
			)}

			{editing && (
				<ResourceForm
					courseId={courseId}
					sessions={sessions}
					resource={editing === 'new' ? undefined : editing}
					onClose={() => setEditing(null)}
					onSaved={() => {
						setEditing(null);
						reload();
					}}
				/>
			)}

			{preview && (
				<ResourcePreview
					resource={preview}
					isStudent={isStudent}
					onClose={() => setPreview(null)}
				/>
			)}
		</div>
	);
}

function ResourceRow({
	resource,
	size,
	canEdit,
	isStudent,
	busy,
	onPreview,
	onEdit,
	onRemove,
}: {
	resource: ResourceItem;
	size?: number;
	canEdit: boolean;
	isStudent: boolean;
	busy: boolean;
	onPreview: () => void;
	onEdit: () => void;
	onRemove: () => void;
}) {
	const t = useT();
	const isLink = resource.kind === 'link';
	const isLibrary = resource.source === 'library';
	const filename = resource.file || '';
	const category = isLink ? 'file' : fileCategory(filename);
	const Icon = CATEGORY_ICON[category];
	const label = isLink ? 'Tautan' : CATEGORY_LABEL[category];
	const href = isLink ? resource.url : resourceFileUrl(resource);
	const previewable = !isLink && canPreview(category);

	return (
		<li className="res-row">
			<span className={`res-ico ${category}`}>
				<Icon size={18} strokeWidth={1.75} />
			</span>
			<div className="res-meta">
				<strong>{resource.title}</strong>
				{resource.description && <p>{resource.description}</p>}
				<div className="res-tags">
					<span className="res-tag">{label}</span>
					{isLibrary && (
						<span className="res-tag res-tag-library" title="Berkas dari menu Berkas">
							Berkas
						</span>
					)}
					{isLibrary && resource.access && (
						<span className="res-tag" title="Tingkat akses berkas">
							Akses {ACCESS_LABEL[resource.access]}
						</span>
					)}
					{!isLink && <span className="res-tag">{formatBytes(size)}</span>}
					<span className="res-tag">{dateLabel(resource.created)}</span>
				</div>
			</div>
			<div className="res-actions">
				{previewable && (
					<button
						type="button"
						className="ld-text-btn"
						onClick={onPreview}
						 title={isStudent ? t('student.resources.preview') : 'Pratinjau'}
					>
						{isStudent ? t('student.resources.view') : 'Lihat'}
					</button>
				)}
				{isLink ? (
					<a
						className="ld-outline-action sm"
						href={href}
						target="_blank"
						rel="noreferrer"
					>
						<ExternalLink size={15} /> {isStudent ? t('student.resources.open') : 'Buka'}
					</a>
				) : isStudent ? null : (
					<a
						className="ld-outline-action sm"
						href={href}
						target="_blank"
						rel="noreferrer"
						download
						title="Unduh berkas"
					>
						<Download size={15} /> Unduh
					</a>
				)}
				{isLibrary && canEdit ? (
					<Link
						className="ld-icon-action"
						to={`/app/berkas/${resource.id}`}
						aria-label={`Kelola ${resource.title} di Berkas`}
						title="Kelola di menu Berkas"
					>
						<BookOpenText size={16} />
					</Link>
				) : null}
				{canEdit && !isLibrary && (
					<>
						<button
							type="button"
							className="ld-icon-action sm"
							aria-label={`Edit ${resource.title}`}
							title="Edit"
							onClick={onEdit}
							disabled={busy}
						>
							<Pencil size={15} />
						</button>
						<button
							type="button"
							className="ld-icon-action sm danger"
							aria-label={`Hapus ${resource.title}`}
							title="Hapus"
							onClick={onRemove}
							disabled={busy}
						>
							{busy ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}
						</button>
					</>
				)}
			</div>
		</li>
	);
}

function ResourcePreview({
	resource,
	isStudent,
	onClose,
}: {
	resource: ResourceItem;
	isStudent: boolean;
	onClose: () => void;
}) {
	const category = fileCategory(resource.file);
	const url = resourceFileUrl(resource);

	return (
		<AppModal open onClose={onClose} title={resource.title} className="res-preview">
			<div className="res-preview-head">
					<h3 id="res-preview-title">{resource.title}</h3>
					<button type="button" aria-label="Tutup pratinjau" onClick={onClose}>
						<X size={22} />
					</button>
				</div>
				<div className="res-preview-body">
					{category === 'image' && <img src={url} alt={resource.title} />}
					{category === 'pdf' && <iframe src={url} title={resource.title} />}
					{category === 'video' && <video src={url} controls />}
					{category === 'audio' && <audio src={url} controls />}
				</div>
				<div className="res-preview-foot">
					{isStudent ? (
						<span className="res-preview-note">Mode baca — unduhan dinonaktifkan untuk mahasiswa.</span>
					) : (
						<a className="ld-btn-primary" href={url} download>
							<Download size={16} /> Unduh berkas
						</a>
					)}
				</div>
		</AppModal>
	);
}
