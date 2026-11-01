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
}: {
	kind: Kind;
	asset?: BuilderAsset;
	url?: string;
	alt?: string;
	caption?: string;
}) {
	const { url, error } = useBuilderAssetUrl(asset, external);
	const playback = useRef({ time: 0, playing: false });
	const playbackEvents = {
		onTimeUpdate: (event: React.SyntheticEvent<HTMLMediaElement>) => {
			if (event.currentTarget.readyState > 0)
				playback.current.time = event.currentTarget.currentTime;
		},
		onPlay: () => {
			playback.current.playing = true;
		},
		onPause: (event: React.SyntheticEvent<HTMLMediaElement>) => {
			if (event.currentTarget.readyState > 0) playback.current.playing = false;
		},
		onLoadedMetadata: (event: React.SyntheticEvent<HTMLMediaElement>) => {
			const media = event.currentTarget;
			if (playback.current.time > 0 && playback.current.time < media.duration)
				media.currentTime = playback.current.time;
			if (playback.current.playing) void media.play().catch(() => {});
		},
	};
	if (error)
		return (
			<p role="alert" className="bd-media-error">
				{error}
			</p>
		);
	if (!url)
		return (
			<p className="bd-help">
				{asset ? 'Memuat berkas…' : 'Media belum dipilih.'}
			</p>
		);
	return (
		<figure className="bd-media-view">
			{kind === 'image' ? (
				<img src={url} alt={alt} loading="lazy" />
			) : kind === 'audio' ? (
				<audio
					{...playbackEvents}
					src={url}
					controls
					preload="metadata"
					aria-label={caption || asset?.name || 'Audio'}
				/>
			) : (
				<video
					{...playbackEvents}
					src={url}
					controls
					preload="metadata"
					aria-label={caption || asset?.name || 'Video'}
				/>
			)}
			{caption && <figcaption>{caption}</figcaption>}
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
	onUpdate,
}: {
	block: BuilderBlock;
	courseId: string;
	onUpdate: (edit: (block: BuilderBlock) => void) => void;
}) {
	const [picker, setPicker] = useState<{ replace?: string } | null>(null),
		[linkOpen, setLinkOpen] = useState(false),
		[link, setLink] = useState(''),
		[error, setError] = useState('');
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
