import { useEffect, useState } from 'react';
import { LoaderCircle, User, BadgeCheck, Camera, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import pb from '@/lib/pocketbase-client';
import { errorMessage, isAbortError } from '@/lib/learning';

const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const AVATAR_MAX = 5 * 1024 * 1024; // 5 MB

function avatarUrl(user: { id: string; avatar?: string | null } | null) {
	if (!user?.avatar) return null;
	const record = { id: user.id, collectionName: 'users' } as unknown as Parameters<
		typeof pb.files.getURL
	>[0];
	return pb.files.getURL(record, user.avatar);
}

/**
 * Profile section: display name + avatar photo. Both are writable through the
 * users collection self-update rule (role/nim/recovery fields are locked, name
 * and avatar are not). Saving the updated record back into the auth store
 * propagates the new name/avatar across the whole app shell instantly.
 */
export function ProfileSection() {
	const { user } = useAuth();
	const initialName = user?.name || '';
	const [name, setName] = useState(initialName);
	const [savedName, setSavedName] = useState(initialName);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState(false);

	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState('');
	const [avatarBusy, setAvatarBusy] = useState(false);
	const [avatarError, setAvatarError] = useState('');

	const currentAvatar = avatarUrl(user);

	useEffect(() => {
		if (!file) {
			setPreview('');
			return;
		}
		const url = URL.createObjectURL(file);
		setPreview(url);
		return () => URL.revokeObjectURL(url);
	}, [file]);

	const nameChanged = name.trim() !== savedName && name.trim().length > 0;

	const saveName = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!nameChanged || !user) return;
		setBusy(true);
		setError('');
		setSuccess(false);
		try {
			const updated = await pb.collection('users').update(user.id, { name: name.trim() });
			pb.authStore.save(pb.authStore.token, updated);
			setSavedName(name.trim());
			setSuccess(true);
		} catch (err) {
			if (!isAbortError(err)) setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	const pickAvatar = (picked: File | null) => {
		setAvatarError('');
		if (!picked) {
			setFile(null);
			return;
		}
		if (!AVATAR_TYPES.includes(picked.type)) {
			setAvatarError('Format tidak didukung. Gunakan JPG, PNG, WebP, atau GIF.');
			return;
		}
		if (picked.size > AVATAR_MAX) {
			setAvatarError('Ukuran gambar maksimal 5 MB.');
			return;
		}
		setFile(picked);
	};

	const saveAvatar = async () => {
		if (!file || !user) return;
		setAvatarBusy(true);
		setAvatarError('');
		try {
			const fd = new FormData();
			fd.append('avatar', file);
			const updated = await pb.collection('users').update(user.id, fd);
			pb.authStore.save(pb.authStore.token, updated);
			setFile(null);
			setPreview('');
		} catch (err) {
			if (!isAbortError(err)) setAvatarError(errorMessage(err));
		} finally {
			setAvatarBusy(false);
		}
	};

	const removeAvatar = async () => {
		if (!user || !currentAvatar) return;
		setAvatarBusy(true);
		setAvatarError('');
		try {
			const updated = await pb.collection('users').update(user.id, { avatar: '' });
			pb.authStore.save(pb.authStore.token, updated);
		} catch (err) {
			if (!isAbortError(err)) setAvatarError(errorMessage(err));
		} finally {
			setAvatarBusy(false);
		}
	};

	// Build a local object URL preview when a new file is picked.
	const shownAvatar = preview || currentAvatar;

	return (
		<section className="ld-panel ld-settings-panel">
			<div className="ld-card-head">
				<div>
					<span className="ld-eyebrow">Profil</span>
					<h2>Identitas Anda</h2>
				</div>
			</div>
			<p className="ld-settings-lede">
				Nama ini tampil di dashboard, mata kuliah, dan kolaborasi. Foto profil tersimpan di akun
				Anda dan tampil di kartu profil ini.
			</p>

			<div className="ld-settings-profile">
				<div className="ld-settings-avatar">
					<div className="ld-settings-avatar-circle">
						{shownAvatar ? (
							<img src={shownAvatar} alt="Foto profil" />
						) : (
							<User size={28} strokeWidth={1.6} />
						)}
					</div>
					<div className="ld-settings-avatar-actions">
						<label className="ld-outline-action sm">
							<Camera size={15} />
							{currentAvatar ? 'Ganti foto' : 'Unggah foto'}
							<input
								type="file"
								accept={AVATAR_TYPES.join(',')}
								onChange={(e) => pickAvatar(e.target.files?.[0] ?? null)}
								disabled={avatarBusy}
								hidden
							/>
						</label>
						{currentAvatar && !file && (
							<button
								type="button"
								className="ld-icon-action sm danger"
								onClick={() => void removeAvatar()}
								disabled={avatarBusy}
								aria-label="Hapus foto profil"
							>
								{avatarBusy ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}
							</button>
						)}
					</div>
					{file && (
						<button
							type="button"
							className="ld-btn-primary sm"
							onClick={() => void saveAvatar()}
							disabled={avatarBusy}
						>
							{avatarBusy ? <LoaderCircle size={15} className="spin" /> : <BadgeCheck size={15} />}
							Simpan foto
						</button>
					)}
					{avatarError && (
						<p className="form-error" role="alert">
							{avatarError}
						</p>
					)}
				</div>

				<form className="ld-settings-form" onSubmit={saveName}>
					<label className="ld-settings-field">
						<span>Nama lengkap</span>
						<input
							type="text"
							value={name}
							onChange={(e) => {
								setName(e.target.value);
								setSuccess(false);
							}}
							placeholder="Nama yang ditampilkan"
							maxLength={200}
							disabled={busy}
						/>
					</label>
					{error && (
						<p className="form-error" role="alert">
							{error}
						</p>
					)}
					{success && (
						<p className="ld-settings-success">
							<BadgeCheck size={14} /> Nama berhasil disimpan.
						</p>
					)}
					<div className="ld-settings-actions">
						<button type="submit" className="ld-btn-primary" disabled={busy || !nameChanged}>
							{busy ? <LoaderCircle size={16} className="spin" /> : null}
							Simpan nama
						</button>
					</div>
				</form>
			</div>
		</section>
	);
}
