import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BuilderElementLibrary } from '../src/components/app/builder/builder-element-library';

const source = readFileSync(
	new URL('../src/components/app/builder/builder-workspace.tsx', import.meta.url),
	'utf8',
);
const css = readFileSync(
	new URL('../src/styles/builder-workspace.css', import.meta.url),
	'utf8',
);

describe('content-first builder workspace', () => {
	it('keeps one review entry and no mode tabs in the workspace', () => {
		expect(source).not.toContain('setLeftTab');
		expect(source).not.toContain("id: 'review', label: 'Tinjau'");
		expect(source).not.toContain('bd-sidebar-tabs');
		expect(source).toContain('outlineContents');
		expect(source).toContain('Riwayat & template');
		expect(source).toContain("['ai', 'book'].includes(params.get('tool')");
		expect(source).toContain('allowDrag={false}');
	});

	it('uses a dedicated title class that beats generic input styling', () => {
		expect(source).toContain('className="bd-title-input"');
		expect(source).toContain('bd-context-line');
		expect(css).toContain('.bd-workspace .bd-title-group input.bd-title-input');
	});

	it('creates inline text only from typing and never on load', () => {
		expect(source).toContain('const addInlineText = (activityId: string, text: string)');
		expect(source).toContain('onChange={(event) =>');
		expect(source).toContain("appendBlock(next, activityId, 'instructions')");
		expect(source).toContain('onCompositionEnd');
		expect(source).toContain('isComposing');
		expect(source).toContain('if (!target || target.blocks.length) return;');
		expect(source).toContain("fields: 'id,title,week,section'");
	});

	it('asks for a broad element group before showing specific block types', () => {
		const html = renderToStaticMarkup(
			createElement(BuilderElementLibrary, {
				disabled: false,
				target: 'Kegiatan · akhir kegiatan',
				onAdd: vi.fn(),
				onDragStart: vi.fn(),
				onDragEnd: vi.fn(),
			}),
		);
		expect(html).toContain('Teks');
		expect(html).toContain('Pertanyaan');
		expect(html).toContain('Media');
		expect(html).not.toContain('Jawaban singkat');
		expect(html).not.toContain('Pilihan ganda</strong>');
	});
});
