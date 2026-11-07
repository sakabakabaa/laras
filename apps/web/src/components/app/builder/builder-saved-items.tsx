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
	plain,
	uid,
	type BuilderEnvelope,
	type SavedBuilderTemplate,
} from '@/lib/builder-document';
import { BuilderLayoutView } from './builder-layout-view';
export function BuilderSavedItems({
	id,
	revision,
	activityId,
	groupId,
	dirty,
	detailedBorderRadiusSupported,
	detailedStylesInDocument,
	onRestore,
	onInsert,
	onClose,
}: {
	id: string;
	revision: number;
	activityId?: string;
	groupId?: string;
	dirty: boolean;
	detailedBorderRadiusSupported?: boolean;
	detailedStylesInDocument?: boolean;
	onRestore: (envelope: BuilderEnvelope) => void;
	onInsert: (envelope: SavedBuilderTemplate) => void;
	onClose: () => void;
}) {
	const [items, setItems] = useState<
			{
				id: string;
				title: string;
				kind: string;
				revision: number;
				created: string;
				scope?: 'activity' | 'group';
			}[]
		>([]),
		[title, setTitle] = useState(''),
		[tab, setTab] = useState<'snapshot' | 'template'>(
			activityId ? 'template' : 'snapshot',
		),
		[busy, setBusy] = useState(false),
		[preview, setPreview] = useState<SavedBuilderTemplate | null>(null),
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
				{ id, baseRevision: revision, activityId, groupId, scope: groupId ? 'group' : 'activity', title, commandId: uid(), ...(detailedBorderRadiusSupported ? { detailedBorderRadius: true } : {}) },
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
			const r = await builderRequest<{ envelope: SavedBuilderTemplate }>(
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
	const showPreview = async (item: (typeof items)[number]) => {
		setBusy(true);
		setError('');
		try {
			const r = await builderRequest<{ envelope: SavedBuilderTemplate }>(
				'savedGet',
				{ itemId: item.id },
			);
			setPreview(r.envelope);
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
						Template bagian/kegiatan dan snapshot pribadi. Template menyimpan tata letak dan isi yang dipilih; salinan tetap terpisah dari sumber.
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
							{tab === 'snapshot' ? 'Nama snapshot' : groupId ? 'Nama template bagian' : 'Nama template kegiatan'}
							<input
								maxLength={200}
								value={title}
								onChange={(e) => setTitle(e.target.value)}
							/>
						</label>
						<button
							className="bd-primary"
							disabled={busy || dirty || !title.trim() || Boolean(detailedStylesInDocument && !detailedBorderRadiusSupported)}
							onClick={() => void save()}
						>
							Simpan{' '}
							{tab === 'snapshot' ? 'snapshot' : groupId ? 'bagian sebagai template' : 'kegiatan sebagai template'}
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
						.filter(
							(item) =>
								item.kind === tab &&
								(tab !== 'template' ||
									(groupId
										? item.scope === 'group'
										: item.scope !== 'group')),
						)
						.map((item) => (
							<div key={item.id}>
								<div>
									<strong>{item.title}</strong>
									<small>
										{item.scope === 'group' ? 'Bagian' : 'Kegiatan'} · Revisi{' '}
										{item.revision} ·{' '}
										{new Date(item.created).toLocaleString('id-ID', {
											timeZone: 'Asia/Jakarta',
										})}
									</small>
								</div>
								<button className="bd-secondary" disabled={busy} onClick={() => void showPreview(item)}>Pratinjau</button>
								<button
									className="bd-secondary"
									disabled={busy || dirty}
									onClick={() => void applyItem(item)}
								>
					{tab === 'snapshot' ? 'Pulihkan' : 'Sisipkan salinan'}
								</button>
							</div>
						))}
					{!items.some((item) => item.kind === tab) && (
						<p>
							Belum ada {tab === 'snapshot' ? 'snapshot' : 'template kegiatan'}.
						</p>
					)}
				</div>
				{preview && (
					<section
						aria-label="Pratinjau template"
						className="bd-template-preview"
					>
						<h3>
							Pratinjau · {preview.scope === 'group' ? 'Bagian' : 'Kegiatan'}
						</h3>
						{preview.document.activities[0] && (
							<BuilderLayoutView
								activity={preview.document.activities[0]}
								renderBlock={(block) => (
									<div className="bd-preview-block">
										<strong>{block.type}</strong>
										{block.body && <p>{plain(block.body)}</p>}
									</div>
								)}
							/>
						)}
					</section>
				)}
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
