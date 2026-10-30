import { Link, useLocation } from 'react-router';
import { useAuth } from '@/hooks/use-auth';
import { dashboardForRole } from '@/lib/learning';
import { LarasLockup } from '@/components/brand/laras-lockup';
import '@/styles/login-light.css';

export function SiteFooter() {
	const location = useLocation();
	const { user, isAuthed, isLoading } = useAuth();
	if (location.pathname.startsWith('/app') || location.pathname.startsWith('/login')) return null;
	const dashboard = dashboardForRole((user as { role?: string } | null)?.role);
	return (
		<footer className="site-footer">
			<div className="footer-top">
				<div className="footer-brand-col">
					<Link to="/" className="footer-brand" aria-label="Beranda LARAS">
						<LarasLockup height={40} />
					</Link>
					<p>Language Learning, AI &amp; Academic Support.</p>
				</div>
				<nav aria-label="Produk">
					<strong>Produk</strong>
					<Link to="/#platform">Fitur</Link>
					<Link to="/#mahasiswa">Untuk Mahasiswa</Link>
					<Link to="/#dosen">Untuk Dosen</Link>
				</nav>
				<nav aria-label="Tentang">
					<strong>Tentang</strong>
					<Link to="/#ai">Tentang LARAS</Link>
					<Link to="/#cara-kerja">Cara kerja</Link>
					<Link to="/#keterampilan">Keterampilan bahasa</Link>
				</nav>
				<nav aria-label="Bantuan">
					<strong>Bantuan</strong>
					{!isLoading && (
						<Link to={isAuthed ? dashboard : '/login'}>{isAuthed ? 'Dashboard' : 'Login'}</Link>
					)}
					<Link to="/lupa-sandi">Lupa sandi</Link>
				</nav>
			</div>
			<div className="footer-bottom">
				<span>© {new Date().getFullYear()} LARAS. Semua hak dilindungi.</span>
				<span>AI membantu. Dosen tetap memutuskan.</span>
			</div>
		</footer>
	);
}
