import { useId } from 'react';

export function BuilderStyleActions({ disabled, canPaste, status, onCopy, onPaste }: {
	disabled: boolean;
	canPaste: boolean;
	status: string;
	onCopy: () => void;
	onPaste: () => void;
}) {
	const helpId = useId();
	return <div className="bd-fields">
		<div className="bd-inline-actions" role="group" aria-label="Salin dan tempel gaya">
			<button type="button" className="bd-secondary" disabled={disabled} aria-describedby={helpId} onClick={onCopy}>Salin gaya</button>
			<button type="button" className="bd-secondary" disabled={disabled || !canPaste} aria-describedby={helpId} onClick={onPaste}>Tempel gaya</button>
		</div>
		<p id={helpId} className="bd-help">Hanya gaya elemen, bagian, atau kontainer sejenis. Isi dan gambar latar tidak disalin; gambar latar target tetap. Gaya yang tidak diatur pada sumber kembali ke bawaan. Salinan hanya tersedia selama editor ini terbuka.</p>
		<p role="status" aria-live="polite" className="bd-help">{status}</p>
	</div>;
}
