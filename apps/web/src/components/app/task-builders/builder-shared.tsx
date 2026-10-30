import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';

/** Client-only id for builder rows (the builder modal never renders on the server). */
export function newRowId(prefix: string) {
	return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Move / delete controls shared by every builder row editor. */
export function RowActions({
	index,
	count,
	onMove,
	onRemove,
	labels,
}: {
	index: number;
	count: number;
	onMove: (dir: -1 | 1) => void;
	onRemove: () => void;
	labels: { up: string; down: string; remove: string };
}) {
	return (
		<div className="tkb-row-actions">
			<button type="button" aria-label={labels.up} disabled={index === 0} onClick={() => onMove(-1)}>
				<ArrowUp size={14} />
			</button>
			<button
				type="button"
				aria-label={labels.down}
				disabled={index === count - 1}
				onClick={() => onMove(1)}
			>
				<ArrowDown size={14} />
			</button>
			<button type="button" aria-label={labels.remove} className="danger" onClick={onRemove}>
				<Trash2 size={14} />
			</button>
		</div>
	);
}

/** Small labeled number input used for points / weights / limits. */
export function NumberField({
	label,
	value,
	min = 0,
	max,
	onChange,
	suffix,
	hint,
}: {
	label: string;
	value: number;
	min?: number;
	max?: number;
	onChange: (value: number) => void;
	suffix?: string;
	hint?: string;
}) {
	return (
		<label className="tkb-num">
			<span>{label}</span>
			<span className="tkb-num-input">
				<input
					type="number"
					inputMode="numeric"
					min={min}
					max={max}
					value={value}
					onChange={(e) => {
						const n = Number(e.target.value);
						onChange(Number.isFinite(n) ? Math.max(min, max != null ? Math.min(max, n) : n) : min);
					}}
				/>
				{suffix && <em>{suffix}</em>}
			</span>
			{hint && <small>{hint}</small>}
		</label>
	);
}

/** Small labeled checkbox used for builder toggles. */
export function ToggleField({
	label,
	checked,
	onChange,
	hint,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	hint?: string;
}) {
	return (
		<label className="tkb-toggle">
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
			/>
			<span>
				{label}
				{hint && <small>{hint}</small>}
			</span>
		</label>
	);
}
