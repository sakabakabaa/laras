import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => ({ fail: false, meetings: true }));
vi.mock('@/hooks/use-cached-query', () => ({ useCachedQuery: (key: string | null) => ({
	data: key === 'builder-course-options' ? [{ id: 'course000000001', title: 'German A1', code: 'DE1' }] : key && query.meetings ? [{ id: 'meeting00000001', title: 'Beim Arzt', week: 2, section: 'section00000001' }] : [],
	loading: false, error: query.fail ? 'Cannot load context' : '', reload: vi.fn(),
}) }));
import { BuilderClassStart } from '../src/components/app/builder/builder-class-start';
import { useBuilderAuthoringTools } from '../src/components/app/builder/builder-authoring-tools';
import { blankBuilder } from '../src/lib/builder-document';

const render = (path = '/app/builder/new?kind=kelas') => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(BuilderClassStart)));
beforeEach(() => { query.fail = false; query.meetings = true; });

describe('simple class entry', () => {
	it('shows only course and meeting choices, not title, audience, templates, or AI setup', () => {
		const html = render();
		expect(html.match(/<select/g)).toHaveLength(2);
		expect(html).toContain('1. Mata kuliah'); expect(html).toContain('2. Pertemuan');
		expect(html).toContain('Buka builder');
		for (const field of ['<input', '<textarea', 'Semua rombel', 'Atau duplikat', 'bd-template-options']) expect(html).not.toContain(field);
		expect(html).toContain('disabled=""');
	});

	it('accepts valid course/meeting deep links and blocks unavailable context', () => {
		const path = '/app/builder/new?kind=kelas&course=course000000001&meeting=meeting00000001';
		expect(render(path)).not.toContain('disabled=""');
		query.fail = true;
		expect(render(path)).toContain('Cannot load context');
		expect(render(path)).toContain('disabled=""');
	});

	it('explains missing meetings and explicit legacy copies without exposing a second creation path', () => {
		query.meetings = false;
		expect(render('/app/builder/new?kind=kelas&course=course000000001')).toContain('Tambahkan pertemuan');
		expect(render('/app/builder/new?kind=kelas&sourceSession=legacy000000001')).toContain('Kelas asal, mahasiswa, jawaban, dan nilai tidak diubah');
	});

	it('keeps AI and book inputs inside the builder instead of the entry form', () => {
		function Tools() {
			return useBuilderAuthoringTools({ id: 'builder12345678', draft: blankBuilder('kelas', 'course000000001', 'meeting00000001'), disabled: false, onApply: vi.fn(), onManual: vi.fn() });
		}
		const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/app/builder/builder12345678?tool=book'] }, createElement(Tools)));
		expect(html).toContain('Bantu susun dengan AI');
		expect(html).toContain('Unggah halaman buku');
		expect(html).toContain('Tambah teks atau pertanyaan');
		expect(html).not.toContain('multiple');
		expect(html).toContain('<details open=""><summary>');
	});
});
