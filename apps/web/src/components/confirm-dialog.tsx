import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle } from 'lucide-react';

export type ConfirmVariant = 'danger' | 'default';

export type ConfirmOptions = {
	/** Short headline. Defaults to a sensible value per variant. */
	title?: string;
	/** Body message — the question or warning shown to the user. */
	message: string;
	/** Confirm button label. */
	confirmLabel?: string;
	/** Cancel button label. */
	cancelLabel?: string;
	/** `danger` renders the red destructive style; `default` uses the brand primary. */
	variant?: ConfirmVariant;
};

type Pending = {
	options: ConfirmOptions;
	resolve: (ok: boolean) => void;
};

type Listener = (pending: Pending | null) => void;

let dispatch: Listener | null = null;

/**
 * Imperative, promise-based confirmation dialog. Replaces the native
 * `window.confirm()` with a themed prompt rendered by `<ConfirmDialogHost />`
 * (mounted once in root.tsx). Resolves `true` when the user confirms and
 * `false` when they cancel or dismiss the dialog.
 *
 *   const ok = await confirmDialog({ message: 'Hapus?', variant: 'danger' });
 *   if (!ok) return;
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const pending: Pending = { options, resolve };
		if (dispatch) {
			dispatch(pending);
		} else {
			// Host not mounted yet (e.g. during SSR) — fail safe (cancel).
			resolve(false);
		}
	});
}

export function ConfirmDialogHost() {
	const [pending, setPending] = useState<Pending | null>(null);
	const [closing, setClosing] = useState(false);

	useEffect(() => {
		dispatch = (next) => {
			setClosing(false);
			setPending(next);
		};
		return () => {
			dispatch = null;
		};
	}, []);

	const close = (ok: boolean) => {
		if (!pending) return;
		setClosing(true);
		const resolve = pending.resolve;
		// Let the exit animation play before resolving + unmounting.
		window.setTimeout(() => {
			resolve(ok);
			setPending(null);
			setClosing(false);
		}, 140);
	};

	useEffect(() => {
		if (!pending) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				close(false);
			} else if (e.key === 'Enter') {
				e.preventDefault();
				close(true);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pending]);

	if (!pending) return null;
	const { options } = pending;
	const variant: ConfirmVariant = options.variant || 'danger';
	const isDanger = variant === 'danger';
	const title = options.title ?? (isDanger ? 'Konfirmasi hapus' : 'Konfirmasi');
	const confirmLabel = options.confirmLabel ?? (isDanger ? 'Hapus' : 'Lanjutkan');
	const cancelLabel = options.cancelLabel ?? 'Batal';
	const Icon = isDanger ? AlertTriangle : HelpCircle;

	const overlay = (
		<div
			className={`cf-backdrop${closing ? ' closing' : ''}`}
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) close(false);
			}}
		>
			<div
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="cf-title"
				aria-describedby="cf-message"
				className={`cf-dialog${closing ? ' closing' : ''}${isDanger ? ' danger' : ''}`}
			>
				<div className="cf-icon">
					<Icon size={22} />
				</div>
				<h2 id="cf-title">{title}</h2>
				<p id="cf-message">{options.message}</p>
				<div className="cf-actions">
					<button
						type="button"
						className="cf-btn cf-btn-cancel"
						onClick={() => close(false)}
						autoFocus
					>
						{cancelLabel}
					</button>
					<button
						type="button"
						className={`cf-btn cf-btn-confirm${isDanger ? ' danger' : ''}`}
						onClick={() => close(true)}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);

	// Guard against SSR (no document) — the host only renders client-side.
	if (typeof document === 'undefined') return null;
	return createPortal(overlay, document.body);
}
