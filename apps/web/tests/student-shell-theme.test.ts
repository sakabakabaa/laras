import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/theme.css', import.meta.url), 'utf8');
const redesignCss = readFileSync(new URL('../src/styles/redesign-v1.css', import.meta.url), 'utf8');
const workspaceCss = readFileSync(new URL('../src/styles/premium-workspace.css', import.meta.url), 'utf8');

function shellRule(selector: string) {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('shared app shell theme backgrounds', () => {
	it('defines the red-to-white light background and shares it across both role shells', () => {
		expect(shellRule('.ld-layout')).toMatch(/--r-app-background:\s*radial-gradient\(/);
		expect(shellRule('.ld-layout')).toContain('#B3261E');
		expect(shellRule('.ld-layout')).toContain('#fff');
		expect(shellRule('.ld-layout')).toContain('at 100% 0%');
		expect(redesignCss).toMatch(/\.ld-main\s*\{[^}]*background:\s*var\(--r-app-background\);/);
		expect(redesignCss).toMatch(/\.student-adventure-shell \.ld-main\s*\{[^}]*background:\s*var\(--r-app-background\);/);
	});

	it('defines the same upper-right red fade to charcoal in dark mode', () => {
		expect(shellRule(':root.dark .ld-layout')).toMatch(/--r-app-background:\s*radial-gradient\(/);
		expect(shellRule(':root.dark .ld-layout')).toContain('#B3261E');
		expect(shellRule(':root.dark .ld-layout')).toContain('#171b22');
		expect(shellRule(':root.dark .ld-layout')).toContain('at 100% 0%');
		expect(redesignCss).not.toMatch(/:root\.dark \.student-adventure-shell \.ld-main\s*\{/);
	});

	it('keeps dashboard stat surfaces solid over the gradient', () => {
		expect(workspaceCss).toMatch(/\.ld-dash \.ld-stat\s*\{[^}]*background:\s*var\(--r-surface\);/);
	});
});
