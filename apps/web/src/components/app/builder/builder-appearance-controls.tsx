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
	resetResponsiveAppearance,
} from '@/lib/builder-appearance';
import { useEffect, useState } from 'react';

export function BuilderAppearanceControls({
	value,
	onChange,
	exclude = [],
	presetPreserve = [],
	backgroundNotice = false,
	customColorsSupported = true,
	detailedBorderRadiusSupported = false,
	responsiveBorderRadiusSupported = false,
}: {
	value?: BuilderAppearance;
	onChange: (value: BuilderAppearance | undefined) => void;
	exclude?: (keyof BuilderAppearance)[];
	presetPreserve?: (keyof BuilderAppearance)[];
	backgroundNotice?: boolean;
	customColorsSupported?: boolean;
	detailedBorderRadiusSupported?: boolean;
	responsiveBorderRadiusSupported?: boolean;
}) {
	const [detailDevice, setDetailDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
	const [draft, setDraft] = useState({ lightForeground: '', lightBackground: '', darkForeground: '', darkBackground: '' });
	const [invalid, setInvalid] = useState(false);
	const [borderDraft, setBorderDraft] = useState<string[]>(['', '', '', '']);
	const [cornerDraft, setCornerDraft] = useState<string[]>(['', '', '', '']);
	const [detailInvalid, setDetailInvalid] = useState('');
	useEffect(() => setDraft({ lightForeground: value?.customColors?.light.foreground ?? '', lightBackground: value?.customColors?.light.background ?? '', darkForeground: value?.customColors?.dark.foreground ?? '', darkBackground: value?.customColors?.dark.background ?? '' }), [value?.customColors]);
	const responsiveBorder = detailDevice === 'desktop' ? undefined : value?.responsive?.[detailDevice]?.borderDetail;
	const responsiveCorners = detailDevice === 'desktop' ? undefined : value?.responsive?.[detailDevice]?.corners;
	const activeBorder = detailDevice === 'desktop' ? value?.borderDetail : responsiveBorder ?? (detailDevice === 'mobile' ? value?.responsive?.tablet?.borderDetail : undefined) ?? value?.borderDetail;
	const activeCorners = detailDevice === 'desktop' ? value?.corners : responsiveCorners ?? (detailDevice === 'mobile' ? value?.responsive?.tablet?.corners : undefined) ?? value?.corners;
	const hasDeviceOverride = detailDevice !== 'desktop' && Boolean(value?.responsive?.[detailDevice]?.borderDetail || value?.responsive?.[detailDevice]?.corners);
	const detailDraftChanged = borderDraft.some((item, index) => item !== (activeBorder?.widths?.[['top', 'right', 'bottom', 'left'][index] as 'top' | 'right' | 'bottom' | 'left']?.toString() ?? '')) || cornerDraft.some((item, index) => item !== (activeCorners?.[['topLeft', 'topRight', 'bottomRight', 'bottomLeft'][index] as 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft']?.toString() ?? ''));
	const cancelDetailDrafts = () => {
		setBorderDraft((['top', 'right', 'bottom', 'left'] as const).map(side => activeBorder?.widths?.[side]?.toString() ?? ''));
		setCornerDraft((['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const).map(corner => activeCorners?.[corner]?.toString() ?? ''));
		setDetailInvalid('');
	};
	const updateDetail = (field: 'borderDetail' | 'corners', setting: BuilderAppearance['borderDetail'] | BuilderAppearance['corners'] | undefined) => {
		const next: BuilderAppearance = { ...value };
		if (detailDevice === 'desktop') {
			if (setting) Object.assign(next, { [field]: setting });
			else delete next[field];
		} else {
			const responsive = { ...value?.responsive };
			const override: Record<string, unknown> = { ...responsive[detailDevice] };
			if (setting) override[field] = setting;
			else delete override[field];
			if (Object.keys(override).length) responsive[detailDevice] = override as NonNullable<BuilderAppearance['responsive']>['tablet'];
			else delete responsive[detailDevice];
			if (Object.keys(responsive).length) next.responsive = responsive;
			else delete next.responsive;
		}
		onChange(Object.keys(next).length ? next : undefined);
	};
	useEffect(() => {
		setBorderDraft((['top', 'right', 'bottom', 'left'] as const).map(side => activeBorder?.widths?.[side]?.toString() ?? ''));
		setCornerDraft((['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const).map(corner => activeCorners?.[corner]?.toString() ?? ''));
	}, [detailDevice, activeBorder, activeCorners]);
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
			<details className="bd-detail-style-panel">
				<summary>Garis tepi dan sudut terperinci</summary>
				{!detailedBorderRadiusSupported && <p role="status" className="bd-help">Backend belum mengiklankan dukungan garis tepi dan sudut terperinci; kontrol dinonaktifkan agar data tetap aman.</p>}
				<fieldset disabled={!detailedBorderRadiusSupported || (detailDevice !== 'desktop' && !responsiveBorderRadiusSupported)} className="bd-fields">
				<label>Perangkat tampilan garis dan sudut
					<select aria-label="Perangkat tampilan garis dan sudut" value={detailDevice} onChange={event => { setDetailDevice(event.target.value as typeof detailDevice); setDetailInvalid(''); }}>
						<option value="desktop">Desktop (dasar)</option><option value="tablet" disabled={!responsiveBorderRadiusSupported}>Tablet</option><option value="mobile" disabled={!responsiveBorderRadiusSupported}>Ponsel</option>
					</select>
				</label>
				{detailDevice !== 'desktop' && <p className="bd-help">{hasDeviceOverride ? `Override ${detailDevice === 'tablet' ? 'tablet' : 'ponsel'} tersimpan. Reset perangkat ini akan kembali mewarisi ${detailDevice === 'mobile' ? 'tablet lalu desktop' : 'desktop'}.` : `Belum ada override ${detailDevice === 'tablet' ? 'tablet' : 'ponsel'}; perangkat ini mewarisi ${detailDevice === 'mobile' && value?.responsive?.tablet ? 'tablet lalu desktop' : 'desktop'}.`}</p>}
				<label>Gaya garis
					<select value={activeBorder?.style ?? ''} onChange={event => updateDetail('borderDetail', event.target.value ? { ...activeBorder, style: event.target.value as NonNullable<BuilderAppearance['borderDetail']>['style'] } : undefined)}>
						<option value="">Ikuti praset / tema</option><option value="none">Tanpa garis</option><option value="solid">Penuh</option><option value="dashed">Putus-putus</option><option value="dotted">Titik-titik</option>
					</select>
				</label>
				<label>Warna garis
					<select value={activeBorder?.color ?? ''} onChange={event => { const detail = { ...activeBorder, style: activeBorder?.style ?? 'solid' as const }; if (event.target.value) detail.color = event.target.value as NonNullable<BuilderAppearance['borderDetail']>['color']; else delete detail.color; updateDetail('borderDetail', detail); }}>
						<option value="">Ikuti tema</option><option value="border">Garis tema</option><option value="action">Aksi</option><option value="ink">Teks utama</option><option value="surface-2">Permukaan sekunder</option>
					</select>
				</label>
				<label><input type="checkbox" checked={activeBorder?.linked ?? true} onChange={event => { const widths = activeBorder?.widths; const linkedWidths = event.target.checked ? { top: widths?.top ?? 1, right: widths?.top ?? 1, bottom: widths?.top ?? 1, left: widths?.top ?? 1 } : widths; updateDetail('borderDetail', { ...activeBorder, style: activeBorder?.style ?? 'solid', linked: event.target.checked, ...(linkedWidths ? { widths: linkedWidths } : {}) }); }} /> Lebar semua sisi sama</label>
				<div className="bd-detail-number-grid">{(['Atas', 'Kanan', 'Bawah', 'Kiri'] as const).map((label, index) => <label key={label}>{label} (px)<input type="number" min="0" max="8" step="0.5" inputMode="decimal" value={borderDraft[index]} onChange={event => setBorderDraft(current => current.map((item, i) => i === index ? event.target.value : item))} /></label>)}</div>
				<button type="button" className="bd-secondary" onClick={() => { const values = borderDraft.map(item => item.trim() === '' ? undefined : Number(item)); if (values.some(item => item === undefined || !Number.isFinite(item) || item < 0 || item > 8)) { setDetailInvalid('Isi lebar tiap sisi dengan angka 0–8 px.'); return; } setDetailInvalid(''); const linked = activeBorder?.linked ?? true; const widths = linked ? { top: values[0]!, right: values[0]!, bottom: values[0]!, left: values[0]! } : Object.fromEntries((['top', 'right', 'bottom', 'left'] as const).map((side, i) => [side, values[i]!])) as NonNullable<BuilderAppearance['borderDetail']>['widths']; updateDetail('borderDetail', { ...activeBorder, style: activeBorder?.style ?? 'solid', linked, widths }); }}>Terapkan lebar garis</button>
				<label><input type="checkbox" checked={activeCorners?.linked ?? true} onChange={event => { const linkedCorners = event.target.checked ? { topLeft: activeCorners?.topLeft ?? 0, topRight: activeCorners?.topLeft ?? 0, bottomRight: activeCorners?.topLeft ?? 0, bottomLeft: activeCorners?.topLeft ?? 0 } : {}; updateDetail('corners', { ...activeCorners, linked: event.target.checked, ...linkedCorners }); }} /> Radius semua sudut sama</label>
				<div className="bd-detail-number-grid">{(['Kiri atas', 'Kanan atas', 'Kanan bawah', 'Kiri bawah'] as const).map((label, index) => <label key={label}>{label} (px)<input type="number" min="0" max="48" step="1" inputMode="numeric" value={cornerDraft[index]} onChange={event => setCornerDraft(current => current.map((item, i) => i === index ? event.target.value : item))} /></label>)}</div>
				<button type="button" className="bd-secondary" onClick={() => { const values = cornerDraft.map(item => item.trim() === '' ? undefined : Number(item)); if (values.some(item => item === undefined || !Number.isFinite(item) || item < 0 || item > 48)) { setDetailInvalid('Isi radius tiap sudut dengan angka 0–48 px.'); return; } setDetailInvalid(''); const linked = activeCorners?.linked ?? true; const corners = linked ? { topLeft: values[0]!, topRight: values[0]!, bottomRight: values[0]!, bottomLeft: values[0]! } : Object.fromEntries((['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const).map((corner, i) => [corner, values[i]!])) as NonNullable<BuilderAppearance['corners']>; updateDetail('corners', { ...activeCorners, linked, ...corners }); }}>Terapkan radius</button>
				<button type="button" className="bd-secondary" onClick={cancelDetailDrafts} disabled={!detailDraftChanged}>Batalkan angka belum diterapkan</button>
				{detailDevice !== 'desktop' && <button type="button" className="bd-secondary" disabled={!hasDeviceOverride} onClick={() => { onChange(resetResponsiveAppearance(value, detailDevice)); setDetailInvalid(''); }}>Reset override {detailDevice === 'tablet' ? 'tablet' : 'ponsel'}</button>}
				{detailInvalid && <p role="alert" className="bd-help">{detailInvalid}</p>}
				</fieldset>
			</details>
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
				disabled={!value || (!value.customColors && !value.borderDetail && !value.corners && !APPEARANCE_FIELDS.some((key) => !presetPreserve.includes(key) && value[key] !== undefined))}
					onClick={() => onChange(resetBuilderAppearance(value, presetPreserve))}
			>
				Reset gaya
			</button>
		</div>
	);
}
