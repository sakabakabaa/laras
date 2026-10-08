import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
	BookOpen,
	ChevronRight,
	ClipboardList,
	Command,
	FileText,
	GraduationCap,
	Inbox,
	LoaderCircle,
	Search,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { isAbortError } from '@/lib/learning';

type GroupId = 'courses' | 'assignments' | 'students' | 'materials' | 'submissions';

type SearchItem = {
	id: string;
	group: GroupId;
	title: string;
	hint: string;
	href: string;
	haystack: string;
};

const GROUPS: { id: GroupId; label: string }[] = [
	{ id: 'courses', label: 'Mata kuliah' },
	{ id: 'assignments', label: 'Tugas' },
	{ id: 'students', label: 'Mahasiswa' },
	{ id: 'materials', label: 'Materi' },
	{ id: 'submissions', label: 'Pengumpulan' },
];

const GROUP_ICON = {
	courses: BookOpen,
	assignments: ClipboardList,
	students: GraduationCap,
	materials: FileText,
	submissions: Inbox,
} as const;

const WHITE_LOGO =
	'https://horizons-cdn.hostinger.com/a1e3d273-0bc9-4b07-987d-ecfbfd5fb3dc/25bc2abf0a8b64f0e1c1b1f0ee2bdfab.webp';

export const COLORED_LOGO =
	'https://horizons-cdn.hostinger.com/a1e3d273-0bc9-4b07-987d-ecfbfd5fb3dc/fbe2ce6feb6e12cddae90c757fa98db4.webp';

type Cache = { userId: string; items: SearchItem[] };
let indexCache: Cache | null = null;

function quote(id: string) {
	return `"${id.replace(/"/g, '')}"`;
}

