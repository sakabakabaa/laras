import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Check, ChevronDown, GraduationCap, LoaderCircle } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { useAuth } from '@/hooks/use-auth';
import type { Course } from '@/lib/learning';
import { LecturerGradebook } from '@/components/app/lecturer-gradebook';

/**
 * Global Penilaian: every course the lecturer owns, with the full enrolled
 * student gradebook for the selected course.
 */
export function PenilaianIndex() {
	const { user } = useAuth();
	const [courses, setCourses] = useState<Course[] | null>(null);
	const [error, setError] = useState('');
	const [params, setParams] = useSearchParams();

	useEffect(() => {
		if (!user?.id) return;
		let alive = true;
		void (async () => {
			try {
				const rows = await pb.collection('courses').getFullList<Course>({
					filter: pb.filter('owner = {:id}', { id: user.id }),
					sort: 'title',
				});
				if (alive) setCourses(rows);
			} catch {
				if (alive) setError('Daftar mata kuliah gagal dimuat. Coba muat ulang halaman.');
			}
		})();
		return () => {
			alive = false;
		};
	}, [user?.id]);

	const selectedId = params.get('course') || '';
	const selected = useMemo(() => {
		if (!courses?.length) return null;
		return courses.find((c) => c.id === selectedId) || null;
	}, [courses, selectedId]);

	const pick = (id: string) => {
		const next = new URLSearchParams(params);
		if (next.get('course') === id) return;
		next.set('course', id);
		setParams(next, { replace: true });
	};

	// Write the resolved course into the URL once so a later render cannot
	// fall back to the first tile and look like the choice reverted.
	useEffect(() => {
		if (!courses?.length) return;
		if (courses.some((c) => c.id === selectedId)) return;
		pick(courses[0].id);
		// pick is stable enough for this one-shot correction
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [courses, selectedId]);

	if (courses === null && !error) {
		return (
			<div className="ld-loading">
				<LoaderCircle size={22} className="spin" /> Memuat penilaian...
			</div>
		);
	}

	if (error) {
		return (
			<div className="ld-alert" role="alert">
				{error}
			</div>
		);
	}

	if (!courses?.length) {
		return (
			<section className="gb-hub-empty">
				<GraduationCap size={22} />
				<strong>Belum ada mata kuliah</strong>
				<p>Buat mata kuliah dan daftarkan mahasiswa untuk mulai menilai.</p>
				<Link to="/app/courses" className="ld-btn-primary">
					Ke mata kuliah
				</Link>
			</section>
		);
	}

	return (
		<div className="gb-hub">
			<CourseDropdown courses={courses} selected={selected} onPick={pick} />
			{selected && <LecturerGradebook key={selected.id} course={selected} />}
		</div>
	);
}

function CourseDropdown({
	courses,
	selected,
	onPick,
}: {
	courses: Course[];
	selected: Course | null;
	onPick: (id: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDown = (event: PointerEvent) => {
			if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false);
		};
		document.addEventListener('pointerdown', onDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	return (
		<div className="gb-course-drop">
			<span className="gb-course-drop-label">Mata kuliah</span>
			<div className="gb-course-drop-field" ref={rootRef}>
			<button
				type="button"
				className={`gb-course-drop-btn${open ? ' open' : ''}`}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label="Pilih mata kuliah"
				onClick={() => setOpen((v) => !v)}
			>
				<span>
					<strong>{selected ? selected.code || selected.title : 'Pilih mata kuliah'}</strong>
					{selected?.code ? <small>{selected.title}</small> : null}
				</span>
				<ChevronDown size={16} />
			</button>
			{open && (
				<ul className="gb-course-drop-menu" role="listbox" aria-label="Mata kuliah">
					{courses.map((course) => {
						const active = selected?.id === course.id;
						return (
							<li key={course.id}>
								<button
									type="button"
									role="option"
									aria-selected={active}
									className={active ? 'active' : ''}
									onClick={() => {
										onPick(course.id);
										setOpen(false);
									}}
								>
									<span>
										<strong>{course.code || course.title}</strong>
										{course.code ? <small>{course.title}</small> : null}
									</span>
									{active ? <Check size={15} /> : null}
								</button>
							</li>
						);
					})}
				</ul>
			)}
			</div>
		</div>
	);
}
