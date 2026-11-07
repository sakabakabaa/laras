import { useState } from 'react';
import {
	questionIds,
	type BuilderBlock,
	type BuilderEnvelope,
} from '@/lib/builder-document';
import { BuilderAppearanceControls } from './builder-appearance-controls';
import { KeyInspector } from './builder-elements';
import { BuilderInspectorDispatch } from './builder-inspector-dispatch';
import { isBuilderRegistryKind } from '@/lib/builder-element-registry';
import { builderAnchors } from '@/lib/builder-document';
import { BuilderAnchorControl } from './builder-anchor-control';
import { BuilderVisibilityControl } from './builder-visibility-control';
import { builderBlockCanBeHidden } from '@/lib/builder-document';

export function BuilderElementInspector({
	block,
	envelope,
	disabled,
	customColorsSupported = true,
	detailedBorderRadiusSupported = false,
	responsiveBorderRadiusSupported = false,
	captionsSupported = false,
	nestedListsSupported = false,
	presentationVisibilitySupported = false,
	onChange,
}: {
	block: BuilderBlock;
	envelope: BuilderEnvelope;
	disabled: boolean;
	customColorsSupported?: boolean;
	detailedBorderRadiusSupported?: boolean;
	responsiveBorderRadiusSupported?: boolean;
	captionsSupported?: boolean;
	nestedListsSupported?: boolean;
	presentationVisibilitySupported?: boolean;
	onChange: (edit: (draft: BuilderEnvelope) => void) => void;
}) {
	const [panel, setPanel] = useState<'content' | 'assessment' | 'style'>(() =>
		questionIds(block).length ? 'assessment' : 'style',
	);
	if (!isBuilderRegistryKind((block as { type: string }).type)) {
		return (
			<div role="status" aria-label="Elemen tidak didukung">
				Elemen ini memakai format yang tidak didukung. Konten, penilaian, dan
				pengaturannya tidak dapat diedit di sini.
			</div>
		);
	}
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
				<BuilderInspectorDispatch
					idPrefix="builder-inspector-question-"
					block={block}
					envelope={envelope}
					captionsSupported={captionsSupported}
					nestedListsSupported={nestedListsSupported}
					onChange={onChange}
				/>
			) : panel === 'style' ? (
				<>
				<BuilderAppearanceControls
					value={block.appearance}
					customColorsSupported={customColorsSupported}
					detailedBorderRadiusSupported={detailedBorderRadiusSupported}
					responsiveBorderRadiusSupported={responsiveBorderRadiusSupported}
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
				{builderBlockCanBeHidden(block) ? <BuilderVisibilityControl value={block.presentation} disabled={disabled || !presentationVisibilitySupported} onChange={presentation => onChange(draft => { const target = draft.document.activities.flatMap(activity => activity.blocks).find(item => item.id === block.id); if (target) { if (presentation) target.presentation = presentation; else delete target.presentation; } })} /> : <p className="bd-help">Visibilitas tidak tersedia: elemen jawaban, pengakuan, dan jenis yang belum didukung harus selalu dapat ditemukan.</p>}
				</>
			) : (
				<KeyInspector block={block} envelope={envelope} onChange={onChange} />
			)}
			<BuilderAnchorControl value={block.anchor} used={builderAnchors(envelope).map(item => item.anchor)} disabled={disabled} onApply={anchor => onChange(draft => {
				const target = draft.document.activities.flatMap(activity => activity.blocks).find(item => item.id === block.id);
				if (target) target.anchor = anchor;
			})} onClear={() => onChange(draft => {
				const target = draft.document.activities.flatMap(activity => activity.blocks).find(item => item.id === block.id);
				if (target) delete target.anchor;
			})} />
		</fieldset>
	);
}
