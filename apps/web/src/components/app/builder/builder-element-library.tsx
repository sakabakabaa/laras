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

export const BUILDER_ELEMENTS: {
	id: string;
	type: BlockType;
	label: string;
	description: string;
	group: string;
	icon: LucideIcon;
	shortAnswer?: boolean;
}[] = [
	{
		id: 'instructions',
		type: 'instructions',
		label: 'Teks & instruksi',
		description: 'Arahan, bacaan, atau pengantar kegiatan.',
		group: 'Konten',
		icon: AlignLeft,
	},
	{
		id: 'image',
		type: 'image',
		label: 'Gambar',
		description: 'Ilustrasi atau foto dari tautan gambar.',
		group: 'Konten',
		icon: Image,
	},
	{
		id: 'audio',
		type: 'audio',
		label: 'Audio',
		description: 'Rekaman untuk latihan menyimak.',
		group: 'Konten',
		icon: Headphones,
	},
	{
		id: 'video',
		type: 'video',
		label: 'Video',
		description: 'Video pembelajaran dari tautan.',
		group: 'Konten',
		icon: Video,
	},
	{
		id: 'reference',
		type: 'reference',
		label: 'Tautan & referensi',
		description: 'Sumber bacaan atau materi tambahan.',
		group: 'Konten',
		icon: Link2,
	},
	{
		id: 'single_choice',
		type: 'question_group',
		label: 'Pilihan ganda',
		description: 'Pertanyaan dengan pilihan dan kunci jawaban.',
		group: 'Pertanyaan',
		icon: ListChecks,
	},
	{
		id: 'short_answer',
		type: 'question_group',
		label: 'Jawaban singkat',
		description: 'Isian pendek dengan alternatif jawaban benar.',
		group: 'Pertanyaan',
		icon: TextCursorInput,
		shortAnswer: true,
	},
	{
		id: 'matching',
		type: 'matching',
		label: 'Mencocokkan',
		description: 'Pasangkan pernyataan dengan kelompok tujuan.',
		group: 'Pertanyaan',
		icon: Shuffle,
	},
	{
		id: 'gap_passage',
		type: 'gap_passage',
		label: 'Isian dalam teks',
		description: 'Lengkapi bagian kosong dalam bacaan.',
		group: 'Pertanyaan',
		icon: FormInput,
	},
	{
		id: 'writing',
		type: 'writing',
		label: 'Menulis panjang',
		description: 'Esai, surat, atau jawaban terbuka.',
		group: 'Menulis',
		icon: PenLine,
	},
	{
		id: 'reflection',
		type: 'reflection',
		label: 'Refleksi',
		description: 'Tanggapan dan refleksi mahasiswa.',
		group: 'Menulis',
		icon: MessageSquare,
	},
	{
		id: 'lesson',
		type: 'lesson',
		label: 'Penjelasan interaktif',
		description: 'Kartu penjelasan dan dialog pembelajaran.',
		group: 'Pembelajaran',
		icon: Presentation,
	},
	{
		id: 'acknowledgement',
		type: 'acknowledgement',
		label: 'Konfirmasi membaca',
		description: 'Konfirmasi bahwa materi sudah dipahami.',
		group: 'Pembelajaran',
		icon: BookOpenCheck,
	},
];
export const BUILDER_DRAG_TYPE = 'application/x-laras-builder-element';
export function BuilderElementLibrary({
	onAdd,
	onDragStart,
	onDragEnd,
	disabled,
	target,
}: {
	onAdd: (id: string) => void;
	onDragStart: (id: string, event: DragEvent<HTMLButtonElement>) => void;
	onDragEnd: () => void;
	disabled: boolean;
	target: string;
}) {
	const [query, setQuery] = useState('');
	const normalized = query.trim().toLocaleLowerCase('id');
	const visible = BUILDER_ELEMENTS.filter((e) =>
		`${e.label} ${e.description} ${e.group}`
			.toLocaleLowerCase('id')
			.includes(normalized),
	);
	return (
		<div className="bd-element-library">
			<div className="bd-library-search">
				<Search size={16} aria-hidden="true" />
				<input
					type="search"
					aria-label="Cari elemen"
					placeholder="Cari elemen…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
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
				Klik untuk menambah atau seret ke kegiatan.
			</p>
			<p className="bd-library-target">{target}</p>
			{['Konten', 'Pertanyaan', 'Menulis', 'Pembelajaran'].map((group) => {
				const elements = visible.filter((e) => e.group === group);
				return (
					elements.length > 0 && (
						<section key={group} aria-label={group}>
							<h3>{group}</h3>
							<div className="bd-element-grid">
								{elements.map(({ id, label, description, icon: Icon }) => (
									<button
										type="button"
										className="bd-element-tile"
										key={id}
										disabled={disabled}
										draggable={!disabled}
										onDragStart={(e) => onDragStart(id, e)}
										onDragEnd={onDragEnd}
										onClick={() => onAdd(id)}
										title={description}
										aria-label={`Tambah ${label}`}
									>
										<GripVertical
											className="bd-tile-grip"
											size={12}
											aria-hidden="true"
										/>
										<Icon size={23} strokeWidth={1.5} aria-hidden="true" />
										<strong>{label}</strong>
										<small>{description}</small>
									</button>
								))}
							</div>
						</section>
					)
				);
			})}
			{!visible.length && (
				<p className="bd-library-empty" role="status">
					Tidak ada elemen untuk “{query}”. Coba kata lain.
				</p>
			)}
		</div>
	);
}
