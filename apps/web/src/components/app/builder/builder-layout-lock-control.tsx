import type { BuilderActivity, BuilderEnvelope } from '@/lib/builder-document';
import { findLayoutGroup } from '@/lib/builder-layout';
import { layoutLockState, LAYOUT_LOCK_CAPABILITY_REASON } from '@/lib/builder-layout-lock';

export function BuilderLayoutLockControl({ activity, nodeId, disabled, supported, onChange }: {
	activity: BuilderActivity;
	nodeId: string;
	disabled: boolean;
	supported: boolean;
	onChange: (edit: (next: BuilderEnvelope) => void) => void;
}) {
	const state = layoutLockState(activity, nodeId);
	const ancestor = state.inheritedFrom && activity.layout ? findLayoutGroup(activity.layout, state.inheritedFrom) : undefined;
	return <div className="bd-fields" aria-label="Kunci tata letak editor">
		<button type="button" className="bd-secondary" aria-pressed={state.own} disabled={disabled || !supported}
			title={!supported ? LAYOUT_LOCK_CAPABILITY_REASON : 'Hanya mencegah perubahan struktur di editor, bukan membatasi mahasiswa.'}
			onClick={() => {
				if (disabled || !supported) return;
				onChange(next => {
					const targetActivity = next.document.activities.find(item => item.id === activity.id);
					if (!targetActivity) return;
					const target = targetActivity.blocks.find(item => item.id === nodeId) || (targetActivity.layout && findLayoutGroup(targetActivity.layout, nodeId));
					if (target) target.layoutLocked = target.layoutLocked !== true;
				});
			}}>{state.own ? 'Buka kunci tata letak sendiri' : 'Kunci tata letak sendiri'}</button>
		{state.inheritedFrom && <p role="status">Dilindungi kunci leluhur: {ancestor?.title || state.inheritedFrom}. Pilih leluhur untuk membuka kuncinya; tombol ini hanya mengubah kunci sendiri.</p>}
		<p className="bd-help">Khusus editor: struktur dan posisi terlindungi; isi tetap dapat disunting dan mahasiswa tetap dapat mengakses kegiatan.</p>
		{!supported && <p role="status">{LAYOUT_LOCK_CAPABILITY_REASON}</p>}
	</div>;
}
