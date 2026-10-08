import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import {
	BookOpenText,
	CalendarDays,
	Check,
	ChevronDown,
	ClipboardCheck,
	ClipboardList,
	FileText,
	FolderOpen,
	GraduationCap,
	Info,
	BarChart3,
	LayoutDashboard,
	Repeat,
	Settings,
	Users,
} from 'lucide-react';
import type { Course } from '@/lib/learning';
import {
	courseSectionPath,
	FACULTY_COURSE_SECTIONS,
	SECTION_LABEL,
	SECTION_LABEL_STUDENT,
	sectionFromPath,
	STUDENT_COURSE_SECTIONS,
	type CourseSection,
} from '@/lib/course-sections';
import { courseRouteId } from '@/lib/course-route';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { useAuth } from '@/hooks/use-auth';
import pb from '@/lib/pocketbase-client';

const ICONS: Record<CourseSection, typeof LayoutDashboard> = {
	ringkasan: LayoutDashboard,
	rps: FileText,
	silabus: BookOpenText,
	'mata-kuliah': CalendarDays,
	absensi: ClipboardList,
	tugas: ClipboardCheck,
	latihan: Repeat,
	berkas: FolderOpen,
	nilai: GraduationCap,
	info: Info,
	mahasiswa: Users,
	pengaturan: Settings,
	analitik: BarChart3,
};

export function CourseRail({
	course,
	routeId,
	isStudent,
	isOwner,
}: {
	course: Course | null;
	/** The route segment appearing in the URL (code slug or legacy id). */
	routeId: string;
	isStudent: boolean;
	isOwner: boolean;
}) {
	const id = routeId || '';
	const baseSections = isStudent ? STUDENT_COURSE_SECTIONS : FACULTY_COURSE_SECTIONS;
	const sections = baseSections.filter((section) => {
		if (section === 'pengaturan' && !isOwner) return false;
		return true;
	});

	return (
		<aside className="ld-course-rail" aria-label="Navigasi mata kuliah">
			{isStudent ? (
				<div className="ld-course-rail-head">
					<span>Ruang belajar</span>
					<strong>{course?.title || 'Memuat…'}</strong>
					<small>{course?.code || 'Kode belum diisi'}</small>
				</div>
			) : (
				<CourseSwitcher course={course} routeId={id} />
			)}
			<nav>
				{sections.map((section) => {
					const Icon = ICONS[section];
					const to = id ? courseSectionPath(id, section) : '#';
					const label = isStudent
						? SECTION_LABEL_STUDENT[section] || SECTION_LABEL[section]
						: SECTION_LABEL[section];
					return (
						<NavLink
							key={section}
							to={to}
							end={section === 'ringkasan'}
							className={({ isActive }) => `ld-course-rail-link${isActive ? ' active' : ''}`}
						>
							<Icon size={16} strokeWidth={1.75} />
							<span>{label}</span>
						</NavLink>
					);
				})}
			</nav>
		</aside>
	);
}

function CourseSwitcher({ course, routeId }: { course: Course | null; routeId: string }) {
	const { user } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const listId = useId();
	const rootRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);

	const query = useCachedQuery<Course[]>(
		user?.id ? `courses:switcher=${user.id}` : null,
		() => pb.collection('courses').getFullList<Course>({ sort: 'title' }),
	);
	const courses = query.data ?? (course ? [course] : []);
	const currentSection = sectionFromPath(location.pathname, routeId);

	useEffect(() => {
		if (!open) return;
		const onDoc = (event: MouseEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener('mousedown', onDoc);
		return () => document.removeEventListener('mousedown', onDoc);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const index = courses.findIndex((item) => courseRouteId(item) === routeId || item.id === routeId);
		setActiveIndex(index >= 0 ? index : 0);
		const option = rootRef.current?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]');
		option?.focus();
	}, [open, courses, routeId]);

	const go = (item: Course) => {
		const nextId = courseRouteId(item);
		const userId = user?.id || '';
		const allowed =
			currentSection === 'pengaturan' && item.owner !== userId ? 'ringkasan' : currentSection;
		setOpen(false);
		buttonRef.current?.focus();
		if (nextId === routeId) return;
		navigate(courseSectionPath(nextId, allowed));
	};

	const onButtonKey = (event: React.KeyboardEvent) => {
		if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			setOpen(true);
		}
	};

	const onListKey = (event: React.KeyboardEvent) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			setOpen(false);
			buttonRef.current?.focus();
			return;
		}
		if (!courses.length) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			setActiveIndex((index) => (index + 1) % courses.length);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			setActiveIndex((index) => (index - 1 + courses.length) % courses.length);
		} else if (event.key === 'Home') {
			event.preventDefault();
			setActiveIndex(0);
		} else if (event.key === 'End') {
			event.preventDefault();
			setActiveIndex(courses.length - 1);
		} else if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			const item = courses[activeIndex];
			if (item) go(item);
		}
	};

	useEffect(() => {
		if (!open) return;
		const option = rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[activeIndex];
		option?.focus();
	}, [activeIndex, open]);

	return (
		<div className={`ld-course-switch${open ? ' open' : ''}`} ref={rootRef}>
			<span className="ld-course-switch-kicker">Mata kuliah</span>
			<button
				ref={buttonRef}
				type="button"
				className="ld-course-switch-btn"
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={listId}
				onClick={() => setOpen((value) => !value)}
				onKeyDown={onButtonKey}
			>
				<span>
					<strong>{course?.title || 'Memuat…'}</strong>
					<small>{course?.code || 'Pilih mata kuliah'}</small>
				</span>
				<ChevronDown size={16} strokeWidth={2} aria-hidden />
			</button>
			{open && (
				<div
					id={listId}
					className="ld-course-switch-menu"
					role="listbox"
					aria-label="Ganti mata kuliah"
					tabIndex={-1}
					onKeyDown={onListKey}
				>
					{query.loading && !courses.length && <p className="ld-course-switch-empty">Memuat mata kuliah…</p>}
					{query.error && <p className="ld-course-switch-empty">{query.error}</p>}
					{!query.loading && !courses.length && (
						<p className="ld-course-switch-empty">Belum ada mata kuliah.</p>
					)}
					{courses.map((item, index) => {
						const selected = courseRouteId(item) === routeId || item.id === routeId;
						return (
							<button
								key={item.id}
								type="button"
								role="option"
								aria-selected={selected}
								className={`ld-course-switch-option${selected ? ' active' : ''}${index === activeIndex ? ' focused' : ''}`}
								onMouseEnter={() => setActiveIndex(index)}
								onClick={() => go(item)}
							>
								<span>
									<strong>{item.title}</strong>
									<small>{item.code || 'Tanpa kode'}</small>
								</span>
								{selected && <Check size={15} strokeWidth={2.25} aria-hidden />}
							</button>
						);
					})}
					<NavLink to="/app/courses" className="ld-course-switch-all" onClick={() => setOpen(false)}>
						Semua mata kuliah
					</NavLink>
				</div>
			)}
		</div>
	);
}
