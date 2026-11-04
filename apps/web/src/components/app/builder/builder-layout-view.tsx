import '@/styles/builder-responsive.css';
import '@/styles/builder-appearance.css';
import { appearanceClassName } from '@/lib/builder-appearance';
import type { CSSProperties, ReactNode } from 'react';
import type { BuilderActivity, BuilderBlock } from '@/lib/builder-document';
import { useState } from 'react';
import { useBuilderAssetUrl } from './builder-media';
import {
	resolveActivityLayout,
	type ResolvedLayoutGroup,
	type ResolvedLayoutNode,
} from '@/lib/builder-layout';

export function layoutGroupClassName(group: ResolvedLayoutGroup) {
	const responsiveClasses = (device: 'tablet'|'mobile', value: NonNullable<ResolvedLayoutGroup['responsive']>['tablet']) => value ? [
		...(value.gap ? [`bl-${device}-gap-${value.gap}`] : []),
		...(value.padding ? [`bl-${device}-pad-${value.padding}`] : []),
	] : [];
	return [
		'bl-group',
		appearanceClassName(group.appearance),
		`bl-${group.kind}`,
		`bl-width-${group.width ?? 'full'}`,
		`bl-cols-${group.columns}`,
		`bl-gap-${group.gap}`,
		`bl-pad-${group.padding}`,
		`bl-surface-${group.surface}`,
		...(group.responsive?.tablet?.columns ? [`bl-tablet-cols-${group.responsive.tablet.columns}`] : []),
		...(group.responsive?.mobile?.columns ? [`bl-mobile-cols-${group.responsive.mobile.columns}`] : []),
		`bl-flow-${group.direction ?? 'grid'}`,
		...(group.responsive?.tablet?.direction ? [`bl-tablet-flow-${group.responsive.tablet.direction}`] : []),
		...(group.responsive?.mobile?.direction ? [`bl-mobile-flow-${group.responsive.mobile.direction}`] : []),
		...responsiveClasses('tablet', group.responsive?.tablet),
		...responsiveClasses('mobile', group.responsive?.mobile),
		...(group.align ? [`bl-align-${group.align}`] : []),
		...(group.distribute ? [`bl-distribute-${group.distribute}`] : []),
		...(group.wrap !== undefined ? [`bl-wrap-${group.wrap ? 'yes' : 'no'}`] : []),
		...(['tablet','mobile'] as const).flatMap(device => {
			const value = group.responsive?.[device];
			return value ? [ ...(value.align ? [`bl-${device}-align-${value.align}`] : []), ...(value.distribute ? [`bl-${device}-distribute-${value.distribute}`] : []), ...(value.wrap !== undefined ? [`bl-${device}-wrap-${value.wrap ? 'yes' : 'no'}`] : []) ] : [];
		}),
	].join(' ');
}

