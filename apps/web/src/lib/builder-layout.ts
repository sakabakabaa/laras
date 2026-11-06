import type { BuilderAppearance } from './builder-appearance';
import type { BuilderActivity, BuilderAsset, BuilderBlock } from './builder-document';

export type BuilderLayoutGroupKind = 'section' | 'container';
export type BuilderThemeBackgroundToken = 'surface' | 'surface-2' | 'action';
export type BuilderLayoutBackground =
	| { mode: 'transparent' }
	| { mode: 'image'; asset: BuilderAsset; fit?: 'cover' | 'contain'; positionX?: number; positionY?: number; overlay?: BuilderThemeBackgroundToken; opacity?: number }
	| { mode: 'solid'; token: BuilderThemeBackgroundToken }
	| { mode: 'gradient'; from: BuilderThemeBackgroundToken; to: BuilderThemeBackgroundToken; angle: number; overlay?: BuilderThemeBackgroundToken; opacity?: number };
export type BuilderLayoutSurface = 'none' | 'muted' | 'accent';
export type BuilderLayoutGap = 'none' | 'sm' | 'md' | 'lg';
export type BuilderLayoutPadding = 'none' | 'sm' | 'md';
export type BuilderLayoutWidth = 'full' | 'contained';
export type BuilderLayoutDirection = 'grid' | 'row' | 'column';
export type BuilderLayoutAlign = 'start' | 'center' | 'end' | 'stretch';
export type BuilderLayoutDistribute = 'start' | 'center' | 'end' | 'between';
export type BuilderColumnWeights = [number, number] | [number, number, number];
export type BuilderSideSpacing = { top?: number; right?: number; bottom?: number; left?: number };
export type BuilderResponsiveOverride = { columns?: 1 | 2 | 3; direction?: BuilderLayoutDirection; align?: BuilderLayoutAlign; distribute?: BuilderLayoutDistribute; wrap?: boolean; gap?: BuilderLayoutGap; padding?: BuilderLayoutPadding; paddingSides?: BuilderSideSpacing; paddingLinked?: boolean; margin?: BuilderSideSpacing; marginLinked?: boolean; rowGap?: number; columnGap?: number; background?: BuilderLayoutBackground };
export function resolveLayoutBackground(group: Pick<BuilderLayoutGroup, 'background' | 'responsive'>, device: 'tablet' | 'mobile'): BuilderLayoutBackground | undefined {
	if (device === 'mobile' && group.responsive?.mobile?.background !== undefined) return group.responsive.mobile.background;
	if (group.responsive?.tablet?.background !== undefined) return group.responsive.tablet.background;
	return group.background;
}
export function resetResponsiveOverride(group: BuilderLayoutGroup, device: 'tablet' | 'mobile') {
	if (group.responsive) {
		delete group.responsive[device];
		if (!Object.keys(group.responsive).length) delete group.responsive;
	}
}
export type BuilderLayoutBlock = { kind: 'block'; blockId: string };
export type BuilderLayoutGroup = {
	layoutLocked?: boolean;
	kind: BuilderLayoutGroupKind;
	id: string;
	title: string;
	columns: 1 | 2 | 3;
	gap: BuilderLayoutGap;
	padding: BuilderLayoutPadding;
	surface: BuilderLayoutSurface;
	background?: BuilderLayoutBackground;
	appearance?: BuilderAppearance;
	width?: BuilderLayoutWidth;
	maxWidth?: number;
	columnWeights?: BuilderColumnWeights;
	direction?: BuilderLayoutDirection;
	align?: BuilderLayoutAlign;
	distribute?: BuilderLayoutDistribute;
	wrap?: boolean;
	paddingSides?: BuilderSideSpacing;
	paddingLinked?: boolean;
	margin?: BuilderSideSpacing;
	marginLinked?: boolean;
	rowGap?: number;
	columnGap?: number;
	responsive?: { tablet?: BuilderResponsiveOverride; mobile?: BuilderResponsiveOverride };
	children: BuilderLayoutNode[];
};
export type BuilderLayoutNode = BuilderLayoutBlock | BuilderLayoutGroup;
export type BuilderLayout = { schemaVersion: 1; nodes: BuilderLayoutNode[] };

