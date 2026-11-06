import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { appendBlock, blankBuilder, rich } from '../src/lib/builder-document';
import { BuilderPreview } from '../src/components/app/builder/builder-elements';
describe('builder isolated content preview', () => {
	it('renders current unsaved content without private keys or grading controls', () => {
		const d = blankBuilder('tugas', 'course000000001');
		const a = d.document.activities[0];
		appendBlock(d, a.id, 'question_group');
		const id = a.blocks[0].questionIds![0];
		d.document.title = 'Unsaved title';
		d.document.questionsById[id].prompt = rich('Unsaved question');
		d.document.questionsById[id].options![0].label = 'Visible option';
		d.privateKeys.answersByQuestionId[id].explanation = rich(
			'PRIVATE KEY SENTINEL',
		);
		const html = renderToStaticMarkup(
			createElement(BuilderPreview, { document: d.document }),
		);
		expect(html).toContain('Unsaved title');
		expect(html).toContain('Unsaved question');
		expect(html).toContain('Visible option');
		expect(html).not.toContain('PRIVATE KEY SENTINEL');
		expect(html).not.toContain('correctOptionId');
	});
	it('supports matching destinations without inventing an empty image request', () => {
		const d = blankBuilder('kelas', 'course000000001');
		appendBlock(d, d.document.activities[0].id, 'matching');
		const html = renderToStaticMarkup(
			createElement(BuilderPreview, { document: d.document }),
		);
		expect(html).toContain('Kelompok A');
		expect(html).toContain('Kelompok B');
		expect(html).not.toContain('src=""');
	});
	it('renders authored media transcript as escaped plain text in an accessible disclosure', () => {
		const d = blankBuilder('kelas', 'course000000001');
		const activity = d.document.activities[0];
		const id = appendBlock(d, activity.id, 'audio');
		const block = activity.blocks.find(item => item.id === id)!;
		block.transcript = '<script>alert(1)</script>\nsecond line';
		block.playback = { loop: true, muted: true };
		const html = renderToStaticMarkup(createElement(BuilderPreview, { document: d.document }));
		expect(html).toContain('<summary>Transkrip teks</summary>');
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(html).not.toContain('<script>');
		expect(html).toContain('Media belum dipilih.');
	});
});
