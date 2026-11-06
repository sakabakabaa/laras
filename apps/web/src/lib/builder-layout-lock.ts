import type { BuilderActivity, BuilderEnvelope } from './builder-document';
import { findLayoutGroup, resolveActivityLayout, type BuilderLayoutNode, type ResolvedLayoutNode } from './builder-layout';

export const LAYOUT_LOCK_REASON = 'Tata letak terkunci: buka kunci elemen atau leluhurnya terlebih dahulu. Posisi elemen terlindungi tidak boleh berubah.';
export const LAYOUT_LOCK_CAPABILITY_REASON = 'Backend belum mendukung kunci tata letak. Draf berkunci hanya dapat dibaca/diunduh agar data tidak hilang.';

type Entry = { id: string; own: boolean; inheritedFrom?: string; path: string; structure: string };

function entries(activities: readonly BuilderActivity[]): Entry[] {
	const result: Entry[] = [];
	activities.forEach((activity, activityIndex) => {
		const structure = (node: ResolvedLayoutNode): unknown => node.kind === 'block'
			? ['block', node.block.id, node.block.type]
			: [node.kind, node.id, node.children.map(structure)];
		const walk = (nodes: ResolvedLayoutNode[], path: unknown[], inheritedFrom?: string) => {
			nodes.forEach((node, index) => {
				const id = node.kind === 'block' ? node.block.id : node.id;
				const source = node.kind === 'block' ? node.block : activity.layout && findLayoutGroup(activity.layout, id);
				const own = source?.layoutLocked === true;
				const location = [...path, index, node.kind, id];
				result.push({ id, own, inheritedFrom, path: JSON.stringify(location), structure: JSON.stringify(structure(node)) });
				if (node.kind !== 'block') walk(node.children, location, inheritedFrom || (own ? node.id : undefined));
			});
		};
		walk(resolveActivityLayout(activity), [activityIndex, activity.id]);
	});
	return result;
}

export function layoutLockState(activity: BuilderActivity, nodeId: string) {
	const blocks = new Map(activity.blocks.map(block => [block.id, block]));
	const containsLock = (nodes: BuilderLayoutNode[]): boolean => nodes.some(node => node.kind === 'block'
		? blocks.get(node.blockId)?.layoutLocked === true
		: node.layoutLocked === true || containsLock(node.children));
	const walk = (nodes: BuilderLayoutNode[], inheritedFrom?: string): { own: boolean; inheritedFrom?: string; protectedStructure: boolean } | undefined => {
		for (const node of nodes) {
			const id = node.kind === 'block' ? node.blockId : node.id;
			const own = (node.kind === 'block' ? blocks.get(id)?.layoutLocked : node.layoutLocked) === true;
			if (id === nodeId) return { own, inheritedFrom, protectedStructure: own || Boolean(inheritedFrom) || (node.kind !== 'block' && containsLock(node.children)) };
			if (node.kind !== 'block') {
				const found = walk(node.children, inheritedFrom || (own ? node.id : undefined));
				if (found) return found;
			}
		}
	};
	const found = walk(activity.layout?.nodes ?? []);
	const own = blocks.get(nodeId)?.layoutLocked === true;
	return found ?? { own, inheritedFrom: undefined, protectedStructure: own };
}

export function activityLayoutProtected(activity: BuilderActivity): boolean {
	const groups = (nodes: BuilderLayoutNode[]): boolean => nodes.some(node => node.kind !== 'block' && (node.layoutLocked === true || groups(node.children)));
	return activity.blocks.some(block => block.layoutLocked === true) || groups(activity.layout?.nodes ?? []);
}

export function hasLayoutLockFields(envelope: BuilderEnvelope): boolean {
	const groups = (nodes: BuilderLayoutNode[]): boolean => nodes.some(node => node.kind !== 'block' && (node.layoutLocked !== undefined || groups(node.children)));
	return envelope.document.activities.some(activity => activity.blocks.some(block => block.layoutLocked !== undefined) || groups(activity.layout?.nodes ?? []));
}

export function layoutLockTransitionReason(prior: BuilderEnvelope, next: BuilderEnvelope, supported: boolean): string | null {
	if (!supported && (hasLayoutLockFields(prior) || hasLayoutLockFields(next))) return LAYOUT_LOCK_CAPABILITY_REASON;
	const after = new Map(entries(next.document.activities).map(entry => [entry.id, entry]));
	for (const entry of entries(prior.document.activities)) {
		if (!entry.own && !entry.inheritedFrom) continue;
		const target = after.get(entry.id);
		if (!target || entry.path !== target.path || entry.structure !== target.structure) return LAYOUT_LOCK_REASON;
	}
	return null;
}

export function guardedLayoutEdit(prior: BuilderEnvelope, edit: (next: BuilderEnvelope) => void, supported: boolean) {
	const next = structuredClone(prior);
	edit(next);
	const reason = layoutLockTransitionReason(prior, next, supported);
	return reason ? { reason, next: null } : { reason: null, next };
}
