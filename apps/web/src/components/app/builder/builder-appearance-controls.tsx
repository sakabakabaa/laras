import {
	APPEARANCE_OPTIONS,
	type BuilderAppearance,
} from '@/lib/builder-appearance';

export function BuilderAppearanceControls({
	value,
	onChange,
	exclude = [],
}: {
	value?: BuilderAppearance;
	onChange: (value: BuilderAppearance | undefined) => void;
	exclude?: (keyof BuilderAppearance)[];
}) {
	return (
		<div className="bd-fields bd-appearance-controls">
			<fieldset className="bd-fields">
				<legend>Praset tema</legend>
				{(['default', 'highlight', 'exercise', 'note'] as const).map(
					(preset) => (
						<button
							type="button"
							className="bd-secondary"
							key={preset}
							onClick={() =>
								onChange(
									preset === 'default'
										? undefined
										: preset === 'highlight'
											? {
													background: 'accent',
													color: 'accent',
													border: 'accent',
													radius: 'md',
													padding: 'md',
												}
											: preset === 'exercise'
												? {
														background: 'muted',
														color: 'ink',
														border: 'subtle',
														radius: 'sm',
														padding: 'md',
													}
												: {
														background: 'none',
														color: 'muted',
														border: 'subtle',
														radius: 'none',
														padding: 'sm',
													},
								)
							}
						>
							{preset === 'default'
								? 'Default'
								: preset === 'highlight'
									? 'Highlight'
									: preset === 'exercise'
										? 'Exercise'
										: 'Note'}
						</button>
					),
				)}
			</fieldset>
			<p className="bd-help">
				Mengikuti tema jika tidak diatur. Perubahan tampil di pratinjau dan
				halaman mahasiswa.
			</p>
			{(Object.keys(APPEARANCE_OPTIONS) as (keyof BuilderAppearance)[])
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
				disabled={!value || !Object.keys(value).length}
				onClick={() => onChange(undefined)}
			>
				Reset tampilan
			</button>
		</div>
	);
}
