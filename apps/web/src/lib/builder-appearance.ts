/** Supported presentation overrides. Missing keys inherit the existing theme. */
export const APPEARANCE_OPTIONS = {
	size: {
		label: 'Ukuran teks',
		values: { sm: 'Kecil', base: 'Normal', lg: 'Besar', xl: 'Judul' },
	},
	weight: {
		label: 'Ketebalan teks',
		values: { regular: 'Normal', medium: 'Sedang', bold: 'Tebal' },
	},
	leading: {
		label: 'Jarak baris',
		values: { compact: 'Rapat', normal: 'Normal', relaxed: 'Longgar' },
	},
	align: {
		label: 'Perataan teks',
		values: { start: 'Kiri', center: 'Tengah', end: 'Kanan' },
	},
	color: {
		label: 'Warna teks',
		values: { ink: 'Utama', muted: 'Sekunder', accent: 'Aksen' },
	},
	background: {
		label: 'Warna latar',
		values: { none: 'Transparan', muted: 'Lembut', accent: 'Aksen lembut' },
	},
	padding: {
		label: 'Ruang dalam',
		values: { none: 'Tanpa ruang', sm: 'Kecil', md: 'Sedang', lg: 'Besar' },
	},
	border: {
		label: 'Garis tepi',
		values: { none: 'Tanpa garis', subtle: 'Lembut', accent: 'Aksen' },
	},
	radius: {
		label: 'Sudut',
		values: { none: 'Siku', sm: 'Kecil', md: 'Sedang', lg: 'Bulat' },
	},
	shadow: {
		label: 'Bayangan',
		values: { none: 'Tanpa bayangan', sm: 'Lembut', md: 'Sedang' },
	},
} as const;
export type BuilderAppearance = {
	[K in keyof typeof APPEARANCE_OPTIONS]?: keyof (typeof APPEARANCE_OPTIONS)[K]['values'];
} & { customColors?: { light: { foreground: string; background: string }; dark: { foreground: string; background: string } } };

export type ThemeColorPair = { foreground: string; background: string };
export function validHexColor(value: unknown): value is string { return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value); }
export function contrastRatio(foreground: string, background: string): number | null {
	if (!validHexColor(foreground) || !validHexColor(background)) return null;
	const luminance = (hex: string) => {
		const channels = hex.slice(1).match(/../g)!.map(channel => parseInt(channel, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
		return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
	};
	const a = luminance(foreground), b = luminance(background);
	return Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2));
}

export const BUILDER_APPEARANCE_PRESETS = {
	default: { label: 'Default', values: {} },
	highlight: {
		label: 'Highlight',
		values: {
			background: 'accent',
			color: 'accent',
			border: 'accent',
			radius: 'md',
			padding: 'md',
		},
	},
	exercise: {
		label: 'Exercise',
		values: {
			background: 'muted',
			color: 'ink',
			border: 'subtle',
			radius: 'sm',
			padding: 'md',
		},
	},
	note: {
		label: 'Note',
		values: {
			background: 'none',
			color: 'muted',
			border: 'subtle',
			radius: 'none',
			padding: 'sm',
		},
	},
} as const satisfies Record<string, { label: string; values: Partial<BuilderAppearance> }>;

export type BuilderAppearanceField = keyof typeof APPEARANCE_OPTIONS;
export type BuilderAppearancePreset = keyof typeof BUILDER_APPEARANCE_PRESETS;
export const PRESET_APPEARANCE_FIELDS = [
	'background', 'color', 'border', 'radius', 'padding',
] as const satisfies readonly (keyof BuilderAppearance)[];
export const APPEARANCE_FIELDS = Object.keys(APPEARANCE_OPTIONS) as BuilderAppearanceField[];

export function applyAppearancePreset(
	appearance: BuilderAppearance | undefined,
	preset: BuilderAppearancePreset,
	preserve: readonly (keyof BuilderAppearance)[] = [],
): BuilderAppearance | undefined {
	const next: BuilderAppearance = {};
	for (const field of preserve) {
		if (field === 'customColors') continue;
		if (appearance?.[field] !== undefined) Object.assign(next, { [field]: appearance[field] });
	}
	for (const [field, value] of Object.entries(BUILDER_APPEARANCE_PRESETS[preset].values)) {
		if (!preserve.includes(field as keyof BuilderAppearance)) Object.assign(next, { [field]: value });
	}
	return Object.keys(next).length ? next : undefined;
}

export function resetBuilderAppearance(
	appearance: BuilderAppearance | undefined,
	preserve: readonly (keyof BuilderAppearance)[] = [],
): BuilderAppearance | undefined {
	if (!appearance) return undefined;
	const next = { ...appearance };
	for (const field of APPEARANCE_FIELDS) if (!preserve.includes(field)) delete next[field];
	if (!preserve.includes('customColors')) delete next.customColors;
	return Object.keys(next).length ? next : undefined;
}

export function matchingAppearancePreset(
	appearance?: BuilderAppearance,
	preserve: readonly (keyof BuilderAppearance)[] = [],
): BuilderAppearancePreset | 'custom' {
	const comparable = Object.fromEntries(Object.entries(appearance ?? {}).filter(([key]) => !preserve.includes(key as keyof BuilderAppearance)));
	for (const preset of Object.keys(BUILDER_APPEARANCE_PRESETS) as BuilderAppearancePreset[]) {
		const expected = Object.fromEntries(Object.entries(BUILDER_APPEARANCE_PRESETS[preset].values).filter(([key]) => !preserve.includes(key as keyof BuilderAppearance)));
		if (Object.keys(comparable).length === Object.keys(expected).length && Object.entries(expected).every(([key, value]) => comparable[key] === value)) return preset;
	}
	return 'custom';
}

export function appearanceClassName(appearance?: BuilderAppearance): string {
	if (!appearance) return '';
	const colors = appearance.customColors;
	const safeColors = colors && validHexColor(colors.light?.foreground) && validHexColor(colors.light?.background) && validHexColor(colors.dark?.foreground) && validHexColor(colors.dark?.background);
	return (Object.keys(APPEARANCE_OPTIONS) as (keyof typeof APPEARANCE_OPTIONS)[])
		.filter(
			(key) =>
				appearance[key] !== undefined &&
				Object.hasOwn(APPEARANCE_OPTIONS[key].values, appearance[key]!),
		)
		.map((key) => `ba-${key}-${appearance[key]}`)
		.join(' ') + (safeColors ? ' ba-custom-colors' : '');
}

export function appearanceColorStyle(appearance?: BuilderAppearance): Record<string, string> {
	const colors = appearance?.customColors;
	if (!colors || !validHexColor(colors.light?.foreground) || !validHexColor(colors.light?.background) || !validHexColor(colors.dark?.foreground) || !validHexColor(colors.dark?.background)) return {};
	return {
		'--ba-custom-light-foreground': colors.light.foreground,
		'--ba-custom-light-background': colors.light.background,
		'--ba-custom-dark-foreground': colors.dark.foreground,
		'--ba-custom-dark-background': colors.dark.background,
	};
}
