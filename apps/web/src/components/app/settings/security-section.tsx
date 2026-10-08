import { useState } from 'react';
import { LoaderCircle, Lock, BadgeCheck, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import pb from '@/lib/pocketbase-client';
import { errorMessage } from '@/lib/learning';

/**
 * Security section: change the account password. Reuses the shared
 * `/api/student-password` endpoint, which is role-agnostic (it verifies the
 * old password by re-authenticating, then rotates via the superuser client so
 * the `mustChangePassword` flag is cleared for students). Works for both
 * lecturers and students.
 */
export function SecuritySection() {
	const { user } = useAuth();
	const [oldPassword, setOldPassword] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [showOld, setShowOld] = useState(false);
	const [showNew, setShowNew] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState(false);

	const passwordsDiffer = newPassword.length > 0 && newPassword !== confirmPassword;
	const tooShort = newPassword.length > 0 && newPassword.length < 8;
	const sameAsOld = oldPassword.length > 0 && newPassword.length > 0 && newPassword === oldPassword;
	const canSubmit =
		oldPassword.length > 0 &&
		newPassword.length >= 8 &&
		!passwordsDiffer &&
		!sameAsOld &&
		!busy;

	const submit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!canSubmit) return;
		setBusy(true);
		setError('');
		setSuccess(false);
		try {
			const response = await fetch('/api/student-password', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${pb.authStore.token}`,
				},
				body: JSON.stringify({ oldPassword, newPassword }),
			});
			const data = (await response.json().catch(() => null)) as { error?: string } | null;
			if (!response.ok) {
				throw new Error(data?.error || 'Gagal mengubah kata sandi. Coba lagi.');
			}
			// Re-authenticate with the new password to obtain a fresh token.
			const loginEmail = (user as { email?: string } | null)?.email || '';
			await pb.collection('users').authWithPassword(loginEmail, newPassword);
			setSuccess(true);
			setOldPassword('');
			setNewPassword('');
			setConfirmPassword('');
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<section className="ld-panel ld-settings-panel">
			<div className="ld-card-head">
				<div>
					<span className="ld-eyebrow">Keamanan</span>
					<h2>Kata sandi</h2>
				</div>
			</div>
			<p className="ld-settings-lede">
				Gunakan kata sandi yang kuat dan unik. Setelah mengubah kata sandi, Anda akan tetap
				masuk dengan kata sandi baru.
			</p>

			{success && (
				<p className="ld-settings-success">
					<BadgeCheck size={14} /> Kata sandi berhasil diubah.
				</p>
			)}

			<form className="ld-settings-form" onSubmit={submit}>
				<label className="ld-settings-field">
					<span>Kata sandi saat ini</span>
					<div className="ld-settings-input-wrap">
						<Lock size={16} className="ld-settings-input-icon" aria-hidden="true" />
						<input
							type={showOld ? 'text' : 'password'}
							value={oldPassword}
							autoComplete="current-password"
							onChange={(e) => setOldPassword(e.target.value)}
							placeholder="Kata sandi saat ini"
							required
							disabled={busy}
						/>
						<button
							type="button"
							className="ld-settings-eye"
							onClick={() => setShowOld((s) => !s)}
							aria-label={showOld ? 'Sembunyikan' : 'Tampilkan'}
							tabIndex={-1}
						>
							{showOld ? <EyeOff size={15} /> : <Eye size={15} />}
						</button>
					</div>
				</label>

				<label className="ld-settings-field">
					<span>Kata sandi baru</span>
					<div className="ld-settings-input-wrap">
						<Lock size={16} className="ld-settings-input-icon" aria-hidden="true" />
						<input
							type={showNew ? 'text' : 'password'}
							value={newPassword}
							autoComplete="new-password"
							minLength={8}
							onChange={(e) => setNewPassword(e.target.value)}
							placeholder="Minimal 8 karakter"
							required
							disabled={busy}
						/>
						<button
							type="button"
							className="ld-settings-eye"
							onClick={() => setShowNew((s) => !s)}
							aria-label={showNew ? 'Sembunyikan' : 'Tampilkan'}
							tabIndex={-1}
						>
							{showNew ? <EyeOff size={15} /> : <Eye size={15} />}
						</button>
					</div>
					{tooShort && <em className="ld-settings-hint">Kata sandi minimal 8 karakter.</em>}
					{sameAsOld && (
						<em className="ld-settings-hint warn">
							Kata sandi baru harus berbeda dari kata sandi saat ini.
						</em>
					)}
				</label>

				<label className="ld-settings-field">
					<span>Ulangi kata sandi baru</span>
					<div className="ld-settings-input-wrap">
						<Lock size={16} className="ld-settings-input-icon" aria-hidden="true" />
						<input
							type={showNew ? 'text' : 'password'}
							value={confirmPassword}
							autoComplete="new-password"
							minLength={8}
							onChange={(e) => setConfirmPassword(e.target.value)}
							placeholder="Ketik ulang kata sandi baru"
							required
							disabled={busy}
						/>
					</div>
					{passwordsDiffer && (
						<em className="ld-settings-hint warn">Konfirmasi kata sandi tidak cocok.</em>
					)}
				</label>

				{error && (
					<p className="form-error" role="alert">
						{error}
					</p>
				)}

				<div className="ld-settings-actions">
					<button type="submit" className="ld-btn-primary" disabled={!canSubmit}>
						{busy ? <LoaderCircle size={16} className="spin" /> : <ShieldCheck size={16} />}
						Ubah kata sandi
					</button>
				</div>
			</form>
		</section>
	);
}
