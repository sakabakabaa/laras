import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * Settings navigation and one-section-at-a-time rendering.
 *
 * The page used to stack seven panels and ignore a third of the viewport. It now
 * shows one section, chosen by `?bagian=`, with a section list beside it. These
 * tests pin the parts that are easy to break: the active section, the fallback
 * for an unknown id, and the fact that inactive sections stay MOUNTED (so a
 * half-typed password or an in-flight Codex login is not thrown away).
 */

vi.mock('@/hooks/use-auth', () => ({
	useAuth: () => ({ user: { role: 'faculty' } }),
}));

let query = new URLSearchParams();
vi.mock('react-router', () => ({
	useSearchParams: () => [query],
	Link: ({ to, children, ...rest }: { to: string; children?: unknown }) =>
		createElement('a', { href: to, ...rest }, children as never),
}));

// Every section is replaced by a marker so the assertions read the wrapper, not
// the panel internals.
vi.mock('../src/components/app/settings/profile-section', () => ({ ProfileSection: () => createElement('div', null, 'SECTION:profil') }));
vi.mock('../src/components/app/settings/account-info-section', () => ({ AccountInfoSection: () => createElement('div', null, 'SECTION:akun') }));
vi.mock('../src/components/app/settings/security-section', () => ({ SecuritySection: () => createElement('div', null, 'SECTION:keamanan') }));
vi.mock('../src/components/app/settings/recovery-section', () => ({ RecoverySection: () => createElement('div', null, 'SECTION:pemulihan') }));
vi.mock('../src/components/app/settings/language-section', () => ({ LanguageSection: () => createElement('div', null, 'SECTION:bahasa') }));
vi.mock('../src/components/app/settings/preferences-section', () => ({ PreferencesSection: () => createElement('div', null, 'SECTION:tampilan') }));
vi.mock('../src/components/app/settings/usage-section', () => ({ UsageSection: () => createElement('div', null, 'SECTION:penggunaan') }));
vi.mock('../src/components/app/settings/ai-model-section', () => ({ AiModelSection: () => createElement('div', null, 'SECTION:model') }));
vi.mock('../src/components/app/settings/learner-profile-section', () => ({ LearnerProfileSection: () => createElement('div', null, 'SECTION:profil-belajar') }));

const render = async (search = '') => {
	query = new URLSearchParams(search);
	const { SettingsPage } = await import('../src/components/app/settings/settings-page');
	return renderToStaticMarkup(createElement(SettingsPage));
};

/**
 * Each section sits in a wrapper div, and inactive wrappers carry `hidden`.
 * Matching the whole wrapper (`<div><div>SECTION:x</div></div>`) is what tells
 * the two apart — matching the inner marker alone cannot.
 */
const visibleSections = (html: string) =>
	[...html.matchAll(/<div><div>SECTION:([a-z-]+)<\/div><\/div>/g)].map((match) => match[1]);

const hiddenSections = (html: string) =>
	[...html.matchAll(/<div hidden=""><div>SECTION:([a-z-]+)<\/div><\/div>/g)].map((match) => match[1]);

describe('settings page shows one section at a time', () => {
	it('defaults to the first section when no ?bagian is given', async () => {
		const html = await render('');
		expect(visibleSections(html)).toEqual(['profil']);
	});

	it('shows the section named by ?bagian', async () => {
		const html = await render('bagian=model');
		expect(visibleSections(html)).toEqual(['model']);
	});

	it('falls back to the first section for an unknown id instead of rendering nothing', async () => {
		const html = await render('bagian=tidak-ada');
		expect(visibleSections(html)).toEqual(['profil']);
	});

	it('keeps every inactive section mounted so form state survives navigation', async () => {
		const html = await render('bagian=model');
		// All faculty sections are present in the markup, hidden except the active one.
		for (const id of ['profil', 'akun', 'keamanan', 'model', 'penggunaan', 'tampilan', 'bahasa']) {
			expect(html, id).toContain(`SECTION:${id}`);
		}
		expect(visibleSections(html)).toEqual(['model']);
		expect(hiddenSections(html).sort()).toEqual(['akun', 'bahasa', 'keamanan', 'penggunaan', 'profil', 'tampilan']);
	});

	it('does not render student-only or faculty-only sections for the wrong role', async () => {
		const html = await render('bagian=model');
		expect(html).not.toContain('SECTION:pemulihan');
		expect(html).not.toContain('SECTION:profil-belajar');
	});
});

describe('settings navigation', () => {
	it('renders a link per section with real hrefs', async () => {
		const html = await render('');
		expect(html).toContain('href="/app/pengaturan?bagian=profil"');
		expect(html).toContain('href="/app/pengaturan?bagian=model"');
		expect(html).toContain('href="/app/pengaturan?bagian=bahasa"');
	});

	it('marks exactly one item as the current page', async () => {
		const html = await render('bagian=model');
		const current = [...html.matchAll(/aria-current="page"/g)];
		expect(current).toHaveLength(1);
		expect(html).toMatch(/href="\/app\/pengaturan\?bagian=model"[^>]*aria-current="page"/);
	});

	it('labels the nav for assistive technology', async () => {
		const html = await render('');
		expect(html).toContain('aria-label="Bagian pengaturan"');
	});
});
