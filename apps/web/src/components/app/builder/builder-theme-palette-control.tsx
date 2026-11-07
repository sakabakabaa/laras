import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { builderThemePairContrast, normalizeBuilderDocumentTheme, type BuilderDocumentTheme, type BuilderThemePalette } from '@/lib/builder-theme';

const DEFAULT_PALETTE: BuilderThemePalette = {
	light: { base: { foreground: '#14181F', background: '#FFFFFF' }, accent: { foreground: '#FFFFFF', background: '#B3261E' } },
	dark: { base: { foreground: '#EEF2F7', background: '#171B22' }, accent: { foreground: '#FFFFFF', background: '#A53830' } },
};
const copy = (value?: BuilderDocumentTheme): BuilderThemePalette => structuredClone(value?.palette || DEFAULT_PALETTE);

export function BuilderThemePaletteControl({ value, supported, disabled, onChange }: {
	value?: BuilderDocumentTheme;
	supported: boolean;
	disabled: boolean;
	onChange: (next?: BuilderDocumentTheme) => void;
}) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<BuilderThemePalette>(() => copy(value));
	const [invalid, setInvalid] = useState(false);
	useEffect(() => { setDraft(copy(value)); setInvalid(false); }, [value]);
	const setColor = (mode: 'light' | 'dark', token: 'base' | 'accent', field: 'foreground' | 'background', color: string) => {
		setDraft(current => ({ ...current, [mode]: { ...current[mode], [token]: { ...current[mode][token], [field]: color.toUpperCase() } } }));
	};
	const apply = () => {
		try { onChange({ palette: normalizeBuilderDocumentTheme({ palette: draft }).palette }); setOpen(false); setInvalid(false); }
		catch { setInvalid(true); }
	};
	const reset = () => { onChange(undefined); setDraft(copy()); setOpen(false); };
	return <>
		<button type="button" className="bd-secondary" aria-label="Palet warna dokumen" disabled={disabled || !supported} onClick={() => { setDraft(copy(value)); setInvalid(false); setOpen(true); }}>Warna tema dokumen</button>
		{!supported && <p className="bd-help" role="status">Backend belum mendukung palet tema dokumen; pengeditan dinonaktifkan agar warna tidak hilang.</p>}
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="bd-picker-dialog bd-theme-palette-dialog">
				<DialogHeader><DialogTitle>Palet warna dokumen</DialogTitle><DialogDescription>Warna berlaku hanya di dokumen ini dan mengikuti mode terang atau gelap. Setiap pasangan memberi panduan kontras untuk warna teks dan latarnya; ini bukan penilaian kontras atas gambar atau gradien.</DialogDescription></DialogHeader>
				{(['light', 'dark'] as const).map(mode => <fieldset key={mode} className="bd-theme-palette-mode"><legend>{mode === 'light' ? 'Mode terang' : 'Mode gelap'}</legend>{(['base', 'accent'] as const).map(token => {
					const pair = draft[mode][token];
					const ratio = builderThemePairContrast(pair);
					return <fieldset key={token} className="bd-theme-palette-pair"><legend>{token === 'base' ? 'Latar dan teks utama' : 'Aksen dan teks di atas aksen'}</legend>
						<label>Warna teks <input aria-label={`${mode === 'light' ? 'Terang' : 'Gelap'} ${token === 'base' ? 'utama' : 'aksen'} warna teks`} value={pair.foreground} maxLength={7} autoComplete="off" onChange={event => setColor(mode, token, 'foreground', event.target.value)} /></label>
						<label>Warna latar <input aria-label={`${mode === 'light' ? 'Terang' : 'Gelap'} ${token === 'base' ? 'utama' : 'aksen'} warna latar`} value={pair.background} maxLength={7} autoComplete="off" onChange={event => setColor(mode, token, 'background', event.target.value)} /></label>
						<p className={ratio !== null && ratio < 4.5 ? 'bd-theme-contrast is-low' : 'bd-theme-contrast'} role="status">{ratio === null ? 'Gunakan dua kode #RRGGBB.' : `Rasio pasangan ${ratio}:1${ratio < 4.5 ? ' · pertimbangkan kontras lebih tinggi' : ''}`}</p>
					</fieldset>;
				})}</fieldset>)}
				{invalid && <p role="alert">Setiap warna harus berupa kode #RRGGBB.</p>}
				<div className="bd-theme-palette-actions"><button type="button" className="bd-primary" disabled={disabled || !supported} onClick={apply}>Terapkan palet</button><button type="button" className="bd-secondary" onClick={() => setOpen(false)}>Batal</button><button type="button" className="bd-secondary" disabled={disabled || !supported || !value} onClick={reset}>Kembalikan palet standar</button></div>
			</DialogContent>
		</Dialog>
	</>;
}
