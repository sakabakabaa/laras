import type { BuilderLayoutBackground, BuilderThemeBackgroundToken } from '@/lib/builder-layout';

const tokens: { value: BuilderThemeBackgroundToken; label: string }[] = [
	{ value: 'surface', label: 'Latar tema' },
	{ value: 'surface-2', label: 'Latar lembut' },
	{ value: 'action', label: 'Merah tema' },
];

export function BuilderGroupBackgroundControls({ value, onChange }: {
	value?: BuilderLayoutBackground;
	onChange: (value?: BuilderLayoutBackground) => void;
}) {
	const mode = value?.mode ?? '';
	const gradient = value?.mode === 'gradient' ? value : { mode: 'gradient' as const, from: 'action' as const, to: 'surface' as const, angle: 135 };
	return <fieldset className="bd-fields">
		<legend>Latar bagian</legend>
		<label>Jenis latar<select aria-label="Jenis latar bagian" value={mode} onChange={event => {
			if (event.target.value === 'solid') onChange({ mode: 'solid', token: 'surface-2' });
			else if (event.target.value === 'gradient') onChange(gradient);
			else onChange(undefined);
		}}><option value="">Transparan / default</option><option value="solid">Warna tema</option><option value="gradient">Gradien tema</option></select></label>
		{value?.mode === 'solid' && <label>Warna tema<select aria-label="Warna latar tema" value={value.token} onChange={event => onChange({ ...value, token: event.target.value as BuilderThemeBackgroundToken })}>{tokens.map(token => <option key={token.value} value={token.value}>{token.label}</option>)}</select></label>}
		{value?.mode === 'gradient' && <>
			<label>Warna awal<select aria-label="Warna awal gradien" value={value.from} onChange={event => onChange({ ...value, from: event.target.value as BuilderThemeBackgroundToken })}>{tokens.map(token => <option key={token.value} value={token.value}>{token.label}</option>)}</select></label>
			<label>Warna akhir<select aria-label="Warna akhir gradien" value={value.to} onChange={event => onChange({ ...value, to: event.target.value as BuilderThemeBackgroundToken })}>{tokens.map(token => <option key={token.value} value={token.value}>{token.label}</option>)}</select></label>
			<label>Arah gradien (derajat)<input aria-label="Arah gradien dalam derajat" type="number" min={0} max={360} step={1} value={value.angle} onChange={event => { const angle = Number(event.target.value); if (Number.isInteger(angle) && angle >= 0 && angle <= 360) onChange({ ...value, angle }); }} /></label>
			<label>Lapisan warna tema<select aria-label="Lapisan warna tema" value={value.overlay ?? ''} onChange={event => onChange({ ...value, ...(event.target.value ? { overlay: event.target.value as BuilderThemeBackgroundToken, opacity: value.opacity ?? 20 } : { overlay: undefined, opacity: undefined }) })}><option value="">Tanpa lapisan</option>{tokens.map(token => <option key={token.value} value={token.value}>{token.label}</option>)}</select></label>
			{value.overlay && <label>Opasitas lapisan (%)<input aria-label="Opasitas lapisan persen" type="number" min={0} max={60} step={1} value={value.opacity ?? 20} onChange={event => { const opacity = Number(event.target.value); if (Number.isInteger(opacity) && opacity >= 0 && opacity <= 60) onChange({ ...value, opacity }); }} /></label>}
		</>}
		<button type="button" className="bd-secondary" disabled={!value} onClick={() => onChange(undefined)}>Reset latar</button>
		<p className="bd-help">Mengikuti tema terang atau gelap. Berlaku untuk semua ukuran layar.</p>
	</fieldset>;
}
