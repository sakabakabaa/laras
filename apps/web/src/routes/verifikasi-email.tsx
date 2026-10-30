import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BadgeCheck, LoaderCircle, AlertTriangle, ArrowLeft } from 'lucide-react';
import type { Route } from './+types/verifikasi-email';
import { seo } from '@/lib/seo';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Verifikasi email | LARAS',
		description: 'Konfirmasi email pemulihan akun LARAS Anda.',
	});
}

type State =
	| { kind: 'loading' }
	| { kind: 'success'; email?: string }
	| { kind: 'already'; email?: string }
	| { kind: 'error'; message: string };

export default function VerifyEmailPage() {
	const [params] = useSearchParams();
	const token = params.get('token') ?? '';
	const [state, setState] = useState<State>({ kind: 'loading' });

	useEffect(() => {
		if (!token) {
			setState({ kind: 'error', message: 'Tautan verifikasi tidak valid.' });
			return;
		}
		let cancelled = false;
		void (async () => {
			try {
				const response = await fetch('/api/recovery-email/verify', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ token }),
				});
				const data = (await response.json().catch(() => null)) as {
					error?: string;
					email?: string;
					alreadyVerified?: boolean;
				} | null;
				if (cancelled) return;
				if (!response.ok) {
					setState({
						kind: 'error',
						message: data?.error || 'Verifikasi gagal. Coba minta tautan baru.',
					});
					return;
				}
				if (data?.alreadyVerified) {
					setState({ kind: 'already', email: data.email });
				} else {
					setState({ kind: 'success', email: data?.email });
				}
			} catch {
				if (!cancelled) {
					setState({ kind: 'error', message: 'Verifikasi gagal. Periksa koneksi Anda.' });
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [token]);

	return (
		<main className="verify-page">
			<div className="verify-card">
				{state.kind === 'loading' && (
					<>
						<div className="verify-icon loading">
							<LoaderCircle size={28} className="spin" />
						</div>
						<h1>Memverifikasi email...</h1>
						<p>Mohon tunggu, kami sedang mengonfirmasi email Anda.</p>
					</>
				)}

				{state.kind === 'success' && (
					<>
						<div className="verify-icon success">
							<BadgeCheck size={28} />
						</div>
						<h1>Email terverifikasi</h1>
						<p>
							{state.email ? (
								<strong>{state.email}</strong>
							) : 'Email Anda'}{' '}
							berhasil diverifikasi dan kini dapat digunakan untuk pemulihan akun
							serta notifikasi.
						</p>
						<Link to="/app/onboarding" className="verify-btn">
							Kembali ke pengaturan akun
						</Link>
					</>
				)}

				{state.kind === 'already' && (
					<>
						<div className="verify-icon success">
							<BadgeCheck size={28} />
						</div>
						<h1>Email sudah terverifikasi</h1>
						<p>
							Email{state.email ? ` ${state.email}` : ''} sudah diverifikasi sebelumnya.
							Tidak ada tindakan lebih lanjut diperlukan.
						</p>
						<Link to="/app/onboarding" className="verify-btn">
							Kembali ke pengaturan akun
						</Link>
					</>
				)}

				{state.kind === 'error' && (
					<>
						<div className="verify-icon error">
							<AlertTriangle size={28} />
						</div>
						<h1>Verifikasi gagal</h1>
						<p>{state.message}</p>
						<Link to="/app/onboarding" className="verify-btn ghost">
							<ArrowLeft size={16} /> Kembali ke pengaturan akun
						</Link>
					</>
				)}
			</div>
		</main>
	);
}
