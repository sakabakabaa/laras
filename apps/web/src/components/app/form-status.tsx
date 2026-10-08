import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { AlertTriangle, Check, ChevronDown, X } from 'lucide-react';

export type StatusDetail = {
	id: string;
	text: string;
	to?: string;
	linkLabel?: string;
};

type Tone = 'bad' | 'warn' | 'ok';

const TONE_META: Record<Tone, { label: string; Icon: typeof Check }> = {
	bad: { label: 'Perlu diperbaiki', Icon: X },
	warn: { label: 'Perhatian', Icon: AlertTriangle },
	ok: { label: 'Siap', Icon: Check },
};

/**
 * Compact status row: icon plus count. Full wording stays available on hover
 * and keyboard focus, including any action link needed to finish the form.
 *
 * Pass `expanded` to render the full wording as a visible list instead of the
 * compact count chip — use it for blocking step requirements so each unmet
 * condition is explained in text near the relevant field, not hidden behind a
 * hover-only "× 1" indicator.
 */
export function StatusMarks({
	bad = [],
	warn = [],
	ok = [],
	expanded = false,
}: {
	bad?: StatusDetail[];
	warn?: StatusDetail[];
	ok?: StatusDetail[];
	expanded?: boolean;
}) {
	const groups = (
		[
			['bad', bad],
			['warn', warn],
			['ok', ok],
		] as const
	).filter(([, items]) => items.length > 0);

	if (groups.length === 0) return null;

	if (expanded) {
		return (
			<div className="asg-status-list">
				{groups.map(([tone, items]) => (
					<StatusListRow key={tone} tone={tone} items={items} />
				))}
			</div>
		);
	}

	return (
		<div className="asg-status-row">
			{groups.map(([tone, items]) => (
				<StatusChip key={tone} tone={tone} items={items} />
			))}
		</div>
	);
}

function StatusListRow({ tone, items }: { tone: Tone; items: StatusDetail[] }) {
	const { Icon } = TONE_META[tone];
	return (
		<ul className={`asg-status-list-group asg-status-list-${tone}`}>
			{items.map((item) => (
				<li key={item.id}>
					<Icon size={14} />
					<span>
						{item.text}
						{item.to ? (
							<>
								{' '}
								<Link to={item.to}>{item.linkLabel || 'Buka'}</Link>
							</>
						) : null}
					</span>
				</li>
			))}
		</ul>
	);
}

function StatusChip({ tone, items }: { tone: Tone; items: StatusDetail[] }) {
	const { label, Icon } = TONE_META[tone];
	const tipId = useId();
	return (
		<div className={`asg-status asg-status-${tone}`}>
			<button
				type="button"
				className="asg-status-btn"
				aria-describedby={tipId}
				aria-label={`${label}: ${items.length}. Arahkan atau fokus untuk rincian.`}
			>
				<Icon size={14} />
				<span>{items.length}</span>
			</button>
			<div className="asg-status-tip" id={tipId} role="tooltip">
				<strong>{label}</strong>
				<ol>
					{items.map((item) => (
						<li key={item.id}>
							{item.text}
							{item.to ? (
								<>
									{' '}
									<Link to={item.to}>{item.linkLabel || 'Buka'}</Link>
								</>
							) : null}
						</li>
					))}
				</ol>
			</div>
		</div>
	);
}

export type MappingOption = { value: string; label: string };

/**
 * Course-mapping picker. Native selects inside the scrolled task dialog get
 * clipped, so the option list is portaled to the document.
 */
export function MappingSelect({
	label,
	required,
	value,
	onChange,
	disabled,
	placeholder,
	options,
}: {
	label: string;
	required?: boolean;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	placeholder: string;
	options: MappingOption[];
}) {
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const btnRef = useRef<HTMLButtonElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const [box, setBox] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(
		null,
	);
	const listId = useId();
	const selected = options.find((option) => option.value === value);

	const place = () => {
		const el = btnRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const below = window.innerHeight - rect.bottom - 12;
		const above = rect.top - 12;
		const openUp = below < 180 && above > below;
		const maxHeight = Math.max(120, Math.min(280, openUp ? above : below));
		const margin = 8;
		const width = Math.min(Math.max(rect.width, 280), window.innerWidth - margin * 2);
		const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
		setBox({
			top: openUp ? Math.max(8, rect.top - maxHeight - 6) : rect.bottom + 6,
			left,
			width,
			maxHeight,
		});
	};

	useEffect(() => {
		if (!open) return;
		place();
		const onScroll = () => place();
		window.addEventListener('resize', onScroll);
		window.addEventListener('scroll', onScroll, true);
		return () => {
			window.removeEventListener('resize', onScroll);
			window.removeEventListener('scroll', onScroll, true);
		};
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const onPointer = (event: MouseEvent) => {
			const target = event.target as Node;
			if (btnRef.current?.contains(target) || listRef.current?.contains(target)) return;
			setOpen(false);
		};
		document.addEventListener('mousedown', onPointer);
		return () => document.removeEventListener('mousedown', onPointer);
	}, [open]);

	const choose = (next: string) => {
		onChange(next);
		setOpen(false);
		btnRef.current?.focus();
	};

	const onKey = (event: React.KeyboardEvent) => {
		if (disabled) return;
		if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			if (!open) {
				const index = Math.max(0, options.findIndex((option) => option.value === value));
				setActive(index);
				setOpen(true);
				return;
			}
			if (event.key === 'Enter' || event.key === ' ') {
				const option = options[active];
				if (option) choose(option.value);
			}
		}
		if (!open) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			setOpen(false);
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			setActive((index) => Math.min(options.length - 1, index + 1));
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			setActive((index) => Math.max(0, index - 1));
		}
	};

	return (
		<div className="asg-field">
			<span className="asg-field-label">
				{label} {required ? <span>*</span> : null}
			</span>
			<button
				ref={btnRef}
				type="button"
				className="asg-field-btn"
				disabled={disabled}
				title={selected?.label || placeholder}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={listId}
				onClick={() => {
					if (disabled) return;
					setActive(Math.max(0, options.findIndex((option) => option.value === value)));
					setOpen((prev) => !prev);
				}}
				onKeyDown={onKey}
			>
				<span>{selected?.label || placeholder}</span>
				<ChevronDown size={16} />
			</button>
			{open && box && typeof document !== 'undefined'
				? createPortal(
						<ul
							ref={listRef}
							id={listId}
							role="listbox"
							className="asg-field-list"
							style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
						>
							{options.length === 0 ? (
								<li className="asg-field-empty">{placeholder}</li>
							) : (
								options.map((option, index) => (
									<li key={option.value} role="presentation">
										<button
											type="button"
											role="option"
											aria-selected={option.value === value}
											className={index === active || option.value === value ? 'active' : ''}
											onMouseEnter={() => setActive(index)}
											onClick={() => choose(option.value)}
										>
											{option.label}
										</button>
									</li>
								))
							)}
						</ul>,
						document.body,
					)
				: null}
		</div>
	);
}
