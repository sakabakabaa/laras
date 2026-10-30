import { describe, expect, it } from 'vitest';
import {
	buildContextBreadcrumb,
	formatLastActivity,
	hasContextIndicator,
	sanitizeError,
	toolActivity,
	toolActivityLabel,
} from '@/lib/assistant/ui-labels';

describe('toolActivityLabel', () => {
	it('maps known tool names to Indonesian labels', () => {
		expect(toolActivityLabel('list_courses')).toBe('Memeriksa mata kuliah');
		expect(toolActivityLabel('list_assignments')).toBe('Memeriksa tugas');
		expect(toolActivityLabel('import_rps_pdf')).toBe('Menganalisis RPS');
		expect(toolActivityLabel('summarize_insights')).toBe('Menganalisis wawasan akademik');
	});

	it('falls back to a generic label for unknown tools', () => {
		expect(toolActivityLabel('unknown_tool')).toBe('Memproses permintaan');
	});
});

describe('toolActivity', () => {
	it('carries the friendly label and success flag', () => {
		const ok = toolActivity('list_courses', true);
		expect(ok).toEqual({ tool: 'list_courses', label: 'Memeriksa mata kuliah', ok: true });
		const fail = toolActivity('course_detail', false);
		expect(fail.ok).toBe(false);
	});
});

describe('buildContextBreadcrumb', () => {
	it('returns an empty array for empty/null context', () => {
		expect(buildContextBreadcrumb(null)).toEqual([]);
		expect(buildContextBreadcrumb(undefined)).toEqual([]);
		expect(buildContextBreadcrumb({})).toEqual([]);
	});

	it('builds a breadcrumb from course code + feature + section', () => {
		const crumbs = buildContextBreadcrumb({
			route: '/app/courses/abc/tugas',
			feature: 'assignments',
			state: { courseCode: 'Deutsch B1', section: 'tugas' },
		});
		expect(crumbs).toEqual(['Deutsch B1', 'Tugas', 'tugas']);
	});

	it('uses courseTitle when courseCode is absent', () => {
		const crumbs = buildContextBreadcrumb({
			route: '/app/courses/abc',
			feature: 'courses',
			state: { courseTitle: 'Bahasa Jerman' },
		});
		expect(crumbs).toEqual(['Bahasa Jerman', 'Mata Kuliah']);
	});

	it('de-duplicates adjacent identical segments', () => {
		const crumbs = buildContextBreadcrumb({
			route: '/app/courses/abc',
			feature: 'courses',
			state: { courseCode: 'Mata Kuliah' },
		});
		expect(crumbs).toEqual(['Mata Kuliah']);
	});

	it('ignores unknown feature keys', () => {
		const crumbs = buildContextBreadcrumb({
			route: '/x',
			feature: 'not_a_feature',
			state: { courseCode: 'X1' },
		});
		expect(crumbs).toEqual(['X1']);
	});
});

describe('hasContextIndicator', () => {
	it('is false for empty context and true when a breadcrumb exists', () => {
		expect(hasContextIndicator(null)).toBe(false);
		expect(hasContextIndicator({ feature: 'courses', state: { courseCode: 'A1' } })).toBe(true);
	});
});

describe('sanitizeError', () => {
	it('passes through a clean Indonesian message', () => {
		expect(sanitizeError('Asisten AI sedang tidak tersedia. Coba beberapa saat lagi.')).toBe(
			'Asisten AI sedang tidak tersedia. Coba beberapa saat lagi.',
		);
	});

	it('drops stack traces after the first newline', () => {
		const result = sanitizeError('Gagal membuat catatan.\n    at /app/foo.ts:42:8\n    at /app/bar.ts:9:3');
		expect(result).toBe('Gagal membuat catatan.');
	});

	it('replaces PocketBase / SQL internals with a generic message', () => {
		expect(sanitizeError('sql: no rows in result set')).toBe(
			'Terjadi kesalahan pada layanan asisten. Coba beberapa saat lagi.',
		);
		expect(sanitizeError('PocketBase error: token invalid')).toBe(
			'Terjadi kesalahan pada layanan asisten. Coba beberapa saat lagi.',
		);
	});

	it('strips leaked authorization headers', () => {
		expect(sanitizeError('Authorization: Bearer abc123 failed')).toBe(
			'Terjadi kesalahan pada layanan asisten. Coba beberapa saat lagi.',
		);
	});

	it('strips the "Error:" prefix', () => {
		expect(sanitizeError('Error: Pesan gagal')).toBe('Pesan gagal');
	});

	it('falls back for non-string input', () => {
		expect(sanitizeError(undefined)).toBe('Terjadi kesalahan. Coba beberapa saat lagi.');
		expect(sanitizeError(42)).toBe('Terjadi kesalahan. Coba beberapa saat lagi.');
	});

	it('truncates very long messages', () => {
		const long = 'x'.repeat(300);
		const result = sanitizeError(long);
		expect(result.length).toBeLessThan(300);
		expect(result.endsWith('…')).toBe(true);
	});
});

describe('formatLastActivity', () => {
	it('returns empty for missing/invalid timestamps', () => {
		expect(formatLastActivity('')).toBe('');
		expect(formatLastActivity(undefined)).toBe('');
		expect(formatLastActivity('not-a-date')).toBe('');
	});

	it('returns "Baru saja" for recent timestamps', () => {
		expect(formatLastActivity(new Date().toISOString())).toBe('Baru saja');
	});

	it('returns a minutes label for recent past', () => {
		const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
		expect(formatLastActivity(fiveMinAgo)).toBe('5 mnt lalu');
	});

	it('returns a date label for old timestamps', () => {
		const old = new Date(Date.now() - 30 * 86400000).toISOString();
		const result = formatLastActivity(old);
		expect(result).toMatch(/^\d{2}\/\d{2}$/);
	});
});
