import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BookOpen, Sparkles } from 'lucide-react';
import { builderRequest, uid, type BuilderEnvelope, type BuilderRecord } from '@/lib/builder-document';
import { builderFromAiProposal } from '@/lib/builder-authoring';
import { builderImportRequest, type BuilderImportJob } from '@/lib/builder-import';
import { scheduledAiRequest } from '@/lib/scheduled-class-ai-client';
import type { ScheduledAcademicContext, ScheduledAiProposal } from '@/lib/scheduled-class-ai';

export function useBuilderAuthoringTools({ id, draft, disabled, onApply, onManual }: {
	id: string; draft: BuilderEnvelope | null; disabled: boolean;
	onApply: (envelope: BuilderEnvelope) => void; onManual: () => void;
}) {
	const [params] = useSearchParams();
	const [context, setContext] = useState<ScheduledAcademicContext | null>(null);
	const [contextError, setContextError] = useState(''), [contextAttempt, setContextAttempt] = useState(0);
	const [instruction, setInstruction] = useState(''), [minutes, setMinutes] = useState(90);
	const [proposal, setProposal] = useState<ScheduledAiProposal | null>(null);
	const [job, setJob] = useState<BuilderImportJob | null>(null), [imported, setImported] = useState(false);
	const [file, setFile] = useState<File | null>(null), [goal, setGoal] = useState('');
	const [busy, setBusy] = useState(false), [error, setError] = useState('');
	const [pollAttempt, setPollAttempt] = useState(0);
	const command = useRef(uid()), mounted = useRef(true), working = useRef(false);
	const current = useRef({ disabled, onApply });
	current.current = { disabled, onApply };
	const meetingId = draft?.document.context.meetingId || '';
	useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
	useEffect(() => {
		if (!meetingId) return;
		let active = true;
		setContext(null); setContextError('');
		void scheduledAiRequest<{ context: ScheduledAcademicContext }>(meetingId, 'context', { builderId: id }).then(result => {
			if (!active) return;
			setContext(result.context);
			const duration = Number.parseInt(result.context.session.duration, 10);
			setMinutes(Number.isFinite(duration) && duration >= 10 && duration <= 240 ? duration : 90);
		}).catch(failure => { if (active) setContextError((failure as Error).message); });
		return () => { active = false; };
	}, [id, meetingId, contextAttempt]);
	useEffect(() => {
		if (!job || !['queued', 'running'].includes(job.status)) return;
		let active = true;
		const timer = window.setTimeout(() => {
			void builderImportRequest<BuilderImportJob>({ action: 'get', id: job.id }).then(next => {
				if (active) { setJob(next); setError(''); }
			}).catch(failure => { if (active) setError((failure as Error).message); });
		}, 3000);
		return () => { active = false; window.clearTimeout(timer); };
	}, [job, pollAttempt]);
	const generate = async () => {
		if (disabled || working.current || !context) return;
		working.current = true; setBusy(true); setError('');
		try {
			const result = await scheduledAiRequest<{ proposal: ScheduledAiProposal }>(meetingId, 'generate', { builderId: id, minutes, instruction });
			if (mounted.current) setProposal(result.proposal);
		} catch (failure) { if (mounted.current) setError((failure as Error).message); }
		finally { working.current = false; if (mounted.current) setBusy(false); }
	};
	const upload = async () => {
		if (disabled || working.current || !draft || !file) return;
		working.current = true; setBusy(true); setError('');
		try {
			if (file.size > 8 * 1024 * 1024) throw new Error('Pilih satu gambar maksimal 8 MB.');
			const form = new FormData();
			form.append('page', file); form.append('commandId', command.current);
			form.append('settings', JSON.stringify({ kind: draft.document.kind, context: draft.document.context, goal }));
			const next = await builderImportRequest<BuilderImportJob>(form);
			if (mounted.current) { setJob(next); setImported(false); }
		} catch (failure) { if (mounted.current) setError((failure as Error).message); }
		finally { working.current = false; if (mounted.current) setBusy(false); }
	};
	const apply = (source: BuilderEnvelope) => {
		if (disabled || working.current) return false;
		try { current.current.onApply(source); setError(''); return true; }
		catch (failure) { setError((failure as Error).message); return false; }
	};
	const applyImport = async () => {
		if (!job?.documentId || disabled || working.current || imported) return;
		working.current = true; setBusy(true); setError('');
		try {
			const source = await builderRequest<BuilderRecord>('get', { id: job.documentId });
			if (mounted.current) {
				if (current.current.disabled) throw new Error('Selesaikan pemulihan atau konflik draf sebelum menambahkan hasil.');
				current.current.onApply(source); setImported(true);
			}
		} catch (failure) { if (mounted.current) setError((failure as Error).message); }
		finally { working.current = false; if (mounted.current) setBusy(false); }
	};
	if (!draft) return null;
	const pending = Boolean(job && ['queued', 'running'].includes(job.status));
	return <div className="bd-authoring-tools">
		<h2>Susun kelas Anda</h2>
		{context && <p className="bd-help"><strong>{context.course.title}</strong><br />{context.session.title}</p>}
		<p>Mulai menulis sendiri atau minta bantuan. Semua hasil masuk sebagai draf yang bisa diedit.</p>
		<button type="button" className="bd-secondary" disabled={disabled} onClick={onManual}>Tambah teks atau pertanyaan</button>
		<details>
			<summary><Sparkles size={16} />Bantu susun dengan AI</summary>
			{!meetingId ? <p>Pilih pertemuan agar AI dapat memakai konteks pembelajaran.</p> : contextError ? <p role="alert">{contextError} <button type="button" className="bd-secondary" onClick={() => setContextAttempt(value => value + 1)}>Muat ulang konteks</button></p> : !context ? <p role="status">Memuat konteks pertemuan…</p> : <>
				<p><strong>{context.course.title}</strong><br />{context.session.topic || context.session.title}</p>
				<p className="bd-help">AI otomatis memakai topik, indikator, capaian, dan materi pertemuan yang sudah disetujui. Anda tidak perlu memilih ulang konteks.</p>
				<fieldset disabled={busy || disabled}>
					<label>Arahan tambahan (opsional)<textarea rows={3} maxLength={1500} value={instruction} onChange={event => setInstruction(event.target.value)} placeholder="Contoh: latihan singkat untuk tingkat A1" /></label>
					<details><summary>Atur durasi</summary><label>Total durasi (menit)<input type="number" min={10} max={240} value={minutes} onChange={event => setMinutes(Number(event.target.value))} /></label></details>
					<button type="button" className="bd-primary" onClick={() => void generate()} disabled={minutes < 10 || minutes > 240 || !Number.isInteger(minutes)}>{busy ? 'Menyiapkan…' : 'Susun dari pertemuan'}</button>
				</fieldset>
			</>}
			{proposal && <section className="bd-tool-proposal" aria-label="Usulan AI"><h3>{proposal.draft.title}</h3><p>{proposal.draft.instructions}</p><ol>{proposal.draft.activities.map((activity, index) => <li key={index}>{activity.title} · {activity.minutes} menit</li>)}</ol>{proposal.draft.notes.map((note, index) => <p key={index} className="bd-help">{note}</p>)}<p className="bd-help">Tambahkan ke draf tanpa mengganti kegiatan yang sudah ada. Kunci AI harus ditinjau sebelum diterbitkan.</p><button type="button" className="bd-primary" disabled={disabled || busy} onClick={() => { if (apply(builderFromAiProposal(proposal, draft.document.context))) setProposal(null); }}>Tambahkan ke kelas</button></section>}
		</details>
		<details open={params.get('tool') === 'book' || undefined}>
			<summary><BookOpen size={16} />Unggah halaman buku</summary>
			<fieldset disabled={busy || disabled || pending}>
				<label>Gambar halaman buku<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { setFile(event.target.files?.[0] || null); command.current = uid(); }} /></label>
				<p className="bd-help">Satu halaman PNG, JPG, atau WebP, maksimal 8 MB. AI memakai konteks pertemuan tanpa mengarang isi buku atau rekaman audio.</p>
				<label>Arahan tambahan (opsional)<textarea rows={2} value={goal} maxLength={2000} onChange={event => { setGoal(event.target.value); command.current = uid(); }} /></label>
				<button type="button" className="bd-secondary" disabled={!file} onClick={() => void upload()}>Baca halaman</button>
			</fieldset>
			{pending && <p role="status">AI sedang membaca halaman. Anda dapat tetap menyusun kelas.</p>}
			{job && <Link to={`/app/builder/impor/${job.id}`}>Lihat status dan laporan impor</Link>}
			{job?.status === 'failed' && <p role="alert">{job.error}</p>}
			{job?.status === 'ready' && <><p>{job.report.activityCount} kegiatan siap ditinjau. {job.report.missingMedia?.length || 0} media perlu dilengkapi.</p>{job.report.warnings?.map((warning, index) => <p className="bd-help" key={index}>{warning}</p>)}<button type="button" className="bd-primary" disabled={disabled || busy || imported} onClick={() => void applyImport()}>{imported ? 'Sudah ditambahkan' : 'Tambahkan ke kelas'}</button></>}
		</details>
		{error && <p role="alert">{error}{pending && <button type="button" className="bd-secondary" onClick={() => setPollAttempt(value => value + 1)}>Muat ulang status</button>}</p>}
	</div>;
}