export function setLayoutSide(target: BuilderLayoutGroup | BuilderResponsiveOverride, key: 'paddingSides' | 'margin', side: 'top' | 'right' | 'bottom' | 'left', value: number | undefined, linked: boolean): void {
	if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 120)) return;
	const next = { ...(target[key] ?? {}) };
	for (const name of linked ? ['top', 'right', 'bottom', 'left'] as const : [side]) {
		if (value === undefined) delete next[name];
		else next[name] = value;
	}
	if (Object.keys(next).length) target[key] = next;
	else delete target[key];
}

export const LAYOUT_LIMITS = {
	maxDepth: 3,
	maxNodes: 600,
	maxGroups: 40,
} as const;

export type ResolvedLayoutBlock = { kind: 'block'; block: BuilderBlock };
export type ResolvedLayoutGroup = {
	kind: BuilderLayoutGroupKind;
	id: string;
	title: string;
	columns: 1 | 2 | 3;
	gap: BuilderLayoutGap;
	padding: BuilderLayoutPadding;
	surface: BuilderLayoutSurface;
	background?: BuilderLayoutBackground;
	appearance?: BuilderAppearance;
	width?: BuilderLayoutWidth;
	maxWidth?: number;
	columnWeights?: BuilderColumnWeights;
	direction?: BuilderLayoutDirection;
	align?: BuilderLayoutAlign;
	distribute?: BuilderLayoutDistribute;
	wrap?: boolean;
	paddingSides?: BuilderSideSpacing;
	margin?: BuilderSideSpacing;
	rowGap?: number;
	columnGap?: number;
	responsive?: { tablet?: BuilderResponsiveOverride; mobile?: BuilderResponsiveOverride };
	children: ResolvedLayoutNode[];
};
export type ResolvedLayoutNode = ResolvedLayoutBlock | ResolvedLayoutGroup;
export type LayoutPathItem = {
	kind: BuilderLayoutGroupKind | 'block';
	id: string;
	title: string;
};

export function newLayoutGroup(
	kind: BuilderLayoutGroupKind,
	columns: 1 | 2 | 3 = kind === 'section' ? 1 : 2,
): BuilderLayoutGroup {
	return {
		kind,
		id: crypto.randomUUID(),
		title: kind === 'section' ? 'Bagian baru' : 'Kontainer baru',
		columns,
		gap: 'md',
		padding: 'none',
		surface: 'none',
		children: [],
	};
}

export function ensureLayout(activity: BuilderActivity): BuilderLayout {
	if (!activity.layout)
		activity.layout = {
			schemaVersion: 1,
			nodes: activity.blocks.map((block) => ({
				kind: 'block',
				blockId: block.id,
			})),
		};
	return activity.layout;
}

function groupChildren(
	layout: BuilderLayout,
	parentId: string | null,
): BuilderLayoutNode[] | null {
	if (!parentId) return layout.nodes;
	return findLayoutGroup(layout, parentId)?.children || null;
}

export function findLayoutGroup(
	layout: BuilderLayout,
	id: string,
): BuilderLayoutGroup | null {
	const walk = (nodes: BuilderLayoutNode[]): BuilderLayoutGroup | null => {
		for (const node of nodes) {
			if (node.kind === 'block') continue;
			if (node.id === id) return node;
			const found = walk(node.children);
			if (found) return found;
		}
		return null;
	};
	return walk(layout.nodes);
}

function findParent(
	nodes: BuilderLayoutNode[],
	id: string,
): {
	parent: BuilderLayoutGroup | null;
	index: number;
	node: BuilderLayoutNode;
} | null {
	for (let index = 0; index < nodes.length; index++) {
		const node = nodes[index];
		if (
			(node.kind === 'block' && node.blockId === id) ||
			(node.kind !== 'block' && node.id === id)
		)
			return { parent: null, index, node };
		if (node.kind === 'block') continue;
		const found = findParent(node.children, id);
		if (found) return found.parent ? found : { ...found, parent: node };
	}
	return null;
}

export function layoutItemLocation(
	activity: BuilderActivity,
	id: string,
) {
	if (!activity.layout) return null;
	return findParent(activity.layout.nodes, id);
}

export function countLayoutGroups(layout: BuilderLayout): number {
	const walk = (nodes: BuilderLayoutNode[]): number =>
		nodes.reduce(
			(sum, node) =>
				sum + (node.kind === 'block' ? 0 : 1 + walk(node.children)),
			0,
		);
	return walk(layout.nodes);
}

export function countLayoutNodes(layout: BuilderLayout): number {
	const walk = (nodes: BuilderLayoutNode[]): number =>
		nodes.reduce(
			(sum, node) =>
				sum +
				1 +
				(node.kind === 'block' ? 0 : walk(node.children)),
			0,
		);
	return walk(layout.nodes);
}

