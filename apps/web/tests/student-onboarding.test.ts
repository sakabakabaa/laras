import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import postcss from 'postcss';
import { StudentOnboarding } from '../src/components/app/student-onboarding';

const { auth } = vi.hoisted(() => ({
	auth: { user: null as { mustChangePassword?: boolean } | null },
}));

vi.mock('@/hooks/use-auth', () => ({ useAuth: () => auth }));
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/lib/pocketbase-client', () => ({ default: { authStore: { token: '' } } }));
vi.mock('@/lib/learning', () => ({ errorMessage: (error: unknown) => String(error) }));

describe('password-only student onboarding', () => {
	beforeEach(() => {
		auth.user = { mustChangePassword: true };
	});

	it('renders only the password-change form without recovery email', () => {
		const html = renderToStaticMarkup(createElement(StudentOnboarding));
		expect(html.match(/type="password"/g)).toHaveLength(3);
		expect(html.match(/class="ld-form-control"/g)).toHaveLength(3);
		expect(html.match(/<form\b/g)).toHaveLength(1);
		expect(html).toContain('Simpan kata sandi baru');
		expect(html).not.toMatch(/pemulihan|verifikasi|type="email"/i);
		const source = readFileSync(new URL('../src/components/app/student-onboarding.tsx', import.meta.url), 'utf8');
		expect(source).not.toMatch(/recovery-email|email_verifications|loadPending/);
		expect(source).toContain("fetch('/api/student-password'");
		expect(source).toContain('authWithPassword(loginEmail, newPassword)');
	});

	it.each([null, {}, { mustChangePassword: true }])('keeps dashboard access disabled while a password change is required or unknown: %j', (user) => {
		auth.user = user;
		const html = renderToStaticMarkup(createElement(StudentOnboarding));
		const button = html.match(/<button[^>]*>Lanjut ke dashboard/)?.[0];
		expect(button).toBeDefined();
		expect(button).toContain('disabled=""');
		expect(html.match(/type="password"/g)).toHaveLength(3);
	});

	it('enables continuation only when the auth record confirms completion', () => {
		auth.user = { mustChangePassword: false };
		const html = renderToStaticMarkup(createElement(StudentOnboarding));
		const button = html.match(/<button[^>]*>Lanjut ke dashboard/)?.[0];
		expect(button).toBeDefined();
		expect(button).not.toContain('disabled');
		expect(html).not.toContain('type="password"');
	});

	it('uses shared semantic action and disabled button tokens', () => {
		const css = readFileSync(new URL('../src/styles/shared-components.css', import.meta.url), 'utf8');
		const rules = new Map<string, postcss.Rule>();
		postcss.parse(css).walkRules((rule) => {
			rules.set(rule.selector, rule);
		});
		expect(rules.get('.ld-btn-primary')?.toString()).toContain('background: var(--r-action)');
		expect(rules.get('.ld-btn-primary')?.toString()).toContain('color: var(--r-on-action)');
		const disabled = rules.get('.ld-btn-primary:disabled,\n.ld-btn-primary:disabled:hover')?.toString();
		expect(disabled).toContain('background: var(--r-surface-3)');
		expect(disabled).toContain('color: var(--r-ink-3)');
		const workspace = readFileSync(new URL('../src/styles/premium-workspace.css', import.meta.url), 'utf8');
		expect(workspace).not.toContain('.ld-btn-primary');
		const legacy = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
		postcss.parse(legacy).walkRules((rule) => {
			if (!rule.selector.split(',').some((selector) => /^(?::root\.dark\s+)?\.ld-btn-primary(?::(?:hover|disabled))*$/.test(selector.trim()))) return;
			rule.walkDecls(/^background(?:-color|-image)?$/, () => {
				expect.fail(`Legacy ${rule.selector} overrides the shared button theme`);
			});
		});
	});

	it('keeps student-world effects off shared controls', () => {
		const student = readFileSync(new URL('../src/styles/student-home.css', import.meta.url), 'utf8');
		postcss.parse(student).walkRules((rule) => {
			if (!/\.ld-(?:btn-primary|outline-action|text-btn)\b/.test(rule.selector)) return;
			rule.walkDecls(/^(?:border-radius|box-shadow|transform)$/, () => {
				expect.fail(`Student rule ${rule.selector} overrides shared control styling`);
			});
		});
	});

	it('uses shared field styles and theme tokens without separate onboarding palettes', () => {
		const shared = readFileSync(new URL('../src/styles/shared-components.css', import.meta.url), 'utf8');
		const rules = new Map<string, postcss.Rule>();
		postcss.parse(shared).walkRules((rule) => { rules.set(rule.selector, rule); });
		expect(rules.get('.ld-form-control')?.toString()).toContain('border-radius: var(--r-radius-md)');
		expect(rules.get('.ld-form-control')?.toString()).toContain('background: var(--r-surface)');
		const focus = rules.get('.ld-form-control:focus,\n.ld-form-control:focus-visible')?.toString();
		expect(focus).toContain('box-shadow: var(--r-focus-ring)');
		expect(focus).toContain('outline: none');
		const legacy = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
		postcss.parse(legacy).walkRules((rule) => {
			if (!rule.selector.includes('.onboarding-')) return;
			rule.walkDecls((declaration) => {
				expect(declaration.value).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(/i);
			});
			if (rule.selector === '.onboarding-input-wrap input') {
				expect(rule.nodes.every((node) => node.type === 'decl' && ['height', 'width', 'padding'].includes(node.prop))).toBe(true);
			}
		});
		const dark = readFileSync(new URL('../src/styles/dark-overrides.css', import.meta.url), 'utf8');
		expect(dark).not.toContain('.onboarding-');
		for (const route of ['reset-password', 'lupa-sandi']) {
			const source = readFileSync(new URL(`../src/routes/${route}.tsx`, import.meta.url), 'utf8');
			expect(source.match(/<input\b/g)?.length).toBe(source.match(/className="ld-form-control"/g)?.length);
		}
	});
});