async function loadIndex(userId: string, isStudent: boolean): Promise<SearchItem[]> {
	if (indexCache?.userId === userId) return indexCache.items;

	const items: SearchItem[] = [];

	if (isStudent) {
		const [courses, enrollments, assignments, resources, submissions] = await Promise.all([
			pb.collection('courses').getFullList<{ id: string; title: string; code: string }>({
				sort: 'title',
			}),
			pb.collection('enrollments').getFullList<{ course: string }>({
				filter: pb.filter('owner = {:me}', { me: userId }),
			}),
			pb.collection('assignments').getFullList<{
				id: string;
				title: string;
				course: string;
				status: string;
			}>({
				sort: '-created',
			}),
			pb.collection('course_resources').getFullList<{
				id: string;
				title: string;
				course: string;
				kind: string;
			}>({
				sort: '-created',
			}),
			pb.collection('assignment_submissions').getFullList<{
				id: string;
				assignment: string;
				status: string;
				content: string;
			}>({
				filter: pb.filter('owner = {:me}', { me: userId }),
				sort: '-created',
			}),
		]);
		const enrolled = new Set(enrollments.map((row) => row.course));
		const courseName = new Map(courses.map((c) => [c.id, c.title]));
		for (const course of courses.filter((c) => enrolled.has(c.id))) {
			items.push({
				id: `c-${course.id}`,
				group: 'courses',
				title: course.title || 'Mata kuliah',
				hint: course.code || 'Mata kuliah',
				href: `/app/courses/${course.id}`,
				haystack: `${course.title} ${course.code}`,
			});
		}
		for (const task of assignments.filter((a) => enrolled.has(a.course) && a.status === 'published')) {
			items.push({
				id: `a-${task.id}`,
				group: 'assignments',
				title: task.title || 'Tugas',
				hint: courseName.get(task.course) || 'Tugas',
				href: `/app/courses/${task.course}`,
				haystack: `${task.title} ${courseName.get(task.course) || ''}`,
			});
		}
		for (const file of resources.filter((r) => enrolled.has(r.course))) {
			items.push({
				id: `m-${file.id}`,
				group: 'materials',
				title: file.title || 'Materi',
				hint: `${file.kind === 'link' ? 'Tautan' : 'Berkas'} · ${courseName.get(file.course) || 'Mata kuliah'}`,
				href: `/app/courses/${file.course}`,
				haystack: `${file.title} ${courseName.get(file.course) || ''}`,
			});
		}
		const taskName = new Map(assignments.map((a) => [a.id, a.title]));
		for (const sub of submissions) {
			const courseId = assignments.find((a) => a.id === sub.assignment)?.course;
			if (!courseId) continue;
			items.push({
				id: `s-${sub.id}`,
				group: 'submissions',
				title: taskName.get(sub.assignment) || 'Pengumpulan',
				hint: sub.status || 'Pengumpulan saya',
				href: `/app/courses/${courseId}`,
				haystack: `${taskName.get(sub.assignment) || ''} ${sub.content || ''} ${sub.status}`,
			});
		}
	} else {
		const courses = await pb.collection('courses').getFullList<{
			id: string;
			title: string;
			code: string;
		}>({
			filter: pb.filter('owner = {:me}', { me: userId }),
			sort: 'title',
		});
		const courseIds = courses.map((c) => c.id);
		const courseFilter = courseIds.length
			? courseIds.map((id) => `course = ${quote(id)}`).join(' || ')
			: 'id = ""';
		const [assignments, resources, enrollments, submissions, publics] = await Promise.all([
			pb.collection('assignments').getFullList<{
				id: string;
				title: string;
				course: string;
				status: string;
			}>({
				filter: pb.filter('owner = {:me}', { me: userId }),
				sort: '-created',
			}),
			pb.collection('course_resources').getFullList<{
				id: string;
				title: string;
				course: string;
				kind: string;
			}>({
				filter: courseFilter,
				sort: '-created',
			}),
			pb.collection('enrollments').getFullList<{
				id: string;
				course: string;
				expand?: { owner?: { id?: string; name?: string; email?: string } };
			}>({
				filter: courseFilter,
				expand: 'owner',
				sort: '-created',
			}),
			pb.collection('assignment_submissions').getFullList<{
				id: string;
				assignment: string;
				status: string;
				content: string;
				expand?: { owner?: { name?: string; email?: string } };
			}>({
				filter: pb.filter('assignment.owner = {:me}', { me: userId }),
				expand: 'owner',
				sort: '-created',
			}).catch(() =>
				pb.collection('assignment_submissions').getFullList<{
					id: string;
					assignment: string;
					status: string;
					content: string;
					expand?: { owner?: { name?: string; email?: string } };
				}>({
					expand: 'owner',
					sort: '-created',
				}),
			),
			pb
				.collection('public_submissions')
				.getFullList<{
					id: string;
					assignment: string;
					participantName: string;
					nim: string;
					groupName: string;
					status: string;
				}>({
					sort: '-created',
				})
				.catch(() => []),
		]);
		const courseName = new Map(courses.map((c) => [c.id, c.title]));
		const taskName = new Map(assignments.map((a) => [a.id, a]));
		for (const course of courses) {
			items.push({
				id: `c-${course.id}`,
				group: 'courses',
				title: course.title || 'Mata kuliah',
				hint: course.code || 'Mata kuliah',
				href: `/app/courses/${course.id}`,
				haystack: `${course.title} ${course.code}`,
			});
		}
		for (const task of assignments) {
			items.push({
				id: `a-${task.id}`,
				group: 'assignments',
				title: task.title || 'Tugas',
				hint: courseName.get(task.course) || 'Tugas',
				href: `/app/tugas/${task.id}`,
				haystack: `${task.title} ${courseName.get(task.course) || ''} ${task.status}`,
			});
		}
		const seenStudents = new Set<string>();
		for (const row of enrollments) {
			const person = row.expand?.owner;
			const name = person?.name || person?.email || 'Mahasiswa';
			const key = person?.id || row.id;
			if (seenStudents.has(key)) continue;
			seenStudents.add(key);
			items.push({
				id: `u-${key}`,
				group: 'students',
				title: name,
				hint: `${person?.email || 'Terdaftar'} · ${courseName.get(row.course) || 'Mata kuliah'}`,
				href: `/app/courses/${row.course}`,
				haystack: `${name} ${person?.email || ''} ${courseName.get(row.course) || ''}`,
			});
		}
		for (const file of resources) {
			items.push({
				id: `m-${file.id}`,
				group: 'materials',
				title: file.title || 'Materi',
				hint: `${file.kind === 'link' ? 'Tautan' : 'Berkas'} · ${courseName.get(file.course) || 'Mata kuliah'}`,
				href: `/app/courses/${file.course}`,
				haystack: `${file.title} ${courseName.get(file.course) || ''}`,
			});
		}
		const ownedTasks = new Set(assignments.map((a) => a.id));
		for (const sub of submissions.filter((s) => ownedTasks.has(s.assignment))) {
			const who = sub.expand?.owner?.name || sub.expand?.owner?.email || 'Mahasiswa';
			const task = taskName.get(sub.assignment);
			items.push({
				id: `s-${sub.id}`,
				group: 'submissions',
				title: task?.title || 'Pengumpulan',
				hint: `${who} · ${sub.status || 'terkumpul'}`,
				href: task ? `/app/tugas/${task.id}` : '/app/tugas',
				haystack: `${task?.title || ''} ${who} ${sub.content || ''} ${sub.status}`,
			});
		}
		for (const pub of publics.filter((p) => ownedTasks.has(p.assignment))) {
			const task = taskName.get(pub.assignment);
			const who = pub.participantName || pub.groupName || 'Peserta publik';
			items.push({
				id: `p-${pub.id}`,
				group: 'submissions',
				title: task?.title || 'Pengumpulan publik',
				hint: `${who}${pub.nim ? ` · ${pub.nim}` : ''} · publik`,
				href: task ? `/app/tugas/${task.id}` : '/app/tugas',
				haystack: `${task?.title || ''} ${who} ${pub.nim} ${pub.groupName}`,
			});
		}
	}

	indexCache = { userId, items };
	return items;
}