export function layoutGroupDepth(layout: BuilderLayout, id: string): number {
	const walk = (nodes: BuilderLayoutNode[], depth: number): number => {
		for (const node of nodes) {
			if (node.kind === 'block') continue;
			if (node.id === id) return depth;
			const found = walk(node.children, depth + 1);
			if (found) return found;
		}
		return 0;
	};
	return walk(layout.nodes, 1);
}

function subtreeDepth(node: BuilderLayoutNode): number {
	if (node.kind === 'block') return 0;
	return 1 + Math.max(0, ...node.children.map(subtreeDepth));
}

function containsNode(node: BuilderLayoutNode, id: string): boolean {
	if (node.kind !== 'block' && node.id === id) return true;
	return node.kind === 'block'
		? false
		: node.children.some((child) => containsNode(child, id));
}

function removeItem(activity: BuilderActivity, id: string) {
	const location = layoutItemLocation(activity, id);
	if (!location || !activity.layout) return null;
	const children = location.parent
		? location.parent.children
		: activity.layout.nodes;
	return children.splice(location.index, 1)[0] || null;
}

export function addLayoutGroup(
	activity: BuilderActivity,
	kind: BuilderLayoutGroupKind,
	parentId: string | null = null,
	columns: 1 | 2 | 3 = kind === 'section' ? 1 : 2,
): string {
	const layout = ensureLayout(activity);
	const children = groupChildren(layout, parentId);
	if (!children) return '';
	const groups = countLayoutGroups(layout);
	if (
		groups >= LAYOUT_LIMITS.maxGroups ||
		countLayoutNodes(layout) >= LAYOUT_LIMITS.maxNodes
	)
		return '';
	const depth = parentId ? layoutGroupDepth(layout, parentId) : 0;
	if (depth >= LAYOUT_LIMITS.maxDepth) return '';
	const group = newLayoutGroup(kind, columns);
	children.push(group);
	return group.id;
}

export function removeLayoutGroup(
	activity: BuilderActivity,
	groupId: string,
): boolean {
	const location = layoutItemLocation(activity, groupId);
	if (!location || location.node.kind === 'block' || !activity.layout)
		return false;
	const children = location.parent
		? location.parent.children
		: activity.layout.nodes;
	const [group] = children.splice(location.index, 1) as BuilderLayoutGroup[];
	children.splice(location.index, 0, ...group.children);
	return true;
}

export function moveLayoutGroup(
	activity: BuilderActivity,
	groupId: string,
	parentId: string | null,
	index?: number,
): boolean {
	if (!activity.layout) return false;
	const location = layoutItemLocation(activity, groupId);
	if (!location || location.node.kind === 'block') return false;
	const target = parentId ? findLayoutGroup(activity.layout, parentId) : null;
	if (parentId && !target) return false;
	if (parentId === groupId) return false;
	if (target && containsNode(location.node, target.id)) return false;
	const depth = parentId ? layoutGroupDepth(activity.layout, parentId) : 0;
	const height = subtreeDepth(location.node);
	if (depth + height > LAYOUT_LIMITS.maxDepth) return false;
	const oldIndex = location.index;
	removeItem(activity, groupId);
	const children = groupChildren(activity.layout, parentId);
	if (!children) return false;
	let at = index === undefined ? children.length : Math.max(0, index);
	if (location.parent === target && index !== undefined && index > oldIndex)
		at = index - 1;
	children.splice(Math.min(at, children.length), 0, location.node);
	return true;
}

export function moveBlockInLayout(
	activity: BuilderActivity,
	blockId: string,
	parentId: string | null,
	index?: number,
): boolean {
	if (!activity.layout) return false;
	if (parentId && !findLayoutGroup(activity.layout, parentId)) return false;
	if (!layoutItemLocation(activity, blockId)) {
		if (!insertBlockIntoLayout(activity, blockId)) return false;
	}
	const location = layoutItemLocation(activity, blockId);
	if (!location || location.node.kind !== 'block') return false;
	const target = parentId ? findLayoutGroup(activity.layout, parentId) : null;
	if (parentId && !target) return false;
	const oldIndex = location.index;
	const moving = removeItem(activity, blockId);
	if (!moving) return false;
	const children = groupChildren(activity.layout, parentId);
	if (!children) return false;
	let at = index === undefined ? children.length : Math.max(0, index);
	if (location.parent === target && index !== undefined && index > oldIndex)
		at = index - 1;
	children.splice(Math.min(at, children.length), 0, moving);
	return true;
}

