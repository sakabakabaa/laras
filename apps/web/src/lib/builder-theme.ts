import { validHexColor, contrastRatio } from './builder-appearance';

export type BuilderThemePair = { foreground: string; background: string };
export type BuilderThemePalette = {
	light: { base: BuilderThemePair; accent: BuilderThemePair };
	dark: { base: BuilderThemePair; accent: BuilderThemePair };
};
export type BuilderDocumentTheme = { palette: BuilderThemePalette };

const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const record = (value: unknown): Record<string, unknown> => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Palet tema dokumen tidak valid.');
	const prototype = Object.getPrototypeOf(value);
	const plainPrototype = prototype === null || (Object.getPrototypeOf(prototype) === null && Object.hasOwn(prototype, 'constructor') && prototype.constructor?.name === 'Object');
	if (!plainPrototype) throw new Error('Prototipe palet tema tidak valid.');
	return value as Record<string, unknown>;
};

/** Strict additive schema shared by the UI validator and test fixtures. */
export function normalizeBuilderDocumentTheme(value: unknown): BuilderDocumentTheme {
	const theme = record(value);
	if (!exactKeys(theme, ['palette'])) throw new Error('Kunci tema dokumen tidak dikenal.');
	const palette = record(theme.palette);
	if (!exactKeys(palette, ['light', 'dark'])) throw new Error('Palet harus memiliki pasangan terang dan gelap.');
	const clean = {} as BuilderThemePalette;
	for (const mode of ['light', 'dark'] as const) {
		const colors = record(palette[mode]);
		if (!exactKeys(colors, ['base', 'accent'])) throw new Error('Token palet tidak dikenal.');
		for (const token of ['base', 'accent'] as const) {
			const pair = record(colors[token]);
			if (!exactKeys(pair, ['foreground', 'background']) || !validHexColor(pair.foreground) || !validHexColor(pair.background)) throw new Error('Warna harus berupa pasangan #RRGGBB lengkap.');
			clean[mode] ||= {} as BuilderThemePalette[typeof mode];
			clean[mode][token] = { foreground: pair.foreground.toUpperCase(), background: pair.background.toUpperCase() };
		}
	}
	return { palette: clean };
}

export function builderThemePaletteStyle(value: BuilderDocumentTheme | undefined): Record<string, string> {
	if (!value) return {};
	try {
		const theme = normalizeBuilderDocumentTheme(value).palette;
		return {
			'--bt-light-base-foreground': theme.light.base.foreground,
			'--bt-light-base-background': theme.light.base.background,
			'--bt-dark-base-foreground': theme.dark.base.foreground,
			'--bt-dark-base-background': theme.dark.base.background,
			'--bt-light-accent-foreground': theme.light.accent.foreground,
			'--bt-light-accent-background': theme.light.accent.background,
			'--bt-dark-accent-foreground': theme.dark.accent.foreground,
			'--bt-dark-accent-background': theme.dark.accent.background,
		};
	} catch { return {}; }
}

export function builderThemePairContrast(pair: BuilderThemePair): number | null {
	return contrastRatio(pair.foreground, pair.background);
}
