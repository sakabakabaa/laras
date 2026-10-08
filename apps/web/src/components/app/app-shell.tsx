import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { BarChart3, BookOpen, CalendarDays, ClipboardList, FlaskConical, FolderOpen, GraduationCap, Home, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Menu, Settings, Sparkles, Sun, User, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useT } from '@/lib/i18n';
import { dashboardForRole } from '@/lib/learning';
import { onQuickAssistantSend, type AssistantSeed } from '@/lib/assistant-quick-send';
import { GlobalSearch } from '@/components/app/global-search';
import { AgentDock, AgentPane } from '@/components/app/agent-dock';
import { LarasLockup } from '@/components/brand/laras-lockup';
import { AssistantPageContextProvider } from '@/components/app/assistant-page-context-provider';
import { useTheme } from '@/hooks/use-theme';
import '@/styles/login-light.css';
const FACULTY_NAV = [{
  to: '/app',
  end: true,
  label: 'Dashboard',
  icon: Home,
  ready: true
}, {
  to: '/app/courses',
  end: false,
  label: 'Mata Kuliah',
  icon: BookOpen,
  ready: true
}, {
  to: '/app/tugas',
  label: 'Tugas',
  icon: ClipboardList,
  ready: true,
  end: false
}, {
  to: '/app/penilaian',
  label: 'Penilaian',
  icon: GraduationCap,
  ready: true,
  end: false
}, {
  to: '/app/berkas',
  end: true,
  label: 'Berkas',
  icon: FolderOpen,
  ready: true
}, {
  to: '/app/asisten',
  label: 'Asisten',
  icon: Sparkles,
  ready: true,
  end: false
}, {
  to: '/kalender',
  label: 'Kalender',
  icon: CalendarDays,
  ready: true,
  end: true
}, {
  to: '/analytics',
  label: 'Analitik',
  icon: BarChart3,
  ready: true,
  end: false
}, {
  to: '/app/riset',
  label: 'Riset',
  icon: FlaskConical,
  ready: true,
  end: false
}] as const;
const NAV_T: Record<string, string> = {
  Dashboard: 'nav.dashboard',
  'Mata Kuliah': 'nav.courses',
  Tugas: 'nav.tasks',
  Penilaian: 'nav.grades',
  Berkas: 'nav.files',
  Asisten: 'nav.assistant',
  Kalender: 'nav.calendar',
  Analitik: 'nav.analytics',
  Riset: 'nav.research',
};
const STUDENT_NAV = [{
  to: '/app/student',
  end: true,
  label: 'Dashboard',
  icon: Home,
  ready: true
}, {
  to: '/app/courses',
  end: false,
  label: 'Mata Kuliah',
  icon: BookOpen,
  ready: true
}, {
  to: '/kalender',
  end: true,
  label: 'Kalender',
  icon: CalendarDays,
  ready: true
}, {
  to: '/analytics',
  end: false,
  label: 'Analitik',
  icon: BarChart3,
  ready: true
}] as const;
export function AppShell({
  children,
  title,
  eyebrow,
  back,
  variant = 'classic',
  hideHeading = false,
  hideSidebar = false,
  rail
}: {
  children: React.ReactNode;
  title: string;
  eyebrow: string;
  back?: boolean;
  /** `saas` = light LARAS shell matching lecturer dashboard reference */
  variant?: 'classic' | 'saas';
  hideHeading?: boolean;
  /** Render the mast header and main content without the global sidebar. */
  hideSidebar?: boolean;
  /** Course section sidebar. Global nav collapses to an icon rail. */
  rail?: React.ReactNode;
}) {
  const {
    user,
    logout
  } = useAuth();
  const { theme, toggleWithTransition } = useTheme();
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => typeof window === 'undefined' ? false : localStorage.getItem('ld-sidebar-collapsed') === '1');
  const [animating, setAnimating] = useState(false);
  const animTimer = useRef<number | undefined>(undefined);
  const [profileOpen, setProfileOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentSeed, setAgentSeed] = useState<AssistantSeed | null>(null);
  const mobileMenuBtnRef = useRef<HTMLButtonElement | null>(null);
  const sidebarCloseRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    return onQuickAssistantSend((seed) => {
      setAgentSeed(seed);
      setAgentOpen(true);
    });
  }, []);
  const toggleCollapsed = () => {
    setAnimating(true);
    setCollapsed(c => !c);
    window.clearTimeout(animTimer.current);
    animTimer.current = window.setTimeout(() => setAnimating(false), 240);
  };
  useEffect(() => () => window.clearTimeout(animTimer.current), []);
  useEffect(() => {
    localStorage.setItem('ld-sidebar-collapsed', collapsed ? '1' : '0');
  }, [collapsed]);
  useEffect(() => {
    if (!profileOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('.ld-profile-wrap')) return;
      setProfileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProfileOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [profileOpen]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    sidebarCloseRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      mobileMenuBtnRef.current?.focus();
    };
  }, [mobileOpen]);
  const role = (user as {
    role?: string;
  } | null)?.role || 'faculty';
  const home = dashboardForRole(role);
  const isStudent = role === 'student';
  const displayName = user?.name || (isStudent ? t('role.student') : t('role.faculty'));
  const roleLabel = isStudent ? t('role.student') : t('role.faculty');
  const signOut = () => {
    setProfileOpen(false);
    logout();
    navigate('/login');
  };
  const navItems = isStudent ? STUDENT_NAV : FACULTY_NAV;
  const initials = useMemo(() => {
    const base = displayName.trim();
    if (!base) return 'U';
    const parts = base.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return base.charAt(0).toUpperCase();
  }, [displayName]);
  const sidebarCollapsed = Boolean(rail) || collapsed;
  if (variant === 'saas') {
    return <AssistantPageContextProvider><div className="ld-layout">
				<header className="ld-mast">
					<div className="ld-mast-brand">
						{!hideSidebar && <button type="button" ref={mobileMenuBtnRef} className="ld-mobile-menu" aria-label="Buka navigasi" onClick={() => setMobileOpen(true)}>
							<Menu size={22} />
						</button>}
						<Link to={home} className="ld-mast-logo-link" aria-label="LARAS"><LarasLockup height={28} markOnly /></Link>
					</div>
					<div className="ld-topbar-right ld-mast-actions">
						{!isStudent && <AgentDock open={agentOpen} onOpenChange={setAgentOpen} />}
						<GlobalSearch userId={user?.id || ''} isStudent={isStudent} />
						<div className={`ld-profile-wrap${profileOpen ? ' open' : ''}`}>
							<button type="button" className="ld-profile-trigger" aria-label="Menu profil" aria-expanded={profileOpen} aria-haspopup="menu" onClick={() => setProfileOpen(o => !o)}>
								<span className="ld-avatar icon" aria-hidden>
									<User size={18} strokeWidth={1.75} />
								</span>
							</button>
							{profileOpen && <div className="ld-profile-menu" role="menu">
									<div className="ld-profile-menu-head">
										<span className="ld-avatar sm icon" aria-hidden>
											<User size={18} strokeWidth={1.75} />
										</span>
										<div>
											<strong>{displayName}</strong>
											<span>{user?.email || roleLabel}</span>
										</div>
									</div>
									<div className="ld-profile-menu-actions">
										<Link to="/app/pengaturan" role="menuitem" onClick={() => setProfileOpen(false)}>
											<Settings size={16} strokeWidth={1.75} />
											{t('nav.settings')}
										</Link>
										<button type="button" role="menuitem" aria-pressed={theme === 'dark'} onClick={(e) => toggleWithTransition(e)}>
											{theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
											{theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
										</button>
										<button type="button" role="menuitem" onClick={signOut}>
											<LogOut size={16} strokeWidth={1.75} />
											Keluar
										</button>
									</div>
								</div>}
						</div>
					</div>
				</header>

				<div className={`ld-stage${agentOpen && !isStudent ? ' agent-open' : ''}`}>
				<div className={`ld-body${rail ? ' has-rail' : ''}${hideSidebar ? ' no-sidebar' : ''}`}>
					{!hideSidebar && <aside className={`ld-sidebar ${mobileOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}${animating ? ' ld-animating' : ''}`}>
						<div className="ld-sidebar-brand">
							<button type="button" ref={sidebarCloseRef} className="ld-sidebar-close" aria-label={t('nav.closeNav')} onClick={() => setMobileOpen(false)}>
								<X size={20} />
							</button>
						</div>

						<nav className="ld-nav" aria-label="Navigasi utama">
							{navItems.map(item => {
              const Icon = item.icon;
              if (!item.ready) {
                return <Link key={item.label} to={item.to} className="ld-nav-link" onClick={() => setMobileOpen(false)}>
											<Icon size={18} strokeWidth={1.75} />
											<span>{t(NAV_T[item.label] ?? item.label)}</span>
										</Link>;
              }
              const hash = 'hash' in item ? item.hash : undefined;
              return <NavLink key={item.label} to={hash ? `${item.to}#${hash}` : item.to} end={'end' in item ? item.end : false} className={({
                isActive
              }) => `ld-nav-link${isActive && !hash ? ' active' : ''}${hash && location.hash === `#${hash}` ? ' active' : ''}`} onClick={() => setMobileOpen(false)}>
										<Icon size={18} strokeWidth={1.75} />
										<span>{t(NAV_T[item.label] ?? item.label)}</span>
									</NavLink>;
            })}
						</nav>

						{!rail && <div className="ld-sidebar-foot">
							<button type="button" className="ld-nav-link ld-collapse-toggle" onClick={toggleCollapsed} title={collapsed ? t('nav.showMenu') : t('nav.hideMenu')} aria-label={collapsed ? t('nav.showMenu') : t('nav.hideMenu')}>
								{collapsed ? <PanelLeftOpen size={18} strokeWidth={1.75} /> : <PanelLeftClose size={18} strokeWidth={1.75} />}
								<span>{collapsed ? t('nav.showShort') : t('nav.hideShort')}</span>
							</button>
						</div>}
					</aside>}

					{!hideSidebar && mobileOpen && <button type="button" className="ld-scrim" aria-label={t('nav.closeNav')} onClick={() => setMobileOpen(false)} />}
					{rail}

					<div className="ld-main">
						<main className="ld-content">
							{back && <Link to={home} className="ld-back">
									← {t('shell.back')}
								</Link>}
							{!hideHeading && <div className="ld-page-head">
									<span className="ld-eyebrow">{eyebrow}</span>
									<h1>{title}</h1>
								</div>}
							{children}
						</main>
					</div>
				</div>
				{!isStudent && <AgentPane open={agentOpen} name={displayName} onClose={() => setAgentOpen(false)} seed={agentSeed} onSeedConsumed={() => setAgentSeed(null)} />}
			</div>
			</div></AssistantPageContextProvider>;
  }
  return null;
}