export function moveBlockBefore(
	activity: BuilderActivity,
	blockId: string,
	beforeBlockId?: string,
	parentId: string | null = null,
): boolean {
	if (!activity.layout) return false;
	if (blockId === beforeBlockId) return false;
	reconcileActivityLayout(activity, true);
	const location = beforeBlockId
		? layoutItemLocation(activity, beforeBlockId)
		: null;
	const targetParent = location?.parent?.id || parentId;
	const targetIndex = location?.index;
	return moveBlockInLayout(
		activity,
		blockId,
		targetParent,
		targetIndex,
	);
}

export function insertBlockIntoLayout(
	activity: BuilderActivity,
	blockId: string,
	parentId: string | null = null,
	index?: number,
): boolean {
	if (!activity.layout) return false;
	if (!activity.blocks.some((block) => block.id === blockId)) return false;
	const children = groupChildren(activity.layout, parentId);
	if (!children) return false;
	removeBlockFromLayout(activity, blockId);
	const targetChildren = groupChildren(activity.layout, parentId)!;
	const at = index === undefined ? children.length : Math.max(0, index);
	targetChildren.splice(Math.min(at, targetChildren.length), 0, {
		kind: 'block',
		blockId,
	});
	return true;
}

export function removeBlockFromLayout(
	activity: BuilderActivity,
	blockId: string,
): boolean {
	if (!activity.layout) return false;
	let removed = false;
	const walk = (nodes: BuilderLayoutNode[]): BuilderLayoutNode[] =>
		nodes.filter((node) => {
			if (node.kind === 'block') {
				if (node.blockId !== blockId) return true;
				removed = true;
				return false;
			}
			node.children = walk(node.children);
			return true;
		});
	activity.layout.nodes = walk(activity.layout.nodes);
	return removed;
}

export function moveBlockBetweenActivities(
	source: BuilderActivity,
	target: BuilderActivity,
	blockId: string,
	beforeBlockId?: string,
	parentId: string | null = null,
): boolean {
	if (source.id === target.id) return false;
	if (parentId && (!target.layout || !findLayoutGroup(target.layout, parentId))) return false;
	const index = source.blocks.findIndex((block) => block.id === blockId);
	if (index < 0) return false;
	const [block] = source.blocks.splice(index, 1);
	const targetIndex = beforeBlockId ? target.blocks.findIndex(item => item.id === beforeBlockId) : -1;
	target.blocks.splice(targetIndex < 0 ? target.blocks.length : targetIndex, 0, block);
	removeBlockFromLayout(source, blockId);
	if (target.layout) {
		insertBlockIntoLayout(target, blockId, parentId);
		if (beforeBlockId) moveBlockBefore(target, blockId, beforeBlockId, parentId);
	}
	return true;
}

export function moveLayoutItem(
	activity: BuilderActivity,
	id: string,
	delta: number,
): boolean {
	if (activity.layout) reconcileActivityLayout(activity, true);
	const location = layoutItemLocation(activity, id);
	if (!location || !activity.layout) return false;
	const children = location.parent
		? location.parent.children
		: activity.layout.nodes;
	const to = location.index + delta;
	if (to < 0 || to >= children.length) return false;
	[children[location.index], children[to]] = [
		children[to],
		children[location.index],
	];
	return true;
}

export function reparentLayoutItem(
	activity: BuilderActivity,
	id: string,
	direction: 'in' | 'out',
): boolean {
	if (activity.layout) reconcileActivityLayout(activity, true);
	const location = layoutItemLocation(activity, id);
	if (!location || !activity.layout) return false;
	if (direction === 'in') {
		const previous = location.parent
			? location.parent.children[location.index - 1]
			: activity.layout.nodes[location.index - 1];
		if (!previous || previous.kind === 'block') return false;
		return location.node.kind === 'block'
			? moveBlockInLayout(activity, id, previous.id)
			: moveLayoutGroup(activity, id, previous.id);
	}
	if (!location.parent) return false;
	const parentLocation = layoutItemLocation(activity, location.parent.id);
	if (!parentLocation) return false;
	const targetId = parentLocation.parent?.id || null;
	const index = parentLocation.index + 1;
	return location.node.kind === 'block'
		? moveBlockInLayout(activity, id, targetId, index)
		: moveLayoutGroup(activity, id, targetId, index);
}

