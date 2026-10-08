import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
	ArrowRight,
	BookOpen,
	CalendarDays,
	Camera,
	ChevronDown,
	ClipboardList,
	FileText,
	MoreHorizontal,
	Users,
} from 'lucide-react';
import { CourseThumb } from '@/components/app/course-thumb';
import { courseRouteId } from '@/lib/course-route';
import type { Course } from '@/lib/learning';

export type CourseCatalogStats = {
	course: Course;
	cover: string;
	students: number;
	accounts: number;
	unactivated: number;
	sessions: number;
	done: number;
	upcoming: number;
	pct: number;
	materials: number;
	publishedMaterials: number;
	tasks: number;
	activeTasks: number;
	draftTasks: number;
	nextSession: { week: number; dateLabel: string; title: string } | null;
	attention: { week: number; title: string } | null;
	active: boolean;
};

export function CourseCatalogCard({
	item,
	layout,
	onEditThumb,
}: {
	item: CourseCatalogStats;
	layout: 'grid' | 'list';
	onEditThumb: (course: Course) => void;
}) {
	const { course } = item;
	const [menu, setMenu] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const href = `/app/courses/${courseRouteId(course)}`;

	useEffect(() => {
		if (!menu) return;
		function onDoc(event: MouseEvent) {
			if (!menuRef.current?.contains(event.target as Node)) setMenu(false);
		}
		document.addEventListener('mousedown', onDoc);
		return () => document.removeEventListener('mousedown', onDoc);
	}, [menu]);

	const meta = [
		course.code || 'Tanpa kode',
		course.semester || null,
		course.credits ? `${course.credits} SKS` : null,
	]
		.filter(Boolean)
		.join(' · ');

	const studentNote =
		item.students === 0
			? 'Belum ada mahasiswa'
			: item.unactivated > 0
				? `${item.accounts} akun aktif · ${item.unactivated} belum aktivasi`
				: item.accounts > 0 && item.accounts !== item.students
					? `${item.accounts} akun aktif`
					: 'Terdaftar di roster';

	if (layout === 'list') {
		return (
			<li className="mk-list-item">
				<article className="mk-list-row">
					<CourseThumb course={course} cover={item.cover} className="mk-list-thumb" />
					<div className="mk-list-copy">
						<strong>{course.title}</strong>
						<small>{meta}</small>
					</div>
					<span className={item.active ? 'ld-badge' : 'mk-badge-draft'}>
						{item.active ? 'Aktif' : 'Draf'}
					</span>
					<span className="mk-list-stat">{item.students} mhs</span>
					<span className="mk-list-stat">{item.pct}%</span>
					<Link to={href} className="ld-card-cta">
						Buka <ArrowRight size={14} strokeWidth={2.25} />
					</Link>
				</article>
			</li>
		);
	}

	return (
		<li className="mk-card-item">
			<article className="mk-card">
				<div className="mk-card-title-row">
					<div className="mk-card-copy">
						<h3>{course.title}</h3>
						<p className="mk-card-meta">{meta}</p>
					</div>
					<div className="mk-card-tools">
						<span className={item.active ? 'ld-badge' : 'mk-badge-draft'}>
							<span className="mk-status-dot" aria-hidden />
							{item.active ? 'Aktif' : 'Draf'}
						</span>
						<Link to={href} className="mk-open mk-open-top">
							Buka Mata Kuliah <ArrowRight size={14} />
						</Link>
						<div className="mk-menu" ref={menuRef}>
							<button
								type="button"
								className="mk-menu-btn"
								aria-expanded={menu}
								aria-label={`Menu ${course.title}`}
								onClick={() => setMenu((open) => !open)}
							>
								<MoreHorizontal size={16} />
							</button>
							{menu && (
								<div className="mk-menu-pop" role="menu">
									<button type="button" role="menuitem" onClick={() => onEditThumb(course)}>
										Ubah thumbnail
									</button>
									<Link to={href} role="menuitem" onClick={() => setMenu(false)}>
										Buka mata kuliah
									</Link>
								</div>
							)}
						</div>
					</div>
				</div>

				<div className="mk-card-body">
					<div className="mk-card-media">
						<CourseThumb course={course} cover={item.cover} className="mk-card-thumb" />
						<button
							type="button"
							className="mk-thumb-edit"
							onClick={() => onEditThumb(course)}
							aria-label={`Ubah thumbnail ${course.title}`}
						>
							<Camera size={13} strokeWidth={2.2} />
						</button>
					</div>
					<ul className="mk-mini-stats">
						<li>
							<span className="mk-mini-ico blue">
								<Users size={15} strokeWidth={1.8} />
							</span>
							<div>
								<strong>{item.students}</strong>
								<small>Mahasiswa</small>
								<em>{studentNote}</em>
							</div>
						</li>
						<li>
							<span className="mk-mini-ico indigo">
								<BookOpen size={15} strokeWidth={1.8} />
							</span>
							<div>
								<strong>{item.sessions}</strong>
								<small>Sesi</small>
								<em>
									{item.done} selesai · {item.upcoming} mendatang
								</em>
							</div>
						</li>
						<li>
							<span className="mk-mini-ico green">
								<FileText size={15} strokeWidth={1.8} />
							</span>
							<div>
								<strong>{item.materials}</strong>
								<small>Materi</small>
								<em>
									{item.publishedMaterials > 0
										? `${item.publishedMaterials} dipublikasikan`
										: 'Belum dipublikasikan'}
								</em>
							</div>
						</li>
						<li>
							<span className="mk-mini-ico violet">
								<ClipboardList size={15} strokeWidth={1.8} />
							</span>
							<div>
								<strong>{item.tasks}</strong>
								<small>Tugas</small>
								<em>
									{item.activeTasks} aktif
									{item.draftTasks > 0 ? ` · ${item.draftTasks} belum dibuat` : ''}
								</em>
							</div>
						</li>
					</ul>
				</div>

				<details className="mk-summary">
					<summary className="mk-summary-toggle">
						<span>Ringkasan</span>
						<small>
							RPS {item.pct}%
							{item.nextSession ? ` · Minggu ${item.nextSession.week}` : ''}
							{item.attention ? ' · Perlu perhatian' : ''}
						</small>
						<ChevronDown size={16} aria-hidden />
					</summary>
					<div className="mk-card-foot">
						<div className="mk-progress-block">
							<div className="mk-progress-label">
								<span className="mk-mini-ico rose">
									<ClipboardList size={14} strokeWidth={1.8} />
								</span>
								<strong>Progress RPS</strong>
								<em>{item.pct}%</em>
							</div>
							<div className="mk-progress">
								<span style={{ width: `${item.pct}%` }} />
							</div>
							<small>
								{item.sessions === 0
									? 'Belum ada pertemuan'
									: `${item.done} dari ${item.sessions} minggu selesai`}
							</small>
						</div>

						<div className="mk-next">
							<span className="mk-mini-ico sky">
								<CalendarDays size={14} strokeWidth={1.8} />
							</span>
							<div>
								<strong>Sesi berikutnya</strong>
								{item.nextSession ? (
									<>
										<p>
											Minggu {item.nextSession.week}
											{item.nextSession.dateLabel ? ` · ${item.nextSession.dateLabel}` : ''}
										</p>
										<small>{item.nextSession.title || 'Belum ada judul sesi'}</small>
									</>
								) : (
									<p>Tidak ada sesi mendatang</p>
								)}
							</div>
						</div>

						{item.attention ? (
							<div className="mk-attention">
								<strong>Perlu perhatian</strong>
								<p>
									Tugas untuk Minggu {item.attention.week}
									{item.attention.title ? ` (${item.attention.title})` : ''} belum dibuat.
								</p>
								<Link to={`/app/tugas/buat?course=${course.id}`} className="mk-attention-link">
									Buat tugas sekarang <ArrowRight size={13} />
								</Link>
							</div>
						) : (
							<div className="mk-attention quiet">
								<strong>Tidak ada yang tertunda</strong>
								<p>Setiap sesi mendatang sudah punya tugas, atau belum ada jadwal.</p>
							</div>
						)}
					</div>
				</details>
			</article>
		</li>
	);
}
