import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileAudio, LoaderCircle, Mic, Save, Send, X } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import { errorMessage } from '@/lib/learning';
import {
	isPastDeadline,
	submissionFileUrl,
	uploadSubmission,
	type Assignment,
	type AssignmentSubmission,
} from '@/lib/assignments';
import { parseSpeakingConfig } from '@/lib/task-types';
import { validateFile } from '@/lib/resources';
import { requestEvaluationDraft } from '@/lib/ai-evaluation';
import { requestTranscription } from '@/lib/transcription';
import { CheckAnswerPanel } from '@/components/app/task-workspaces/check-answer-panel';
import { TranscriptPanel } from '@/components/app/task-workspaces/transcript-panel';
import { AudioRecorder, type RecordedClip } from '@/components/app/audio-recorder';
import { confirmDialog } from '@/components/confirm-dialog';

const AUDIO_RE = /\.(webm|mp4|m4a|mp3|wav|ogg|aac|flac)$/i;
const isAudioName = (name: string) => AUDIO_RE.test(name);

/** A pending or already-stored audio clip shown with a player + remove control. */
type ClipRow = {
	key: string;
	name: string;
	url?: string;
	pending?: boolean;
};

/** Student speaking / role-play workspace. Evidence only — no auto grade. */
export function SpeakingWorkspace({
	assignment,
	submission,
	onSaved,
}: {
	assignment: Assignment;
	submission: AssignmentSubmission | null;
	onSaved: () => void;
}) {
	const config = parseSpeakingConfig(assignment.taskConfig);
	const closed =
		assignment.status !== 'published' ||
		(isPastDeadline(assignment.deadline) && submission?.status !== 'revision');
	// Draft saving and Cek jawaban are only for work not yet finally collected.
	const finallySubmitted = Boolean(
		submission && submission.status !== 'draft' && submission.status !== 'revision',
	);
	const [content, setContent] = useState(submission?.content || '');
	const [link, setLink] = useState(submission?.link || '');
	const [group, setGroup] = useState(submission?.group || '');
	const [files, setFiles] = useState<File[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);
	const accept = [
		config.allowAudio ? 'audio/*' : '',
		config.allowVideo ? 'video/*' : '',
	]
		.filter(Boolean)
		.join(',');

	// Audio clips: pending (just recorded/uploaded, not yet saved) + already
	// stored on the submission row. Non-audio uploads stay in the generic
	// file list below.
	const audioClips = useMemo<ClipRow[]>(() => {
		const stored: ClipRow[] = submission
			? (submission.files || [])
					.filter(isAudioName)
					.map((name) => ({
						key: `kept-${name}`,
						name,
						url: submissionFileUrl(submission, name),
					}))
			: [];
		const pending = files.filter((f) => isAudioName(f.name)).map((f, i) => ({
			key: `new-${f.name}-${i}`,
			name: f.name,
			pending: true,
		}));
		return [...stored, ...pending];
	}, [submission, files]);

	const nonAudioFiles = useMemo(() => files.filter((f) => !isAudioName(f.name)), [files]);

	const removePendingAudio = (name: string) => {
		setFiles((prev) => prev.filter((f) => f.name !== name));
	};

	const onRecorded = (clip: RecordedClip) => {
		setError('');
		setFiles((prev) => [...prev, clip.file].slice(0, 5));
	};

	const save = async (event: React.FormEvent, final = true) => {
		event.preventDefault();
		setError('');
		if (
			final &&
			!(await confirmDialog({
				title: 'Kumpulkan tugas?',
				message: 'Kumpulkan versi terakhir ini sebagai pengumpulan resmi? Setelah terkirim, Cek jawaban ditutup dan hasil menunggu penilaian dosen.',
				variant: 'default',
				confirmLabel: 'Kumpulkan',
			}))
		) {
			return;
		}
		if (assignment.mode === 'collaborative' && !group.trim()) {
			setError('Isi nama kelompok. Pengumpulan kelompok memakai satu identitas bersama.');
			return;
		}
		if (!content.trim() && !link.trim() && files.length === 0 && !(submission?.files?.length)) {
			setError(
				final
					? 'Rekam atau unggah audio, tempel tautan, atau tulis catatan sebelum mengumpulkan.'
					: 'Rekam atau unggah audio, tempel tautan, atau tulis catatan sebelum menyimpan draf.',
			);
			return;
		}
		setBusy(true);
		try {
			const fd = new FormData();
			fd.set('content', content.trim());
			fd.set('link', link.trim());
			fd.set('group', group.trim());
			fd.set(
				'status',
				final ? (isPastDeadline(assignment.deadline) ? 'late' : 'submitted') : 'draft',
			);
			if (submission) {
				for (const name of submission.files || []) fd.append('files', name);
			} else {
				fd.set('assignment', assignment.id);
				fd.set('owner', pb.authStore.record?.id || '');
			}
			for (const file of files) fd.append('files', file);
			const record = await uploadSubmission(fd, { id: submission?.id });
			invalidate('assignment_submissions');
			// Background AI evaluation draft for the lecturer (formal tasks only —
			// the endpoint skips Latihan formatif). The submission is already
			// stored, so a failed analysis never affects it.
			if (final) void requestEvaluationDraft(record.id);
			// Phase 2 — transcribe the speaking audio through the Whisper service.
			// Fire-and-forget: a failed/unavailable transcription never affects the
			// submission, and the endpoint is idempotent so draft re-saves are safe.
			if ((record.files || []).some(isAudioName)) {
				void requestTranscription(record.id);
			}
			onSaved();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="tws-workspace">
			<div className="tws-meta">
				<span className="tws-chip">
					<Mic size={12} /> Berbicara
				</span>
				{config.durationMin > 0 && <span className="tws-chip">Saran {config.durationMin} menit</span>}
				{config.language && <span className="tws-chip">{config.language}</span>}
			</div>
			{config.prompt && <p className="tws-prompt">{config.prompt}</p>}
			{config.criteria.length > 0 && (
				<ul className="tws-details">
					{config.criteria.map((c) => (
						<li key={c.id} className="manual">
							<span />
							<div>
								<strong>{c.label}</strong>
								<small>Bobot relatif {c.weight} (dinilai dosen)</small>
							</div>
						</li>
					))}
				</ul>
			)}
			{closed ? (
				<p className="tws-notice">Pengumpulan tugas ini sudah ditutup.</p>
			) : (
				<form className="asg-form" onSubmit={(e) => void save(e)}>
					{assignment.mode === 'collaborative' && (
						<label>
							Nama kelompok
							<input
								value={group}
								onChange={(e) => setGroup(e.target.value)}
								maxLength={200}
								required
							/>
						</label>
					)}
					<label>
						Catatan
						<textarea
							rows={3}
							value={content}
							onChange={(e) => setContent(e.target.value)}
							maxLength={10000}
						/>
					</label>
					{config.allowLink && (
						<label>
							Tautan rekaman
							<input
								type="url"
								value={link}
								onChange={(e) => setLink(e.target.value)}
								placeholder="https://"
							/>
						</label>
					)}

					{config.allowAudio && (
						<div className="tws-audio-section">
							<AudioRecorder onClip={onRecorded} />
							{audioClips.length > 0 && (
								<div className="tws-clips">
									<span className="tws-clips-label">Rekaman & audio</span>
									<ul className="tws-clip-list">
										{audioClips.map((clip) => (
											<li key={clip.key} className="tws-clip">
												<FileAudio size={14} />
												<div className="tws-clip-body">
													<strong>{clip.name}</strong>
													{clip.pending ? (
														<span className="tws-clip-pending">Belum tersimpan, kumpulkan untuk menyimpan</span>
													) : (
														clip.url && <audio controls src={clip.url} className="tws-clip-audio" />
													)}
												</div>
												{clip.pending && (
													<Button variant="ghost"
														type="button"
														className="tws-clip-remove"
														aria-label={`Hapus ${clip.name}`}
														onClick={() => removePendingAudio(clip.name)}
													>
														<X size={13} />
													</Button>
												)}
											</li>
										))}
									</ul>
								</div>
							)}
						</div>
					)}

					{(config.allowAudio || config.allowVideo) && (
						<div className="tws-upload">
							<input
								ref={inputRef}
								type="file"
								accept={accept || undefined}
								className="pdf-file-input"
								onChange={(e) => {
									const file = e.target.files?.[0];
									e.target.value = '';
									if (!file) return;
									const v = validateFile(file);
									if (v) {
										setError(v);
										return;
									}
									setFiles((prev) => [...prev, file].slice(0, 5));
								}}
							/>
							<Button variant="ghost"
								type="button"
								className="ld-outline-action sm"
								onClick={() => inputRef.current?.click()}
							>
								Unggah berkas audio / video
							</Button>
							{nonAudioFiles.map((f) => (
								<span key={f.name} className="asg-file-chip">
									{f.name}
									<Button variant="ghost"
										type="button"
										aria-label={`Hapus ${f.name}`}
										onClick={() => removePendingAudio(f.name)}
									>
										<X size={12} />
									</Button>
								</span>
							))}
						</div>
					)}
					{error && (
						<p className="form-error" role="alert">
							{error}
						</p>
					)}
					<div className="tws-actions">
						{!finallySubmitted && (
							<Button variant="ghost"
								type="button"
								className="ld-outline-action sm"
								onClick={(e) => void save(e, false)}
								disabled={busy}
							>
								{busy ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />} Simpan draf
							</Button>
						)}
						<Button variant="ghost" type="submit" className="ld-btn-primary" disabled={busy}>
							{busy ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}
							Kumpulkan
						</Button>
					</div>
				</form>
			)}
			{submission && (submission.transcriptStatus || (submission.files || []).some(isAudioName)) ? (
				<TranscriptPanel
					submissionId={submission.id}
					initialStatus={submission.transcriptStatus || ''}
					initialTranscript={submission.transcript || ''}
					initialError={submission.transcriptError || ''}
					initialFile={submission.transcriptFile || ''}
				/>
			) : null}
			{!closed && !finallySubmitted && (
				<CheckAnswerPanel
					assignment={assignment}
					channel="enrolled"
					buildResponse={() => ({ kind: 'speaking', content, link })}
					onApplyOcrText={(t) => setContent(t)}
				/>
			)}
		</div>
	);
}
