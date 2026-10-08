import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

export interface AppModalProps {
	open: boolean;
	onClose: () => void;
	/** Accessible dialog title; rendered visually hidden via sr-only. */
	title: string;
	/** Optional extra classes appended to the `form-modal` panel. */
	className?: string;
	children: React.ReactNode;
}

/**
 * Reusable modal built on the same Radix Dialog primitive used by
 * `components/ui/dialog.tsx`. It renders with the existing `modal-backdrop`
 * (overlay) and `form-modal` (panel) CSS classes so nothing changes visually,
 * while adding Escape-to-close, backdrop-click-to-close, focus trapping, and
 * focus restoration to the element that opened the dialog.
 */
export function AppModal({ open, onClose, title, className, children }: AppModalProps) {
	return (
		<DialogPrimitive.Root
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="modal-backdrop">
					<DialogPrimitive.Content className={cn('form-modal', className)}>
						<DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
						{children}
					</DialogPrimitive.Content>
				</DialogPrimitive.Overlay>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
