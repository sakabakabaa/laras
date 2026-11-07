import {
	APPEARANCE_FIELDS,
	APPEARANCE_OPTIONS,
	applyAppearancePreset,
	BUILDER_APPEARANCE_PRESETS,
	matchingAppearancePreset,
	resetBuilderAppearance,
	type BuilderAppearance,
	type BuilderAppearancePreset,
} from '@/lib/builder-appearance';

export function BuilderAppearanceControls({
	value,
	onChange,
	exclude = [],
	presetPreserve = [],
	backgroundNotice = false,
}: {
	value?: BuilderAppearance;
	onChange: (value: BuilderAppearance | undefined) => void;
	exclude?: (keyof BuilderAppearance)[];
	presetPreserve?: (keyof BuilderAppearance)[];
	backgroundNotice?: boolean;
}) {
	const selectedPreset = matchingAppearancePreset(value, presetPreserve);
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
				disabled={!value || !APPEARANCE_FIELDS.some((key) => !presetPreserve.includes(key) && value[key] !== undefined)}
					onClick={() => onChange(resetBuilderAppearance(value, presetPreserve))}
			>
				Reset gaya
			</button>
		</div>
	);
}
