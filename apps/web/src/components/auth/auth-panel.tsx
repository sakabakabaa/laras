import { tourSessionKey } from '@/components/app/welcome-tour';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
	Eye,
	EyeOff,
	GraduationCap,
	LoaderCircle,
	Lock,
	Mail,
	Users,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import pb from '@/lib/pocketbase-client';
import { LoginFeaturePreview } from './login-feature-preview';
import { LarasLockup } from '@/components/brand/laras-lockup';
import {
	dashboardForRole,
	errorMessage,
	type Role,
} from '@/lib/learning';
import '@/styles/login-light.css';

const ROLE_COPY: Record<
	Role,
	{
		heroBody: string;
		formHeadLogin: string;
		formSubLogin: string;
		submitLogin: string;
	}
> = {
	faculty: {
		heroBody:
			'Kelola mata kuliah, RPS, silabus, dan sesi mengajar Anda dalam satu ruang kerja yang tertata.',
		formHeadLogin: 'Selamat Datang, Dosen',
		formSubLogin: 'Masuk ke ruang kerja dosen',
		submitLogin: 'Masuk sebagai Dosen',
	},
	student: {
		heroBody:
			'Akses mata kuliah yang Anda ikuti, baca materi, dan pantau sesi kelas dalam satu tempat.',
		formHeadLogin: 'Selamat Datang, Mahasiswa',
		formSubLogin: 'Masuk ke ruang belajar Anda',
		submitLogin: 'Masuk sebagai Mahasiswa',
	},
};

