import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, FileAudio, LoaderCircle, RotateCcw, ScrollText } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { requestTranscription, type TranscriptStatus } from '@/lib/transcription';

/**
 * Speaking-task Phase 2 — shows the transcript of a speaking submission's
 * audio with clear processing / completed / failed / retry states.
 *
 * The transcript is produced server-side; this panel only reads the
 * `transcript*` fields from the submission record (polling while a
 * transcription is in flight) and offers a retry when it failed. Used by both
 * the student workspace and the lecturer evaluation view.
 */
export function TranscriptPanel({
	submissionId,
	initialStatus,
	initialTranscript,
	initialError,
	initialFile,
	onReady,
}: {
	submissionId: string;
	initialStatus: TranscriptStatus;
	initialTranscript: string;
	initialError: string;
	initialFile: string;
	/** Fires once when a fresh transcript becomes ready (Phase 5 formative loop). */
	onReady?: (transcript: string) => void;
}) {
	const [status, setStatus] = useState<TranscriptStatus>(initialStatus);
	const [transcript, setTranscript] = useState(initialTranscript);
	const [error, setError] = useState(initialError);
	const [audioFile, setAudioFile] = useState(initialFile);
	const [retrying, setRetrying] = useState(false);
	const [timedOut, setTimedOut] = useState(false);
	const autoRetried = useRef(false);

	// Re-sync from the submission prop whenever the parent reloads it.
	useEffect(() => {
		setStatus(initialStatus);
		setTranscript(initialTranscript);
		setError(initialError);
		setAudioFile(initialFile);
	}, [initialStatus, initialTranscript, initialError, initialFile, submissionId]);

	// Keep the latest onReady handler without re-subscribing the poller.
	const onReadyRef = useRef(onReady);
	onReadyRef.current = onReady;
	// Guards onReady from firing twice for the same transcript text.
	const lastFiredRef = useRef('');

	// Poll the submission record while a transcription is in flight, so the
	// student/lecturer sees the result without a manual reload. A hard 3-minute
	// cap stops the poller and surfaces a failed + retry state with a timeout
	// message, so the UI never spins indefinitely.
	useEffect(() => {
		if (status !== 'pending' && status !== 'processing') return;
		let alive = true;
		const startedAt = Date.now();
		const POLL_CAP_MS = 3 * 60 * 1000;
		const poll = async () => {
			if (Date.now() - startedAt >= POLL_CAP_MS) {
				if (!alive) return;
				setTimedOut(true);
				setStatus('failed');
				setError(
					'Transkripsi memakan waktu terlalu lama (lebih dari 3 menit). Coba lagi, atau dosen dapat meninjau audio secara langsung.',
				);
				return;
			}
			try {
				const row = await pb.collection('assignment_submissions').getOne<{
					transcript?: string;
					transcriptStatus?: TranscriptStatus;
					transcriptError?: string;
					transcriptFile?: string;
				}>(submissionId, { requestKey: `transcript-${submissionId}` });
				if (!alive) return;
				const next = (row.transcriptStatus || '') as TranscriptStatus;
				const text = row.transcript || '';
				setStatus(next);
				setTranscript(text);
				setError(row.transcriptError || '');
				setAudioFile(row.transcriptFile || '');
				if (next === 'ready' && text && lastFiredRef.current !== text) {
					lastFiredRef.current = text;
					onReadyRef.current?.(text);
				}
			} catch {
				/* transient — the next tick retries */
			}
		};
		const interval = window.setInterval(poll, 3000);
		const quick = window.setTimeout(poll, 1500);
		return () => {
			alive = false;
			window.clearInterval(interval);
			window.clearTimeout(quick);
		};
	}, [status, submissionId]);

	const retry = async () => {
		setRetrying(true);
		setTimedOut(false);
		setStatus('pending');
		setError('');
		await requestTranscription(submissionId);
		setRetrying(false);
	};

	// A failed transcript is retried once per visit so a fixed service can
	// finish the recording the student already saved. It does not touch the audio.
	useEffect(() => {
		if (autoRetried.current || initialStatus !== 'failed') return;
		autoRetried.current = true;
		setTimedOut(false);
		setStatus('pending');
		setError('');
		void requestTranscription(submissionId);
	}, [initialStatus, submissionId]);

	if (!status) {
		return (
			<div className="tws-transcript">
				<p className="tws-transcript-hint">
					Transkrip belum dibuat dari rekaman ini. Transkripsi tidak mengubah rekaman atau nilai.
				</p>
				<Button
					variant="ghost"
					type="button"
					className="ld-outline-action sm"
					onClick={() => void retry()}
					disabled={retrying}
				>
					<RotateCcw size={13} /> Buat transkrip
				</Button>
			</div>
		);
	}

	const busy = status === 'pending' || status === 'processing' || retrying;

	return (
		<div className="tws-transcript">
			<div className="tws-transcript-head" aria-live="polite" aria-atomic="true">
				<span className="tws-transcript-title">
					<ScrollText size={14} /> Transkripsi audio
				</span>
				{busy && (
					<span className="tws-transcript-live">
						<LoaderCircle size={13} className="spin" />{' '}
						{status === 'pending' ? 'Menunggu transkripsi…' : 'Mentranskripsi audio…'}
					</span>
				)}
				{status === 'ready' && <span className="tws-transcript-done">Transkrip siap</span>}
				{status === 'failed' && <span className="tws-transcript-failed-tag">Gagal</span>}
			</div>

			{busy && (
				<p className="tws-transcript-hint">
					Rekaman audio Anda sedang ditranskripsi otomatis oleh layanan transkripsi. Proses ini
					berjalan di latar belakang. Anda dapat menunggu di sini atau kembali nanti.
				</p>
			)}

			{status === 'ready' && (
				<div className="tws-transcript-body">
					{audioFile && (
						<small className="tws-transcript-source">
							<FileAudio size={12} /> {audioFile}
						</small>
					)}
					<p className="tws-transcript-text">{transcript || '(Transkrip kosong.)'}</p>
				</div>
			)}

			{status === 'failed' && (
				<div className="tws-transcript-error" role="alert">
					<p>
						<AlertCircle size={14} />{' '}
						{error || 'Transkripsi gagal. Coba lagi, atau dosen dapat meninjau audio secara langsung.'}
					</p>
					<Button
						variant="ghost"
						type="button"
						className="ld-outline-action sm"
						onClick={() => void retry()}
						disabled={retrying}
						aria-label={timedOut ? 'Coba transkripsi ulang setelah waktu habis' : 'Coba transkripsi ulang'}
					>
						<RotateCcw size={13} /> Coba transkripsi ulang
					</Button>
				</div>
			)}
		</div>
	);
}