function highlight(text: string, query: string) {
	const q = query.trim();
	if (!q) return text;
	const lower = text.toLowerCase();
	const needle = q.toLowerCase();
	const at = lower.indexOf(needle);
	if (at < 0) return text;
	return (
		<>
			{text.slice(0, at)}
			<mark>{text.slice(at, at + q.length)}</mark>
			{text.slice(at + q.length)}
		</>
	);
}

export function GlobalSearch({ userId, isStudent }: { userId: string; isStudent: boolean }) {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [items, setItems] = useState<SearchItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [active, setActive] = useState(0);
	const [filter, setFilter] = useState<GroupId | 'all'>('all');
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault();
				setOpen((value) => !value);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	useEffect(() => {
		if (!open) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
		return () => {
			document.body.style.overflow = prev;
			window.clearTimeout(timer);
		};
	}, [open]);

	useEffect(() => {
		if (!open || !userId) return;
		let cancelled = false;
		setLoading(items.length === 0);
		setError('');
		loadIndex(userId, isStudent)
			.then((rows) => {
				if (!cancelled) setItems(rows);
			})
			.catch((err) => {
				if (cancelled || isAbortError(err)) return;
				setError('Pencarian gagal dimuat. Coba lagi.');
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [open, userId, isStudent, items.length]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		const tokens = q.split(/\s+/).filter(Boolean);
		const matched = tokens.length
			? items.filter((item) => tokens.every((token) => item.haystack.toLowerCase().includes(token)))
			: items;
		const ranked = [...matched].sort((a, b) => {
			if (!q) return 0;
			const aHit = a.title.toLowerCase().startsWith(q) ? 0 : 1;
			const bHit = b.title.toLowerCase().startsWith(q) ? 0 : 1;
			return aHit - bHit;
		});
		const scoped = filter === 'all' ? ranked : ranked.filter((item) => item.group === filter);
		const capped: SearchItem[] = [];
		for (const group of GROUPS) {
			capped.push(...scoped.filter((item) => item.group === group.id).slice(0, 6));
		}
		return capped;
	}, [items, query, filter]);

	useEffect(() => {
		setActive(0);
	}, [query, open, filter]);

	const choose = (item: SearchItem) => {
		setOpen(false);
		setQuery('');
		navigate(item.href);
	};

	const onDialogKey = (event: React.KeyboardEvent) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			setOpen(false);
			return;
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			setActive((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			setActive((index) => Math.max(index - 1, 0));
		}
		if (event.key === 'Enter' && filtered[active]) {
			event.preventDefault();
			choose(filtered[active]);
		}
	};

	return (
		<>
			<button
				type="button"
				className="ld-mast-icon ld-mast-search-trigger"
				aria-label="Buka pencarian"
				aria-keyshortcuts="Control+K Meta+K"
				aria-expanded={open}
				aria-haspopup="dialog"
				onClick={() => setOpen(true)}
			>
				<Search size={18} strokeWidth={1.75} aria-hidden />
				<span className="ld-mast-search-placeholder">Cari mata kuliah, tugas, atau halaman...</span>
				<kbd className="ld-mast-search-shortcut">Ctrl K</kbd>
			</button>

			{open && (
				<div className="gs-layer" onKeyDown={onDialogKey}>
					<button type="button" className="gs-scrim" aria-label="Tutup pencarian" onClick={() => setOpen(false)} />
					<div className="gs-panel" role="dialog" aria-modal="true" aria-label="Pencarian">
						<div className="gs-input">
							<Search size={18} strokeWidth={1.75} aria-hidden />
							<input
								ref={inputRef}
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Cari"
								aria-label="Kata kunci pencarian"
								autoComplete="off"
							/>
							{loading && <LoaderCircle size={16} className="spin" aria-hidden />}
							<span className="gs-shortcut" aria-hidden>
								<Command size={13} strokeWidth={2} />
								<kbd>K</kbd>
							</span>
						</div>
						<div className="gs-pills" role="tablist" aria-label="Saring hasil">
							<button
								type="button"
								role="tab"
								aria-selected={filter === 'all'}
								className={filter === 'all' ? 'active' : ''}
								onClick={() => setFilter('all')}
							>
								Semua
							</button>
							{GROUPS.filter((group) => isStudent ? group.id !== 'students' : true).map((group) => (
								<button
									key={group.id}
									type="button"
									role="tab"
									aria-selected={filter === group.id}
									className={filter === group.id ? 'active' : ''}
									onClick={() => setFilter(group.id)}
								>
									{group.label}
								</button>
							))}
						</div>
						<div className="gs-results" role="listbox" aria-label="Hasil pencarian">
							{error && <p className="gs-empty">{error}</p>}
							{!error && !loading && filtered.length === 0 && (
								<p className="gs-empty">
									{query.trim()
										? `Tidak ada hasil untuk “${query.trim()}”.`
										: 'Belum ada data yang cocok untuk ditampilkan.'}
								</p>
							)}
							{filtered.length > 0 && (
								<p className="gs-section-label">{query.trim() ? 'Hasil' : 'Paling sering'}</p>
							)}
							{GROUPS.map((group) => {
								const rows = filtered.filter((item) => item.group === group.id);
								if (!rows.length) return null;
								const Icon = GROUP_ICON[group.id];
								return (
									<section key={group.id} className="gs-group">
										{filter === 'all' && <h3>{group.label}</h3>}
										<ul>
											{rows.map((item) => {
												const index = filtered.indexOf(item);
												return (
													<li key={item.id}>
														<button
															type="button"
															role="option"
															aria-selected={index === active}
															className={index === active ? 'active' : ''}
															onMouseEnter={() => setActive(index)}
															onClick={() => choose(item)}
														>
															<span className="gs-row-icon" aria-hidden>
																<Icon size={18} strokeWidth={1.75} />
															</span>
															<span className="gs-row-copy">
																<strong>{highlight(item.title, query)}</strong>
																<small>{highlight(item.hint, query)}</small>
															</span>
															<ChevronRight size={16} strokeWidth={1.75} className="gs-chevron" aria-hidden />
														</button>
													</li>
												);
											})}
										</ul>
									</section>
								);
							})}
						</div>
					</div>
				</div>
			)}
		</>
	);
}

export { WHITE_LOGO };
