import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/redesign-v1.css', import.meta.url), 'utf8');

function shellRule(selector: string) {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('student app shell theme backgrounds', () => {
	it('uses the white surface in light mode', () => {
		expect(shellRule('.student-adventure-shell .ld-main')).toMatch(/background:\s*var\(--r-surface\);/);
	});

	it('keeps the dark shell background in dark mode', () => {
		expect(shellRule(':root.dark .student-adventure-shell .ld-main')).toContain(
			'linear-gradient(180deg, #171214 0%, var(--r-canvas) 320px)',
		);
	});
});
