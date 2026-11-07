'use client';

import { createContext, useContext, useId } from 'react';

const AnchorPrefix = createContext('');

export function BuilderAnchorScope({ children }: { children: React.ReactNode }) {
	const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
	return <AnchorPrefix.Provider value={`laras-${id}`}>{children}</AnchorPrefix.Provider>;
}

export function useBuilderAnchorId(anchor?: string) {
	const prefix = useContext(AnchorPrefix);
	return builderAnchorId(prefix, anchor);
}

export function useBuilderAnchorPrefix() { return useContext(AnchorPrefix); }
export function builderAnchorId(prefix: string, anchor?: string) { return anchor && prefix ? `${prefix}-${anchor}` : undefined; }

export function useBuilderAnchorHref(href: string) {
	const prefix = useContext(AnchorPrefix);
	return builderAnchorHref(prefix, href);
}
export function builderAnchorHref(prefix: string, href: string) { return href.startsWith('#') && prefix ? `#${prefix}-${href.slice(1)}` : href; }
