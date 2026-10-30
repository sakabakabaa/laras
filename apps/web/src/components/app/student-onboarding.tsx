import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
	AlertTriangle,
	ArrowRight,
	BadgeCheck,
	LoaderCircle,
	Lock,
	Mail,
	MailCheck,
	ShieldCheck,
	Clock,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import pb from '@/lib/pocketbase-client';
import { errorMessage, isAbortError } from '@/lib/learning';

type PendingVerification = {
	id: string;
	email: string;
	verified: boolean;
	expiresAt: string;
	created: string;
};

export function StudentOnboarding() {
	const { user } = useAuth();
	const navigate = useNavigate();

	const authRecord = user as {
		mustChangePassword?: boolean;
		recoveryEmail?: string;
		recoveryEmailVerified?: boolean;
	} | null;
	// Fail closed: until the auth record is loaded and actually exposes the
	// mustChangePassword flag, treat a password change as still required so the
	// form stays visible and "Lanjut ke dashboard" stays disabled during hydration.
	const authReady = !!authRecord && typeof authRecord.mustChangePassword !== 'undefined';
	const mustChangePassword = authReady ? Boolean(authRecord!.mustChangePassword) : true;
	const recoveryEmail = authRecord?.recoveryEmail ?? '';
	const recoveryEmailVerified = authRecord?.recoveryEmailVerified ?? false;

	// Password form state
	const [oldPassword, setOldPassword] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [showOld, setShowOld] = useState(false);
	const [showNew, setShowNew] = useState(false);
	const [pwBusy, setPwBusy] = useState(false);
	const [pwError, setPwError] = useState('');
	const [pwSuccess, setPwSuccess] = useState(false);

	// Recovery email state
	const [emailInput, setEmailInput] = useState('');
	const [pending, setPending] = useState<PendingVerification | null>(null);
	const [pendingLoading, setPendingLoading] = useState(true);
	const [emailBusy, setEmailBusy] = useState(false);
	const [emailError, setEmailError] = useState('');
	const [emailSent, setEmailSent] = useState(false);

	const loadPending = useCallback(async () => {
		setPendingLoading(true);
		try {
			const rows = await pb
				.collection('email_verifications')
				.getFullList<PendingVerification>({ sort: '-created' });
			const now = Date.now();
			const next = rows.find(
				(r) => !r.verified && new Date(r.expiresAt).getTime() > now,
			);
			setPending(next ?? null);
		} catch (err) {
			if (!isAbortError(err)) setPending(null);
		} finally {
			setPendingLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadPending();
	}, [loadPending]);

	const passwordsDiffer = newPassword.length > 0 && newPassword !== confirmPassword;
	const newPasswordTooShort = newPassword.length > 0 && newPassword.length < 8;
	const sameAsOld = oldPassword.length > 0 && newPassword.length > 0 && newPassword === oldPassword;
	const canSubmitPassword =
		oldPassword.length > 0 &&
		newPassword.length >= 8 &&
		!passwordsDiffer &&
		!sameAsOld &&
		!pwBusy;

	const submitPassword = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!canSubmitPassword) return;
		setPwBusy(true);
		setPwError('');
		setPwSuccess(false);
		try {
			const response = await fetch('/api/student-password', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${pb.authStore.token}`,
				},
				body: JSON.stringify({
					oldPassword,
					newPassword,
				}),
			});
			const data = (await response.json().catch(() => null)) as { error?: string } | null;
			if (!response.ok) {
				throw new Error(data?.error || 'Gagal mengubah kata sandi. Coba lagi.');
			}
			// Changing the password invalidates the current JWT (PocketBase signs
			// the token with a password-derived hash), so authRefresh() with the
			// stale token 401s. Re-authenticate with the new password to obtain a
			// fresh token and reload the record, which flips mustChangePassword.
			const loginEmail =
				(user as { email?: string } | null)?.email || '';
			await pb.collection('users').authWithPassword(loginEmail, newPassword);
			setPwSuccess(true);
			setOldPassword('');
			setNewPassword('');
			setConfirmPassword('');
		} catch (err) {
			setPwError(errorMessage(err));
		} finally {
			setPwBusy(false);
		}
	};

	const submitEmail = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const email = emailInput.trim().toLowerCase();
		if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			setEmailError('Format email tidak valid.');
			return;
		}
		setEmailBusy(true);
		setEmailError('');
		setEmailSent(false);
		try {
			const response = await fetch('/api/recovery-email/request', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${pb.authStore.token}`,
				},
				body: JSON.stringify({ email }),
			});
			const data = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
			if (!response.ok) {
				throw new Error(data?.error || 'Gagal mengirim tautan verifikasi.');
			}
			setEmailSent(true);
			setEmailInput('');
			void loadPending();
		} catch (err) {
			setEmailError(errorMessage(err));
		} finally {
			setEmailBusy(false);
		}
	};

	const hasVerifiedEmail = recoveryEmailVerified && !!recoveryEmail;
	const showPasswordSection = authReady ? mustChangePassword || pwSuccess : true;
	// Continue stays disabled until the record is loaded AND no password change
	// is required. After a successful change, authRefresh updates the record and
	// drives mustChangePassword to false, which re-enables this button.
	const continueDisabled = authReady ? mustChangePassword : true;

	return (
		<div className="onboarding-wrap">
			<div className="onboarding-card">
				<div className="onboarding-card-head">
					<span className="onboarding-eyebrow">
						<ShieldCheck size={14} /> Pengaturan akun
					</span>
					<h1>Amankan akun Anda</h1>
					<p>
						Mengganti kata sandi default dari dosen adalah langkah wajib sebelum Anda
						dapat mengakses mata kuliah. Menambahkan email pemulihan bersifat opsional.
						Memverifikasi email pemulihan tidak menyelesaikan onboarding; hanya mengganti
						kata sandi yang menyelesaikannya.
					</p>
				</div>

				{mustChangePassword && (
					<div className="onboarding-banner" role="status">
						<Lock size={18} />
						<div>
							<strong>Kata sandi perlu diganti</strong>
							<span>
								Anda masuk dengan kata sandi sementara. Silakan buat kata sandi baru
								sebelum melanjutkan.
							</span>
						</div>
					</div>
				)}

				{showPasswordSection && (
					<section className="onboarding-section">
						<div className="onboarding-section-head">
							<h2>
								<Lock size={16} /> Ubah kata sandi
							</h2>
							{!mustChangePassword && pwSuccess && (
								<span className="onboarding-done">
									<BadgeCheck size={14} /> Selesai
								</span>
							)}
						</div>

						{pwSuccess && !mustChangePassword && (
							<p className="onboarding-success">
								Kata sandi berhasil diubah. Anda dapat menggantinya lagi kapan saja.
							</p>
						)}

						<form className="onboarding-form" onSubmit={submitPassword}>
							<label className="onboarding-field">
								<span>Kata sandi lama</span>
								<div className="onboarding-input-wrap">
									<Lock size={16} className="onboarding-input-icon" aria-hidden="true" />
									<input
										type={showOld ? 'text' : 'password'}
										value={oldPassword}
										autoComplete="current-password"
										onChange={(e) => setOldPassword(e.target.value)}
										placeholder="Kata sandi saat ini"
										required
									/>
									<button
										type="button"
										className="onboarding-eye"
										onClick={() => setShowOld((s) => !s)}
										aria-label={showOld ? 'Sembunyikan' : 'Tampilkan'}
									>
										{showOld ? 'Sembunyikan' : 'Lihat'}
									</button>
								</div>
							</label>

							<label className="onboarding-field">
								<span>Kata sandi baru</span>
								<div className="onboarding-input-wrap">
									<Lock size={16} className="onboarding-input-icon" aria-hidden="true" />
									<input
										type={showNew ? 'text' : 'password'}
										value={newPassword}
										autoComplete="new-password"
										minLength={8}
										onChange={(e) => setNewPassword(e.target.value)}
										placeholder="Minimal 8 karakter"
										required
									/>
									<button
										type="button"
										className="onboarding-eye"
										onClick={() => setShowNew((s) => !s)}
										aria-label={showNew ? 'Sembunyikan' : 'Tampilkan'}
									>
										{showNew ? 'Sembunyikan' : 'Lihat'}
									</button>
								</div>
								{newPasswordTooShort && (
									<em className="onboarding-hint">Kata sandi minimal 8 karakter.</em>
								)}
								{sameAsOld && (
									<em className="onboarding-hint warn">
										Kata sandi baru harus berbeda dari kata sandi lama.
									</em>
								)}
							</label>

							<label className="onboarding-field">
								<span>Ulangi kata sandi baru</span>
								<div className="onboarding-input-wrap">
									<Lock size={16} className="onboarding-input-icon" aria-hidden="true" />
									<input
										type={showNew ? 'text' : 'password'}
										value={confirmPassword}
										autoComplete="new-password"
										minLength={8}
										onChange={(e) => setConfirmPassword(e.target.value)}
										placeholder="Ketik ulang kata sandi baru"
										required
									/>
								</div>
								{passwordsDiffer && (
									<em className="onboarding-hint warn">Konfirmasi kata sandi tidak cocok.</em>
								)}
							</label>

							{pwError && (
								<p className="form-error" role="alert">
									{pwError}
								</p>
							)}

							<button
								type="submit"
								className="ld-btn-primary"
								disabled={!canSubmitPassword}
							>
								{pwBusy ? (
									<LoaderCircle size={17} className="spin" />
								) : (
									<>
										<Lock size={16} /> {pwSuccess ? 'Ubah lagi' : 'Simpan kata sandi baru'}
									</>
								)}
							</button>
						</form>
					</section>
				)}

				<section className="onboarding-section">
					<div className="onboarding-section-head">
						<h2>
							<Mail size={16} /> Email pemulihan <span className="onboarding-optional">(opsional)</span>
						</h2>
						{hasVerifiedEmail && (
							<span className="onboarding-done">
								<BadgeCheck size={14} /> Terverifikasi
							</span>
						)}
					</div>

					{hasVerifiedEmail ? (
						<div className="onboarding-email-verified">
							<MailCheck size={18} />
							<div>
								<strong>{recoveryEmail}</strong>
								<span>Email terverifikasi untuk pemulihan & notifikasi.</span>
							</div>
						</div>
					) : pending ? (
						<div className="onboarding-email-pending">
							<Clock size={18} />
							<div>
								<strong>Menunggu verifikasi: {pending.email}</strong>
								<span>
									Cek email Anda (termasuk folder spam) dan klik tautan verifikasi.
									Tautan kedaluwarsa dalam 24 jam.
								</span>
							</div>
							<button
								type="button"
								className="ld-outline-action sm"
								onClick={() => void loadPending()}
								disabled={pendingLoading}
							>
								Periksa status
							</button>
						</div>
					) : (
						<p className="onboarding-muted">
							Tambahkan email pribadi untuk pemulihan akun dan notifikasi. Email harus
							diverifikasi sebelum digunakan.
						</p>
					)}

					{!hasVerifiedEmail && (
						<form className="onboarding-form onboarding-email-form" onSubmit={submitEmail}>
							<label className="onboarding-field">
								<span>Email pemulihan</span>
								<div className="onboarding-input-wrap">
									<Mail size={16} className="onboarding-input-icon" aria-hidden="true" />
									<input
										type="email"
										value={emailInput}
										autoComplete="email"
										onChange={(e) => setEmailInput(e.target.value)}
										placeholder="nama@email.com"
										disabled={emailBusy}
									/>
								</div>
							</label>
							{emailError && (
								<p className="form-error" role="alert">
									{emailError}
								</p>
							)}
							{emailSent && !emailError && (
								<p className="onboarding-success">
									<MailCheck size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
									Tautan verifikasi telah dikirim. Cek email Anda.
								</p>
							)}
							<button
								type="submit"
								className="ld-outline-action"
								disabled={emailBusy || !emailInput.trim()}
							>
								{emailBusy ? (
									<LoaderCircle size={16} className="spin" />
								) : (
									<>
										<Mail size={16} /> Kirim tautan verifikasi
									</>
								)}
							</button>
						</form>
					)}

					<p className="onboarding-note">
						<AlertTriangle size={13} /> Email NIM ({'<nim>'}@student.upi.edu) tidak dapat
						digunakan sebagai email pemulihan.
					</p>
				</section>

				<div className="onboarding-foot">
					<button
						type="button"
						className="ld-btn-primary"
						onClick={() => navigate('/app/student')}
						disabled={continueDisabled}
						title={continueDisabled ? 'Ubah kata sandi terlebih dahulu' : 'Lanjut ke dashboard'}
					>
						Lanjut ke dashboard <ArrowRight size={16} />
					</button>
					{mustChangePassword && (
						<span className="onboarding-foot-note">
							Anda harus mengubah kata sandi sebelum dapat mengakses mata kuliah.
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
