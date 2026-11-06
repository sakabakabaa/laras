import { APPEARANCE_OPTIONS, type BuilderAppearance } from './builder-appearance';
import type { BuilderBlock, BuilderEnvelope } from './builder-document';
import { findLayoutGroup, type BuilderLayoutGroup, type BuilderResponsiveOverride } from './builder-layout';

export type BuilderStyleSelection = { activityId: string; blockId?: string; groupId?: string };
type StyleTarget = BuilderBlock | BuilderLayoutGroup;
export type BuilderStyleClipboard = Readonly<{
	type: string;
	appearance?: BuilderAppearance;
	layout?: Partial<BuilderLayoutGroup>;
}>;

const responsiveFields = ['columns', 'direction', 'align', 'distribute', 'wrap', 'gap', 'padding', 'paddingLinked', 'marginLinked', 'rowGap', 'columnGap'] as const;
const layoutFields = [...responsiveFields, 'surface', 'width', 'maxWidth'] as const;

function targetIn(envelope: BuilderEnvelope, selection: BuilderStyleSelection): StyleTarget | undefined {
	const activity = envelope.document.activities.find(item => item.id === selection.activityId);
	if (!activity || Boolean(selection.blockId) === Boolean(selection.groupId)) return;
	if (selection.blockId) return activity.blocks.find(item => item.id === selection.blockId);
	return activity.layout ? findLayoutGroup(activity.layout, selection.groupId!) ?? undefined : undefined;
}

function targetType(target: StyleTarget): string {
	return 'kind' in target ? `group:${target.kind}` : `block:${target.type}`;
}

function pickFields(source: object, fields: readonly string[]): Record<string, unknown> {
	const record = source as Record<string, unknown>;
	return Object.fromEntries(fields.filter(key => record[key] !== undefined).map(key => [key, structuredClone(record[key])]));
}

function spacing(source: BuilderLayoutGroup | BuilderResponsiveOverride) {
	return Object.fromEntries((['paddingSides', 'margin'] as const).filter(key => source[key] !== undefined).map(key => [key, pickFields(source[key]!, ['top', 'right', 'bottom', 'left'])]));
}

function freezeStyle<Value>(value: Value): Value {
	if (value && typeof value === 'object') {
		Object.values(value).forEach(freezeStyle);
		Object.freeze(value);
	}
	return value;
}

export function copyBuilderStyle(envelope: BuilderEnvelope, selection: BuilderStyleSelection, blocked = false): BuilderStyleClipboard | null {
	const target = blocked ? undefined : targetIn(envelope, selection);
	if (!target) return null;
	const appearance = Object.fromEntries(Object.entries(target.appearance ?? {}).filter(([key, value]) => {
		if (!Object.hasOwn(APPEARANCE_OPTIONS, key)) return false;
		const option = APPEARANCE_OPTIONS[key as keyof BuilderAppearance];
		return option && Object.hasOwn(option.values, value);
	})) as BuilderAppearance;
	const clipboard: BuilderStyleClipboard = { type: targetType(target), ...(Object.keys(appearance).length ? { appearance } : {}) };
	if (!('kind' in target)) return freezeStyle(clipboard);
	const layout: Partial<BuilderLayoutGroup> = { ...pickFields(target, layoutFields), ...spacing(target) };
	if (target.columnWeights) layout.columnWeights = [...target.columnWeights];
	for (const device of ['tablet', 'mobile'] as const) {
		const override = target.responsive?.[device];
		if (override) {
			layout.responsive ??= {};
			layout.responsive[device] = { ...pickFields(override, responsiveFields), ...spacing(override) };
		}
	}
	return freezeStyle({ ...clipboard, layout });
}

export function canPasteBuilderStyle(envelope: BuilderEnvelope, selection: BuilderStyleSelection, clipboard: BuilderStyleClipboard | null, blocked = false): boolean {
	const target = blocked ? undefined : targetIn(envelope, selection);
	return Boolean(target && clipboard && targetType(target) === clipboard.type);
}

export function pasteBuilderStyle(envelope: BuilderEnvelope, selection: BuilderStyleSelection, clipboard: BuilderStyleClipboard | null, blocked = false): boolean {
	if (!canPasteBuilderStyle(envelope, selection, clipboard, blocked)) return false;
	const target = targetIn(envelope, selection)!;
	delete target.appearance;
	if (clipboard!.appearance) target.appearance = structuredClone(clipboard!.appearance);
	if ('kind' in target && clipboard!.layout) {
		const priorResponsive = target.responsive;
		for (const key of [...layoutFields, 'paddingSides', 'margin', 'columnWeights'] as const) delete target[key];
		Object.assign(target, structuredClone(clipboard!.layout));
		const responsive: NonNullable<BuilderLayoutGroup['responsive']> = {};
		for (const device of ['tablet', 'mobile'] as const) {
			const background = priorResponsive?.[device]?.background;
			const source = clipboard!.layout.responsive?.[device];
			if (source || background) responsive[device] = { ...structuredClone(source ?? {}), ...(background ? { background } : {}) };
		}
		if (Object.keys(responsive).length) target.responsive = responsive;
		else delete target.responsive;
	}
	return true;
}
