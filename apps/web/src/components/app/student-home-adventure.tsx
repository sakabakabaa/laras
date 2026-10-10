import { useStudentHomeText } from '@/lib/student-home-copy';
import { Link } from 'react-router';
import { ArrowRight, BookOpen, Check, Flag, Gamepad2, LoaderCircle, Sparkles, Trophy } from 'lucide-react';
import { PracticeMascot } from './practice-mascot';
import { AgentTaskPanel } from './agent-task-panel';
import { useCachedQuery } from '@/hooks/use-cached-query';
import pb from '@/lib/pocketbase-client';
import type { Course } from '@/lib/learning';
import type { PracticeReadiness } from '@/lib/personal-practice';
import { courseRouteId } from '@/lib/course-route';

type CoursePractice = { course: Course; ready: PracticeReadiness | null };
const skillLabels = { focus: 'Coba lagi', building: 'Mulai terbentuk', steady: 'Semakin lancar', improving: 'Makin baik' };

export function WorldScene({ variant = 0 }: { variant?: number }) {
 return <svg className={`sd-world-scene sd-world-${variant % 4}`} viewBox="0 0 360 170" aria-hidden="true">
  <rect width="360" height="170" rx="20" fill="var(--world-sky)" />
  <circle cx="285" cy="42" r="22" fill="var(--world-sun)" />
  <path d="M25 42h43m-24 14h49m112-24h29" stroke="white" strokeWidth="8" strokeLinecap="round" opacity=".65" />
  <path d="M0 130Q70 60 146 116T360 90V170H0Z" fill="var(--world-hill)" />
  <path d="M0 147Q115 112 199 146T360 132V170H0Z" fill="var(--world-front)" />
  <path d="M180 170q-56-32-2-48t-12-34" fill="none" stroke="var(--world-path)" strokeWidth="17" />
  <path d="M162 89V49m0 0h29l-9 10 9 10h-29" fill="var(--world-flag)" stroke="var(--world-flag)" strokeWidth="3" strokeLinejoin="round" />
  <path d="M62 130v-25m-13 3 13-28 13 28Z" fill="var(--world-flag)" stroke="var(--world-flag)" strokeWidth="3" opacity=".7" />
  <path d="m249 118 5-9 5 9-5 9Z" fill="var(--world-sun)" />
 </svg>;
}

