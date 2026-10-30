import type { CSSProperties } from 'react';

/**
 * Allows CSS custom properties (e.g. `--w`, `--p`) to be passed via inline
 * `style` objects without per-usage type assertions.
 */
declare module 'react' {
	interface CSSProperties {
		[key: `--${string}`]: string | number | undefined;
	}
}

export {};
