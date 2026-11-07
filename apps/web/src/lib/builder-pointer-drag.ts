export const BUILDER_POINTER_DRAG_THRESHOLD = 8;
export type BuilderDropAddress = { activityId: string; beforeId?: string; parentId?: string };
export const BUILDER_DRAG_EDGE_ZONE = 64;
export const BUILDER_DRAG_MAX_SCROLL_SPEED = 600;
export function builderDragEdgeSpeed(pointerY: number, top: number, bottom: number): number {
	if (pointerY < top || pointerY > bottom || bottom <= top) return 0;
	if (pointerY - top < BUILDER_DRAG_EDGE_ZONE) return -BUILDER_DRAG_MAX_SCROLL_SPEED * (1 - (pointerY - top) / BUILDER_DRAG_EDGE_ZONE);
	if (bottom - pointerY < BUILDER_DRAG_EDGE_ZONE) return BUILDER_DRAG_MAX_SCROLL_SPEED * (1 - (bottom - pointerY) / BUILDER_DRAG_EDGE_ZONE);
	return 0;
}
export function builderDragScrollDelta(speed: number, elapsedMs: number): number {
	return speed * Math.max(0, Math.min(elapsedMs, 100)) / 1000;
}
export type BuilderPointerGesture = {
	pointerId: number;
	startX: number;
	startY: number;
	activated: boolean;
	item: { elementId?: string; activityId?: string; blockId?: string; groupId?: string };
	revision: number;
	snapshot: object;
};

export function builderPointerDragActivated(startX: number, startY: number, x: number, y: number): boolean {
	return Math.hypot(x - startX, y - startY) >= BUILDER_POINTER_DRAG_THRESHOLD;
}

export function updateBuilderPointerGesture(gesture: BuilderPointerGesture, x: number, y: number): boolean {
	if (!gesture.activated && builderPointerDragActivated(gesture.startX, gesture.startY, x, y)) gesture.activated = true;
	return gesture.activated;
}

export function builderDropTargetFromElement(element: Element | null, root: Element): BuilderDropAddress | null {
	const slot = element?.closest<HTMLElement>('[data-builder-drop-activity]');
	if (!slot || !root.contains(slot) || !slot.isConnected) return null;
	const activityId = slot.dataset.builderDropActivity;
	if (!activityId) return null;
	const beforeId = slot.dataset.builderDropBefore || undefined;
	const parentId = slot.dataset.builderDropParent || undefined;
	return { activityId, ...(beforeId ? { beforeId } : {}), ...(parentId ? { parentId } : {}) };
}
