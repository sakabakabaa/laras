import { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, Monitor } from 'lucide-react';

const STORAGE_KEY = 'ld-sidebar-collapsed';

/**
 * Display preferences. These are per-browser UI preferences (the same key the
 * app shell reads on load), not synced across devices — there is no
 * user-preferences collection, so we keep them in localStorage rather than
 * present a nonfunctional "synced" toggle.
 */
export function PreferencesSection() {
	const [collapsed, setCollapsed] = useState(() =>
		typeof window === 'undefined' ? false : localStorage.getItem(STORAGE_KEY) === '1',
	);

	const apply = (next: boolean) => {
		setCollapsed(next);
		localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
	};

	return (
		<section className="ld-panel ld-settings-panel">
			<div className="ld-card-head">
				<div>
					<span className="ld-eyebrow">Preferensi tampilan</span>
					<h2>Tampilan</h2>
				</div>
			</div>
			<p className="ld-settings-lede">
				Atur tampilan default ruang kerja Anda. Preferensi ini disimpan di peramban ini
				saja dan diterapkan saat Anda membuka halaman berikutnya.
			</p>

			<div className="ld-settings-pref">
				<div className="ld-settings-pref-icon">
					{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
				</div>
				<div className="ld-settings-pref-body">
					<strong>Menu sidebar default</strong>
					<span>
						{collapsed
							? 'Ringkas sidebar menjadi ikon saat memuat halaman.'
							: 'Tampilkan menu sidebar penuh saat memuat halaman.'}
					</span>
				</div>
				<div className="ld-settings-seg" role="group" aria-label="Status default sidebar">
					<button
						type="button"
						className={!collapsed ? 'active' : ''}
						onClick={() => apply(false)}
						aria-pressed={!collapsed}
					>
						<PanelLeftOpen size={15} /> Terbuka
					</button>
					<button
						type="button"
						className={collapsed ? 'active' : ''}
						onClick={() => apply(true)}
						aria-pressed={collapsed}
					>
						<PanelLeftClose size={15} /> Ringkas
					</button>
				</div>
			</div>

			<p className="ld-settings-note">
				<Monitor size={13} /> Preferensi tampilan berlaku per peramban dan tidak disinkronkan
				antar perangkat.
			</p>
		</section>
	);
}
