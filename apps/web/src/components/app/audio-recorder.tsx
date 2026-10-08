import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, Mic, MicOff, RotateCcw, Square, Trash2 } from 'lucide-react';

/**
 * Preferred recording mime types in order. MediaRecorder support varies by
 * browser: Chromium/Firefox produce `audio/webm`, Safari produces
 * `audio/mp4`. We pick the first one the browser can actually record.
 */
const PREFERRED_MIME = [
	'audio/webm;codecs=opus',
	'audio/webm',
	'audio/mp4',
	'audio/ogg;codecs=opus',
	'audio/ogg',
];

const pickSupportedMime = (): string => {
	if (typeof MediaRecorder === 'undefined') return '';
	for (const mime of PREFERRED_MIME) {
		try {
			if (MediaRecorder.isTypeSupported(mime)) return mime;
		} catch {
			/* isTypeSupported can throw on some browsers */
		}
	}
	return '';
};

const extFor = (mime: string): string => {
	if (mime.includes('wav')) return 'wav';
	if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
	if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
	if (mime.includes('ogg')) return 'ogg';
	if (mime.includes('flac')) return 'flac';
	// Unknown recorder output still needs an extension the transcript pipeline recognizes.
	return 'webm';
};

const pad = (n: number) => String(n).padStart(2, '0');

/** mm:ss from elapsed seconds. */
const formatDuration = (seconds: number) => {
	const s = Math.max(0, Math.floor(seconds));
	return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};

export type RecordedClip = {
	file: File;
	url: string;
	duration: number;
};

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'recorded' | 'error';

/**
 * Browser-based audio recorder for the Speaking task answer flow (Phase 1).
 *
 * - Requests microphone permission via getUserMedia.
 * - Records with MediaRecorder, showing a live timer and clear states.
 * - On stop, produces a File (with a real mime type + extension) plus an
 *   object URL for preview playback.
 * - Handles permission denial, no-microphone, and unsupported-browser
 *   failures with an Indonesian message and a retry button.
 *
 * The produced File is handed to the parent, which stores it through the
 * existing submission upload — no transcription or transcription-service wiring here.
 */
