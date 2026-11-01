import { useEffect, useState } from 'react';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import {
	builderRequest,
	duplicateActivity,
	uid,
	type BuilderEnvelope,
} from '@/lib/builder-document';
export function BuilderSavedItems({
	id,
	revision,
	activityId,
	dirty,
	onRestore,
	onInsert,
	onClose,
}: {
	id: string;
	revision: number;
	activityId?: string;
	dirty: boolean;
	onRestore: (envelope: BuilderEnvelope) => void;
	onInsert: (envelope: BuilderEnvelope) => void;
	onClose: () => void;
}) {
	const [items, setItems] = useState<
			{
				id: string;
				title: string;
				kind: string;
				revision: number;
				created: string;
			}[]
		>([]),
		[title, setTitle] = useState(''),
		[tab, setTab] = useState<'snapshot' | 'template'>(
			activityId ? 'template' : 'snapshot',
		),
		[busy, setBusy] = useState(false),
		[error, setError] = useState('');
	const load = () =>
		builderRequest<{ items: typeof items }>('savedList', { id }).then((r) =>
			setItems(r.items),
		);
	useEffect(() => {
		void load().catch((e) => setError(e.message));
	}, [id]);
	const save = async () => {
		setBusy(true);
		setError('');
		try {
			await builderRequest(
				tab === 'snapshot' ? 'saveSnapshot' : 'saveTemplate',
				{ id, baseRevision: revision, activityId, title, commandId: uid() },
			);
			setTitle('');
			await load();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};
	const applyItem = async (item: (typeof items)[number]) => {
		setBusy(true);
		setError('');
		try {
			const r = await builderRequest<{ envelope: BuilderEnvelope }>(
				'savedGet',
				{ itemId: item.id },
			);
			if (item.kind === 'snapshot') {
				if (
					!window.confirm(
						'Pulihkan salinan ini ke draf? Perubahan saat ini dapat dikembalikan dengan Urungkan.',
					)
				)
					return;
				onRestore(r.envelope);
			} else onInsert(r.envelope);
			onClose();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !busy) onClose();
			}}
		>
			<DialogContent className="bd-picker-dialog bd-saved-dialog">
				<DialogHeader>
					<DialogTitle>Riwayat & template</DialogTitle>
					<DialogDescription>
						Salinan privat dengan kunci jawaban. Memulihkan salinan mengubah
						draf; salinan tersimpan tetap utuh.
					</DialogDescription>
				</DialogHeader>
				<div className="bd-inline-actions">
					<button
						className="bd-secondary"
						aria-pressed={tab === 'snapshot'}
						onClick={() => setTab('snapshot')}
					>
						Riwayat
					</button>
					<button
						className="bd-secondary"
						aria-pressed={tab === 'template'}
						onClick={() => setTab('template')}
					>
						Template kegiatan
					</button>
				</div>
				{(tab === 'snapshot' || activityId) && (
					<div className="bd-fields">
						<label>
							{tab === 'snapshot' ? 'Nama snapshot' : 'Nama template'}
							<input
								maxLength={200}
								value={title}
								onChange={(e) => setTitle(e.target.value)}
							/>
						</label>
						<button
							className="bd-primary"
							disabled={busy || dirty || !title.trim()}
							onClick={() => void save()}
						>
							Simpan{' '}
							{tab === 'snapshot' ? 'snapshot' : 'kegiatan sebagai template'}
						</button>
						{dirty && (
							<p className="bd-help">
								Tunggu draf tersimpan sebelum membuat salinan.
							</p>
						)}
					</div>
				)}
				{tab === 'template' && !activityId && (
					<p className="bd-help">
						Gunakan tombol Simpan template pada kegiatan untuk menyimpan
						template baru.
					</p>
				)}
				{error && <p role="alert">{error}</p>}
				<div className="bd-saved-list">
					{items
						.filter((item) => item.kind === tab)
						.map((item) => (
							<div key={item.id}>
								<div>
									<strong>{item.title}</strong>
									<small>
										Revisi {item.revision} ·{' '}
										{new Date(item.created).toLocaleString('id-ID', {
											timeZone: 'Asia/Jakarta',
										})}
									</small>
								</div>
								<button
									className="bd-secondary"
									disabled={busy || dirty}
									onClick={() => void applyItem(item)}
								>
									{tab === 'snapshot' ? 'Pulihkan' : 'Tambahkan'}
								</button>
							</div>
						))}
					{!items.some((item) => item.kind === tab) && (
						<p>
							Belum ada {tab === 'snapshot' ? 'snapshot' : 'template kegiatan'}.
						</p>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
export function insertActivityTemplate(
	target: BuilderEnvelope,
	source: BuilderEnvelope,
) {
	const copy = structuredClone(source),
		original = copy.document.activities[0];
	const id = duplicateActivity(copy, original.id),
		activity = copy.document.activities.find((a) => a.id === id)!;
	for (const block of [original])
		for (const b of block.blocks) {
			// Remove original question identities; the remapped copy remains.
			const ids = [
				...(b.questionIds || []),
				...(b.questionId ? [b.questionId] : []),
				...(b.sections || []).flatMap((section) =>
					section.segments.flatMap((segment) =>
						segment.type === 'gap' ? [segment.questionId] : [],
					),
				),
			];
			for (const qid of ids) {
				delete copy.document.questionsById[qid];
				delete copy.privateKeys.answersByQuestionId[qid];
			}
		}
	activity.title = original.title;
	target.document.activities.push(activity);
	Object.assign(target.document.questionsById, copy.document.questionsById);
	Object.assign(
		target.privateKeys.answersByQuestionId,
		copy.privateKeys.answersByQuestionId,
	);
	return id;
}
