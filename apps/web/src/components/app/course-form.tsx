import { useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import type { Course } from '@/lib/learning';
import { errorMessage } from '@/lib/learning';
import { AppModal } from '@/components/app/app-modal';

export function CourseForm({
	course,
	onClose,
	onSaved,
}: {
	course?: Course;
	onClose: () => void;
	onSaved: () => void;
}) {
	const [title, setTitle] = useState(course?.title || '');
	const [code, setCode] = useState(course?.code || '');
	const [semester, setSemester] = useState(course?.semester || '');
	const [academicYear, setAcademicYear] = useState(course?.academicYear || '');
	const [description, setDescription] = useState(course?.description || '');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const save = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setBusy(true);
		setError('');
		try {
			const data = {
				title: title.trim(),
				code: code.trim(),
				semester: semester.trim(),
				academicYear: academicYear.trim(),
				description: description.trim(),
			};
			if (course) await pb.collection('courses').update(course.id, data);
			else
				await pb.collection('courses').create({
					...data,
					owner: pb.authStore.record?.id,
				});
			invalidate('courses');
			onSaved();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};
	return (
		<AppModal open onClose={onClose} title={course ? 'Edit mata kuliah' : 'Awal yang baru.'}>
			<div className="modal-top">
					<span>MATA KULIAH / {course ? 'EDIT' : 'BARU'}</span>
					<button type="button" aria-label="Tutup" onClick={onClose}>
						<X size={21} />
					</button>
				</div>
				<h2 id="course-form-title">{course ? 'Edit mata kuliah' : 'Awal yang baru.'}</h2>
				<p>
					{course
						? 'Perbarui detail mata kuliah Anda.'
						: 'Mulai dari hal penting. Anda bisa menambahkan rencana dan sesi berikutnya.'}
				</p>
				<form onSubmit={save} className="editor-form">
					<label>
						NAMA MATA KULIAH <span>*</span>
						<input
							autoFocus
							required
							maxLength={200}
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="mis. Pengantar Desain Pembelajaran"
						/>
					</label>
					<div className="form-two">
						<label>
							KODE MATA KULIAH
							<input
								maxLength={40}
								value={code}
								onChange={(e) => setCode(e.target.value)}
								placeholder="mis. EDU 301"
							/>
						</label>
						<label>
							SEMESTER
							<input
								maxLength={80}
								value={semester}
								onChange={(e) => setSemester(e.target.value)}
								placeholder="mis. Semester 1"
							/>
						</label>
					</div>
					<label>
						TAHUN AKADEMIK
						<input
							maxLength={40}
							value={academicYear}
							onChange={(e) => setAcademicYear(e.target.value)}
							placeholder="mis. 2025 / 2026"
						/>
					</label>
					<label>
						DESKRIPSI SINGKAT
						<textarea
							rows={3}
							maxLength={2000}
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Tentang apa mata kuliah ini?"
						/>
					</label>
					{error && (
						<p className="form-error" role="alert">
							{error}
						</p>
					)}
					<div className="modal-actions">
						<button type="button" className="ld-btn-quiet" onClick={onClose}>
							Batal
						</button>
						<button type="submit" className="ld-btn-primary" disabled={busy}>
							{busy ? (
								<LoaderCircle className="spin" size={18} />
							) : course ? (
								'Simpan perubahan'
							) : (
								'Buat mata kuliah'
							)}
						</button>
					</div>
				</form>
		</AppModal>
	);
}
