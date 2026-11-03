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
