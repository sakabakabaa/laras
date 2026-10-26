import {practiceSystemMessage} from '@/lib/practice-i18n';
import { useT, useLanguage, localeOf } from '@/lib/i18n';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Check, CheckCircle2, ChevronLeft, ExternalLink, FileText, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { useSearchParams } from 'react-router';
import { AgentTaskPanel } from './agent-task-panel';
import type { PracticeLesson, PracticeReadiness, PracticeRound, PracticeSource } from '@/lib/personal-practice';
import type { StudentProgress } from '@/lib/student-progress';
import type { FileLibraryRecord } from '@/lib/learning';

export function PersonalPractice({ courseId }: { courseId: string }) {
    const t = useT();
    const language = useLanguage();
    const verdictLabel = { correct: t('personal.correct'), partially_correct: t('personal.partial'), needs_work: t('personal.needsWork'), uncertain: t('personal.uncertain') };
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
    const storageKey = `laras-practice:${pb.authStore.record?.id}:${courseId}`;
    const request = useCallback(async <T,>(action: string, body: Record<string, unknown> = {}): Promise<T> => {
        const response = await fetch('/api/personal-practice', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pb.authStore.token}` }, body: JSON.stringify({ action, courseId, ...body }) }).catch(()=>{throw new Error(t('practiceUi.requestFailed'));});
        const result = await response.json().catch(()=>{throw new Error(t('practiceUi.requestFailed'));});
        if (!response.ok) throw new Error(typeof result.error === 'string' ? practiceSystemMessage(t,result.error,'practiceUi.requestFailed') : t('practiceUi.requestFailed'));
        return result as T;
    }, [courseId,t]);
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
    const start = () => void run(t('personal.preparing'), async () => {
            const result = await request<PracticeRound>('start');
            setRound(result); setAnswer(''); setFeedback(Boolean(result.last));
            localStorage.setItem(storageKey, result.id);
        });
    const submit = () => void run(t('personal.checking'), async () => {
        if (!round?.question) return;
        const result = await request<PracticeRound>('answer', { roundId: round.id, ordinal: round.question.ordinal, answer });
        setRound(result); setFeedback(true); setAnswer(''); setReported(false); setReport(''); setLesson(null); setLessonAnswer(''); setLessonCheck(null);
        await loadReady();
    });
    if (!ready) return <section className="pp-page">{error ? <div role="alert" className="pp-error">{error}<button onClick={() => void run(t('student.courses.loading'), async () => { await loadReady(); })}>{t('student.common.retry')}</button></div> : <div className="pp-loading"><LoaderCircle className="spin" /> {t('personal.loading')}</div>}</section>;
    return <section className="pp-page">
        {coachId && <AgentTaskPanel student coachId={coachId} compact activeRoundId={round?.id || ''} onRoundReady={id => void run(t('practiceUi.openRound'), async () => {
            const next = await request<PracticeRound>('round', { roundId: id });
            setRound(next); setAnswer(''); setFeedback(Boolean(next.last)); setLesson(null); localStorage.setItem(storageKey, id);
        })} />}
        <header className="pp-heading"><div><span className="pp-eyebrow">{t('practice.eyebrow')}</span><h2>{t('personal.heading')}</h2><p>{t('personal.description')}</p></div><span className="pp-badge">{t('practice.ungraded')}</span></header>
        {error && <div className="pp-error" role="alert">{error}</div>}
        {ready.canEdit && !round && <div className="pp-panel"><h3>{t('practiceUi.independent')}</h3><p className="pp-muted">{t('practiceUi.previewPrivacy')}</p>{ready.reports.length > 0 && <details><summary>{t('practiceUi.reportedQuestions',{count:String(ready.reports.length)})}</summary>{ready.reports.map((r,i) => <div className="pp-example" key={i}><strong>{r.prompt}</strong><p>{r.reason}</p></div>)}</details>}</div>}
        {busy && <div className="pp-loading" role="status"><LoaderCircle className="spin" size={18} /> {busy}</div>}
        {!round ? <>
            {ready.progress && <LearningProfile progress={ready.progress} />}
            <div className="pp-start pp-panel"><div className="pp-start-icon"><Sparkles size={25} /></div><div><h3>{ready.canEdit ? t('personal.previewExperience') : t('personal.today')}</h3><p>{t('personal.summary')}</p><p className="pp-muted">{practiceSystemMessage(t,ready.personalization)}</p></div>
                <button className="ld-btn-primary" onClick={start} disabled={Boolean(busy) || Boolean(ready.reason)}>{ready.canEdit ? t('personal.preview') : t('practice.start')}<ArrowRight size={16} /></button>
            </div>
            {ready.reason && <p className="pp-notice">{practiceSystemMessage(t,ready.reason)}</p>}
            <><div className="pp-section-heading"><h3>{t('personal.recent')}</h3><span className="pp-muted">{practiceSystemMessage(t,ready.scopeNote)}</span></div>
            <div className="pp-session-grid">{ready.sessions.map(s => <article className="pp-panel" key={s.id}><span className="pp-eyebrow">{t('practiceUi.week')} {s.week}</span><h4>{s.title}</h4><small>{new Date(s.date).toLocaleDateString(localeOf(language), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })}</small></article>)}</div>
            {ready.history.length > 0 && <div className="pp-panel"><h3>{t('practiceUi.history')}{ready.canEdit ? ' pratinjau' : ''}</h3>{ready.history.map(h => <button className="pp-history" key={h.id} disabled={Boolean(busy)} onClick={() => void run(t('practiceUi.openHistory'), async () => { const r = await request<PracticeRound>('round', { roundId: h.id }); setRound(r); setFeedback(false); })}><span>{new Date(h.created).toLocaleDateString(localeOf(language), { timeZone: 'Asia/Jakarta' })}</span><span>{h.correct}/{h.total} {t('practiceUi.correctWord')} <ArrowRight size={14} /></span></button>)}</div>}</>
        </> : <div className="pp-round pp-panel">
            <div className="pp-round-top"><button className="pp-back" disabled={Boolean(busy)} onClick={() => { setRound(null); setFeedback(false); }}><ChevronLeft size={16} /> {t('shell.back')}</button><span>{round.preview ? t('practiceUi.teacherPreview') : ''}{round.answered}/{round.total} {t('practiceUi.answered')}</span></div>
            <div className="pp-progress" role="progressbar" aria-label={t('personal.progress')} aria-valuenow={round.answered} aria-valuemin={0} aria-valuemax={round.total}><span style={{ width: `${round.total ? round.answered / round.total * 100 : 0}%` }} /></div>
            {feedback && round.last ? <div className={`pp-feedback ${round.last.result.verdict}`} aria-live="polite"><div className="pp-feedback-icon">{round.last.result.verdict === 'correct' ? <CheckCircle2 /> : <BookOpen />}</div><span className="pp-eyebrow">{practiceSystemMessage(t,round.last.result.skill)}</span><h3>{verdictLabel[round.last.result.verdict]}</h3><div className="pp-feedback-explanation"><strong>{t('personal.explanation')}</strong><p>{round.last.result.explanation}</p></div>
                <div className="pp-example"><span>{round.last.prompt}</span><p>{t('practiceUi.yourAnswer')} {round.last.answer}</p></div>
                {round.last.result.correction && round.last.result.verdict !== 'correct' && <div className="pp-example"><span>{t('personal.example')}</span><p>{round.last.result.correction}</p></div>}
                <SourceList key={round.last.ordinal} sources={round.last.sources} />
                {round.last.result.verdict !== 'correct' && round.last.result.verdict !== 'uncertain' && <div className="pp-guided-lesson">
                    {!lesson ? <button type="button" className="ld-outline-action" disabled={Boolean(busy)} onClick={() => void run(t('practiceUi.shortLessonLoading'), async () => setLesson(await request<PracticeLesson>('lesson', { roundId: round.id, ordinal: round.last!.ordinal })))}><BookOpen size={16} /> {t('practiceUi.learnConcept')}</button> : <section className="pp-lesson-card" aria-live="polite">
                        <span className="pp-eyebrow">{t('practiceUi.shortLesson')}</span><h4>{lesson.title}</h4><ol>{lesson.points.map((point, index) => <li key={index}>{point}</li>)}</ol>
                        <div className="pp-example"><span>{t('practiceUi.example')}</span><p>{lesson.example}</p></div>
                        <form onSubmit={e => { e.preventDefault(); void run(t('practiceUi.understandingLoading'), async () => { const result = await request<{ verdict: keyof typeof verdictLabel; feedback: string }>('lesson-check', { roundId: round.id, ordinal: round.last!.ordinal, answer: lessonAnswer }); setLessonCheck(result); await loadReady(); }); }}>
                            <label className="pp-writing"><strong>{t('practiceUi.think')}</strong><span>{lesson.check}</span><textarea rows={2} maxLength={1200} required value={lessonAnswer} disabled={Boolean(busy) || Boolean(lessonCheck)} onChange={e => setLessonAnswer(e.target.value)} placeholder={t('practiceUi.shortAnswerPlaceholder')} /></label>
                            {!lessonCheck && <button className="ld-btn-primary" disabled={Boolean(busy) || !lessonAnswer.trim()}>{t('practiceUi.understandingCheck')} <ArrowRight size={15} /></button>}
                        </form>
                        {lessonCheck && <p className={`pp-lesson-check ${lessonCheck.verdict}`} role="status"><strong>{verdictLabel[lessonCheck.verdict]}</strong> · {lessonCheck.feedback}</p>}
                    </section>}
                </div>}
                <details className="pp-report"><summary>{t('practiceUi.reportIssue')}</summary>{reported ? <p role="status">{t('practiceUi.reportSaved')}</p> : <form onSubmit={e => { e.preventDefault(); void run(t('practiceUi.reportSending'), async () => { await request('report', { roundId: round.id, ordinal: round.last!.ordinal, reason: report }); setReported(true); await loadReady(); }); }}><label>{t('practiceUi.describeIssue')}<textarea value={report} minLength={10} maxLength={1500} required onChange={e => setReport(e.target.value)} /></label><button className="ld-outline-action" disabled={Boolean(busy)}>{t('practiceUi.reportQuestion')}</button></form>}</details>
                {round.last.result.verdict === 'uncertain' && <p className="pp-muted">{t('practiceUi.uncertainEvidence')}</p>}
                <button className="ld-btn-primary" disabled={Boolean(busy)} onClick={() => setFeedback(false)}>{round.question ? t('personal.next') : t('personal.showSummary')}<ArrowRight size={16} /></button>
            </div> : round.question ? <form key={round.question.ordinal} className="pp-question" onSubmit={e => { e.preventDefault(); submit(); }}>
                <span className="pp-eyebrow">{t('practiceUi.question')} {round.question.ordinal} {t('practiceUi.of')} {round.total} · {round.question.type === 'multiple_choice' ? t('practiceUi.chooseAnswer') : t('practiceUi.shortWriting')}</span><h3>{round.question.prompt}</h3><p className="pp-muted">{practiceSystemMessage(t,round.question.skill)}</p>
                {round.question.type === 'multiple_choice' ? <fieldset className="pp-choices"><legend className="sr-only">{t('practiceUi.answerLegend')}</legend>{round.question.options.map((option, i) => <label className={answer === String(i) ? 'selected' : ''} key={i}><input type="radio" name="practice-answer" value={i} required checked={answer === String(i)} disabled={Boolean(busy)} onChange={() => setAnswer(String(i))} /><span className="pp-choice-letter">{String.fromCharCode(65 + i)}</span><span>{option}</span>{answer === String(i) && <Check size={16} />}</label>)}</fieldset> : <label className="pp-writing">{t('personal.answer')}<textarea autoFocus rows={5} value={answer} maxLength={2000} required disabled={Boolean(busy)} placeholder={t('personal.shortPlaceholder')} onChange={e => setAnswer(e.target.value)} /><small>{answer.length}/2000</small></label>}
                <div className="pp-question-footer"><span className="pp-muted">{t('personal.saved')}</span><button className="ld-btn-primary" disabled={Boolean(busy) || !answer.trim()}>{t('personal.check')}<ArrowRight size={16} /></button></div>
            </form> : <div className="pp-summary"><div className="pp-start-icon"><CheckCircle2 size={30} /></div><span className="pp-eyebrow">{t('personal.roundComplete')}</span><h3>{t('personal.complete')}</h3><p>{t('practiceUi.correctAnswers')} {round.results.filter(r => r.verdict === 'correct').length} {t('practiceUi.of')} {round.total}.</p>
                <div className="pp-skill-summary">{[...new Set(round.results.map(r => r.skill))].map(skill => { const results = round.results.filter(r => r.skill === skill); return <div key={practiceSystemMessage(t,skill)}><strong>{practiceSystemMessage(t,skill)}</strong><span>{results.filter(r => r.verdict === 'correct').length}/{results.length} {t('practiceUi.correctPlain')}</span></div>; })}</div>
                <div className="pp-sources"><h4>{t('practiceUi.reviewAnswers')}</h4>{round.review.map(item => <details key={item.ordinal}><summary>{item.ordinal}. {item.prompt}<small>{verdictLabel[item.result.verdict]}</small></summary><p>{t('practiceUi.yourAnswer')} {item.answer}</p><p>{item.result.explanation}</p>{item.result.correction && <p>{t('practiceUi.examplePrefix')}{item.result.correction}</p>}<SourceList sources={item.sources} /></details>)}</div>
                {coachId ? <a className="ld-outline-action" href="/app/student">{t('practiceUi.backDashboard')}</a> : <button className="ld-btn-primary" onClick={start} disabled={Boolean(busy)}><RefreshCw size={16} /> {t('practiceUi.newExamples')}</button>}
            </div>}
        </div>}
        {round && ready.progress && <LearningProfile progress={ready.progress} />}
    </section>;
}
function LearningProfile({ progress }: { progress: StudentProgress }) {
    const t = useT();
    const language = useLanguage();
    const status = { building: t('practiceUi.building'), focus: t('practiceUi.focus'), steady: t('practiceUi.steady'), improving: t('practiceUi.improving') };
    return <details className="pp-panel pp-learning-profile">
        <summary><strong>{t('personal.profile')}</strong><span className="pp-muted">{t('personal.profileCounts', { answers: String(progress.practiceAnswers), tasks: String(progress.scoredTasks) })}</span></summary>
        <p className="pp-muted">{t('practiceUi.profileDescription')}</p>
        {!progress.skills.length && !progress.scoredTasks && <p>{t('practiceUi.profileEmpty')}</p>}
        <div className="pp-profile-skills">{progress.skills.map(skill => <article key={skill.id} className={'pp-profile-skill ' + skill.status}>
            <strong>{practiceSystemMessage(t,skill.label)}</strong><span>{status[skill.status]}</span>
            <p>{skill.recentCorrect}/{skill.recentTotal} {t('practiceUi.recentCorrect')}</p><small>{skill.correct}/{skill.total} {t('practiceUi.allCorrect')}</small>
        </article>)}</div>
        {progress.outcomes.length > 0 && <section className="pp-outcome-progress"><h4>{t('practiceUi.outcomeProgress')}</h4><p className="pp-muted">{t('practiceUi.outcomeDescription')}</p><div className="pp-profile-skills">{progress.outcomes.map(outcome => <article key={outcome.id} className={'pp-profile-skill ' + outcome.status}>
            <strong>{outcome.code || 'Sub-CPMK'} · {outcome.description}</strong><span>{status[outcome.status]}</span>
            <p>{outcome.recentCorrect}/{outcome.recentTotal} {t('practiceUi.recentCorrect')}</p><small>{outcome.total} {t('practiceUi.practiceAnswers')}{progress.miniLessons.byOutcome.find(item => item.id === outcome.id)?.checks ? t('practiceUi.lessonChecks',{correct:String(progress.miniLessons.byOutcome.find(item => item.id === outcome.id)?.correct),total:String(progress.miniLessons.byOutcome.find(item => item.id === outcome.id)?.checks)}) : ''}</small>
        </article>)}</div></section>}
        {(progress.miniLessons.opened > 0 || progress.miniLessons.checks > 0) && <p className="pp-muted">{t('practiceUi.miniLessons',{opened:String(progress.miniLessons.opened),correct:String(progress.miniLessons.correct),total:String(progress.miniLessons.checks)})}</p>}
        {progress.confirmed.length > 0 && <section><h4>{t('practiceUi.reviewedPatterns')}</h4><ul>{progress.confirmed.map(item => <li key={item.label}>{item.label} <small>· {t('practiceUi.findings',{count:String(item.count)})}{item.count < 3 ? t('practiceUi.earlyEvidence') : t('practiceUi.repeated')}</small></li>)}</ul></section>}
        {progress.scoredTasks > 0 && !progress.confirmed.length && <p className="pp-muted">{t('practiceUi.profileNoPatterns')}</p>}
        {progress.recent.length > 0 && <section><h4>{t('practiceUi.recentFeedback')}</h4>{progress.recent.map(item => <details key={item.kind + item.id} className="pp-profile-entry">
            <summary>{item.title}<small>{item.kind === 'task' ? t('practiceUi.taskFeedback') : t('practiceUi.practiceIndicator')} · {new Date(item.date).toLocaleDateString(localeOf(language), { timeZone: 'Asia/Jakarta' })}</small></summary>
            <p><LessonText text={item.feedback} /></p>{item.correction && <p><strong>{t('practiceUi.correctionExample')}</strong><LessonText text={item.correction} /></p>}
        </details>)}</section>}
    </details>;
}
function SourceList({ sources }: { sources: PracticeSource[] }) {
    const t = useT();
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
    return <div className="pp-pdf-links" aria-label={t('practiceUi.sourceMaterials')}>
        {loading && <span className="pp-muted">{t('practiceUi.loadingSources')}</span>}
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
