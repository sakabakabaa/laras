import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Check, CheckCircle2, ChevronLeft, ExternalLink, FileText, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { useSearchParams } from 'react-router';
import { AgentTaskPanel } from './agent-task-panel';
import { PracticeMascot } from '@/components/app/practice-mascot';
import type { PracticeLesson, PracticeReadiness, PracticeRound, PracticeSource } from '@/lib/personal-practice';
import type { StudentProgress } from '@/lib/student-progress';
import type { FileLibraryRecord } from '@/lib/learning';

const verdictLabel = { correct: 'Benar', partially_correct: 'Sebagian benar', needs_work: 'Belum tepat', uncertain: 'Belum bisa dinilai' };
const verdictXp = { correct: 20, partially_correct: 10, needs_work: 5, uncertain: 0 };
type GameStep = 'ready' | 'loading' | 'prepared' | 'playing';
export function PersonalPractice({ courseId, gameMode = false }: { courseId: string; gameMode?: boolean }) {
    const [params] = useSearchParams();
    const coachId = params.get('coach') || '';
    const [ready, setReady] = useState<PracticeReadiness | null>(null);
    const [round, setRound] = useState<PracticeRound | null>(null);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [answer, setAnswer] = useState('');
    const [feedback, setFeedback] = useState(false);
    const [report, setReport] = useState('');
    const [reported, setReported] = useState(false);
    const [lesson, setLesson] = useState<PracticeLesson | null>(null);
    const [lessonAnswer, setLessonAnswer] = useState('');
    const [lessonCheck, setLessonCheck] = useState<{ verdict: keyof typeof verdictLabel; feedback: string } | null>(null);
    const [gameStep, setGameStep] = useState<GameStep>('ready');
    const xp = round?.results.reduce((sum, result) => sum + verdictXp[result.verdict], 0) ?? 0;
    const totalXp = ready?.totalXp ?? 0;
    const level = Math.floor(totalXp / 100) + 1;
    const levelProgress = totalXp % 100;
    const storageKey = `laras-practice:${pb.authStore.record?.id}:${courseId}`;
    const request = useCallback(async <T,>(action: string, body: Record<string, unknown> = {}): Promise<T> => {
        const response = await fetch('/api/personal-practice', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pb.authStore.token}` }, body: JSON.stringify({ action, courseId, ...body }) });
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Permintaan belum berhasil. Coba lagi.');
        return result as T;
    }, [courseId]);
    const loadReady = useCallback(async () => {
        const result = await request<PracticeReadiness>('readiness');
        setReady(result);
        return result;
    }, [request]);
    useEffect(() => {
        let alive = true;
        setReady(null); setRound(null); setError('');
        (async () => {
            try {
                const result = await request<PracticeReadiness>('readiness');
                if (!alive) return;
                setReady(result);
                const id = result.activeRoundId || localStorage.getItem(storageKey);
                if (id) {
                    try { const restored = await request<PracticeRound>('round', { roundId: id });
                        if (alive && restored.status === 'active') { setRound(restored); setFeedback(Boolean(restored.last)); }
                        else if (alive) localStorage.removeItem(storageKey);
                    } catch { localStorage.removeItem(storageKey); }
                }
            } catch (e) { if (alive) setError((e as Error).message); }
        })();
        return () => { alive = false; };
    }, [request, storageKey]);
    useEffect(() => {
        const refresh = () => { if (document.visibilityState === 'visible') void loadReady().catch(() => {}); };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
    }, [loadReady]);
    const run = async (label: string, job: () => Promise<void>): Promise<boolean> => {
        if (busy) return false;
        setBusy(label); setError('');
        try { await job(); return true; } catch (e) { setError((e as Error).message); return false; } finally { setBusy(''); }
    };
    const start = () => void (async () => {
        if (gameMode) setGameStep('loading');
        const started = await run('Menyiapkan latihan dari materi Anda…', async () => {
            const result = await request<PracticeRound>('start');
            setRound(result); setAnswer(''); setFeedback(Boolean(result.last));
            localStorage.setItem(storageKey, result.id);
        });
        if (gameMode) setGameStep(started ? 'prepared' : 'ready');
    })();
    const beginGame = () => { setGameStep('playing'); setFeedback(Boolean(round?.last)); };
    const submit = () => void run('Memeriksa jawaban…', async () => {
        if (!round?.question) return;
        const result = await request<PracticeRound>('answer', { roundId: round.id, ordinal: round.question.ordinal, answer });
        setRound(result); setFeedback(true); setAnswer(''); setReported(false); setReport(''); setLesson(null); setLessonAnswer(''); setLessonCheck(null);
        await loadReady();
    });
    if (!ready) return <section className="pp-page">{error ? <div role="alert" className="pp-error">{error}<button onClick={() => void run('Memuat…', async () => { await loadReady(); })}>Coba lagi</button></div> : <div className="pp-loading"><LoaderCircle className="spin" /> Membuka latihan personal…</div>}</section>;
    if (gameMode && gameStep === 'loading') return <section className="pp-page pp-game-mode"><div className="pp-game-stage pp-game-enter" role="status" aria-live="polite" aria-busy="true"><PracticeMascot mood="thinking" size={104} /><span className="pp-eyebrow">MENYIAPKAN PUTARAN</span><h2>Menyiapkan lima soal</h2><p>Mengambil materi dan memeriksa soal.</p><div className="pp-real-progress" role="progressbar" aria-label="Latihan sedang disiapkan"><span /></div><small>Siap otomatis saat soal selesai disusun.</small></div></section>;
    if (gameMode && gameStep === 'prepared') return <section className="pp-page pp-game-mode"><div className="pp-game-stage pp-game-prepared pp-game-enter"><PracticeMascot mood="happy" size={108} /><span className="pp-eyebrow">PUTARAN SIAP</span><h2>Siap mulai?</h2><p>Lima soal sudah disiapkan dari materi kelasmu.</p><div className="pp-game-stage-facts"><span>5 soal</span><span>± 5 menit</span><span>LEVEL {level}</span></div><div className="pp-level-progress"><span style={{ width: `${levelProgress}%` }} /></div><small>{levelProgress}/100 XP menuju level {level + 1}</small><button className="ld-btn-primary" onClick={beginGame}>Mulai sekarang <ArrowRight size={16} /></button></div></section>;
    return <section className={`pp-page${gameMode ? ' pp-game-mode' : ''}`}>
        {coachId && <AgentTaskPanel student coachId={coachId} compact activeRoundId={round?.id || ''} onRoundReady={id => void run('Membuka putaran…', async () => {
            const next = await request<PracticeRound>('round', { roundId: id });
            setRound(next); setAnswer(''); setFeedback(Boolean(next.last)); setLesson(null); setGameStep('prepared'); localStorage.setItem(storageKey, id);
        })} />}
        {!gameMode && <header className="pp-heading"><div><span className="pp-eyebrow">LATIHAN PERSONAL</span><h2>Sedikit latihan, makin percaya diri.</h2><p>Bahasa berkembang lewat kebiasaan. Lima pertanyaan dari pertemuan terbaru, sesuai kebutuhan Anda.</p></div><span className="pp-badge">Tanpa nilai resmi</span></header>}
        {error && <div className="pp-error" role="alert">{error}</div>}
        {ready.canEdit && !round && <div className="pp-panel"><h3>Latihan mandiri mahasiswa</h3><p className="pp-muted">Latihan tersedia otomatis. Setiap mahasiswa mendapat soal dari tiga pertemuan terakhir di kelasnya, materi yang dapat ia baca, serta umpan balik dan riwayat latihannya sendiri. Pratinjau ini memakai lingkup mata kuliah, tanpa data pribadi mahasiswa.</p>{ready.reports.length > 0 && <details><summary>Soal yang dilaporkan ({ready.reports.length})</summary>{ready.reports.map((r,i) => <div className="pp-example" key={i}><strong>{r.prompt}</strong><p>{r.reason}</p></div>)}</details>}</div>}
        {busy && <div className="pp-loading" role="status"><LoaderCircle className="spin" size={18} /> {busy}</div>}
        {!round || (gameMode && gameStep !== 'playing') ? <>
            {!gameMode && ready.progress && <LearningProfile progress={ready.progress} />}
            {gameMode ? <div className="pp-game-stage pp-game-ready pp-game-enter"><PracticeMascot mood="ready" size={108} /><span className="pp-eyebrow">{ready.canEdit ? 'DEMO LATIHAN' : 'TANTANGAN BARU'}</span><h2>{ready.canEdit ? 'Coba latihan ini?' : round ? 'Lanjutkan putaran?' : 'Siap untuk latihan?'}</h2><p>5 soal pilihan ganda dan menulis singkat, sekitar 5 menit.</p><div className="pp-game-stage-facts"><span>LEVEL {level}</span><span><Sparkles size={13} /> {totalXp} XP terkumpul</span></div><div className="pp-level-progress"><span style={{ width: `${levelProgress}%` }} /></div><small>{levelProgress}/100 XP menuju level {level + 1}</small><button className="ld-btn-primary" onClick={start} disabled={Boolean(busy) || Boolean(ready.reason)}>{ready.canEdit ? 'Siapkan demo' : round ? 'Lanjutkan' : 'Mulai'}<ArrowRight size={16} /></button></div> : <div className="pp-start pp-panel"><div className="pp-start-icon"><Sparkles size={25} /></div><div><h3>{ready.canEdit ? 'Coba pengalaman mahasiswa' : 'Latihan hari ini'}</h3><p>5 pertanyaan · sekitar 5 menit · pilihan ganda & menulis singkat</p><p className="pp-muted">{ready.personalization}</p></div>
                <button className="ld-btn-primary" onClick={start} disabled={Boolean(busy) || Boolean(ready.reason)}>{ready.canEdit ? 'Pratinjau latihan' : 'Mulai latihan'}<ArrowRight size={16} /></button>
            </div>}
            {ready.reason && <p className="pp-notice">{ready.reason}</p>}
            {!gameMode && <><div className="pp-section-heading"><h3>Dari pertemuan terbaru</h3><span className="pp-muted">{ready.scopeNote}</span></div>
            <div className="pp-session-grid">{ready.sessions.map(s => <article className="pp-panel" key={s.id}><span className="pp-eyebrow">MINGGU {s.week}</span><h4>{s.title}</h4><small>{new Date(s.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })}</small></article>)}</div>
            {ready.history.length > 0 && <div className="pp-panel"><h3>Riwayat latihan{ready.canEdit ? ' pratinjau' : ''}</h3>{ready.history.map(h => <button className="pp-history" key={h.id} disabled={Boolean(busy)} onClick={() => void run('Membuka riwayat…', async () => { const r = await request<PracticeRound>('round', { roundId: h.id }); setRound(r); setFeedback(false); })}><span>{new Date(h.created).toLocaleDateString('id-ID')}</span><span>{h.correct}/{h.total} tepat <ArrowRight size={14} /></span></button>)}</div>}</>}
        </> : <div className={`pp-round pp-panel${gameMode ? ' pp-round-game' : ''}`}>
            <div className="pp-round-top"><button className="pp-back" disabled={Boolean(busy)} onClick={() => { if (gameMode) { setGameStep('prepared'); return; } setRound(null); setFeedback(false); }}><ChevronLeft size={16} /> Kembali</button><span>{round.preview ? 'Pratinjau dosen · ' : ''}{round.answered}/{round.total} tantangan</span>{gameMode && <span className="pp-xp-pill"><Sparkles size={14} /> LV {level} · {totalXp} XP</span>}</div>
            <div className="pp-progress" role="progressbar" aria-label="Progres latihan" aria-valuenow={round.answered} aria-valuemin={0} aria-valuemax={round.total}><span style={{ width: `${round.total ? round.answered / round.total * 100 : 0}%` }} /></div>
            {feedback && round.last ? <div className={`pp-feedback ${round.last.result.verdict}${gameMode ? ' pp-game-enter' : ''}`} aria-live="polite">{gameMode ? <PracticeMascot mood={round.last.result.verdict === 'correct' ? 'happy' : round.last.result.verdict === 'uncertain' ? 'thinking' : 'oops'} size={72} /> : <div className="pp-feedback-icon">{round.last.result.verdict === 'correct' ? <CheckCircle2 /> : <BookOpen />}</div>}<span className="pp-eyebrow">{round.last.result.skill}</span><h3>{verdictLabel[round.last.result.verdict]}</h3><div className="pp-feedback-explanation"><strong>Penjelasan</strong><p>{round.last.result.explanation}</p></div>
                <div className="pp-example"><span>{round.last.prompt}</span><p>Jawaban Anda: {round.last.answer}</p></div>
                {round.last.result.correction && round.last.result.verdict !== 'correct' && <div className="pp-example"><span>Contoh jawaban</span><p>{round.last.result.correction}</p></div>}
                <SourceList key={round.last.ordinal} sources={round.last.sources} />
                {round.last.result.verdict !== 'correct' && round.last.result.verdict !== 'uncertain' && <div className="pp-guided-lesson">
                    {!lesson ? <button type="button" className="ld-outline-action" disabled={Boolean(busy)} onClick={() => void run('Menyiapkan pelajaran singkat…', async () => setLesson(await request<PracticeLesson>('lesson', { roundId: round.id, ordinal: round.last!.ordinal })))}><BookOpen size={16} /> Pelajari konsep ini</button> : <section className="pp-lesson-card" aria-live="polite">
                        <span className="pp-eyebrow">PELAJARAN SINGKAT</span><h4>{lesson.title}</h4><ol>{lesson.points.map((point, index) => <li key={index}>{point}</li>)}</ol>
                        <div className="pp-example"><span>Contoh</span><p>{lesson.example}</p></div>
                        <form onSubmit={e => { e.preventDefault(); void run('Memeriksa pemahaman…', async () => { const result = await request<{ verdict: keyof typeof verdictLabel; feedback: string }>('lesson-check', { roundId: round.id, ordinal: round.last!.ordinal, answer: lessonAnswer }); setLessonCheck(result); await loadReady(); }); }}>
                            <label className="pp-writing"><strong>Coba pikirkan</strong><span>{lesson.check}</span><textarea rows={2} maxLength={1200} required value={lessonAnswer} disabled={Boolean(busy) || Boolean(lessonCheck)} onChange={e => setLessonAnswer(e.target.value)} placeholder="Tulis jawaban singkat…" /></label>
                            {!lessonCheck && <button className="ld-btn-primary" disabled={Boolean(busy) || !lessonAnswer.trim()}>Periksa pemahaman <ArrowRight size={15} /></button>}
                        </form>
                        {lessonCheck && <p className={`pp-lesson-check ${lessonCheck.verdict}`} role="status"><strong>{verdictLabel[lessonCheck.verdict]}</strong> · {lessonCheck.feedback}</p>}
                    </section>}
                </div>}
                <details className="pp-report"><summary>Ada masalah dengan soal atau penilaian ini?</summary>{reported ? <p role="status">Laporan tersimpan untuk dosen. Jawaban ini tidak dipakai untuk menyesuaikan latihan berikutnya.</p> : <form onSubmit={e => { e.preventDefault(); void run('Mengirim laporan…', async () => { await request('report', { roundId: round.id, ordinal: round.last!.ordinal, reason: report }); setReported(true); await loadReady(); }); }}><label>Jelaskan masalahnya<textarea value={report} minLength={10} maxLength={1500} required onChange={e => setReport(e.target.value)} /></label><button className="ld-outline-action" disabled={Boolean(busy)}>Laporkan soal</button></form>}</details>
                {round.last.result.verdict === 'uncertain' && <p className="pp-muted">Jawaban ini tidak dipakai sebagai bukti kelemahan.</p>}
                <button className="ld-btn-primary" disabled={Boolean(busy)} onClick={() => setFeedback(false)}>{round.question ? 'Pertanyaan berikutnya' : 'Lihat ringkasan'}<ArrowRight size={16} /></button>
            </div> : round.question ? <form key={round.question.ordinal} className={`pp-question${gameMode ? ' pp-game-enter' : ''}`} onSubmit={e => { e.preventDefault(); submit(); }}>
                {gameMode && <div className="pp-question-mascot"><PracticeMascot mood="thinking" size={64} /></div>}<span className="pp-eyebrow">{gameMode ? 'TANTANGAN' : 'PERTANYAAN'} {round.question.ordinal} dari {round.total} · {round.question.type === 'multiple_choice' ? 'PILIH JAWABAN' : 'MENULIS SINGKAT'}</span><h3>{round.question.prompt}</h3><p className="pp-muted">{round.question.skill}</p>
                {round.question.type === 'multiple_choice' ? <fieldset className="pp-choices"><legend className="sr-only">Pilih jawaban Anda</legend>{round.question.options.map((option, i) => <label className={answer === String(i) ? 'selected' : ''} key={i}><input type="radio" name="practice-answer" value={i} required checked={answer === String(i)} disabled={Boolean(busy)} onChange={() => setAnswer(String(i))} /><span className="pp-choice-letter">{String.fromCharCode(65 + i)}</span><span>{option}</span>{answer === String(i) && <Check size={16} />}</label>)}</fieldset> : <label className="pp-writing">Jawaban Anda<textarea autoFocus rows={5} value={answer} maxLength={2000} required disabled={Boolean(busy)} placeholder="Tulis 1–3 kalimat…" onChange={e => setAnswer(e.target.value)} /><small>{answer.length}/2000</small></label>}
                <div className="pp-question-footer"><span className="pp-muted">Progres disimpan setelah setiap jawaban.</span><button className="ld-btn-primary" disabled={Boolean(busy) || !answer.trim()}>Periksa jawaban<ArrowRight size={16} /></button></div>
            </form> : <div className={`pp-summary${gameMode ? ' pp-game-summary pp-game-enter' : ''}`}>{gameMode ? <PracticeMascot mood="happy" size={112} /> : <div className="pp-start-icon"><CheckCircle2 size={30} /></div>}<span className="pp-eyebrow">PUTARAN SELESAI</span><h3>Latihan selesai</h3>{gameMode && <div className="pp-xp-total"><Sparkles size={21} /><strong>+{xp} XP</strong><span>{totalXp} XP · LEVEL {level}</span></div>}<p>Jawaban benar: {round.results.filter(r => r.verdict === 'correct').length} dari {round.total}.</p>
                <div className="pp-skill-summary">{[...new Set(round.results.map(r => r.skill))].map(skill => { const results = round.results.filter(r => r.skill === skill); return <div key={skill}><strong>{skill}</strong><span>{results.filter(r => r.verdict === 'correct').length}/{results.length} benar</span></div>; })}</div>
                <div className="pp-sources"><h4>Tinjau jawaban</h4>{round.review.map(item => <details key={item.ordinal}><summary>{item.ordinal}. {item.prompt}<small>{verdictLabel[item.result.verdict]}</small></summary><p>Jawaban Anda: {item.answer}</p><p>{item.result.explanation}</p>{item.result.correction && <p>Contoh: {item.result.correction}</p>}<SourceList sources={item.sources} /></details>)}</div>
                {coachId ? <a className="ld-outline-action" href="/app/student">Kembali ke dashboard</a> : <button className="ld-btn-primary" onClick={start} disabled={Boolean(busy)}><RefreshCw size={16} /> Latihan dengan contoh baru</button>}
            </div>}
        </div>}
        {!gameMode && round && ready.progress && <LearningProfile progress={ready.progress} />}
    </section>;
}
function LearningProfile({ progress }: { progress: StudentProgress }) {
    const status = { building: 'Masih dipelajari', focus: 'Perlu latihan', steady: 'Konsisten belakangan ini', improving: 'Mulai membaik' };
    return <details className="pp-panel pp-learning-profile">
        <summary><strong>Profil belajar Anda</strong><span className="pp-muted">{progress.practiceAnswers} jawaban latihan · {progress.scoredTasks} tugas dinilai</span></summary>
        <p className="pp-muted">Diperbarui dari hasil tersimpan setiap kali profil dibuka dan setelah jawaban latihan diperiksa. Hasil latihan adalah petunjuk sementara, bukan nilai atau sertifikasi penguasaan.</p>
        {!progress.skills.length && !progress.scoredTasks && <p>Belum ada hasil. Selesaikan latihan atau tunggu tugas dinilai untuk mulai membangun profil.</p>}
        <div className="pp-profile-skills">{progress.skills.map(skill => <article key={skill.id} className={'pp-profile-skill ' + skill.status}>
            <strong>{skill.label}</strong><span>{status[skill.status]}</span>
            <p>{skill.recentCorrect}/{skill.recentTotal} jawaban terbaru tepat</p><small>{skill.correct}/{skill.total} tepat dari seluruh latihan</small>
        </article>)}</div>
        {progress.outcomes.length > 0 && <section className="pp-outcome-progress"><h4>Progres capaian mata kuliah</h4><p className="pp-muted">Berdasarkan soal yang sumbernya tertaut ke Sub-CPMK pertemuan. Ini petunjuk latihan, bukan nilai penguasaan.</p><div className="pp-profile-skills">{progress.outcomes.map(outcome => <article key={outcome.id} className={'pp-profile-skill ' + outcome.status}>
            <strong>{outcome.code || 'Sub-CPMK'} · {outcome.description}</strong><span>{status[outcome.status]}</span>
            <p>{outcome.recentCorrect}/{outcome.recentTotal} jawaban terbaru tepat</p><small>{outcome.total} jawaban latihan{progress.miniLessons.byOutcome.find(item => item.id === outcome.id)?.checks ? ` · cek pelajaran: ${progress.miniLessons.byOutcome.find(item => item.id === outcome.id)?.correct}/${progress.miniLessons.byOutcome.find(item => item.id === outcome.id)?.checks} tepat` : ''}</small>
        </article>)}</div></section>}
        {(progress.miniLessons.opened > 0 || progress.miniLessons.checks > 0) && <p className="pp-muted">Pelajaran singkat dibuka {progress.miniLessons.opened} kali · cek pemahaman {progress.miniLessons.correct}/{progress.miniLessons.checks} tepat.</p>}
        {progress.confirmed.length > 0 && <section><h4>Pola kesalahan dari tugas yang ditinjau</h4><ul>{progress.confirmed.map(item => <li key={item.label}>{item.label} <small>· {item.count} temuan ditinjau{item.count < 3 ? ' · bukti awal' : ' · berulang'}</small></li>)}</ul></section>}
        {progress.scoredTasks > 0 && !progress.confirmed.length && <p className="pp-muted">Tugas sudah dinilai. Belum ada temuan kesalahan terstruktur yang ditinjau; nilai keseluruhan tidak digunakan untuk menebak kelemahan tertentu.</p>}
        {progress.recent.length > 0 && <section><h4>Catatan kesalahan & umpan balik terbaru</h4>{progress.recent.map(item => <details key={item.kind + item.id} className="pp-profile-entry">
            <summary>{item.title}<small>{item.kind === 'task' ? 'Umpan balik tugas' : 'Latihan · petunjuk sementara'} · {new Date(item.date).toLocaleDateString('id-ID')}</small></summary>
            <p><LessonText text={item.feedback} /></p>{item.correction && <p><strong>Contoh perbaikan: </strong><LessonText text={item.correction} /></p>}
        </details>)}</section>}
    </details>;
}
function SourceList({ sources }: { sources: PracticeSource[] }) {
    const fileIds = useMemo(() => [...new Set(sources.flatMap((source) => source.file ? [source.file] : []))], [sources]);
    const fileKey = fileIds.join(':');
    const [files, setFiles] = useState<FileLibraryRecord[]>([]);
    const [loading, setLoading] = useState(Boolean(fileKey));

    useEffect(() => {
        let alive = true;
        const ids = fileKey ? fileKey.split(':') : [];
        setFiles([]);
        setLoading(ids.length > 0);
        if (!ids.length) return;
        void Promise.all(ids.map(async (id) => {
            try { return await pb.collection('file_library').getOne<FileLibraryRecord>(id); }
            catch { return null; }
        })).then((records) => {
            if (alive) setFiles(records.filter((file): file is FileLibraryRecord => Boolean(file?.file)));
        }).finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [fileKey]);

    if (!fileKey) return null;
    return <div className="pp-pdf-links" aria-label="Materi rujukan">
        {loading && <span className="pp-muted">Memuat tautan materi…</span>}
        {files.map((file) => <a key={file.id} href={pb.files.getURL(file, file.file)} target="_blank" rel="noreferrer"><FileText size={15} />{file.title || file.file}<ExternalLink size={13} /></a>)}
    </div>;
}

// Deliberately supports inline emphasis only; source text cannot inject HTML.
function LessonText({ text }: { text: string }) {
    return <>{text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, index) =>
        part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> :
        part.startsWith('*') && part.endsWith('*') ? <em key={index}>{part.slice(1, -1)}</em> :
        part.startsWith('`') && part.endsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : part
    )}</>;
}
