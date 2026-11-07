import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BuilderRichTextView } from '../src/components/app/builder/builder-richtext-view';
import { BuilderAnchorScope, useBuilderAnchorId } from '../src/components/app/builder/builder-anchor-scope';

function AnchorTarget() { return createElement('section', { id: useBuilderAnchorId('intro') }, 'Target'); }

describe('builder rich text renderer', () => {
	it('renders safe links with marks and renders malformed links as text', () => {
		const markup = renderToStaticMarkup(createElement(BuilderRichTextView, { value: {
			type: 'doc', content: [{ type: 'paragraph', content: [
				{ type: 'text', text: 'safe', marks: ['bold'], link: { href: 'https://example.org' } },
				{ type: 'text', text: 'unsafe', link: { href: 'javascript:alert(1)' } },
			] }],
		} }));
		expect(markup).toContain('<a href="https://example.org" rel="noopener noreferrer"><strong>safe</strong></a>');
		expect(markup).toContain('unsafe');
		expect(markup).not.toContain('javascript:');
	});
	it('renders semantic headings and grouped ordered and unordered lists', () => {
		const markup = renderToStaticMarkup(createElement(BuilderRichTextView, { value: { type: 'doc', content: [
			{ type: 'heading', level: 2, content: [{ type: 'text', text: 'Title', marks: ['bold'] }] },
			{ type: 'list_item', list: 'bullet', content: [{ type: 'text', text: 'One' }] },
			{ type: 'list_item', list: 'bullet', content: [{ type: 'text', text: 'Two' }] },
			{ type: 'list_item', list: 'number', content: [{ type: 'text', text: 'First' }] },
		] } }));
		expect(markup).toContain('<h2><span><strong>Title</strong></span></h2>');
		expect(markup).toContain('<ul><li><span>One</span></li><li><span>Two</span></li></ul>');
		expect(markup).toContain('<ol><li><span>First</span></li></ol>');
	});
	it('renders mixed nested ordered and unordered lists as semantic child lists', () => {
		const markup = renderToStaticMarkup(createElement(BuilderRichTextView, { value: { type: 'doc', content: [
			{ type: 'list_item', list: 'number', content: [{ type: 'text', text: 'One' }] },
			{ type: 'list_item', list: 'bullet', depth: 1, content: [{ type: 'text', text: 'Nested bullet', marks: ['bold'] }] },
			{ type: 'list_item', list: 'number', depth: 2, content: [{ type: 'text', text: 'Nested number' }] },
			{ type: 'list_item', list: 'number', content: [{ type: 'text', text: 'Two' }] },
		] } }));
		expect(markup).toContain('<ol><li><span>One</span><ul><li><span><strong>Nested bullet</strong></span><ol><li><span>Nested number</span></li></ol></li></ul></li><li><span>Two</span></li></ol>');
	});
	it('rewrites safe internal links to instance-scoped target IDs without selector parsing', () => {
		const scope = (key: string) => createElement(BuilderAnchorScope, { key }, createElement('div', null,
			createElement(AnchorTarget), createElement(BuilderRichTextView, { value: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Jump', link: { href: '#intro' } }] }] } }),
		));
		const markup = renderToStaticMarkup(createElement('main', null, scope('one'), scope('two')));
		const ids = [...markup.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
		const hrefs = [...markup.matchAll(/href="#([^"]+)"/g)].map(match => match[1]);
		expect(ids).toHaveLength(2);
		expect(new Set(ids).size).toBe(2);
		expect(hrefs).toEqual(ids);
		expect(markup).not.toContain('querySelector');
	});
});
