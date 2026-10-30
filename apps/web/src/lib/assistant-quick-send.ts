/**
 * Bridge between the dashboard quick-chat box and the Asisten sidebar.
 *
 * The dashboard greeting composer lives inside `CourseDashboard`, while the
 * conversation state lives inside `AssistantPanel` (mounted by `AppShell`'s
 * `AgentPane`). They do not share props, so a lightweight window CustomEvent
 * carries the typed text up to `AppShell`, which opens the pane and seeds the
 * message into `AssistantPanel` via a `seed` prop. This keeps the existing
 * assistant permissions, guardrails, and send flow untouched — the seed only
 * triggers the same `send()` the composer would call.
 */

export type AssistantSeed = { text: string; nonce: number; files?: File[] };

export const QUICK_ASSISTANT_EVENT = 'laras:quick-assistant';

/** Fire a quick-send: opens the Asisten sidebar and sends `text` into it once. */
export function quickSendToAssistant(text: string, files: File[] = []): void {
	const trimmed = text.trim();
	if (!trimmed && files.length === 0) return;
	window.dispatchEvent(
		new CustomEvent(QUICK_ASSISTANT_EVENT, { detail: { text: trimmed, files } }),
	);
}

/** Subscribe to quick-send events; returns an unsubscribe function. */
export function onQuickAssistantSend(handler: (seed: AssistantSeed) => void): () => void {
	const listener = (event: Event) => {
		const detail = (event as CustomEvent<{ text?: string; files?: File[] }>).detail;
		const text = detail?.text?.trim() || '';
		const files = Array.isArray(detail?.files) ? detail.files : [];
		if (!text && files.length === 0) return;
		handler({ text, files, nonce: Date.now() + Math.random() });
	};
	window.addEventListener(QUICK_ASSISTANT_EVENT, listener);
	return () => window.removeEventListener(QUICK_ASSISTANT_EVENT, listener);
}
