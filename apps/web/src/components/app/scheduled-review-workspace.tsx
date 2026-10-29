import {useEffect, useMemo, useRef, useState} from 'react';
import type {ScheduledClassState} from '@/lib/scheduled-classes';
import {buildAssessmentPayload, buildGradingSettingsPayload, buildPublishPayload, emptyGradeDraft, formatScheduledResponse, hydrateGradeDraft, validateManualGrade} from '@/lib/scheduled-review';

type Props = {state: ScheduledClassState; onAction: (action: string, body?: Record<string, unknown>) => Promise<void>};
type CriterionDraft = {id: string; label: string; maxPoints: string};
type GradeDraft = {feedback: string; points: string; criterionScores: Record<string, string>};
const emptyDraft: GradeDraft = emptyGradeDraft;

export function ScheduledReviewWorkspace({state, onAction}: Props) {
  const [mode, setMode] = useState('Per mahasiswa');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Semua');
  const [index, setIndex] = useState(0);
  const [activityId, setActivityId] = useState(state.activities.find(a => a.kind === 'assignment' || a.kind === 'exit_ticket')?.id || '');
  const [settingsMode, setSettingsMode] = useState<'ungraded'|'points'|'rubric'>('ungraded');
  const [maxPoints, setMaxPoints] = useState('10');
  const [criteria, setCriteria] = useState<CriterionDraft[]>([{id: 'clarity', label: 'Clarity', maxPoints: '10'}]);
  const [draft, setDraft] = useState<GradeDraft>(emptyDraft);
  const [savedDraft, setSavedDraft] = useState(JSON.stringify(emptyDraft));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const attempts = state.attempts.filter(a => a.status !== 'draft');
  const entries = useMemo(() => attempts
    .map(attempt => ({attempt, activity: state.activities.find(a => a.id === attempt.activity), row: state.report.find(r => r.student === attempt.student)}))
    .filter(x => x.activity && ['assignment', 'exit_ticket'].includes(x.activity.kind))
    .filter(x => mode !== 'Per kegiatan' || x.activity?.id === activityId)
    .filter(x => `${x.row?.name || x.attempt.student} ${x.activity?.title}`.toLowerCase().includes(query.toLowerCase()))
    .filter(x => filter === 'Semua'
      || (filter === 'Belum ditinjau' && !state.assessments?.some(a => a.attempt === x.attempt.id && a.status === 'reviewed'))
      || (filter === 'Sudah ditinjau' && state.assessments?.some(a => a.attempt === x.attempt.id && a.status === 'reviewed'))
      || (filter === 'Belum lengkap' && !x.attempt.complete)),
  [attempts, state.activities, state.report, state.assessments, query, filter, mode, activityId]);
  const current = entries[Math.min(index, Math.max(0, entries.length - 1))];
  const gradeActivityId = current?.activity?.id || activityId;
  const settings = state.gradingSettings?.find(s => s.activity === gradeActivityId);
  const assessment = state.assessments?.find(a => a.attempt === current?.attempt.id);
  const dirty = JSON.stringify(draft) !== savedDraft;
  const currentAttemptId = current?.attempt.id || null;

  useEffect(() => { setIndex(0); }, [mode, query, filter]);
  useEffect(() => { if (mode === 'Per kegiatan') setIndex(0); }, [mode, activityId]);
  useEffect(() => {
    setSettingsMode(settings?.mode || 'ungraded');
    setMaxPoints(String(settings?.maxPoints ?? 10));
    setCriteria(settings ? settings.criteria.map(c => ({...c, maxPoints: String(c.maxPoints)})) : [{id: 'clarity', label: 'Clarity', maxPoints: '10'}]);
  }, [gradeActivityId, settings?.revision]);
  const ownerRef = useRef<string | null>(currentAttemptId);
  useEffect(() => {
    const previousOwner = ownerRef.current;
    const next = hydrateGradeDraft(draft, previousOwner, currentAttemptId, assessment, dirty);
    if (next.changedIdentity || !dirty) {
      setDraft(next.draft);
      setSavedDraft(JSON.stringify(next.draft));
      ownerRef.current = currentAttemptId;
    }
  }, [currentAttemptId, assessment?.attempt, assessment?.revision, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {e.preventDefault(); e.returnValue = '';};
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const guard = () => !dirty || window.confirm('Perubahan penilaian yang belum disimpan akan hilang. Lanjutkan?');
  const selectEntry = (nextIndex: number, nextActivityId?: string, skipGuard = false) => {
    if (!skipGuard && !guard()) return;
    setIndex(Math.max(0, Math.min(entries.length - 1, nextIndex)));
    if (nextActivityId) setActivityId(nextActivityId);
  };
  const criteriaPayload = criteria.filter(c => c.id.trim() && c.label.trim()).map(c => ({id: c.id.trim(), label: c.label.trim(), maxPoints: Number(c.maxPoints) || 0}));
  const saveSettings = async () => {
    const chosenMode = settingsMode;
    const cleanCriteria = chosenMode === 'rubric' ? criteriaPayload : [];
    if (chosenMode === 'rubric' && cleanCriteria.reduce((n, c) => n + c.maxPoints, 0) !== Number(maxPoints)) {
      setMessage('Rubric criterion maxima must equal maximum points.'); return;
    }
    setBusy(true);
    try {
      await onAction('saveGradingSettings', buildGradingSettingsPayload({activityId: gradeActivityId, settingsRevision: settings?.revision || 0, mode: chosenMode, maxPoints: chosenMode === 'ungraded' ? 0 : Number(maxPoints), criteria: cleanCriteria}));
      setMessage('Pengaturan tersimpan.');
    } catch (e) {setMessage((e as Error).message);}
    finally {setBusy(false);}
  };
  const saveGrade = async (status: 'draft'|'reviewed', next = false) => {
    if (!current) return;
    const gradeSettings = settings || {mode: settingsMode, maxPoints: settingsMode === 'ungraded' ? 0 : Number(maxPoints), criteria: criteriaPayload};
    const scores: Record<string, number> = {};
    for (const [key, value] of Object.entries(draft.criterionScores)) if (value !== '') scores[key] = Number(value);
    const rubric = gradeSettings.mode === 'rubric';
    const points = gradeSettings.mode === 'ungraded' ? null : rubric
      ? criteriaPayload.reduce((sum, c) => sum + (scores[c.id] || 0), 0)
      : Number(draft.points);
    const grade = {points, criterionScores: rubric ? scores : {}};
    const validation = validateManualGrade(gradeSettings, grade);
    if (validation) {setMessage(validation); return;}
    setBusy(true);
    try {
      await onAction('saveAssessment', buildAssessmentPayload({attemptId: current.attempt.id, assessmentRevision: assessment?.revision || 0, attemptRevision: current.attempt.revision, settingsRevision: settings?.revision || 0, status, points: grade.points, criterionScores: grade.criterionScores, feedback: draft.feedback}));
      setSavedDraft(JSON.stringify(draft)); setMessage('Penilaian tersimpan.');
      if (next) selectEntry(index + 1, undefined, true);
    } catch (e) {setMessage(/revision|berubah|conflict/i.test((e as Error).message) ? 'Konflik revisi. Muat ulang untuk melihat perubahan terbaru.' : (e as Error).message);}
    finally {setBusy(false);}
  };
  const publish = () => {
    if (!current || !assessment || !window.confirm('Publish this manual feedback to student?')) return;
    void (async () => {
      setBusy(true);
      try {await onAction('publishAssessment', buildPublishPayload({attemptId: current.attempt.id, assessmentRevision: assessment.revision || 0, attemptRevision: current.attempt.revision, settingsRevision: settings?.revision || 0})); setMessage('Feedback published.');}
      catch (e) {setMessage((e as Error).message);}
      finally {setBusy(false);}
    })();
  };

  return <section className="sc-card sr-workspace">
    <h2>Tinjau jawaban tugas</h2>
    <>
        <div className="sr-controls">
          <label>Tampilan <select value={mode} onChange={e => {if (guard()) setMode(e.target.value);}}><option>Per mahasiswa</option><option>Per kegiatan</option></select></label>
          {mode === 'Per kegiatan' && <label>Kegiatan <select value={activityId} onChange={e => {if (guard()) setActivityId(e.target.value);}}>{state.activities.filter(a => a.kind === 'assignment' || a.kind === 'exit_ticket').map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>}
          <label>Cari <input value={query} onChange={e => {if (guard()) setQuery(e.target.value);}} /></label>
          <label>Status <select value={filter} onChange={e => {if (guard()) setFilter(e.target.value);}}><option>Semua</option><option>Belum ditinjau</option><option>Belum lengkap</option><option>Sudah ditinjau</option></select></label>
        </div>
        <div className="sr-review-grid">
          <aside><h3>{mode}</h3><ul>{entries.map((entry, i) => <li key={entry.attempt.id}><button type="button" aria-current={i === index ? 'true' : undefined} onClick={() => selectEntry(i, entry.activity!.id)}>{entry.row?.name || entry.attempt.student} · {entry.activity?.title}</button></li>)}</ul></aside>
          <main>{current ? <>
            <div className="sr-nav"><button disabled={index === 0} onClick={() => selectEntry(index - 1)}>Sebelumnya</button><span>{index + 1} / {entries.length}</span><button disabled={index >= entries.length - 1} onClick={() => selectEntry(index + 1)}>Berikutnya</button></div>
            <h3>{current.row?.name || current.attempt.student} · {current.activity!.title}</h3>
            <p>{current.attempt.status === 'expired' ? 'Diselesaikan saat waktu habis' : 'Dikumpulkan'} · {current.attempt.complete ? 'Lengkap' : 'Belum lengkap'}</p>
            <pre className="sr-response">{formatScheduledResponse(current.activity, current.attempt)}</pre>
            <section className="sr-settings"><h4>Pengaturan penilaian</h4>
              <label>Mode penilaian <select value={settingsMode} disabled={Boolean(state.assessments?.some(a => a.activity === gradeActivityId))} onChange={e => setSettingsMode(e.target.value as typeof settingsMode)}><option value="ungraded">Tanpa nilai</option><option value="points">Poin</option><option value="rubric">Rubrik</option></select></label>
              <label>Nilai maksimum <input type="number" min="0" max="100000" value={maxPoints} disabled={Boolean(settings && state.assessments?.some(a => a.activity === gradeActivityId))} onChange={e => setMaxPoints(e.target.value)} /></label>
              {settingsMode === 'rubric' && !settings && <fieldset className="sr-criteria"><legend>Kriteria rubrik</legend>
                {criteria.map((c, i) => <div key={i} className="sr-criterion-row"><label>Id <input value={c.id} onChange={e => setCriteria(prev => prev.map((x, j) => j === i ? {...x, id: e.target.value} : x))} /></label><label>Label <input value={c.label} onChange={e => setCriteria(prev => prev.map((x, j) => j === i ? {...x, label: e.target.value} : x))} /></label><label>Max <input type="number" min="1" value={c.maxPoints} onChange={e => setCriteria(prev => prev.map((x, j) => j === i ? {...x, maxPoints: e.target.value} : x))} /></label><button type="button" onClick={() => setCriteria(prev => prev.filter((_, j) => j !== i))}>Hapus</button></div>)}
                <button type="button" onClick={() => setCriteria(prev => [...prev, {id: `c${prev.length + 1}`, label: `Criterion ${prev.length + 1}`, maxPoints: '5'}])}>Tambah kriteria</button>
              </fieldset>}
              <button disabled={busy || Boolean(state.assessments?.some(a => a.activity === gradeActivityId))} onClick={() => void saveSettings()}>Simpan pengaturan nilai</button>
            </section>
            <section className="sr-editor"><h4>Penilaian manual</h4>
              {settingsMode !== 'ungraded' && settings?.mode !== 'ungraded' && settingsMode !== 'rubric' && <label>Nilai <input type="number" min="0" max={settings?.maxPoints || maxPoints} value={draft.points} onChange={e => setDraft(d => ({...d, points: e.target.value}))} /></label>}
              <label>Feedback <textarea value={draft.feedback} maxLength={10000} onChange={e => setDraft(d => ({...d, feedback: e.target.value}))} /></label>
              {(settings?.mode === 'rubric' || (!settings && settingsMode === 'rubric')) && <fieldset className="sr-criteria"><legend>Nilai rubrik</legend>{criteriaPayload.map(c => <label key={c.id}>{c.label} (max {c.maxPoints})<input type="number" min="0" max={c.maxPoints} value={draft.criterionScores[c.id] || ''} onChange={e => setDraft(d => ({...d, criterionScores: {...d.criterionScores, [c.id]: e.target.value}}))} /></label>)}</fieldset>}
              <div className="sr-actions"><button disabled={busy} onClick={() => void saveGrade('draft')}>Simpan draf</button><button disabled={busy} onClick={() => void saveGrade('reviewed')}>Ditinjau</button><button disabled={busy} onClick={() => void saveGrade('reviewed', true)}>Simpan &amp; berikutnya</button>{assessment && <button disabled={busy || assessment.status !== 'reviewed'} onClick={publish}>Publish feedback</button>}</div>
            </section>
          </> : <p>Tidak ada jawaban terkirim yang sesuai dengan filter ini.</p>}</main>
        </div>
        {message && <p role="status">{message}</p>}
    </>
  </section>;
}
export default ScheduledReviewWorkspace;
