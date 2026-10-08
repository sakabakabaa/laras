/**
 * Assistant page-context provider.
 *
 * A React context that lets application pages publish a small, structured
 * semantic snapshot of what the lecturer is currently viewing (route, feature,
 * entity, page state, available actions) — never the raw DOM, HTML, or React
 * tree. The assistant panel reads the current context and forwards it with
 * each turn so the model can resolve deictic references like "tugas ini" or
 * "mata kuliah ini".
 *
 * Mounted once in the AppShell so both page content and the assistant drawer
 * share the same context.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AssistantPageContextInput } from '@/lib/assistant/types';

const EMPTY_CONTEXT: AssistantPageContextInput = {};

type AssistantPageContextValue = {
	/** The currently published page context (read by the assistant panel). */
	context: AssistantPageContextInput;
	/** Publish a page context; pass null/undefined to clear on unmount. */
	setContext: (context: AssistantPageContextInput | null | undefined) => void;
};

const AssistantPageContextContext = createContext<AssistantPageContextValue>({
	context: EMPTY_CONTEXT,
	setContext: () => {},
});

export function AssistantPageContextProvider({ children }: { children: ReactNode }) {
	const [context, setContextState] = useState<AssistantPageContextInput>(EMPTY_CONTEXT);
	const setContext = useCallback((next: AssistantPageContextInput | null | undefined) => {
		setContextState(next ?? EMPTY_CONTEXT);
	}, []);
	const value = useMemo<AssistantPageContextValue>(() => ({ context, setContext }), [context, setContext]);
	return (
		<AssistantPageContextContext.Provider value={value}>{children}</AssistantPageContextContext.Provider>
	);
}

/** Read the current assistant page context (for the assistant panel). */
export function useAssistantPageContext(): AssistantPageContextValue {
	return useContext(AssistantPageContextContext);
}
