/**
 * Session inactivity threshold and staleness check, shared by the server
 * (default-session resolution) and the client (pre-send guard).
 *
 * Kept in its own module — deliberately free of any server-only import — so the
 * client can import the constant without pulling the assistant system prompt
 * into the browser bundle.
 */

/**
 * After this much inactivity on a session, the next engagement starts a fresh
 * session instead of appending to the old one. Three hours matches a typical
 * teaching break: a lecturer who steps away and comes back later in the day
 * gets a clean conversation rather than reviving a stale thread.
 */
export const ASSISTANT_SESSION_AUTO_NEW_AFTER_MS = 3 * 60 * 60 * 1000;

/**
 * True when `lastMessageAt` is older than the auto-new threshold. A missing or
 * unparseable timestamp is treated as fresh so a brand-new session (which has
 * no activity yet) is never discarded.
 */
export const isSessionStale = (
	lastMessageAt: string | undefined | null,
	now: number = Date.now(),
): boolean => {
	if (!lastMessageAt) return false;
	const ts = Date.parse(lastMessageAt);
	if (Number.isNaN(ts)) return false;
	return now - ts > ASSISTANT_SESSION_AUTO_NEW_AFTER_MS;
};
