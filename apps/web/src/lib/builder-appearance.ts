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
	[
		K in keyof typeof APPEARANCE_OPTIONS
	]?: keyof (typeof APPEARANCE_OPTIONS)[K]['values'];
};

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

export type BuilderAppearancePreset = keyof typeof BUILDER_APPEARANCE_PRESETS;
export const PRESET_APPEARANCE_FIELDS = [
	'background', 'color', 'border', 'radius', 'padding',
] as const satisfies readonly (keyof BuilderAppearance)[];
export const APPEARANCE_FIELDS = Object.keys(APPEARANCE_OPTIONS) as (keyof BuilderAppearance)[];

export function applyAppearancePreset(
	appearance: BuilderAppearance | undefined,
	preset: BuilderAppearancePreset,
	preserve: readonly (keyof BuilderAppearance)[] = [],
): BuilderAppearance | undefined {
	const next: BuilderAppearance = {};
	for (const field of preserve) {
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
	return (Object.keys(APPEARANCE_OPTIONS) as (keyof BuilderAppearance)[])
		.filter(
			(key) =>
				appearance[key] !== undefined &&
				Object.hasOwn(APPEARANCE_OPTIONS[key].values, appearance[key]!),
		)
		.map((key) => `ba-${key}-${appearance[key]}`)
		.join(' ');
}
