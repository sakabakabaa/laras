import type { ReactNode } from 'react';
import { safeInlineUrl, type BuilderBlock } from '../../../lib/builder-document';

export function BuilderRichTextView({ value, preventNavigation = false }: { value?: BuilderBlock['body']; preventNavigation?: boolean }) {
	return <>{value?.content.map((paragraph, pi) => <span key={pi}>{pi > 0 && <br />}{paragraph.content.map((run, ri) => {
		let node: ReactNode = run.text;
		if (run.marks?.includes('italic')) node = <em>{node}</em>;
		if (run.marks?.includes('bold')) node = <strong>{node}</strong>;
		const href = run.link?.href && safeInlineUrl(run.link.href);
		return href ? <a key={ri} href={href} rel="noopener noreferrer" onClick={preventNavigation ? e => e.preventDefault() : undefined}>{node}</a> : <span key={ri}>{node}</span>;
	})}</span>)}</>;
}
