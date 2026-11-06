import type { ReactNode } from 'react';
import { safeInlineUrl, type BuilderBlock } from '../../../lib/builder-document';

export function BuilderRichTextView({ value, preventNavigation = false }: { value?: BuilderBlock['body']; preventNavigation?: boolean }) {
	const renderRuns = (paragraph: NonNullable<BuilderBlock['body']>['content'][number], pi: number) => <>{paragraph.content.map((run, ri) => {
		let node: ReactNode = run.text;
		if (run.marks?.includes('italic')) node = <em>{node}</em>;
		if (run.marks?.includes('bold')) node = <strong>{node}</strong>;
		const href = run.link?.href && safeInlineUrl(run.link.href);
		return href ? <a key={ri} href={href} rel="noopener noreferrer" onClick={preventNavigation ? e => e.preventDefault() : undefined}>{node}</a> : <span key={ri}>{node}</span>;
	})}</>;
	const nodes: ReactNode[] = [];
	for (let i = 0; i < (value?.content.length || 0);) {
		const p = value!.content[i];
		if (p.type === 'list_item') {
			const kind = p.list;
			const items: ReactNode[] = [];
			while (i < value!.content.length) {
				const item = value!.content[i];
				if (item.type !== 'list_item' || item.list !== kind) break;
				items.push(<li key={i}>{renderRuns(item, i)}</li>); i++;
			}
			const List = kind === 'bullet' ? 'ul' : 'ol'; nodes.push(<List key={`list-${i}`}>{items}</List>); continue;
		}
		if (p.type === 'heading') {
			const Heading = `h${p.level}` as 'h2' | 'h3' | 'h4'; nodes.push(<Heading key={i}>{renderRuns(p, i)}</Heading>);
		} else nodes.push(<p key={i}>{renderRuns(p, i)}</p>);
		i++;
	}
	return <>{nodes}</>;
}
