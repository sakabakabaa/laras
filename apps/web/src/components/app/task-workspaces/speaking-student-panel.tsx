import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
	Download,
	Link2,
	Mic,
	Pause,
	Play,
	RotateCcw,
	Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AudioRecorder, type RecordedClip } from '@/components/app/audio-recorder';
import { WorksheetArt } from '@/components/app/worksheet-art';
import type { SpeakingDirection } from '@/lib/speaking-directions';

export type SpeakingClip = {
	key: string;
	name: string;
	url?: string;
	pending?: boolean;
};

const barHeights = (seed: string) => {
	const bars: number[] = [];
	let n = 17;
	for (let i = 0; i < seed.length; i++) n = (n * 33 + seed.charCodeAt(i)) % 97;
	for (let i = 0; i < 42; i++) {
		n = (n * 33 + i * 7) % 97;
		bars.push(18 + (n % 72));
	}
	return bars;
};

const pad = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0');
const clock = (seconds: number) => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;

export function SpeakingPrepare({ items }: { items: SpeakingDirection[] }) {
	return (
		<div className="spk-prepare">
			<h3>Arah untuk kamu</h3>
			<p className="spk-prepare-lead">
				Ini yang perlu kamu lakukan. Catatan metode dosen tidak ditampilkan di sini.
			</p>
			<ul>
				{items.map((item) => (
					<li key={item.label}>
						<strong>{item.label}</strong>
						<span>{item.text}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

export function SpeakingRecord({
	clips,
	onClip,
	onUpload,
	onRerecord,
	allowUpload,
	allowLink,
	link,
	onLink,
	closed,
	checklist,
	transcript,
	compact,
	durationMin = 0,
}: {
	clips: SpeakingClip[];
	onClip: (clip: RecordedClip) => void;
	onUpload: (file: File) => void;
	onRerecord: () => void;
	allowUpload: boolean;
	allowLink: boolean;
	link: string;
	onLink: (value: string) => void;
	closed?: boolean;
	checklist: string[];
	transcript?: ReactNode;
	/** Review step: player + transcript, recorder tucked behind Rekam ulang. */
	compact?: boolean;
	durationMin?: number;
}) {
	const latest = clips[clips.length - 1];
	const [showRecorder, setShowRecorder] = useState(!latest);
	const fileRef = useRef<HTMLInputElement>(null);
	const cap = durationMin > 0 ? `${String(durationMin).padStart(2, '0')}:00` : '30:00';
	const showInputs = (!compact || showRecorder || !latest) && !closed;
	const showLink = allowLink && !compact;
	const cardCount = 1 + (allowUpload ? 1 : 0) + (showLink ? 1 : 0);

	useEffect(() => {
		if (latest) setShowRecorder(false);
	}, [latest?.key]);

	return (
		<div className="spk-record">
			<h3 className="spk-record-title">
				<Mic size={16} /> Rekaman kamu
			</h3>
			{latest?.url ? (
				<SpeakingPlayer
					clip={latest}
					onRerecord={() => {
						onRerecord();
						setShowRecorder(true);
					}}
					closed={closed}
				/>
			) : null}

			{allowUpload && (
				<input
					ref={fileRef}
					type="file"
					accept="audio/*,video/*"
					hidden
					onChange={(e) => {
						const file = e.target.files?.[0];
						e.target.value = '';
						if (file) onUpload(file);
					}}
				/>
			)}

			{showInputs && (
				<div className={`spk-channels cols-${cardCount}`}>
					<article className="spk-card">
						<header className="spk-card-head">
							<Mic size={15} /> Rekam langsung
						</header>
						<div className="spk-hero">
							<WorksheetArt name="speaking" size="md" />
							<AudioRecorder onClip={onClip} maxSeconds={durationMin > 0 ? durationMin * 60 : 1800} />
							<strong className="spk-hero-label">Mulai merekam</strong>
							<p className="spk-cap">00:00 / {cap}</p>
						</div>
						<p>Gunakan mikrofon browser. Rekaman tersimpan saat kamu menekan berhenti.</p>
					</article>
					{allowUpload && (
						<article className="spk-card">
							<header className="spk-card-head">
								<Upload size={15} /> Unggah file
							</header>
							<p>Sudah punya rekaman? Pilih berkas audio atau video dari perangkatmu.</p>
							<button type="button" className="spk-upload" onClick={() => fileRef.current?.click()}>
								<Upload size={14} /> Pilih berkas audio atau video
							</button>
						</article>
					)}
					{showLink && (
						<article className="spk-card">
							<header className="spk-card-head">
								<Link2 size={15} /> Tautan rekaman
							</header>
							<p>Tempel tautan jika rekaman ada di Drive, YouTube, atau tempat lain.</p>
							<label className="sas-field">
								Tautan rekaman (opsional)
								<input
									type="url"
									value={link}
									onChange={(e) => onLink(e.target.value)}
									placeholder="https://"
								/>
							</label>
						</article>
					)}
				</div>
			)}

			{transcript}
			{checklist.length > 0 && <SpeakingChecklist items={checklist} />}
		</div>
	);
}

function SpeakingPlayer({
	clip,
	onRerecord,
	closed,
}: {
	clip: SpeakingClip;
	onRerecord: () => void;
	closed?: boolean;
}) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const [playing, setPlaying] = useState(false);
	const [now, setNow] = useState(0);
	const [total, setTotal] = useState(0);
	const bars = useMemo(() => barHeights(clip.name || 'rekaman'), [clip.name]);
	const progress = total > 0 ? Math.min(1, now / total) : 0;

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;
		const onTime = () => setNow(audio.currentTime || 0);
		const onMeta = () => setTotal(Number.isFinite(audio.duration) ? audio.duration : 0);
		const onEnd = () => setPlaying(false);
		audio.addEventListener('timeupdate', onTime);
		audio.addEventListener('loadedmetadata', onMeta);
		audio.addEventListener('ended', onEnd);
		return () => {
			audio.removeEventListener('timeupdate', onTime);
			audio.removeEventListener('loadedmetadata', onMeta);
			audio.removeEventListener('ended', onEnd);
		};
	}, [clip.url]);

	const toggle = () => {
		const audio = audioRef.current;
		if (!audio) return;
		if (audio.paused) {
			void audio.play();
			setPlaying(true);
		} else {
			audio.pause();
			setPlaying(false);
		}
	};

	return (
		<div className="spk-player">
			<div className="spk-player-head">
				<Mic size={15} />
				<strong>Rekaman kamu</strong>
				{clip.pending && <em>Belum tersimpan</em>}
			</div>
			<div className="spk-stage">
				<Button variant="ghost" type="button" className="spk-play" onClick={toggle} aria-label={playing ? 'Jeda' : 'Putar'}>
					{playing ? <Pause size={18} /> : <Play size={18} />}
				</Button>
				<div className="spk-wave" aria-hidden="true">
					{bars.map((height, i) => (
						<span
							key={i}
							style={{ height: `${height}%` }}
							className={i / bars.length < progress ? 'on' : ''}
						/>
					))}
				</div>
				<small>
					{clock(now)} / {total > 0 ? clock(total) : '--:--'}
				</small>
			</div>
			<audio ref={audioRef} src={clip.url} preload="metadata" />
			<div className="spk-player-actions">
				<Button variant="ghost" type="button" onClick={toggle}>
					{playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Jeda' : 'Putar'}
				</Button>
				{!closed && (
					<Button variant="ghost" type="button" onClick={onRerecord}>
						<RotateCcw size={14} /> Rekam ulang
					</Button>
				)}
				<a href={clip.url} download={clip.name}>
					<Download size={14} /> Unduh rekaman
				</a>
			</div>
			<dl className="spk-meta">
				<div>
					<dt>Durasi</dt>
					<dd>{total > 0 ? clock(total) : 'Memuat…'}</dd>
				</div>
				<div>
					<dt>Berkas</dt>
					<dd>{clip.name}</dd>
				</div>
				<div>
					<dt>Perangkat</dt>
					<dd>Browser</dd>
				</div>
			</dl>
		</div>
	);
}

export function SpeakingChecklist({ items }: { items: string[] }) {
	return (
		<div className="spk-check">
			<strong>Yang perlu terpenuhi</strong>
			<ul>
				{items.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
		</div>
	);
}

export function SpeakingTranscriptSlot({ children }: { children: React.ReactNode }) {
	return (
		<div className="spk-transcript">
			<div className="spk-transcript-head">
				<strong>Transkrip otomatis</strong>
				<span>Dari rekaman kamu. Bukan naskah dosen.</span>
			</div>
			{children}
		</div>
	);
}
