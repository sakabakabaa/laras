import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { NAVIGATOR_TITLE_MAX, finishNavigatorRename } from '@/lib/builder-navigator';

export function BuilderNavigatorTitle({ title, columns, selected, disabled, onSelect, onMoveKey, onRename }: {
	title: string;
	columns: number;
	selected: boolean;
	disabled: boolean;
	onSelect: () => void;
	onMoveKey: (event: React.KeyboardEvent) => void;
	onRename: (value: string) => void;
}) {
	const [editing, setEditing] = useState(false);
	const [value, setValue] = useState(title);
	const [invalid, setInvalid] = useState(false);
	const row = useRef<HTMLButtonElement>(null);
	const finished = useRef(false);
	const restore = useRef(false);
	useEffect(() => {
		if (!editing && restore.current) { restore.current = false; row.current?.focus({ preventScroll: true }); }
	}, [editing]);
	const start = () => {
		if (disabled) return;
		finished.current = false;
		setValue(title);
		setInvalid(false);
		setEditing(true);
	};
	const cancel = (restoreFocus: boolean) => {
		finished.current = true;
		restore.current = restoreFocus;
		setEditing(false);
	};
	return <>
		<button ref={row} type="button" className="bd-structure-select" hidden={editing && !disabled} aria-current={selected ? 'true' : undefined} onClick={onSelect} onKeyDown={event => {
			if (event.key === 'F2') { event.preventDefault(); start(); }
			else onMoveKey(event);
		}}><strong>{title}</strong><small>{columns} kolom</small></button>
		{editing && !disabled && <label className="bd-fields">Nama bagian atau kontainer
			<input autoFocus value={value} maxLength={NAVIGATOR_TITLE_MAX} aria-invalid={invalid || undefined} onChange={event => { setValue(event.target.value); setInvalid(false); }} onBlur={() => cancel(false)} onKeyDown={event => {
				if (event.nativeEvent.isComposing) return;
				if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(true); }
				if (event.key === 'Enter') {
					event.preventDefault(); event.stopPropagation();
					if (finished.current) return;
					const result = finishNavigatorRename(value, 'commit', disabled);
					if (result.kind === 'invalid') { setInvalid(true); return; }
					if (result.kind === 'cancel') { cancel(true); return; }
					finished.current = true;
					onRename(result.title);
					cancel(true);
				}
			}} />
			{invalid && <span role="alert">Nama wajib diisi, maksimal {NAVIGATOR_TITLE_MAX} karakter.</span>}
		</label>}
		<button type="button" className="bd-icon" disabled={disabled} aria-label={`Ubah nama ${title}`} title="Ubah nama (F2); Enter menyimpan, Escape atau keluar membatalkan" onClick={start}><Pencil size={12} /></button>
	</>;
}
