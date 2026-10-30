import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
	ArrowLeft,
	BadgeCheck,
	Eye,
	EyeOff,
	LoaderCircle,
	Lock,
} from 'lucide-react';
import type { Route } from './+types/reset-password';
import { seo } from '@/lib/seo';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Reset kata sandi | LARAS',
		description: 'Buat kata sandi baru untuk akun LARAS Anda.',
	});
}

export default function ResetPasswordPage() {
	const [params] = useSearchParams();
	const token = params.get('token') ?? '';
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [show, setShow] = useState(false);
	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState(false);
	const [error, setError] = useState('');

	const differ = newPassword.length > 0 && newPassword !== confirmPassword;
	const tooShort = newPassword.length > 0 && newPassword.length < 8;
	const canSubmit = token.length > 0 && newPassword.length >= 8 && !differ && !busy;

	const submit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!canSubmit) return;
		setBusy(true);
		setError('');
		try {
			const response = await fetch('/api/recovery-email/reset-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token, newPassword }),
			});
			const data = (await response.json().catch(() => null)) as {
				error?: string;
			} | null;
			if (!response.ok) {
				throw new Error(data?.error || 'Gagal mengubah kata sandi.');
			}
			setDone(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Terjadi kesalahan.');
		} finally {
			setBusy(false);
		}
	};

	return (
		<main className="verify-page">
			<div className="verify-card">
				{done ? (
					<>
						<div className="verify-icon success">
							<BadgeCheck size={28} />
						</div>
						<h1>Kata sandi diubah</h1>
						<p>
							Kata sandi Anda berhasil diubah. Silakan masuk dengan kata sandi baru.
						</p>
						<Link to="/login" className="verify-btn">
							Ke halaman masuk
						</Link>
					</>
				) : (
					<>
						<div className="verify-icon">
							<Lock size={28} />
						</div>
						<h1>Reset kata sandi</h1>
						<p>
							Buat kata sandi baru untuk akun Anda. Tautan ini hanya berlaku sekali.
						</p>
						{!token && (
							<p className="form-error" role="alert">
								Tautan reset tidak valid. Minta tautan baru dari halaman lupa kata
								sandi.
							</p>
						)}
						<form className="onboarding-form" onSubmit={submit}>
							<label className="onboarding-field">
								<span>Kata sandi baru</span>
								<div className="onboarding-input-wrap">
									<Lock size={16} className="onboarding-input-icon" aria-hidden="true" />
									<input
										type={show ? 'text' : 'password'}
										value={newPassword}
										autoComplete="new-password"
										minLength={8}
										onChange={(e) => setNewPassword(e.target.value)}
										placeholder="Minimal 8 karakter"
										required
										disabled={!token}
									/>
									<button
										type="button"
										className="onboarding-eye"
										onClick={() => setShow((s) => !s)}
										aria-label={show ? 'Sembunyikan' : 'Tampilkan'}
									>
										{show ? <EyeOff size={16} /> : <Eye size={16} />}
									</button>
								</div>
								{tooShort && (
									<em className="onboarding-hint">Kata sandi minimal 8 karakter.</em>
								)}
							</label>
							<label className="onboarding-field">
								<span>Ulangi kata sandi baru</span>
								<div className="onboarding-input-wrap">
									<Lock size={16} className="onboarding-input-icon" aria-hidden="true" />
									<input
										type={show ? 'text' : 'password'}
										value={confirmPassword}
										autoComplete="new-password"
										minLength={8}
										onChange={(e) => setConfirmPassword(e.target.value)}
										placeholder="Ketik ulang kata sandi baru"
										required
										disabled={!token}
									/>
								</div>
								{differ && (
									<em className="onboarding-hint warn">
										Konfirmasi kata sandi tidak cocok.
									</em>
								)}
							</label>
							{error && (
								<p className="form-error" role="alert">
									{error}
								</p>
							)}
							<button type="submit" className="ld-btn-primary" disabled={!canSubmit}>
								{busy ? (
									<LoaderCircle size={17} className="spin" />
								) : (
									<>Simpan kata sandi baru</>
								)}
							</button>
						</form>
					</>
				)}
				<Link to="/login" className="verify-btn ghost">
					<ArrowLeft size={16} /> Kembali ke masuk
				</Link>
			</div>
		</main>
	);
}
