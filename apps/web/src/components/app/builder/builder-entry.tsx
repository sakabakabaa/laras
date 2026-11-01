import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
	ArrowLeft,
	ArrowRight,
	BookOpen,
	CalendarDays,
	FileText,
	Plus,
	RefreshCw,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import type { BuilderImportJob } from '@/lib/builder-import';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { scheduledRequest } from '@/lib/scheduled-classes';
import { useCourseSections } from '@/hooks/use-course-sections';
import {
	applyTemplate,
	blankBuilder,
	builderRequest,
	copyBuilder,
	copyScheduledToBuilder,
	uid,
	type BuilderKind,
	type BuilderListItem,
	type BuilderRecord,
} from '@/lib/builder-document';

type Course = { id: string; title: string; code: string };
type Meeting = { id: string; title: string; week: number; section: string };
export function BuilderDraftList({ kind }: { kind: BuilderKind }) {
	const [items, setItems] = useState<BuilderListItem[]>([]),
		[error, setError] = useState(''),
		[loading, setLoading] = useState(true);
	const load = () => {
		setLoading(true);
		void builderRequest<{ items: BuilderListItem[] }>('list', { kind })
			.then((r) => {
				setItems(r.items);
				setError('');
			})
			.catch((e) => setError(e.message))
			.finally(() => setLoading(false));
	};
	useEffect(() => {
		let active = true;
		builderRequest<{ items: BuilderListItem[] }>('list', { kind })
			.then((r) => {
				if (active) {
					setItems(r.items);
					setError('');
				}
			})
			.catch((e) => {
				if (active) setError(e.message);
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [kind]);
	return (
		<section className="bd-draft-list" aria-label="Draf builder">
			<header>
				<div>
					<h2>
						Draf builder {items.length > 0 && <small>({items.length})</small>}
					</h2>
					<p>
						Susun kegiatan dan elemen, lalu lanjutkan dari draf yang tersimpan.
					</p>
				</div>
				<button
					className="bd-icon"
					disabled={loading}
					aria-label="Muat ulang draf builder"
					onClick={load}
				>
					<RefreshCw size={16} />
				</button>
			</header>
			<BuilderImportList kind={kind} />
			{loading ? (
				<p role="status">Memuat draf…</p>
			) : error ? (
				<p role="alert">
					{error} <button onClick={load}>Coba lagi</button>
				</p>
			) : items.length ? (
				<div className="bd-draft-cards">
					{items.map((d) => (
						<Link key={d.id} to={`/app/builder/${d.id}`}>
							<span className="bd-eyebrow">DRAF · {d.courseTitle}</span>
							<strong>{d.title}</strong>
							<span>
								{d.activityCount} kegiatan <ArrowRight size={14} />
							</span>
						</Link>
					))}
				</div>
			) : (
				<p>
					Belum ada draf. Pilih{' '}
					<Link to={`/app/builder/new?kind=${kind}`}>Buat {kind}</Link> untuk
					mulai menyusun.
				</p>
			)}
		</section>
	);
}
export function BuilderNew() {
	const [params] = useSearchParams(),
		navigate = useNavigate();
	const kind: BuilderKind = params.get('kind') === 'tugas' ? 'tugas' : 'kelas';
	const sourceSession = params.get('sourceSession') || '';
	const [course, setCourse] = useState(params.get('course') || ''),
		[meeting, setMeeting] = useState(params.get('meeting') || ''),
		[section, setSection] = useState(''),
		[title, setTitle] = useState(''),
		[template, setTemplate] = useState<
			'blank' | 'listening' | 'writing' | 'reflection' | 'book'
		>(params.get('from') === 'book' ? 'book' : 'blank'),
		[source, setSource] = useState(params.get('source') || ''),
		[pageImage, setPageImage] = useState<File | null>(null),
		[goal, setGoal] = useState(''),
		[busy, setBusy] = useState(false),
		[error, setError] = useState('');
	const command = useRef(uid());
	useEffect(()=>{command.current=uid();},[kind,course,meeting,section,title,goal,template,source]);
	const courses = useCachedQuery<Course[]>('builder-course-options', () =>
		pb
			.collection('courses')
			.getFullList<Course>({
				filter: pb.filter('owner={:u}', { u: pb.authStore.record?.id }),
				sort: 'title',
				fields: 'id,title,code',
			}),
	);
	const meetings = useCachedQuery<Meeting[]>(
		course ? `builder-meetings:${course}` : null,
		() =>
			pb
				.collection('class_sessions')
				.getFullList<Meeting>({
					filter: pb.filter('course={:c}', { c: course }),
					sort: 'week',
					fields: 'id,title,week,section',
				}),
	);
	const { sections, error: sectionError } = useCourseSections(course);
	const drafts = useCachedQuery<{ items: BuilderListItem[] }>(
		'builder-all-drafts',
		() => builderRequest('list'),
	);
	const selectedMeeting = meetings.data?.find((m) => m.id === meeting);
	const create = async () => {
		setBusy(true);
		setError('');
		try {
			const context = {
				courseId: course,
				meetingId: meeting,
				sectionIds: selectedMeeting?.section
					? [selectedMeeting.section]
					: section
						? [section]
						: [],
			};
			if (template === 'book' && !source && !sourceSession) {
                if (!pageImage) throw new Error('Pilih satu gambar halaman buku.');
                const form = new FormData();
                form.append('page', pageImage);
                form.append('settings', JSON.stringify({kind, context, title, goal}));
                form.append('commandId', command.current);
                const job = await pb.send<BuilderImportJob>('/api/builder-import', {method:'POST', body:form, requestKey:null});
                navigate(`/app/builder/impor/${job.id}`);
                return;
            }
			let envelope = blankBuilder(kind, course, meeting, context.sectionIds);
			if (sourceSession) {
				const sourceState = await scheduledRequest(sourceSession, 'state');
				if (!sourceState.owner)
					throw new Error('Sesi ini tidak tersedia untuk disalin.');
				envelope = copyScheduledToBuilder(
					sourceState,
					context,
					window.location.origin,
				);
			} else if (source) {
				const saved = await builderRequest<BuilderRecord>('get', {
					id: source,
				});
				envelope = copyBuilder(saved, kind, context);
			} else applyTemplate(envelope, template === 'book' ? 'blank' : template);
			if (title.trim()) envelope.document.title = title.trim();
			const record = await builderRequest<BuilderRecord>('create', {
				...envelope,
				commandId: command.current,
			});
			navigate(`/app/builder/${record.id}`);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};
	return (
		<div className="bd-new">
			<Link
				className="bd-back"
				to={kind === 'kelas' ? '/app/kelas-terjadwal' : '/app/tugas'}
			>
				<ArrowLeft size={16} />
				Kembali ke {kind === 'kelas' ? 'kelas terjadwal' : 'tugas'}
			</Link>
			<div className="bd-new-heading">
				<span className="bd-kicker">RUANG MENYUSUN</span>
				<h1>Buat {kind === 'kelas' ? 'kelas' : 'tugas'}</h1>
				<p>
					Mulai dari kegiatan yang ingin Anda ajarkan. Jadwal dan penilaian
					dapat dilengkapi sambil menyusun.
				</p>
			</div>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					void create();
				}}
			>
				<fieldset disabled={busy}>
					<label>
						Judul
						<input
							autoFocus
							maxLength={200}
							placeholder={
								kind === 'kelas'
									? 'Contoh: Fit und gesund — Beim Arzt'
									: 'Contoh: Menulis E-Mail'
							}
							value={title}
							onChange={(e) => setTitle(e.target.value)}
						/>
					</label>
					<div className="bd-form-grid">
						<label>
							Mata kuliah
							<select
								required
								value={course}
								onChange={(e) => {
									setCourse(e.target.value);
									setMeeting('');
									setSection('');
								}}
							>
								<option value="">Pilih mata kuliah</option>
								{courses.data?.map((c) => (
									<option key={c.id} value={c.id}>
										{c.code} · {c.title}
									</option>
								))}
							</select>
						</label>
						<label>
							Pertemuan {kind === 'tugas' ? '(opsional)' : ''}
							<select
								required={kind === 'kelas'}
								disabled={!course || meetings.loading}
								value={meeting}
								onChange={(e) => setMeeting(e.target.value)}
							>
								<option value="">Pilih pertemuan</option>
								{meetings.data?.map((m) => (
									<option key={m.id} value={m.id}>
										Pertemuan {m.week} · {m.title}
									</option>
								))}
							</select>
						</label>
						<label>
							Rombel
							<select
								disabled={!course || Boolean(selectedMeeting?.section)}
								value={selectedMeeting?.section || section}
								onChange={(e) => setSection(e.target.value)}
							>
								<option value="">Semua rombel</option>
								{sections.map((s) => (
									<option key={s.id} value={s.id}>
										{s.name}
									</option>
								))}
							</select>
						</label>
					</div>
					{(courses.error || meetings.error || sectionError) && (
						<p className="bd-error" role="alert">
							{courses.error || meetings.error || sectionError}
						</p>
					)}
					<h2>
						{sourceSession ? 'Salin sesi ke draf baru' : 'Mulai menyusun'}
					</h2>
					{sourceSession ? (
						<p>
							Isi kegiatan disalin ke draf baru. Jadwal, mahasiswa, kiriman, dan
							nilai tetap terpisah dari sesi asal.
						</p>
					) : (
						<>
							<div className="bd-template-options">
								{(
									[
										{ id: 'book', title: 'Dari halaman buku', description: 'Unggah foto → AI menyusun kegiatan', icon: BookOpen },
										{
											id: 'blank',
											title: 'Kosong',
											description: 'Susun dari awal',
											icon: Plus,
										},
										{
											id: 'listening',
											title: 'Mendengarkan',
											description: 'Audio & mencocokkan',
											icon: BookOpen,
										},
										{
											id: 'writing',
											title: 'Menulis',
											description: 'Instruksi & jawaban panjang',
											icon: FileText,
										},
										{
											id: 'reflection',
											title: 'Refleksi',
											description: 'Pertanyaan refleksi',
											icon: CalendarDays,
										},
									] as const
								).map((t) => (
									<button
										type="button"
										key={t.id}
										className={
											template === t.id && !source ? 'is-selected' : ''
										}
										aria-pressed={template === t.id && !source}
										onClick={() => {
											setTemplate(t.id);
											setSource('');
										}}
									>
										<t.icon size={21} />
										<strong>{t.title}</strong>
										<small>{t.description}</small>
									</button>
								))}
							</div>
                            {template === 'book' && !source && <section className="bd-book-upload">
                                <label>Gambar halaman buku<input type="file" accept="image/png,image/jpeg,image/webp" required={!source} onChange={e=>{setPageImage(e.target.files?.[0]||null);command.current=uid();}} /></label>
                                <p className="bd-help">Satu halaman PNG, JPG, atau WebP, maksimal 8 MB. Foto seluruh latihan dengan teks yang jelas. AI akan menyusun elemen, ilustrasi, dan penilaian sebagai draf pribadi.</p>
                                <label>Arahan tambahan (opsional)<textarea value={goal} maxLength={2000} placeholder="Contoh: Pertahankan bahasa Jerman, gunakan tingkat A1." onChange={e=>setGoal(e.target.value)}/></label>
                                <p className="bd-help">Rekaman audio tidak bisa diambil dari foto. Latihan yang memerlukannya akan ditandai untuk dilengkapi.</p>
                            </section>}
							<label>
								Atau duplikat draf yang sudah ada
								<select
									value={source}
									onChange={(e) => setSource(e.target.value)}
								>
									<option value="">Pilih draf untuk disalin</option>
									{drafts.data?.items.map((d) => (
										<option key={d.id} value={d.id}>
											{d.title} · {d.courseTitle}
										</option>
									))}
								</select>
							</label>
						</>
					)}
					<p className="bd-help">
						Salinan membuat identitas kegiatan dan soal baru. Pilih jadwal baru
						setelah membuka builder.
					</p>
					{error && (
						<p className="bd-error" role="alert">
							{error}
						</p>
					)}
					<footer>
						<span>Draf tersimpan pribadi untuk dosen.</span>
						<button
							type="submit"
							className="bd-primary"
							disabled={
								!course ||
								(kind === 'kelas' && !meeting) ||
								Boolean(courses.error) ||
								meetings.loading ||
								busy
							}
						>
							{busy ? 'Menyiapkan draf…' : template === 'book' && !source ? 'Bangun dari halaman buku' : 'Mulai menyusun'}
							<ArrowRight size={16} />
						</button>
					</footer>
				</fieldset>
			</form>
		</div>
	);
}

function BuilderImportList({kind}:{kind:BuilderKind}) {
 const [jobs,setJobs]=useState<BuilderImportJob[]>([]);
 useEffect(()=>{let live=true,timer:ReturnType<typeof setTimeout>;const load=async()=>{try{const result=await pb.send<{items:BuilderImportJob[]}>('/api/builder-import',{method:'POST',body:{action:'list'},requestKey:null});if(!live)return;setJobs(result.items.filter(job=>job.settings.kind===kind));if(result.items.some(job=>job.status==='queued'||job.status==='running'))timer=setTimeout(()=>void load(),5000);}catch{/* Normal draft list remains available. */}};void load();return()=>{live=false;clearTimeout(timer);};},[kind]);
 if(!jobs.length)return null;
 return <details className="bd-import-report"><summary>Impor halaman buku ({jobs.length})</summary><ul>{jobs.map(job=><li key={job.id}><Link to={`/app/builder/impor/${job.id}`}>{job.settings.title||'Halaman buku'} · {job.status==='ready'?'Draf siap':job.status==='failed'?'Perlu dicoba lagi':'Sedang disusun'}</Link></li>)}</ul></details>;
}
