import { useState, type DragEvent } from 'react';
import {
	AlignLeft,
	Image,
	Headphones,
	Video,
	Link2,
	ListChecks,
	TextCursorInput,
	Shuffle,
	FormInput,
	PenLine,
	MessageSquare,
	BookOpenCheck,
	Presentation,
	Search,
	GripVertical,
	X,
	type LucideIcon,
} from 'lucide-react';
import type { BlockType } from '@/lib/builder-document';
import { BUILDER_BLOCK_REGISTRY } from '@/lib/builder-element-registry';

export type BuilderElementBucket = 'text' | 'question' | 'media';
const bucketFor = (type: BlockType): BuilderElementBucket => BUILDER_BLOCK_REGISTRY[type].category;
export const BUILDER_ELEMENTS: {
	id: string;
	type: BlockType;
	label: string;
	description: string;
		group: string;
		bucket: BuilderElementBucket;
	icon: LucideIcon;
	shortAnswer?: boolean;
}[] = [
	{
		id: 'instructions',
		type: 'instructions',
		label: 'Teks & instruksi',
		description: 'Arahan, bacaan, atau pengantar kegiatan.',
		group: 'Konten',
		bucket: bucketFor('instructions'),
		icon: AlignLeft,
	},
	{
		id: 'image',
		type: 'image',
		label: 'Gambar',
		description: 'Ilustrasi atau foto dari tautan gambar.',
		group: 'Konten',
		bucket: bucketFor('image'),
		icon: Image,
	},
	{
		id: 'audio',
		type: 'audio',
		label: 'Audio',
		description: 'Rekaman untuk latihan menyimak.',
		group: 'Konten',
		bucket: bucketFor('audio'),
		icon: Headphones,
	},
	{
		id: 'video',
		type: 'video',
		label: 'Video',
		description: 'Video pembelajaran dari tautan.',
		group: 'Konten',
		bucket: bucketFor('video'),
		icon: Video,
	},
	{
		id: 'reference',
		type: 'reference',
		label: 'Tautan & referensi',
		description: 'Sumber bacaan atau materi tambahan.',
		group: 'Konten',
		bucket: bucketFor('reference'),
		icon: Link2,
	},
	{
		id: 'single_choice',
		type: 'question_group',
		label: 'Pilihan ganda',
		description: 'Pertanyaan dengan pilihan dan kunci jawaban.',
		group: 'Pertanyaan',
		bucket: bucketFor('question_group'),
		icon: ListChecks,
	},
	{
		id: 'short_answer',
		type: 'question_group',
		label: 'Jawaban singkat',
		description: 'Isian pendek dengan alternatif jawaban benar.',
		group: 'Pertanyaan',
		bucket: bucketFor('question_group'),
		icon: TextCursorInput,
		shortAnswer: true,
	},
	{
		id: 'matching',
		type: 'matching',
		label: 'Mencocokkan',
		description: 'Pasangkan pernyataan dengan kelompok tujuan.',
		group: 'Pertanyaan',
		bucket: bucketFor('matching'),
		icon: Shuffle,
	},
	{
		id: 'gap_passage',
		type: 'gap_passage',
		label: 'Isian dalam teks',
		description: 'Lengkapi bagian kosong dalam bacaan.',
		group: 'Pertanyaan',
		bucket: bucketFor('gap_passage'),
		icon: FormInput,
	},
	{
		id: 'writing',
		type: 'writing',
		label: 'Menulis panjang',
		description: 'Esai, surat, atau jawaban terbuka.',
		group: 'Menulis',
		bucket: bucketFor('writing'),
		icon: PenLine,
	},
	{
		id: 'reflection',
		type: 'reflection',
		label: 'Refleksi',
		description: 'Tanggapan dan refleksi mahasiswa.',
		group: 'Menulis',
		bucket: bucketFor('reflection'),
		icon: MessageSquare,
	},
	{
		id: 'lesson',
		type: 'lesson',
		label: 'Penjelasan interaktif',
		description: 'Kartu penjelasan dan dialog pembelajaran.',
		group: 'Pembelajaran',
		bucket: bucketFor('lesson'),
		icon: Presentation,
	},
	{
		id: 'acknowledgement',
		type: 'acknowledgement',
		label: 'Konfirmasi membaca',
		description: 'Konfirmasi bahwa materi sudah dipahami.',
		group: 'Pembelajaran',
		bucket: bucketFor('acknowledgement'),
		icon: BookOpenCheck,
	},
];
for (const element of BUILDER_ELEMENTS) {
	if (!BUILDER_BLOCK_REGISTRY[element.type]) throw new Error(`Missing builder block registry entry: ${element.type}`);
}
const BUCKETS: { id: BuilderElementBucket; label: string; description: string; icon: LucideIcon }[] = [
	{ id: 'text', label: 'Teks', description: 'Pengantar, bacaan, tautan, atau refleksi.', icon: AlignLeft },
	{ id: 'question', label: 'Pertanyaan', description: 'Pilihan ganda, isian, atau mencocokkan.', icon: ListChecks },
	{ id: 'media', label: 'Media', description: 'Gambar, audio, atau video.', icon: Image },
];
export const BUILDER_DRAG_TYPE = 'application/x-laras-builder-element';
export function BuilderElementLibrary({
	allowDrag = true,
	compact = false,
	onAdd,
	onDragStart,
	onDragEnd,
	disabled,
	target,
}: {
	allowDrag?: boolean;
	compact?: boolean;
	onAdd: (id: string) => void;
	onDragStart: (id: string, event: DragEvent<HTMLButtonElement>) => void;
	onDragEnd: () => void;
	disabled: boolean;
	target: string;
}) {
	const [query, setQuery] = useState('');
	const [bucket, setBucket] = useState<BuilderElementBucket | null>(null);
	const normalized = query.trim().toLocaleLowerCase('id');
	const visible = BUILDER_ELEMENTS.filter(
		(e) =>
			(!bucket || e.bucket === bucket) &&
			`${e.label} ${e.description} ${e.group}`
				.toLocaleLowerCase('id')
				.includes(normalized),
	);
	const currentBucket = BUCKETS.find((item) => item.id === bucket);
	return (
		<div className={'bd-element-library' + (compact ? ' is-compact' : '')}>
			{compact && <div className="bd-library-filters" role="group" aria-label="Jenis elemen">
				<button type="button" aria-pressed={!bucket} onClick={() => setBucket(null)}>Semua</button>
				{BUCKETS.map(item => <button type="button" key={item.id} aria-pressed={bucket === item.id} onClick={() => setBucket(item.id)}>{item.label}</button>)}
			</div>}
			{(compact || bucket) ? (
				<>
					<div className="bd-library-head" hidden={compact}>
						<button
							type="button"
							className="bd-text-button"
							onClick={() => {
								setBucket(null);
								setQuery('');
							}}
						>
							← Semua jenis
						</button>
						<strong>{currentBucket?.label}</strong>
					</div>
					<div className="bd-library-search">
						<Search size={16} aria-hidden="true" />
						<input
							type="search"
							aria-label="Cari elemen"
							placeholder={currentBucket ? `Cari ${currentBucket.label.toLocaleLowerCase('id')}…` : 'Cari semua elemen…'}
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							autoFocus={!compact}
						/>
						{query && (
							<button
								type="button"
								aria-label="Hapus pencarian elemen"
								onClick={() => setQuery('')}
							>
								<X size={14} />
							</button>
						)}
					</div>
					<p className="bd-library-hint">
						{allowDrag ? 'Klik untuk menambah atau seret ke kegiatan.' : 'Pilih untuk menambahkan ke kegiatan.'}
					</p>
					<p className="bd-library-target">{target}</p>
					<div className="bd-element-grid">
						{visible.map(({ id, label, description, icon: Icon }) => (
							<button
								type="button"
								className="bd-element-tile"
								key={id}
								disabled={disabled}
								draggable={allowDrag && !disabled}
								onDragStart={(e) => onDragStart(id, e)}
								onDragEnd={onDragEnd}
								onClick={() => onAdd(id)}
								title={description}
								aria-label={`Tambah ${label}`}
							>
								{allowDrag && <GripVertical
									className="bd-tile-grip"
									size={12}
									aria-hidden="true"
								/>}
								<Icon size={23} strokeWidth={1.5} aria-hidden="true" />
								<strong>{label}</strong>
								<small>{description}</small>
							</button>
						))}
					</div>
					{!visible.length && (
						<p className="bd-library-empty" role="status">
							Tidak ada elemen untuk “{query}”. Coba kata lain.
						</p>
					)}
				</>
			) : (
				<div className="bd-library-groups" role="group" aria-label="Jenis elemen">
					{BUCKETS.map(({ id, label, description, icon: Icon }) => (
						<button
							type="button"
							className="bd-library-group"
							key={id}
							disabled={disabled}
							onClick={() => setBucket(id)}
						>
							<Icon size={22} strokeWidth={1.5} aria-hidden="true" />
							<strong>{label}</strong>
							<small>{description}</small>
						</button>
					))}
					<p className="bd-library-target">{target}</p>
				</div>
			)}
		</div>
	);
}
