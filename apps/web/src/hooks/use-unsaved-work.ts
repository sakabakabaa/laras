import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router';
import { confirmDialog } from '@/components/confirm-dialog';

/** Protect browser exits and client-side route changes without saving or publishing. */
export function useUnsavedWork(dirty: boolean) {
	const blocker = useBlocker(dirty);
	const prompting = useRef(false);
	useEffect(() => {
		if (blocker.state !== 'blocked' || prompting.current) return;
		prompting.current = true;
		void confirmDialog({
			title: 'Perubahan belum disimpan',
			message: 'Simpan draf agar perubahan Anda tetap tersedia. Keluar tanpa menyimpan?',
			confirmLabel: 'Keluar tanpa menyimpan', cancelLabel: 'Tetap di sini',
		}).then((leave) => {
			prompting.current = false;
			if (leave) blocker.proceed(); else blocker.reset();
		});
	}, [blocker]);
	useEffect(() => {
		if (!dirty) return;
		const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	}, [dirty]);
}