export function StudentHomeAdventure({ courses, preview = false }: { courses: Course[]; preview?: boolean }) {
 const label = useStudentHomeText();
 const user = pb.authStore.record;
 const practice = useCachedQuery<CoursePractice[]>(!preview && courses.length ? `student-home:practice:${user?.id}:${courses.map(c => c.id).join(',')}` : null, async () => {
  const results = await Promise.allSettled(courses.map(async course => {
   const response = await fetch('/api/personal-practice', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pb.authStore.token}` }, body: JSON.stringify({ action: 'readiness', courseId: course.id }) });
   if (!response.ok) throw new Error('Progres latihan belum tersedia');
   return { course, ready: await response.json() as PracticeReadiness };
  }));
  return results.map((result, i) => result.status === 'fulfilled' ? result.value : { course: courses[i], ready: null });
 });
 const entries = practice.data ?? courses.map(course => ({ course, ready: null }));
 const active = entries.find(item => item.ready?.activeRoundId);
 const available = entries.find(item => item.ready?.enabled && item.ready.sources.length);
 const recommended = active ?? available;
 const totalXp = Math.max(0, ...entries.map(item => item.ready?.totalXp ?? 0));
 const history = entries.flatMap(item => (item.ready?.history ?? []).map(round => ({ ...round, course: item.course }))).sort((a,b) => (b.completedAt || b.created).localeCompare(a.completedAt || a.created));
 const hasProgress = Boolean(practice.data?.some(item => item.ready));
 const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
 const todayDone = history.some(round => new Date(round.completedAt || round.created).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) === today);
 const skills = entries.flatMap(item => (item.ready?.progress?.skills ?? []).map(skill => ({ ...skill, course: item.course }))).filter(skill => skill.total > 0).sort((a,b) => Number(b.status === 'focus') - Number(a.status === 'focus')).slice(0, 3);
 const focus = recommended?.ready?.progress?.skills.find(skill => skill.status === 'focus');
 const href = recommended ? `/app/latihan?course=${recommended.course.id}` : '/app/latihan';
 const name = preview ? label("petualang") : (String(user?.name || '').trim().split(/\s+/)[0] || label("petualang"));
 const unavailable = !preview && practice.data && entries.some(item => !item.ready);
 return <div className="sd-game">
  {preview && <div className="sd-preview-note">{label('Pratinjau mahasiswa · Mata kuliah milik Anda. Progres pribadi muncul saat mahasiswa masuk.')} <Link to="/app">{label("Kembali ke dashboard")}</Link></div>}
  <header className="sd-game-greeting"><div><span className="sd-game-eyebrow">{label("RUANG BELAJARMU")}</span><h1>{label('Halo,')} {name}!</h1><p>{label("Petualangan kecil. Kemajuan setiap hari.")}</p></div><a className="sd-game-profile-link" href="#progres-belajar"><Sparkles size={16} /> {practice.loading ? label("Memuat progres…") : preview ? label("Progres belajar") : !hasProgress && courses.length ? label("Progres belajar") : `${totalXp} XP`} <ArrowRight size={14} /></a></header>
  <section className="sd-game-hero">
   <div className="sd-game-hero-copy"><span className="sd-game-eyebrow"><Gamepad2 size={15} />{label("SATU PUTARAN, SEKITAR 5 MENIT")}</span><h2>{active ? label("Petualanganmu belum selesai.") : todayDone ? label("Satu langkah lagi?") : label("Siap bermain sambil belajar?")}</h2><p>{active ? label('Lanjutkan tantangan di {course}. Jawaban sebelumnya sudah tersimpan.', {course:active.course.title}) : focus ? label('Mari berlatih {skill}. Bagian ini masih perlu diulang berdasarkan jawaban latihanmu.', {skill:label(focus.label).toLowerCase()}) : label("Pilih dunia kelasmu, coba tantangannya, dan temukan hal baru.")}</p><Link className="sd-game-play" to={href}><PlayIcon /> {active ? label("Lanjutkan latihan") : recommended ? label("Mulai latihan") : label("Pilih petualangan")} <ArrowRight size={18} /></Link><span className="sd-game-hero-foot"><Check size={14} />{label("Boleh salah. Ada penjelasan untuk setiap jawaban.")}</span></div>
   <div className="sd-game-hero-art"><span className="sd-game-spark sd-game-spark-a">✦</span><span className="sd-game-spark sd-game-spark-b">✧</span><span className="sd-game-mascot-bubble">{todayDone ? label("Selesai satu putaran!") : label("Ayo, kita coba!")}</span><div className="sd-game-mascot"><PracticeMascot followCursor mood={todayDone ? 'happy' : 'ready'} size={190} /></div><div className="sd-game-art-ground" /><span className="sd-game-art-book"><BookOpen size={30} /></span><span className="sd-game-art-flag"><Flag size={24} /></span></div>
  </section>
  <AgentTaskPanel courses={courses} student preview={preview} />
  <div className="sd-game-small-row"><section className="sd-game-goal"><span className={`sd-game-goal-ring${todayDone ? ' done' : ''}`}>{todayDone ? <Check size={22} /> : <Flag size={22} />}</span><div><h2>{todayDone ? label("Target hari ini tercapai") : label("Target kecil hari ini")}</h2><p>{todayDone ? label("Satu putaran selesai. Sampai jumpa di tantangan berikutnya.") : label("Selesaikan satu putaran latihan. Mulai saat kamu siap.")}</p></div><span className="sd-game-goal-count">{practice.loading || (!preview && !hasProgress && courses.length) ? '—' : todayDone ? '1/1' : '0/1'}</span></section><a href="#progres-belajar" className="sd-game-level"><Trophy size={24} /><div><strong>{preview || (!hasProgress && courses.length) ? label("Perjalananmu") : `Level ${Math.floor(totalXp / 100) + 1}`} </strong><span>{preview || (!hasProgress && courses.length) ? label("Kemajuan dari latihan yang tersimpan") : `${totalXp % 100}/100 ${label('XP menuju level berikutnya')}`}</span><div className="sd-game-level-track"><span style={{width:`${totalXp % 100}%`}} /></div></div></a></div>
  {unavailable && <p className="sd-game-data-note" role="status">{label('Sebagian progres belum bisa dimuat.')} <button onClick={practice.reload}>{label("Coba lagi")}</button></p>}
  <section className="sd-game-worlds"><div className="sd-game-section-heading"><div><span className="sd-game-eyebrow">{label("PILIH TEMPAT BERMAIN")}</span><h2>{label("Dunia kelasmu")}</h2></div><Link to="/app/latihan">{label('Semua latihan')} <ArrowRight size={15} /></Link></div>{courses.length ? <div className="sd-game-world-grid">{entries.map(({course,ready},i) => <article className="sd-game-world" key={course.id}><Link to={`/app/latihan?course=${course.id}`} aria-label={`Latihan ${course.title}`}><WorldScene variant={i} /><div className="sd-game-world-copy"><span className="sd-game-world-number">{label('DUNIA')} {String(i+1).padStart(2,'0')} · {course.code}</span><h3>{course.title}</h3><p>{ready?.activeRoundId ? label("Tantanganmu menunggu untuk dilanjutkan.") : ready && (!ready.enabled || !ready.sources.length) ? label("Latihan belum tersedia untuk kelas ini.") : label("Tantangan pendek dari materi kelas.")}</p><span className="sd-game-world-cta">{ready?.activeRoundId ? label("Lanjutkan") : label("Jelajahi")} <ArrowRight size={16} /></span></div></Link><Link className="sd-game-class-link" to={`/app/courses/${courseRouteId(course)}`}><BookOpen size={14} /> {label('Materi & tugas kelas')} <ArrowRight size={14} /></Link></article>)}</div> : <div className="sd-game-empty"><PracticeMascot size={80} /><h3>{label("Duniamu sedang menunggu.")}</h3><p>{label("Setelah terdaftar di kelas, petualanganmu akan muncul di sini.")}</p><a href="#jelajahi">{label('Lihat mata kuliah')} <ArrowRight size={15} /></a></div>}</section>
  {history.length > 0 && <div className="sd-game-badges" aria-label="Pencapaian latihan"><span><Trophy size={17} /> {label('Langkah pertama')} <small>{label("Satu putaran selesai")}</small></span>{history.length >= 5 && <span><Sparkles size={17} /> {label('Terus mencoba')} <small>{label("Lima putaran selesai")}</small></span>}</div>}
  <section className="sd-game-progress" id="progres-belajar"><div className="sd-game-section-heading"><div><span className="sd-game-eyebrow">{label("LANGKAH YANG SUDAH KAMU AMBIL")}</span><h2>{label("Perjalananmu sejauh ini")}</h2></div><span className="sd-game-progress-note">{label("Dari hasil latihanmu")}</span></div>{practice.loading ? <p className="sd-game-data-note"><LoaderCircle className="spin" size={16} /> {label('Memuat perjalananmu…')}</p> : <div className="sd-game-progress-grid"><div className="sd-game-skill-panel"><h3><Sparkles size={18} /> {label('Yang sedang kamu pelajari')}</h3>{skills.length ? skills.map(skill => <Link key={`${skill.course.id}:${skill.id}`} to={`/app/latihan?course=${skill.course.id}`} className="sd-game-skill"><span><strong>{label(skill.label)}</strong><small>{skill.course.title} · {skill.total} {label('jawaban latihan')}</small></span><em className={`sd-game-skill-${skill.status}`}>{label(skillLabels[skill.status])}</em></Link>) : <div className="sd-game-progress-empty"><BookOpen size={28} /><p>{label("Mulai satu latihan. Kita akan melihat bagian yang lancar dan yang perlu dicoba lagi.")}</p></div>}</div><div className="sd-game-recent-panel"><h3><Trophy size={18} /> {label('Langkah terbaru')}</h3>{history.length ? history.slice(0,3).map(round => <Link key={round.id} to={`/app/latihan?course=${round.course.id}`} className="sd-game-recent"><span className="sd-game-recent-icon"><Check size={18} /></span><span><strong>{label("Putaran selesai")}</strong><small>{round.course.title} · {round.correct}/{round.total} {label('benar')}</small></span><time>{new Date(round.completedAt || round.created).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' })}</time></Link>) : <div className="sd-game-progress-empty"><Flag size={28} /><p>{label("Belum ada putaran selesai. Setiap percobaan adalah langkah pertama.")}</p></div>}</div></div>}</section>
 </div>;
}
function PlayIcon() { return <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="m5 3 10 6-10 6Z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" /></svg>; }
