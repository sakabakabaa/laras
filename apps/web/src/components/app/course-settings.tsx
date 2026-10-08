import { Trash2, Pencil } from 'lucide-react';
import type { Course } from '@/lib/learning';

export function CourseSettings({
	course,
	onEdit,
	onDelete,
}: {
	course: Course;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const rows = [
		['Nama', course.title],
		['Kode', course.code],
		['Semester', course.semester],
		['Tahun akademik', course.academicYear],
		['SKS', course.credits != null ? String(course.credits) : ''],
		['Dosen pengampu', course.lecturerName],
		['Kelompok MK', course.courseGroup],
	];
	return (
		<section className="ld-panel course-settings">
			<div className="ld-card-head">
				<div>
					<span className="ld-eyebrow">Pengaturan</span>
					<h2>Identitas mata kuliah</h2>
				</div>
				<button type="button" className="ld-btn-primary" onClick={onEdit}>
					<Pencil size={16} /> Edit detail
				</button>
			</div>
			<dl className="course-settings-grid">
				{rows.map(([label, value]) => (
					<div key={label}>
						<dt>{label}</dt>
						<dd>{value || '—'}</dd>
					</div>
				))}
			</dl>
			{course.description ? <p className="course-settings-desc">{course.description}</p> : null}
			<div className="course-settings-danger">
				<div>
					<strong>Hapus mata kuliah</strong>
					<p>Menghapus mata kuliah beserta sesinya. Tindakan ini tidak dapat dibatalkan.</p>
				</div>
				<button type="button" className="ld-outline-action danger" onClick={onDelete}>
					<Trash2 size={16} /> Hapus
				</button>
			</div>
		</section>
	);
}
