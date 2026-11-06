import type { BuilderLayoutBackground, BuilderThemeBackgroundToken } from '@/lib/builder-layout';
import { useState } from 'react';
import { BuilderMediaPicker } from './builder-media';
import type { BuilderAsset } from '@/lib/builder-document';

const tokens: { value: BuilderThemeBackgroundToken; label: string }[] = [
	{ value: 'surface', label: 'Latar tema' },
	{ value: 'surface-2', label: 'Latar lembut' },
	{ value: 'action', label: 'Merah tema' },
];

export function BuilderGroupBackgroundControls({ value, courseId, onChange, responsive = false }: {
	value?: BuilderLayoutBackground;
	courseId: string;
	onChange: (value?: BuilderLayoutBackground) => void;
	responsive?: boolean;
}) {
	const [picker, setPicker] = useState(false);
	const mode = value?.mode === 'transparent' ? 'transparent' : value?.mode ?? '';
	const gradient = value?.mode === 'gradient' ? value : { mode: 'gradient' as const, from: 'action' as const, to: 'surface' as const, angle: 135 };
	return <fieldset className="bd-fields">
		<legend>{responsive ? 'Latar perangkat' : 'Latar bagian'}</legend>
		<label>Jenis latar<select aria-label="Jenis latar bagian" value={mode} onChange={event => {
			if (event.target.value === 'solid') onChange({ mode: 'solid', token: 'surface-2' });
			else if (event.target.value === 'gradient') onChange(gradient);
			else if (event.target.value === 'image') { if (value?.mode === 'image') onChange(value); else setPicker(true); }
			else if (event.target.value === 'transparent') onChange({ mode: 'transparent' });
			else onChange(undefined);
		}}><option value="">{responsive ? 'Ikuti latar sebelumnya' : 'Transparan / default'}</option>{responsive && <option value="transparent">Transparan</option>}<option value="solid">Warna tema</option><option value="gradient">Gradien tema</option><option value="image">Gambar privat</option></select></label>
		{value?.mode === 'image' && <>
			<p className="bd-help">{value.asset.name || value.asset.filename}</p>
			<button type="button" className="bd-secondary" onClick={() => setPicker(true)}>Pilih gambar dari Berkas</button>
			<label>Penyesuaian gambar<select aria-label="Penyesuaian gambar latar" value={value.fit ?? 'cover'} onChange={event => onChange({ ...value, fit: event.target.value as 'cover'|'contain' })}><option value="cover">Penuhi area</option><option value="contain">Tampilkan seluruh gambar</option></select></label>
			<label>Posisi horizontal (%)<input aria-label="Posisi horizontal gambar persen" type="number" min={0} max={100} step={1} value={value.positionX ?? 50} onChange={event => {const n=Number(event.target.value);if(Number.isInteger(n)&&n>=0&&n<=100)onChange({...value,positionX:n});}} /></label>
			<label>Posisi vertikal (%)<input aria-label="Posisi vertikal gambar persen" type="number" min={0} max={100} step={1} value={value.positionY ?? 50} onChange={event => {const n=Number(event.target.value);if(Number.isInteger(n)&&n>=0&&n<=100)onChange({...value,positionY:n});}} /></label>
			<label>Lapisan keterbacaan<select aria-label="Lapisan gambar latar" value={value.overlay ?? ''} onChange={event=>onChange({...value,...(event.target.value?{overlay:event.target.value as BuilderThemeBackgroundToken,opacity:value.opacity??20}:{overlay:undefined,opacity:undefined})})}><option value="">Tanpa lapisan</option>{tokens.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
			{value.overlay && <label>Opasitas lapisan (%)<input aria-label="Opasitas gambar latar persen" type="number" min={0} max={60} value={value.opacity ?? 20} onChange={event=>{const n=Number(event.target.value);if(Number.isInteger(n)&&n>=0&&n<=60)onChange({...value,opacity:n});}} /></label>}
		</>}
		{value?.mode === 'solid' && <label>Warna tema<select aria-label="Warna latar tema" value={value.token} onChange={event => onChange({ ...value, token: event.target.value as BuilderThemeBackgroundToken })}>{tokens.map(token => <option key={token.value} value={token.value}>{token.label}</option>)}</select></label>}
		{value?.mode === 'gradient' && <>
			<label>Warna awal<select aria-label="Warna awal gradien" value={value.from} onChange={event => onChange({ ...value, from: event.target.value as BuilderThemeBackgroundToken })}>{tokens.map(token => <option key={token.value} value={token.value}>{token.label}</option>)}</select></label>
			<label>Warna akhir<select aria-label="Warna akhir gradien" value={value.to} onChange={event => onChange({ ...value, to: event.target.value as BuilderThemeBackgroundToken })}>{tokens.map(token => <option key={token.value} value={token.value}>{token.label}</option>)}</select></label>
			<label>Arah gradien (derajat)<input aria-label="Arah gradien dalam derajat" type="number" min={0} max={360} step={1} value={value.angle} onChange={event => { const angle = Number(event.target.value); if (Number.isInteger(angle) && angle >= 0 && angle <= 360) onChange({ ...value, angle }); }} /></label>
			<label>Lapisan warna tema<select aria-label="Lapisan warna tema" value={value.overlay ?? ''} onChange={event => onChange({ ...value, ...(event.target.value ? { overlay: event.target.value as BuilderThemeBackgroundToken, opacity: value.opacity ?? 20 } : { overlay: undefined, opacity: undefined }) })}><option value="">Tanpa lapisan</option>{tokens.map(token => <option key={token.value} value={token.value}>{token.label}</option>)}</select></label>
			{value.overlay && <label>Opasitas lapisan (%)<input aria-label="Opasitas lapisan persen" type="number" min={0} max={60} step={1} value={value.opacity ?? 20} onChange={event => { const opacity = Number(event.target.value); if (Number.isInteger(opacity) && opacity >= 0 && opacity <= 60) onChange({ ...value, opacity }); }} /></label>}
		</>}
		<button type="button" className="bd-secondary" disabled={!value} onClick={() => onChange(undefined)}>Reset latar</button>
		{picker && <BuilderMediaPicker kind="image" courseId={courseId} onClose={()=>setPicker(false)} onChoose={(assets: BuilderAsset[])=>{const asset=assets[0];if(asset)onChange({mode:'image',asset,fit:value?.mode==='image'?value.fit??'cover':'cover',positionX:value?.mode==='image'?value.positionX??50:50,positionY:value?.mode==='image'?value.positionY??50:50,...(value?.mode==='image'&&value.overlay?{overlay:value.overlay,opacity:value.opacity??20}:{})});setPicker(false);}} />}
		<p className="bd-help">Warna mengikuti tema. Gambar privat hanya tersedia dalam konteks mata kuliah ini.</p>
	</fieldset>;
}
