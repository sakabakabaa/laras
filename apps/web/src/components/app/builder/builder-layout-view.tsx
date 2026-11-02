import type { ReactNode } from 'react';
import type { BuilderActivity, BuilderBlock } from '@/lib/builder-document';
import {
	resolveActivityLayout,
	type ResolvedLayoutGroup,
	type ResolvedLayoutNode,
} from '@/lib/builder-layout';

export function layoutGroupClassName(group: ResolvedLayoutGroup) {
	return [
		'bl-group',
		`bl-${group.kind}`,
		`bl-cols-${group.columns}`,
		`bl-gap-${group.gap}`,
		`bl-pad-${group.padding}`,
		`bl-surface-${group.surface}`,
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
					className={'bl-block' + (blockClassName ? ' ' + blockClassName : '')}
					data-block-id={node.block.id}
				>
					{renderBeforeBlock?.(node.block)}
					{renderBlock(node.block)}
					{renderAfterBlock?.(node.block)}
				</div>
			) : (
				<div
					key={node.id}
					className={layoutGroupClassName(node)}
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
		});
	return (
		<div className={'bl-layout' + (className ? ' ' + className : '')}>
			{renderNodes(resolveActivityLayout(activity))}
		</div>
	);
}
