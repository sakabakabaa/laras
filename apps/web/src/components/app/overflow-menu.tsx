import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

/**
 * Three-dot overflow for crowded page-header actions. Children are menu items
 * (buttons or links). The menu closes on outside click, Escape, or item click.
 */
export function OverflowMenu({
	label = 'Tindakan lain',
	children,
}: {
	label?: string;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDoc = (e: MouseEvent) => {
			if (!ref.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false);
		};
		document.addEventListener('mousedown', onDoc);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDoc);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	return (
		<div className="ov-menu" ref={ref}>
			<button
				type="button"
				className="ov-menu-btn"
				aria-expanded={open}
				aria-haspopup="menu"
				aria-label={label}
				title={label}
				onClick={() => setOpen((v) => !v)}
			>
				<MoreHorizontal size={18} />
			</button>
			{open ? (
				<div className="ov-menu-pop" role="menu" onClick={() => setOpen(false)}>
					{children}
				</div>
			) : null}
		</div>
	);
}
