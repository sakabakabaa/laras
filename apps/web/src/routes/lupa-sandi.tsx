import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, LoaderCircle, Mail, MailCheck } from 'lucide-react';
import type { Route } from './+types/lupa-sandi';
import { seo } from '@/lib/seo';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Lupa kata sandi | LARAS',
		description: 'Reset kata sandi akun LARAS Anda melalui email pemulihan yang terverifikasi.',
	});
}

export default function LupaSandiPage() {
	const [email, setEmail] = useState('');
	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState(false);
	const [error, setError] = useState('');

	const submit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const value = email.trim().toLowerCase();
		if (!value || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
			setError('Format email tidak valid.');
			return;
		}
		setBusy(true);
		setError('');
		try {
			const response = await fetch('/api/recovery-email/request-reset', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: value }),
			});
			const data = (await response.json().catch(() => null)) as {
				error?: string;
				message?: string;
			} | null;
			if (!response.ok) {
				throw new Error(data?.error || 'Gagal mengirim tautan reset.');
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
				{!done ? (
					<>
						<div className="verify-icon">
							<Mail size={28} />
						</div>
						<h1>Lupa kata sandi</h1>
						<p>
							Masukkan email pemulihan yang sudah Anda verifikasi. Tautan reset kata
							sandi akan dikirim ke email tersebut jika akunnya terdaftar dan
							terverifikasi.
						</p>
						<form className="onboarding-form" onSubmit={submit}>
							<label className="onboarding-field">
								<span>Email pemulihan</span>
								<div className="onboarding-input-wrap">
									<Mail size={16} className="onboarding-input-icon" aria-hidden="true" />
									<input
										type="email"
										value={email}
										autoComplete="email"
										onChange={(e) => setEmail(e.target.value)}
										placeholder="nama@email.com"
										required
									/>
								</div>
							</label>
							{error && (
								<p className="form-error" role="alert">
									{error}
								</p>
							)}
							<button type="submit" className="ld-btn-primary" disabled={busy}>
								{busy ? (
									<LoaderCircle size={17} className="spin" />
								) : (
									<>Kirim tautan reset</>
								)}
							</button>
						</form>
					</>
				) : (
					<>
						<div className="verify-icon success">
							<MailCheck size={28} />
						</div>
						<h1>Tautan terkirim</h1>
						<p>
							Jika email pemulihan Anda terverifikasi, tautan reset kata sandi telah
							dikirim. Periksa email Anda (termasuk folder spam). Tautan kedaluwarsa
							dalam 24 jam.
						</p>
					</>
				)}
				<Link to="/login" className="verify-btn ghost">
					<ArrowLeft size={16} /> Kembali ke masuk
				</Link>
			</div>
		</main>
	);
}
