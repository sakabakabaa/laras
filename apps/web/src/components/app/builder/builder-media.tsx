import {
	createContext,
	useContext,
	useEffect,
	useRef,
	useState,
	type CSSProperties,
} from 'react';
import {
	ArrowDown,
	ArrowUp,
	FolderOpen,
	GripVertical,
	Link2,
	Upload,
	X,
} from 'lucide-react';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import pb from '@/lib/pocketbase-client';
import {
	FILE_LIBRARY_MIME_TYPES,
	validateLibraryFile,
} from '@/lib/file-library';
import type { FileLibraryRecord } from '@/lib/learning';
import {
	uid,
	BUILDER_TRANSCRIPT_MAX_LENGTH,
	builderImagePresentationStyle,
	resetBuilderImagePresentation,
	resetBuilderPlayback,
	BUILDER_PLAYBACK_RATES,
	normalizeBuilderPlayback,
	normalizeBuilderCaptions,
	type BuilderCaptions,
	type BuilderAsset,
	type BuilderBlock,
	type BuilderImage,
} from '@/lib/builder-document';

type Kind = 'image' | 'audio' | 'video';
const extensions: Record<Kind, string[]> = {
	image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'],
	audio: ['mp3', 'wav', 'ogg', 'aac', 'm4a'],
	video: ['mp4', 'webm', 'mov'],
};
const matches = (filename: string, kind: Kind) =>
	extensions[kind].includes(filename.split('.').pop()?.toLowerCase() || '');
