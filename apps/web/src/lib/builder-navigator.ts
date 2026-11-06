import type { BuilderActivity, BuilderEnvelope } from './builder-document';
import { findLayoutGroup, layoutPath } from './builder-layout';

export const NAVIGATOR_TITLE_MAX = 200;

export function navigatorTitle(value: string): string | null {
	const title = value.trim();
	return title.length > 0 && title.length <= NAVIGATOR_TITLE_MAX ? title : null;
}

export function finishNavigatorRename(value: string, action: 'commit' | 'escape' | 'blur', blocked = false): { kind: 'cancel' } | { kind: 'invalid' } | { kind: 'commit'; title: string } {
	if (blocked || action !== 'commit') return { kind: 'cancel' };
	const title = navigatorTitle(value);
	return title ? { kind: 'commit', title } : { kind: 'invalid' };
}

export function renameNavigatorGroup(draft: BuilderEnvelope, activityId: string, groupId: string, value: string, blocked = false): boolean {
	if (blocked) return false;
	const title = navigatorTitle(value);
	const activity = draft.document.activities.find(item => item.id === activityId);
	const group = activity?.layout && findLayoutGroup(activity.layout, groupId);
	if (!title || !group || title === group.title) return false;
	group.title = title;
	return true;
}

export function revealNavigatorAncestors(activity: BuilderActivity, itemId: string, collapsed: string[]): string[] {
	const ancestors = new Set(layoutPath(activity, itemId).slice(0, -1).map(item => item.id));
	return collapsed.some(id => ancestors.has(id)) ? collapsed.filter(id => !ancestors.has(id)) : collapsed;
}

export type NavigatorReveal = { kind: 'group' | 'block'; id: string; focus: boolean };

export function revealNavigatorCanvas(request: NavigatorReveal, root: Pick<Document, 'getElementById'>, reducedMotion: boolean): boolean {
	const target = root.getElementById(`builder-${request.kind}-${request.id}`);
	if (!target) return false;
	target.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'instant' : 'smooth' });
	if (request.focus) target.focus({ preventScroll: true });
	return true;
}
