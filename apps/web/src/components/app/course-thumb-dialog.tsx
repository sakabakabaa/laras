import { useEffect, useState } from 'react';
import { ImagePlus, LoaderCircle, Sparkles, Trash2, X } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import { errorMessage } from '@/lib/learning';
import { courseThumbUrl } from '@/lib/course-thumb';
import { CourseThumb } from '@/components/app/course-thumb';
import { AppModal } from '@/components/app/app-modal';
import type { Course } from '@/lib/learning';

const ACCEPTED_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/svg+xml',
];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB, matches the PocketBase field limit

/**
 * Lecturer-only dialog to upload, replace, or remove a course thumbnail.
 * Saves through the courses collection rules (owner-only update), so only the
 * course owner can change it.
 */
export function CourseThumbDialog({
	course,
	onClose,
	onSaved,
}: {
	course: Course;
	onClose: () => void;
	onSaved: () => void;
}) {
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState('');
	const [busy, setBusy] = useState(false);
	const [generating, setGenerating] = useState(false);
	const [error, setError] = useState('');
	const current = courseThumbUrl(course);

	useEffect(() => {
		if (!file) {
			setPreview('');
			return;
		}
		const url = URL.createObjectURL(file);
		setPreview(url);
		return () => URL.revokeObjectURL(url);
	}, [file]);

	const pick = (picked: File | null) => {
		setError('');
		if (!picked) return;
		if (!ACCEPTED_TYPES.includes(picked.type)) {
			setError('Format tidak didukung. Gunakan JPG, PNG, WebP, GIF, atau SVG.');
			return;
		}
		if (picked.size > MAX_SIZE) {
			setError('Ukuran gambar maksimal 5 MB.');
			return;
		}
		setFile(picked);
	};

	const save = async () => {
		if (!file) return;
		setBusy(true);
		setError('');
		try {
			const fd = new FormData();
			fd.append('thumbnail', file);
			await pb.collection('courses').update(course.id, fd);
			invalidate('courses');
			onSaved();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	const generate = async () => {
		setGenerating(true);
		setError('');
		try {
			const res = await fetch('/api/course-thumbnail', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${pb.authStore.token}`,
				},
				body: JSON.stringify({ courseId: course.id }),
			});
			const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (res.ok && data.ok) {
				invalidate('courses');
				onSaved();
			} else {
				setError(data.error || 'Thumbnail tidak dapat dibuat. Coba lagi atau unggah gambar manual.');
			}
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setGenerating(false);
		}
	};

	const remove = async () => {
		setBusy(true);
		setError('');
		try {
			await pb.collection('courses').update(course.id, { thumbnail: '' });
			invalidate('courses');
			onSaved();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<AppModal open onClose={onClose} title="Thumbnail mata kuliah">
			<div className="modal-top">
					<span>MATA KULIAH / THUMBNAIL</span>
					<button type="button" aria-label="Tutup" onClick={onClose}>
						<X size={16} />
					</button>
				</div>
				<h2 id="course-thumb-title">Thumbnail mata kuliah</h2>
				<p>{course.title}</p>

				<div className="cth-preview">
					{preview ? (
						<img src={preview} alt="Pratinjau thumbnail baru" />
					) : current ? (
						<img src={current} alt="Thumbnail saat ini" />
					) : (
						<CourseThumb course={course} className="cth-fallback" />
					)}
					<span>{preview ? 'Pratinjau gambar baru' : current ? 'Thumbnail saat ini' : 'Belum ada thumbnail'}</span>
				</div>

				{error && (
					<div className="form-error" role="alert">
						{error}
					</div>
				)}

				<div className="cth-actions">
				<button
					type="button"
					className="ld-outline-action cth-ai-btn"
					onClick={() => void generate()}
					disabled={busy || generating}
				>
					{generating ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}
					{generating ? 'Membuat...' : 'Buat dengan AI'}
				</button>
					<label className="ld-outline-action cth-file-label">
						<ImagePlus size={16} />
						{current || preview ? 'Ganti gambar' : 'Pilih gambar'}
						<input
							type="file"
							accept={ACCEPTED_TYPES.join(',')}
							onChange={(e) => pick(e.target.files?.[0] ?? null)}
							disabled={busy}
						/>
					</label>
					{current && !preview ? (
						<button type="button" className="ld-icon-action danger" onClick={() => void remove()} disabled={busy} aria-label="Hapus thumbnail">
							{busy ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}
						</button>
					) : null}
				</div>

				<div className="modal-actions">
					<button type="button" className="ld-text-btn" onClick={onClose} disabled={busy}>
						Batal
					</button>
					<button
						type="button"
						className="ld-btn-primary"
						onClick={() => void save()}
						disabled={busy || !file}
					>
						{busy ? <LoaderCircle size={16} className="spin" /> : null}
						Simpan thumbnail
					</button>
				</div>
		</AppModal>
	);
}
