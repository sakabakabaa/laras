import type { ReactNode } from 'react';
import { safeInlineUrl, type BuilderBlock } from '../../../lib/builder-document';
import { builderAnchorHref, useBuilderAnchorPrefix } from './builder-anchor-scope';

export function BuilderRichTextView({ value, preventNavigation = false }: { value?: BuilderBlock['body']; preventNavigation?: boolean }) {
	const anchorPrefix = useBuilderAnchorPrefix();
	type ListItem = { node: Extract<NonNullable<BuilderBlock['body']>['content'][number], { type: 'list_item' }>; index: number; children: ListItem[] };
	const renderRuns = (paragraph: NonNullable<BuilderBlock['body']>['content'][number], pi: number) => <>{paragraph.content.map((run, ri) => {
		let node: ReactNode = run.text;
		if (run.marks?.includes('italic')) node = <em>{node}</em>;
		if (run.marks?.includes('bold')) node = <strong>{node}</strong>;
		const safeHref = run.link?.href && safeInlineUrl(run.link.href);
		const href = safeHref ? builderAnchorHref(anchorPrefix, safeHref) : null;
		return href ? <a key={ri} href={href} rel="noopener noreferrer" onClick={preventNavigation ? e => e.preventDefault() : undefined}>{node}</a> : <span key={ri}>{node}</span>;
	})}</>;
	const nodes: ReactNode[] = [];
	const renderList = (items: ListItem[], key: string): ReactNode => {
		const kind = items[0]?.node.list || 'bullet'; const List = kind === 'bullet' ? 'ul' : 'ol';
		return <List key={key}>{items.map(({ node, index, children }) => <li key={index}>{renderRuns(node, index)}{children.length ? renderChildLists(children, `nested-${index}`) : null}</li>)}</List>;
	};
	const renderChildLists = (children: ListItem[], key: string): ReactNode[] => {
		const groups: ListItem[][] = [];
		for (const child of children) { const prior = groups.at(-1); if (!prior || prior[0].node.list !== child.node.list) groups.push([child]); else prior.push(child); }
		return groups.map((group, index) => renderList(group, `${key}-${index}`));
	};
	const roots: ListItem[] = [];
	const stack: ListItem[] = [];
	(value?.content || []).forEach((node, index) => {
		if (node.type !== 'list_item') { stack.length = 0; return; }
		const depth = node.depth || 0;
		while (stack.length > depth + 1) stack.pop();
		const item: ListItem = { node, index, children: [] };
		if (depth === 0) roots.push(item); else stack[depth - 1]?.children.push(item);
		stack[depth] = item;
	});
	const rootAt = new Map(roots.map(item => [item.index, item]));
	for (let i = 0; i < (value?.content.length || 0);) {
		const p = value!.content[i];
		if (p.type === 'list_item') {
			const root = rootAt.get(i)!; const items: ListItem[] = [root]; let j = i + 1;
			while (j < value!.content.length) {
				const item = value!.content[j];
				if (item.type !== 'list_item') break;
				if ((item.depth || 0) === 0) { if (item.list !== root.node.list) break; items.push(rootAt.get(j)!); }
				j++;
			}
			nodes.push(renderList(items, `list-${i}`)); i = j; continue;
		}
		if (p.type === 'heading') {
			const Heading = `h${p.level}` as 'h2' | 'h3' | 'h4'; nodes.push(<Heading key={i}>{renderRuns(p, i)}</Heading>);
		} else nodes.push(<p key={i}>{renderRuns(p, i)}</p>);
		i++;
	}
	return <>{nodes}</>;
}
