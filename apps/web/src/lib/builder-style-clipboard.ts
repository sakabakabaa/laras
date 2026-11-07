import { APPEARANCE_OPTIONS, validHexColor, type BuilderAppearance, type BuilderAppearanceField } from './builder-appearance';
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
		if (key === 'customColors' || !Object.hasOwn(APPEARANCE_OPTIONS, key) || typeof value !== 'string') return false;
		const option = APPEARANCE_OPTIONS[key as BuilderAppearanceField];
		return Object.hasOwn(option.values, value);
	})) as BuilderAppearance;
	const colors = target.appearance?.customColors;
	if (colors && validHexColor(colors.light?.foreground) && validHexColor(colors.light?.background) && validHexColor(colors.dark?.foreground) && validHexColor(colors.dark?.background)) appearance.customColors = structuredClone(colors);
	if (target.appearance?.borderDetail && ['none', 'solid', 'dashed', 'dotted'].includes(target.appearance.borderDetail.style) && (target.appearance.borderDetail.color === undefined || ['border', 'action', 'ink', 'surface-2'].includes(target.appearance.borderDetail.color)) && (target.appearance.borderDetail.linked === undefined || typeof target.appearance.borderDetail.linked === 'boolean') && Object.keys(target.appearance.borderDetail.widths ?? {}).every(key => ['top', 'right', 'bottom', 'left'].includes(key)) && Object.entries(target.appearance.borderDetail.widths ?? {}).every(([, value]) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 8)) appearance.borderDetail = structuredClone(target.appearance.borderDetail);
	if (target.appearance?.corners && Object.entries(target.appearance.corners).every(([key, value]) => key === 'linked' ? typeof value === 'boolean' : ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].includes(key) && typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 48)) appearance.corners = structuredClone(target.appearance.corners);
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
