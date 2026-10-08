import { useEffect } from 'react';

const OVERLAY =
	'.element-type-tooltip, #selection-mode-select-rect, [data-editor-overlay]';
/** Only the type chip is hidden during a click. The drag-select band stays visible. */
const CLICK_BLOCKER = '.element-type-tooltip';

/**
 * Select & edit draws a "Text" type chip that follows the cursor. That chip
 * sits above the worksheet and becomes the hit target, so the real element
 * underneath cannot be selected. Keep the chip visible while hovering, but
 * take it out of hit-testing for the duration of a click.
 */
export function EditorOverlayGuard() {
	useEffect(() => {
		const list = () => Array.from(document.querySelectorAll<HTMLElement>(OVERLAY));
		const disarm = (el: HTMLElement) => {
			el.style.setProperty('pointer-events', 'none', 'important');
		};
		const scan = () => list().forEach(disarm);
		scan();
		const observer = new MutationObserver(scan);
		observer.observe(document.documentElement, { childList: true, subtree: true });

		let hidden: HTMLElement[] = [];
		let restoreTimer = 0;
		const hide = () => {
			window.clearTimeout(restoreTimer);
			hidden = Array.from(document.querySelectorAll<HTMLElement>(CLICK_BLOCKER));
			hidden.forEach((el) => {
				disarm(el);
				el.style.setProperty('visibility', 'hidden', 'important');
			});
		};
		const show = () => {
			hidden.forEach((el) => el.style.removeProperty('visibility'));
			hidden = [];
		};
		const showSoon = () => {
			window.clearTimeout(restoreTimer);
			// pointerup fires before click; keep the chip hidden until the
			// editor's click hit-test has run.
			restoreTimer = window.setTimeout(show, 80);
		};

		window.addEventListener('pointerdown', hide, true);
		window.addEventListener('pointerup', showSoon, true);
		window.addEventListener('pointercancel', show, true);
		return () => {
			observer.disconnect();
			window.clearTimeout(restoreTimer);
			window.removeEventListener('pointerdown', hide, true);
			window.removeEventListener('pointerup', showSoon, true);
			window.removeEventListener('pointercancel', show, true);
			show();
		};
	}, []);
	return null;
}
