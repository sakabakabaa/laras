import { useMemo, useState } from 'react';
import { LoaderCircle, Layers, Pencil, Plus, Trash2, X } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { useCourseSections } from '@/hooks/use-course-sections';
import type { CourseSection } from '@/lib/learning';
import { errorMessage } from '@/lib/learning';
import { AppModal } from '@/components/app/app-modal';

/**
 * Lecturer UI to create, rename, and delete sections (Kelas) for a mata
 * kuliah. Sections let one course carry multiple parallel classes, each with
 * its own jadwal, roster, and progress — while RPS, materi, dan tugas stay
 * shared at the course level.
 *
 * Deleting a section does not destroy its sessions/roster/enrollments
 * (cascadeDelete is false); those records keep working with an empty section
 * reference, falling back to the default view.
 */
export function SectionManager({
	courseId,
	onClose,
}: {
	courseId: string;
	onClose: () => void;
}) {
	const { sections, loading, error, reload } = useCourseSections(courseId);
	const [name, setName] = useState('');
	const [busy, setBusy] = useState(false);
	const [actionError, setActionError] = useState('');
	const [editing, setEditing] = useState<CourseSection | null>(null);
	const [editName, setEditName] = useState('');
	const [confirmDelete, setConfirmDelete] = useState<CourseSection | null>(null);

	const create = async () => {
		const trimmed = name.trim();
		if (!trimmed) return;
		setBusy(true);
		setActionError('');
		try {
			await pb.collection('course_sections').create({
				course: courseId,
				owner: pb.authStore.record?.id,
				name: trimmed,
			});
			invalidate('course_sections');
			setName('');
			reload();
		} catch (err) {
			setActionError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	const saveEdit = async () => {
		if (!editing) return;
		const trimmed = editName.trim();
		if (!trimmed) return;
		setBusy(true);
		setActionError('');
		try {
			await pb.collection('course_sections').update(editing.id, { name: trimmed });
			invalidate('course_sections');
			setEditing(null);
			reload();
		} catch (err) {
			setActionError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	const remove = async (section: CourseSection) => {
		setBusy(true);
		setActionError('');
		try {
			await pb.collection('course_sections').delete(section.id);
			invalidate('course_sections');
			invalidate('class_sessions');
			invalidate('course_roster');
			invalidate('enrollments');
			setConfirmDelete(null);
			reload();
		} catch (err) {
			setActionError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<AppModal open onClose={onClose} title="Kelas pada mata kuliah">
			<div className="modal-top">
					<span>KELOLA KELAS</span>
					<button type="button" aria-label="Tutup" onClick={onClose}>
						<X size={20} />
					</button>
				</div>
				<h2>Kelas pada mata kuliah</h2>
				<p>
					Buat beberapa kelas parale (mis. Kelas A, Kelas B) untuk mata kuliah ini.
					Setiap kelas memiliki jadwal, daftar mahasiswa, dan progres tersendiri,
					sedangkan RPS, materi, dan tugas tetap dibagikan.
				</p>

				{error && (
					<div className="ld-alert" role="alert">
						{error} <button type="button" onClick={() => reload()}>Coba lagi</button>
					</div>
				)}
				{actionError && (
					<div className="ld-alert" role="alert">
						{actionError}{' '}
						<button type="button" onClick={() => setActionError('')}>Tutup</button>
					</div>
				)}

				<div className="section-add-row">
					<input
						type="text"
						maxLength={100}
						value={name}
						autoFocus
						placeholder="Nama kelas, mis. Kelas A"
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') void create();
						}}
					/>
					<button
						type="button"
						className="ld-btn-primary"
						onClick={() => void create()}
						disabled={busy || !name.trim()}
					>
						<Plus size={16} /> Tambah
					</button>
				</div>

				{loading ? (
					<div className="ld-loading">
						<LoaderCircle size={18} className="spin" /> Memuat kelas…
					</div>
				) : sections.length === 0 ? (
					<div className="ld-empty-sm">
						Belum ada kelas dibuat. Tanpa kelas tambahan, mata kuliah ini berjalan
						sebagai satu kelas tunggal.
					</div>
				) : (
					<ul className="section-list">
						{sections.map((section) => (
							<li key={section.id} className="section-list-item">
								{editing?.id === section.id ? (
									<div className="section-edit-row">
										<input
											type="text"
											maxLength={100}
											value={editName}
											autoFocus
											onChange={(e) => setEditName(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === 'Enter') void saveEdit();
												if (e.key === 'Escape') setEditing(null);
											}}
										/>
										<button
											type="button"
											className="ld-btn-primary sm"
											onClick={() => void saveEdit()}
											disabled={busy || !editName.trim()}
										>
											Simpan
										</button>
										<button
											type="button"
											className="button-quiet"
											onClick={() => setEditing(null)}
										>
											Batal
										</button>
									</div>
								) : confirmDelete?.id === section.id ? (
									<div className="section-delete-row">
										<span>
											Hapus <strong>{section.name}</strong>? Sesi, daftar mahasiswa,
											dan pendaftaran pada kelas ini tidak ikut terhapus — mereka
											kembali ke tampilan default.
										</span>
										<button
											type="button"
											className="ld-btn-primary danger"
											onClick={() => void remove(section)}
											disabled={busy}
										>
											Hapus
										</button>
										<button
											type="button"
											className="button-quiet"
											onClick={() => setConfirmDelete(null)}
										>
											Batal
										</button>
									</div>
								) : (
									<>
										<span className="section-list-name">
											<Layers size={15} /> {section.name}
										</span>
										<div className="section-list-actions">
											<button
												type="button"
												className="ld-icon-action sm"
												aria-label={`Ganti nama ${section.name}`}
												title="Ganti nama"
												onClick={() => {
													setEditing(section);
													setEditName(section.name);
												}}
											>
												<Pencil size={15} />
											</button>
											<button
												type="button"
												className="ld-icon-action sm danger"
												aria-label={`Hapus ${section.name}`}
												title="Hapus kelas"
												onClick={() => setConfirmDelete(section)}
											>
												<Trash2 size={15} />
											</button>
										</div>
									</>
								)}
							</li>
						))}
					</ul>
				)}

				<div className="modal-actions">
					<button type="button" className="ld-btn-primary" onClick={onClose}>
						Selesai
					</button>
				</div>
		</AppModal>
	);
}

/**
 * Compact section selector shown in the course detail header. Only appears
 * when the course has 2+ sections. Lets the lecturer (and student) scope the
 * Pertemuan / Mahasiswa views to one kelas. An empty value means "Semua kelas".
 */
export function SectionSelector({
	sections,
	value,
	onChange,
	size = 'md',
}: {
	sections: CourseSection[];
	value: string;
	onChange: (id: string) => void;
	size?: 'sm' | 'md';
}) {
	// Show as soon as the course has a kelas, including a single class, so the
	// lecturer can scope roster and gradebook rows. Courses without sections
	// stay unchanged.
	if (sections.length < 1) return null;

	return (
		<label className={`section-selector ${size === 'sm' ? 'sm' : ''}`}>
			<Layers size={size === 'sm' ? 13 : 15} />
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				aria-label="Pilih kelas"
			>
				<option value="">Semua kelas</option>
				{sections.map((s) => (
					<option key={s.id} value={s.id}>
						{s.name}
					</option>
				))}
			</select>
		</label>
	);
}

/** Resolve a section id to its display name, falling back gracefully. */
export function useSectionName(courseId: string | undefined, sectionId: string | undefined) {
	const { sections } = useCourseSections(courseId);
	return useMemo(() => {
		if (!sectionId) return '';
		return sections.find((s) => s.id === sectionId)?.name || '';
	}, [sections, sectionId]);
}

/** Hook returning the current student's section (id + name) for a course. */
export function useMySection(courseId: string | undefined): { id: string; name: string } {
	const me = pb.authStore.record?.id || '';
	const enrollmentsQuery = useCachedQuery<{ section?: string }[]>(
		me && courseId ? `enrollments:mine:section:${courseId}` : null,
		() =>
			pb.collection('enrollments').getFullList({
				filter: pb.filter('owner = {:me} && course = {:id}', { me, id: courseId }),
			}),
	);
	const { sections } = useCourseSections(courseId);
	const enrollment = enrollmentsQuery.data?.[0];
	return useMemo(() => {
		const sectionId = enrollment?.section || '';
		if (!sectionId) return { id: '', name: '' };
		return { id: sectionId, name: sections.find((s) => s.id === sectionId)?.name || '' };
	}, [enrollment, sections]);
}

/**
 * Small chip showing the student's kelas on a course card. Only renders when
 * the course actually has multiple sections and the student is assigned to
 * one — single-section courses show nothing, preserving their existing look.
 */
export function StudentSectionChip({ courseId }: { courseId: string }) {
	const { sections } = useCourseSections(courseId);
	const mySection = useMySection(courseId);
	if (sections.length < 2 || !mySection.name) return null;
	return (
		<span className="sd-section-chip" title="Kelas Anda pada mata kuliah ini">
			<Layers size={12} /> {mySection.name}
		</span>
	);
}


