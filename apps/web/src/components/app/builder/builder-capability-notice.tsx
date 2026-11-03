import { useCallback, useEffect, useState } from 'react';
import { fetchBuilderCapability, type BuilderCapabilityPayload } from '@/lib/builder-capability';

/**
 * Loads the server-owned enhanced authoring capability once for a screen.
 * Defaults to "enabled" so nothing flickers for the normal (flag unset) case;
 * a disabled deployment replaces it as soon as the server answers.
 */
export function useBuilderCapability(document?: unknown) {
	const [capability, setCapability] = useState<BuilderCapabilityPayload>({
		authoring: true,
		readOnlyRendering: true,
		mode: 'on',
		reason: 'enabled',
		notice: '',
	});
	const [ready, setReady] = useState(false);
	const refresh = useCallback(
		async (next?: unknown) => {
			const result = await fetchBuilderCapability(next === undefined ? document : next);
			setCapability(result);
			setReady(true);
			return result;
		},
		[document],
	);
	useEffect(() => {
		void refresh();
	}, [refresh]);
	return { capability, ready, refresh };
}

/**
 * Plain-language explanation of a disabled enhanced editor. Rendered on the
 * creation screens so a lecturer never reaches a dead end; drafts themselves
 * show an equivalent banner inside the workspace.
 */
export function BuilderCapabilityNotice({ capability }: { capability: BuilderCapabilityPayload }) {
	if (capability.authoring) return null;
	return (
		<div className="bd-capability-notice" role="status" aria-live="polite">
			<strong>Penyunting visual lanjutan dinonaktifkan oleh admin.</strong>
			<p>
				Pembuatan draf baru dari templat lanjutan, tata letak bagian, tampilan, dan
				kontrol responsif belum tersedia untuk akun ini. Draf yang sudah ada tetap
				dapat dibuka, diunduh sebagai salinan pribadi, dipratinjau, dan diterbitkan
				ulang; draf yang memakai tata letak lanjutan ditampilkan hanya-baca agar
				tidak ada data yang hilang. Kegiatan yang sudah terbit, jawaban mahasiswa,
				dan tampilan mahasiswa tidak berubah.
			</p>
		</div>
	);
}
