import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'laras-theme';

/**
 * Theme state for the LARAS dark mode. The `<html>` class is applied by the
 * no-flash script in `root.tsx` before paint; this hook only reads it on mount
 * (to render the correct toggle icon/label) and writes it when the user
 * toggles. State initializes to `light` on both server and first client render
 * so there is no hydration mismatch, then syncs to the actual pre-paint class
 * inside an effect.
 *
 * `toggleWithTransition` drives the circular reveal from the click coordinates
 * (profile menu origin) via the View Transitions API, with an instant
 * reduced-motion fallback.
 */
export function useTheme() {
	const [theme, setTheme] = useState<Theme>('light');

	useEffect(() => {
		const isDark = document.documentElement.classList.contains('dark');
		setTheme(isDark ? 'dark' : 'light');
	}, []);

	const applyTheme = useCallback((next: Theme) => {
		const root = document.documentElement;
		root.classList.toggle('dark', next === 'dark');
		localStorage.setItem(STORAGE_KEY, next);
		setTheme(next);
	}, []);

	const toggleWithTransition = useCallback(
		(event?: { clientX?: number; clientY?: number }) => {
			const root = document.documentElement;
			const next: Theme = root.classList.contains('dark') ? 'light' : 'dark';
			const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			const supportsVT =
				typeof (document as Document & { startViewTransition?: unknown }).startViewTransition ===
				'function';

			if (reduce || !supportsVT) {
				applyTheme(next);
				return;
			}

			const x = event?.clientX ?? window.innerWidth - 24;
			const y = event?.clientY ?? 24;
			const endRadius = Math.hypot(
				Math.max(x, window.innerWidth - x),
				Math.max(y, window.innerHeight - y),
			);

			const transition = (
				document as Document & {
					startViewTransition: (cb: () => void) => { ready: Promise<void> };
				}
			).startViewTransition(() => applyTheme(next));

			transition.ready
				.then(() => {
					root.animate(
						{
							clipPath: [
								`circle(0px at ${x}px ${y}px)`,
								`circle(${endRadius}px at ${x}px ${y}px)`,
							],
						},
						{
							duration: 480,
							easing: 'ease-in-out',
							pseudoElement: '::view-transition-new(root)',
						},
					);
				})
				.catch(() => {
					/* transition interrupted — theme already applied */
				});
		},
		[applyTheme],
	);

	return { theme, toggleWithTransition, setTheme };
}