export function layoutPath(
	activity: BuilderActivity,
	id: string,
): LayoutPathItem[] {
	if (!activity.layout) return [];
	const walk = (
		nodes: BuilderLayoutNode[],
		path: LayoutPathItem[],
	): LayoutPathItem[] | null => {
		for (const node of nodes) {
			if (node.kind === 'block') {
				if (node.blockId === id)
					return [...path, { kind: 'block', id: node.blockId, title: '' }];
				continue;
			}
			const next = [
				...path,
				{ kind: node.kind, id: node.id, title: node.title },
			];
			if (node.id === id) return next;
			const found = walk(node.children, next);
			if (found) return found;
		}
		return null;
	};
	return walk(activity.layout.nodes, []) || [];
}

export function reconcileActivityLayout(activity: BuilderActivity, placeUnassigned = false): boolean {
	if (!activity.layout) return false;
	const available = new Set(activity.blocks.map((block) => block.id));
	const seen = new Set<string>();
	let changed = false;
	const walk = (nodes: BuilderLayoutNode[]): BuilderLayoutNode[] =>
		nodes.flatMap<BuilderLayoutNode>((node) => {
			if (node.kind !== 'block') {
				const children = walk(node.children);
				if (children.length !== node.children.length) changed = true;
				node.children = children;
				return [node];
			}
			if (!available.has(node.blockId) || seen.has(node.blockId)) {
				changed = true;
				return [];
			}
			seen.add(node.blockId);
			return [node];
		});
	activity.layout.nodes = walk(activity.layout.nodes);
	if (placeUnassigned)
		for (const block of activity.blocks)
			if (!seen.has(block.id)) {
				activity.layout.nodes.push({ kind: 'block', blockId: block.id });
				changed = true;
			}
	return changed;
}

export function canMoveLayoutItem(activity: BuilderActivity, id: string, delta: number): boolean {
	const walk = (nodes: ResolvedLayoutNode[]): boolean => {
		const index = nodes.findIndex(node => node.kind === 'block' ? node.block.id === id : node.id === id);
		if (index >= 0) return index + delta >= 0 && index + delta < nodes.length;
		return nodes.some(node => node.kind !== 'block' && walk(node.children));
	};
	return walk(resolveActivityLayout(activity));
}

export function resolveActivityLayout(
	activity: BuilderActivity,
): ResolvedLayoutNode[] {
	const blocks = new Map(activity.blocks.map((block) => [block.id, block]));
	const seen = new Set<string>();
	const walk = (nodes: BuilderLayoutNode[]): ResolvedLayoutNode[] =>
		nodes.flatMap<ResolvedLayoutNode>((node) => {
			if (node.kind === 'block') {
				const block = blocks.get(node.blockId);
				if (!block || seen.has(node.blockId)) return [];
				seen.add(node.blockId);
				return [{ kind: 'block' as const, block }];
			}
			return [
				{
					kind: node.kind,
					id: node.id,
					title: node.title,
					columns: node.columns,
					gap: node.gap,
					padding: node.padding,
					surface: node.surface,
					...(node.background ? { background: node.background } : {}),
					...(node.appearance ? { appearance: node.appearance } : {}),
					...(node.width ? { width: node.width } : {}),
					...(node.maxWidth ? { maxWidth: node.maxWidth } : {}),
					...(node.columnWeights ? { columnWeights: node.columnWeights } : {}),
					...(node.direction ? { direction: node.direction } : {}),
					...(node.align ? { align: node.align } : {}),
					...(node.distribute ? { distribute: node.distribute } : {}),
					...(node.wrap !== undefined ? { wrap: node.wrap } : {}),
					...(node.paddingSides ? { paddingSides: node.paddingSides } : {}),
					...(node.margin ? { margin: node.margin } : {}),
					...(node.rowGap !== undefined ? { rowGap: node.rowGap } : {}),
					...(node.columnGap !== undefined ? { columnGap: node.columnGap } : {}),
					...(node.responsive ? { responsive: node.responsive } : {}),
					children: walk(node.children),
				},
			];
		});
	const nodes = activity.layout ? walk(activity.layout.nodes) : [];
	for (const block of activity.blocks)
		if (!seen.has(block.id)) {
			seen.add(block.id);
			nodes.push({ kind: 'block', block });
		}
	return nodes;
}

export function flattenResolvedBlocks(
	nodes: ResolvedLayoutNode[],
): BuilderBlock[] {
	return nodes.flatMap((node) =>
		node.kind === 'block' ? [node.block] : flattenResolvedBlocks(node.children),
	);
}
