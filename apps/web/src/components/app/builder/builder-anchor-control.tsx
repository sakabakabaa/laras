import { useState } from 'react';
import { BUILDER_ANCHOR_PATTERN } from '@/lib/builder-document';

export function BuilderAnchorControl({ value, used, disabled, onApply, onClear }: { value?: string; used: string[]; disabled: boolean; onApply: (value: string) => void; onClear: () => void }) {
	const [draft, setDraft] = useState(value || '');
	const [editing, setEditing] = useState(false);
	const valid = BUILDER_ANCHOR_PATTERN.test(draft) && (!used.includes(draft) || draft === value);
	return <section aria-label="Tautan bagian" className="bd-fields">
		<strong>Tautan bagian (opsional)</strong>
		{editing ? <>
			<label>Nama bagian <input aria-label="Nama tautan bagian" maxLength={40} autoCapitalize="none" value={draft} onChange={event => setDraft(event.target.value)} /></label>
			<p className="bd-help">Gunakan huruf kecil, angka, dan tanda hubung; mulai dengan huruf. Nama harus unik dalam dokumen.</p>
			<div className="bd-inline-actions">
				<button type="button" disabled={disabled || !valid} onClick={() => { onApply(draft); setEditing(false); }}>Terapkan</button>
				<button type="button" className="bd-secondary" onClick={() => { setDraft(value || ''); setEditing(false); }}>Batal</button>
			</div>
		</> : <div className="bd-inline-actions">
			<code>{value ? `#${value}` : 'Belum diatur'}</code>
			<button type="button" disabled={disabled} onClick={() => { setDraft(value || ''); setEditing(true); }}>Ubah</button>
			{value && <button type="button" className="bd-secondary" disabled={disabled} onClick={onClear}>Hapus tautan</button>}
		</div>}
	</section>;
}
