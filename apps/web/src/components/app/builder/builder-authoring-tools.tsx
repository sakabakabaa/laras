import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BookOpen, Sparkles } from 'lucide-react';
import { builderRequest, uid, type BuilderEnvelope, type BuilderRecord } from '@/lib/builder-document';
import { applyBuilderProposal, builderFromAiProposal, type ProposalOperation } from '@/lib/builder-authoring';
import { builderImportRequest, type BuilderImportJob } from '@/lib/builder-import';
import { scheduledAiRequest } from '@/lib/scheduled-class-ai-client';
import type { ScheduledAcademicContext, ScheduledAiProposal } from '@/lib/scheduled-class-ai';
import { BuilderPreview } from './builder-elements';
import { findLayoutGroup } from '@/lib/builder-layout';

type Tool = 'ai' | 'book';

export function useBuilderAuthoringTools({ id, draft, disabled, selectedActivityId, selectedBlockId, selectedGroupId, onApply }: {
	id: string; draft: BuilderEnvelope | null; disabled: boolean;
	selectedActivityId: string; selectedBlockId: string; selectedGroupId: string; onApply: (envelope: BuilderEnvelope, operation: ProposalOperation, targetActivityId: string) => void;
}) {
	const [params] = useSearchParams();
	const [tool, setTool] = useState<Tool | null>(() => params.get('tool') === 'book' ? 'book' : params.get('tool') === 'ai' ? 'ai' : null);
	const [context, setContext] = useState<ScheduledAcademicContext | null>(null);
	const [contextError, setContextError] = useState(''), [contextAttempt, setContextAttempt] = useState(0);
	const [instruction, setInstruction] = useState(''), [minutes, setMinutes] = useState(90);
	const [proposal, setProposal] = useState<{ source: BuilderEnvelope; stamp: string; targetId: string; blockId: string; groupId: string; label: string } | null>(null);
	const [operation, setOperation] = useState<ProposalOperation>('append');
	const [confirmReplace, setConfirmReplace] = useState(false);
	const [job, setJob] = useState<BuilderImportJob | null>(null);
	const [file, setFile] = useState<File | null>(null), [goal, setGoal] = useState('');
	const [busy, setBusy] = useState(false), [error, setError] = useState('');
	const [pollAttempt, setPollAttempt] = useState(0);
	const command = useRef(uid()), mounted = useRef(true), working = useRef(false);
	const importSnapshot = useRef<{ stamp: string; targetId: string; blockId: string; groupId: string } | null>(null);
	const current = useRef({ disabled, onApply, draft, selectedActivityId, selectedBlockId, selectedGroupId });
	current.current = { disabled, onApply, draft, selectedActivityId, selectedBlockId, selectedGroupId };
	const stamp = draft ? JSON.stringify(draft) : '';
	const proposalCurrent = Boolean(proposal && proposal.stamp === stamp && proposal.targetId === selectedActivityId && proposal.blockId === selectedBlockId && proposal.groupId === selectedGroupId);
	const meetingId = draft?.document.context.meetingId || '';
	const selectedActivity = draft?.document.activities.find(activity => activity.id === selectedActivityId);
	const selectedBlock = selectedActivity?.blocks.find(block => block.id === selectedBlockId);
	const selectedGroup = selectedActivity?.layout && selectedGroupId ? findLayoutGroup(selectedActivity.layout, selectedGroupId) : null;
	const selectionSummary = [selectedActivity?.title, selectedGroup?.title, selectedBlock ? 'elemen terpilih' : ''].filter(Boolean).join(' · ') || 'kegiatan saat ini';
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
			const captured = current.current;
			if (!captured.draft) return;
			const selectedBlockIds = captured.draft.document.activities.find(activity => activity.id === captured.selectedActivityId)?.blocks.some(block => block.id === captured.selectedBlockId) ? [captured.selectedBlockId] : [];
			const result = await scheduledAiRequest<{ proposal: ScheduledAiProposal }>(meetingId, 'generate', { builderId: id, minutes, instruction, selection: { activityId: captured.selectedActivityId, blockIds: selectedBlockIds, groupId: captured.selectedGroupId || undefined } });
			if (mounted.current && captured.draft && current.current.draft && JSON.stringify(current.current.draft) === JSON.stringify(captured.draft) && current.current.selectedActivityId === captured.selectedActivityId && current.current.selectedBlockId === captured.selectedBlockId && current.current.selectedGroupId === captured.selectedGroupId) {
				const source = builderFromAiProposal(result.proposal, captured.draft.document.context);
				setOperation('append'); setConfirmReplace(false);
				setProposal({ source, stamp: JSON.stringify(captured.draft), targetId: captured.selectedActivityId, blockId: captured.selectedBlockId, groupId: captured.selectedGroupId, label: result.proposal.draft.title });
			} else if (mounted.current) setError('Pilihan atau draf berubah saat AI bekerja. Buat usulan baru untuk konteks terbaru.');
		} catch (failure) { if (mounted.current) setError((failure as Error).message); }
		finally { working.current = false; if (mounted.current) setBusy(false); }
	};
	const upload = async () => {
		if (disabled || working.current || !draft || !file) return;
		importSnapshot.current = { stamp: JSON.stringify(draft), targetId: selectedActivityId, blockId: selectedBlockId, groupId: selectedGroupId };
		working.current = true; setBusy(true); setError('');
		try {
			if (file.size > 8 * 1024 * 1024) throw new Error('Pilih satu gambar maksimal 8 MB.');
			const form = new FormData();
			form.append('page', file); form.append('commandId', command.current);
			const activity = draft.document.activities.find(item => item.id === selectedActivityId);
			const blockIds = activity?.blocks.some(block => block.id === selectedBlockId) ? [selectedBlockId] : [];
			form.append('settings', JSON.stringify({ kind: draft.document.kind, context: draft.document.context, goal, builderId: id, selection: { activityId: selectedActivityId, blockIds, groupId: selectedGroupId || undefined } }));
			const next = await builderImportRequest<BuilderImportJob>(form);
			if (mounted.current) setJob(next);
		} catch (failure) { if (mounted.current) setError((failure as Error).message); }
		finally { working.current = false; if (mounted.current) setBusy(false); }
	};
	const apply = () => {
		if (disabled || working.current || !proposal || !proposalCurrent) return false;
		try {
			const next = structuredClone(current.current.draft!);
			applyBuilderProposal(next, proposal.source, operation, proposal.targetId);
			current.current.onApply(next, operation, proposal.targetId);
			setError(''); return true;
		}
		catch (failure) { setError((failure as Error).message); return false; }
	};
	const applyImport = async () => {
		if (!job?.documentId || disabled || working.current) return;
		working.current = true; setBusy(true); setError('');
		try {
			const source = await builderRequest<BuilderRecord>('get', { id: job.documentId });
			if (mounted.current) {
				if (current.current.disabled) throw new Error('Selesaikan pemulihan atau konflik draf sebelum menambahkan hasil.');
				const captured = importSnapshot.current;
				if (!captured) throw new Error('Konteks unggah tidak tersedia. Unggah ulang bahan.');
				setOperation('append'); setConfirmReplace(false);
				setProposal({ source, stamp: captured.stamp, targetId: captured.targetId, blockId: captured.blockId, groupId: captured.groupId, label: source.document.title });
			}
		} catch (failure) { if (mounted.current) setError((failure as Error).message); }
		finally { working.current = false; if (mounted.current) setBusy(false); }
	};
	if (!draft) return null;
	const pending = Boolean(job && ['queued', 'running'].includes(job.status));
	const replacementAvailable = proposal?.source.document.activities.length === 1;
	const activeTool = (next: Tool) => ({ 'aria-pressed': tool === next, className: tool === next ? 'bd-secondary is-active' : 'bd-secondary', onClick: () => setTool(tool === next ? null : next) });
	return <div className="bd-authoring-tools">
		<div className="bd-tool-switch" role="group" aria-label="Pilih bantuan">
			<button type="button" disabled={disabled} {...activeTool('ai')}><Sparkles size={16} />Buat dengan AI</button>
			<button type="button" disabled={disabled} {...activeTool('book')}><BookOpen size={16} />Unggah bahan</button>
		</div>
		{tool === 'ai' && <section className="bd-tool" aria-label="Buat dengan AI">
			{!meetingId ? <p className="bd-help">Pilih pertemuan agar AI dapat memakai konteks pembelajaran.</p> : contextError ? <p role="alert">{contextError} <button type="button" className="bd-secondary" onClick={() => setContextAttempt(value => value + 1)}>Muat ulang konteks</button></p> : !context ? <p role="status">Memuat konteks pertemuan…</p> : <>
				<p className="bd-help">Konteks otomatis: pertemuan dan {selectionSummary}.</p>
				<fieldset disabled={busy || disabled}>
					<label>Arahan tambahan (opsional)<textarea rows={3} maxLength={1500} value={instruction} onChange={event => setInstruction(event.target.value)} placeholder="Contoh: latihan singkat untuk tingkat A1" /></label>
					<details className="bd-tool-advanced"><summary>Pengaturan tambahan</summary><label>Total durasi (menit)<input type="number" min={10} max={240} value={minutes} onChange={event => setMinutes(Number(event.target.value))} /></label></details>
					<button type="button" className="bd-primary" onClick={() => void generate()} disabled={minutes < 10 || minutes > 240 || !Number.isInteger(minutes)}>{busy ? 'Menyiapkan…' : 'Buat usulan'}</button>
				</fieldset>
			</>}
		</section>}
		{tool === 'book' && <section className="bd-tool" aria-label="Unggah bahan">
			<p className="bd-help">Konteks otomatis: {selectionSummary}.</p>
			<fieldset disabled={busy || disabled || pending}>
				<label>Gambar halaman buku<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { setFile(event.target.files?.[0] || null); command.current = uid(); }} /></label>
				<p className="bd-help">Satu halaman PNG, JPG, atau WebP, maksimal 8 MB. AI memakai konteks pertemuan tanpa mengarang isi buku atau rekaman audio.</p>
				<label>Arahan tambahan (opsional)<textarea rows={2} value={goal} maxLength={2000} onChange={event => { setGoal(event.target.value); command.current = uid(); }} /></label>
				<button type="button" className="bd-secondary" disabled={!file} onClick={() => void upload()}>Baca halaman</button>
			</fieldset>
			{pending && <p role="status">AI sedang membaca halaman. Anda dapat tetap menyusun kelas.</p>}
			{job && <Link to={`/app/builder/impor/${job.id}`}>Lihat status dan laporan impor</Link>}
			{job?.status === 'failed' && <p role="alert">{job.error}</p>}
			{job?.status === 'ready' && <><p>{job.report.activityCount} kegiatan siap ditinjau. {job.report.missingMedia?.length || 0} media perlu dilengkapi.</p>{job.report.warnings?.map((warning, index) => <p className="bd-help" key={index}>{warning}</p>)}<button type="button" className="bd-primary" disabled={disabled || busy} onClick={() => void applyImport()}>Tinjau usulan</button></>}
		</section>}
		{proposal && <section className="bd-tool-proposal" aria-label="Pratinjau usulan"><h3>{proposal.label}</h3><label>Penempatan<select value={operation} onChange={event => { setOperation(event.target.value as ProposalOperation); setConfirmReplace(false); }}><option value="append">APPEND · akhir draf</option><option value="insert" disabled={!selectedActivityId}>INSERT · sebelum kegiatan terpilih</option><option value="replace" disabled={!selectedActivityId || !replacementAvailable}>REPLACE · isi kegiatan terpilih</option></select></label>{!replacementAvailable && <p className="bd-help">REPLACE hanya tersedia untuk usulan berisi tepat satu kegiatan. Gunakan APPEND atau INSERT untuk menerapkan semua kegiatan dalam pratinjau.</p>}{operation === 'replace' && <label><input type="checkbox" checked={confirmReplace} onChange={event => setConfirmReplace(event.target.checked)} /> Saya memahami seluruh isi kegiatan “{draft.document.activities.find(item => item.id === proposal.targetId)?.title || 'target tidak tersedia'}” akan diganti dengan isi satu kegiatan dalam pratinjau. Kegiatan lain dan jadwal tetap.</label>}<div className="bd-tool-preview"><BuilderPreview document={proposal.source.document} readOnly /></div><p className="bd-help">Pratinjau peserta tidak menampilkan kunci jawaban. Kunci AI perlu ditinjau sebelum diterbitkan.</p>{!proposalCurrent && <p role="alert">Pilihan atau draf berubah. Buat ulang usulan sebelum menerapkan.</p>}<button type="button" className="bd-primary" disabled={disabled || busy || !proposalCurrent || (operation === 'replace' && (!confirmReplace || !replacementAvailable))} onClick={() => { if (apply()) setProposal(null); }}>Terapkan {operation.toUpperCase()}</button><button type="button" className="bd-secondary" onClick={() => setProposal(null)}>Batal</button></section>}
		{job && tool !== 'book' && <p className="bd-help" role={job.status === 'failed' ? 'alert' : 'status'}>Impor buku: {pending ? 'sedang diproses' : job.status === 'ready' ? 'siap ditinjau' : job.status === 'failed' ? `gagal. ${job.error}` : 'selesai'}. Buka Unggah bahan untuk detail.</p>}
		{error && <p role="alert">{error}{pending && <button type="button" className="bd-secondary" onClick={() => setPollAttempt(value => value + 1)}>Muat ulang status</button>}</p>}
	</div>;
}
