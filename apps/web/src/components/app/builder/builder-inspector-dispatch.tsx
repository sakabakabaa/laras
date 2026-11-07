import type { ComponentType } from 'react';
import type { BuilderBlock, BuilderEnvelope } from '@/lib/builder-document';
import { isBuilderRegistryKind, type BuilderRegistryKind } from '@/lib/builder-element-registry';
import { BlockEditor } from './builder-elements';

type InspectorEditorProps = {
	block: BuilderBlock;
	envelope: BuilderEnvelope;
	onChange: (edit: (draft: BuilderEnvelope) => void) => void;
	idPrefix?: string;
	captionsSupported?: boolean;
	nestedListsSupported?: boolean;
};

	type InspectorRoute = {
	control: 'rich_text' | 'media' | 'reference' | 'question' | 'matching' | 'gap' | 'lesson';
	Editor: ComponentType<InspectorEditorProps>;
};

// Keep this React-only routing table separate from the data registry. Adding a
// persisted kind now requires an explicit inspector route at compile time.
export const BUILDER_INSPECTOR_ROUTES = {
	instructions: { control: 'rich_text', Editor: BlockEditor },
	image: { control: 'media', Editor: BlockEditor },
	audio: { control: 'media', Editor: BlockEditor },
	video: { control: 'media', Editor: BlockEditor },
	reference: { control: 'reference', Editor: BlockEditor },
	question_group: { control: 'question', Editor: BlockEditor },
	matching: { control: 'matching', Editor: BlockEditor },
	gap_passage: { control: 'gap', Editor: BlockEditor },
	writing: { control: 'rich_text', Editor: BlockEditor },
	reflection: { control: 'rich_text', Editor: BlockEditor },
	acknowledgement: { control: 'rich_text', Editor: BlockEditor },
	lesson: { control: 'lesson', Editor: BlockEditor },
} satisfies Record<BuilderRegistryKind, InspectorRoute>;

export function BuilderInspectorDispatch(props: InspectorEditorProps) {
	const kind = (props.block as { type: string }).type;
	if (!isBuilderRegistryKind(kind)) {
		return (
			<div role="status" aria-label="Elemen tidak didukung">
				Elemen ini memakai format yang tidak didukung. Kontennya hanya ditampilkan
				sebagai tersimpan dan tidak dapat diedit di sini.
			</div>
		);
	}
	const Editor = BUILDER_INSPECTOR_ROUTES[kind].Editor;
	return <Editor {...props} />;
}