export function AuthPanel() {
	const { login } = useAuth();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const next = searchParams.get('next') || '';
	const [role, setRole] = useState<Role>('student');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [remember, setRemember] = useState(true);
	const [showPassword, setShowPassword] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [correctingRole, setCorrectingRole] = useState<Role | null>(null);

	const copy = ROLE_COPY[role];

	// Student accounts created from the lecturer roster use NIM as their login
	// identifier (their email is <nim>@student.upi.edu). On the student login
	// tab we collect the NIM and expand it to that email before authenticating.
	const nimLogin = role === 'student';
	const loginIdentifier = nimLogin && !email.includes('@')
		? `${email.trim()}@student.upi.edu`
		: email.trim();

	const submit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setBusy(true);
		setError('');
		setCorrectingRole(null);
		try {
			try {
				await login(loginIdentifier, password);
			} catch (firstError) {
				// If the student NIM was entered while the lecturer tab was active,
				// retry with the roster account's canonical email identifier.
				const studentIdentifier = `${email.trim()}@student.upi.edu`;
				if (email.includes('@') || studentIdentifier === loginIdentifier) throw firstError;
				await login(studentIdentifier, password);
			}
			// The account record is authoritative. Correct the role picker before
			// navigating so signing in under the wrong tab still feels intentional.
			const storedRole = (pb.authStore.record as { role?: string } | null)?.role;
			const accountRole: Role = storedRole === 'student' ? 'student' : 'faculty';
			try { sessionStorage.removeItem(tourSessionKey(pb.authStore.record?.id || '', accountRole)); } catch { /* Storage is optional. */ }
			if (accountRole !== role) {
				setCorrectingRole(accountRole);
				setRole(accountRole);
				await new Promise((resolve) => window.setTimeout(resolve, 420));
			}
			// A safe same-origin next path returns users to the page they requested.
			const dest =
				next && next.startsWith('/') && !next.startsWith('//')
					? next
					: dashboardForRole(accountRole);
			navigate(dest);
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<main className="lp">
			<div className="lp-wash" aria-hidden="true" />
			<div className="lp-shapes" aria-hidden="true">
				<span />
				<span />
				<span />
			</div>
			<section className="lp-story" aria-label="LARAS">
				<div>
					<Link to="/" aria-label="Beranda LARAS">
						<LarasLockup height={52} />
					</Link>
					<p className="lp-kicker">Asisten akademik terintegrasi</p>
					<h1>
						<span className="login-role-copy" key={`hero-title-${role}`}>{role === 'student' ? 'Belajar.' : 'Mengajar.'}</span>
						<span>Lebih Mudah.</span>
					</h1>
					<p className="lp-lead login-role-copy" key={`hero-body-${role}`}>{copy.heroBody}</p>
				</div>
				<LoginFeaturePreview key={role} role={role} />
			</section>

			<section className="lp-pane">
				<div className="lp-card">
					<div className="lp-card-brand">
						<LarasLockup height={34} />
					</div>
					<h2 className="login-role-copy" key={`form-heading-${role}`}>{copy.formHeadLogin}</h2>
					<p className="lp-card-sub login-role-copy" key={`form-subtitle-${role}`}>{copy.formSubLogin}</p>

					<div className="login-role-toggle" role="tablist" aria-label="Peran" data-role={role}>
						<span className="login-role-indicator" aria-hidden="true" />
						<button
							type="button"
							role="tab"
							aria-selected={role === 'student'}
							className={role === 'student' ? 'active' : ''}
							onClick={() => {
								setRole('student');
								setCorrectingRole(null);
								setError('');
							}}
						>
							<GraduationCap size={16} />
							Mahasiswa
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={role === 'faculty'}
							className={role === 'faculty' ? 'active' : ''}
							onClick={() => {
								setRole('faculty');
								setCorrectingRole(null);
								setError('');
							}}
						>
							<Users size={16} />
							Dosen
						</button>
					</div>

					<form onSubmit={submit} className="login-form">
						<label className="login-field">
							<span>NIM atau Alamat Email UPI</span>
							<div className="login-input-wrap">
								<Mail size={16} className="login-input-icon" aria-hidden="true" />
								<input
									type="text"
									required
									autoComplete="username"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder="contoh: 2021001 atau nama@upi.edu"
								/>
							</div>
						</label>

						<label className="login-field">
							<span>Kata Sandi</span>
							<div className="login-input-wrap">
								<Lock size={16} className="login-input-icon" aria-hidden="true" />
								<input
									type={showPassword ? 'text' : 'password'}
									minLength={8}
									required
									autoComplete="current-password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder="Masukkan kata sandi"
								/>
								<button
									type="button"
									className="login-eye"
									aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
									onClick={() => setShowPassword(!showPassword)}
								>
									{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
								</button>
							</div>
						</label>

						<div className="login-row-opts">
							<label className="login-remember">
								<input
									type="checkbox"
									checked={remember}
									onChange={(e) => setRemember(e.target.checked)}
								/>
								Ingat saya
							</label>
							<Link to="/lupa-sandi" className="login-forgot">
								Lupa kata sandi?
							</Link>
						</div>

						{error && (
							<p className="form-error" role="alert">
								{error}
							</p>
						)}
						{correctingRole && <p className="login-role-correction login-role-copy" key={`correction-${correctingRole}`} role="status">Akun ini terdaftar sebagai {correctingRole === 'student' ? 'mahasiswa' : 'dosen'}. Mengalihkan pilihan…</p>}

						<button className="login-submit" type="submit" disabled={busy}>
							{busy ? (
								<LoaderCircle size={18} className="spin" />
							) : (
								<>
									<span className="login-role-copy" key={`submit-${role}`}>{copy.submitLogin}</span>
									<span aria-hidden="true">→</span>
								</>
							)}
						</button>
					</form>

					<div className="login-divider">
						<span>atau lanjutkan dengan</span>
					</div>

					<div className="login-oauth">
						<button type="button" className="login-oauth-btn lp-coming" disabled title="Segera hadir">
							<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
								<path
									fill="#FFC107"
									d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.1 29.3 3 24 3 12.3 3 3 12.3 3 24s9.3 21 21 21 21-9.3 21-21c0-1.4-.1-2.7-.4-4z"
								/>
								<path
									fill="#FF3D00"
									d="M6.3 14.7 12.9 19.6C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.1 29.3 3 24 3 16.3 3 9.6 7.3 6.3 14.7z"
								/>
								<path
									fill="#4CAF50"
									d="M24 45c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 36.3 26.8 37 24 37c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.5 40.6 16.2 45 24 45z"
								/>
								<path
									fill="#1976D2"
									d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l.1.1 6.2 5.2C39.2 37.1 45 32 45 24c0-1.4-.1-2.7-.4-4z"
								/>
							</svg>
							Google
							<span className="lp-coming-tip" aria-hidden="true">Segera hadir</span>
						</button>
						<button type="button" className="login-oauth-btn lp-coming" disabled title="Segera hadir">
							<svg width="18" height="18" viewBox="0 0 23 23" aria-hidden="true">
								<path fill="#f35325" d="M1 1h10v10H1z" />
								<path fill="#81bc06" d="M12 1h10v10H12z" />
								<path fill="#05a6f0" d="M1 12h10v10H1z" />
								<path fill="#ffba08" d="M12 12h10v10H12z" />
							</svg>
							Microsoft
							<span className="lp-coming-tip" aria-hidden="true">Segera hadir</span>
						</button>
					</div>
				</div>
			</section>
		</main>
	);
}
