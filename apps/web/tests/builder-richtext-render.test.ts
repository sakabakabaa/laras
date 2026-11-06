import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BuilderRichTextView } from '../src/components/app/builder/builder-richtext-view';

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
});
