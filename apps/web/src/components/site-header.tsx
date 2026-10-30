import { Link, useLocation } from 'react-router';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { dashboardForRole } from '@/lib/learning';
import { LarasLockup } from '@/components/brand/laras-lockup';
import '@/styles/login-light.css';

export function SiteHeader() {
	const [open, setOpen] = useState(false);
	const { user, isAuthed, isLoading } = useAuth();
	const location = useLocation();
	const isApp = location.pathname.startsWith('/app');
	const isLogin = location.pathname.startsWith('/login');
	if (isApp || isLogin) return null;
	const dashboard = dashboardForRole((user as { role?: string } | null)?.role);

	return (
		<header className="site-header">
			<div className="site-header-inner">
				<Link to="/" className="wordmark" aria-label="Beranda LARAS">
					<LarasLockup height={40} />
				</Link>
				<nav className="desktop-nav" aria-label="Navigasi utama">
					<Link to="/#platform">Fitur</Link>
					<Link to="/#mahasiswa">Untuk Mahasiswa</Link>
					<Link to="/#dosen">Untuk Dosen</Link>
					<Link to="/#ai">Tentang</Link>
				</nav>
				<div className="header-actions">
					{!isLoading && (
						<Link className="header-cta" to={isAuthed ? dashboard : '/login'}>
							{isAuthed ? 'Dashboard' : 'Login'} <ArrowUpRight size={16} />
						</Link>
					)}
				</div>
				<button
					type="button"
					className="mobile-menu-button"
					aria-label={open ? 'Tutup menu' : 'Buka menu'}
					onClick={() => setOpen(!open)}
				>
					{open ? <X size={22} /> : <Menu size={22} />}
				</button>
			</div>
			{open && (
				<nav
					className="mobile-nav"
					aria-label="Navigasi seluler"
					onClick={() => setOpen(false)}
				>
					<Link to="/#platform">Fitur</Link>
					<Link to="/#mahasiswa">Untuk Mahasiswa</Link>
					<Link to="/#dosen">Untuk Dosen</Link>
					<Link to="/#ai">Tentang</Link>
					{!isLoading && (
						<Link to={isAuthed ? dashboard : '/login'}>{isAuthed ? 'Dashboard' : 'Login'}</Link>
					)}
				</nav>
			)}
		</header>
	);
}
