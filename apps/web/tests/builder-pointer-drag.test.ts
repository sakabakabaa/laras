import { describe, expect, it } from 'vitest';
import { builderDragEdgeSpeed, builderDragScrollDelta, builderDropTargetFromElement, builderPointerDragActivated, updateBuilderPointerGesture, type BuilderPointerGesture } from '../src/lib/builder-pointer-drag';

describe('builder pointer drag', () => {
	it('calculates bounded edge speed and clamps elapsed-time deltas after a paused frame', () => {
		expect(builderDragEdgeSpeed(10, 0, 500)).toBeLessThan(0);
		expect(builderDragEdgeSpeed(490, 0, 500)).toBeGreaterThan(0);
		expect(builderDragEdgeSpeed(250, 0, 500)).toBe(0);
		expect(builderDragEdgeSpeed(501, 0, 500)).toBe(0);
		expect(builderDragScrollDelta(600, 10_000)).toBe(60);
	});
	it('activates only after the movement threshold', () => {
		expect(builderPointerDragActivated(10, 10, 17, 10)).toBe(false);
		expect(builderPointerDragActivated(10, 10, 18, 10)).toBe(true);
		const gesture: BuilderPointerGesture = { pointerId: 1, startX: 0, startY: 0, activated: false, item: { blockId: 'b' }, revision: 2, snapshot: {} };
		expect(updateBuilderPointerGesture(gesture, 2, 2)).toBe(false);
		expect(updateBuilderPointerGesture(gesture, 8, 0)).toBe(true);
	});

	it('resolves only connected canonical workspace slots', () => {
		const root = document.createElement('div');
		const slot = document.createElement('div');
		slot.dataset.builderDropActivity = 'activity';
		slot.dataset.builderDropParent = 'group';
		slot.dataset.builderDropBefore = 'before';
		const child = document.createElement('button');
		slot.append(child);
		root.append(slot);
		document.body.append(root);
		expect(builderDropTargetFromElement(child, root)).toEqual({ activityId: 'activity', parentId: 'group', beforeId: 'before' });
		expect(builderDropTargetFromElement(child, document.createElement('div'))).toBeNull();
		slot.remove();
		expect(builderDropTargetFromElement(child, root)).toBeNull();
		root.remove();
	});
});
// @vitest-environment happy-dom
