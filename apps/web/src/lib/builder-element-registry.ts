import type { BlockType, BuilderBlock, RichText } from './builder-document';

export type BuilderPlacement = 'activity' | 'group';
export type BuilderRegistryKind = BlockType;
export type BuilderCreationDefault = 'empty_rich_text' | 'empty_media' | 'single_choice_question' | 'matching_question' | 'gap_question' | 'long_writing_question' | 'reflection_question' | 'acknowledgement_text' | 'empty_lesson';

export const BUILDER_BLOCK_REGISTRY = {
	instructions: { label: 'Teks & instruksi', category: 'text', creationDefault: 'empty_rich_text', placements: ['activity', 'group'] },
	image: { label: 'Gambar', category: 'media', creationDefault: 'empty_media', placements: ['activity', 'group'] },
	audio: { label: 'Audio', category: 'media', creationDefault: 'empty_media', placements: ['activity', 'group'] },
	video: { label: 'Video', category: 'media', creationDefault: 'empty_media', placements: ['activity', 'group'] },
	reference: { label: 'Tautan & referensi', category: 'text', creationDefault: 'empty_media', placements: ['activity', 'group'] },
	question_group: { label: 'Pertanyaan', category: 'question', creationDefault: 'single_choice_question', placements: ['activity', 'group'] },
	matching: { label: 'Mencocokkan', category: 'question', creationDefault: 'matching_question', placements: ['activity', 'group'] },
	gap_passage: { label: 'Isian dalam teks', category: 'question', creationDefault: 'gap_question', placements: ['activity', 'group'] },
	writing: { label: 'Menulis panjang', category: 'text', creationDefault: 'long_writing_question', placements: ['activity', 'group'] },
	reflection: { label: 'Refleksi', category: 'text', creationDefault: 'reflection_question', placements: ['activity', 'group'] },
	acknowledgement: { label: 'Konfirmasi membaca', category: 'text', creationDefault: 'acknowledgement_text', placements: ['activity', 'group'] },
	lesson: { label: 'Penjelasan interaktif', category: 'text', creationDefault: 'empty_lesson', placements: ['activity', 'group'] },
} as const satisfies Record<BuilderRegistryKind, { label: string; category: string; creationDefault: BuilderCreationDefault; placements: readonly BuilderPlacement[] }>;

export function createBuilderBlockDefaults(kind: BuilderRegistryKind, factories: { rich: (text: string) => RichText; uid: () => string; question: (kind: 'single_choice' | 'matching' | 'short_answer' | 'long_writing' | 'reflection') => string }): Partial<BuilderBlock> {
	const strategy = BUILDER_BLOCK_REGISTRY[kind].creationDefault;
	switch (strategy) {
		case 'empty_rich_text': return { body: factories.rich('') };
		case 'empty_media': return { url: '', label: '', alt: '' };
		case 'single_choice_question': return { questionIds: [factories.question('single_choice')] };
		case 'long_writing_question': return { questionId: factories.question('long_writing') };
		case 'reflection_question': return { questionIds: [factories.question('reflection')] };
		case 'matching_question': return { questionIds: [factories.question('matching')], destinations: [{ id: factories.uid(), label: 'A', title: 'Kelompok A' }, { id: factories.uid(), label: 'B', title: 'Kelompok B' }] };
		case 'gap_question': {
			const questionId = factories.question('short_answer');
			return { sections: [{ id: factories.uid(), segments: [{ type: 'text', text: 'Tulis kalimat sebelum isian ' }, { type: 'gap', questionId }, { type: 'text', text: '.' }] }] };
		}
		case 'acknowledgement_text': return { body: factories.rich('Saya sudah membaca dan memahami materi.') };
		case 'empty_lesson': return { lesson: { goal: { de: '', id: '' }, steps: [], scenes: [] } };
	}
}

export function isBuilderRegistryKind(value: string): value is BuilderRegistryKind {
	return Object.hasOwn(BUILDER_BLOCK_REGISTRY, value);
}

export function builderPlacementAllows(kind: string, placement: BuilderPlacement): boolean {
	return isBuilderRegistryKind(kind) && (BUILDER_BLOCK_REGISTRY[kind].placements as readonly string[]).includes(placement);
}
