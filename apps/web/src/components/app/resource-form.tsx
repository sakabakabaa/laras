import { useRef, useState } from 'react';
import {
	FileUp,
	Link2,
	LoaderCircle,
	UploadCloud,
	X,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import type { CourseResource, ClassSession } from '@/lib/learning';
import { errorMessage } from '@/lib/learning';
import { AppModal } from '@/components/app/app-modal';
import {
	ACCEPTED_MIME,
	uploadResource,
	validateFile,
	type UploadProgress,
} from '@/lib/resources';

export function ResourceForm({
	courseId,
	sessions,
	resource,
	onClose,
	onSaved,
}: {
	courseId: string;
	sessions: ClassSession[];
	resource?: CourseResource;
	onClose: () => void;
	onSaved: () => void;
}) {
	const editing = Boolean(resource);
	const [kind, setKind] = useState<'file' | 'link'>(resource?.kind || 'file');
	const [title, setTitle] = useState(resource?.title || '');
	const [description, setDescription] = useState(resource?.description || '');
	const [sessionId, setSessionId] = useState(resource?.session || '');
	const [url, setUrl] = useState(resource?.url || '');
	const [file, setFile] = useState<File | null>(null);
	const [fileError, setFileError] = useState('');
	const [progress, setProgress] = useState<UploadProgress | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	// Pre-fill title from filename when adding a new file resource.
	const onFileChange = (f: File | null) => {
		setFile(f);
		setFileError('');
		if (!f) return;
		const vErr = validateFile(f);
		if (vErr) {
			setFileError(vErr);
			return;
		}
		if (!title.trim()) {
			const base = f.name.replace(/\.[^.]+$/, '');
			setTitle(base.slice(0, 200));
		}
	};

	const save = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError('');
		setFileError('');

		if (!title.trim()) {
			setError('Judul wajib diisi.');
			return;
		}
		if (kind === 'link') {
			if (!url.trim()) {
				setError('Tautan eksternal wajib diisi.');
				return;
			}
		} else if (!editing && !file) {
			setFileError('Pilih berkas untuk diunggah.');
			return;
		}
		if (file) {
			const vErr = validateFile(file);
			if (vErr) {
				setFileError(vErr);
				return;
			}
		}

		setBusy(true);
		try {
			if (kind === 'file' && file) {
				// Upload with real progress via XHR.
				const fd = new FormData();
				fd.append('title', title.trim());
				fd.append('description', description.trim());
				fd.append('kind', 'file');
				fd.append('course', courseId);
				fd.append('owner', pb.authStore.record?.id || '');
				if (sessionId) fd.append('session', sessionId);
				fd.append('file', file);
				await uploadResource(fd, setProgress);
				onSaved();
				return;
			}

			// Link resource, or file resource edit without a new file → SDK call.
			const data: Record<string, unknown> = {
				title: title.trim(),
				description: description.trim(),
				kind,
				course: courseId,
				session: sessionId || '',
			};
			if (kind === 'link') data.url = url.trim();
			if (editing) {
				await pb.collection('course_resources').update(resource!.id, data);
			} else {
				data.owner = pb.authStore.record?.id;
				await pb.collection('course_resources').create(data);
			}
			invalidate('course_resources');
			onSaved();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
			setProgress(null);
		}
	};

	return (
		<AppModal open onClose={onClose} title={editing ? 'Edit sumber daya' : 'Tambah sumber daya.'} className="form-modal-wide">
			<div className="modal-top">
					<span>SUMBER DAYA / {editing ? 'EDIT' : 'BARU'}</span>
					<button type="button" aria-label="Tutup" onClick={onClose}>
						<X size={21} />
					</button>
				</div>
				<h2 id="resource-form-title">{editing ? 'Edit sumber daya' : 'Tambah sumber daya.'}</h2>
				<p>
					Unggah materi atau tambahkan tautan eksternal untuk mata kuliah ini. Mahasiswa dapat
					mengunduh dan membukanya.
				</p>
				<form onSubmit={save} className="editor-form">
					<div className="res-kind-toggle">
						<button
							type="button"
							className={`res-kind-tab${kind === 'file' ? ' active' : ''}`}
							onClick={() => setKind('file')}
							disabled={editing && resource?.kind === 'link'}
						>
							<FileUp size={15} /> Berkas
						</button>
						<button
							type="button"
							className={`res-kind-tab${kind === 'link' ? ' active' : ''}`}
							onClick={() => setKind('link')}
							disabled={editing && resource?.kind === 'file'}
						>
							<Link2 size={15} /> Tautan eksternal
						</button>
					</div>

					<label>
						JUDUL <span>*</span>
						<input
							autoFocus
							required
							maxLength={200}
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="mis. Slide Pertemuan 4 — Desain Pembelajaran"
						/>
					</label>

					<label>
						DESKRIPI
						<textarea
							rows={2}
							maxLength={2000}
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Ringkasan singkat tentang sumber daya ini (opsional)"
						/>
					</label>

					<label>
						TAUTAN KE PERTEMUAN
						<select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
							<option value="">Tidak terkait pertemuan tertentu</option>
							{sessions.map((s) => (
								<option key={s.id} value={s.id}>
									Minggu {String(s.week || '—').padStart(2, '0')} — {s.title}
								</option>
							))}
						</select>
					</label>

					{kind === 'link' ? (
						<label>
							TAUTAN <span>*</span>
							<input
								type="url"
								required
								value={url}
								onChange={(e) => setUrl(e.target.value)}
								placeholder="https://..."
							/>
						</label>
					) : (
						<div className="res-upload">
							<input
								ref={inputRef}
								type="file"
								className="pdf-file-input"
								accept={ACCEPTED_MIME}
								onChange={(e) => onFileChange(e.target.files?.[0] || null)}
							/>
							<button
								type="button"
								className="pdf-dropzone"
								onClick={() => inputRef.current?.click()}
							>
								<span className="pdf-dropzone-icon">
									<UploadCloud size={26} />
								</span>
								<strong>
									{file ? file.name : editing && resource?.file ? resource.file : 'Pilih berkas'}
								</strong>
								<span className="pdf-dropzone-hint">
									PDF, PPTX, DOCX, XLSX, gambar, audio, atau video · maks 100 MB
								</span>
							</button>
							{fileError && <p className="form-error" role="alert">{fileError}</p>}
							{progress && (
								<div className="res-progress" aria-live="polite">
									<div className="res-progress-bar">
										<span style={{ width: `${progress.percent}%` }} />
									</div>
									<em>Mengunggah {progress.percent}%</em>
								</div>
							)}
						</div>
					)}

					{error && (
						<p className="form-error" role="alert">
							{error}
						</p>
					)}
					<div className="modal-actions">
						<button type="button" className="ld-btn-quiet" onClick={onClose} disabled={busy}>
							Batal
						</button>
						<button type="submit" className="ld-btn-primary" disabled={busy}>
							{busy ? (
								<>
									<LoaderCircle className="spin" size={17} /> Mengunggah...
								</>
							) : editing ? (
								'Simpan perubahan'
							) : kind === 'file' ? (
								'Unggah sumber daya'
							) : (
								'Tambah tautan'
							)}
						</button>
					</div>
				</form>
		</AppModal>
	);
}
