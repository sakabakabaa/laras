import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export type MultiSelectOption = {
	id: string;
	label: string;
	hint?: string;
};

/**
 * Course-scoped searchable multi-select dropdown. Renders a trigger button, a
 * popover with a search box and checkbox list, and removable chips for the
 * selected values. Pure presentational — the parent owns `selected` state.
 */
export function MultiSelect({
	label,
	options,
	selected,
	onChange,
	placeholder = 'Pilih…',
	emptyText = 'Tidak ada pilihan.',
	disabled = false,
}: {
	label: string;
	options: MultiSelectOption[];
	selected: string[];
	onChange: (ids: string[]) => void;
	placeholder?: string;
	emptyText?: string;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDown = (event: MouseEvent) => {
			if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false);
		};
		document.addEventListener('mousedown', onDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	const toggle = (id: string) => {
		onChange(
			selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id],
		);
	};

	const q = query.trim().toLowerCase();
	const filtered = q
		? options.filter(
				(option) =>
					option.label.toLowerCase().includes(q) ||
					(option.hint?.toLowerCase().includes(q) ?? false),
			)
		: options;

	const selectedOptions = selected
		.map((id) => options.find((option) => option.id === id))
		.filter((option): option is MultiSelectOption => Boolean(option));

	return (
		<div className="ms-field" ref={ref}>
			<span className="ms-label">{label}</span>
			<button
				type="button"
				className="ms-trigger"
				onClick={() => setOpen((value) => !value)}
				disabled={disabled}
				aria-expanded={open}
				aria-haspopup="listbox"
			>
				<span>
					{selected.length > 0
						? `${selected.length} dipilih`
						: placeholder}
				</span>
				<ChevronDown size={16} className={open ? 'ms-chev-open' : ''} />
			</button>
			{open && (
				<div className="ms-popover" role="listbox">
					<label className="ms-search">
						<Search size={15} strokeWidth={1.75} aria-hidden />
						<input
						 autoFocus
							type="text"
							placeholder="Cari…"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
						{query && (
							<button
								type="button"
								className="ms-search-clear"
								aria-label="Bersihkan pencarian"
								onClick={() => setQuery('')}
							>
								<X size={14} />
							</button>
						)}
					</label>
					<div className="ms-list">
						{filtered.length === 0 ? (
							<div className="ms-empty">{emptyText}</div>
						) : (
							filtered.map((option) => {
								const checked = selected.includes(option.id);
								return (
									<button
										type="button"
										key={option.id}
										className={`ms-option${checked ? ' checked' : ''}`}
										onClick={() => toggle(option.id)}
										role="option"
										aria-selected={checked}
									>
										<span className="ms-check">{checked && <Check size={14} />}</span>
										<span className="ms-option-text">
											{option.label}
											{option.hint && <small>{option.hint}</small>}
										</span>
									</button>
								);
							})
						)}
					</div>
				</div>
			)}
			{selectedOptions.length > 0 && (
				<div className="ms-chips">
					{selectedOptions.map((option) => (
						<span className="ms-chip" key={option.id}>
							{option.label}
							<button
								type="button"
								className="ms-chip-remove"
								aria-label={`Hapus ${option.label}`}
								onClick={() => toggle(option.id)}
								disabled={disabled}
							>
								<X size={12} />
							</button>
						</span>
					))}
				</div>
			)}
		</div>
	);
}
