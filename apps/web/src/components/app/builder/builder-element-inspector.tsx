import { useState } from 'react';
import {
	questionIds,
	type BuilderBlock,
	type BuilderEnvelope,
} from '@/lib/builder-document';
import { BuilderAppearanceControls } from './builder-appearance-controls';
import { BlockEditor, KeyInspector } from './builder-elements';

export function BuilderElementInspector({
	block,
	envelope,
	disabled,
	onChange,
}: {
	block: BuilderBlock;
	envelope: BuilderEnvelope;
	disabled: boolean;
	onChange: (edit: (draft: BuilderEnvelope) => void) => void;
}) {
	const [panel, setPanel] = useState<'content' | 'assessment' | 'style'>(() =>
		questionIds(block).length ? 'assessment' : 'style',
	);
	return (
		<fieldset disabled={disabled}>
			<div
				className="bd-inspector-tabs"
				role="group"
				aria-label="Pengaturan elemen"
			>
				<button
					type="button"
					className={panel === 'content' ? 'is-active' : ''}
					aria-pressed={panel === 'content'}
					onClick={() => setPanel('content')}
				>
					Isi
				</button>
				<button
					type="button"
					className={panel === 'style' ? 'is-active' : ''}
					aria-pressed={panel === 'style'}
					onClick={() => setPanel('style')}
				>
					Tampilan
				</button>
				<button
					type="button"
					className={panel === 'assessment' ? 'is-active' : ''}
					aria-pressed={panel === 'assessment'}
					onClick={() => setPanel('assessment')}
				>
					Penilaian
				</button>
			</div>
			{panel === 'content' ? (
				<BlockEditor
					idPrefix="builder-inspector-question-"
					block={block}
					envelope={envelope}
					onChange={onChange}
				/>
			) : panel === 'style' ? (
				<BuilderAppearanceControls
					value={block.appearance}
					onChange={(appearance) =>
						onChange((draft) => {
							const target = draft.document.activities
								.flatMap((activity) => activity.blocks)
								.find((item) => item.id === block.id);
							if (target) {
								if (appearance) target.appearance = appearance;
								else delete target.appearance;
							}
						})
					}
				/>
			) : (
				<KeyInspector block={block} envelope={envelope} onChange={onChange} />
			)}
		</fieldset>
	);
}
