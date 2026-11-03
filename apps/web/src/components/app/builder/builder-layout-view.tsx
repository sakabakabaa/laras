import '@/styles/builder-responsive.css';
import '@/styles/builder-appearance.css';
import { appearanceClassName } from '@/lib/builder-appearance';
import type { CSSProperties, ReactNode } from 'react';
import type { BuilderActivity, BuilderBlock } from '@/lib/builder-document';
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
		...responsiveClasses('tablet', group.responsive?.tablet),
		...responsiveClasses('mobile', group.responsive?.mobile),
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
					return (
				<div
					key={node.id}
					className={layoutGroupClassName(node)}
					style={{ ...(node.maxWidth ? { '--bl-max-width': `${node.maxWidth}px` } : {}), ...(node.columnWeights ? { gridTemplateColumns: node.columnWeights.map(weight => `${weight}fr`).join(' ') } : {}), ...spacing } as CSSProperties}
					data-layout-node={node.id}
					data-layout-kind={node.kind}
				>
					{renderGroup ? (
						renderGroup(node, renderNodes(node.children))
					) : (
						renderNodes(node.children)
					)}
				</div>
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