export function BuilderLayoutView({
	activity,
	renderBlock,
	renderBeforeBlock,
	renderAfterBlock,
	renderGroup,
	hideBlock,
	className = '',
	blockClassName = '',
}: {
	activity: BuilderActivity;
	renderBlock: (block: BuilderBlock) => ReactNode;
	renderBeforeBlock?: (block: BuilderBlock) => ReactNode;
	renderAfterBlock?: (block: BuilderBlock) => ReactNode;
	hideBlock?: (block: BuilderBlock) => boolean;
	renderGroup?: (
		group: ResolvedLayoutGroup,
		children: ReactNode,
	) => ReactNode;
	className?: string;
	blockClassName?: string;
}) {
	const renderNodes = (nodes: ResolvedLayoutNode[]): ReactNode =>
		nodes.map((node) => {
			if (node.kind === 'block' && hideBlock?.(node.block)) return null;
			return node.kind === 'block' ? (
				<div
					key={'block-' + node.block.id}
					className={'bl-block ' + appearanceClassName(node.block.appearance) + (blockClassName ? ' ' + blockClassName : '')}
					data-block-id={node.block.id}
				>
					{renderBeforeBlock?.(node.block)}
					{renderBlock(node.block)}
					{renderAfterBlock?.(node.block)}
				</div>
			) : (
				(() => {
					const spacing: Record<string, string> = { ...(node.paddingSides ? Object.fromEntries(Object.entries(node.paddingSides).map(([side, value]) => [`--bl-pad-${side}`, `${value}px`])) : {}), ...(node.margin ? Object.fromEntries(Object.entries(node.margin).map(([side, value]) => [`--bl-margin-${side}`, `${value}px`])) : {}), ...(node.rowGap !== undefined ? { '--bl-row-gap': `${node.rowGap}px` } : {}), ...(node.columnGap !== undefined ? { '--bl-column-gap': `${node.columnGap}px` } : {}) };
					for (const device of ['tablet', 'mobile'] as const) {
						const override = node.responsive?.[device];
						for (const [key, sides] of [['paddingSides', override?.paddingSides], ['margin', override?.margin]] as const)
							if (sides) Object.assign(spacing, Object.fromEntries(Object.entries(sides).map(([side, value]) => [`--bl-${device}-${key === 'paddingSides' ? 'pad' : 'margin'}-${side}`, `${value}px`])));
						if (override?.rowGap !== undefined) Object.assign(spacing, { [`--bl-${device}-row-gap`]: `${override.rowGap}px` });
						if (override?.columnGap !== undefined) Object.assign(spacing, { [`--bl-${device}-column-gap`]: `${override.columnGap}px` });
					}
					if (node.background?.mode === 'solid' || node.background?.mode === 'gradient') {
						const colors = { surface: 'var(--r-surface)', 'surface-2': 'var(--r-surface-2)', action: 'var(--r-action)' };
						const background = node.background;
						const gradient = background.mode === 'solid'
							? colors[background.token]
							: `linear-gradient(${background.angle}deg, ${colors[background.from]}, ${colors[background.to]})`;
						spacing.background = background.mode === 'gradient' && background.overlay && background.opacity
							? `linear-gradient(color-mix(in srgb, ${colors[background.overlay]} ${background.opacity}%, transparent), color-mix(in srgb, ${colors[background.overlay]} ${background.opacity}%, transparent)), ${gradient}`
							: gradient;
					} else if (node.background?.mode === 'image') spacing.background = 'var(--r-surface-2)';
					return (
						<LayoutGroup key={node.id} group={node} spacing={spacing} className={layoutGroupClassName(node)} maxWidth={node.maxWidth} columnWeights={node.columnWeights}>
						{renderGroup ? renderGroup(node, renderNodes(node.children)) : renderNodes(node.children)}
						</LayoutGroup>
					);
				})()
			);
		});
	return (
		<div className={'bl-layout' + (className ? ' ' + className : '')}>
			{renderNodes(resolveActivityLayout(activity))}
		</div>
	);
}

function LayoutGroup({group, spacing, className, maxWidth, columnWeights, children}: {group: ResolvedLayoutGroup; spacing: Record<string,string>; className: string; maxWidth?:number; columnWeights?:number[]; children:ReactNode}) {
	const [failed, setFailed] = useState(false);
	const asset = group.background?.mode === 'image' ? group.background.asset : undefined;
	const {url} = useBuilderAssetUrl(asset);
	const image = group.background?.mode === 'image' ? group.background : undefined;
	const colors = {surface:'var(--r-surface)','surface-2':'var(--r-surface-2)',action:'var(--r-action)'};
	const serialized = url.replace(/[\\"\n\r\f]/g, char => `\\${char.codePointAt(0)!.toString(16)} `);
	const layers = image && url && !failed ? [
		...(image.overlay && (image.opacity ?? 0) > 0 ? [`linear-gradient(color-mix(in srgb, ${colors[image.overlay]} ${image.opacity ?? 20}%, transparent), color-mix(in srgb, ${colors[image.overlay]} ${image.opacity ?? 20}%, transparent))`] : []),
		`url("${serialized}")`,
	].join(', ') : undefined;
	return <div className={className} style={{...(maxWidth?{'--bl-max-width':`${maxWidth}px`}:{}),...(columnWeights?{gridTemplateColumns:columnWeights.map(weight=>`${weight}fr`).join(' ')}:{}),...spacing,...(layers?{backgroundImage:layers,backgroundSize:image?.fit==='contain'?'contain':'cover',backgroundPosition:`${image?.positionX??50}% ${image?.positionY??50}%`,backgroundRepeat:'no-repeat'}:{})} as CSSProperties} data-layout-node={group.id} data-layout-kind={group.kind}>
		{asset && url && <img aria-hidden="true" tabIndex={-1} alt="" src={url} onError={()=>setFailed(true)} style={{position:'absolute',width:1,height:1,opacity:0,pointerEvents:'none'}} />}
		{children}
	</div>;
}