export const safeBuilderUrl = (value?: string) =>
	value && /^https:\/\/[^\s<>"']+$/i.test(value) ? value : '';
export const BuilderMediaResolver = createContext<
	((asset: BuilderAsset) => Promise<string>) | null
>(null);
export function useBuilderAssetUrl(asset?: BuilderAsset, external?: string) {
	const resolve = useContext(BuilderMediaResolver);
	const [url, setUrl] = useState('');
	const [error, setError] = useState('');
	useEffect(() => {
		let live = true;
		setUrl('');
		setError('');
		if (!asset) {
			setUrl(safeBuilderUrl(external));
			return;
		}
		const load = async () => {
			try {
				if (resolve) {
					const value = await resolve(asset);
					if (live) {
						setError('');
						setUrl(value);
					}
					return;
				}
				const record = await pb
					.collection('file_library')
					.getOne<FileLibraryRecord>(asset.fileId, { requestKey: null });
				const token = await pb.files.getToken({ requestKey: null });
				if (
					record.file !== asset.filename ||
					(record.version || 1) !== asset.version
				) {
					const prior = await pb.collection('file_versions').getFirstListItem<{
						id: string;
						collectionId: string;
						fileData: string;
						filename: string;
					}>(
						pb.filter('file = {:file} && version = {:version}', {
							file: asset.fileId,
							version: asset.version,
						}),
						{ requestKey: null },
					);
					if (prior.filename !== asset.filename)
						throw new Error('Versi berkas tidak tersedia.');
					if (live) {
						setError('');
						setUrl(pb.files.getURL(prior, prior.fileData, { token }));
					}
				} else if (live) {
					setError('');
					setUrl(pb.files.getURL(record, record.file, { token }));
				}
			} catch (e) {
				if (live) setError((e as Error).message || 'Berkas tidak tersedia.');
			}
		};
		void load();
		const interval = window.setInterval(
			() => {
				void load();
			},
			resolve ? 15 * 60000 : 90000,
		);
		return () => {
			live = false;
			window.clearInterval(interval);
		};
	}, [asset?.fileId, asset?.filename, asset?.version, external, resolve]);
	return { url, error };
}
function MediaView({
	kind,
	asset,
	url: external,
	alt = '',
	caption = '',
	presentation,
	transcript = '',
	playback,
	captions,
}: {
	kind: Kind;
	asset?: BuilderAsset;
	url?: string;
	alt?: string;
	caption?: string;
	presentation?: BuilderImage['presentation'];
	transcript?: string;
	playback?: BuilderBlock['playback'];
	captions?: BuilderCaptions;
}) {
	const { url, error } = useBuilderAssetUrl(asset, external);
	const [captionTime, setCaptionTime] = useState(0);
	const activeCue = captions?.cues.find(cue => captionTime >= cue.start && captionTime < cue.end);
	const audioRef = useRef<HTMLAudioElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	useEffect(() => {
		const media = kind === 'audio' ? audioRef.current : videoRef.current;
		if (!media || !url) return;
		try { media.playbackRate = playback?.rate ?? 1; } catch { /* unsupported native rate */ }
	}, [url, playback?.rate, kind]);
	useEffect(() => {
		const media = kind === 'audio' ? audioRef.current : videoRef.current;
	if (!media || !url || (playback?.start === undefined && playback?.end === undefined)) return;
		let disposed = false;
		let configured = false;
		const currentSource = () => !media.currentSrc || media.currentSrc === media.src;
		const finiteDuration = () => Number.isFinite(media.duration) && media.duration >= 0 ? media.duration : null;
		const bounds = () => {
			const duration = finiteDuration();
			const start = Math.min(playback?.start ?? 0, duration ?? (playback?.start ?? 0));
			const authoredEnd = playback?.end;
			const end = authoredEnd === undefined ? null : duration === null ? authoredEnd : Math.min(authoredEnd, duration);
			return { start, end };
		};
		const seek = (time: number) => { if (!disposed && Math.abs(media.currentTime - time) > 0.05) media.currentTime = time; };
		const onMetadata = () => {
			if (disposed || !currentSource()) return;
			const { start, end } = bounds();
			if (!configured) {
				configured = true;
				if (playback?.start !== undefined) seek(start);
			} else if (end !== null && end <= start) seek(start);
			setCaptionTime(media.currentTime);
		};
		const onTime = () => {
			if (disposed || !currentSource()) return;
			const { start, end } = bounds();
			if (end !== null && media.currentTime >= end) {
				if (playback?.loop && end > start) { seek(start); if (!media.paused) void media.play().catch(() => {}); }
				else { seek(end); media.pause(); }
			}
			setCaptionTime(media.currentTime);
		};
		const onSeeking = () => {
			if (disposed || !currentSource()) return;
			const { start, end } = bounds();
			if (media.currentTime < start) seek(start);
			else if (end !== null && media.currentTime > end) seek(end);
		};
		const onEnded = () => {
			if (disposed || !currentSource()) return;
			const { start, end } = bounds();
			if (end !== null) {
				if (playback?.loop && end > start) { seek(start); void media.play().catch(() => {}); }
				else media.pause();
			}
		};
		media.addEventListener('loadedmetadata', onMetadata);
		media.addEventListener('durationchange', onMetadata);
		media.addEventListener('timeupdate', onTime);
		media.addEventListener('seeking', onSeeking);
		media.addEventListener('ended', onEnded);
		if (media.readyState > 0) onMetadata();
		return () => { disposed = true; media.removeEventListener('loadedmetadata', onMetadata); media.removeEventListener('durationchange', onMetadata); media.removeEventListener('timeupdate', onTime); media.removeEventListener('seeking', onSeeking); media.removeEventListener('ended', onEnded); };
	}, [url, playback?.start, playback?.end, playback?.rate, playback?.loop, kind]);
	const playbackEvents = {
		onTimeUpdate: (event: React.SyntheticEvent<HTMLMediaElement>) => {
			if (event.currentTarget.readyState > 0) {
				setCaptionTime(event.currentTarget.currentTime);
			}
		},
			onSeeked: (event: React.SyntheticEvent<HTMLMediaElement>) => setCaptionTime(event.currentTarget.currentTime),
	};
	return (
		<figure className="bd-media-view">
			{error ? <p role="alert" className="bd-media-error">{error}</p> : !url ? (
				<p className="bd-help">{asset ? 'Memuat berkas…' : 'Media belum dipilih.'}</p>
			) : kind === 'image' ? (
				<img src={url} alt={alt} loading="lazy" style={presentation && Object.keys(presentation).length ? builderImagePresentationStyle(presentation) as CSSProperties : undefined} />
			) : kind === 'audio' ? (
				<audio
					ref={audioRef}
					{...playbackEvents}
					src={url}
					controls
					preload="metadata"
					loop={playback?.loop === true && playback?.end === undefined}
					muted={playback?.muted === true}
					aria-label={caption || asset?.name || 'Audio'}
				/>
			) : (
				<video
					ref={videoRef}
					{...playbackEvents}
					src={url}
					controls
					preload="metadata"
					loop={playback?.loop === true && playback?.end === undefined}
					muted={playback?.muted === true}
					aria-label={caption || asset?.name || 'Video'}
				/>
			)}
			{captions?.cues.length ? <p className="bd-media-cue" lang={captions.language} aria-live="polite" aria-atomic="true">{activeCue?.text || ''}</p> : null}
			{caption && <figcaption>{caption}</figcaption>}
			{transcript?.trim() && <details className="bd-media-transcript"><summary>Transkrip teks</summary><div className="bd-prose">{transcript}</div></details>}
		</figure>
	);
}
export function BuilderMediaView({ block }: { block: BuilderBlock }) {
	if (block.type === 'image') {
		const images =
			block.images ||
			(block.url || block.asset
				? [
						{
							id: block.id,
							url: block.url,
							asset: block.asset,
							alt: block.alt || '',
							caption: block.label || '',
						},
					]
				: []);
		return images.length ? (
			<div
				className="bd-image-gallery"
				style={
					{
						'--gallery-columns': block.columns || images.length,
					} as CSSProperties
				}
			>
				{images.map((image) => (
					<MediaView key={image.id} kind="image" {...image} />
				))}
			</div>
		) : (
			<p>Gambar belum dipilih.</p>
		);
	}
	return (
		<MediaView
			kind={block.type as Kind}
			asset={block.asset}
			url={block.url}
			caption={block.label}
			transcript={block.transcript}
			playback={block.playback}
			captions={block.captions}
		/>
	);
}
function assetFor(record: FileLibraryRecord): BuilderAsset {
	return {
		fileId: record.id,
		filename: record.file,
		version: record.version || 1,
		name: record.title,
	};
}
export function BuilderMediaPicker({
	kind,
	courseId,
	max = 1,
	onChoose,
	onClose,
}: {
	kind: Kind;
	courseId: string;
	max?: number;
	onChoose: (assets: BuilderAsset[]) => void;
	onClose: () => void;
}) {
	const [records, setRecords] = useState<FileLibraryRecord[]>([]),
		[query, setQuery] = useState(''),
		[page, setPage] = useState(1),
		[pages, setPages] = useState(1),
		[loading, setLoading] = useState(true),
		[busy, setBusy] = useState(''),
		[error, setError] = useState(''),
		[selected, setSelected] = useState<FileLibraryRecord[]>([]);
	const upload = useRef<HTMLInputElement>(null);
	useEffect(() => {
		let live = true;
		setLoading(true);
		setError('');
		const extFilter = extensions[kind]
			.map((ext) => `file ~ '.${ext}'`)
			.join(' || ');
		pb.collection('file_library')
			.getList<FileLibraryRecord>(page, 40, {
				filter: pb.filter(
					`owner = {:owner} && course ?= {:course} && (${extFilter}) && (title ~ {:query} || file ~ {:query})`,
					{ owner: pb.authStore.record?.id, course: courseId, query },
				),
				sort: '-created',
				requestKey: null,
			})
			.then((result) => {
				if (live) {
					setRecords(result.items.filter((r) => matches(r.file, kind)));
					setPages(result.totalPages);
				}
			})
			.catch((e) => {
				if (live) setError(e.message);
			})
			.finally(() => {
				if (live) setLoading(false);
			});
		return () => {
			live = false;
		};
	}, [kind, courseId, query, page]);
	const uploadFiles = async (files: File[]) => {
		setError('');
		if (!files.length) return;
		if (files.length > max) {
			setError(`Pilih maksimal ${max} berkas.`);
			return;
		}
		for (const file of files) {
			const problem = validateLibraryFile(file);
			if (problem || !matches(file.name, kind)) {
				setError(problem || 'Jenis berkas tidak sesuai dengan elemen.');
				return;
			}
		}
		const assets: BuilderAsset[] = [];
		let failure = '';
		try {
			for (const [index, file] of files.entries()) {
				setBusy(`Mengunggah ${index + 1} dari ${files.length}…`);
				const data = new FormData();
				for (const [key, value] of Object.entries({
					title: file.name.slice(0, 200),
					owner: pb.authStore.record?.id || '',
					course: courseId,
					access: 'faculty',
					restrictDownload: 'true',
					status: 'ready',
					version: '1',
					size: String(file.size),
					kind,
				}))
					data.append(key, value);
				data.append('file', file);
				const record = await pb
					.collection('file_library')
					.create<FileLibraryRecord>(data, { requestKey: null });
				assets.push(assetFor(record));
			}
		} catch (e) {
			failure = (e as Error).message;
		}
		setBusy('');
		if (assets.length && !failure) {
			onChoose(assets);
			return;
		}
		if (assets.length) {
			setSelected(
				await Promise.all(
					assets.map((a) =>
						pb.collection('file_library').getOne<FileLibraryRecord>(a.fileId),
					),
				),
			);
			setPage(1);
		}
		setError(
			`${failure}${assets.length ? ' Berkas yang berhasil diunggah sudah dipilih; Anda dapat memakainya.' : ''}`,
		);
	};
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !busy) onClose();
			}}
		>
			<DialogContent className="bd-picker-dialog bd-media-picker">
				<DialogHeader>
					<DialogTitle>Pilih {kind === 'image' ? 'gambar' : kind}</DialogTitle>
					<DialogDescription>
						Berkas mata kuliah ini milik Anda. Unggahan baru disimpan privat di
						Berkas. Maksimal 500 MB per berkas.
					</DialogDescription>
				</DialogHeader>
				<div className="bd-inline-actions">
					<input
						type="search"
						aria-label="Cari berkas media"
						placeholder="Cari nama berkas…"
						value={query}
						onChange={(e) => {
							setQuery(e.target.value);
							setPage(1);
						}}
						disabled={Boolean(busy)}
					/>
					<button
						className="bd-primary"
						disabled={Boolean(busy)}
						onClick={() => upload.current?.click()}
					>
						<Upload size={15} /> Unggah berkas
					</button>
					<input
						ref={upload}
						type="file"
						hidden
						multiple={max > 1}
						accept={FILE_LIBRARY_MIME_TYPES.filter((mime) =>
							mime.startsWith(kind + '/'),
						).join(',')}
						onChange={(e) => {
							void uploadFiles(Array.from(e.target.files || []));
							e.target.value = '';
						}}
					/>
				</div>
				{busy && <p role="status">{busy} Jangan tutup halaman.</p>}
				{error && <p role="alert">{error}</p>}
				<div className="bd-media-library">
					{loading ? (
						<p>Memuat berkas…</p>
					) : records.length ? (
						records.map((record) => (
							<button
								className="bd-media-choice"
								key={record.id}
								disabled={Boolean(busy)}
								aria-pressed={selected.some((r) => r.id === record.id)}
								onClick={() => {
									setError('');
									if (selected.some((r) => r.id === record.id))
										setSelected(selected.filter((r) => r.id !== record.id));
									else if (max === 1) setSelected([record]);
									else if (selected.length < max)
										setSelected([...selected, record]);
									else setError(`Pilih maksimal ${max} berkas.`);
								}}
							>
								{kind === 'image' && (
									<MediaView
										kind="image"
										asset={assetFor(record)}
										alt={record.title}
									/>
								)}
								<strong>{record.title}</strong>
								<small>
									{record.file} · {Math.round((record.size || 0) / 1024)} KB
								</small>
							</button>
						))
					) : (
						<p>Belum ada berkas yang cocok. Unggah berkas dari perangkat.</p>
					)}
				</div>
				<div className="bd-inline-actions">
					<button
						className="bd-secondary"
						disabled={page <= 1 || Boolean(busy)}
						onClick={() => setPage(page - 1)}
					>
						Sebelumnya
					</button>
					<span>
						{page} / {Math.max(1, pages)}
					</span>
					<button
						className="bd-secondary"
						disabled={page >= pages || Boolean(busy)}
						onClick={() => setPage(page + 1)}
					>
						Berikutnya
					</button>
					<button
						className="bd-primary"
						disabled={!selected.length || Boolean(busy)}
						onClick={() => onChoose(selected.map(assetFor))}
					>
						Gunakan {selected.length || ''} berkas
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
export function BuilderMediaEditor({
	block,
	courseId,
	captionsSupported = false,
	onUpdate,
}: {
	block: BuilderBlock;
	courseId: string;
	captionsSupported?: boolean;
	onUpdate: (edit: (block: BuilderBlock) => void) => void;
}) {
	const [picker, setPicker] = useState<{ replace?: string } | null>(null),
		[linkOpen, setLinkOpen] = useState(false),
		[link, setLink] = useState(''),
		[error, setError] = useState('');
	const [captionDraft, setCaptionDraft] = useState('');
	const [captionLanguage, setCaptionLanguage] = useState('');
	const [captionError, setCaptionError] = useState('');
	const [playbackDraft, setPlaybackDraft] = useState({ start: '', end: '', rate: '1' });
	const [playbackError, setPlaybackError] = useState('');
	useEffect(() => {
		setCaptionDraft((block.captions?.cues || []).map(cue => `${cue.start}\t${cue.end}\t${cue.text}`).join('\n'));
		setCaptionLanguage(block.captions?.language || '');
		setCaptionError('');
	}, [block.id, block.captions]);
	useEffect(() => {
		setPlaybackDraft({ start: block.playback?.start === undefined ? '' : String(block.playback.start), end: block.playback?.end === undefined ? '' : String(block.playback.end), rate: String(block.playback?.rate ?? 1) });
		setPlaybackError('');
	}, [block.id, block.playback?.start, block.playback?.end, block.playback?.rate, block.playback?.loop, block.playback?.muted]);
	const dragged = useRef<string | null>(null);
	const images: BuilderImage[] =
		block.images ||
		(block.url || block.asset
			? [
					{
						id: block.id + '-image',
						url: block.url,
						asset: block.asset,
						alt: block.alt || '',
						caption: block.label || '',
					},
				]
			: []);
	const editImages = (edit: (images: BuilderImage[]) => void) =>
		onUpdate((b) => {
			const next = structuredClone(images);
			edit(next);
			b.images = next;
			if (b.columns !== undefined)
				b.columns = Math.min(Math.max(b.columns, 1), 4);
			delete b.url;
			delete b.asset;
			delete b.alt;
		});
	const reorder = (from: number, to: number) =>
		editImages((items) => {
			const [moving] = items.splice(from, 1);
			items.splice(to, 0, moving);
		});
	const choose = (assets: BuilderAsset[]) => {
		if (block.type === 'image')
			editImages((items) => {
				if (picker?.replace) {
					const target = items.find((image) => image.id === picker.replace);
					if (target) {
						target.asset = assets[0];
						delete target.url;
					}
				} else
					items.push(
						...assets
							.slice(0, 4 - items.length)
							.map((asset) => ({ id: uid(), asset, alt: '', caption: '' })),
					);
			});
		else
			onUpdate((b) => {
				b.asset = assets[0];
				delete b.url;
			});
		setPicker(null);
	};
	return (
		<div className="bd-fields bd-media-editor">
			{block.type === 'image' ? (
				<>
					<div className="bd-inline-actions">
						<label>
							Kolom
							<select
								value={block.columns || Math.max(1, images.length)}
								onChange={(e) =>
									onUpdate((b) => {
										b.columns = Number(e.target.value);
									})
								}
							>
								{[1, 2, 3, 4].map((n) => (
									<option key={n} value={n}>
										{n} kolom
									</option>
								))}
							</select>
						</label>
						<span>{images.length}/4 gambar</span>
					</div>
					<div
						className="bd-image-gallery bd-gallery-editor"
						style={
							{
								'--gallery-columns':
									block.columns || Math.max(1, images.length),
							} as CSSProperties
						}
					>
						{images.map((image, index) => (
							<div
								className="bd-gallery-item"
								key={image.id}
								onDragOver={(e) => {
									if (dragged.current) e.preventDefault();
								}}
								onDrop={(e) => {
									if (!dragged.current) return;
									e.preventDefault();
									e.stopPropagation();
									const from = images.findIndex(
										(v) => v.id === dragged.current,
									);
									if (from >= 0) reorder(from, index);
									dragged.current = null;
								}}
							>
								<div className="bd-inline-actions">
									<button
										className="bd-icon"
										draggable
										onDragStart={(e) => {
											e.stopPropagation();
											dragged.current = image.id;
											e.dataTransfer.setData(
												'application/x-laras-gallery',
												image.id,
											);
											e.dataTransfer.effectAllowed = 'move';
										}}
										onDragEnd={() => {
											dragged.current = null;
										}}
										aria-label={`Seret gambar ${index + 1}`}
									>
										<GripVertical size={14} />
									</button>
									<button
										className="bd-icon"
										disabled={index === 0}
										aria-label={`Naikkan gambar ${index + 1}`}
										onClick={() => reorder(index, index - 1)}
									>
										<ArrowUp size={14} />
									</button>
									<button
										className="bd-icon"
										disabled={index === images.length - 1}
										aria-label={`Turunkan gambar ${index + 1}`}
										onClick={() => reorder(index, index + 1)}
									>
										<ArrowDown size={14} />
									</button>
									<button
										className="bd-icon"
										aria-label={`Hapus gambar ${index + 1}`}
										onClick={() =>
											editImages((items) => {
												items.splice(index, 1);
											})
										}
									>
										<X size={14} />
									</button>
								</div>
								<MediaView kind="image" {...image} />
								<small className="bd-filename">
									{image.asset?.name || image.url}
								</small>
								<button
									className="bd-secondary"
									onClick={() => setPicker({ replace: image.id })}
								>
									Ganti gambar
								</button>
								<label>
									Teks alternatif {index + 1}
									<input
										maxLength={1000}
										value={image.alt}
										onChange={(e) =>
											editImages((items) => {
												items[index].alt = e.target.value;
											})
										}
									/>
								</label>
								<label>
									Keterangan {index + 1}
									<input
										maxLength={500}
										value={image.caption}
										onChange={(e) =>
											editImages((items) => {
												items[index].caption = e.target.value;
											})
										}
									/>
								</label>
								<fieldset className="bd-image-presentation">
									<legend>Tampilan gambar {index + 1}</legend>
									<label>Penyesuaian
										<select value={image.presentation?.fit || ''} onChange={e => editImages(items => { const value=e.target.value as 'contain'|'cover'|''; items[index].presentation={...items[index].presentation,...(value?{fit:value}:{})}; if(!value) delete items[index].presentation?.fit; if(!Object.keys(items[index].presentation||{}).length) delete items[index].presentation; })}>
											<option value="">Asli (natural)</option><option value="contain">Tampilkan utuh</option><option value="cover">Potong memenuhi bingkai</option>
										</select>
									</label>
									<label>Rasio bingkai
										<select value={image.presentation?.aspect || 'natural'} onChange={e => editImages(items => { const value=e.target.value as NonNullable<BuilderImage['presentation']>['aspect']; items[index].presentation={...items[index].presentation,...(value&&value!=='natural'?{aspect:value}:{})}; if(value==='natural') delete items[index].presentation?.aspect; if(!Object.keys(items[index].presentation||{}).length) delete items[index].presentation; })}>
											<option value="natural">Asli</option><option value="square">Persegi 1:1</option><option value="4:3">4:3</option><option value="3:2">3:2</option><option value="16:9">Lanskap 16:9</option>
										</select>
									</label>
									<div className="bd-inline-actions"><label>Fokus horizontal<input type="range" min="0" max="100" value={image.presentation?.focalX ?? 50} aria-label={`Fokus horizontal gambar ${index+1}`} onChange={e=>editImages(items=>{items[index].presentation={...items[index].presentation,focalX:Number(e.target.value)};})}/></label><label>Fokus vertikal<input type="range" min="0" max="100" value={image.presentation?.focalY ?? 50} aria-label={`Fokus vertikal gambar ${index+1}`} onChange={e=>editImages(items=>{items[index].presentation={...items[index].presentation,focalY:Number(e.target.value)};})}/></label></div>
									<button type="button" className="bd-text-button" onClick={()=>editImages(items=>{items[index]=resetBuilderImagePresentation(items[index]);})}>Reset tampilan</button>
								</fieldset>
							</div>
						))}
					</div>
				</>
			) : (
				<>
					{(block.asset || block.url) && (
						<>
							<BuilderMediaView block={block} />
							<small className="bd-filename">
								{block.asset?.name || block.url}
							</small>
							<button
								className="bd-text-button"
								onClick={() =>
									onUpdate((b) => {
										delete b.asset;
										delete b.url;
									})
								}
							>
								Lepas media
							</button>
						</>
					)}
					<label>
						Keterangan
						<input
							maxLength={500}
							value={block.label || ''}
							onChange={(e) =>
								onUpdate((b) => {
									b.label = e.target.value;
								})
							}
						/>
					</label>
					{(block.type === 'audio' || block.type === 'video') && (
						<>
							<label>Transkrip teks
								<textarea maxLength={BUILDER_TRANSCRIPT_MAX_LENGTH} rows={6} value={block.transcript || ''} onChange={e => onUpdate(b => { const value=e.target.value; if(value) b.transcript=value; else delete b.transcript; })} />
							</label>
							<fieldset className="bd-image-presentation">
								<legend>Subtitel tersinkron</legend>
								<p>Masukkan satu cue per baris: waktu mulai (detik), waktu selesai (detik), lalu teks, dipisahkan tab. Cue tidak boleh bertumpuk.</p>
								<label>Bahasa (opsional, contoh id atau en-US)<input aria-label="Bahasa subtitel" value={captionLanguage} maxLength={6} onChange={e=>setCaptionLanguage(e.target.value)} /></label>
								<label>Cue subtitel<textarea aria-label="Cue subtitel" rows={7} value={captionDraft} onChange={e=>setCaptionDraft(e.target.value)} /></label>
								{!captionsSupported && <small>Backend belum mengumumkan dukungan subtitel bertanda waktu.</small>}
								{captionError && <p role="alert">{captionError}</p>}
								<div className="bd-inline-actions">
									<button type="button" className="bd-primary" onClick={()=>{
										try {
											const cues = captionDraft.split(/\r?\n/).filter(line=>line.trim()).map(line=>{ const parts=line.split('\t'); if(parts.length!==3 || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(parts[0]) || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(parts[1])) throw new Error('Gunakan waktu detik numerik dan tiga kolom yang dipisahkan tab.'); return {start:Number(parts[0]),end:Number(parts[1]),text:parts[2]}; });
											const value = normalizeBuilderCaptions({...(captionLanguage?{language:captionLanguage}:{}),cues});
											onUpdate(b=>{b.captions=value;}); setCaptionError('');
										} catch (e) { setCaptionError((e as Error).message || 'Cue subtitel tidak valid.'); }
									}}>Terapkan cue</button>
									<button type="button" className="bd-text-button" onClick={()=>{setCaptionDraft((block.captions?.cues || []).map(cue => `${cue.start}\t${cue.end}\t${cue.text}`).join('\n'));setCaptionLanguage(block.captions?.language || '');setCaptionError('');}}>Batalkan draf cue</button>
									<button type="button" className="bd-text-button" disabled={!block.captions} onClick={()=>{onUpdate(b=>{delete b.captions;});setCaptionDraft('');setCaptionLanguage('');setCaptionError('');}}>Hapus cue</button>
								</div>
							</fieldset>
							<fieldset className="bd-image-presentation">
								<legend>Pemutaran</legend>
								<label><input type="checkbox" checked={block.playback?.loop === true} onChange={e => onUpdate(b => { const playback={...b.playback}; if(e.target.checked) playback.loop=true; else delete playback.loop; if(Object.keys(playback).length) b.playback=playback; else delete b.playback; })} /> Ulangi pemutaran</label>
								<label><input type="checkbox" checked={block.playback?.muted === true} onChange={e => onUpdate(b => { const playback={...b.playback}; if(e.target.checked) playback.muted=true; else delete playback.muted; if(Object.keys(playback).length) b.playback=playback; else delete b.playback; })} /> Mulai tanpa suara</label>
								<p>Titik waktu memakai detik dari awal media. Kosongkan untuk memakai awal atau akhir asli.</p>
								<label>Mulai pada detik<input aria-label="Mulai pemutaran pada detik" type="number" min="0" max="86400" step="0.1" value={playbackDraft.start} onChange={e=>setPlaybackDraft(d=>({...d,start:e.target.value}))} /></label>
								<label>Akhiri pada detik<input aria-label="Akhiri pemutaran pada detik" type="number" min="0" max="86400" step="0.1" value={playbackDraft.end} onChange={e=>setPlaybackDraft(d=>({...d,end:e.target.value}))} /></label>
								<label>Kecepatan awal<select aria-label="Kecepatan awal pemutaran" value={playbackDraft.rate} onChange={e=>setPlaybackDraft(d=>({...d,rate:e.target.value}))}>{BUILDER_PLAYBACK_RATES.map(rate=><option key={rate} value={rate}>{rate}×</option>)}</select></label>
								{playbackError && <p role="alert">{playbackError}</p>}
								<div className="bd-inline-actions">
					<button type="button" className="bd-primary" onClick={()=>{let value;try{const parseTime=(raw:string)=>{if(raw.trim()==='')return undefined;if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw.trim()))throw new Error('Masukkan waktu sebagai detik numerik yang valid.');return Number(raw);};const start=parseTime(playbackDraft.start);const end=parseTime(playbackDraft.end);value=normalizeBuilderPlayback({...block.playback,...(start===undefined?{}:{start}),...(end===undefined?{}:{end}),rate:Number(playbackDraft.rate)});}catch(e){setPlaybackError((e as Error).message||'Pengaturan pemutaran tidak valid.');return;}onUpdate(b=>{b.playback={...value,...(b.playback?.loop?{loop:true}:{}),...(b.playback?.muted?{muted:true}:{})};});setPlaybackError('');}}>Terapkan pemutaran</button>
									<button type="button" className="bd-text-button" onClick={()=>{setPlaybackDraft({start:block.playback?.start===undefined?'':String(block.playback.start),end:block.playback?.end===undefined?'':String(block.playback.end),rate:String(block.playback?.rate??1)});setPlaybackError('');}}>Batalkan draf pemutaran</button>
								</div>
								<button type="button" className="bd-text-button" onClick={() => onUpdate(b => { resetBuilderPlayback(b); })}>Reset pemutaran</button>
							</fieldset>
						</>
					)}
				</>
			)}
			<div className="bd-inline-actions">
				<button
					className="bd-primary"
					disabled={block.type === 'image' && images.length >= 4}
					onClick={() => setPicker({})}
				>
					<FolderOpen size={16} />
					{block.type !== 'image' && (block.asset || block.url)
						? 'Ganti berkas'
						: 'Pilih / unggah berkas'}
				</button>
				<button
					className="bd-secondary"
					disabled={block.type === 'image' && images.length >= 4}
					onClick={() => setLinkOpen(!linkOpen)}
				>
					<Link2 size={15} /> Gunakan tautan
				</button>
			</div>
			{linkOpen && (
				<div className="bd-inline-actions">
					<input
						type="url"
						aria-label="Tautan media"
						placeholder="https://…"
						maxLength={2000}
						value={link}
						onChange={(e) => setLink(e.target.value)}
					/>
					<button
						className="bd-secondary"
						onClick={() => {
							if (!safeBuilderUrl(link)) {
								setError('Masukkan tautan HTTPS yang valid.');
								return;
							}
							if (block.type === 'image')
								editImages((items) => {
									if (items.length < 4)
										items.push({ id: uid(), url: link, alt: '', caption: '' });
								});
							else
								onUpdate((b) => {
									b.url = link;
									delete b.asset;
								});
							setLink('');
							setLinkOpen(false);
							setError('');
						}}
					>
						Gunakan
					</button>
				</div>
			)}
			{error && <p role="alert">{error}</p>}
			{picker && (
				<BuilderMediaPicker
					kind={block.type as Kind}
					courseId={courseId}
					max={
						block.type === 'image' && !picker.replace ? 4 - images.length : 1
					}
					onChoose={choose}
					onClose={() => setPicker(null)}
				/>
			)}
		</div>
	);
}
