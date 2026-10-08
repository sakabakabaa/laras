import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Check, CheckCircle2, ChevronLeft, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import type { PracticeReadiness, PracticeRound, PracticeSource, PracticeLesson } from '@/lib/personal-practice';
import type { StudentProgress } from '@/lib/student-progress';

const verdictLabel = { correct: 'Tepat!', partially_correct: 'Hampir tepat', needs_work: 'Mari coba pahami', uncertain: 'Perlu ditinjau' };
export function PersonalPractice({ courseId }: { courseId: string }) {
    const [ready, setReady] = useState<PracticeReadiness | null>(null);
    const [round, setRound] = useState<PracticeRound | null>(null);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [answer, setAnswer] = useState('');
    const [feedback, setFeedback] = useState(false);
    const [report, setReport] = useState('');
    const [reported, setReported] = useState(false);
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
                        if (alive) { setRound(restored); setFeedback(Boolean(restored.last)); }
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
    const run = async (label: string, job: () => Promise<void>) => {
        if (busy) return;
        setBusy(label); setError('');
        try { await job(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
    };
    const start = () => void run('Menyiapkan latihan dari materi Anda…', async () => {
        const result = await request<PracticeRound>('start');
        setRound(result); setAnswer(''); setFeedback(Boolean(result.last));
        localStorage.setItem(storageKey, result.id);
    });
    const submit = () => void run('Memeriksa jawaban…', async () => {
        if (!round?.question) return;
        const result = await request<PracticeRound>('answer', { roundId: round.id, ordinal: round.question.ordinal, answer });
        setRound(result); setFeedback(true); setAnswer(''); setReported(false); setReport('');
        await loadReady();
    });
    if (!ready) return <section className="pp-page">{error ? <div role="alert" className="pp-error">{error}<button onClick={() => void run('Memuat…', async () => { await loadReady(); })}>Coba lagi</button></div> : <div className="pp-loading"><LoaderCircle className="spin" /> Membuka latihan personal…</div>}</section>;
    return <section className="pp-page">
        <header className="pp-heading"><div><span className="pp-eyebrow">LATIHAN PERSONAL</span><h2>Sedikit latihan, makin percaya diri.</h2><p>Bahasa berkembang lewat kebiasaan. Lima pertanyaan dari pertemuan terbaru, sesuai kebutuhan Anda.</p></div><span className="pp-badge">Tanpa nilai resmi</span></header>
        {error && <div className="pp-error" role="alert">{error}</div>}
        {ready.canEdit && !round && <div className="pp-panel"><h3>Latihan mandiri mahasiswa</h3><p className="pp-muted">Latihan tersedia otomatis. Setiap mahasiswa mendapat soal dari tiga pertemuan terakhir di kelasnya, materi yang dapat ia baca, serta umpan balik dan riwayat latihannya sendiri. Pratinjau ini memakai lingkup mata kuliah, tanpa data pribadi mahasiswa.</p>{ready.reports.length > 0 && <details><summary>Soal yang dilaporkan ({ready.reports.length})</summary>{ready.reports.map((r,i) => <div className="pp-example" key={i}><strong>{r.prompt}</strong><p>{r.reason}</p></div>)}</details>}</div>}
        {busy && <div className="pp-loading" role="status"><LoaderCircle className="spin" size={18} /> {busy}</div>}
        {!round ? <>
            {ready.progress && <LearningProfile progress={ready.progress} />}
            <div className="pp-start pp-panel"><div className="pp-start-icon"><Sparkles size={25} /></div><div><h3>{ready.canEdit ? 'Coba pengalaman mahasiswa' : 'Latihan hari ini'}</h3><p>5 pertanyaan · sekitar 5 menit · pilihan ganda & menulis singkat</p><p className="pp-muted">{ready.personalization}</p></div>
                <button className="ld-btn-primary" onClick={start} disabled={Boolean(busy) || Boolean(ready.reason)}>{ready.canEdit ? 'Pratinjau latihan' : 'Mulai latihan'}<ArrowRight size={16} /></button>
            </div>
            {ready.reason && <p className="pp-notice">{ready.reason}</p>}
            <div className="pp-section-heading"><h3>Dari pertemuan terbaru</h3><span className="pp-muted">{ready.scopeNote}</span></div>
            <div className="pp-session-grid">{ready.sessions.map(s => <article className="pp-panel" key={s.id}><span className="pp-eyebrow">MINGGU {s.week}</span><h4>{s.title}</h4><small>{new Date(s.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })}</small></article>)}</div>
            {ready.history.length > 0 && <div className="pp-panel"><h3>Riwayat latihan{ready.canEdit ? ' pratinjau' : ''}</h3>{ready.history.map(h => <button className="pp-history" key={h.id} disabled={Boolean(busy)} onClick={() => void run('Membuka riwayat…', async () => { const r = await request<PracticeRound>('round', { roundId: h.id }); setRound(r); setFeedback(false); })}><span>{new Date(h.created).toLocaleDateString('id-ID')}</span><span>{h.correct}/{h.total} tepat <ArrowRight size={14} /></span></button>)}</div>}
        </> : <div className="pp-round pp-panel">
            <div className="pp-round-top"><button className="pp-back" disabled={Boolean(busy)} onClick={() => { setRound(null); setFeedback(false); }}><ChevronLeft size={16} /> Kembali</button><span>{round.preview ? 'Pratinjau dosen · ' : ''}{round.answered}/{round.total} terjawab</span></div>
            <div className="pp-progress" role="progressbar" aria-label="Progres latihan" aria-valuenow={round.answered} aria-valuemin={0} aria-valuemax={round.total}><span style={{ width: `${round.total ? round.answered / round.total * 100 : 0}%` }} /></div>
            {feedback && round.last ? <div className={`pp-feedback ${round.last.result.verdict}`} aria-live="polite"><div className="pp-feedback-icon">{round.last.result.verdict === 'correct' ? <CheckCircle2 /> : <BookOpen />}</div><span className="pp-eyebrow">{round.last.result.skill}</span><h3>{verdictLabel[round.last.result.verdict]}</h3><p>{round.last.result.explanation}</p>
                <div className="pp-example"><span>{round.last.prompt}</span><p>Jawaban Anda: {round.last.answer}</p></div>
                {round.last.result.correction && round.last.result.verdict !== 'correct' && <div className="pp-example"><span>Contoh jawaban</span><p>{round.last.result.correction}</p></div>}
                <SourceList key={round.last.ordinal} sources={round.last.sources} loadLesson={() => request<PracticeLesson>("lesson", { roundId: round.id, ordinal: round.last!.ordinal })} />
                <details className="pp-report"><summary>Ada masalah dengan soal atau penilaian ini?</summary>{reported ? <p role="status">Laporan tersimpan untuk dosen. Jawaban ini tidak dipakai untuk menyesuaikan latihan berikutnya.</p> : <form onSubmit={e => { e.preventDefault(); void run('Mengirim laporan…', async () => { await request('report', { roundId: round.id, ordinal: round.last!.ordinal, reason: report }); setReported(true); await loadReady(); }); }}><label>Jelaskan masalahnya<textarea value={report} minLength={10} maxLength={1500} required onChange={e => setReport(e.target.value)} /></label><button className="ld-outline-action" disabled={Boolean(busy)}>Laporkan soal</button></form>}</details>
                {round.last.result.verdict === 'uncertain' && <p className="pp-muted">Jawaban ini tidak dipakai sebagai bukti kelemahan.</p>}
                <button className="ld-btn-primary" disabled={Boolean(busy)} onClick={() => setFeedback(false)}>{round.question ? 'Pertanyaan berikutnya' : 'Lihat ringkasan'}<ArrowRight size={16} /></button>
            </div> : round.question ? <form className="pp-question" onSubmit={e => { e.preventDefault(); submit(); }}>
                <span className="pp-eyebrow">PERTANYAAN {round.question.ordinal} · {round.question.type === 'multiple_choice' ? 'PILIH JAWABAN' : 'MENULIS SINGKAT'}</span><h3>{round.question.prompt}</h3><p className="pp-muted">{round.question.skill}</p>
                {round.question.type === 'multiple_choice' ? <fieldset className="pp-choices"><legend className="sr-only">Pilih jawaban Anda</legend>{round.question.options.map((option, i) => <label className={answer === String(i) ? 'selected' : ''} key={i}><input type="radio" name="practice-answer" value={i} required checked={answer === String(i)} disabled={Boolean(busy)} onChange={() => setAnswer(String(i))} /><span className="pp-choice-letter">{String.fromCharCode(65 + i)}</span><span>{option}</span>{answer === String(i) && <Check size={16} />}</label>)}</fieldset> : <label className="pp-writing">Jawaban Anda<textarea autoFocus rows={5} value={answer} maxLength={2000} required disabled={Boolean(busy)} placeholder="Tulis 1–3 kalimat…" onChange={e => setAnswer(e.target.value)} /><small>{answer.length}/2000</small></label>}
                <div className="pp-question-footer"><span className="pp-muted">Progres disimpan setelah setiap jawaban.</span><button className="ld-btn-primary" disabled={Boolean(busy) || !answer.trim()}>Periksa jawaban<ArrowRight size={16} /></button></div>
            </form> : <div className="pp-summary"><div className="pp-start-icon"><CheckCircle2 size={30} /></div><span className="pp-eyebrow">PUTARAN SELESAI</span><h3>Satu langkah lagi hari ini.</h3><p>{round.results.filter(r => r.verdict === 'correct').length} dari {round.total} jawaban tepat. Ini progres latihan, bukan nilai mata kuliah.</p>
                <div className="pp-skill-summary">{[...new Set(round.results.map(r => r.skill))].map(skill => { const results = round.results.filter(r => r.skill === skill); return <div key={skill}><strong>{skill}</strong><span>{results.every(r => r.verdict === 'correct') ? 'Sudah tepat pada putaran ini' : results.every(r => r.verdict === 'uncertain') ? 'Belum dapat disimpulkan' : 'Latih kembali dengan contoh baru'}</span></div>; })}</div>
                <div className="pp-sources"><h4>Tinjau jawaban & materi</h4>{round.review.map(item => <details key={item.ordinal}><summary>{item.ordinal}. {item.prompt}<small>{verdictLabel[item.result.verdict]}</small></summary><p>Jawaban Anda: {item.answer}</p><p>{item.result.explanation}</p>{item.result.correction && <p>Contoh: {item.result.correction}</p>}<SourceList sources={item.sources} loadLesson={() => request<PracticeLesson>("lesson", { roundId: round.id, ordinal: item.ordinal })} /></details>)}</div>
                <button className="ld-btn-primary" onClick={start} disabled={Boolean(busy)}><RefreshCw size={16} /> Latihan dengan contoh baru</button>
            </div>}
        </div>}
        {round && ready.progress && <LearningProfile progress={ready.progress} />}
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
        {progress.confirmed.length > 0 && <section><h4>Pola kesalahan dari tugas yang ditinjau</h4><ul>{progress.confirmed.map(item => <li key={item.label}>{item.label} <small>· {item.count} temuan ditinjau{item.count < 3 ? ' · bukti awal' : ' · berulang'}</small></li>)}</ul></section>}
        {progress.scoredTasks > 0 && !progress.confirmed.length && <p className="pp-muted">Tugas sudah dinilai. Belum ada temuan kesalahan terstruktur yang ditinjau; nilai keseluruhan tidak digunakan untuk menebak kelemahan tertentu.</p>}
        {progress.recent.length > 0 && <section><h4>Catatan kesalahan & umpan balik terbaru</h4>{progress.recent.map(item => <details key={item.kind + item.id} className="pp-profile-entry">
            <summary>{item.title}<small>{item.kind === 'task' ? 'Umpan balik tugas' : 'Latihan · petunjuk sementara'} · {new Date(item.date).toLocaleDateString('id-ID')}</small></summary>
            <p><LessonText text={item.feedback} /></p>{item.correction && <p><strong>Contoh perbaikan: </strong><LessonText text={item.correction} /></p>}
        </details>)}</section>}
    </details>;
}
function SourceList({ sources, loadLesson }: { sources: PracticeSource[]; loadLesson: () => Promise<PracticeLesson> }) {
    const [lesson, setLesson] = useState<PracticeLesson | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const load = async () => {
        if (lesson || loading) return;
        setLoading(true); setError('');
        try { setLesson(await loadLesson()); }
        catch (e) { setError((e as Error).message); }
        finally { setLoading(false); }
    };
    return <div className="pp-sources">
        <details onToggle={e => { if (e.currentTarget.open) void load(); }}>
            <summary><BookOpen size={16} /> Pelajari langkah demi langkah<small>Konsep singkat, contoh, dan panduan penerapan</small></summary>
            {loading && <p role="status"><LoaderCircle size={16} className="spin" /> Menyiapkan panduan belajar…</p>}
            {error && <div role="alert"><p>{error}</p><button className="ld-outline-action" onClick={() => void load()}>Coba lagi</button></div>}
            {lesson && <div className="pp-guided-lesson"><span className="pp-eyebrow">PANDUAN BELAJAR</span><h4>{lesson.title}</h4><ol className="pp-lesson-steps">{lesson.points.map((point,i) => <li key={i}><span className="pp-lesson-number" aria-hidden="true">{i + 1}</span><div><LessonText text={point} /></div></li>)}</ol><div className="pp-lesson-example"><span className="pp-eyebrow">CONTOH PENERAPAN</span><p><LessonText text={lesson.example} /></p></div><div className="pp-lesson-reflection"><strong>Coba pikirkan</strong><p><LessonText text={lesson.check} /></p></div><small className="pp-muted">Panduan AI berdasarkan rujukan di bawah.</small></div>}
            <details><summary>Lihat kutipan asli & sumber</summary>{sources.map(s => <article key={s.id}><h4>{s.title}</h4><small>{s.locator}{s.version ? ` · versi ${s.version}` : ''}</small><p style={{ whiteSpace: 'pre-wrap' }}>{s.text}</p>{!s.file && <small>Rencana materi pertemuan; bukan kutipan buku.</small>}</article>)}</details>
        </details>
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