export function AudioRecorder({
	onClip,
	maxSeconds = 600,
}: {
	onClip: (clip: RecordedClip) => void;
	/** Hard cap to avoid runaway recordings (default 10 minutes). */
	maxSeconds?: number;
}) {
	const supported = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
	const [state, setState] = useState<RecorderState>('idle');
	const [error, setError] = useState('');
	const [elapsed, setElapsed] = useState(0);
	const remaining = maxSeconds - elapsed;
	const showCountdown = remaining < 15 && remaining > 0;

	const mediaRef = useRef<MediaStream | null>(null);
	const recorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const mimeRef = useRef('');
	const startedAtRef = useRef(0);
	const timerRef = useRef<number | null>(null);
	const maxTimerRef = useRef<number | null>(null);
	const urlRef = useRef<string>('');
	const audioCtxRef = useRef<AudioContext | null>(null);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
	const rafRef = useRef<number | null>(null);
	const [level, setLevel] = useState(0);

	const stopTimer = () => {
		if (timerRef.current !== null) {
			window.clearInterval(timerRef.current);
			timerRef.current = null;
		}
		if (maxTimerRef.current !== null) {
			window.clearTimeout(maxTimerRef.current);
			maxTimerRef.current = null;
		}
	};

	const stopStream = () => {
		const stream = mediaRef.current;
		if (stream) {
			for (const track of stream.getTracks()) {
				try {
					track.stop();
				} catch {
					/* ignore */
				}
			}
		}
		mediaRef.current = null;
	};

	/** Tears down the Web Audio analyser used for the live input-level meter. */
	const stopLevelMeter = () => {
		if (rafRef.current !== null) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		}
		if (sourceRef.current) {
			try {
				sourceRef.current.disconnect();
			} catch {
				/* ignore */
			}
			sourceRef.current = null;
		}
		if (analyserRef.current) {
			try {
				analyserRef.current.disconnect();
			} catch {
				/* ignore */
			}
			analyserRef.current = null;
		}
		if (audioCtxRef.current) {
			try {
				void audioCtxRef.current.close();
			} catch {
				/* ignore */
			}
			audioCtxRef.current = null;
		}
		setLevel(0);
	};

	/** Builds an AnalyserNode on the active mic stream and drives the level bar. */
	const startLevelMeter = (stream: MediaStream) => {
		try {
			const AudioCtx =
				window.AudioContext ||
				(window as unknown as { webkitAudioContext?: typeof AudioContext })
					.webkitAudioContext;
			if (!AudioCtx) return;
			const ctx = new AudioCtx();
			const source = ctx.createMediaStreamSource(stream);
			const analyser = ctx.createAnalyser();
			analyser.fftSize = 256;
			analyser.smoothingTimeConstant = 0.8;
			source.connect(analyser);
			audioCtxRef.current = ctx;
			analyserRef.current = analyser;
			sourceRef.current = source;
			const data = new Uint8Array(analyser.frequencyBinCount);
			const tick = () => {
				const an = analyserRef.current;
				if (!an) return;
				an.getByteTimeDomainData(data);
				let sum = 0;
				for (let i = 0; i < data.length; i++) {
					const v = (data[i] - 128) / 128;
					sum += v * v;
				}
				const rms = Math.sqrt(sum / data.length);
				setLevel(Math.min(1, rms * 2.2));
				rafRef.current = requestAnimationFrame(tick);
			};
			rafRef.current = requestAnimationFrame(tick);
		} catch {
			/* level meter is optional — recording continues without it */
		}
	};

	// Clean up all resources on unmount.
	useEffect(() => {
		return () => {
			stopTimer();
			stopLevelMeter();
			if (urlRef.current) URL.revokeObjectURL(urlRef.current);
			stopStream();
			if (recorderRef.current && recorderRef.current.state !== 'inactive') {
				try {
					recorderRef.current.stop();
				} catch {
					/* ignore */
				}
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const fail = (message: string) => {
		stopTimer();
		stopLevelMeter();
		stopStream();
		setState('error');
		setError(message);
	};

	const startTimer = () => {
		startedAtRef.current = Date.now();
		setElapsed(0);
		timerRef.current = window.setInterval(() => {
			setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
		}, 500);
		maxTimerRef.current = window.setTimeout(() => {
			const rec = recorderRef.current;
			if (rec && rec.state !== 'inactive') {
				try {
					rec.stop();
				} catch {
					/* ignore */
				}
			}
		}, maxSeconds * 1000);
	};

	const startRecording = async () => {
		setError('');
		if (!supported) {
			fail('Browser ini tidak mendukung perekaman audio. Unggah berkas audio sebagai gantinya.');
			return;
		}
		setState('requesting');
		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: { echoCancellation: true, noiseSuppression: true },
				video: false,
			});
		} catch (err) {
			const name = (err as { name?: string })?.name || '';
			if (name === 'NotAllowedError' || name === 'SecurityError') {
				fail('Izin mikrofon ditolak. Aktifkan izin mikrofon di browser, lalu coba lagi.');
			} else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
				fail('Tidak ada mikrofon yang terdeteksi pada perangkat ini.');
			} else if (name === 'NotReadableError') {
				fail('Mikrofon sedang dipakai aplikasi lain. Tutup aplikasi itu lalu coba lagi.');
			} else {
				fail('Tidak dapat mengakses mikrofon. Coba lagi atau unggah berkas audio.');
			}
			return;
		}

		const mime = pickSupportedMime();
		mimeRef.current = mime;
		mediaRef.current = stream;

		let recorder: MediaRecorder;
		try {
			recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
		} catch {
			stopStream();
			fail('Perekaman tidak dapat dimulai pada perangkat ini. Unggah berkas audio sebagai gantinya.');
			return;
		}
		recorderRef.current = recorder;
		chunksRef.current = [];

		recorder.ondataavailable = (e) => {
			if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
		};
		recorder.onerror = () => {
			fail('Perekaman terhenti karena gangguan. Coba lagi.');
		};
		recorder.onstop = () => {
			stopLevelMeter();
			const blob = new Blob(chunksRef.current, {
				type: mime || chunksRef.current[0]?.type || 'audio/webm',
			});
			stopStream();
			stopTimer();
			if (blob.size === 0) {
				fail('Rekaman kosong. Coba lagi dan bicara ke mikrofon.');
				return;
			}
			const ext = extFor(mime);
			const stamp = new Date()
				.toISOString()
				.replace(/[:.]/g, '-')
				.slice(0, 19);
			const file = new File([blob], `rekaman-${stamp}.${ext}`, { type: blob.type });
			if (urlRef.current) URL.revokeObjectURL(urlRef.current);
			const url = URL.createObjectURL(blob);
			urlRef.current = url;
			const duration = Math.floor((Date.now() - startedAtRef.current) / 1000);
			setState('recorded');
			onClip({ file, url, duration });
		};

		try {
			recorder.start();
		} catch {
			stopStream();
			fail('Perekaman tidak dapat dimulai. Coba lagi atau unggah berkas audio.');
			return;
		}
		setState('recording');
		startTimer();
		startLevelMeter(stream);
	};

	const stopRecording = () => {
		const recorder = recorderRef.current;
		if (!recorder || recorder.state === 'inactive') return;
		try {
			recorder.stop();
		} catch {
			/* ignore */
		}
	};

	const reset = () => {
		stopTimer();
		stopLevelMeter();
		stopStream();
		if (urlRef.current) {
			URL.revokeObjectURL(urlRef.current);
			urlRef.current = '';
		}
		recorderRef.current = null;
		chunksRef.current = [];
		setElapsed(0);
		setError('');
		setState('idle');
	};

	if (!supported && state === 'idle') {
		return (
			<div className="ar-box ar-unsupported">
				<AlertCircle size={16} />
				<span>Browser ini tidak mendukung perekaman audio. Unggah berkas audio di bawah.</span>
			</div>
		);
	}

	return (
		<div className="ar-box">
			<div className="ar-head" aria-live="polite" aria-atomic="true">
				<span className="ar-title">
					<Mic size={14} /> Rekam jawaban
				</span>
				{state === 'recording' && (
					<span className="ar-live" aria-hidden="true">
						<span className="ar-dot" /> Merekam · {formatDuration(elapsed)}{showCountdown ? ` · Sisa ${remaining}d` : ''}
					</span>
				)}
				{state === 'recorded' && (
					<span className="ar-done" aria-hidden="true">Rekaman siap · {formatDuration(elapsed)}</span>
				)}
				{/* Visually-hidden, screen-reader-only status announcements.
				   Announced once per state transition — never on every timer tick. */}
				<span className="sr-only">
					{state === 'recording' && 'Perekaman dimulai.'}
					{state === 'recorded' && 'Rekaman siap.'}
					{state === 'requesting' && 'Meminta izin mikrofon.'}
				</span>
			</div>

			{state === 'idle' && (
				<Button variant="ghost" type="button" className="ar-record" onClick={() => void startRecording()} aria-label="Mulai merekam jawaban">
					<Mic size={16} /> Mulai merekam
				</Button>
			)}

			{state === 'requesting' && (
				<Button variant="ghost" type="button" className="ar-record" disabled aria-label="Meminta izin mikrofon">
					<span className="ar-pulse" /> Meminta izin mikrofon…
				</Button>
			)}

			{state === 'recording' && (
				<Button variant="ghost" type="button" className="ar-stop" onClick={stopRecording} aria-label="Berhenti merekam dan menyimpan">
					<Square size={14} /> Berhenti & simpan
				</Button>
			)}

			{state === 'recording' && (
				<div
					className="ar-level"
					role="meter"
					aria-label="Tingkat suara mikrofon"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(level * 100)}
				>
					<span className="ar-level-fill" style={{ width: `${Math.round(level * 100)}%` }} />
				</div>
			)}

			{state === 'recorded' && (
				<div className="ar-preview">
					<audio controls src={urlRef.current} className="ar-audio" />
					<div className="ar-preview-actions">
						<Button variant="ghost" type="button" className="ld-outline-action sm" onClick={reset} aria-label="Rekam ulang jawaban">
							<RotateCcw size={13} /> Rekam ulang
						</Button>
					</div>
				</div>
			)}

			{state === 'error' && (
				<div className="ar-error" role="alert">
					<p>
						<AlertCircle size={14} /> {error}
					</p>
					<div className="ar-error-actions">
						<Button variant="ghost" type="button" className="ld-outline-action sm" onClick={() => void startRecording()} aria-label="Coba merekam ulang">
							<Mic size={13} /> Coba lagi
						</Button>
						<Button variant="ghost" type="button" className="ar-dismiss" onClick={reset} aria-label="Tutup pesan kesalahan">
							<Trash2 size={13} /> Tutup
						</Button>
					</div>
				</div>
			)}

			{state === 'idle' && (
				<p className="ar-hint">
					<MicOff size={12} /> Pastikan mikrofon aktif dan ruangan tenang sebelum merekam.
				</p>
			)}
		</div>
	);
}
