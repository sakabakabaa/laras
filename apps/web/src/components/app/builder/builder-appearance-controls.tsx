import {
	APPEARANCE_FIELDS,
	APPEARANCE_OPTIONS,
	applyAppearancePreset,
	BUILDER_APPEARANCE_PRESETS,
	matchingAppearancePreset,
	resetBuilderAppearance,
	type BuilderAppearance,
	type BuilderAppearancePreset,
	validHexColor,
	contrastRatio,
} from '@/lib/builder-appearance';
import { useEffect, useState } from 'react';

export function BuilderAppearanceControls({
	value,
	onChange,
	exclude = [],
	presetPreserve = [],
	backgroundNotice = false,
	customColorsSupported = true,
}: {
	value?: BuilderAppearance;
	onChange: (value: BuilderAppearance | undefined) => void;
	exclude?: (keyof BuilderAppearance)[];
	presetPreserve?: (keyof BuilderAppearance)[];
	backgroundNotice?: boolean;
	customColorsSupported?: boolean;
}) {
	const [draft, setDraft] = useState({ lightForeground: '', lightBackground: '', darkForeground: '', darkBackground: '' });
	const [invalid, setInvalid] = useState(false);
	useEffect(() => setDraft({ lightForeground: value?.customColors?.light.foreground ?? '', lightBackground: value?.customColors?.light.background ?? '', darkForeground: value?.customColors?.dark.foreground ?? '', darkBackground: value?.customColors?.dark.background ?? '' }), [value?.customColors]);
	const selectedPreset = matchingAppearancePreset(value, presetPreserve);
	const applyColors = () => {
		if (![draft.lightForeground, draft.lightBackground, draft.darkForeground, draft.darkBackground].every(validHexColor)) { setInvalid(true); return; }
		setInvalid(false);
		onChange({ ...value, customColors: { light: { foreground: draft.lightForeground.toUpperCase(), background: draft.lightBackground.toUpperCase() }, dark: { foreground: draft.darkForeground.toUpperCase(), background: draft.darkBackground.toUpperCase() } } });
	};
	return (
		<div className="bd-fields bd-appearance-controls">
			<fieldset className="bd-fields">
				<legend>Praset tampilan</legend>
				{(Object.keys(BUILDER_APPEARANCE_PRESETS) as BuilderAppearancePreset[]).map(
					(preset) => (
						<button
							type="button"
							className="bd-secondary"
							key={preset}
							aria-pressed={selectedPreset === preset}
							onClick={() => onChange(applyAppearancePreset(value, preset, presetPreserve))}
						>
							{BUILDER_APPEARANCE_PRESETS[preset].label}
						</button>
					),
				)}
			</fieldset>
			<p className="bd-help">
				{selectedPreset === 'custom' ? 'Kustom' : `Terpilih: ${BUILDER_APPEARANCE_PRESETS[selectedPreset].label}`}. Praset mengatur warna teks, latar tampilan, garis, sudut, dan ruang dalam; warna memakai token tema.
			</p>
			{backgroundNotice && <p className="bd-help">Latar kustom bagian dan latar responsif tetap dipertahankan serta tampil di atas latar praset.</p>}
			<details className="bd-custom-color-panel">
				<summary>Warna teks kustom untuk tema terang dan gelap</summary>
				<p className="bd-help">Pasangan berlaku pada teks utama. Latar bagian atau latar responsif yang sudah dipilih tetap diprioritaskan; rasio pasangan tidak mengukur keterbacaan pada gambar atau gradien.</p>
				{(['light', 'dark'] as const).map(theme => {
					const fgKey = theme === 'light' ? 'lightForeground' : 'darkForeground';
					const bgKey = theme === 'light' ? 'lightBackground' : 'darkBackground';
					const ratio = contrastRatio(draft[fgKey], draft[bgKey]);
					return <fieldset key={theme} className="bd-fields"><legend>{theme === 'light' ? 'Tema terang' : 'Tema gelap'}</legend>
						{([[fgKey, 'Warna teks'], [bgKey, 'Warna latar']] as const).map(([key, label]) => <label key={key}>{label} (#RRGGBB)
							<input aria-label={`${theme === 'light' ? 'Terang' : 'Gelap'} ${label}`} value={draft[key]} placeholder="#112233" onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} />
						</label>)}
						<p role="status" className="bd-help">{ratio === null ? 'Rasio kontras belum dapat dihitung.' : `Rasio pasangan: ${ratio}:1${ratio < 4.5 ? ' — di bawah panduan 4,5:1 untuk teks normal.' : ' — mencapai panduan 4,5:1 untuk pasangan ini.'}`}</p>
					</fieldset>;
				})}
				{invalid && <p role="alert" className="bd-help">Lengkapi keempat warna dengan format #RRGGBB sebelum menerapkan.</p>}
				{!customColorsSupported && <p role="status" className="bd-help">Backend belum mengiklankan dukungan pasangan warna; penerapan dinonaktifkan agar data tidak hilang.</p>}
				<button type="button" className="bd-secondary" disabled={!customColorsSupported} onClick={applyColors}>Terapkan pasangan</button>
			</details>
			{APPEARANCE_FIELDS
				.filter((key) => !exclude.includes(key))
				.map((key) => (
					<label key={key}>
						{APPEARANCE_OPTIONS[key].label}
						<select
							value={value?.[key] || ''}
							onChange={(event) => {
								const next = { ...value };
								if (event.target.value)
									Object.assign(next, { [key]: event.target.value });
								else delete next[key];
								onChange(Object.keys(next).length ? next : undefined);
							}}
						>
							<option value="">Ikuti tema / bagian</option>
							{Object.entries(APPEARANCE_OPTIONS[key].values).map(
								([id, label]) => (
									<option key={id} value={id}>
										{label}
									</option>
								),
							)}
						</select>
					</label>
				))}
			<button
				type="button"
				className="bd-secondary"
				disabled={!value || (!value.customColors && !APPEARANCE_FIELDS.some((key) => !presetPreserve.includes(key) && value[key] !== undefined))}
					onClick={() => onChange(resetBuilderAppearance(value, presetPreserve))}
			>
				Reset gaya
			</button>
		</div>
	);
}
