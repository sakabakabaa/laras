import { useEffect } from 'react';
import { Link } from 'react-router';
import { Maximize2, Sparkles, X } from 'lucide-react';
import { AssistantPanel } from '@/components/app/assistant-panel';
import type { AssistantSeed } from '@/lib/assistant-quick-send';

export function AgentDock({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<button
			type="button"
			className={`ld-agent-btn${open ? ' active' : ''}`}
			aria-expanded={open}
			aria-controls="ld-agent-panel"
			onClick={() => onOpenChange(!open)}
		>
			<Sparkles size={15} strokeWidth={2} />
			<span>Asisten</span>
		</button>
	);
}

export function AgentPane({
	open,
	name,
	onClose,
	seed,
	onSeedConsumed,
}: {
	open: boolean;
	name: string;
	onClose: () => void;
	seed?: AssistantSeed | null;
	onSeedConsumed?: () => void;
}) {
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [open, onClose]);

	return (
		<aside
			id="ld-agent-panel"
			className={`ld-agent-panel${open ? ' open' : ''}`}
			aria-hidden={!open}
			inert={!open}
			aria-label="Asisten dosen"
		>
			<header className="ld-agent-head">
				<div className="ld-agent-title">
					<Sparkles size={16} strokeWidth={1.75} />
					<strong>Asisten</strong>
				</div>
				<div className="ld-agent-head-actions">
					<Link to="/app/asisten" className="ld-agent-icon" aria-label="Buka halaman asisten" title="Buka halaman penuh">
						<Maximize2 size={16} />
					</Link>
					<button type="button" className="ld-agent-icon" aria-label="Tutup asisten" onClick={onClose}>
						<X size={18} />
					</button>
				</div>
			</header>
			<div className="ld-agent-body">
				{open && <AssistantPanel variant="drawer" name={name} seed={seed} onSeedConsumed={onSeedConsumed} />}
			</div>
		</aside>
	);
}
