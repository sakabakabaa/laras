import { useCallback, useEffect, useState } from 'react';
import {
	AlertTriangle,
	BadgeCheck,
	Clock,
	LoaderCircle,
	Mail,
	MailCheck,
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

/**
 * Recovery email section (students only). The verified recovery email is the
 * channel for account recovery and account notifications. Reuses the existing
 * `/api/recovery-email/request` endpoint and the `email_verifications`
 * collection to surface pending verification state.
 */
export function RecoverySection() {
	const { user } = useAuth();
	const authRecord = user as {
		recoveryEmail?: string;
		recoveryEmailVerified?: boolean;
	} | null;
	const recoveryEmail = authRecord?.recoveryEmail ?? '';
	const recoveryEmailVerified = authRecord?.recoveryEmailVerified ?? false;
	const hasVerifiedEmail = recoveryEmailVerified && !!recoveryEmail;

	const [emailInput, setEmailInput] = useState('');
	const [pending, setPending] = useState<PendingVerification | null>(null);
	const [pendingLoading, setPendingLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [sent, setSent] = useState(false);

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

	const submit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const email = emailInput.trim().toLowerCase();
		if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			setError('Format email tidak valid.');
			return;
		}
		setBusy(true);
		setError('');
		setSent(false);
		try {
			const response = await fetch('/api/recovery-email/request', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${pb.authStore.token}`,
				},
				body: JSON.stringify({ email }),
			});
			const data = (await response.json().catch(() => null)) as {
				error?: string;
				message?: string;
			} | null;
			if (!response.ok) {
				throw new Error(data?.error || 'Gagal mengirim tautan verifikasi.');
			}
			setSent(true);
			setEmailInput('');
			void loadPending();
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
					<span className="ld-eyebrow">Email pemulihan</span>
					<h2>Email pemulihan &amp; notifikasi</h2>
				</div>
				{hasVerifiedEmail && (
					<span className="ld-settings-done">
						<BadgeCheck size={14} /> Terverifikasi
					</span>
				)}
			</div>
			<p className="ld-settings-lede">
				Email pribadi ini digunakan untuk pemulihan akun dan notifikasi penting. Email harus
				diverifikasi sebelum aktif.
			</p>

			{hasVerifiedEmail ? (
				<div className="ld-settings-email-verified">
					<MailCheck size={18} />
					<div>
						<strong>{recoveryEmail}</strong>
						<span>Email terverifikasi untuk pemulihan &amp; notifikasi.</span>
					</div>
				</div>
			) : pending ? (
				<div className="ld-settings-email-pending">
					<Clock size={18} />
					<div>
						<strong>Menunggu verifikasi: {pending.email}</strong>
						<span>
							Cek email Anda (termasuk folder spam) dan klik tautan verifikasi. Tautan
							kedaluwarsa dalam 24 jam.
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
				<p className="ld-settings-muted">
					Belum ada email pemulihan yang terverifikasi. Tambahkan email pribadi untuk
					pemulihan akun dan notifikasi.
				</p>
			)}

			{!hasVerifiedEmail && (
				<form className="ld-settings-form" onSubmit={submit}>
					<label className="ld-settings-field">
						<span>Email pemulihan</span>
						<div className="ld-settings-input-wrap">
							<Mail size={16} className="ld-settings-input-icon" aria-hidden="true" />
							<input
								type="email"
								value={emailInput}
								autoComplete="email"
								onChange={(e) => setEmailInput(e.target.value)}
								placeholder="nama@email.com"
								disabled={busy}
							/>
						</div>
					</label>
					{error && (
						<p className="form-error" role="alert">
							{error}
						</p>
					)}
					{sent && !error && (
						<p className="ld-settings-success">
							<MailCheck size={14} /> Tautan verifikasi telah dikirim. Cek email Anda.
						</p>
					)}
					<div className="ld-settings-actions">
						<button
							type="submit"
							className="ld-outline-action primary"
							disabled={busy || !emailInput.trim()}
						>
							{busy ? <LoaderCircle size={16} className="spin" /> : <Mail size={16} />}
							Kirim tautan verifikasi
						</button>
					</div>
				</form>
			)}

			<p className="ld-settings-note">
				<AlertTriangle size={13} /> Email NIM (&lt;nim&gt;@student.upi.edu) tidak dapat
				digunakan sebagai email pemulihan.
			</p>
		</section>
	);
}
